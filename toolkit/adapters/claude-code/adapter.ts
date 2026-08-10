/**
 * toolkit/adapters/claude-code/adapter.ts — ClaudeCodeAdapter (AD-3: cada engine = um adapter).
 *
 * Este é o ÚNICO ponto do framework que sabe que a engine v1 é o Claude Code,
 * no canal de RUNTIME. O core (toolkit/src) depende só da porta EngineAdapter.
 *
 * Histórico (installer): a cópia de skills (install-time) vivia aqui e foi
 * extraída para `./skill-copy.ts` (implementação única). O concern de
 * install-time agora tem sua própria porta (`toolkit/src/ide-setup.ts`) +
 * adapter (`./ide-setup.ts`, `ClaudeCodeIdeSetup`). Este `ClaudeCodeAdapter`
 * (runtime) retém `installSkills`/`registerSlashCommands` por compatibilidade
 * (deprecated) — delegam a `skill-copy.ts`. Ver plano nested-weaving-mccarthy.
 *
 * Mecanismo (docs Claude Code): escrever `<alvo>/.claude/skills/<name>/SKILL.md`
 * torna `/<name>` disponível como slash command.
 */

import { commit } from '../../src/commit.ts';
import type { CommitResult, EngineAdapter, ProposePayload } from '../../src/engine-adapter.ts';
import { installAllSkills } from './skill-copy.ts';

// Re-export p/ compat: `specialists.test.ts` importa discoverSourceSkills daqui.
// A implementação canônica vive em `./skill-copy.ts`.
export { discoverSourceSkills } from './skill-copy.ts';

export interface ClaudeCodeAdapterOptions {
  /**
   * Raiz da sessão onde o commit escreve as pastas protegidas
   * (`_process-ai_output/` + `.process-ai/`). Default = `process.cwd()`.
   * [T6 — decisão registrada: o adapter guarda o root como estado de instância;
   * o `--target` do bootstrap é só para o install da skill, não para o commit.]
   *
   * **P13 (footgun):** `cwd` define ONDE os artefatos são commitados, enquanto
   * `--target` define ONDE a skill é instalada. Os dois são independentes.
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
   * Instala TODAS as skills-fonte do framework em `<targetProjectDir>/.claude/skills/`.
   *
   * @deprecated Concern de install-time. Prefira a porta `IdeSetup.setupIde`
   * (concreta: `ClaudeCodeIdeSetup`), acionada pelo orquestrador
   * (`toolkit/src/installer/orchestrator.ts`) — o ÚNICO caminho canônico de
   * install. Retido por compatibilidade — testes ainda o usam.
   * Delega à implementação única em `./skill-copy.ts` (comportamento byte-idêntico).
   */
  async installSkills(targetProjectDir: string): Promise<void> {
    return installAllSkills(targetProjectDir);
  }

  /**
   * NO-OP DOCUMENTADO (decisão registrada na Completion Notes da story 1.1):
   * no Claude Code, uma skill JÁ é slash-invocável pelo seu `name` assim que
   * instalada — logo `/process-ai` fica disponível após `installSkills()`.
   *
   * @deprecated Concern de install-time; prefira `IdeSetup.setupIde`.
   */
  async registerSlashCommands(_targetProjectDir: string): Promise<void> {
    // Intencionalmente vazio.
  }

  /**
   * PASS-THROUGH (AD-1, AC4): delega ao commit do toolkit SEM mutar o payload.
   *
   * O adapter NÃO computa SHA, NÃO escreve manifesto/provenance — apenas roteia
   * ao commit (o único escritor) e devolve o CommitResult.
   */
  async propose(payload: ProposePayload): Promise<CommitResult> {
    return commit(payload, { root: this.cwd, agent: this.agent });
  }
}
