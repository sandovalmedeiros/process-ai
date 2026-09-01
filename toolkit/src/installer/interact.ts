/**
 * toolkit/src/installer/interact.ts — checkbox raw-mode zero-dep (paridade inquirer).
 *
 * Widget multi-select da pergunta 1 do install (engines), com o feel do
 * inquirer do Reversa SEM dependência: navegação ↑/↓ (pula desabilitadas, sem
 * wrap), <espaço> alterna, <a> alterna todas as habilitadas, <i> inverte as
 * habilitadas, <enter> confirma (exige ≥1 marcada). Redraw por keypress com
 * sequências VT level-0 (`\r`, `\x1b[<n>A`, `\x1b[J`, `\x1b[2K`) — mesma classe
 * de risco que banner.ts já assume; linhas truncadas a `columns-1` para o
 * line-wrap do terminal não desalinhar a contagem de rows do redraw.
 *
 * Raw mode: `setRawMode(true)` remove ECHO e o PROCESSD_INPUT do Ctrl+C — o
 * ^C chega como keypress `{ctrl, name:'c'}` (não SIGINT) e o restore manual no
 * `finally` do gerador de `keysFromStdin` é inegociável em TODOS os paths
 * (enter, cancel, EOF, exceção). O widget NUNCA chama `process.exit` —
 * cancelamento é `CancelledInstallError` para o caller decidir.
 *
 * KeySource = async generator: o `for await` do widget chama `.return()` do
 * gerador em break/throw/return (garantia da spec), executando o `finally`
 * que remove listeners e pausa o stdin — sem leak em nenhum caminho.
 *
 * AD-3 / import-boundary: só `node:readline` + relativo ./banner.ts.
 */
import readline from 'node:readline';
import { theme } from './banner.ts';

/** Keypress normalizado consumido pelos widgets. */
export interface KeyPress {
  readonly name: string;
  readonly ctrl?: boolean;
}

/** Fonte de keys — async generator (produção: `keysFromStdin`; testes: script). */
export type KeySource = AsyncGenerator<KeyPress, void, void>;

/** Cancelamento explícito do usuário (Ctrl+C) — o caller imprime e sai limpo. */
export class CancelledInstallError extends Error {
  constructor() {
    super('Instalação cancelada.');
    this.name = 'CancelledInstallError';
  }
}

/** Opção do checkbox. */
export interface CheckboxChoice {
  readonly value: string;
  readonly label: string;
  readonly checked?: boolean;
  /** Não-marcável e pulada pela navegação (ex.: engines "(em breve)"). */
  readonly disabled?: boolean;
}

/** Stream de saída do widget (default: process.stdout; testes injetam fake). */
export interface WidgetStream {
  write(s: string): boolean;
}

export interface CheckboxOpts {
  readonly keys: KeySource;
  readonly stream?: WidgetStream;
  /** Largura p/ truncagem (default: process.stdout.columns ?? 80). */
  readonly columns?: number;
  readonly theme?: ReturnType<typeof theme>;
}

/**
 * Ponte stdin→KeySource: keypress events num async generator, com o CICLO DE
 * VIDA do raw mode atado ao source — liga na criação, restaura no `finally`
 * do gerador (executado pelo `.return()` do for-await em qualquer saída do
 * widget: enter, cancel, EOF, throw) junto com a remoção dos listeners e o
 * `pause()`. Stdin sem `setRawMode` (não-TTY) → erro acionável pt-BR (o gate
 * de interatividade do bin deveria impedir chegar aqui).
 */
export function keysFromStdin(
  input: NodeJS.ReadStream = process.stdin,
): KeySource {
  // bind() neutraliza o `this: ReadStream` do método — vira fn pura.
  const maybe = (input as { setRawMode?: (mode: boolean) => void }).setRawMode?.bind(input);
  if (maybe === undefined) {
    throw new Error(
      'Entrada interativa indisponível (stdin não é TTY). Rode `process-ai install --target <dir>` para instalar sem prompts.',
    );
  }
  const setRawMode = maybe;
  const prevRaw = input.isRaw === true;
  setRawMode(true);

  const queue: KeyPress[] = [];
  let resolveNext: ((k: KeyPress | null) => void) | undefined;
  let closed = false;

  const onKey = (s: unknown, key?: readline.Key): void => {
    const kp = normalizeKeyPress(key, typeof s === 'string' ? s : '');
    if (!kp) return;
    if (resolveNext !== undefined) {
      const r = resolveNext;
      resolveNext = undefined;
      r(kp);
    } else {
      queue.push(kp);
    }
  };
  const onClose = (): void => {
    closed = true;
    if (resolveNext !== undefined) {
      const r = resolveNext;
      resolveNext = undefined;
      r(null);
    }
  };

  readline.emitKeypressEvents(input);
  input.on('keypress', onKey as never);
  input.on('close', onClose);

  async function* gen(): KeySource {
    try {
      while (true) {
        const queued = queue.shift();
        if (queued !== undefined) {
          yield queued;
          continue;
        }
        if (closed) return;
        const k = await new Promise<KeyPress | null>((resolve) => {
          resolveNext = resolve;
        });
        if (k === null) return;
        yield k;
      }
    } finally {
      input.removeListener('keypress', onKey as never);
      input.removeListener('close', onClose);
      input.pause();
      setRawMode(prevRaw);
    }
  }
  return gen();
}

