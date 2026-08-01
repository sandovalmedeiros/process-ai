/**
 * tests/bootstrap.test.ts — Bootstrap CLI E2E (AC1, AC2, AC5).
 * Spawna o binário real contra um tmpdir para validar o caminho de CLI de ponta a ponta.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, hasHelpFlag } from '../bin/bootstrap.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BOOTSTRAP = path.join(REPO_ROOT, 'bin', 'bootstrap.ts');
const NODE = process.execPath;

function runBootstrap(target: string) {
  return spawnSync(NODE, [BOOTSTRAP, '--target', target], { encoding: 'utf8' });
}

/** Snapshot recursivo {relPath: {content, mode}} do diretório, ordenado e estável.
 *  [CR item 4d] Inclui `mode` (permissões) — estável entre runs idempotentes e
 *  detectaria mudanças de perms que o snapshot só-conteúdo deixaria passar.
 *  mtime/owner ficam de fora: mtime muda a cada writeFile; owner é volátil
 *  entre ambientes. */
async function snapshotTree(dir: string): Promise<Record<string, { content: string; mode: number }>> {
  const out: Record<string, { content: string; mode: number }> = {};
  async function walk(d: string) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, e.name);
      const rel = path.relative(dir, full).split(path.sep).join('/');
      if (e.isDirectory()) await walk(full);
      else {
        const st = await fs.stat(full);
        out[rel] = { content: await fs.readFile(full, 'utf8'), mode: st.mode };
      }
    }
  }
  await walk(dir);
  return out;
}

test('AC2: bootstrap registra /process-ai no tmpdir (E2E, exit 0)', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pa-boot-'));
  try {
    const res = runBootstrap(tmp);
    assert.equal(
      res.status,
      0,
      `bootstrap deve terminar com exit 0.\nstdout: ${res.stdout}\nstderr: ${res.stderr}`,
    );
    const skillFile = path.join(tmp, '.claude', 'skills', 'process-ai', 'SKILL.md');
    assert.ok(statSync(skillFile).isFile(), 'SKILL.md deve existir no alvo após bootstrap');
    assert.match(res.stdout, /\/process-ai/, 'saída deve mencionar /process-ai');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('AC5: bootstrap é idempotente — 2× no mesmo alvo => estado final idêntico', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pa-idem-'));
  try {
    runBootstrap(tmp);
    const snap1 = await snapshotTree(tmp);

    runBootstrap(tmp);
    const snap2 = await snapshotTree(tmp);

    assert.deepEqual(snap2, snap1, 'estado após a 2ª execução deve ser idêntico ao da 1ª (idempotente)');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('AC5: bootstrap não escreve nada fora de .claude/ no alvo', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pa-scope-'));
  try {
    runBootstrap(tmp);
    const entries = readdirSync(tmp);
    assert.deepEqual(
      entries,
      ['.claude'],
      'o único conteúdo criado no alvo deve ser .claude/ (nada fora dele)',
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---- CR-hardening (code review da story 1.1) ----

test('CR item 4e: bootstrap não escreve nada FORA do alvo (snapshot do dir-pai)', () => {
  // Cria um dir-pai com o alvo como subdir. Após o bootstrap, o pai deve
  // conter exatamente o alvo — nada escrito fora dele (irmãos do alvo).
  const parent = mkdtempSync(path.join(os.tmpdir(), 'pa-pai-'));
  const target = path.join(parent, 'alvo');
  mkdirSync(target);
  try {
    const res = runBootstrap(target);
    assert.equal(res.status, 0, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
    const parentEntries = readdirSync(parent);
    assert.deepEqual(
      parentEntries,
      ['alvo'],
      'nada deve ser escrito fora do alvo (dir-pai deve conter só o alvo)',
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('CR item 1: bootstrap recusa --target inexistente (E2E)', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pa-ghost-'));
  try {
    const ghost = path.join(tmp, 'subdir-inexistente');
    const res = spawnSync(NODE, [BOOTSTRAP, '--target', ghost], { encoding: 'utf8' });
    assert.notEqual(res.status, 0, 'deve falhar (exit != 0) para target inexistente');
    assert.match(res.stderr, /não existe/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('CR item 4b-misc: bootstrap recusa self-install no repositório do framework', () => {
  const res = spawnSync(NODE, [BOOTSTRAP, '--target', REPO_ROOT], { encoding: 'utf8' });
  assert.notEqual(res.status, 0, 'deve recusar registrar no próprio repo do framework');
  assert.match(res.stderr, /próprio repositório do framework/i);
});

test('CR item d: bootstrap --help mostra ajuda e sai exit 0 (E2E)', () => {
  const res = spawnSync(NODE, [BOOTSTRAP, '--help'], { encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Uso:/);
});

test('CR item a/c (E2E): form --target=<dir> registra via subprocess real (não só unit)', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pa-eq-'));
  try {
    const res = spawnSync(NODE, [BOOTSTRAP, `--target=${tmp}`], { encoding: 'utf8' });
    assert.equal(res.status, 0, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
    const skillFile = path.join(tmp, '.claude', 'skills', 'process-ai', 'SKILL.md');
    assert.ok(statSync(skillFile).isFile(), 'SKILL.md deve existir no alvo via form --target=');
    assert.match(res.stdout, /\/process-ai/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---- parseArgs / hasHelpFlag (unitários, sem side effects) ----

test('CR item a: parseArgs aceita --target=<dir> (form com =)', () => {
  assert.equal(parseArgs(['--target=/some/dir']).target, '/some/dir');
});

test('CR item c: parseArgs aceita --target=<dir> com nome começando por --', () => {
  assert.equal(parseArgs(['--target=--weird-dir']).target, '--weird-dir');
});

test('CR item b: parseArgs rejeita --target duplicado', () => {
  assert.throws(() => parseArgs(['--target', '/a', '--target', '/b']), /duplicado/);
  assert.throws(() => parseArgs(['--target=/a', '--target=/b']), /duplicado/);
});

test('CR item e: parseArgs respeita separador POSIX -- (posicionais rejeitados)', () => {
  // Após --, --dev vira posicional e é rejeitado (não aceitamos posicionais).
  assert.throws(() => parseArgs(['--', '--dev']), /posicional/);
});

test('CR item c: parseArgs rejeita valor de --target que parece flag (form espaço)', () => {
  assert.throws(() => parseArgs(['--target', '--dev']), /use --target=/i);
});

test('CR item d: hasHelpFlag detecta -h/--help e respeita o separador --', () => {
  assert.equal(hasHelpFlag(['--help']), true);
  assert.equal(hasHelpFlag(['-h']), true);
  assert.equal(hasHelpFlag(['--target', '/x', '--help']), true);
  assert.equal(hasHelpFlag(['--', '--help']), false, 'posicional após -- não é flag');
  assert.equal(hasHelpFlag(['--target=--help']), false, 'valor de --target não é flag');
  assert.equal(hasHelpFlag([]), false);
});
