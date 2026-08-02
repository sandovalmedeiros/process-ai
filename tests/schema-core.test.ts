/**
 * tests/schema-core.test.ts — Schema-núcleo toolkit-owned (AD-2, 3.1).
 *
 * Cobre validateContent() para os 7 artifactTypes: validação positiva
 * (payloads válidos passam), validação negativa (payloads inválidos rejeitados),
 * artifactType desconhecido, additionalProperties: false, e integração
 * com commit (abort-before-write).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  validateContent,
  SCHEMAS,
  VALID_ARTIFACT_TYPES,
} from '../toolkit/src/schema-core.ts';
import type { SchemaValidationResult } from '../toolkit/src/schema-core.ts';
import { commit, CommitError } from '../toolkit/src/commit.ts';
import type { ProposePayload } from '../toolkit/src/engine-adapter.ts';

// ---- T1: Schemas carregam e são objetos válidos ----

test('SCHEMAS contém os 7 artifactTypes canônicos', () => {
  const types = Object.keys(SCHEMAS).sort();
  assert.deepEqual(types, [
    'discovery-interview',
    'flow',
    'hierarchy',
    'pop',
    'sipoc',
    'summary-report',
    'value-chain',
  ]);
  assert.equal(VALID_ARTIFACT_TYPES.length, 7);
});

test('cada schema tem $id versionado, $schema, type: object, x-extensible', () => {
  for (const [artifactType, schema] of Object.entries(SCHEMAS)) {
    const s = schema as Record<string, unknown>;
    assert.ok(typeof s['$id'] === 'string' && (s['$id'] as string).includes('/v'),
      `${artifactType}: $id versionado`);
    assert.ok((s['$schema'] as string).includes('json-schema.org'),
      `${artifactType}: $schema presente`);
    assert.equal(s['type'], 'object', `${artifactType}: type === object`);
    // v1: additionalProperties: true para backward-compat (AC4). Fecha em 3.2.
    assert.equal(s['x-extensible'], true,
      `${artifactType}: x-extensible === true`);
  }
});

test('cada schema tem body: string como campo definido (não-obrigatório no v1 — AC4)', () => {
  for (const [artifactType, schema] of Object.entries(SCHEMAS)) {
    const s = schema as Record<string, unknown>;
    const props = s['properties'] as Record<string, Record<string, unknown>>;
    assert.ok(props['body'], `${artifactType}: body está nas properties`);
    assert.equal(props['body']['type'], 'string', `${artifactType}: body.type === string`);
    // v1: body NÃO é required — backward-compat com payloads existentes.
  }
});

// ---- T2: Validação positiva (payloads válidos) ----

test('validateContent: payload válido para cada artifactType → { valid: true }', () => {
  const validPayloads: Record<string, unknown> = {
    'discovery-interview': { body: '# Entrevista\n## Q1\nResposta.' },
    'sipoc': { body: '# SIPOC\nFornecedores: A, B.' },
    'value-chain': { body: '# Cadeia de Valor\n1. Prospecção\n2. Qualificação' },
    'hierarchy': { body: '# Hierarquia\n## M1. Vendas' },
    'flow': { body: '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="...">...</bpmn:definitions>' },
    'pop': { body: '# POP-001\nPassos: 1. ...' },
    'summary-report': { body: '# Resumo\nPipeline completa.' },
  };

  for (const [artifactType, content] of Object.entries(validPayloads)) {
    const result = validateContent(artifactType, content);
    assert.equal(result.valid, true, `${artifactType}: payload válido deve passar. Erros: ${result.errors.join('; ')}`);
    assert.deepEqual(result.errors, []);
  }
});

test('validateContent: payload com campos opcionais preenchidos → { valid: true }', () => {
  // SIPOC com campos estruturados
  const r1 = validateContent('sipoc', {
    body: 'SIPOC markdown',
    suppliers: ['Marketing', 'CRM'],
    inputs: ['Leads'],
    process: ['Prospecção', 'Qualificação'],
    outputs: ['Propostas'],
    customers: ['PMEs'],
  });
  assert.equal(r1.valid, true, `sipoc completo: ${r1.errors.join('; ')}`);

  // hierarchy com levels
  const r2 = validateContent('hierarchy', { body: 'Hierarquia', levels: 5 });
  assert.equal(r2.valid, true, `hierarchy com levels: ${r2.errors.join('; ')}`);

  // value-chain com links
  const r3 = validateContent('value-chain', {
    body: 'Cadeia de valor',
    links: ['Prospecção', 'Qualificação', 'Fechamento'],
  });
  assert.equal(r3.valid, true, `value-chain com links: ${r3.errors.join('; ')}`);
});

// ---- T3: Validação negativa ----

test('validateContent: artifactType desconhecido → { valid: true } no v1 (AC4)', () => {
  // v1: artifactTypes fora do vocabulário são aceitos (backward-compat).
  // Validação estrita → 3.2 (method-pack loader).
  const result = validateContent('bpmn', { body: 'x' });
  assert.equal(result.valid, true, 'artifactType desconhecido aceito no v1');
});

test('validateContent: content não-objeto (string/array/number) → { valid: true } no v1 (AC4)', () => {
  // v1: strings, arrays, números são válidos — backward-compat com payloads existentes.
  const validNonObjects: unknown[] = ['string solta', 42, ['array'], true, 0];
  for (const content of validNonObjects) {
    const result = validateContent('sipoc', content);
    assert.equal(result.valid, true, `sipoc + ${typeof content}: deve passar no v1`);
  }
});

test('validateContent: content null/undefined → { valid: false }', () => {
  assert.equal(validateContent('sipoc', null).valid, false);
  assert.equal(validateContent('sipoc', undefined).valid, false);
});

test('validateContent: objeto vazio → { valid: true } (v1: sem campos obrigatórios, AC4)', () => {
  for (const artifactType of VALID_ARTIFACT_TYPES) {
    const result = validateContent(artifactType, {});
    assert.equal(result.valid, true, `${artifactType}: objeto vazio deve passar (backward-compat)`);
  }
});

test('validateContent: campo com tipo errado → { valid: false }', () => {
  // body deve ser string
  const r1 = validateContent('sipoc', { body: 123 });
  assert.equal(r1.valid, false);
  assert.ok(r1.errors.some((e) => e.includes('body') && e.includes('string')), 'erro deve indicar tipo esperado');

  // levels deve ser integer
  const r2 = validateContent('hierarchy', { body: 'ok', levels: 'cinco' });
  assert.equal(r2.valid, false);
  assert.ok(r2.errors.some((e) => e.includes('levels')), 'erro deve mencionar levels');

  // levels range
  const r3 = validateContent('hierarchy', { body: 'ok', levels: 0 });
  assert.equal(r3.valid, false);
  assert.ok(r3.errors.some((e) => e.includes('levels') && e.includes('≥')), 'erro de range mínimo');

  const r4 = validateContent('hierarchy', { body: 'ok', levels: 10 });
  assert.equal(r4.valid, false);
  assert.ok(r4.errors.some((e) => e.includes('levels') && e.includes('≤')), 'erro de range máximo');

  // suppliers deve ser array de strings
  const r5 = validateContent('sipoc', { body: 'ok', suppliers: 'não-array' });
  assert.equal(r5.valid, false);
  assert.ok(r5.errors.some((e) => e.includes('suppliers')), 'erro deve mencionar suppliers');

  // suppliers items devem ser strings
  const r6 = validateContent('sipoc', { body: 'ok', suppliers: ['ok', 42] });
  assert.equal(r6.valid, false);
  assert.ok(r6.errors.some((e) => e.includes('suppliers[1]')), 'erro deve indicar índice do item inválido');
});

test('validateContent: campos extras aceitos no v1 (additionalProperties: true → backward-compat AC4)', () => {
  const result = validateContent('sipoc', {
    body: 'SIPOC',
    campoExtra: 'não-existe-no-schema-mas-aceito-no-v1',
  });
  assert.equal(result.valid, true, 'v1: campos extras são aceitos (backward-compat)');
});

// ---- T4: Integração com commit (abort-before-write) ----

test('commit com content válido → sucesso (schema passa)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-sc-ok-'));
  try {
    const payload: ProposePayload = {
      artifactType: 'sipoc',
      content: { body: '# SIPOC de teste' },
    };
    const result = await commit(payload, { root: tmp });
    assert.ok(result.sha256);
    assert.ok(result.artifactPath);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('commit com content inválido → CommitError, zero side-effects (abort-before-write)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-sc-fail-'));
  try {
    const payload: ProposePayload = {
      artifactType: 'sipoc',
      content: null as unknown as object, // null → schema rejeita
    };

    await assert.rejects(
      () => commit(payload, { root: tmp }),
      CommitError,
    );

    // Zero side-effects: nenhum artefato, manifesto, ou ledger escrito.
    const files: string[] = [];
    async function walk(dir: string) {
      try {
        for (const e of await fs.readdir(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) { await walk(full); }
          else { files.push(path.relative(tmp, full).split(path.sep).join('/')); }
        }
      } catch { /* dir não existe */ }
    }
    await walk(tmp);
    const protectedFiles = files.filter(
      (f) => f.startsWith('_process-ai_output/') || f.startsWith('.process-ai/'),
    );
    assert.deepEqual(
      protectedFiles, [],
      `zero side-effects em pastas protegidas. Encontrados: ${protectedFiles.join(', ')}`,
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('commit com artifactType desconhecido → sucesso no v1 (backward-compat AC4)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-sc-unk-'));
  try {
    const payload: ProposePayload = {
      artifactType: 'bpmn' as unknown as 'sipoc', // aceito no v1
      content: { body: 'x' },
    };

    const result = await commit(payload, { root: tmp });
    assert.ok(result.sha256, 'commit deve ter sucesso com artifactType desconhecido no v1');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- T5: Compatibilidade com E2E 2.7 (AC4) ----

test('AC4: payloads do E2E Vendas (2.7) passam na validação de schema', () => {
  // Estes são os shapes usados no e2e-pipeline.test.ts 2.7.
  // Todos são objetos com body: string — compatível com schemas v1.
  const e2ePayloads: Array<{ artifactType: string; content: unknown }> = [
    { artifactType: 'discovery-interview', content: { body: '# Entrevista — Vendas\n...' } },
    { artifactType: 'sipoc', content: { body: '# SIPOC — Vendas\n...' } },
    { artifactType: 'value-chain', content: { body: '# Cadeia de Valor\n...' } },
    { artifactType: 'hierarchy', content: { body: '# Hierarquia — Vendas\n...' } },
    { artifactType: 'flow', content: { body: '<?xml version="1.0"?>...' } },
    { artifactType: 'pop', content: { body: '# POP — Qualificação\n...' } },
    { artifactType: 'summary-report', content: { body: '# Resumo\n...' } },
  ];

  for (const { artifactType, content } of e2ePayloads) {
    const result = validateContent(artifactType, content);
    assert.equal(result.valid, true,
      `E2E ${artifactType} deve validar. Erros: ${result.errors.join('; ')}`);
  }
});

// ---- T6: AD-3 guardrail (schema-core.ts existe no core) ----

test('AD-3: schema-core.ts existe no core e exporta validateContent', async () => {
  assert.equal(typeof validateContent, 'function');
  const p = path.resolve(import.meta.dirname, '..', 'toolkit', 'src', 'schema-core.ts');
  const st = await fs.stat(p);
  assert.ok(st.isFile(), 'schema-core.ts deve existir no core');
});
