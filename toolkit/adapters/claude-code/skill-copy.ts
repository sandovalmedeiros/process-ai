/**
 * toolkit/adapters/claude-code/skill-copy.ts — ÚNICA implementação de cópia de skills.
 *
 * Extrato de `adapter.ts` (cópia byte-a-byte com defesas de symlink/escopo) +
 * nova `uninstallSkills`. Compartilhado por:
 *  - `ClaudeCodeAdapter.installSkills` (legado runtime, deprecated) e
 *  - `ClaudeCodeIdeSetup.setupIde` (novo install-time).
 * Ambos delegam aqui — siblings compartilhando um helper, sem acoplamento
 * cruzado (o adapter legado NÃO depende do IdeSetup novo, e vice-versa).
 *
 * Mecanismo (docs Claude Code): escrever `<alvo>/.claude/skills/<name>/SKILL.md`
 * torna `/<name>` disponível como slash command. Frontmatter obrigatório:
 * `name` + `description`.
 *
 * Não está sob `toolkit/src/` (não é escaneado pelo import-boundary) — pode
 * importar `../../src/install.ts` livremente, como o `adapter.ts` já faz.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPackageRoot } from '../../src/install.ts';

// Localização do módulo -> repo root (package root). skill-copy.ts está em
// toolkit/adapters/claude-code/ (source) ou dist/toolkit/adapters/claude-code/
// (compilado) — nº de níveis até o package root varia; por isso SOURCE_SKILLS_DIR
// é localizado via findPackageRoot (bounded ao package, robusto a source vs dist).
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');

/**
 * Diretório de skills-fonte no próprio framework (conteúdo-canônico). Localizado
 * via findPackageRoot; fallback REPO_ROOT/skills (source).
 */
const SOURCE_SKILLS_DIR: string = path.join(findPackageRoot(MODULE_DIR) ?? REPO_ROOT, 'skills');

/** Padrão de skills do framework: condutor `process-ai` + especialistas `process-ai-*`. */
const SKILL_DIR_PATTERN = /^process-ai(-.+)?$/;

/** Nome estável da skill condutora (= slash command /process-ai). */
const CONDUCTOR_SKILL = 'process-ai';

let installTempCounter = 0; // evita colisão entre instalações concorrentes

/**
 * Descobre as skills-fonte em `sourceDir` (default: `skills/` do framework): dirs que
 * casam com `process-ai(-.+)?` E contêm um `SKILL.md` **arquivo regular (não symlink)**.
 *
 * Robustez (code review 1.6):
 *  - Entrada que casa mas NÃO é um diretório é pulada (fecha `ENOTDIR`).
 *  - Dir sem `SKILL.md` é pulado (não aborta).
 *  - `SKILL.md` que é symlink é rejeitado (defense-in-depth no source).
 *  - `sourceDir` ausente → [] (robusto a `skills/` faltando).
 *
 * Exportada (param `sourceDir`) para teste unitário com fixture tree.
 */
