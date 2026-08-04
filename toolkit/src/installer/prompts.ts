/**
 * toolkit/src/installer/prompts.ts — prompts interativos de install (TTY-gated).
 *
 * Equivalente do `promptInstallation()` do BMAD, mas com `node:readline/promises`
 * (zero deps) e injetável: `gatherInstallOptions(rl, defaults)` recebe um objeto
 * duck-typed (`PromptRl`) — em produção é um `readline.Interface`; em teste é um
 * fake que devolve respostas canned. Assim o caminho de prompts é testável sem TTY.
 *
 * O GATE de interatividade (TTY vs headless) fica no caller (`bin/process-ai.ts`
 * via `process.stdout.isTTY`), não aqui — este módulo só sabe perguntar.
 *
 * v1: choices únicas (1 IDE, 1 pack) — a estrutura (select/confirm) suporta
 * expansão futura sem mudar a assinatura.
 *
 * AD-3 / import-boundary: só `node:*` (path). Nenhum import de adapter.
 */
import path from 'node:path';

/** Interface mínima para perguntar (duck-typed — `readline.Interface` a satisfaz). */
export interface PromptRl {
  question(query: string): Promise<string>;
  close(): void;
}

/** Defaults dos prompts (derivados do contexto pelo caller). */
export interface PromptDefaults {
  targetDir: string;
  ide: string;
  activePack: string;
  full: boolean;
}

/** Opções resolvidas pelos prompts (entradas do `InstallRequest`). */
export interface ResolvedOptions {
  targetDir: string;
  ide: string;
  activePack: string;
  full: boolean;
}

/** Sequência de prompts do install interativo. */
export async function gatherInstallOptions(
  rl: PromptRl,
  defaults: PromptDefaults,
): Promise<ResolvedOptions> {
  const targetDirRaw = await askInput(rl, 'Diretório-alvo?', defaults.targetDir);
  const targetDir = targetDirRaw.trim();
  if (!targetDir) throw new Error('Diretório-alvo não pode ser vazio.');

  const ide = await askSelect(
    rl,
    'IDE?',
    [{ value: 'claude-code', label: 'Claude Code (outras IDEs em breve)' }],
    defaults.ide,
  );
  const activePack = await askSelect(
    rl,
    'Method-pack ativo?',
    [{ value: 'bpmn-sipoc', label: 'bpmn-sipoc (pack padrão v1)' }],
    defaults.activePack,
  );
  const full = await askConfirm(
    rl,
    'Instalar condutor (/process-ai) + 4 especialistas?',
    defaults.full,
  );

  return { targetDir: path.resolve(targetDir), ide, activePack, full };
}

/** Prompt de texto livre com default (ENTER aceita o default). */
async function askInput(rl: PromptRl, question: string, def: string): Promise<string> {
  const answer = (await rl.question(`${question} [${def}]: `)).trim();
  return answer === '' ? def : answer;
}

/** Prompt de seleção por número (ENTER aceita o default). */
async function askSelect(
  rl: PromptRl,
  question: string,
  choices: Array<{ value: string; label: string }>,
  defaultValue: string,
): Promise<string> {
  const lines = choices.map((c, i) => `  ${i + 1}. ${c.label}`);
  const defaultIdx = Math.max(
    0,
    choices.findIndex((c) => c.value === defaultValue),
  );
  const prompt = `${question}\n${lines.join('\n')} [${defaultIdx + 1}]: `;
  const answer = (await rl.question(prompt)).trim();
  if (answer === '') return choices[defaultIdx].value;
  const n = Number.parseInt(answer, 10);
  if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1].value;
  return choices[defaultIdx].value; // inválido → default
}

/** Prompt sim/não (ENTER aceita o default). */
async function askConfirm(rl: PromptRl, question: string, def: boolean): Promise<boolean> {
  const answer = (await rl.question(`${question} (y/n) [${def ? 'y' : 'n'}]: `)).trim().toLowerCase();
  if (answer === '') return def;
  return answer === 'y' || answer === 'yes' || answer === 's' || answer === 'sim';
}
