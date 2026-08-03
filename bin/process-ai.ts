#!/usr/bin/env node
/**
 * bin/process-ai.ts — CLI runtime dispatcher (AD-3, FR-20).
 *
 * Este é o CANAL DE RUNTIME do framework: a skill markdown da Déa (que só pode
 * agir via Bash/slash no engine) invoca este CLI para commitar artefatos,
 * registrar gates, avançar estágios, retomar a sessão e gerar o relatório de
 * confiança. É a materialização de "expor o canal de propose em modo
 * pass-through" (AD-3, capacidade #3) — até aqui ele só existia como método Node
 * (`adapter.propose()`) exercitado em testes.
 *
 * Composition root (AD-3): o dispatcher depende SÓ da PORTA `EngineAdapter`;
 * `ClaudeCodeAdapter` é instanciado aqui (único ponto, além de `bootstrap.ts`,
 * que sabe que a engine v1 é o Claude Code). `cwd` = projeto-alvo (onde
 * `_process-ai_output/` + `.process-ai/` vivem).
 *
 * Nenhuma escrita direta em `_process-ai_output/` ou `.process-ai/` — toda
 * mutação via `adapter.propose()` (commit, único escritor) ou `checkpointAdvance`
 * (gate/estágio, atômico via WAL). Escrita fora do escopo aborta (já enforceado
 * por `commit.ts:assertWithinScope`).
 *
 * Disciplina espelhada do `bootstrap.ts` (1.1): composition root tipada como
 * `EngineAdapter`, entry-guard por `realpath`, erros acionáveis em pt-BR.
 *
 * Uso:
 *   process-ai propose --payload <arquivo.json>
 *   process-ai gate --id <gateId> --decision <approved|rejected|changes-requested>
 *   process-ai stage --to <stageId>
 *   process-ai resume
 *   process-ai report
 *   process-ai status
 *   process-ai --help | -h
 */
import path from 'node:path';
import { promises as fs, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClaudeCodeAdapter } from '../toolkit/adapters/claude-code/adapter.ts';
import type { EngineAdapter, ProposePayload } from '../toolkit/src/engine-adapter.ts';
import {
  acquireLock,
  checkpointAdvance,
  checkpointRead,
  releaseLock,
  resume,
} from '../toolkit/src/checkpoint.ts';
import { reportConfidence, formatConfidenceReport } from '../toolkit/src/report.ts';
import { runInstall, formatInstallSummary } from '../toolkit/src/install.ts';

// ---- Tipos ----

/** Comando parseado (discriminado por `kind`). */
export type ParsedCommand =
  | { kind: 'help' }
  | { kind: 'install'; target?: string }
  | { kind: 'propose'; payloadPath: string }
  | { kind: 'gate'; id: string; decision: string }
  | { kind: 'stage'; to: string }
  | { kind: 'resume' }
  | { kind: 'report' }
  | { kind: 'status' };

/** Resultado canônico de um dispatch (o que `main` imprime em stdout). */
export interface DispatchResult {
  ok: boolean;
  /** Saída canônica: JSON (CommitResult/CheckpointState/ResumeResult) ou markdown (report) ou HELP. */
  output: string;
}

/** Decisões de gate canônicas (Glossário "Gate"). */
const VALID_DECISIONS: ReadonlySet<string> = new Set([
  'approved',
  'rejected',
  'changes-requested',
]);

// ---- Ajuda ----

