/**
 * tests/playwright-deps.test.ts — ensureRenderDeps() (detecção de render, Guilherme).
 *
 * O `Installer.install` chama `ensureRenderDeps()` em todo caminho de install, e o
 * subcomando `render-flow` chama-o em runtime como gate. Como a função dispara a
 * sonda .cjs via `spawnSync` (Playwright real), os testes injetam um `RenderDepDeps`
 * mockado — sem Playwright real (flakiness-free).
 *
 * resolveProbe aponta para a sonda .cjs REAL do repo (que existe), para a função
 * passar pelo guard e exercitar a lógica de spawnSync. O mock controla apenas o
 * `status` (0=pronto / 1=ausente / 2=sem navegador), espelhando os códigos da sonda.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import path from 'node:path';
import { ensureRenderDeps, defaultDeps } from '../toolkit/src/installer/playwright-deps.ts';
import type { RenderDepDeps } from '../toolkit/src/installer/playwright-deps.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const REAL_PROBE = path.join(REPO_ROOT, 'scripts', 'bpmn-renderer', 'playwright-probe.cjs');

/** Mock de spawnSync: status controlado pelo teste (espelha os códigos da sonda). */
function mockSpawn(status: number | null): RenderDepDeps['spawnSync'] {
  return () => ({ status });
}

const baseDeps = (
  spawnSync: RenderDepDeps['spawnSync'],
  platform = 'linux',
  resolveProbe: () => string | null = () => REAL_PROBE,
): RenderDepDeps => ({ spawnSync, node: process.execPath, platform, resolveProbe });

// Sanity do fixture: a sonda real precisa existir para os testes abaixo.
test('fixture: playwright-probe.cjs existe no repo (pré-condição dos testes)', () => {
  assert.ok(statSync(REAL_PROBE).isFile(), `esperado ${REAL_PROBE}`);
});

test('sonda ausente (resolveProbe null) → unavailable, NÃO chama spawnSync', () => {
  let called = false;
  const r = ensureRenderDeps(baseDeps(() => { called = true; return { status: 0 }; }, 'linux', () => null));
  assert.equal(r.available, false);
  assert.equal(r.installed, false);
  assert.match(r.message, /não encontrada no pacote/i);
  assert.equal(called, false);
});

test('status 0 → pronto: available+installed true; msg diz disponível', () => {
  const r = ensureRenderDeps(baseDeps(mockSpawn(0)));
  assert.equal(r.available, true);
  assert.equal(r.installed, true);
  assert.match(r.message, /disponível/i);
});

test('status 1 (REGRESSÃO: Playwright ausente no campo) → available false; msg cita render-flow + install', () => {
  // Este é o caso central do 0.9.2: renderer não funcionava porque Playwright é
  // devDep. O gate deve sinalizar 🔴 honesto com dica acionável.
  const r = ensureRenderDeps(baseDeps(mockSpawn(1)));
  assert.equal(r.available, false);
  assert.equal(r.installed, false);
  assert.match(r.message, /npx process-ai render-flow/);
  assert.match(r.message, /npm i playwright/);
});

test('status 2 (Playwright sem navegador) → available true, installed false; msg cita playwright install', () => {
  const r = ensureRenderDeps(baseDeps(mockSpawn(2)));
  assert.equal(r.available, true);
  assert.equal(r.installed, false);
  assert.match(r.message, /playwright install chromium/);
});

test('status null (spawn morre/killed) → unavailable, fail-soft (NÃO lança)', () => {
  const r = ensureRenderDeps(baseDeps(mockSpawn(null)));
  assert.equal(r.available, false);
  assert.equal(r.installed, false);
  assert.match(r.message, /npm i playwright/);
});

test('win32 sem Playwright → msg menciona Edge do sistema (PA_BROWSER)', () => {
  const r = ensureRenderDeps(baseDeps(mockSpawn(1), 'win32'));
  assert.match(r.message, /Edge do sistema/i);
  assert.match(r.message, /PA_BROWSER/);
});

test('win32 sem navegador (status 2) → msg sugere PA_BROWSER=msedge|chrome', () => {
  const r = ensureRenderDeps(baseDeps(mockSpawn(2), 'win32'));
  assert.match(r.message, /PA_BROWSER=msedge/);
});

test('spawnSync lança → fail-soft ( unavailable, NÃO propaga exceção)', () => {
  const r = ensureRenderDeps(baseDeps(() => { throw new Error('ENOENT node'); }));
  assert.equal(r.available, false);
  assert.equal(r.installed, false);
  assert.match(r.message, /npm i playwright/);
});

test('defaultDeps() expõe spawnSync/node/platform/resolveProbe de produção', () => {
  const d = defaultDeps();
  assert.equal(typeof d.spawnSync, 'function');
  assert.equal(typeof d.node, 'string');
  assert.equal(d.platform, process.platform);
  assert.equal(typeof d.resolveProbe, 'function');
  // resolveProbe de produção aponta para a sonda real.
  assert.equal(d.resolveProbe(), REAL_PROBE);
});
