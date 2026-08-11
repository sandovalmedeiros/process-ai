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
 * `ClaudeCodeAdapter` é instanciado aqui (único ponto que sabe que a engine
 * v1 é o Claude Code). `cwd` = projeto-alvo (onde `_process-ai_output/` +
 * `.process-ai/` vivem).
 *
 * Nenhuma escrita direta em `_process-ai_output/` ou `.process-ai/` — toda
 * mutação via `adapter.propose()` (commit, único escritor) ou `checkpointAdvance`
 * (gate/estágio, atômico via WAL). Escrita fora do escopo aborta (já enforceado
 * por `commit.ts:assertWithinScope`).
 *
 * Disciplina (desde 1.1): composition root tipado como
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
import { promises as fs, realpathSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
import { findPackageRoot } from '../toolkit/src/install.ts';
import { ClaudeCodeIdeSetup } from '../toolkit/adapters/claude-code/ide-setup.ts';
import { Installer, formatOutcome } from '../toolkit/src/installer/orchestrator.ts';
import { getFrameworkVersion } from '../toolkit/src/installer/resource.ts';
import { checkForUpdate, defaultDeps, formatUpdateWarning } from '../toolkit/src/installer/update-check.ts';
import type { UpdateCheckResult } from '../toolkit/src/installer/update-check.ts';
import type { InstallState } from '../toolkit/src/installer/state.ts';
import { gatherInstallOptions } from '../toolkit/src/installer/prompts.ts';
import * as readline from 'node:readline/promises';
import { ingest, supportedFormats } from '../toolkit/src/ingest.ts';
import { ensureRenderDeps } from '../toolkit/src/installer/playwright-deps.ts';

// ---- Tipos ----

/** Comando parseado (discriminado por `kind`). */
export type ParsedCommand =
  | { kind: 'help' }
  | { kind: 'version' }
  | {
      kind: 'install';
      target?: string;
      ide?: string;
      pack?: string;
      full?: boolean;
      statusOnly?: boolean;
    }
  | { kind: 'update'; target?: string; pack?: string }
  | { kind: 'uninstall'; target?: string; purge?: boolean }
  | { kind: 'propose'; payloadPath: string }
  | { kind: 'gate'; id: string; decision: string }
  | { kind: 'stage'; to: string }
  | { kind: 'resume' }
  | { kind: 'report' }
  | { kind: 'status' }
  | { kind: 'ingest'; path: string; agent?: string }
  | {
      kind: 'render-flow';
      /** Artefato `flow` (BPMN 2.0 XML, JSON {body} ou markdown c/ code block). */
      input: string;
      /** Diretório de saída (default: <root>/_process-ai_output/flow). */
      outputDir?: string;
      /** Nome base dos arquivos (default: basename do input sem extensão). */
      baseName?: string;
    }
  | {
      kind: 'generate-site';
      /** Raiz do projeto-alvo (default: cwd/root). */
      target?: string;
      /** Regenera só páginas específicas (sub-agentes; undefined = site completo). */
      only?: string[];
      /** Força um seed determinístico (default: derivado dos artefatos pelo gerador). */
      seed?: string;
    };

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

export const HELP = `process-ai — installer + canal de runtime do framework (orquestrado pela skill Déa)

Uso:
  process-ai                                          # instala (interativo em TTY; headless c/ defaults em CI)
  process-ai install [--target <dir>] [--ide <id>] [--pack <id>] [--full] [--status]
  process-ai update [--target <dir>]                  # atualiza instalação existente
  process-ai uninstall [--target <dir>] [--purge]     # remove skills + manifest (--purge = todo .process-ai/)
  process-ai <subcomando> [flags]                     # canal de runtime (orquestrado pela skill Déa)
  process-ai --help | -h
  process-ai --version | -V

Install (usuário):
  install            instala skills em .claude/skills/ + .process-ai/config + .process-ai/install-manifest.toml.
                     Interativo quando TTY e sem flags; headless com --target/--ide/--pack/--full ou em CI.
  --target <dir>     diretório-alvo (default: cwd).
  --ide <id>         IDE alvo (v1: claude-code apenas; outras em breve).
  --pack <id>        method-pack ativo (default: bpmn-sipoc).
  --full             instala tudo, não-interativo (v1: sempre todas as skills).
  --status           mostra o estado da instalação (não escreve). (Veja também: status, p/ checkpoint runtime.)
  update             detecta instalação prévia e atualiza/repara (backup .bak de editados).
  uninstall          remove skills + manifest (preserva config/estado de sessão). --purge remove tudo.

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
  ingest --path <arquivo|diretório> [--agent <nome>]
      Ingere documentos (PDF/DOCX/PPTX) como artefatos reference-material.
      Chama scripts Python (scripts/ingest_<formato>.py) para converter cada
      documento (PDF/DOCX/PPTX/XLSX/CSV/XML) em markdown estruturado e commita via propose com claims 🟡
      automáticos de extração mecânica. --path aceita arquivo ou diretório
      (processa recursivamente). --agent default: "Laura".
      Formatos aceitos: .pdf, .docx, .pptx, .xlsx, .csv, .xml.
  render-flow --input <flow.md> [--output-dir <dir>] [--base-name <nome>]
      Renderiza o artefato flow (BPMN 2.0 XML canônico, Guilherme) como PNG + SVG
      via Playwright + bpmn-js. Resolve o renderizador pela raiz do pacote (funciona
      no install do consumidor, não depende de cwd). --input é o artefato flow
      (XML/JSON/markdown); --output-dir default _process-ai_output/flow; --base-name
      default derivado do input. Exige Playwright (npm i playwright); no Windows
      prefere o Edge do sistema (PA_BROWSER=msedge|chrome|chromium).
      Indisponível sem Playwright → exit 1 c/ msg pt-BR (o XML canônico fica salvo).
      Imprime o RenderResult (JSON: pngPath, svgPath, warnings).
  generate-site [--target <dir>] [--only <a,b,c>] [--seed <hex>]
      Gera o mini-site HTML interativo (Monique) a partir dos artefatos commitados.
      Resolve o gerador pela raiz do pacote (não depende de cwd). --target default
      cwd; --only regenera só páginas específicas (sub-agentes: index,
      fornecedores-clientes, hierarquia-3d, metricas, cronograma, glossario, deck,
      processos); --seed força um seed determinístico. Imprime o GenerateResult (JSON).

Pastas protegidas: escrita só em _process-ai_output/ (artefatos) e .process-ai/
(manifestos, checkpoint, WAL, ledger, provenance) — sempre via toolkit, nunca
direto pela skill ou pelo CLI.
`;

// ---- Helpers ----

/**
 * Compara dois caminhos pelo destino real (resolve symlinks/junctions e case
 * canônico do filesystem). [CR-hardening R2, 1.1] — robusto a symlink/case de
 * drive no Windows para o entry-guard. Se qualquer lado não resolve, retorna
 * false (espelha o `sameRealpath` do orquestrador).
 */
function sameRealpath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

/** Package root do framework (guard de self-install do subcomando `install`). */
const PACKAGE_ROOT = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Parser de flags puro (sem IO): suporta `--flag valor` e `--flag=valor`.
 * Rejeita flags desconhecidas, duplicadas e valores que parecem flag (no form
 * espaço, exige `=`). Erros acionáveis em pt-BR.
 */
function parseFlags(
  args: string[],
  allowed: string[],
  sub: string,
  booleanFlags: ReadonlySet<string> = new Set(),
): Map<string, string> {
  const allowedSet = new Set(allowed.map((a) => `--${a}`));
  const result = new Map<string, string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Boolean flags (sem valor): --full / --status / --purge — setam 'true' sem consumir o próximo arg.
    if (booleanFlags.has(arg)) {
      if (result.has(arg)) throw new Error(`Flag duplicada: ${arg}.`);
      result.set(arg, 'true');
      continue;
    }

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
  if (sub === '--version' || sub === '-V') return { kind: 'version' };

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
    case 'ingest': {
      const flags = parseFlags(rest, ['path', 'agent'], 'ingest');
      const ingestPath = requireFlag(flags, 'path', 'ingest');
      return { kind: 'ingest', path: ingestPath, agent: flags.get('--agent') };
    }
    case 'render-flow': {
      const flags = parseFlags(rest, ['input', 'output-dir', 'base-name'], 'render-flow');
      return {
        kind: 'render-flow',
        input: requireFlag(flags, 'input', 'render-flow'),
        outputDir: flags.get('--output-dir'),
        baseName: flags.get('--base-name'),
      };
    }
    case 'generate-site': {
      const flags = parseFlags(rest, ['target', 'only', 'seed'], 'generate-site');
      const onlyRaw = flags.get('--only');
      const only = onlyRaw
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        kind: 'generate-site',
        target: flags.get('--target'),
        only: only && only.length > 0 ? only : undefined,
        seed: flags.get('--seed'),
      };
    }
    case 'install': {
      // --target (default cwd), --ide (v1 só claude-code), --pack, --full, --status.
      // install NÃO é invocado pela skill (é entry do usuário) — fora dos subcomandos runtime.
      const flags = parseFlags(
        rest,
        ['target', 'ide', 'pack', 'full', 'status'],
        'install',
        new Set(['--full', '--status']),
      );
      const ide = flags.get('--ide');
      if (ide !== undefined && ide !== 'claude-code') {
        throw new Error(
          `IDE "${ide}" não suportada em v1 (apenas "claude-code"). Outras IDEs chegam em versões futuras.\n\n${HELP}`,
        );
      }
      return {
        kind: 'install',
        target: flags.get('--target'),
        ide,
        pack: flags.get('--pack'),
        full: flags.has('--full'),
        statusOnly: flags.has('--status'),
      };
    }
    case 'update': {
      const flags = parseFlags(rest, ['target', 'pack'], 'update');
      return { kind: 'update', target: flags.get('--target'), pack: flags.get('--pack') };
    }
    case 'uninstall': {
      const flags = parseFlags(rest, ['target', 'purge'], 'uninstall', new Set(['--purge']));
      return { kind: 'uninstall', target: flags.get('--target'), purge: flags.has('--purge') };
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

/**
 * Anexa `versionStatus` ao payload JSON de status/resume quando a versão em
 * execução está defasada (behind). Campo ausente caso contrário → saída
 * byte-idêntica à atual quando o framework está corrente. Isto põe o aviso de
 * versão defasada no canal (stdout estruturado) que os agentes capturam, em vez
 * do stderr (que o agente não repassa ao usuário final).
 */
function withVersionStatus<T extends object>(
  payload: T,
  updateInfo: UpdateCheckResult | null,
): T | (T & { versionStatus: UpdateCheckResult }) {
  if (!updateInfo || !updateInfo.behind) return payload;
  return { ...payload, versionStatus: updateInfo };
}

/**
 * Importa dinamicamente o renderizador BPMN. pathToFileURL é o formato canônico
 * para importação dinâmica de caminho absoluto (robusto em Windows). Rede
 * secundária: se a carga do Playwright falhar apesar do gate `ensureRenderDeps`,
 * traduz o erro cru para a mensagem pt-BR de indisponibilidade.
 */
async function loadRenderer(scriptPath: string, hint: string): Promise<{
  renderBpmn: (
    xml: string,
    outputDir: string,
    baseName: string,
  ) => Promise<{ pngPath: string; svgPath: string; warnings: string[] }>;
}> {
  try {
    return (await import(pathToFileURL(scriptPath).href)) as {
      renderBpmn: (
        xml: string,
        outputDir: string,
        baseName: string,
      ) => Promise<{ pngPath: string; svgPath: string; warnings: string[] }>;
    };
  } catch (e) {
    throw new Error(
      `Renderização indisponível — não foi possível carregar o Playwright. ${hint} ` +
        `Detalhe: ${(e as Error).message}`,
    );
  }
}

/**
 * Resolve o caminho de um script gerador (render/generate). [0.9.2]
 *
 * Prefere o `.js` COMPILADO em `dist/scripts/...` (produção): o pacote publicado
 * vive sob `node_modules/process-ai/`, e o Node 24 RECUSA type-strip de `.ts` sob
 * `node_modules` ("Stripping types is currently unsupported for files under
 * node_modules"). Cai para o `.ts` SOURCE em `scripts/...` apenas no dev (repo,
 * fora de `node_modules`, onde strip-only funciona). Os generators são compilados
 * pelo build (`tsconfig.build.json` + `bin/copy-assets.cjs`).
 */
function resolveGenScript(distPath: string, srcPath: string): string {
  return existsSync(distPath) ? distPath : srcPath;
}

// ---- dispatch (orquestração; o adapter é injetado — testável/mockável) ----

/**
 * Executa o comando parseado. Toda mutação passa pelo toolkit:
 *  - propose  → adapter.propose() (commit, único escritor; AD-1).
 *  - gate     → checkpointAdvance com intent `gate` (apply no-op, atômico via WAL; AD-4).
 *  - stage    → checkpointAdvance com intent `stage-advance` (apply no-op; AD-4).
 *  - resume   → resume(root) (replay de WAL + quarentena de órfãos; AD-4). Anexa versionStatus se defasado.
 *  - report   → reportConfidence(root) (lê o ledger; AD-5).
 *  - status   → checkpointRead(root) (leitura pura). Anexa versionStatus se defasado.
 *
 * @param cmd - Comando parseado.
 * @param adapter - Porta EngineAdapter (composition root o instancia).
 * @param root - Raiz da sessão (projeto-alvo).
 * @param installer - Instalador (DI; default cria um novo).
 * @param updateInfo - Resultado de checkForUpdate (null se pulso/indeterminado); anexa versionStatus a status/resume quando behind.
 * @returns DispatchResult com a saída canônica a imprimir.
 */
export async function dispatch(
  cmd: ParsedCommand,
  adapter: EngineAdapter,
  root: string,
  installer: Installer = new Installer(new ClaudeCodeIdeSetup()),
  updateInfo: UpdateCheckResult | null = null,
): Promise<DispatchResult> {
  switch (cmd.kind) {
    case 'help':
      return { ok: true, output: HELP };

    case 'version':
      return { ok: true, output: getFrameworkVersion() };

    case 'install': {
      // Bare `process-ai` ou `process-ai install [flags]` → install no projeto-alvo
      // via orquestrador (Installer). Self-install guard fica no Installer.
      if (cmd.statusOnly) {
        const { state } = await installer.status(path.resolve(cmd.target ?? root));
        return { ok: true, output: formatInstallState(state) };
      }
      const outcome = await installer.install({
        targetDir: cmd.target ?? root,
        activePack: cmd.pack,
        interactive: false,
      });
      return { ok: true, output: formatOutcome(outcome) };
    }
    case 'update': {
      const outcome = await installer.update({
        targetDir: cmd.target ?? root,
        activePack: cmd.pack,
      });
      return { ok: true, output: formatOutcome(outcome) };
    }
    case 'uninstall': {
      const outcome = await installer.uninstall({
        targetDir: cmd.target ?? root,
        purge: cmd.purge,
      });
      return { ok: true, output: formatOutcome(outcome) };
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
      return { ok: true, output: JSON.stringify(withVersionStatus(result, updateInfo)) };
    }

    case 'report': {
      const report = await reportConfidence(root);
      return { ok: true, output: formatConfidenceReport(report) };
    }

    case 'status': {
      const state = await checkpointRead(root);
      return { ok: true, output: JSON.stringify(withVersionStatus(state, updateInfo)) };
    }

    case 'ingest': {
      const results = await ingest({
        path: cmd.path,
        adapter,
        root,
        agent: cmd.agent,
      });
      const output = results.map((r) => ({
        file: r.filePath.split(path.sep).join('/'),
        format: r.format,
        sha256: r.commit.sha256,
        artifactPath: r.commit.artifactPath.split(path.sep).join('/'),
        manifestPath: r.commit.manifestPath.split(path.sep).join('/'),
      }));
      return { ok: true, output: JSON.stringify(output) };
    }

    case 'render-flow': {
      // Resolve o renderizador pela raiz do PACOTE (path absoluto — funciona no
      // install do consumidor, NÃO depende de cwd). Espelha resolveScriptsDir do
      // ingest.ts. Prefere o .js compilado em dist/scripts/ (Node recusa strip de
      // .ts sob node_modules); cai p/ o .ts source só em dev — ver resolveGenScript.
      if (!PACKAGE_ROOT) {
        throw new Error(
          'Não foi possível localizar a raiz do framework (package.json do process-ai). ' +
            'Reinstale o módulo: npm install process-ai@latest',
        );
      }
      const renderScriptPath = resolveGenScript(
        path.join(PACKAGE_ROOT, 'dist', 'scripts', 'bpmn-renderer', 'render.js'),
        path.join(PACKAGE_ROOT, 'scripts', 'bpmn-renderer', 'render.ts'),
      );

      // Gate de runtime: Playwright + navegador usável? (O install avisou; aqui é
      // hard gate → 🔴 honesto se ausente. O XML canônico segue salvo — AD-6.)
      const renderDeps = ensureRenderDeps();
      if (!renderDeps.available) {
        throw new Error(renderDeps.message);
      }

      // Lê o artefato `flow` (XML puro, JSON {body} ou markdown c/ code block — o
      // renderizador normaliza os três).
      const inputPath = path.resolve(cmd.input);
      let bpmnContent: string;
      try {
        bpmnContent = await fs.readFile(inputPath, 'utf8');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`Artefato de fluxo não encontrado: ${inputPath}.`);
        }
        throw e;
      }

      const outputDir = path.resolve(cmd.outputDir ?? path.join(root, '_process-ai_output', 'flow'));
      const baseName = cmd.baseName ?? path.basename(inputPath, path.extname(inputPath));

      // Importa dinamicamente o renderizador (rede secundária: se a carga do
      // Playwright falhar apesar do gate, traduz p/ msg pt-BR de indisponibilidade).
      const renderMod = await loadRenderer(renderScriptPath, renderDeps.message);
      const result = await renderMod.renderBpmn(bpmnContent, outputDir, baseName);
      return { ok: true, output: JSON.stringify(result) };
    }

    case 'generate-site': {
      // Resolve o gerador pela raiz do PACOTE (path absoluto — funciona no install
      // do consumidor). O gerador é puro node:* (sem runtime externo) — sem gate.
      if (!PACKAGE_ROOT) {
        throw new Error(
          'Não foi possível localizar a raiz do framework (package.json do process-ai). ' +
            'Reinstale o módulo: npm install process-ai@latest',
        );
      }
      const genScriptPath = resolveGenScript(
        path.join(PACKAGE_ROOT, 'dist', 'scripts', 'docs-site', 'generate.js'),
        path.join(PACKAGE_ROOT, 'scripts', 'docs-site', 'generate.ts'),
      );
      const siteRoot = path.resolve(cmd.target ?? root);

      const genMod = (await import(pathToFileURL(genScriptPath).href)) as {
        generateDocs: (opts: {
          root: string;
          only?: string[];
          seed?: string;
        }) => Promise<unknown>;
      };
      const result = await genMod.generateDocs({
        root: siteRoot,
        only: cmd.only,
        seed: cmd.seed,
      });
      return { ok: true, output: JSON.stringify(result) };
    }
  }
}

