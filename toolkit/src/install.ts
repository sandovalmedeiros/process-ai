/**
 * toolkit/src/install.ts — scaffold de config + orquestração de install (AD-7).
 *
 * Espelho do padrão de install do BMAD (`_bmad/config.toml` installer-managed +
 * `_bmad/custom/` nunca tocado), adaptado ao process-ai:
 *  - `.process-ai/config` — installer-managed, **regenerado a cada install**
 *    (cabeçalho read-only; edições diretas são sobrescritas no próximo install).
 *    Formato compatível com `readConfig` do pack-loader (TOML mínimo:
 *    `active_pack` + `pack_version`). Fecha o loop da story 3.2 ("config é
 *    criado pelo bootstrap ou pelo primeiro run").
 *  - `.process-ai/config.user` — overrides do usuário, **nunca tocado** pelo
 *    installer (criado como stub só se não existir; preservado em re-run).
 *
 * Duas exportações:
 *  1. `scaffoldConfig(targetDir, opts)` — escreve o config + config.user (puro,
 *     só `node:*`). Engine-agnostic.
 *  2. `runInstall(adapter, targetDir, opts)` — orquestra `adapter.installSkills`
 *     + `adapter.registerSlashCommands` (porta EngineAdapter) + `scaffoldConfig`.
 *     Reusado pelos 3 entry-points: bare `process-ai`, `process-ai install`,
 *     `process-ai-bootstrap` e o `postinstall.js` (que spawn o CLI compilado).
 *
 * AD-3: depende SÓ da porta `EngineAdapter` (nunca de adapter concreto) + `node:*`.
 * O teste de fronteira `tests/import-boundary.test.ts` materializa essa regra.
 *
 * Idempotente: re-run é seguro (config regenerado determinístico; config.user
 * preservado; installSkills já é idempotente por design).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EngineAdapter } from './engine-adapter.ts';

// ---- scaffoldConfig ----

/** Opções do scaffold de config. */
export interface ScaffoldOptions {
  /** active_pack a estampar (default "bpmn-sipoc" — pack padrão v1, FR-18). */
  activePack?: string;
  /** pack_version (default "1.0.0"). */
  packVersion?: string;
  /** Versão do framework (default "0.0.0"; o boundary do CLI/README passa a real). */
  processAiVersion?: string;
}

/** Resultado do scaffold. */
export interface ScaffoldResult {
  configPath: string;
  configUserPath: string;
  /** true se `.process-ai/config.user` já existia (e foi preservado). */
  configUserExisted: boolean;
}

/**
 * Cabeçalho read-only do config installer-managed (espelho de
 * `_bmad/config.toml:1-11`). "Treat as read-only" — edições diretas são
 * sobrescritas no próximo install; use `config.user` para overrides.
 */
const CONFIG_HEADER = `# ─────────────────────────────────────────────────────────────────
# Installer-managed. Regenerado a cada install — treat as read-only.
#
# Edições diretas neste arquivo são sobrescritas no próximo install.
# Para fixar/sobrescrever um valor, use .process-ai/config.user
# (esse arquivo nunca é tocado pelo installer).
# ─────────────────────────────────────────────────────────────────`;

/** Stub do config.user (criado só se não existir; espelho do `custom/` do BMAD). */
const CONFIG_USER_STUB = `# Overrides do usuário (NUNCA sobrescrito pelo installer).
# Valores aqui sobrepõem .process-ai/config. Edite livremente.
`;

/**
 * Escreve `.process-ai/config` (installer-managed, regenerado) e
 * `.process-ai/config.user` (stub só se inexistente — preservado em re-run).
 *
 * Escrita atômica (temp + rename): crash mid-write não deixa config corrompido.
 * Compatível com `readConfig` (pack-loader.ts) — produz `active_pack` +
 * `pack_version` no formato que o loader parseia.
 */
