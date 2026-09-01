/**
 * tests/installer-engines.test.ts — catálogo + detecção (engines.ts).
 *
 * Espelho do detector do Reversa: 13 engines, só claude-code supported em v1,
 * detecção por marcador no disco OU CLI no PATH. `commandExists` é SEMPRE
 * injetado (nunca executa `where`/`which` — ambiente de teste não-determinístico).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINES, detectEngines } from '../toolkit/src/installer/engines.ts';

const NEVER: { commandExists(cmd: string): boolean } = { commandExists: () => false };

test('catálogo: 13 engines (espelho do Reversa), só claude-code supported', () => {
  assert.equal(ENGINES.length, 13);
  assert.deepEqual(
    ENGINES.filter((e) => e.supported).map((e) => e.id),
    ['claude-code'],
  );
  assert.deepEqual(
    ENGINES.map((e) => e.id),
    [
      'claude-code', 'codex', 'cursor', 'gemini-cli', 'windsurf', 'antigravity',
      'kiro', 'opencode', 'cline', 'roo-code', 'github-copilot', 'aider', 'amazon-q',
    ],
  );
});

test('detecção: marcadores no disco (.claude/, AGENTS.md, .github/copilot-instructions.md)', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pa-eng-'));
  try {
    mkdirSync(path.join(tmp, '.claude'));
    writeFileSync(path.join(tmp, 'AGENTS.md'), '# x');
    mkdirSync(path.join(tmp, '.github'));
    writeFileSync(path.join(tmp, '.github', 'copilot-instructions.md'), '# x');
    const got = detectEngines(tmp, NEVER); // exists = fs real (só os arquivos criados acima)
    const byId = new Map(got.map((e) => [e.id, e.detected]));
    assert.equal(byId.get('claude-code'), true);
    assert.equal(byId.get('codex'), true);
    assert.equal(byId.get('github-copilot'), true);
    assert.equal(byId.get('cursor'), false);
    assert.equal(byId.get('amazon-q'), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('detecção: CLI no PATH (commandExists injetado) marca como detectada', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pa-eng-'));
  try {
    const got = detectEngines(tmp, { exists: () => false, commandExists: (cmd) => cmd === 'gemini' });
    const gemini = got.find((e) => e.id === 'gemini-cli');
    assert.equal(gemini?.detected, true);
    assert.equal(got.find((e) => e.id === 'claude-code')?.detected, false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('detecção: target vazio → nada detectado; fail-soft por engine', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pa-eng-'));
  try {
    const got = detectEngines(tmp, { ...NEVER, exists: () => { throw new Error('boom'); } });
    assert.ok(got.every((e) => e.detected === false), 'erro de detecção vira false, não throw');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
