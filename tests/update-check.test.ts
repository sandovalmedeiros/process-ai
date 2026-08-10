/**
 * tests/update-check.test.ts — update-check (detecção de global defasado).
 *
 * Cobertura:
 *  - isVersionBehind: tabela-verdade (comparação numérica, não léxica).
 *  - fetchLatestVersion: stub de globalThis.fetch (sem rede real no CI).
 *  - checkForUpdate: DI de deps + cache em tmpdir (sem tocar $HOME real).
 *  - formatUpdateWarning: snapshot do aviso pt-BR.
 *
 * Nenhum teste bate no registro real — rede via stub (globalThis.fetch) ou DI
 * (UpdateCheckDeps.fetchLatest); cache via mkdtempSync(os.tmpdir()).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkForUpdate,
  isVersionBehind,
  fetchLatestVersion,
  formatUpdateWarning,
  defaultDeps,
} from '../toolkit/src/installer/update-check.ts';
import type { UpdateCheckDeps } from '../toolkit/src/installer/update-check.ts';

// ---------------- isVersionBehind (pure) ----------------

test('isVersionBehind: tabela-verdade (numérico, não léxico)', () => {
  const cases: Array<{ local: string; latest: string; expected: boolean; why: string }> = [
    { local: '0.8.2', latest: '0.8.3', expected: true, why: 'patch atrás' },
    { local: '0.8.3', latest: '0.8.3', expected: false, why: 'igual' },
    { local: '0.8.3', latest: '0.8.2', expected: false, why: 'à frente' },
    { local: '0.7.10', latest: '0.8.0', expected: true, why: 'minor atrás (patch alto não salva)' },
    { local: '0.10.0', latest: '0.9.0', expected: false, why: 'numérico: 0.10 > 0.9 (não léxico)' },
    { local: '0.9.0', latest: '0.10.0', expected: true, why: 'numérico: 0.9 < 0.10' },
    { local: '1.0.0', latest: '0.9.9', expected: false, why: 'major à frente' },
    // 0.0.0 é semanticamente o sentinel de fallback, mas isVersionBehind é um
    // comparador PURO (0.0.0 < 0.8.3 é true). A política "não avisar em 0.0.0"
    // vive no checkForUpdate (teste dedicado abaixo), não aqui.
    { local: 'garbage', latest: '0.8.3', expected: false, why: 'local não-semver' },
    { local: '0.8.3', latest: '0.8.3-beta', expected: false, why: 'latest não-semver (shape reject)' },
    { local: '0.8', latest: '0.8.3', expected: false, why: 'local não-semver (2 componentes)' },
  ];
  for (const c of cases) {
    assert.equal(
      isVersionBehind(c.local, c.latest),
      c.expected,
      `${c.local} vs ${c.latest} deveria ser ${c.expected} (${c.why})`,
    );
  }
});

// ---------------- fetchLatestVersion (stub de globalThis.fetch) ----------------

/** Troca globalThis.fetch por um stub que registra calls e responde via impl. */
function withFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push(url);
    return impl(url, init);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test('fetchLatestVersion: 200 + {version} válido → retorna versão; chamou URL do registro', async () => {
  const mk = withFetch(async () => new Response(JSON.stringify({ version: '0.8.3' }), { status: 200 }));
  try {
    const v = await fetchLatestVersion();
    assert.equal(v, '0.8.3');
    assert.equal(mk.calls.length, 1);
    assert.match(mk.calls[0], /registry\.npmjs\.org\/process-ai\/latest/);
  } finally {
    mk.restore();
  }
});

test('fetchLatestVersion: 200 mas sem campo version → null', async () => {
  const mk = withFetch(async () => new Response(JSON.stringify({}), { status: 200 }));
  try {
    assert.equal(await fetchLatestVersion(), null);
  } finally {
    mk.restore();
  }
});

test('fetchLatestVersion: 200 body não-JSON → null', async () => {
  const mk = withFetch(async () => new Response('<html>nope</html>', { status: 200 }));
  try {
    assert.equal(await fetchLatestVersion(), null);
  } finally {
    mk.restore();
  }
});

test('fetchLatestVersion: version fora de shape (0.8.3-beta) → null', async () => {
  const mk = withFetch(async () => new Response(JSON.stringify({ version: '0.8.3-beta' }), { status: 200 }));
  try {
    assert.equal(await fetchLatestVersion(), null);
  } finally {
    mk.restore();
  }
});

test('fetchLatestVersion: 404 → null', async () => {
  const mk = withFetch(async () => new Response('not found', { status: 404 }));
  try {
    assert.equal(await fetchLatestVersion(), null);
  } finally {
    mk.restore();
  }
});

test('fetchLatestVersion: fetch rejeita (rede/abort) → null', async () => {
  const mk = withFetch(async () => Promise.reject(new Error('network down / aborted')));
  try {
    assert.equal(await fetchLatestVersion(), null);
  } finally {
    mk.restore();
  }
});

// ---------------- checkForUpdate (DI + tmpdir cache) ----------------

interface MockFetchLatest {
  fn: () => Promise<string | null>;
  calls: number;
}

function mockFetchLatest(retval: string | null): MockFetchLatest {
  const m: MockFetchLatest = {
    calls: 0,
    fn: async () => {
      m.calls++;
      return retval;
    },
  };
  return m;
}

function tmpCacheFile(): { dir: string; file: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pa-uc-'));
  return { dir, file: path.join(dir, 'update-check.json') };
}

function buildDeps(opts: {
  fetch: MockFetchLatest;
  cacheFile: string;
  nowMs: number;
  local: string;
}): UpdateCheckDeps {
  return {
    fetchLatest: opts.fetch.fn,
    now: () => opts.nowMs,
    cachePath: () => opts.cacheFile,
    localVersion: () => opts.local,
  };
}

