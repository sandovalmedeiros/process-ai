/**
 * toolkit/src/installer/banner.ts — kit ANSI cru do install: banner, tema ciano, spinner.
 *
 * Paridade visual com o installer do Reversa (github.com/sandeco/reversa) — logo
 * figlet + assinatura (`lib/utils/banner.js`), spinner + resumo colorido
 * (`lib/commands/install.js`) — reimplementado ZERO-dep: chalk.hex ≡
 * `\x1b[38;2;R;G;Bm`, ora ≡ frames braille + setInterval. Logo em ciano
 * `#22d3ee` (o Reversa usa laranja `#ffa203` — mesma técnica, cor da marca).
 *
 * AD-3 / import-boundary: NENHUM import — só globals (`process.env`,
 * `process.stdout`, `setInterval`), logo este módulo não pode violar a allowlist.
 *
 * Gates (subset chalk/supports-color + no-color.org), lidos A CADA chamada —
 * namespaces ESM não são mockáveis pelo node:test (ver update-check.ts:56-59),
 * então deps são injetáveis e o env é relido por chamada:
 *  - `NO_COLOR` não-vazio → cores off (vence tudo);
 *  - `FORCE_COLOR` ∉ {0,false} → cores on mesmo em pipe (demo / `less -R`);
 *  - `TERM=dumb` / `CI` truthy / stdout não-TTY → off (reversível por FORCE_COLOR);
 *  - spinner e clear-screen exigem isTTY REAL — `\r`/`\x1b[2J` em saída
 *    capturada (pipe, log de CI) é lixo; FORCE_COLOR NÃO os liga.
 *
 * Escopo de uso: caminhos de USUÁRIO (help, install interativo, resumo do
 * install/update). Subcomandos runtime (propose/status/report/…) emitem JSON
 * consumido por agentes e NUNCA passam por aqui (ver bin/process-ai.ts main()).
 */

/** Dependências injetáveis (padrão DI do repo; default = process.*). */
export interface BannerDeps {
  env?: NodeJS.ProcessEnv;
  stream?: { isTTY?: boolean };
}

/** Tema do installer (identidade quando cores desligadas). */
export interface BannerTheme {
  cyan(text: string): string;
  gray(text: string): string;
  white(text: string): string;
  bold(text: string): string;
}

/** Stream mínimo p/ escrever (spinner/clear — `process.stdout` a satisfaz). */
export interface SpinnerStream {
  write(chunk: string): boolean;
  isTTY?: boolean;
}

/** Spinner de progresso (inerte fora de TTY real — ver createSpinner). */
export interface Spinner {
  /** true enquanto gira (spinner inerte é sempre false). */
  readonly active: boolean;
  start(): void;
  succeed(message: string): void;
  stop(): void;
}

/** Cor da marca do banner (cyan-400; paridade de técnica com o hex do Reversa). */
export const CYAN_HEX = '#22d3ee';

/**
 * Logo figlet Standard "process-ai" — literal gerado dev-time com
 * `npx --yes figlet -f Standard -w 200 "process-ai"` (modo default = smushed,
 * 50 col; mesmas linhagens de glifos do banner do Reversa para todas as letras
 * desta palavra). Não reformatar à mão — regenerar com o comando acima.
 */
export const LOGO_LINES: readonly string[] = [
  '                                                _',
  '  _ __  _ __ ___   ___ ___  ___ ___        __ _(_)',
  " | '_ \\| '__/ _ \\ / __/ _ \\/ __/ __|_____ / _` | |",
  ' | |_) | | | (_) | (_|  __/\\__ \\__ \\_____| (_| | |',
  ' | .__/|_|  \\___/ \\___\\___||___/___/      \\__,_|_|',
  ' |_|',
];

/** Assinatura exibida ao lado da última linha do logo (package.json "author"). */
const AUTHOR = 'Sandoval Medeiros';

const TAGLINE = 'framework de mapeamento de processos com confiança verificável';

/** Espaço entre o logo e a assinatura (padrão SIGNATURE_MARGIN do Reversa). */
const SIGNATURE_MARGIN = 3;

const SPINNER_FRAMES: readonly string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Timer que pode (ou não) expor `unref` — NodeJS.Timeout expõe; portabilidade custa nada. */
type MaybeUnrefable = { unref?: () => void };

/** True se a env força cores (`FORCE_COLOR` ∈ {set, ≠ '0', ≠ 'false'} — '' conta como on, como no supports-color). */
function envForcesColor(env: NodeJS.ProcessEnv): boolean {
  return env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false';
}

/** True se a env trava cores (`NO_COLOR` não-vazio vence tudo — spec no-color.org). */
function envBlocksColor(env: NodeJS.ProcessEnv): boolean {
  return env.NO_COLOR !== undefined && env.NO_COLOR !== '';
}

/**
 * Gate de cor, lido a cada chamada. Ordem: NO_COLOR > FORCE_COLOR > TERM=dumb >
 * não-TTY > CI truthy. `NO_COLOR=''` (vazio) NÃO desliga (semântica no-color.org).
 */
