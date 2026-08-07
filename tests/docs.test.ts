/**
 * tests/docs.test.ts — Drift de documentação (Story 4.4).
 *
 * Confere que claims em docs/ batem com o código real:
 * - Contagem de artifactTypes em docs/toolkit.md vs VALID_ARTIFACT_TYPES.length.
 * - Docs não contêm `require(` (projeto é ESM, "type": "module").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VALID_ARTIFACT_TYPES } from '../toolkit/src/schema-core.ts';

// ---- T1: Contagem de artifactTypes bate com a doc ----

test('docs/toolkit.md declara a contagem correta de artifactTypes', async () => {
  const doc = await readFile('docs/toolkit.md', 'utf-8');
  const realCount = VALID_ARTIFACT_TYPES.length;

  // Extrai o número da frase "Vocabulário com N tipos no v1:"
  const match = doc.match(/Vocabulário com (\d+) tipos? no v1:/);
  assert.ok(match, 'docs/toolkit.md deve conter "Vocabulário com N tipos no v1:"');
  const docCount = parseInt(match[1], 10);
  assert.equal(docCount, realCount,
    `docs/toolkit.md declara ${docCount} tipos, mas VALID_ARTIFACT_TYPES tem ${realCount}`);
});

// ---- T2: Verifica que a lista de tipos na doc contém todos os tipos reais ----

test('docs/toolkit.md lista todos os artifactTypes reais', async () => {
  const doc = await readFile('docs/toolkit.md', 'utf-8');

  // Extrai a lista de tipos da frase "Vocabulário com N tipos no v1: `a`, `b`, ..."
  const match = doc.match(/Vocabulário com \d+ tipos? no v1:\s*(.+?)\./);
  assert.ok(match, 'docs/toolkit.md deve listar os artifactTypes após a contagem');

  const listed = match[1]
    .replace(/\*+/g, '')  // strip bold/italic markers
    .split(',')
    .map(s => s.trim().replace(/`/g, ''))
    .filter(s => s.length > 0)
    .sort();

  const real = [...VALID_ARTIFACT_TYPES].sort();
  assert.deepEqual(listed, real,
    `Lista na doc não bate com VALID_ARTIFACT_TYPES`);
});

// ---- T3: Docs não usam require() — projeto é ESM ----

const DOC_FILES = ['docs/method-packs.md', 'docs/toolkit.md'];

for (const docPath of DOC_FILES) {
  test(`${docPath} não contém require( — projeto ESM`, async () => {
    const doc = await readFile(docPath, 'utf-8');
    // Permite menções em prosa como '"require" não existe' ou 'não require'
    // mas rejeita require('algum/arquivo') que seria instrução quebrada.
    const requireCall = doc.match(/require\s*\(\s*['"]/);
    assert.equal(requireCall, null,
      `${docPath} contém require() com path — instrução quebrada em ESM. Use import().`);
  });
}
