/**
 * tests/python-deps.test.ts — ensureIngestDeps() (provisionamento de ingest).
 *
 * O `Installer.install` chama `ensureIngestDeps()` em todo caminho de install.
 * Como a função depende de `spawnSync` (Python/pip reais), os testes injetam um
 * `IngestDepDeps` mockado — sem Python real no PATH (flakiness-free).
 *
 * resolveReqs aponta para o requirements-ingest.txt REAL do repo (que existe),
 * para a função passar pelo guard `statSync` e exercitar a lógica de spawnSync.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import path from 'node:path';
import { ensureIngestDeps, defaultDeps } from '../toolkit/src/installer/python-deps.ts';
import type { IngestDepDeps } from '../toolkit/src/installer/python-deps.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const REAL_REQS = path.join(REPO_ROOT, 'scripts', 'requirements-ingest.txt');

/** Mock de spawnSync: status controlado p/ `pip --version` (check) vs `pip install`. */
function mockSpawn(opts: { checkOk: boolean; installStatus: number | null; installStderr?: string }) {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const spawnSync: IngestDepDeps['spawnSync'] = (cmd, args) => {
    calls.push({ cmd, args });
    if (args.join(' ').includes('--version')) {
      return { status: opts.checkOk ? 0 : 1 };
    }
    return { status: opts.installStatus, stderr: opts.installStderr ?? '' };
  };
  return { spawnSync, calls };
}

// Sanity do fixture: o requirements real precisa existir para os testes abaixo.
test('fixture: requirements-ingest.txt existe no repo (pré-condição dos testes)', () => {
  assert.ok(statSync(REAL_REQS).isFile(), `esperado ${REAL_REQS}`);
});

test('requirements ausente (resolveReqs null) → reqs-missing, NÃO chama spawnSync', () => {
  const mk = mockSpawn({ checkOk: true, installStatus: 0 });
  const r = ensureIngestDeps({ spawnSync: mk.spawnSync, resolveReqs: () => null, platform: 'linux' });
  assert.equal(r.available, false);
  assert.equal(r.installed, false);
  assert.match(r.message, /não encontrado no pacote/i);
  assert.equal(mk.calls.length, 0);
});

test('Python ausente → available false; msg acionável cita install + `npx process-ai ingest`', () => {
  const mk = mockSpawn({ checkOk: false, installStatus: 0 });
  const r = ensureIngestDeps({ spawnSync: mk.spawnSync, resolveReqs: () => REAL_REQS, platform: 'linux' });
  assert.equal(r.available, false);
  assert.equal(r.installed, false);
  assert.match(r.message, /npx process-ai ingest/);
  assert.match(r.message, /python3\.11|apt-get|brew|winget/);
  // tentou python3 e python (ambos falharam no check)
  const cmds = mk.calls.map((c) => c.cmd);
  assert.deepEqual(cmds, ['python3', 'python']);
});

test('pip install sucesso → installed true; para no primeiro interpretador que passa no check (python3)', () => {
  const mk = mockSpawn({ checkOk: true, installStatus: 0 });
  const r = ensureIngestDeps({ spawnSync: mk.spawnSync, resolveReqs: () => REAL_REQS, platform: 'linux' });
  assert.equal(r.available, true);
  assert.equal(r.installed, true);
  assert.match(r.message, /python3 -m pip/);
  // check(python3) + install(python3) — não tenta python
  const cmds = mk.calls.map((c) => c.cmd);
  assert.deepEqual(cmds, ['python3', 'python3']);
});

test('pip install falha (check ok, install status≠0) → available true, installed false, msg tem stderr', () => {
  const mk = mockSpawn({ checkOk: true, installStatus: 1, installStderr: 'PermissionError: [Errno 13]' });
  const r = ensureIngestDeps({ spawnSync: mk.spawnSync, resolveReqs: () => REAL_REQS, platform: 'linux' });
  assert.equal(r.available, true);
  assert.equal(r.installed, false);
  assert.match(r.message, /falhou/);
  assert.match(r.message, /PermissionError/);
});

test('win32 → só candidata `python` (nunca `python3`)', () => {
  const mk = mockSpawn({ checkOk: false, installStatus: 0 });
  ensureIngestDeps({ spawnSync: mk.spawnSync, resolveReqs: () => REAL_REQS, platform: 'win32' });
  const cmds = mk.calls.map((c) => c.cmd);
  assert.ok(cmds.every((c) => c === 'python'), `win32 só deve tentar python, got ${cmds.join(',')}`);
});

test('defaultDeps() expõe spawnSync/resolveReqs/platform de produção', () => {
  const d = defaultDeps();
  assert.equal(typeof d.spawnSync, 'function');
  assert.equal(typeof d.resolveReqs, 'function');
  assert.equal(d.platform, process.platform);
});
