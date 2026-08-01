/**
 * toolkit/adapters/claude-code/adapter.ts — ClaudeCodeAdapter (AD-3: cada engine = um adapter).
 *
 * Este é o ÚNICO ponto do framework que sabe que a engine v1 é o Claude Code.
 * O core (toolkit/src) depende só da porta EngineAdapter; nunca deste arquivo.
 *
 * Mecanismo (pesquisa de docs Claude Code, 2026):
 *  - Escrever `<alvo>/.claude/skills/<name>/SKILL.md` torna `/<name>` disponível
 *    como slash command. Não exige plugin manifest.
 *  - Frontmatter obrigatório: `name` + `description`.
 *  - Skills de projeto exigem o usuário aceitar o diálogo de workspace trust.
 *
 * Story 1.6: `installSkills` generalizado — descobre e instala TODAS as skills-fonte
 * `process-ai*` (condutor `process-ai` + especialistas `process-ai-bento/-miguel/-julia/
 * -zanoni`), cada uma byte-a-byte, reaproveitando as defesas de symlink/escopo da 1.1.
 *
 * Code review 1.6 (hardening):
 *  - `discoverSourceSkills` virou função de módulo EXPORTADA (param `sourceDir`) para
 *    teste unitário com fixture; pula entradas que casam mas NÃO são diretório (fecha
 *    ENOTDIR); rejeita `SKILL.md` symlink no source (lstat — defense-in-depth no source,
 *    espelhando as defesas do target).
 *  - `installSkills` é resiliente: instala o CONDUTOR primeiro (fail-fast — sua falha
 *    aborta o bootstrap, nada mais é instalado) e os ESPECIALISTAS em modo best-effort
 *    (falha de um especialista é avisada em stderr, não aborta o bootstrap).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commit } from '../../src/commit.ts';
import type { CommitResult, EngineAdapter, ProposePayload } from '../../src/engine-adapter.ts';

// Localização do módulo -> repo root.
// adapter.ts está em toolkit/adapters/claude-code/ -> 3 níveis acima = repo root.
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');

/** Diretório de skills-fonte no próprio framework (conteúdo-canônico, CORE). */
const SOURCE_SKILLS_DIR = path.join(REPO_ROOT, 'skills');

/** Padrão de skills do framework: condutor `process-ai` + especialistas `process-ai-*`. */
const SKILL_DIR_PATTERN = /^process-ai(-.+)?$/;

/** Nome estável da skill condutora (= slash command /process-ai). */
const CONDUCTOR_SKILL = 'process-ai';

let installTempCounter = 0; // P6 — evita colisão entre instalações concorrentes

export interface ClaudeCodeAdapterOptions {
  /**
   * Raiz da sessão onde o commit escreve as pastas protegidas
   * (`_process-ai_output/` + `.process-ai/`). Default = `process.cwd()`.
   * [T6 — decisão registrada: o adapter guarda o root como estado de instância;
   * o `--target` do bootstrap é só para o install da skill, não para o commit.]
   *
   * **P13 (footgun):** `cwd` define ONDE os artefatos são commitados, enquanto
   * `--target` define ONDE a skill é instalada. Os dois são independentes —
   * `bootstrap.ts` instala a skill em `--target` mas constrói o adapter com
   * `cwd = process.cwd()`, então `propose()` commita no diretório de lançamento
   * da sessão, não no `--target`. Certifique-se de que `cwd` aponta para o
   * projeto-alvo, não para o diretório do framework.
   */
  cwd?: string;
  /** Identidade do agente registrada na provenance (default = "claude-code"). */
  agent?: string;
}

