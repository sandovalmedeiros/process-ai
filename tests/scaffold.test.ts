/**
 * tests/scaffold.test.ts — AC1: scaffold executável em Node 24 LTS
 * (declaração de engines, type:module, bin, estrutura de pastas).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

test('AC1: package.json declara engines.node compatível com 24 LTS', () => {
  assert.ok(pkg.engines?.node, 'package.json deve declarar engines.node');
  const m = String(pkg.engines.node).match(/(\d+)/);
  assert.ok(m, `engines.node inválido: ${pkg.engines.node}`);
  assert.ok(
    Number(m[1]) >= 24,
    `engines.node deve ser >= 24 (encontrado: ${pkg.engines.node})`,
  );
});

test('AC1: package.json declara type:module (ESM) e bin do bootstrap', () => {
  assert.equal(pkg.type, 'module', 'package.json deve declarar "type": "module"');
  assert.ok(pkg.bin?.['process-ai'], 'package.json deve declarar bin.process-ai apontando para o bootstrap');
});

test('AC1: estrutura de pastas do scaffold existe', () => {
  const dirs = [
    'skills',
    'skills/process-ai',
    'toolkit/src',
    'toolkit/adapters/claude-code',
    'method-packs',
    'bin',
    'templates',
  ];
  for (const dir of dirs) {
    const full = path.join(REPO_ROOT, dir);
    assert.ok(
      existsSync(full) && statSync(full).isDirectory(),
      `pasta do scaffold deve existir: ${dir}`,
    );
  }
});