export const HELP = `process-ai — canal de runtime do framework (orquestrado pela skill Déa)

Uso:
  process-ai                              # instala no diretório atual (skills + .process-ai/config)
  process-ai install [--target <dir>]     # instalação explícita
  process-ai <subcomando> [flags]         # canal de runtime (orquestrado pela skill Déa)
  process-ai --help | -h

Subcomandos (o agente invoca via Bash; TODA escrita passa pelo toolkit):
  propose --payload <arquivo.json>
      Lê um ProposePayload ({ artifactType, content, claims? }) de arquivo e commita
      o artefato. Imprime o CommitResult (JSON: sha256, artifactPath, manifestPath).
      Payload por arquivo (não inline) — evita escaping/limite de linha de comando.
  gate --id <gateId> --decision <approved|rejected|changes-requested>
      Registra a decisão de um gate no checkpoint (atômico via WAL; apply no-op).
      Imprime o CheckpointState (JSON).
  stage --to <stageId>
      Avança o estágio da sessão no checkpoint. Imprime o CheckpointState (JSON).
  resume
      Retoma a sessão a partir do checkpoint on-disk (replay de WAL + quarentena
      de manifestos órfãos). Manifestos órfãos vão para .process-ai/quarantine/
      (nunca auto-mergeados). Imprime o ResumeResult (JSON: { state, orphans }).
  report
      Gera o relatório de confiança MÍNIMO (contagem 🟢/🟡/🔴 agregada do ledger
      de confiança + artefatos + nota de gaps/orphans). Imprime markdown pt-BR.
  status
      Imprime o CheckpointState atual (JSON).

Pastas protegidas: escrita só em _process-ai_output/ (artefatos) e .process-ai/
(manifestos, checkpoint, WAL, ledger, provenance) — sempre via toolkit, nunca
direto pela skill ou pelo CLI.
`;

// ---- Helpers ----

/**
 * Compara dois caminhos pelo destino real (resolve symlinks/junctions e case
 * canônico do filesystem). [CR-hardening R2, 1.1] — robusto a symlink/case de
 * drive no Windows para o entry-guard. Se qualquer lado não resolve, retorna
 * false (espelha `bootstrap.ts:sameRealpath`).
 */
function sameRealpath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

/**
 * Parser de flags puro (sem IO): suporta `--flag valor` e `--flag=valor`.
 * Rejeita flags desconhecidas, duplicadas e valores que parecem flag (no form
 * espaço, exige `=`). Erros acionáveis em pt-BR.
 */
function parseFlags(args: string[], allowed: string[], sub: string): Map<string, string> {
  const allowedSet = new Set(allowed.map((a) => `--${a}`));
  const result = new Map<string, string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Form com '=': --flag=valor (aceita valor começando com '-').
    if (arg.startsWith('--') && arg.includes('=')) {
      const eqIdx = arg.indexOf('=');
      const key = arg.slice(0, eqIdx);
      const value = arg.slice(eqIdx + 1);
      if (!allowedSet.has(key)) {
        throw new Error(`Flag desconhecida em "${sub}": ${key}.\n\n${HELP}`);
      }
      if (result.has(key)) throw new Error(`Flag duplicada: ${key}.`);
      if (value === '') throw new Error(`${key} requer um valor (recebeu valor vazio).`);
      result.set(key, value);
      continue;
    }

    // Form com espaço: --flag valor.
    if (arg.startsWith('--')) {
      if (!allowedSet.has(arg)) {
        throw new Error(`Flag desconhecida em "${sub}": ${arg}.\n\n${HELP}`);
      }
      if (result.has(arg)) throw new Error(`Flag duplicada: ${arg}.`);
      const value = args[i + 1];
      if (value === undefined || value === '--' || value === '') {
        throw new Error(`${arg} requer um valor. Use ${arg} <valor> ou ${arg}=<valor>.`);
      }
      if (value.startsWith('--')) {
        throw new Error(
          `${arg} recebeu algo que parece uma flag ("${value}"). Use ${arg}=${value} para valores que começam com '-'.`,
        );
      }
      result.set(arg, value);
      i++;
      continue;
    }

    throw new Error(`Argumento inesperado em "${sub}": ${arg}.\n\n${HELP}`);
  }

  return result;
}

/** Extrai uma flag obrigatória do mapa (erro pt-BR se ausente). */
function requireFlag(flags: Map<string, string>, name: string, sub: string): string {
  const key = `--${name}`;
  const value = flags.get(key);
  if (value === undefined) {
    throw new Error(`O subcomando "${sub}" exige a flag ${key}. Use ${key} <valor> ou ${key}=<valor>.`);
  }
  return value;
}