/** Formata o estado da instalação (install --status) em texto pt-BR. */
function formatInstallState(state: InstallState): string {
  switch (state.kind) {
    case 'clean':
      return `ℹ Nenhuma instalação do process-ai detectada neste diretório.\n`;
    case 'installed-current':
      return `✓ process-ai instalado e atualizado (v${state.manifest.install.framework_version}, IDE: ${state.manifest.install.ide}, ${state.manifest.files.length} arquivo(s)).\n`;
    case 'installed-modified':
      return `⚠ Instalado mas MODIFICADO — ${state.report.modified.length} modificado(s), ${state.report.missing.length} ausente(s). Rode \`process-ai update\` para reparar.\n`;
    case 'installed-stale':
      return `⚠ Instalado (v${state.manifestVersion}) mas o framework está em v${state.currentVersion}. Rode \`process-ai update\`.\n`;
  }
}

/** Decide se o install roda interativo: TTY e nenhuma flag de install informada. */
function isInteractive(cmd: Extract<ParsedCommand, { kind: 'install' }>): boolean {
  return process.stdout.isTTY === true && !cmd.target && !cmd.ide && !cmd.pack && !cmd.full;
}

/** Roda os prompts interativos e devolve o comando install resolvido (headless). */
async function runInteractive(
  cmd: Extract<ParsedCommand, { kind: 'install' }>,
  root: string,
): Promise<Extract<ParsedCommand, { kind: 'install' }>> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    let resolved;
    try {
      resolved = await gatherInstallOptions(rl, {
        targetDir: cmd.target ?? root,
        ide: cmd.ide ?? 'claude-code',
        activePack: cmd.pack ?? 'bpmn-sipoc',
        full: cmd.full ?? true,
      });
    } catch {
      // EOF / stdin fechado (Ctrl+D, pipe cerrado) — rejeição do readline vira
      // mensagem acionável em vez de stack cru.
      throw new Error(
        'Entrada interativa encerrada (EOF/stdin fechado). Rode `process-ai install --target <dir>` para instalar sem prompts.',
      );
    }
    return {
      kind: 'install',
      target: resolved.targetDir,
      ide: resolved.ide,
      pack: resolved.activePack,
      full: resolved.full,
    };
  } finally {
    rl.close();
  }
}