function seedCache(file: string, latest: string, checkedAt: number): void {
  writeFileSync(file, JSON.stringify({ latest, checkedAt }));
}

function readCacheRaw(file: string): { latest: string; checkedAt: number } | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

test('checkForUpdate: cache fresco → NÃO busca; behind conforme local vs cache', async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const NOW = 1_000_000;
    seedCache(file, '0.8.4', NOW); // fresco (agora)
    const behind = mockFetchLatest('0.9.9');
    const r = await checkForUpdate(buildDeps({ fetch: behind, cacheFile: file, nowMs: NOW, local: '0.8.2' }));
    assert.equal(behind.calls, 0, 'cache fresco não deve chamar fetchLatest');
    assert.ok(r);
    assert.equal(r.behind, true); // 0.8.2 < 0.8.4 (do cache)
    assert.equal(r.latest, '0.8.4');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkForUpdate: cache stale (25h) → busca, reescreve cache com novo latest', async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const NOW = 10_000_000_000;
    seedCache(file, '0.8.4', NOW - 25 * 60 * 60 * 1000); // 25h atrás → stale
    const fresh = mockFetchLatest('0.8.5');
    const r = await checkForUpdate(buildDeps({ fetch: fresh, cacheFile: file, nowMs: NOW, local: '0.8.2' }));
    assert.equal(fresh.calls, 1, 'cache stale deve chamar fetchLatest');
    assert.ok(r);
    assert.equal(r.latest, '0.8.5');
    assert.equal(r.behind, true);
    const rewritten = readCacheRaw(file);
    assert.ok(rewritten, 'cache reescrito');
    assert.equal(rewritten!.latest, '0.8.5');
    assert.equal(rewritten!.checkedAt, NOW);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkForUpdate: sem cache → busca e escreve cache', async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const NOW = 5_000_000;
    const fresh = mockFetchLatest('0.8.3');
    const r = await checkForUpdate(buildDeps({ fetch: fresh, cacheFile: file, nowMs: NOW, local: '0.8.2' }));
    assert.equal(fresh.calls, 1);
    assert.ok(r);
    assert.equal(r.latest, '0.8.3');
    assert.equal(r.behind, true);
    const written = readCacheRaw(file);
    assert.ok(written);
    assert.equal(written!.latest, '0.8.3');
    assert.equal(written!.checkedAt, NOW);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkForUpdate: fetch null + sem cache → retorna null e NÃO escreve cache', async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const fail = mockFetchLatest(null);
    const r = await checkForUpdate(buildDeps({ fetch: fail, cacheFile: file, nowMs: 1, local: '0.8.2' }));
    assert.equal(r, null);
    assert.equal(readCacheRaw(file), null, 'cache não deve ser escrito quando fetch falha');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkForUpdate: fetch null + cache stale presente → retorna null (NÃO reusa latest do cache)', async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const NOW = 10_000_000_000;
    seedCache(file, '0.8.4', NOW - 25 * 60 * 60 * 1000);
    const fail = mockFetchLatest(null);
    const r = await checkForUpdate(buildDeps({ fetch: fail, cacheFile: file, nowMs: NOW, local: '0.8.2' }));
    assert.equal(r, null, 'falha de fetch não deve reaproveitar latest stale');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkForUpdate: local 0.0.0 → retorna null imediatamente, NÃO busca', async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const fresh = mockFetchLatest('0.8.3');
    const r = await checkForUpdate(buildDeps({ fetch: fresh, cacheFile: file, nowMs: 1, local: '0.0.0' }));
    assert.equal(r, null);
    assert.equal(fresh.calls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkForUpdate: cache malformado (bytes lixo) → tratado como sem cache, busca', async () => {
  const { dir, file } = tmpCacheFile();
  try {
    writeFileSync(file, 'not-json{{{');
    const fresh = mockFetchLatest('0.8.3');
    const r = await checkForUpdate(buildDeps({ fetch: fresh, cacheFile: file, nowMs: 1, local: '0.8.2' }));
    assert.equal(fresh.calls, 1, 'cache ilegível deve cair no fetch');
    assert.ok(r);
    assert.equal(r.latest, '0.8.3');
    const written = readCacheRaw(file);
    assert.ok(written, 'cache reescrito por cima do lixo');
    assert.equal(written!.latest, '0.8.3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('defaultDeps() expõe fetchLatest/now/cachePath/localVersion de produção', () => {
  const d = defaultDeps();
  assert.equal(typeof d.fetchLatest, 'function');
  assert.equal(typeof d.now, 'function');
  assert.equal(typeof d.cachePath, 'function');
  assert.equal(typeof d.localVersion, 'function');
  assert.ok(d.cachePath().endsWith(path.join('.process-ai', 'update-check.json')));
  assert.equal(typeof d.now(), 'number');
});

// ---------------- formatUpdateWarning (snapshot) ----------------

test('formatUpdateWarning: contém comando, glyph, versões; NÃO menciona `process-ai update`', () => {
  const w = formatUpdateWarning('0.8.2', '0.8.3');
  assert.ok(w.includes('⚠'), 'tem glyph de aviso');
  assert.ok(w.includes('npm i -g process-ai@latest'), 'tem o comando de upgrade');
  assert.ok(w.includes('0.8.2'), 'menciona versão local');
  assert.ok(w.includes('0.8.3'), 'menciona versão latest');
  assert.ok(w.includes('desatualizada'), 'pt-BR');
  assert.equal(w.includes('process-ai update'), false, 'não confunde com o subcomando update local');
  assert.ok(w.endsWith('\n'), 'termina com newline');
});
