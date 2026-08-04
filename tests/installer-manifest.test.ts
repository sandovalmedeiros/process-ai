/**
 * tests/installer-manifest.test.ts — manifest TOML + sha256 + integridade.
 *
 * Cobertura: sha256Content/sha256File (vetor conhecido); write→read round-trip;
 * parsing de [[files]]; tolerância a comentários/blank; escape de aspas/newline
 * (injeção, espelho do F8 de install.test.ts); ordenação determinística por path;
 * computeIntegrity (missing/modified).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  MANIFEST_REL_PATH,
  sha256Content,
  sha256File,
  readManifest,
  writeManifest,
  computeIntegrity,
  type Manifest,
} from '../toolkit/src/installer/manifest.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-manifest-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const SAMPLE: Manifest = {
  install: {
    framework_version: '0.2.1',
    installed_at: '2026-08-04T12:00:00.000Z',
    install_type: 'fresh',
    ide: 'claude-code',
    active_pack: 'bpmn-sipoc',
  },
  files: [
    { path: '.claude/skills/process-ai-bento/SKILL.md', sha256: 'b'.repeat(64) },
    { path: '.claude/skills/process-ai/SKILL.md', sha256: 'a'.repeat(64) },
  ],
};

test('sha256Content: vetor conhecido ("hello")', () => {
  assert.equal(
    sha256Content('hello'),
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  );
});

test('sha256File: igual a sha256Content do mesmo conteúdo', async () => {
  await withTmp(async (dir) => {
    const f = path.join(dir, 'x.txt');
    await fs.writeFile(f, 'hello', 'utf8');
    assert.equal(await sha256File(f), sha256Content('hello'));
  });
});

test('readManifest: ausente → null (instalação limpa)', async () => {
  await withTmp(async (dir) => {
    assert.equal(await readManifest(dir), null);
  });
});

test('write→read round-trip preserva install + files (ordenados por path)', async () => {
  await withTmp(async (dir) => {
    await writeManifest(dir, SAMPLE);
    const got = await readManifest(dir);
    assert.deepEqual(got?.install, SAMPLE.install);
    // writeManifest ordena por path (localeCompare): '-' (0x2D) < '/' (0x2F) →
    // 'process-ai-bento/...' vem ANTES de 'process-ai/...'.
    assert.deepEqual(
      got?.files.map((f) => f.path),
      ['.claude/skills/process-ai-bento/SKILL.md', '.claude/skills/process-ai/SKILL.md'],
    );
    assert.equal(got?.files[1].sha256, 'a'.repeat(64)); // process-ai (sha 'a') é o 2º
  });
});

test('readManifest: tolerante a comentários e linhas em branco', async () => {
  await withTmp(async (dir) => {
    const rel = path.join(dir, MANIFEST_REL_PATH);
    await fs.mkdir(path.dirname(rel), { recursive: true });
    await fs.writeFile(
      rel,
      [
        '# comentário topo',
        '',
        '[install]',
        'framework_version = "0.2.1"  # inline',
        'installed_at = "2026-08-04T12:00:00.000Z"',
        'install_type = "update"',
        'ide = "claude-code"',
        'active_pack = "bpmn-sipoc"',
        '',
        '[[files]]',
        'path = ".claude/skills/process-ai/SKILL.md"',
        'sha256 = "' + 'a'.repeat(64) + '"',
        '',
      ].join('\n'),
      'utf8',
    );
    const got = await readManifest(dir);
    assert.equal(got?.install.install_type, 'update');
    assert.equal(got?.files.length, 1);
  });
});

test('escape: aspas/newline no active_pack não corrompem o round-trip', async () => {
  await withTmp(async (dir) => {
    const malicious: Manifest = {
      install: {
        framework_version: '0.2.1',
        installed_at: '2026-08-04T12:00:00.000Z',
        install_type: 'fresh',
        ide: 'claude-code',
        active_pack: 'evil"\nframework_version = "9.9.9',
      },
      files: [],
    };
    await writeManifest(dir, malicious);
    const got = await readManifest(dir);
    // o valor é preservado como string única (não vira chave nova)
    assert.equal(got?.install.framework_version, '0.2.1');
    assert.ok(got?.install.active_pack.includes('evil'));
  });
});

test('computeIntegrity: tudo presente e batendo → vazio', async () => {
  await withTmp(async (dir) => {
    const rel = '.claude/skills/process-ai/SKILL.md';
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, 'conteudo', 'utf8');
    const manifest: Manifest = {
      install: SAMPLE.install,
      files: [{ path: rel, sha256: sha256Content('conteudo') }],
    };
    const report = await computeIntegrity(dir, manifest);
    assert.deepEqual(report, { missing: [], modified: [] });
  });
});

test('computeIntegrity: arquivo sumiu → missing; editado → modified', async () => {
  await withTmp(async (dir) => {
    const rel = '.claude/skills/process-ai/SKILL.md';
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, 'original', 'utf8');
    const manifest: Manifest = {
      install: SAMPLE.install,
      files: [
        { path: rel, sha256: sha256Content('original') },
        { path: '.claude/skills/process-ai-bento/SKILL.md', sha256: 'z'.repeat(64) },
      ],
    };
    // bento não existe no disco → missing
    let report = await computeIntegrity(dir, manifest);
    assert.deepEqual(report.missing, ['.claude/skills/process-ai-bento/SKILL.md']);

    // edita o condutor → modified
    await fs.writeFile(abs, 'editado', 'utf8');
    report = await computeIntegrity(dir, manifest);
    assert.ok(report.modified.includes(rel));
  });
});

test('smoke: o repo raiz tem package.json name process-ai (sanidade do ambiente)', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'process-ai');
});
