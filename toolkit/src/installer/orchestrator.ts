/**
 * toolkit/src/installer/orchestrator.ts — máquina de estados de install/update/uninstall.
 *
 * O coração da paridade com a rotina do BMAD (`installer.js`): detecta o estado
 * → dispatch → fresh/update/repair → (re)escreve manifest → summary. Espelha o
 * `detectInstallationState`→`performFreshInstall`/update/repair do BMAD, mas:
 *  - depende só da PORTA `IdeSetup` (hexagonal, AD-3) — nunca de `ClaudeCodeIdeSetup`;
 *  - é zero-dep (`node:*`), ESM, TS;
 *  - manifest em TOML + SHA-256 64-char (ver manifest.ts);
 *  - skills (não command files) no Claude Code.
 *
 * É o ÚNICO que chama `ideSetup.setupIde`/`uninstallIde`, `scaffoldConfig` e
 * `writeManifest`/`readManifest` — mantendo a orquestração de install num só lugar.
 *
 * AD-3 / import-boundary: só `node:*` + relativos (../ide-setup.ts, ../install.ts,
 * ./file-ops.ts, ./manifest.ts, ./state.ts, ./resource.ts).
 */
import { promises as fs, realpathSync } from 'node:fs';
import path from 'node:path';
import type { IdeSetup, InstalledFile } from '../ide-setup.ts';
import { scaffoldConfig } from '../install.ts';
import { backupFile } from './file-ops.ts';
import { MANIFEST_REL_PATH, writeManifest } from './manifest.ts';
import type { InstallType, Manifest } from './manifest.ts';
import { detectInstallationState } from './state.ts';
import type { InstallState } from './state.ts';
import { getFrameworkVersion, getPackageRoot } from './resource.ts';

/** Pedido de install/update. */
export interface InstallRequest {
  targetDir: string;
  activePack?: string;
  /** Reservado (v1 instala todas as skills; hook p/ seleção futura). */
  full?: boolean;
  interactive?: boolean;
}

/** Pedido de uninstall. */
export interface UninstallRequest {
  targetDir: string;
  /** Remove TODO o `.process-ai/` (inclui estado de sessão runtime). */
  purge?: boolean;
}

/** Resultado canônico de install/update/uninstall/status (formatado pelo caller). */
export interface InstallOutcome {
  outcome: 'installed' | 'updated' | 'repaired' | 'already-current' | 'not-installed' | 'uninstalled';
  installType?: InstallType;
  ide?: string;
  files?: InstalledFile[];
  /** Backups criados durante repair/update de arquivos modificados. */
  backed?: string[];
  /** Diretórios removidos no uninstall. */
  removed?: string[];
  targetDir: string;
}

/** Compara dois caminhos pelo destino real (resolve symlink/junction + case). */
function sameRealpath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

export class Installer {
  private readonly ideSetup: IdeSetup;

  constructor(ideSetup: IdeSetup) {
    this.ideSetup = ideSetup;
  }

  /**
   * Instala (ou reinstala) no target. Dispatch por estado:
   *  - clean → fresh; installed-modified → repair (backup dos editados); installed-stale → update;
   *  - installed-current → no-op (already-current).
   */
  async install(req: InstallRequest): Promise<InstallOutcome> {
    const targetDir = path.resolve(req.targetDir);
    assertNotSelfInstall(targetDir);
    const version = getFrameworkVersion();
    const state = await detectInstallationState(targetDir, version);

    if (state.kind === 'installed-current') {
      return { outcome: 'already-current', ide: state.manifest.install.ide, targetDir };
    }

    const installType: InstallType =
      state.kind === 'clean' ? 'fresh' : state.kind === 'installed-stale' ? 'update' : 'repair';

    // backup dos arquivos modificados localmente antes da recópia wholesale (mirror BMad).
    const backed: string[] = [];
    if (state.kind === 'installed-modified') {
      for (const rel of state.report.modified) {
        backed.push(await backupFile(path.join(targetDir, rel)));
      }
    }

    const result = await this.ideSetup.setupIde(targetDir, {
      activePack: req.activePack,
      processAiVersion: version,
    });
    await scaffoldConfig(targetDir, { activePack: req.activePack, processAiVersion: version });

    const manifest: Manifest = {
      install: {
        framework_version: version,
        installed_at: new Date().toISOString(),
        install_type: installType,
        ide: result.ide,
        active_pack: req.activePack ?? 'bpmn-sipoc',
      },
      files: result.files,
    };
    await writeManifest(targetDir, manifest);

    const outcome: InstallOutcome['outcome'] =
      installType === 'fresh' ? 'installed' : installType === 'update' ? 'updated' : 'repaired';
    return { outcome, installType, ide: result.ide, files: result.files, backed, targetDir };
  }