export function useColor(deps: BannerDeps = {}): boolean {
  const env = deps.env ?? process.env;
  const isTty = (deps.stream ?? process.stdout).isTTY === true;
  if (envBlocksColor(env)) return false;
  if (envForcesColor(env)) return true;
  if (env.TERM === 'dumb') return false;
  if (!isTty) return false;
  if (env.CI !== undefined && env.CI !== '' && env.CI !== '0' && env.CI !== 'false') return false;
  return true;
}

/**
 * Gate do banner: TTY real OU cores forçadas (FORCE_COLOR em pipe mostra o
 * banner colorido sem limpar a tela — útil p/ demo/`less -R`). `NO_COLOR`
 * desliga o banner por completo (saída limpa p/ scripts).
 */
export function useBanner(deps: BannerDeps = {}): boolean {
  const env = deps.env ?? process.env;
  if (envBlocksColor(env)) return false;
  const isTty = (deps.stream ?? process.stdout).isTTY === true;
  return isTty || envForcesColor(env);
}

/** Converte '#rrggbb' → RGB; null se hex inválido (tema cai p/ identidade). */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffff) return null;
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/**
 * Fábrica de tema — UMA leitura do gate por render (em vez de reler env por
 * label). Fora de TTY devolve identidade pura: strings byte-idênticas às
 * atuais (contrato dos testes de CLI/smoke).
 */
export function theme(deps: BannerDeps = {}): BannerTheme {
  if (!useColor(deps)) {
    const identity = (text: string): string => text;
    return { cyan: identity, gray: identity, white: identity, bold: identity };
  }
  const rgb = hexToRgb(CYAN_HEX);
  if (!rgb) {
    const identity = (text: string): string => text;
    return { cyan: identity, gray: identity, white: identity, bold: identity };
  }
  const { r, g, b } = rgb;
  return {
    cyan: (text) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`,
    gray: (text) => `\x1b[90m${text}\x1b[39m`,
    white: (text) => `\x1b[37m${text}\x1b[39m`,
    bold: (text) => `\x1b[1m${text}\x1b[22m`,
  };
}

/**
 * Banner completo: linha vazia + logo ciano (padEnd ao maxWidth, assinatura
 * branca na última linha — padrão SIGNATURE_LINE do Reversa) + tagline cinza +
 * `process-ai v<version>` branco. Zero bytes `\x1b` quando cores desligadas.
 */
export function renderBanner(version: string, deps: BannerDeps = {}): string {
  const t = theme(deps);
  const maxWidth = Math.max(...LOGO_LINES.map((line) => line.length));
  const logo = LOGO_LINES.map((line, index) => {
    const painted = t.cyan(line.padEnd(maxWidth));
    if (index !== LOGO_LINES.length - 1) return painted;
    return `${painted}${' '.repeat(SIGNATURE_MARGIN)}${t.white(`by ${AUTHOR}`)}`;
  }).join('\n');
  return ['', logo, '', t.gray(TAGLINE), t.white(`process-ai v${version}`), ''].join('\n');
}

/**
 * Limpa a tela (`\x1b[2J\x1b[H`) SOMENTE em TTY real. Gate independente do
 * gate de cor: FORCE_COLOR em pipe NÃO limpa (apagaria log capturado).
 */
export function clearScreenIfTty(stream: SpinnerStream = process.stdout): void {
  if (stream.isTTY !== true) return;
  try {
    stream.write('\x1b[2J\x1b[H');
  } catch {
    // stream morto (EPIPE): nada a fazer
  }
}

/**
 * Spinner zero-dep (frames braille, ~80ms). FORA de TTY real devolve um
 * spinner INERTE — nenhum timer criado, nenhum write (o interval segura o
 * event loop e `\r\x1b[2K` em pipe corrompe saída capturada; por isso o gate
 * é na CRIAÇÃO, não só nos writes). `succeed`/`stop` são idempotentes:
 * `stop()` após `succeed()` não apaga a linha da mensagem.
 */
export function createSpinner(
  label: string,
  opts: { stream?: SpinnerStream; intervalMs?: number } = {},
): Spinner {
  const stream = opts.stream ?? process.stdout;
  if (stream.isTTY !== true) {
    return {
      active: false,
      start(): void {},
      succeed(_message: string): void {},
      stop(): void {},
    };
  }
  const t = theme();
  const intervalMs = opts.intervalMs ?? 80;
  let frame = 0;
  let spinning = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const clearTimer = (): void => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  const writeSafely = (s: string): void => {
    try {
      stream.write(s);
    } catch {
      clearTimer(); // stream morto (EPIPE): desliga sem propagar
    }
  };
  const paint = (): void => {
    writeSafely(`\r\x1b[2K${t.cyan(SPINNER_FRAMES[frame] ?? '')} ${label}`);
  };

  return {
    get active(): boolean {
      return spinning;
    },
    start(): void {
      if (spinning) return;
      spinning = true;
      paint();
      timer = setInterval(() => {
        frame = (frame + 1) % SPINNER_FRAMES.length;
        paint();
      }, intervalMs);
      (timer as MaybeUnrefable).unref?.();
    },
    succeed(message: string): void {
      if (!spinning) return;
      spinning = false;
      clearTimer();
      writeSafely(`\r\x1b[2K${t.cyan(`✓ ${message}`)}\n`);
    },
    stop(): void {
      if (!spinning) return;
      spinning = false;
      clearTimer();
      writeSafely('\r\x1b[2K');
    },
  };
}