/** Rejeita argumentos em subcomandos que não os aceitam (resume/report/status). */
function rejectArgs(args: string[], sub: string): void {
  if (args.length > 0) {
    throw new Error(`O subcomando "${sub}" não aceita argumentos (recebeu: ${args.join(' ')}).`);
  }
}

// ---- parseArgs (puro) ----

/**
 * Parse puro (sem IO) dos argumentos da CLI. argv = args após o script
 * (ex.: `process.argv.slice(2)`). Lança erros acionáveis em pt-BR.
 */
export function parseArgs(argv: string[]): ParsedCommand {
  // Bare invocation (`npx process-ai`) = install no cwd (espelho BMAD: o installer
  // é o entry default). Subcomandos abaixo são o canal de runtime da skill Déa.
  if (argv.length === 0) return { kind: 'install' };

  const sub = argv[0];
  const rest = argv.slice(1);

  if (sub === 'help' || sub === '--help' || sub === '-h') return { kind: 'help' };

  switch (sub) {
    case 'propose': {
      const flags = parseFlags(rest, ['payload'], 'propose');
      return { kind: 'propose', payloadPath: requireFlag(flags, 'payload', 'propose') };
    }
    case 'gate': {
      const flags = parseFlags(rest, ['id', 'decision'], 'gate');
      const id = requireFlag(flags, 'id', 'gate');
      const decision = requireFlag(flags, 'decision', 'gate');
      if (!VALID_DECISIONS.has(decision)) {
        throw new Error(
          `--decision inválida: "${decision}". Esperado um de: ${[...VALID_DECISIONS].join(', ')}.`,
        );
      }
      return { kind: 'gate', id, decision };
    }
    case 'stage': {
      const flags = parseFlags(rest, ['to'], 'stage');
      return { kind: 'stage', to: requireFlag(flags, 'to', 'stage') };
    }
    case 'resume':
      rejectArgs(rest, 'resume');
      return { kind: 'resume' };
    case 'report':
      rejectArgs(rest, 'report');
      return { kind: 'report' };
    case 'status':
      rejectArgs(rest, 'status');
      return { kind: 'status' };
    case 'install': {
      // --target opcional (default = cwd, resolvido no dispatch). install NÃO é
      // invocado pela skill (é entry do usuário) — fora da lista de subcomandos runtime.
      const flags = parseFlags(rest, ['target'], 'install');
      return { kind: 'install', target: flags.get('--target') };
    }
    default:
      throw new Error(`Subcomando desconhecido: "${sub}".\n\n${HELP}`);
  }
}

// ---- Leitura do payload (propose) ----

/**
 * Lê e faz JSON.parse do arquivo de payload (ProposePayload). Validação profunda
 * de shape fica com `commit.validatePayload` (acionável, com contexto). Aqui só
 * traduzimos erros de IO/JSON para mensagens pt-BR antes de reachar o toolkit.
 */