  /** Atualiza uma instalação existente. Erro se não instalado; no-op se já atual. */
  async update(req: InstallRequest): Promise<InstallOutcome> {
    const targetDir = path.resolve(req.targetDir);
    assertNotSelfInstall(targetDir);
    const state = await detectInstallationState(targetDir, getFrameworkVersion());
    if (state.kind === 'clean') {
      throw new Error(
        'process-ai não está instalado neste diretório. Rode `process-ai install` primeiro.',
      );
    }
    if (state.kind === 'installed-current') {
      return { outcome: 'already-current', ide: state.manifest.install.ide, targetDir };
    }
    // modified ou stale → reinstall (install trata backup + manifest).
    return this.install(req);
  }

  /**
   * Remove os artefatos da IDE (skills `process-ai*`) + o manifest. Preserva
   * `.process-ai/config`, `config.user` e o estado de sessão runtime
   * (checkpoint/wal/manifests). `--purge` remove TODO o `.process-ai/`.
   */
  async uninstall(req: UninstallRequest): Promise<InstallOutcome> {
    const targetDir = path.resolve(req.targetDir);
    assertNotSelfInstall(targetDir);
    const state = await detectInstallationState(targetDir, getFrameworkVersion());
    const wasInstalled = state.kind !== 'clean';

    const removed = (await this.ideSetup.uninstallIde(targetDir)).removed;
    await fs.rm(path.join(targetDir, MANIFEST_REL_PATH), { force: true });
    if (req.purge) {
      await fs.rm(path.join(targetDir, '.process-ai'), { recursive: true, force: true });
    }

    return {
      outcome: wasInstalled || req.purge ? 'uninstalled' : 'not-installed',
      removed,
      targetDir,
    };
  }

  /** Relatório de estado (install --status). Leitura pura (não escreve). */
  async status(targetDir: string): Promise<{ state: InstallState }> {
    return { state: await detectInstallationState(path.resolve(targetDir), getFrameworkVersion()) };
  }
}

/** Guard de self-install: recusa instalar no próprio repositório do framework. */
function assertNotSelfInstall(targetDir: string): void {
  const pkgRoot = getPackageRoot();
  if (pkgRoot && sameRealpath(targetDir, pkgRoot)) {
    throw new Error(
      `Recusado: --target aponta para o próprio repositório do framework (${pkgRoot}). Aponte --target para outro diretório de projeto.`,
    );
  }
}

/**
 * Formata o resumo humano do outcome (stdout). Espelha o estilo de
 * `formatInstallSummary` (install.ts): ✓ + caminho + skills + slash + workspace trust.
 */
export function formatOutcome(o: InstallOutcome): string {
  switch (o.outcome) {
    case 'installed':
    case 'updated':
    case 'repaired': {
      const skills = o.files && o.files.length > 0 ? `${o.files.length} skill(s)` : '(nenhuma)';
      const lines = [
        `✓ process-ai ${labelFor(o.outcome)} no projeto-alvo: ${o.targetDir}`,
        `  Skills: ${skills}  ·  IDE: ${o.ide ?? '?'}  ·  Slash: /process-ai`,
        `  Config: .process-ai/config (+ config.user preservado)  ·  Manifest: .process-ai/install-manifest.toml`,
      ];
      if (o.backed && o.backed.length > 0) {
        lines.push(`  Backups de arquivos modificados: ${o.backed.length} (.bak)`);
      }
      lines.push(
        ``,
        `⚠  Workspace trust: abra o projeto-alvo no Claude Code e aceite o diálogo`,
        `   de workspace trust para que a skill de projeto seja carregada.`,
        ``,
      );
      return lines.join('\n');
    }
    case 'already-current':
      return `✓ process-ai já está instalado e atualizado em ${o.targetDir} (IDE: ${o.ide ?? '?'}). Nada a fazer.\n`;
    case 'uninstalled':
      return `✓ process-ai desinstalado de ${o.targetDir} (${o.removed?.length ?? 0} skill(s) removidas). Config e estado de sessão preservados (use --purge p/ remover tudo).\n`;
    case 'not-installed':
      return `ℹ process-ai não está instalado em ${o.targetDir}. Nada a desinstalar.\n`;
  }
}

function labelFor(outcome: InstallOutcome['outcome']): string {
  return outcome === 'installed' ? 'instalado' : outcome === 'updated' ? 'atualizado' : 'reparado';
}
