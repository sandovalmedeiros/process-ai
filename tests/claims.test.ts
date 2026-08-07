/**
 * tests/claims.test.ts — Claims de contrato/doc validadas contra consumo (Story 4.5).
 *
 * Verifica que headers, JSDoc e docs não afirmam enforcement que o código não cumpre.
 * Padrão: `doesNotMatch(/pattern/)` — se a claim é falsa, o teste falha.
 *
 * Inspirado no guard `doesNotMatch(/rascunho/i)` em zanoni-pop.test.ts:257.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// ---- T1: schema-core.ts não afirma leniência que não existe mais ----

test('schema-core.ts não afirma que non-objects são aceitos', async () => {
  const src = await readFile('toolkit/src/schema-core.ts', 'utf-8');
  // v1.1: não-objetos são REJEITADOS. Nenhuma doc deve afirmar o contrário.
  assert.doesNotMatch(src, /strings.*arrays.*válidos/i,
    'schema-core.ts não deve afirmar que strings/arrays são válidos');
  assert.doesNotMatch(src, /não-objeto.*válido/i,
    'schema-core.ts não deve afirmar que não-objetos são válidos');
});

test('schema-core.ts não afirma additionalProperties: true como política atual', async () => {
  const src = await readFile('toolkit/src/schema-core.ts', 'utf-8');
  // v1.1: additionalProperties: false. Claims de backward-compat devem ser históricas, não atuais.
  assert.doesNotMatch(src, /additionalProperties:\s*true.*backward/i,
    'schema-core.ts não deve ter additionalProperties: true marcado como backward-compat');
  assert.doesNotMatch(src, /POSTURA v1\s*\(leniente/i,
    'schema-core.ts não deve ter POSTURA v1 (leniente)');
});

test('schema-core.ts não afirma que required está comentado/desativado', async () => {
  const src = await readFile('toolkit/src/schema-core.ts', 'utf-8');
  assert.doesNotMatch(src, /required.*comentado/i,
    'schema-core.ts não deve dizer que required está comentado');
  assert.doesNotMatch(src, /sem campos obrigatórios/i,
    'schema-core.ts não deve dizer "sem campos obrigatórios"');
});

// ---- T2: pack-loader.ts claims consistentes ----

test('pack-loader.ts não afirma que required do núcleo é vazio', async () => {
  const src = await readFile('toolkit/src/pack-loader.ts', 'utf-8');
  assert.doesNotMatch(src, /required.*núcleo.*vazio/i,
    'pack-loader.ts não deve afirmar que required do núcleo é vazio');
  assert.doesNotMatch(src, /todos comentados/i,
    'pack-loader.ts não deve afirmar que required está comentado');
});

// ---- T3: Docs não afirmam claims falsas ----

test('docs/toolkit.md não afirma vocabulário de 7 tipos (são 9)', async () => {
  const doc = await readFile('docs/toolkit.md', 'utf-8');
  assert.doesNotMatch(doc, /\b7 tipos?\b/i,
    'docs/toolkit.md não deve afirmar 7 tipos de artefato');
});

test('docs/method-packs.md não referencia paths .ts para consumo', async () => {
  const doc = await readFile('docs/method-packs.md', 'utf-8');
  assert.doesNotMatch(doc, /\.\/toolkit\/src\/.*\.ts/,
    'docs/method-packs.md não deve referenciar paths .ts do toolkit/src');
  assert.doesNotMatch(doc, /require\s*\(\s*['"]/,
    'docs/method-packs.md não deve usar require() com path');
});
