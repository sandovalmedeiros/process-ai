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
 * ./banner.ts, ./file-ops.ts, ./manifest.ts, ./state.ts, ./resource.ts).
 */
import { promises as fs, realpathSync } from 'node:fs';
import path from 'node:path';
import type { IdeSetup, InstalledFile } from '../ide-setup.ts';
import { theme } from './banner.ts';
import type { BannerTheme } from './banner.ts';
import { scaffoldConfig, mergeConfigUser } from '../install.ts';
import type { InstallPrefs } from '../install.ts';
import { backupFile, updateGitignore } from './file-ops.ts';
import { ENGINES } from './engines.ts';
import { MANIFEST_REL_PATH, writeManifest } from './manifest.ts';
import type { InstallType, Manifest } from './manifest.ts';
import { installMethodPacks, uninstallMethodPacks } from './pack-copy.ts';
import { installKb, uninstallKb } from './kb-copy.ts';
import { ensureIngestDeps } from './python-deps.ts';
import type { PythonDepResult } from './python-deps.ts';
import { ensureRenderDeps } from './playwright-deps.ts';
import type { RenderDepResult } from './playwright-deps.ts';
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
  /**
   * Preferências do install interativo (nome do projeto, como te chamar,
   * idiomas, estratégia git). Persistidas em config.user no TOPO do install
   * (antes do early-return already-current) — re-run interativo numa
   * instalação corrente também grava. Ausentes (headless) → no-op.
   */
  prefs?: InstallPrefs;
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
  /** Resultado do provisionamento de deps Python do ingest (install/update only). */
  ingest?: PythonDepResult;
  /** Resultado da detecção de Playwright/render (install/update only, não-bloqueante). */
  render?: RenderDepResult;
  /** Preferências persistidas neste install (interativo) — alimenta o Resumo. */
  prefs?: InstallPrefs;
  /** true quando `engines` do prefs foi ignorado por override manual em config.user. */
  enginesOverridden?: boolean;
  /** Versão do framework instalada/corrente (Resumo). */
  version?: string;
  /** Method-pack ativo estampado (Resumo). */
  activePack?: string;
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
    // Preferências do install interativo — ANTES do early-return already-current
    // (re-run interativo numa instalação corrente também persiste) e antes de
    // qualquer outra escrita. Headless sem prefs → no-op total (não cria
    // .gitignore, não toca config.user).
    let enginesOverridden = false;
    if (req.prefs) {
      const merged = await mergeConfigUser(targetDir, req.prefs);
      enginesOverridden = req.prefs.engines !== undefined && !merged.written.includes('engines');
      if (req.prefs.gitStrategy === 'gitignore') await updateGitignore(targetDir);
    }
    // Provisiona deps Python do ingest ANTES do early-return already-current — todo
    // caminho de install (incl. re-run idempotente) deve deixar o ingest pronto.
    const ingest = ensureIngestDeps();
    // Detecta o runtime de renderização (Playwright) — opt-in do usuário, aviso não-bloqueante.
    const render = ensureRenderDeps();
    const version = getFrameworkVersion();
    const state = await detectInstallationState(targetDir, version);

    if (state.kind === 'installed-current') {
      return {
        outcome: 'already-current',
        ide: state.manifest.install.ide,
        ingest,
        render,
        prefs: req.prefs,
        version,
        activePack: req.activePack ?? 'bpmn-sipoc',
        targetDir,
      };
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

    const ideResult = await this.ideSetup.setupIde(targetDir, {
      activePack: req.activePack,
      processAiVersion: version,
    });
    const packFiles = await installMethodPacks(targetDir);
    const kbFiles = await installKb(targetDir);
    await scaffoldConfig(targetDir, { activePack: req.activePack, processAiVersion: version });

    const manifest: Manifest = {
      install: {
        framework_version: version,
        installed_at: new Date().toISOString(),
        install_type: installType,
        ide: ideResult.ide,
        active_pack: req.activePack ?? 'bpmn-sipoc',
      },
      files: [...ideResult.files, ...packFiles, ...kbFiles],
    };
    await writeManifest(targetDir, manifest);

    const outcome: InstallOutcome['outcome'] =
      installType === 'fresh' ? 'installed' : installType === 'update' ? 'updated' : 'repaired';
    return {
      outcome,
      installType,
      ide: ideResult.ide,
      files: [...ideResult.files, ...packFiles, ...kbFiles],
      backed,
      ingest,
      render,
      prefs: req.prefs,
      enginesOverridden,
      version,
      activePack: req.activePack ?? 'bpmn-sipoc',
      targetDir,
    };
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

    const ideRemoved = (await this.ideSetup.uninstallIde(targetDir)).removed;
    const packRemoved = await uninstallMethodPacks(targetDir);
    const kbRemoved = await uninstallKb(targetDir);
    const removed = [...ideRemoved, ...packRemoved, ...kbRemoved];
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
 * Formata o resumo humano do outcome (stdout): ✓ + caminho + skills + slash
 * + workspace trust + status do provisionamento de deps Python do ingest.
 * Tema ciano do installer (banner.ts — paridade Reversa): ✓ e labels INTEIROS
 * coloridos em TTY; fora de TTY o tema é identidade e as strings ficam
 * byte-idênticas às canônicas (contrato dos regexes de cli.test.ts/smoke).
 */
export function formatOutcome(o: InstallOutcome): string {
  const t = theme();
  switch (o.outcome) {
    case 'installed':
    case 'updated':
    case 'repaired': {
      // Contagens por fonte (corrige o mislabel antigo "26 skill(s)" —
      // files[] agrega skills + pack + base de conhecimento).
      const norm = (p: string): string => p.replaceAll('\\', '/');
      const skillCount = o.files?.filter((f) => norm(f.path).startsWith('.claude/skills/')).length ?? 0;
      const packCount = o.files?.filter((f) => norm(f.path).startsWith('method-packs/')).length ?? 0;
      const kbCount = o.files?.filter((f) => norm(f.path).startsWith('base-conhecimento/')).length ?? 0;
      const lines = [
        `${t.cyan('✓')} process-ai ${labelFor(o.outcome)} no projeto-alvo: ${o.targetDir}`,
        `  ${t.cyan('Skills:')} ${skillCount}  ·  ${t.cyan('IDE:')} ${o.ide ?? '?'}  ·  ${t.cyan('Slash:')} /process-ai`,
        `  ${t.cyan('Method-pack:')} ${o.activePack ?? 'bpmn-sipoc'} (${packCount} arquivos)  ·  ${t.cyan('Base de conhecimento:')} ${kbCount} arquivos`,
        `  ${t.cyan('Config:')} .process-ai/config (+ config.user preservado)  ·  ${t.cyan('Manifest:')} .process-ai/install-manifest.toml`,
      ];
      const il = ingestLine(o.ingest, t);
      if (il) lines.push(il);
      const rl = renderLine(o.render, t);
      if (rl) lines.push(rl);
      if (o.backed && o.backed.length > 0) {
        lines.push(`  ${t.cyan('Backups de arquivos modificados:')} ${o.backed.length} (.bak)`);
      }
      // Resumo interativo (paridade Reversa "Summary:") — só quando houve prefs.
      if (o.prefs) {
        lines.push(
          ``,
          `  ${t.bold('Resumo:')}`,
          `  ${t.cyan('Projeto:')}    ${o.prefs.projectName ?? '—'}`,
          `  ${t.cyan('Engines:')}    ${enginesSummaryLine(o)}`,
          `  ${t.cyan('Versão:')}     ${o.version ?? '—'}`,
          `  ${t.cyan('Git:')}        ${o.prefs.gitStrategy === 'gitignore' ? '.gitignore (uso pessoal)' : 'commitados com o projeto'}`,
        );
      }
      const teams = skillTeamCounts(o.files ?? []);
      if (teams.length > 0) {
        lines.push(``, `  ${t.bold('Skills por time:')}`);
        for (const tm of teams) {
          lines.push(`  ${t.cyan(`${tm.team}:`.padEnd(16))}${tm.count} — ${tm.members}`);
        }
      }
      lines.push(
        ``,
        `  ${t.cyan('→ Abra o Claude Code e digite /process-ai no chat para começar')}`,
        `  ${t.cyan('→ Para digitalizar documentos do processo a qualquer momento: /process-ai-laura')}`,
        `  ${t.cyan('→ Vários processos no mesmo projeto: process-ai process add "<nome>"')}`,
        ``,
        `⚠  Workspace trust: abra o projeto-alvo no Claude Code e aceite o diálogo`,
        `   de workspace trust para que a skill de projeto seja carregada.`,
        ``,
      );
      return lines.join('\n');
    }
    case 'already-current': {
      const base = `${t.cyan('✓')} process-ai já está instalado e atualizado em ${o.targetDir} (IDE: ${o.ide ?? '?'}). Nada a fazer.`;
      const il = ingestLine(o.ingest, t);
      const rl = renderLine(o.render, t);
      const extra = [il, rl].filter(Boolean).join('\n');
      return extra ? `${base}\n${extra}\n` : `${base}\n`;
    }
    case 'uninstalled':
      return `${t.cyan('✓')} process-ai desinstalado de ${o.targetDir} (${o.removed?.length ?? 0} skill(s) removidas). Config e estado de sessão preservados (use --purge p/ remover tudo).\n`;
    case 'not-installed':
      return `ℹ process-ai não está instalado em ${o.targetDir}. Nada a desinstalar.\n`;
  }
}

function labelFor(outcome: InstallOutcome['outcome']): string {
  return outcome === 'installed' ? 'instalado' : outcome === 'updated' ? 'atualizado' : 'reparado';
}

/** Nome de exibição da engine (id → nome do catálogo; desconhecido → id cru). */
function engineDisplayName(ide: string | undefined): string {
  if (ide === undefined || ide === '') return '?';
  return ENGINES.find((e) => e.id === ide)?.name ?? ide;
}

/**
 * Linha de engines do Resumo: instaláveis marcadas "(instalada)" e as
 * "(em breve)" do checkbox como "(registrada)" — registradas ficam no
 * config.user e instalam quando o adapter existir (nada promete o que não há).
 */
function enginesSummaryLine(o: InstallOutcome): string {
  const sel = o.prefs?.engines ?? [];
  const isSupported = (id: string): boolean =>
    ENGINES.some((e) => e.id === id && e.supported);
  // "instalada" = a engine que o setupIde de fato instalou (v1: Claude Code,
  // sempre) — a seleção só registra as demais, não desinstala a corrente.
  const installed = [engineDisplayName(o.ide)];
  const registered = sel.filter((id) => !isSupported(id)).map((id) => engineDisplayName(id));
  const parts = [`${installed.join(', ')} (instalada)`];
  if (o.enginesOverridden) {
    // config.user já definia `engines` manualmente — a seleção não foi persistida.
    parts.push('engines manual em config.user (mantida)');
  } else if (registered.length > 0) {
    parts.push(`${registered.join(', ')} (registrada${registered.length > 1 ? 's' : ''})`);
  }
  return parts.join(' + ');
}

/**
 * Times das skills (tabela canônica de `skills/process-ai/SKILL.md:201-214`):
 * condução + 1 especialista por estágio + time da Monique (site de docs).
 * Ordem = ordem do pipeline.
 */
const SKILL_TEAMS: ReadonlyArray<{
  team: string;
  members: string;
  dirs: readonly string[];
}> = [
  { team: 'Condução', members: 'Déa (/process-ai)', dirs: ['process-ai'] },
  { team: 'Ingestão', members: 'Laura (opcional, a qualquer momento)', dirs: ['process-ai-laura'] },
  { team: 'Descoberta', members: 'Bento', dirs: ['process-ai-bento'] },
  { team: 'Mapeamento', members: 'Miguel', dirs: ['process-ai-miguel'] },
  { team: 'Modelagem', members: 'Júlia', dirs: ['process-ai-julia'] },
  { team: 'Visualização', members: 'Guilherme', dirs: ['process-ai-guilherme'] },
  { team: 'Padronização', members: 'Zanoni', dirs: ['process-ai-zanoni'] },
  { team: 'Redação', members: 'Tiago', dirs: ['process-ai-tiago'] },
  {
    team: 'Site de docs',
    members: 'Monique + João, Mônica, Sarah e Victor',
    dirs: [
      'process-ai-monique',
      'process-ai-monique-joao',
      'process-ai-monique-monica',
      'process-ai-monique-sarah',
      'process-ai-monique-victor',
    ],
  },
];

/** Contagem por time a partir dos files[] instalados (paths '/'-separados). */
function skillTeamCounts(files: readonly InstalledFile[]): Array<{ team: string; members: string; count: number }> {
  const dirCount = new Map<string, number>();
  for (const f of files) {
    const parts = f.path.replaceAll('\\', '/').split('/');
    if (parts[0] === '.claude' && parts[1] === 'skills' && parts[3] === 'SKILL.md') {
      const dir = parts[2] ?? '';
      dirCount.set(dir, (dirCount.get(dir) ?? 0) + 1);
    }
  }
  return SKILL_TEAMS.map((tm) => ({
    team: tm.team,
    members: tm.members,
    count: tm.dirs.reduce((n, d) => n + (dirCount.get(d) ?? 0), 0),
  })).filter((r) => r.count > 0);
}

/** Linha de resumo do provisionamento de ingest (✓ instalado / ⚠ ausência ou falha). */
function ingestLine(ingest: PythonDepResult | undefined, t: BannerTheme): string | null {
  if (!ingest) return null;
  const marker = ingest.installed ? '✓' : '⚠';
  return `  ${t.cyan('Ingest:')} ${marker} ${ingest.message}`;
}

/** Linha de resumo do runtime de render (✓ Playwright+navegador / ⚠ indisponível — não-bloqueante). */
function renderLine(render: RenderDepResult | undefined, t: BannerTheme): string | null {
  if (!render) return null;
  const marker = render.installed ? '✓' : '⚠';
  return `  ${t.cyan('Render:')} ${marker} ${render.message}`;
}
