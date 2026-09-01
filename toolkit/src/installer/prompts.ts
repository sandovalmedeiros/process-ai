/**
 * toolkit/src/installer/prompts.ts — prompts do install interativo (v2, paridade Reversa).
 *
 * Seis perguntas pt-BR no ritmo do Reversa (`lib/installer/prompts.js`):
 *  1. Engines de apoio — checkbox raw-mode (interact.ts), todas as engines
 *     marcáveis (v1: Claude Code padrão; demais registradas p/ quando houver adapter);
 *  2. Nome do projeto (default: basename do cwd);
 *  3. Como os agentes devem te chamar?;
 *  4. Idioma das interações com agentes (default: pt-br);
 *  5. Idioma dos documentos gerados (default: Português);
 *  6. Como tratar artefatos no git? (commit | gitignore — select numérico).
 *
 * Sem perguntas de diretório (install interativo = cwd, como o Reversa;
 * `--target` fica para headless), de method-pack (default bpmn-sipoc; flag
 * headless) nem de "quais skills" (v1 instala todas sempre).
 *
 * Transição readline×raw-mode (P10 da validação): o checkbox roda com NENHUM
 * `readline.Interface` vivo (senão o rl disputa os keypresses do stdin) — por
 * isso `makeRl` é FACTORY, chamada só depois do widget fechar o raw mode. A
 * pergunta 6 usa o select numérico do readline (uma única superfície raw-mode
 * por execução; widget `select` com setas fica para v1.1).
 *
 * O GATE de interatividade (TTY vs headless) fica no caller (`bin/process-ai.ts`
 * via `process.stdout.isTTY`), não aqui — este módulo só sabe perguntar.
 *
 * AD-3 / import-boundary: só `node:*` (path) + relativos ./banner.ts,
 * ./interact.ts, ./engines.ts. Nenhum import de adapter.
 */
import path from 'node:path';
import { theme } from './banner.ts';
import { checkbox } from './interact.ts';
import type { KeySource, WidgetStream } from './interact.ts';
import type { DetectedEngine } from './engines.ts';

/** Interface mínima para perguntar texto (duck-typed — `readline.Interface` a satisfaz). */
export interface PromptRl {
  question(query: string): Promise<string>;
  close(): void;
}

/** Defaults derivados do contexto pelo caller. */
export interface PromptDefaults {
  projectName: string;
  chatLanguage: string;
  docLanguage: string;
}

/** Dependências do fluxo (fábricas + detecção + saída — tudo injetável p/ teste). */
export interface GatherDeps {
  /** Factory de readline — chamada APÓS o checkbox (raw e rl nunca convivem). */
  makeRl(): PromptRl;
  /** Factory de KeySource — uma sessão raw por widget. */
  keys(): KeySource;
  out?: WidgetStream;
  engines: readonly DetectedEngine[];
  defaults: PromptDefaults;
}

/** Respostas do install interativo (persistidas como `InstallPrefs`). */
export interface InstallAnswers {
  /** Engines marcadas no checkbox (todas as selecionadas pelo usuário). */
  engines: string[];
  projectName: string;
  userName: string;
  chatLanguage: string;
  docLanguage: string;
  gitStrategy: 'commit' | 'gitignore';
}

/** Sequência completa dos prompts do install interativo. */
export async function gatherInstallAnswers(deps: GatherDeps): Promise<InstallAnswers> {
  const t = theme();

  // 1. Engines de apoio — checkbox raw-mode (nenhum rl vivo neste momento).
  // Todas as engines são marcáveis (sem gating "(em breve)"): as sem adapter
  // são persistidas em config.user e instalam quando o adapter chegar — nada
  // promete instalação que não existe (honestidade do framework).
  const choices = deps.engines.map((e) => ({
    value: e.id,
    label: e.name,
    // default: Claude Code (única supported) sempre pré-marcada; demais livres.
    checked: e.supported,
  }));
  const engines = await checkbox(t.cyan('\n1. Engines de apoio'), choices, {
    keys: deps.keys(),
    stream: deps.out,
  });

  // Nota pós-checkbox quando há engines sem adapter (persistidas, não instaladas).
  const registered = deps.engines.filter((e) => !e.supported && engines.includes(e.id));
  if (registered.length > 0) {
    const names = registered.map((r) => r.name).join(', ');
    const plural = registered.length > 1;
    (deps.out ?? process.stdout).write(
      t.gray(
        `  (${names} ${plural ? 'ficam' : 'fica'} no config.user e ${plural ? 'instalam' : 'instala'} quando o adapter chegar)\n`,
      ),
    );
  }

  // 2-6 — perguntas de texto/seleção via readline (raw mode já fechado).
  const rl = deps.makeRl();
  try {
    const projectNameRaw = await askInput(rl, t.cyan('2. Nome do projeto'), deps.defaults.projectName);
    const projectName = projectNameRaw.trim();
    if (!projectName) throw new Error('Nome do projeto não pode ser vazio.');

    const userNameRaw = await askInput(rl, t.cyan('3. Como os agentes devem te chamar'), '');
    const userName = userNameRaw.trim();
    if (!userName) throw new Error('Informe como os agentes devem te chamar (não pode ser vazio).');

    const chatLanguage = await askInput(rl, t.cyan('4. Idioma das interações com agentes'), deps.defaults.chatLanguage);
    const docLanguage = await askInput(rl, t.cyan('5. Idioma dos documentos gerados'), deps.defaults.docLanguage);
    const gitStrategy = await askSelect(
      rl,
      t.cyan('6. Como tratar artefatos no git?'),
      [
        { value: 'commit', label: 'Commitar com o projeto (recomendado p/ times)' },
        { value: 'gitignore', label: 'Adicionar ao .gitignore (uso pessoal)' },
      ],
      'commit',
    );

    return {
      engines,
      projectName,
      userName,
      chatLanguage: chatLanguage.trim(),
      docLanguage: docLanguage.trim(),
      gitStrategy: gitStrategy as 'commit' | 'gitignore',
    };
  } finally {
    rl.close();
  }
}

/** Nome default do projeto (basename do diretório-alvo). */
export function defaultProjectName(targetDir: string): string {
  return path.basename(path.resolve(targetDir));
}

/** Prompt de texto livre com default (ENTER aceita o default). */
async function askInput(rl: PromptRl, question: string, def: string): Promise<string> {
  const suffix = def === '' ? ': ' : ` [${def}]: `;
  const answer = (await rl.question(`${question}${suffix}`)).trim();
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
