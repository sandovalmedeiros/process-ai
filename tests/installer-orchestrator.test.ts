/**
 * tests/installer-orchestrator.test.ts — máquina de estados do Installer.
 *
 * Usa um `FakeIdeSetup` (grava chamadas, escreve um arquivo fake) para testar o
 * orquestrador SEM acoplar a Claude Code / disco-skills. Cobre: install em clean
 * (escreve manifest, 'fresh'), install em current ('already-current'), update em
 * clean (erro), update em modified (backup .bak + 'repaired'), uninstall (remove
 * skills + manifest, preserva config), uninstall --purge (remove .process-ai/),
 * status.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Installer } from '../toolkit/src/installer/orchestrator.ts';
import type { IdeSetup, IdeSetupResult, IdeUninstallResult } from '../toolkit/src/ide-setup.ts';
import { sha256Content } from '../toolkit/src/installer/manifest.ts';
import { readManifest, MANIFEST_REL_PATH } from '../toolkit/src/installer/manifest.ts';

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-orch-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Fake IdeSetup: escreve `.fake/skill.md` e registra chamadas. */
class FakeIdeSetup implements IdeSetup {
  setupCalls = 0;
  uninstallCalls = 0;
  ideId(): string {
    return 'fake-ide';
  }
  async setupIde(targetDir: string): Promise<IdeSetupResult> {
    this.setupCalls++;
    const rel = '.fake/skill.md';
    const abs = path.join(targetDir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, 'fake skill', 'utf8');
    return { ide: 'fake-ide', files: [{ path: rel, sha256: sha256Content('fake skill') }] };
  }
  async uninstallIde(targetDir: string): Promise<IdeUninstallResult> {
    this.uninstallCalls++;
    await fs.rm(path.join(targetDir, '.fake'), { recursive: true, force: true });
    return { removed: ['.fake'] };
  }
}

test('install em clean → outcome installed, manifest escrito, installType fresh', async () => {
  await withTmp(async (dir) => {
    const inst = new Installer(new FakeIdeSetup());
    const outcome = await inst.install({ targetDir: dir, interactive: false });
    assert.equal(outcome.outcome, 'installed');
    assert.equal(outcome.installType, 'fresh');
    assert.equal(outcome.ide, 'fake-ide');
    const manifest = await readManifest(dir);
    assert.equal(manifest?.install.install_type, 'fresh');
    assert.equal(manifest?.install.ide, 'fake-ide');
    assert.equal(manifest?.files.length, 1);
  });
});

test('install em current → already-current (não reescreve)', async () => {
  await withTmp(async (dir) => {
    const ide = new FakeIdeSetup();
    const inst = new Installer(ide);
    await inst.install({ targetDir: dir, interactive: false });
    const firstCalls = ide.setupCalls;
    const outcome = await inst.install({ targetDir: dir, interactive: false });
    assert.equal(outcome.outcome, 'already-current');
    assert.equal(ide.setupCalls, firstCalls); // não chamou setupIde de novo
  });
});

test('update em clean → erro (não instalado)', async () => {
  await withTmp(async (dir) => {
    const inst = new Installer(new FakeIdeSetup());
    await assert.rejects(() => inst.update({ targetDir: dir }), /não está instalado/);
  });
});

test('update em modified → backup .bak + outcome repaired', async () => {
  await withTmp(async (dir) => {
    const inst = new Installer(new FakeIdeSetup());
    await inst.install({ targetDir: dir, interactive: false });
    // edita localmente
    await fs.writeFile(path.join(dir, '.fake/skill.md'), 'editado pelo usuário', 'utf8');
    const outcome = await inst.update({ targetDir: dir });
    assert.equal(outcome.outcome, 'repaired');
    assert.equal(outcome.backed?.length, 1);
    // backup preserva o editado
    const bak = await fs.readFile(`${path.join(dir, '.fake/skill.md')}.bak`, 'utf8');
    assert.equal(bak, 'editado pelo usuário');
    // arquivo restaurado ao canônico
    const cur = await fs.readFile(path.join(dir, '.fake/skill.md'), 'utf8');
    assert.equal(cur, 'fake skill');
  });
});

test('uninstall remove skills + manifest, preserva config', async () => {
  await withTmp(async (dir) => {
    const inst = new Installer(new FakeIdeSetup());
    await inst.install({ targetDir: dir, interactive: false });
    const outcome = await inst.uninstall({ targetDir: dir });
    assert.equal(outcome.outcome, 'uninstalled');
    assert.equal(outcome.removed?.length, 1);
    // skills e manifest removidos
    assert.equal(await fs.stat(path.join(dir, '.fake')).then(() => true).catch(() => false), false);
    assert.equal(await fs.stat(path.join(dir, MANIFEST_REL_PATH)).then(() => true).catch(() => false), false);
    // config preservado
    assert.equal(await fs.stat(path.join(dir, '.process-ai/config')).then(() => true).catch(() => false), true);
  });
});

test('uninstall --purge remove todo o .process-ai/', async () => {
  await withTmp(async (dir) => {
    const inst = new Installer(new FakeIdeSetup());
    await inst.install({ targetDir: dir, interactive: false });
    await inst.uninstall({ targetDir: dir, purge: true });
    assert.equal(await fs.stat(path.join(dir, '.process-ai')).then(() => true).catch(() => false), false);
  });
});

test('uninstall em clean (não-instalado) → not-installed (idempotente)', async () => {
  await withTmp(async (dir) => {
    const inst = new Installer(new FakeIdeSetup());
    const outcome = await inst.uninstall({ targetDir: dir });
    assert.equal(outcome.outcome, 'not-installed');
  });
});

test('status reflete o estado (clean / current)', async () => {
  await withTmp(async (dir) => {
    const inst = new Installer(new FakeIdeSetup());
    assert.equal((await inst.status(dir)).state.kind, 'clean');
    await inst.install({ targetDir: dir, interactive: false });
    assert.equal((await inst.status(dir)).state.kind, 'installed-current');
  });
});
