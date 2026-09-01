/**
 * tests/banner.test.ts — kit ANSI do installer (toolkit/src/installer/banner.ts).
 *
 * Cobre: gates de cor (NO_COLOR > FORCE_COLOR > TERM=dumb > !TTY > CI, lidos a
 * cada chamada via DI), tema ciano #22d3ee (bytes exatos), renderBanner plain
 * (zero \x1b — contrato byte-idêntico dos smoke/CLI) e colorido, largura/ASCII
 * do logo, clearScreenIfTty (só TTY real) e spinner (inerte fora de TTY — nem
 * timer; ativo com stream fake). No fim, main() real: banner no --help (TTY ou
 * FORCE_COLOR) e CONTRATO INVIOLÁVEL do stdout estruturado (status nunca ganha
 * \x1b, mesmo com cores forçadas).
 *
 * Padrões: node:test + assert/strict; captureStreams espelha cli.test.ts:566-581;
 * gates testados via deps injetadas (env limpa) — sem depender do ambiente.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CYAN_HEX,
  LOGO_LINES,
  clearScreenIfTty,
  createSpinner,
  renderBanner,
  theme,
  useBanner,
  useColor,
} from '../toolkit/src/installer/banner.ts';
import { main } from '../bin/process-ai.ts';

/** Prefixo truecolor do ciano da marca (38;2;R;G;B de #22d3ee). */
const CYAN_SGR = '\x1b[38;2;34;211;238m';
const CYAN_RESET = '\x1b[39m';

/** Stream fake: coleta writes; isTTY controlado pelo teste. */
function fakeStream(isTTY?: boolean): { chunks: string[]; write(s: string): boolean; isTTY?: boolean } {
  const chunks: string[] = [];
  return { chunks, isTTY, write(s: string): boolean { chunks.push(s); return true; } };
}

