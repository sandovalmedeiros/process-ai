/**
 * tests/installer-state.test.ts — detectInstallationState.
 *
 * Cobertura: clean (sem manifest); installed-current (hashes batem, versão igual);
 * installed-modified (edita uma skill → flagged); installed-stale (bump framework_version).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectInstallationState } from '../toolkit/src/installer/state.ts';
import { writeManifest, sha256Content, type Manifest } from '../toolkit/src/installer/manifest.ts';

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-state-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const VERSION = '0.2.1';

async function seedFresh(dir: string): Promise<Manifest> {
  const rel = '.claude/skills/process-ai/SKILL.md';
  const abs = path.join(dir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, 'conteudo do condutor', 'utf8');
  const manifest: Manifest = {
    install: {
      framework_version: VERSION,
      installed_at: '2026-08-04T12:00:00.000Z',
      install_type: 'fresh',
      ide: 'claude-code',
      active_pack: 'bpmn-sipoc',
    },
    files: [{ path: rel, sha256: sha256Content('conteudo do condutor') }],
  };
  await writeManifest(dir, manifest);
  return manifest;
}

test('clean: sem manifest', async () => {
  await withTmp(async (dir) => {
    const state = await detectInstallationState(dir, VERSION);
    assert.equal(state.kind, 'clean');
  });
});

test('installed-current: hashes batem e versão igual', async () => {
  await withTmp(async (dir) => {
    await seedFresh(dir);
    const state = await detectInstallationState(dir, VERSION);
    assert.equal(state.kind, 'installed-current');
  });
});

test('installed-modified: editar uma skill após o install', async () => {
  await withTmp(async (dir) => {
    await seedFresh(dir);
    await fs.writeFile(path.join(dir, '.claude/skills/process-ai/SKILL.md'), 'editado localmente', 'utf8');
    const state = await detectInstallationState(dir, VERSION);
    assert.equal(state.kind, 'installed-modified');
    if (state.kind === 'installed-modified') {
      assert.equal(state.report.modified.length, 1);
    }
  });
});

test('installed-modified: skill removida → missing', async () => {
  await withTmp(async (dir) => {
    await seedFresh(dir);
    await fs.rm(path.join(dir, '.claude/skills/process-ai/SKILL.md'));
    const state = await detectInstallationState(dir, VERSION);
    assert.equal(state.kind, 'installed-modified');
    if (state.kind === 'installed-modified') {
      assert.equal(state.report.missing.length, 1);
    }
  });
});

test('installed-stale: versão do framework mudou', async () => {
  await withTmp(async (dir) => {
    await seedFresh(dir);
    const state = await detectInstallationState(dir, '0.3.0');
    assert.equal(state.kind, 'installed-stale');
    if (state.kind === 'installed-stale') {
      assert.equal(state.currentVersion, '0.3.0');
      assert.equal(state.manifestVersion, VERSION);
    }
  });
});
