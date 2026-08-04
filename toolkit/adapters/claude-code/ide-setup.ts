/**
 * toolkit/adapters/claude-code/ide-setup.ts — ClaudeCodeIdeSetup (implementa IdeSetup).
 *
 * Implementação concreta da porta `IdeSetup` para Claude Code (v1, FR-21).
 * Único ponto (com `ClaudeCodeAdapter`, runtime) que sabe que a engine/IDE v1
 * é o Claude Code. O orquestrador (`installer/orchestrator.ts`) depende só da
 * porta — nunca deste arquivo (hexagonal, AD-3).
 *
 * `setupIde` copia as skills via `installAllSkills` (a implementação única em
 * `skill-copy.ts`, compartilhada com `ClaudeCodeAdapter.installSkills`) e retorna
 * a lista de arquivos escritos com seus hashes SHA-256 (para o manifest). Não
 * escreve command files — no Claude Code uma skill JÁ é slash-invocável pelo
 * `name` (decisão documentada; `registerSlashCommands` é no-op).
 *
 * Não está sob `toolkit/src/` — pode importar `../../src/...` livremente.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  IdeSetup,
  IdeSetupOptions,
  IdeSetupResult,
  IdeUninstallResult,
  InstalledFile,
} from '../../src/ide-setup.ts';
import { sha256File } from '../../src/installer/manifest.ts';
import { installAllSkills, uninstallSkills } from './skill-copy.ts';

/** Padrão de skills do framework (espelha skill-copy.ts). */
const SKILL_DIR_PATTERN = /^process-ai(-.+)?$/;

export class ClaudeCodeIdeSetup implements IdeSetup {
  ideId(): string {
    return 'claude-code';
  }

  /**
   * Instala as skills (condutor + especialistas) e retorna os arquivos escritos
   * com seus hashes on-disk (sha256File — byte-idêntico ao que `computeIntegrity`
   * recomputará depois, garantindo consistência do manifest).
   *
   * `opts` é ignorado em v1 (skills são pack-agnósticas); reservado para IDEs/
   * artefatos que dependam do pack ativo.
   */
  async setupIde(targetDir: string, _opts?: IdeSetupOptions): Promise<IdeSetupResult> {
    await installAllSkills(targetDir);
    const files = await listInstalledSkillFiles(targetDir);
    return { ide: this.ideId(), files };
  }

  /** Remove as skills `process-ai*` de `<targetDir>/.claude/skills/`. Idempotente. */
  async uninstallIde(targetDir: string): Promise<IdeUninstallResult> {
    const removed = await uninstallSkills(targetDir);
    return { removed };
  }
}

/**
 * Lista os arquivos SKILL.md instalados (skills process-ai*) em .claude/skills/
 * com seus hashes on-disk. Paths forward-slash relativos ao target (convenção
 * P12). Pula skills sem SKILL.md (especialista que falhou best-effort) sem abortar.
 */
async function listInstalledSkillFiles(targetDir: string): Promise<InstalledFile[]> {
  const skillsDir = path.join(targetDir, '.claude', 'skills');
  let entries: string[];
  try {
    entries = await fs.readdir(skillsDir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }

  const files: InstalledFile[] = [];
  for (const entry of entries) {
    if (!SKILL_DIR_PATTERN.test(entry)) continue;
    const rel = `.claude/skills/${entry}/SKILL.md`;
    const abs = path.join(targetDir, rel);
    try {
      const sha256 = await sha256File(abs);
      files.push({ path: rel, sha256 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; // sem SKILL.md → ignora
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
