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

/** Skill-fonte no próprio framework (conteúdo-canônico, CORE). */
const SOURCE_SKILL_MD = path.join(REPO_ROOT, 'skills', 'process-ai', 'SKILL.md');

/** Nome estável da skill (= slash command /process-ai). */
const SKILL_NAME = 'process-ai';

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
   * Instala a skill do framework em `<targetProjectDir>/.claude/skills/process-ai/SKILL.md`.
   * O conteúdo vem do arquivo-fonte do framework (skills/process-ai/SKILL.md), mantendo
   * uma única fonte de verdade. Idempotente: mkdir recursive + writeFile determinístico.
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

    const targetSkillDir = path.join(targetProjectDir, '.claude', 'skills', SKILL_NAME);
    const targetSkillFile = path.join(targetSkillDir, 'SKILL.md');

    // P14: verifica existência da skill-fonte antes de ler (evita ENOENT cru)
    let sourceStat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      sourceStat = await fs.stat(SOURCE_SKILL_MD);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(
          `Skill-fonte não encontrada: ${SOURCE_SKILL_MD}. O framework parece estar incompleto — reinstale o módulo process-ai.`,
        );
      }
      throw e;
    }
    if (!sourceStat.isFile()) {
      throw new Error(
        `Skill-fonte não é um arquivo regular: ${SOURCE_SKILL_MD}. Esperado um SKILL.md.`,
      );
    }
    const skillContent = await fs.readFile(SOURCE_SKILL_MD, 'utf8');

    // [CR-hardening R2, item 1] Defense-in-depth (AC5/AD-7): NENHUM componente do
    // caminho `.claude/skills/process-ai` pode ser symlink — senão mkdir/writeFile
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