export async function scaffoldConfig(
  targetDir: string,
  opts: ScaffoldOptions = {},
): Promise<ScaffoldResult> {
  const dotDir = path.join(targetDir, '.process-ai');
  await fs.mkdir(dotDir, { recursive: true });

  const configPath = path.join(dotDir, 'config');
  const configUserPath = path.join(dotDir, 'config.user');

  const activePack = opts.activePack ?? 'bpmn-sipoc';
  const packVersion = opts.packVersion ?? '1.0.0';
  const processAiVersion = opts.processAiVersion ?? '0.0.0';

  // config: regenerado a cada install (installer-managed).
  const body =
    `${CONFIG_HEADER}\n\n` +
    `# Versão do framework\n` +
    `process_ai_version = "${processAiVersion}"\n\n` +
    `# Method-pack ativo (o loader lê active_pack + pack_version)\n` +
    `active_pack = "${activePack}"\n` +
    `pack_version = "${packVersion}"\n`;
  await atomicWrite(configPath, body);

  // config.user: só cria se não existir (preservado em re-run).
  let configUserExisted = false;
  try {
    await fs.lstat(configUserPath);
    configUserExisted = true;
  } catch {
    await atomicWrite(configUserPath, CONFIG_USER_STUB);
  }

  return { configPath, configUserPath, configUserExisted };
}

/** Escrita atômica: temp + rename no mesmo diretório (rename atômico em POSIX). */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmp = `${filePath}.tmp-${process.pid}-${installTempCounter++}`;
  await fs.writeFile(tmp, content, 'utf8');
  try {
    await fs.rename(tmp, filePath);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}
let installTempCounter = 0;

// ---- runInstall (orquestrador) ----

/** Opções do install (estende scaffold). */
export interface InstallOptions extends ScaffoldOptions {}

/** Resultado do install (consumido pelo CLI/postinstall para imprimir resumo). */
export interface InstallResult {
  targetDir: string;
  /** Skills instaladas (nomes), lidas pós-install de `<target>/.claude/skills/`. */
  skills: string[];
  configPath: string;
  configUserPath: string;
  configUserExisted: boolean;
}

/**
 * Orquestra o install completo no projeto-alvo:
 *  1. `adapter.installSkills(targetDir)` — copia skills (hardened, byte-a-byte).
 *  2. `adapter.registerSlashCommands(targetDir)` — no-op no Claude Code v1.
 *  3. `scaffoldConfig(targetDir)` — `.process-ai/config` + `.process-ai/config.user`.
 *
 * Não imprime nada (pure-ish) — o caller formata/imprime via `formatInstallSummary`.
 * Idempotente. Não conhece a engine (usa só a porta `EngineAdapter`).
 */
export async function runInstall(
  adapter: EngineAdapter,
  targetDir: string,
  opts: InstallOptions = {},
): Promise<InstallResult> {
  // Skills + slash-commands via adapter (porta).
  await adapter.installSkills(targetDir);
  await adapter.registerSlashCommands(targetDir);

  // Config installer-managed.
  const scaffold = await scaffoldConfig(targetDir, opts);

  // Skills instaladas (pós-install) — lê o target para relatar o que caiu.
  const skills = await listInstalledSkills(targetDir);

  return {
    targetDir,
    skills,
    configPath: scaffold.configPath,
    configUserPath: scaffold.configUserPath,
    configUserExisted: scaffold.configUserExisted,
  };
}

/** Lista skills `process-ai*` instaladas em `<target>/.claude/skills/`. */
async function listInstalledSkills(targetDir: string): Promise<string[]> {
  const skillsDir = path.join(targetDir, '.claude', 'skills');
  let entries: string[];
  try {
    entries = await fs.readdir(skillsDir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    if (!/^process-ai(-.+)?$/.test(entry)) continue;
    try {
      const st = await fs.lstat(path.join(skillsDir, entry));
      if (st.isDirectory()) found.push(entry);
    } catch {
      // entrada sumiu entre readdir e lstat — ignora.
    }
  }
  return found.sort();
}

/**
 * Formata o resumo humano do install (stdout). Espelha o estilo do
 * `bootstrap.ts` original (✓ + caminho da skill + slash + aviso de workspace trust).
 */
export function formatInstallSummary(result: InstallResult): string {
  const skillsLine =
    result.skills.length > 0
      ? result.skills.join(', ')
      : '(nenhuma — verifique o pacote)';
  const configLine = result.configUserExisted
    ? `${result.configPath} (config.user preservado)`
    : `${result.configPath} (+ config.user)`;
  return [
    `✓ process-ai instalado no projeto-alvo: ${result.targetDir}`,
    `  Skills instaladas: ${skillsLine}`,
    `  Config: ${configLine}`,
    `  Slash command disponível: /process-ai`,
    ``,
    `⚠  Workspace trust: abra o projeto-alvo no Claude Code e aceite o diálogo`,
    `   de workspace trust para que a skill de projeto seja carregada.`,
    ``,
  ].join('\n');
}