export async function discoverSourceSkills(
  sourceDir: string = SOURCE_SKILLS_DIR,
): Promise<Array<{ name: string; file: string }>> {
  let entries: string[];
  try {
    entries = await fs.readdir(sourceDir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }

  const found: Array<{ name: string; file: string }> = [];
  for (const entry of entries) {
    if (!SKILL_DIR_PATTERN.test(entry)) continue;

    const entryPath = path.join(sourceDir, entry);
    let entryStat: Awaited<ReturnType<typeof fs.lstat>>;
    try {
      entryStat = await fs.lstat(entryPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      continue; // sumiu entre readdir e lstat — ignora.
    }
    if (!entryStat.isDirectory()) continue; // arquivo (ou symlink) solto — ignora

    const file = path.join(entryPath, 'SKILL.md');
    try {
      const st = await fs.lstat(file); // lstat: NÃO segue symlink (defense-in-depth no source)
      if (!st.isFile() || st.isSymbolicLink()) continue; // só arquivo regular, nunca symlink
      found.push({ name: entry, file });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  return found;
}

/**
 * Instala TODAS as skills-fonte do framework em `<targetProjectDir>/.claude/skills/<name>/SKILL.md`
 * (condutor `process-ai` + especialistas `process-ai-*`), byte-a-byte. Idempotente.
 *
 * Resiliência (code review 1.6): o CONDUTOR (`process-ai`) é instalado primeiro e em
 * modo fail-fast — sua falha aborta com nada mais instalado. Os ESPECIALISTAS são
 * best-effort: a falha de um é avisada em stderr (não aborta). Assim nunca fica num
 * estado parcial silencioso do caminho crítico, e um especialista faltante não impede
 * o `/process-ai` de funcionar.
 *
 * Nunca escreve fora de `.claude/` no alvo (AD-7, AC5).
 */
export async function installAllSkills(targetProjectDir: string): Promise<void> {
  // Validação do alvo: deve existir e ser um diretório. Recusa typos de `--target`
  // que criariam árvore dispersa e arquivos-existentes que fariam mkdir lançar ENOTDIR.
  const targetStat = await fs.stat(targetProjectDir).then(
    (s) => s,
    (e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') {
        throw new Error(
          `Diretório-alvo não existe: ${targetProjectDir}. Crie-o antes de registrar /process-ai (ou aponte --target para um diretório existente).`,
        );
      }
      throw e;
    },
  );
  if (!targetStat.isDirectory()) {
    throw new Error(
      `O alvo não é um diretório (é um arquivo): ${targetProjectDir}. /process-ai deve ser registrado num diretório de projeto.`,
    );
  }

  const sources = await discoverSourceSkills();
  if (sources.length === 0) {
    throw new Error(
      `Nenhuma skill-fonte encontrada em ${SOURCE_SKILLS_DIR} (esperado skills/process-ai*/SKILL.md). ` +
        'O framework parece estar incompleto — reinstale o módulo process-ai.',
    );
  }

  // Condutor PRIMEIRO (fail-fast): sua falha aborta, nada mais é instalado.
  const conductor = sources.find((s) => s.name === CONDUCTOR_SKILL);
  if (!conductor) {
    throw new Error(
      `Falha fatal: o condutor /${CONDUCTOR_SKILL} não foi encontrado em ${SOURCE_SKILLS_DIR}. O framework está incompleto.`,
    );
  }
  await installOneSkill(targetProjectDir, conductor.name, conductor.file);

  // Especialistas em modo best-effort: falha de um é avisada, não aborta.
  const failures: string[] = [];
  for (const { name, file } of sources) {
    if (name === CONDUCTOR_SKILL) continue; // já instalado acima
    try {
      await installOneSkill(targetProjectDir, name, file);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).split('\n')[0];
      failures.push(`${name} (${msg})`);
    }
  }
  if (failures.length > 0) {
    process.stderr.write(
      `⚠ Aviso: ${failures.length} especialista(s) não instalada(s): ${failures.join('; ')}. ` +
        `O condutor /${CONDUCTOR_SKILL} está instalado; re-rode o install para tentar novamente.\n`,
    );
  }
}

/**
 * Instala UMA skill-fonte (byte-a-byte) em `<targetProjectDir>/.claude/skills/<skillName>/SKILL.md`,
 * com todas as defesas: validação da fonte (regular file, NÃO symlink — lstat),
 * symlink-walk por componente (parent-symlink), leaf-symlink check, e escrita
 * atômica temp+rename.
 */
async function installOneSkill(
  targetProjectDir: string,
  skillName: string,
  sourceSkillFile: string,
): Promise<void> {
  const targetSkillDir = path.join(targetProjectDir, '.claude', 'skills', skillName);
  const targetSkillFile = path.join(targetSkillDir, 'SKILL.md');

  // Verifica a skill-fonte via LSTAT (não segue symlink) — exige arquivo regular.
  let sourceStat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    sourceStat = await fs.lstat(sourceSkillFile);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Skill-fonte não encontrada: ${sourceSkillFile}. O framework parece estar incompleto — reinstale o módulo process-ai.`,
      );
    }
    throw e;
  }
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(
      `Skill-fonte inválida (não é arquivo regular ou é symlink): ${sourceSkillFile}. Esperado um SKILL.md regular.`,
    );
  }
  const skillContent = await fs.readFile(sourceSkillFile, 'utf8');

  // Defense-in-depth (AC5/AD-7): NENHUM componente do caminho `.claude/skills/<name>`
  // pode ser symlink — senão mkdir/writeFile seguiriam o link e gravariam FORA do alvo.
  let lstatProgress = targetProjectDir;
  for (const seg of path.relative(targetProjectDir, targetSkillDir).split(path.sep).filter(Boolean)) {
    lstatProgress = path.join(lstatProgress, seg);
    try {
      if ((await fs.lstat(lstatProgress)).isSymbolicLink()) {
        throw new Error(
          `Recusa: componente do caminho é um symlink (escaparia do escopo do alvo): ${lstatProgress}`,
        );
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }

  await fs.mkdir(targetSkillDir, { recursive: true });

  // Recusa escrever SKILL.md sobre um symlink preexistente.
  try {
    const destLstat = await fs.lstat(targetSkillFile);
    if (destLstat.isSymbolicLink()) {
      throw new Error(
        `Recusa escrever SKILL.md: o destino é um symlink e escaparia do escopo .claude/: ${targetSkillFile}`,
      );
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }

  // Escrita atômica: temp + rename (mesmo filesystem → rename atômico em POSIX).
  const tmpFile = `${targetSkillFile}.tmp-${process.pid}-${installTempCounter++}`;
  await fs.writeFile(tmpFile, skillContent, 'utf8');
  try {
    await fs.rename(tmpFile, targetSkillFile);
  } catch (e) {
    await fs.rm(tmpFile, { force: true });
    throw e;
  }
}

/**
 * Remove TODAS as skills `process-ai*` de `<targetProjectDir>/.claude/skills/`.
 * Idempotente: ausência de `.claude/skills/` → retorna []. Retorna a lista de
 * caminhos relativos (forward-slash) removidos, para o relatório de uninstall.
 */
export async function uninstallSkills(targetProjectDir: string): Promise<string[]> {
  const skillsDir = path.join(targetProjectDir, '.claude', 'skills');
  let entries: string[];
  try {
    entries = await fs.readdir(skillsDir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }

  const removed: string[] = [];
  for (const entry of entries) {
    if (!SKILL_DIR_PATTERN.test(entry)) continue;
    const entryPath = path.join(skillsDir, entry);
    try {
      await fs.rm(entryPath, { recursive: true, force: true });
      removed.push(`.claude/skills/${entry}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; // sumiu entre readdir e rm
    }
  }
  return removed.sort();
}