/** Aplica vars de env, roda fn e restaura (isola cada teste). */
async function withEnv(vars: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    saved.set(k, process.env[k]);
    process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Captura stdout (main() escreve direto em process.stdout) — padrão cli.test.ts. */
function captureStdout() {
  const out: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((s: string) => { out.push(s); return true; }) as typeof process.stdout.write;
  return {
    out: () => out.join(''),
    restore: () => { process.stdout.write = orig; },
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ---- useColor (gate por chamada, DI com env limpa) ----

test('useColor: default (pipe, env limpa) → false', () => {
  assert.equal(useColor({ env: {}, stream: { isTTY: false } }), false);
  assert.equal(useColor({ env: {}, stream: { isTTY: undefined } }), false);
});

test('useColor: TTY real com env limpa → true', () => {
  assert.equal(useColor({ env: {}, stream: { isTTY: true } }), true);
});

test('useColor: NO_COLOR não-vazio vence FORCE_COLOR; NO_COLOR vazio não desliga', () => {
  assert.equal(useColor({ env: { NO_COLOR: '1', FORCE_COLOR: '1' }, stream: { isTTY: true } }), false);
  assert.equal(useColor({ env: { NO_COLOR: '' }, stream: { isTTY: true } }), true);
});

test('useColor: FORCE_COLOR força cores em pipe; 0/false não forçam', () => {
  assert.equal(useColor({ env: { FORCE_COLOR: '1' }, stream: { isTTY: false } }), true);
  assert.equal(useColor({ env: { FORCE_COLOR: '' }, stream: { isTTY: false } }), true); // '' = on (supports-color)
  assert.equal(useColor({ env: { FORCE_COLOR: '0' }, stream: { isTTY: false } }), false);
  assert.equal(useColor({ env: { FORCE_COLOR: 'false' }, stream: { isTTY: false } }), false);
});

test('useColor: TERM=dumb desliga (reversível por FORCE_COLOR)', () => {
  assert.equal(useColor({ env: { TERM: 'dumb' }, stream: { isTTY: true } }), false);
  assert.equal(useColor({ env: { TERM: 'dumb', FORCE_COLOR: '1' }, stream: { isTTY: true } }), true);
});

test('useColor: CI truthy desliga (reversível por FORCE_COLOR)', () => {
  assert.equal(useColor({ env: { CI: 'true' }, stream: { isTTY: true } }), false);
  assert.equal(useColor({ env: { CI: 'true', FORCE_COLOR: '1' }, stream: { isTTY: true } }), true);
});

test('useColor: lê env a cada chamada (mutação pós-import reflete)', () => {
  const env: NodeJS.ProcessEnv = {};
  const stream = { isTTY: false };
  assert.equal(useColor({ env, stream }), false);
  env.FORCE_COLOR = '1';
  assert.equal(useColor({ env, stream }), true);
  env.NO_COLOR = '1';
  assert.equal(useColor({ env, stream }), false);
});

// ---- useBanner ----

test('useBanner: TTY → true; pipe + FORCE_COLOR → true (demo); NO_COLOR → false', () => {
  assert.equal(useBanner({ env: {}, stream: { isTTY: true } }), true);
  assert.equal(useBanner({ env: {}, stream: { isTTY: false } }), false);
  assert.equal(useBanner({ env: { FORCE_COLOR: '1' }, stream: { isTTY: false } }), true);
  assert.equal(useBanner({ env: { NO_COLOR: '1', FORCE_COLOR: '1' }, stream: { isTTY: true } }), false);
});

// ---- theme (bytes exatos) ----

test(`theme: ciano truecolor exato de ${CYAN_HEX}; identidade quando off`, () => {
  const on = theme({ env: { FORCE_COLOR: '1' } });
  assert.equal(on.cyan('x'), `${CYAN_SGR}x${CYAN_RESET}`);
  assert.equal(on.gray('x'), '\x1b[90mx\x1b[39m');
  assert.equal(on.white('x'), '\x1b[37mx\x1b[39m');
  assert.equal(on.bold('x'), '\x1b[1mx\x1b[22m');
  const off = theme({ env: {} });
  assert.equal(off.cyan('x'), 'x');
  assert.equal(off.gray('x'), 'x');
  assert.equal(off.white('x'), 'x');
  assert.equal(off.bold('x'), 'x');
});

// ---- renderBanner ----

test('renderBanner plain: zero \\x1b, contém logo/assinatura/tagline/versão', () => {
  const banner = renderBanner('9.9.9', { env: {} });
  assert.ok(!banner.includes('\x1b'), 'modo plain não pode conter escapes');
  for (const line of LOGO_LINES) {
    assert.ok(banner.includes(line), `logo deve conter a linha "${line.trim()}"`);
  }
  assert.ok(banner.includes('by Sandoval Medeiros'));
  assert.ok(banner.includes('framework de mapeamento de processos com confiança verificável'));
  assert.ok(banner.includes('process-ai v9.9.9'));
});

test('renderBanner colored: envolve o logo no ciano truecolor', () => {
  const banner = renderBanner('9.9.9', { env: { FORCE_COLOR: '1' } });
  assert.ok(banner.includes(CYAN_SGR));
  // Glifo contíguo: o ANSI abre antes e fecha depois da linha (nunca no meio).
  assert.ok(banner.includes(`${CYAN_SGR}${LOGO_LINES[1].padEnd(50)}${CYAN_RESET}`));
});

test('logo: ≤78 col por linha e ASCII puro (cabe em terminal de 80)', () => {
  for (const line of LOGO_LINES) {
    assert.ok(line.length <= 78, `linha com ${line.length} col: "${line}"`);
    assert.match(line, /^[\x20-\x7E]*$/, 'linhas do logo devem ser ASCII puro');
  }
});

// ---- clearScreenIfTty ----

test('clearScreenIfTty: só TTY real — FORCE_COLOR em pipe NÃO limpa', async () => {
  await withEnv({ FORCE_COLOR: '1' }, async () => {
    const tty = fakeStream(true);
    clearScreenIfTty(tty);
    assert.deepEqual(tty.chunks, ['\x1b[2J\x1b[H']);
    const pipe = fakeStream(undefined);
    clearScreenIfTty(pipe);
    assert.equal(pipe.chunks.length, 0);
    const notTty = fakeStream(false);
    clearScreenIfTty(notTty);
    assert.equal(notTty.chunks.length, 0);
  });
});

// ---- spinner ----

test('spinner: inerte fora de TTY real — nenhum write, nenhum timer, active=false', async () => {
  for (const isTTY of [undefined, false]) {
    const stream = fakeStream(isTTY);
    const sp = createSpinner('Instalando…', { stream });
    sp.start();
    await sleep(30);
    sp.succeed('Pronto');
    sp.stop();
    assert.equal(sp.active, false);
    assert.equal(stream.chunks.length, 0, `isTTY=${String(isTTY)}: nada pode ser escrito`);
  }
});

test('spinner ativo: frame \\r\\x1b[2K, succeed preserva mensagem, stop pós-succeed é no-op', async () => {
  const stream = fakeStream(true);
  const sp = createSpinner('Instalando skills do process-ai…', { stream, intervalMs: 10 });
  assert.equal(sp.active, false);
  sp.start();
  assert.equal(sp.active, true);
  const first = stream.chunks[0];
  assert.ok(first.startsWith('\r\x1b[2K'), 'frame deve limpar a linha antes de pintar');
  assert.ok(first.includes('Instalando skills do process-ai…'));
  await sleep(45); // ≥2 ticks — frames avançam
  assert.ok(stream.chunks.length >= 2, 'interval deve pintar frames');
  sp.succeed('Instalação concluída!');
  assert.equal(sp.active, false);
  const last = stream.chunks[stream.chunks.length - 1];
  assert.ok(last.startsWith('\r\x1b[2K'));
  assert.ok(last.includes('✓ Instalação concluída!'));
  assert.ok(last.endsWith('\n'));
  const countAfterSucceed = stream.chunks.length;
  await sleep(30);
  sp.stop(); // idempotente pós-succeed: NÃO apaga a linha da mensagem
  assert.equal(stream.chunks.length, countAfterSucceed, 'nenhum write após succeed');
});

test('spinner ativo: stop() sem succeed limpa a linha e encerra o timer', async () => {
  const stream = fakeStream(true);
  const sp = createSpinner('x', { stream, intervalMs: 10 });
  sp.start();
  await sleep(25);
  sp.stop();
  assert.equal(sp.active, false);
  const count = stream.chunks.length;
  assert.ok(stream.chunks[stream.chunks.length - 1].startsWith('\r\x1b[2K'));
  await sleep(30);
  assert.equal(stream.chunks.length, count, 'timer deve estar limpo após stop');
});

// ---- main() real: banner no help; contrato JSON do runtime intocado ----

test('main --help com FORCE_COLOR: banner colorido + HELP, sem clear-screen (pipe)', async () => {
  await withEnv({ FORCE_COLOR: '1', PROCESS_AI_SKIP_UPDATE_CHECK: '1' }, async () => {
    const cap = captureStdout();
    try {
      await main(['--help']);
      const out = cap.out();
      assert.ok(out.includes('by Sandoval Medeiros'), 'banner deve preceder o HELP');
      assert.ok(out.includes(CYAN_SGR), 'logo colorido em truecolor ciano');
      assert.ok(out.includes('propose'), 'HELP completo segue o banner');
      assert.ok(!out.includes('\x1b[2J'), 'pipe não limpa tela');
    } finally {
      cap.restore();
    }
  });
});

test('main --help sem FORCE_COLOR (pipe): HELP puro, zero \\x1b, sem banner', async () => {
  const cap = captureStdout();
  try {
    await withEnv({ NO_COLOR: '1', PROCESS_AI_SKIP_UPDATE_CHECK: '1' }, async () => {
      // NO_COLOR=1 garante o caminho mais restritivo mesmo que o ambiente de teste
      // tenha FORCE_COLOR setado.
      await main(['--help']);
    });
    const out = cap.out();
    assert.ok(out.startsWith('process-ai —'), 'stdout começa com o HELP (sem banner em pipe sem força)');
    assert.ok(!out.includes('\x1b'), 'nenhum escape ANSI');
    assert.ok(!out.includes('by Sandoval Medeiros'), 'sem banner');
  } finally {
    cap.restore();
  }
});

test('status com FORCE_COLOR (subprocesso): stdout é JSON puro — contrato dos agentes', () => {
  // Subprocesso (não captureStdout): dentro do node:test o runner escreve
  // eventos do próprio protocolo via process.stdout.write no processo-filho,
  // que contaminariam a captura in-process. No subprocesso com pipe, o stdout
  // é só do CLI — valida o contrato REAL que os agentes consomem.
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pa-banner-status-'));
  const cliPath = fileURLToPath(new URL('../bin/process-ai.ts', import.meta.url));
  try {
    const res = spawnSync(process.execPath, [cliPath, 'status'], {
      cwd: tmp,
      env: { ...process.env, FORCE_COLOR: '1', PROCESS_AI_SKIP_UPDATE_CHECK: '1' },
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    assert.ok(!res.stdout.includes('\x1b'), 'subcomando runtime NUNCA ganha cores/banner');
    JSON.parse(res.stdout); // stdout deve ser JSON parseável mesmo com cores forçadas
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
