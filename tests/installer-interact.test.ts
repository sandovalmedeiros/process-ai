/**
 * tests/installer-interact.test.ts — checkbox raw-mode (interact.ts).
 *
 * Dirigido por KeySource scriptado + stream fake: navegação pula desabilitadas,
 * espaço/a/i alternam, enter exige ≥1, Ctrl+C → CancelledInstallError, EOF →
 * erro acionável, redraw usa sequências VT (cursor-up + \x1b[J), truncagem a
 * columns-1 e colapso p/ [título, resposta] ao confirmar.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CancelledInstallError, checkbox } from '../toolkit/src/installer/interact.ts';
import type { KeySource, KeyPress, WidgetStream } from '../toolkit/src/installer/interact.ts';

function keyScript(script: KeyPress[]): KeySource {
  async function* gen(): KeySource {
    for (const k of script) yield k;
  }
  return gen();
}

function fakeOut(): WidgetStream & { chunks: string[] } {
  const chunks: string[] = [];
  return { chunks, write(s: string): boolean { chunks.push(s); return true; } };
}

const CHOICES = [
  { value: 'a', label: 'Alfa (detectada)', checked: true },
  { value: 'b', label: 'Beta (em breve)', disabled: true },
  { value: 'c', label: 'Gama', checked: false },
];

test('checkbox: enter confirma o default; render com ❯/◉/○/dica; colapsa p/ título+resposta', async () => {
  const out = fakeOut();
  const values = await checkbox('1. Engines', CHOICES, { keys: keyScript([{ name: 'return' }]), stream: out });
  assert.deepEqual(values, ['a']);
  const all = out.chunks.join('');
  assert.ok(all.includes('1. Engines'));
  assert.ok(all.includes('❯'), 'cursor do item focado');
  assert.ok(all.includes('◉'), 'item marcado');
  assert.ok(all.includes('○'), 'item desmarcado/desabilitado');
  assert.ok(all.includes('(espaço)=selecionar'), 'linha de dica');
  const tail = out.chunks[out.chunks.length - 1];
  assert.ok(tail.includes('Alfa (detectada)'), 'colapso mostra a escolha');
  assert.ok(tail.endsWith('\n'), 'colapso fecha com newline');
});

test('checkbox: down PULA desabilitada (a→c); espaço marca c; enter → [a, c]', async () => {
  const out = fakeOut();
  const values = await checkbox('T', CHOICES, {
    keys: keyScript([{ name: 'down' }, { name: 'space' }, { name: 'return' }]),
    stream: out,
  });
  assert.deepEqual(values, ['a', 'c']);
  // o repaint após down mostra o cursor sobre Gama (pulou Beta)
  assert.ok(out.chunks.join('').includes('❯ ○ Gama'));
});

test('checkbox: "a" ×2 desliga todas → enter é NO-OP (exige ≥1) → espaço religa a focada', async () => {
  const out = fakeOut();
  const values = await checkbox('T', CHOICES, {
    // 1º 'a' liga todas (toggle-all: nem todas marcadas), 2º desliga; enter com
    // zero marcadas é no-op; espaço religa a focada (cursor em a).
    keys: keyScript([{ name: 'a' }, { name: 'a' }, { name: 'return' }, { name: 'space' }, { name: 'return' }]),
    stream: out,
  });
  assert.deepEqual(values, ['a'], 'enter com nada marcado não confirma');
});

test('checkbox: espaço em desabilitada não alterna; up/down sem sair das habilitadas', async () => {
  // down (a→c), down (c → fim, no-op), up (c→a): cursor termina em a.
  const out = fakeOut();
  const values = await checkbox('T', CHOICES, {
    keys: keyScript([{ name: 'down' }, { name: 'down' }, { name: 'up' }, { name: 'return' }]),
    stream: out,
  });
  assert.deepEqual(values, ['a']);
});

test('checkbox: Ctrl+C → CancelledInstallError', async () => {
  const out = fakeOut();
  await assert.rejects(
    checkbox('T', CHOICES, { keys: keyScript([{ name: 'c', ctrl: true }]), stream: out }),
    CancelledInstallError,
  );
});

test('checkbox: EOF (script esgotado) → erro acionável pt-BR', async () => {
  const out = fakeOut();
  await assert.rejects(
    checkbox('T', CHOICES, { keys: keyScript([]), stream: out }),
    /EOF\/stdin fechado/,
  );
});

test('checkbox: repaint usa VT (cursor-up + clear-to-end) e truncagem a columns-1', async () => {
  const out = fakeOut();
  const long = { value: 'x', label: 'X'.repeat(120), checked: true };
  await checkbox('T', [long], {
    keys: keyScript([{ name: 'return' }]),
    stream: out,
    columns: 40,
  });
  const all = out.chunks.join('');
  assert.ok(all.includes('\x1b[J'), 'redraw limpa até o fim da tela');
  assert.ok(!all.includes('X'.repeat(40)), 'linha truncada (≤ columns-1)');
  assert.ok(all.includes('…'), 'truncagem com reticências');
});
