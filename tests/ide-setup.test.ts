/**
 * tests/ide-setup.test.ts — ClaudeCodeIdeSetup (adapter install-time concreto).
 *
 * Cobertura: setupIde instala as skills reais e retorna files cujo sha256 ==
 * sha256File do SKILL.md on-disk (consistência do manifest); ide == 'claude-code';
 * uninstallIde remove só process-ai*.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ClaudeCodeIdeSetup } from '../toolkit/adapters/claude-code/ide-setup.ts';
import { sha256File } from '../toolkit/src/installer/manifest.ts';

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-ide-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('setupIde instala as 5 skills e retorna ide=claude-code', async () => {
  await withTmp(async (dir) => {
    const setup = new ClaudeCodeIdeSetup();
    const result = await setup.setupIde(dir);
    assert.equal(result.ide, 'claude-code');
    assert.ok(result.files.length >= 5, `esperado >=5 skills, veio ${result.files.length}`);
    // o condutor está presente
    assert.ok(result.files.some((f) => f.path === '.claude/skills/process-ai/SKILL.md'));
  });
});

test('setupIde: cada sha256 retornado bate com o sha256File on-disk', async () => {
  await withTmp(async (dir) => {
    const result = await new ClaudeCodeIdeSetup().setupIde(dir);
    for (const f of result.files) {
      const onDisk = await sha256File(path.join(dir, f.path));
      assert.equal(onDisk, f.sha256, `hash divergente para ${f.path}`);
    }
  });
});

test('uninstallIde remove só process-ai* e deixa outras skills intactas', async () => {
  await withTmp(async (dir) => {
    const setup = new ClaudeCodeIdeSetup();
    await setup.setupIde(dir);
    // planta uma skill "aldeã" não-process-ai
    const other = path.join(dir, '.claude/skills', 'other-tool', 'SKILL.md');
    await fs.mkdir(path.dirname(other), { recursive: true });
    await fs.writeFile(other, 'outra skill', 'utf8');

    const res = await setup.uninstallIde(dir);
    // removeu as process-ai*
    assert.ok(res.removed.some((r) => r === '.claude/skills/process-ai'));
    assert.equal(await fs.stat(path.join(dir, '.claude/skills/process-ai')).then(() => true).catch(() => false), false);
    // preservou a skill aldeã
    assert.equal(await fs.stat(other).then(() => true).catch(() => false), true);
  });
});

test('uninstallIde idempotente em dir sem skills', async () => {
  await withTmp(async (dir) => {
    const res = await new ClaudeCodeIdeSetup().uninstallIde(dir);
    assert.deepEqual(res.removed, []);
  });
});