// ---- main (composition root + impressão + tratamento de erro) ----

export interface MainOptions {
  /** Raiz da sessão / projeto-alvo (default = process.cwd()). */
  cwd?: string;
  /** Override da verificação de update (testes injetam stub; prod omite → check real no registro). */
  updateCheck?: () => Promise<UpdateCheckResult | null>;
}

/**
 * Verificação não-bloqueante de global defasado (warn-only). Compara a versão em
 * execução contra o `latest` do registro npm (cache 24h) e, se atrás, emite um
 * aviso pt-BR no STDERR. Fail-soft absoluto: qualquer erro é silenciado (nunca
 * alcança o entry-guard). Pula com `PROCESS_AI_SKIP_UPDATE_CHECK=1`, em CI, e
 * para `--version`/`--help`. `opts.updateCheck` é o seam de teste (stub).
 *
 * Retorna o resultado (ou null) para que `dispatch` o anexe ao JSON de
 * status/resume — o aviso também precisa chegar ao usuário via stdout
 * estruturado, não só via stderr (que agentes não repassam).
 */
async function runUpdateCheckSafely(cmd: ParsedCommand, opts: MainOptions): Promise<UpdateCheckResult | null> {
  if (process.env.PROCESS_AI_SKIP_UPDATE_CHECK === '1') return null;
  if (process.env.CI) return null;
  if (cmd.kind === 'version' || cmd.kind === 'help') return null;
  try {
    const result = opts.updateCheck ? await opts.updateCheck() : await checkForUpdate(defaultDeps());
    if (result?.behind) {
      process.stderr.write(formatUpdateWarning(result.local, result.latest));
    }
    return result ?? null;
  } catch {
    // fail-soft: nunca propaga para o catch do entry-guard
    return null;
  }
}

/**
 * Composition root: resolve a raiz, instancia o adapter (porta runtime) + o
 * Installer (porta install, concrete ClaudeCodeIdeSetup), e despacha. Install é
 * interativo quando TTY e sem flags (modelo BMAD); demais comandos são headless.
 * Tratamento de erro (stderr + exit 1) fica no entry-point guard.
 */
export async function main(argv: string[], opts: MainOptions = {}): Promise<void> {
  const root = path.resolve(opts.cwd ?? process.cwd());
  let cmd = parseArgs(argv);
  // AD-3: runtime depende da porta; ClaudeCodeAdapter é instanciado aqui.
  const adapter: EngineAdapter = new ClaudeCodeAdapter({ cwd: root });

  const updateInfo = await runUpdateCheckSafely(cmd, opts);

  // install interativo quando TTY e sem flags de install.
  if (cmd.kind === 'install' && !cmd.statusOnly && isInteractive(cmd)) {
    cmd = await runInteractive(cmd, root);
  }

  const installer = new Installer(new ClaudeCodeIdeSetup());
  const result = await dispatch(cmd, adapter, root, installer, updateInfo);
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