/** Normaliza o keypress do node para {name, ctrl} (espaço/enter/letras/setas/^C). */
function normalizeKeyPress(key: readline.Key | undefined, str: string): KeyPress | null {
  if (key !== undefined && typeof key.name === 'string' && key.name !== '') {
    return { name: key.name, ctrl: key.ctrl === true };
  }
  if (str === ' ') return { name: 'space' };
  if (str.length === 1) return { name: str };
  return null;
}

/** Trunca a `width - 1` colunas (line-wrap quebraria o redraw por rows). */
function truncLine(line: string, width: number): string {
  const max = Math.max(8, width - 1);
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

/**
 * Checkbox multi-select. Renderiza [título, dica, …choices]; ao confirmar,
 * colapsa para [título, resposta] + newline (paridade inquirer: a lista some,
 * fica o resumo da escolha). Retorna os `value` marcados.
 */
export async function checkbox(
  title: string,
  choices: readonly CheckboxChoice[],
  opts: CheckboxOpts,
): Promise<string[]> {
  const out = opts.stream ?? process.stdout;
  const width = opts.columns ?? process.stdout.columns ?? 80;
  const t = opts.theme ?? theme();

  const selected = choices.map((c) => c.checked === true && c.disabled !== true);
  const enabledIdx = choices.map((c, i) => (c.disabled === true ? -1 : i)).filter((i) => i >= 0);
  if (enabledIdx.length === 0) throw new Error('Checkbox sem opções habilitadas.');
  let cursor = enabledIdx[0] ?? 0;

  const render = (): string[] => {
    const lines = [title, t.gray('(espaço)=selecionar · (a)=todas · (i)=inverter · (enter)=confirmar')];
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      const marker = c.disabled === true ? t.gray('○') : selected[i] ? t.cyan('◉') : '○';
      const pointer = i === cursor ? t.cyan('❯') : ' ';
      const label = c.disabled === true ? t.gray(c.label) : c.label;
      lines.push(truncLine(`${pointer} ${marker} ${label}`, width));
    }
    return lines;
  };

  const paint = (lines: string[], prevCount: number, finalNewline = false): void => {
    let prefix = '';
    if (prevCount > 0) {
      prefix = prevCount === 1 ? '\r\x1b[2K' : `\r\x1b[${prevCount - 1}A\x1b[J`;
    }
    out.write(`${prefix}${lines.join('\n')}${finalNewline ? '\n' : ''}`);
  };

  let prev = 0;
  let frame = render();
  paint(frame, prev);
  prev = frame.length;
  let closedWithNewline = false;

  try {
    for await (const key of opts.keys) {
      let repaint = false;
      if (key.ctrl === true && (key.name === 'c' || key.name === 'C')) {
        throw new CancelledInstallError();
      }
      switch (key.name) {
        case 'up': {
          const pos = enabledIdx.indexOf(cursor);
          const next = pos > 0 ? enabledIdx[pos - 1] : undefined;
          if (next !== undefined) {
            cursor = next;
            repaint = true;
          }
          break;
        }
        case 'down': {
          const pos = enabledIdx.indexOf(cursor);
          const next = pos >= 0 && pos < enabledIdx.length - 1 ? enabledIdx[pos + 1] : undefined;
          if (next !== undefined) {
            cursor = next;
            repaint = true;
          }
          break;
        }
        case 'space': {
          if (choices[cursor]?.disabled !== true) {
            selected[cursor] = !selected[cursor];
            repaint = true;
          }
          break;
        }
        case 'a': {
          // toggle-all (inquirer): todas ON, ou todas OFF se já todas marcadas.
          const allOn = enabledIdx.every((i) => selected[i]);
          for (const i of enabledIdx) selected[i] = !allOn;
          repaint = true;
          break;
        }
        case 'i': {
          for (const i of enabledIdx) selected[i] = !selected[i];
          repaint = true;
          break;
        }
        case 'return': {
          const values = choices.filter((_, i) => selected[i]).map((c) => c.value);
          if (values.length === 0) break; // exige ≥1 — enter é no-op com nada marcado
          const labels = choices.filter((_, i) => selected[i]).map((c) => c.label);
          paint([title, truncLine(` ${labels.join(', ')}`, width)], prev, true);
          closedWithNewline = true;
          return values;
        }
        default:
          break;
      }
      if (repaint) {
        frame = render();
        paint(frame, prev);
        prev = frame.length;
      }
    }
    // Generator esgotado = stdin fechado (EOF) — erro acionável, mesmo wording
    // do EOF de runInteractive.
    throw new Error(
      'Entrada interativa encerrada (EOF/stdin fechado). Rode `process-ai install --target <dir>` para instalar sem prompts.',
    );
  } finally {
    // Garante cursor em linha nova mesmo em paths de erro (cancel/EOF/throw).
    if (!closedWithNewline) out.write('\n');
  }
}