/**
 * Descobre as skills-fonte em `sourceDir` (default: `skills/` do framework): dirs que
 * casam com `process-ai(-.+)?` E contêm um `SKILL.md` **arquivo regular (não symlink)**.
 *
 * Robustez (code review 1.6):
 *  - Entrada que casa mas NÃO é um diretório (ex.: arquivo solto `process-ai-backup`)
 *    é pulada — fecha `ENOTDIR` que abortaria o bootstrap.
 *  - Dir sem `SKILL.md` é pulado (não aborta o bootstrap).
 *  - `SKILL.md` que é symlink é rejeitado (defense-in-depth no source — o target já
 *    tem defesas; o source também deve exigir arquivo regular).
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

    // Entry deve ser um DIRETÓRIO (lstat — não segue symlink; fecha ENOTDIR de um
    // `process-ai-backup` arquivo solto e evita stat de travessia sobre não-dir).
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
      // dir sem SKILL.md → ignora (não aborta o bootstrap).
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  return found;
}

export class ClaudeCodeAdapter implements EngineAdapter {
  private readonly cwd: string;
  private readonly agent: string;

  constructor({ cwd, agent }: ClaudeCodeAdapterOptions = {}) {
    // P9: valida que cwd e agent não são strings vazias
    if (cwd !== undefined && cwd.length === 0) {
      throw new Error('cwd não pode ser string vazia. Use o default (process.cwd()) ou um path absoluto.');
    }
    if (agent !== undefined && agent.length === 0) {
      throw new Error('agent não pode ser string vazia. Use o default ("claude-code") ou um identificador não-vazio.');
    }
    this.cwd = cwd ?? process.cwd();
    this.agent = agent ?? 'claude-code';
  }

  /**
   * Instala TODAS as skills-fonte do framework em `<targetProjectDir>/.claude/skills/<name>/SKILL.md`
   * (condutor `process-ai` + especialistas `process-ai-*`). O conteúdo vem dos arquivos-fonte
   * em `skills/` (única fonte de verdade), copiados byte-a-byte. Idempotente: mkdir recursive
   * + writeFile determinístico.
   *
   * Story 1.6: generalização do installSkills (antes copiava um único skill hardcoded).
   *
   * Resiliência (code review 1.6): o CONDUTOR (`process-ai`) é instalado primeiro e em
   * modo fail-fast — sua falha aborta o bootstrap com nada mais instalado (igual ao
   * comportamento 1.1 para o caminho crítico). Os ESPECIALISTAS são best-effort: a falha
   * de um especialista é avisada em stderr (não aborta o bootstrap). Assim o bootstrap
   * nunca deixa o alvo num estado parcial silencioso do caminho crítico, e um especialista
   * faltante não impede o `/process-ai` de funcionar.
   *
   * Nunca escreve fora de `.claude/` no alvo (AD-7, AC5).
   */
  async installSkills(targetProjectDir: string): Promise<void> {
    // [CR-hardening, item 1] Validação do alvo: deve existir e ser um diretório.
    // Recusa (a) typos de `--target` que criariam uma árvore dispersa e
    // (b) arquivos-existentes que fariam o mkdir abaixo lançar um ENOTDIR opaco.
    // Defense-in-depth: valida aqui para proteger qualquer caller, não só o CLI.
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

    // Descobre todas as skills-fonte (condutor + especialistas).
    const sources = await discoverSourceSkills();
    if (sources.length === 0) {
      throw new Error(
        `Nenhuma skill-fonte encontrada em ${SOURCE_SKILLS_DIR} (esperado skills/process-ai*/SKILL.md). ` +
          'O framework parece estar incompleto — reinstale o módulo process-ai.',
      );
    }

    // Condutor PRIMEIRO (fail-fast): sua falha aborta o bootstrap, nada mais é instalado.
    const conductor = sources.find((s) => s.name === CONDUCTOR_SKILL);
    if (!conductor) {
      throw new Error(
        `Falha fatal: o condutor /${CONDUCTOR_SKILL} não foi encontrado em ${SOURCE_SKILLS_DIR}. O framework está incompleto.`,
      );
    }
    await this.installOneSkill(targetProjectDir, conductor.name, conductor.file);

    // Especialistas em modo best-effort: falha de um é avisada, não aborta o bootstrap.
    const failures: string[] = [];
    for (const { name, file } of sources) {
      if (name === CONDUCTOR_SKILL) continue; // já instalado acima
      try {
        await this.installOneSkill(targetProjectDir, name, file);
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).split('\n')[0];
        failures.push(`${name} (${msg})`);
      }
    }
    if (failures.length > 0) {
      process.stderr.write(
        `⚠ Aviso: ${failures.length} especialista(s) não instalada(s): ${failures.join('; ')}. ` +
          `O condutor /${CONDUCTOR_SKILL} está instalado; re-rode o bootstrap para tentar novamente.\n`,
      );
    }
  }

  /**
   * Instala UMA skill-fonte (byte-a-byte) em `<targetProjectDir>/.claude/skills/<skillName>/SKILL.md`,
   * com todas as defesas da 1.1: validação da fonte (regular file, NÃO symlink — lstat), symlink-walk
   * por componente (parent-symlink), leaf-symlink check, e escrita atômica temp+rename. Fatorado do
   * installSkills monolítico.
   */
  private async installOneSkill(
    targetProjectDir: string,
    skillName: string,
    sourceSkillFile: string,
  ): Promise<void> {
    const targetSkillDir = path.join(targetProjectDir, '.claude', 'skills', skillName);
    const targetSkillFile = path.join(targetSkillDir, 'SKILL.md');

    // P14 + code review 1.6: verifica a skill-fonte via LSTAT (não segue symlink) — exige
    // arquivo regular. Defense-in-depth no source (o target já tem defesas; o source também).
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

    // [CR-hardening R2, item 1] Defense-in-depth (AC5/AD-7): NENHUM componente do
    // caminho `.claude/skills/<name>` pode ser symlink — senão mkdir/writeFile
    // seguiriam o link e gravariam FORA do alvo. O lstat do leaf (abaixo) checa só
    // o SKILL.md final; aqui caminhamos cada pai para fechar o buraco do parent-symlink.
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
        // ENOENT = componente ainda não existe; mkdir criará. Outros erros propagam.
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }

    await fs.mkdir(targetSkillDir, { recursive: true });

    // [CR-hardening, item 2] Defense-in-depth (AC5/AD-7): recusa escrever SKILL.md
    // sobre um symlink preexistente — writeFile seguiria o link e escreveria FORA
    // de .claude/. Baixa probabilidade em v1, mas o custo do check é trivial.
    try {
      const destLstat = await fs.lstat(targetSkillFile);
      if (destLstat.isSymbolicLink()) {
        throw new Error(
          `Recusa escrever SKILL.md: o destino é um symlink e escaparia do escopo .claude/: ${targetSkillFile}`,
        );
      }
    } catch (e) {
      // ENOENT = destino ainda não existe; writeFile criará normalmente. Prossegue.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }

    // [CR-hardening R1] Escrita atômica: temp + rename no mesmo diretório (mesmo
    // filesystem → rename atômico em POSIX, near-atômico em NTFS). Falha mid-write
    // (disco cheio/EIO/SIGINT) não deixa SKILL.md corrompido/vazio; re-run idempotente.
    // P6: contador além do pid — evita colisão entre instalações concorrentes.
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
   * NO-OP DOCUMENTADO (decisão registrada na Completion Notes da story 1.1):
   * no Claude Code, uma skill JÁ é slash-invocável pelo seu `name` assim que
   * instalada — logo `/process-ai` fica disponível após `installSkills()`.
   *
   * A porta declara `registerSlashCommands` como capacidade distinta porque outra
   * engine pode separar os conceitos (skill ≠ command). Aqui não há nada a fazer.
   */
  async registerSlashCommands(_targetProjectDir: string): Promise<void> {
    // Intencionalmente vazio. Veja o JSDoc acima.
  }

  /**
   * PASS-THROUGH (AD-1, AC4): delega ao commit do toolkit SEM mutar o payload.
   *
   * O adapter NÃO computa SHA, NÃO escreve manifesto/provenance — apenas roteia
   * ao commit (o único escritor) e devolve o CommitResult. A composition root
   * (`bootstrap.ts`) continua fazendo `new ClaudeCodeAdapter()`; o novo ctor com
   * `cwd` default mantém isso compatível. Testes injetam `cwd = tmpdir`.
   */
  async propose(payload: ProposePayload): Promise<CommitResult> {
    return commit(payload, { root: this.cwd, agent: this.agent });
  }
}
