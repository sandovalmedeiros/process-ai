/**
 * toolkit/src/installer/engines.ts — catálogo + detecção de engines de apoio.
 *
 * Espelha o `lib/installer/detector.js` do Reversa (mesmos 13 ids/nomes e
 * marcadores) para a pergunta 1 do install (checkbox multi-select). Em v1 só
 * `claude-code` é `supported` (único adapter `IdeSetup` existe — AD-3 porta);
 * as demais são marcáveis e ficam registradas no config.user até terem adapter.
 *
 * Detecção: marcadores no projeto-alvo (dir/arquivo) OU CLI da engine presente
 * no PATH (`where`/`which`, try/catch → false, timeout 3s contra PATH travado).
 * `deps` injetável → testes nunca executam `where`.
 *
 * AD-3 / import-boundary: só `node:*` (child_process, fs, path). Zero deps.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Engine do catálogo (estático; instalabilidade = adapter existe). */
export interface EngineEntry {
  readonly id: string;
  readonly name: string;
  /** true quando há adapter IdeSetup instalável (v1: só claude-code). */
  readonly supported: boolean;
  /** Marcadores no projeto (relativos, '/'-separados) que indicam a engine. */
  readonly markers: readonly string[];
  /** CLI global cuja presença no PATH também detecta a engine. */
  readonly command?: string;
}

/** Engine com o resultado da detecção no projeto-alvo. */
export interface DetectedEngine {
  readonly id: string;
  readonly name: string;
  readonly supported: boolean;
  readonly detected: boolean;
}

/** Dependências de detecção injetáveis (testes nunca rodam `where`). */
export interface DetectDeps {
  exists?(absPath: string): boolean;
  commandExists?(command: string): boolean;
}

/** Catálogo (espelho do detector.js do Reversa — mesmos ids/nomes/marcadores). */
export const ENGINES: readonly EngineEntry[] = [
  { id: 'claude-code', name: 'Claude Code', supported: true, markers: ['.claude'], command: 'claude' },
  { id: 'codex', name: 'Codex', supported: false, markers: ['AGENTS.md'], command: 'codex' },
  { id: 'cursor', name: 'Cursor', supported: false, markers: ['.cursor', '.cursorrules'] },
  { id: 'gemini-cli', name: 'Gemini CLI', supported: false, markers: ['GEMINI.md'], command: 'gemini' },
  { id: 'windsurf', name: 'Windsurf', supported: false, markers: ['.windsurf', '.windsurfrules'] },
  { id: 'antigravity', name: 'Antigravity', supported: false, markers: ['.antigravity'], command: 'agy' },
  { id: 'kiro', name: 'Kiro', supported: false, markers: ['.kiro'], command: 'kiro' },
  { id: 'opencode', name: 'Opencode', supported: false, markers: ['.opencode'], command: 'opencode' },
  { id: 'cline', name: 'Cline', supported: false, markers: ['.clinerules', '.cline'] },
  { id: 'roo-code', name: 'Roo Code', supported: false, markers: ['.roorules', '.roo'] },
  { id: 'github-copilot', name: 'GitHub Copilot', supported: false, markers: ['.github/copilot-instructions.md'] },
  { id: 'aider', name: 'Aider', supported: false, markers: ['.aider.conf.yml'], command: 'aider' },
  { id: 'amazon-q', name: 'Amazon Q Developer', supported: false, markers: ['.amazonq'], command: 'q' },
];

/**
 * Detecta as engines presentes no projeto-alvo (marcador no disco ou CLI no
 * PATH). Fail-soft por engine: qualquer erro de detecção vira `false`.
 */
export function detectEngines(targetDir: string, deps: DetectDeps = {}): DetectedEngine[] {
  const exists = deps.exists ?? ((p: string) => existsSync(p));
  const commandExists = deps.commandExists ?? defaultCommandExists;
  return ENGINES.map((engine) => {
    let detected = false;
    try {
      detected =
        engine.markers.some((m) => exists(path.join(targetDir, ...m.split('/')))) ||
        (engine.command !== undefined && commandExists(engine.command));
    } catch {
      detected = false;
    }
    return { id: engine.id, name: engine.name, supported: engine.supported, detected };
  });
}

/** `where`/`which` com timeout; nunca lança (falha = false). */
function defaultCommandExists(command: string): boolean {
  if (!/^[a-zA-Z0-9_-]+$/.test(command)) return false;
  try {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const r = spawnSync(finder, [command], { stdio: 'pipe', timeout: 3000 });
    return !r.error && r.status === 0;
  } catch {
    return false;
  }
}
