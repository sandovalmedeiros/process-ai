/**
 * toolkit/src/install.ts — scaffold de config (AD-7) + resolução de package root.
 *
 * Espelho do padrão de install do BMAD (`_bmad/config.toml` installer-managed +
 * `_bmad/custom/` nunca tocado), adaptado ao process-ai:
 *  - `.process-ai/config` — installer-managed, **regenerado a cada install**
 *    (cabeçalho read-only; edições diretas são sobrescritas no próximo install).
 *    Formato compatível com `readConfig` do pack-loader (TOML mínimo:
 *    `active_pack` + `pack_version`). Fecha o loop da story 3.2 ("config é
 *    criado pelo install ou pelo primeiro run").
 *  - `.process-ai/config.user` — overrides do usuário, **nunca tocado** pelo
 *    installer (criado como stub só se não existir; preservado em re-run).
 *
 * Exportações:
 *  - `findPackageRoot(startDir)` — caminha até o package root do framework
 *    (usado por `resource.ts`, `pack-copy.ts` e aqui para ler a versão).
 *  - `scaffoldConfig(targetDir, opts)` — escreve o config + config.user (puro,
 *    só `node:*`). Engine-agnostic.
 *
 * O orquestrador de install completo (skills + packs + config + manifest + deps
 * Python) vive em `toolkit/src/installer/orchestrator.ts` (`Installer.install`) —
 * o ÚNICO caminho canônico de install (`npx process-ai install`). Este módulo
 * fica com a peça reutilizável (config) + a resolução de package root.
 *
 * AD-3: depende SÓ de `node:*` + relativo (./installer/file-ops.ts). O teste de
 * fronteira `tests/import-boundary.test.ts` materializa essa regra.
 *
 * Idempotente: re-run é seguro (config regenerado determinístico; config.user
 * preservado).
 */
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite, escapeTomlString } from './installer/file-ops.ts';

/**
 * Encontra o package root do framework (dir com `package.json` name "process-ai")
 * subindo a partir de `startDir`. Robusto a source vs dist (módulos moram em
 * subdirs de profundidade variável) e BOUNDED ao package — não escala para
 * node_modules/consumer se skills/ faltar (classe de bug do walk-up irrestrito).
 * Síncrono; chamado no import-time. Retorna null se não achar.
 */
export function findPackageRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg?.name === 'process-ai') return dir;
    } catch {
      // sem package.json aqui (ou JSON inválido) — sobe
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // raiz do filesystem
    dir = parent;
  }
  return null;
}

/** Versão do framework (lida do package.json do próprio package). */
const FRAMEWORK_VERSION: string = (() => {
  const pkgRoot = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));
  if (!pkgRoot) return '0.0.0';
  try {
    return JSON.parse(readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'))?.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

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

  const activePack = escapeTomlString(opts.activePack ?? 'bpmn-sipoc');
  const packVersion = escapeTomlString(opts.packVersion ?? '1.0.0');
  const processAiVersion = escapeTomlString(opts.processAiVersion ?? FRAMEWORK_VERSION);

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