async function readPayload(payloadPath: string): Promise<ProposePayload> {
  let raw: string;
  try {
    raw = await fs.readFile(payloadPath, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Arquivo de payload não encontrado: ${payloadPath}.`);
    }
    const code = (e as NodeJS.ErrnoException).code;
    throw new Error(
      `Não foi possível ler o payload "${payloadPath}"${code ? ` (erro ${code})` : ''}. ` +
        'Verifique se é um arquivo legível (não um diretório) e se há permissão de leitura.',
    );
  }
  try {
    // Descasca BOM UTF-8 (Node 'utf8' não remove; PowerShell Out-File/Notepad emitem ﻿ no Windows).
    const stripped = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(stripped) as ProposePayload;
  } catch {
    throw new Error(
      `Payload inválido (JSON malformado): ${payloadPath}. Esperado { artifactType, content, claims? }.`,
    );
  }
}

// ---- dispatch (orquestração; o adapter é injetado — testável/mockável) ----

/**
 * Executa o comando parseado. Toda mutação passa pelo toolkit:
 *  - propose  → adapter.propose() (commit, único escritor; AD-1).
 *  - gate     → checkpointAdvance com intent `gate` (apply no-op, atômico via WAL; AD-4).
 *  - stage    → checkpointAdvance com intent `stage-advance` (apply no-op; AD-4).
 *  - resume   → resume(root) (replay de WAL + quarentena de órfãos; AD-4).
 *  - report   → reportConfidence(root) (lê o ledger; AD-5).
 *  - status   → checkpointRead(root) (leitura pura).
 *
 * @param cmd - Comando parseado.
 * @param adapter - Porta EngineAdapter (composition root o instancia).
 * @param root - Raiz da sessão (projeto-alvo).
 * @returns DispatchResult com a saída canônica a imprimir.
 */
export async function dispatch(
  cmd: ParsedCommand,
  adapter: EngineAdapter,
  root: string,
): Promise<DispatchResult> {
  switch (cmd.kind) {
    case 'help':
      return { ok: true, output: HELP };

    case 'install': {
      // Bare `process-ai` ou `process-ai install [--target]` → install no projeto-alvo.
      // target default = root (cwd); runInstall orquestra skills + config installer-managed.
      const target = path.resolve(cmd.target ?? root);
      const result = await runInstall(adapter, target);
      return { ok: true, output: formatInstallSummary(result) };
    }

    case 'propose': {
      const payload = await readPayload(cmd.payloadPath);
      const result = await adapter.propose(payload);
      return { ok: true, output: JSON.stringify(result) };
    }

    case 'gate': {
      const lock = await acquireLock(root);
      try {
        const next = await checkpointAdvance(
          root,
          await checkpointRead(root),
          { kind: 'gate', payload: { gateId: cmd.id, decision: cmd.decision } },
          async () => {
            // Apply no-op: gate é estado puro (não escreve artefato). A
            // atomicidade WAL + single-writer são preservadas (AD-4).
          },
        );
        return { ok: true, output: JSON.stringify(next) };
      } finally {
        await releaseLock(lock);
      }
    }

    case 'stage': {
      const lock = await acquireLock(root);
      try {
        const current = await checkpointRead(root);
        const next = await checkpointAdvance(
          root,
          current,
          { kind: 'stage-advance', payload: { from: current.stage, to: cmd.to } },
          async () => {
            // Apply no-op: avanço de estágio é estado puro (AD-4).
          },
        );
        return { ok: true, output: JSON.stringify(next) };
      } finally {
        await releaseLock(lock);
      }
    }

    case 'resume': {
      const result = await resume(root);
      return { ok: true, output: JSON.stringify(result) };
    }

    case 'report': {
      const report = await reportConfidence(root);
      return { ok: true, output: formatConfidenceReport(report) };
    }

    case 'status': {
      const state = await checkpointRead(root);
      return { ok: true, output: JSON.stringify(state) };
    }
  }
}

// ---- main (composition root + impressão + tratamento de erro) ----

export interface MainOptions {
  /** Raiz da sessão / projeto-alvo (default = process.cwd()). */
  cwd?: string;
}

/**
 * Composition root: resolve a raiz, instancia o adapter (porta) e despacha.
 * Tratamento de erro (stderr + exit 1) fica no entry-point guard.
 */
export async function main(argv: string[], opts: MainOptions = {}): Promise<void> {
  const root = path.resolve(opts.cwd ?? process.cwd());
  const cmd = parseArgs(argv);
  // AD-3: o dispatcher depende da PORTA; ClaudeCodeAdapter é instanciado aqui.
  const adapter: EngineAdapter = new ClaudeCodeAdapter({ cwd: root });
  const result = await dispatch(cmd, adapter, root);
  process.stdout.write(result.output + '\n');
}

// ---- Entry-point guard (só executa quando invocado diretamente) ----
// [CR-hardening R1/R2, 1.1] robusto a argv[1] undefined e case/symlink na
// invocação — compara por realpath dos dois lados (permite importar
// parseArgs/dispatch/main em testes sem side effects).
const _entry = process.argv[1];
if (typeof _entry === 'string' && sameRealpath(_entry, fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(
      `✗ process-ai falhou: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}
