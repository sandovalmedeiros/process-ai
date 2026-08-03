/**
 * tests/pack-loader.test.ts — Method-pack loader + validador (AD-2, 3.2).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  validatePackToml,
  validatePackSchemas,
  loadPack,
  readConfig,
  PackError,
} from '../toolkit/src/pack-loader.ts';
import type { MethodPack } from '../toolkit/src/pack-loader.ts';
import { commit, CommitError } from '../toolkit/src/commit.ts';
import type { ProposePayload } from '../toolkit/src/engine-adapter.ts';

// ---- T1: validatePackToml ----

test('pack.toml válido → parse OK', () => {
  const toml = `
[pack]
name = "bpmn-sipoc"
version = "1.0.0"
description = "Pack padrão BPMN+SIPOC para v1"
artifact_types = ["sipoc", "value-chain", "flow"]
`;
  const m = validatePackToml(toml);
  assert.equal(m.name, 'bpmn-sipoc');
  assert.equal(m.version, '1.0.0');
  assert.equal(m.description, 'Pack padrão BPMN+SIPOC para v1');
  assert.deepEqual(m.artifactTypes, ['sipoc', 'value-chain', 'flow']);
});

test('pack.toml sem [pack] → PackError', () => {
  assert.throws(() => validatePackToml('name = "x"\nversion = "1.0.0"'), PackError);
});

test('pack.toml com campos proibidos → rejeitado (AD-2)', () => {
  const toml = `
pipeline = "fixa"
[pack]
name = "test"
version = "1.0.0"
artifact_types = ["sipoc"]
`;
  assert.throws(() => validatePackToml(toml), PackError);
});

test('pack.toml version inválida → PackError', () => {
  const toml = `
[pack]
name = "test"
version = "um-dois-tres"
artifact_types = ["sipoc"]
`;
  assert.throws(() => validatePackToml(toml), PackError);
});

test('pack.toml artifact_types vazio → PackError', () => {
  const toml = `
[pack]
name = "test"
version = "1.0.0"
artifact_types = []
`;
  assert.throws(() => validatePackToml(toml), PackError);
});

test('pack.toml name inválido (não-kebab) → PackError', () => {
  const toml = `
[pack]
name = "Bad Name!"
version = "1.0.0"
artifact_types = ["sipoc"]
`;
  assert.throws(() => validatePackToml(toml), PackError);
});

// ---- T1 hardening (code review Epic 3 / 3.2) ----

test('pack.toml com [pipeline] SECTION (não key=value) → PackError (AD-2)', () => {
  // Antes: só `pipeline = ...` era pego; `[pipeline]` como tabela passava despercebido.
  const toml = `
[pack]
name = "x"
version = "1.0.0"
artifact_types = ["sipoc"]

[pipeline]
stages = ["a", "b"]
`;
  assert.throws(() => validatePackToml(toml), (e: Error) => e instanceof PackError && /pipeline/.test(e.message));
});

test('pack.toml com chave dotted proibida (pipeline.stages) → PackError', () => {
  const toml = `
pipeline.stages = ["a"]

[pack]
name = "x"
version = "1.0.0"
artifact_types = ["sipoc"]
`;
  assert.throws(() => validatePackToml(toml), PackError);
});

test('pack.toml artifact_types multi-linha (forma canônica TOML) → parse OK', () => {
  // Antes: parser line-oriented virava [] silenciosamente.
  const toml = `
[pack]
name = "x"
version = "1.0.0"
artifact_types = [
  "sipoc",
  "flow",
]
`;
  const m = validatePackToml(toml);
  assert.deepEqual(m.artifactTypes, ['sipoc', 'flow']);
});

test('pack.toml com seção [other] NÃO sobrescreve [pack] (inPack reset)', () => {
  // Antes: inPack nunca era resetado → name em [metadata] sobrescrevia pack.name.
  const toml = `
[pack]
name = "good-pack"
version = "1.0.0"
artifact_types = ["sipoc"]

[metadata]
name = "overrider"
`;
  const m = validatePackToml(toml);
  assert.equal(m.name, 'good-pack', 'name de [pack] não pode ser sobrescrito por outra seção');
});

test('pack.toml com chave duplicada → PackError', () => {
  const toml = `
[pack]
name = "first"
name = "second"
version = "1.0.0"
artifact_types = ["sipoc"]
`;
  assert.throws(() => validatePackToml(toml), PackError);
});

// ---- T2 hardening (code review Epic 3 / 3.2) ----

test('validatePackSchemas: $ref substring (sipoc-extra) → inválido (match exato)', () => {
  // Antes: includes('sipoc') deixava "https://process-ai/schemas/sipoc-extra/v1" passar.
  const pack: MethodPack = {
    manifest: { name: 't', version: '1.0.0', description: '', artifactTypes: ['sipoc'] },
    schemas: { sipoc: { allOf: [{ '$ref': 'https://process-ai/schemas/sipoc-extra/v1' }] } },
    prompts: {},
    glossary: '',
  };
  const r = validatePackSchemas(pack);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('exatamente')));
});

test('validatePackSchemas: allOf vazio → inválido', () => {
  const pack: MethodPack = {
    manifest: { name: 't', version: '1.0.0', description: '', artifactTypes: ['sipoc'] },
    schemas: { sipoc: { allOf: [] } },
    prompts: {},
    glossary: '',
  };
  const r = validatePackSchemas(pack);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('allOf') || e.includes('$ref')));
});

test('validatePackSchemas: pack redeclara campo do núcleo (body) → inválido (AD-2)', () => {
  const pack: MethodPack = {
    manifest: { name: 't', version: '1.0.0', description: '', artifactTypes: ['sipoc'] },
    schemas: {
      sipoc: {
        allOf: [
          { '$ref': 'https://process-ai/schemas/sipoc/v1' },
          { properties: { body: { type: 'string', minLength: 999 } } },
        ],
      },
    },
    prompts: {},
    glossary: '',
  };
  const r = validatePackSchemas(pack);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('body') && e.includes('núcleo')));
});

test('validatePackSchemas: schema para tipo fora de artifact_types → inválido (cross-check)', () => {
  const pack: MethodPack = {
    manifest: { name: 't', version: '1.0.0', description: '', artifactTypes: ['sipoc'] },
    schemas: {
      flow: { allOf: [{ '$ref': 'https://process-ai/schemas/flow/v1' }] },
    },
    prompts: {},
    glossary: '',
  };
  const r = validatePackSchemas(pack);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('artifact_types')));
});

// ---- T2: validatePackSchemas ----

test('validatePackSchemas: pack sem schemas → válido', () => {
  const pack: MethodPack = {
    manifest: { name: 'test', version: '1.0.0', description: '', artifactTypes: ['sipoc'] },
    schemas: {},
    prompts: {},
    glossary: '',
  };
  const result = validatePackSchemas(pack);
  assert.equal(result.valid, true);
});

test('validatePackSchemas: schema que referencia artifactType inexistente → erro', () => {
  const pack: MethodPack = {
    manifest: { name: 'test', version: '1.0.0', description: '', artifactTypes: ['nao-existe'] },
    schemas: { 'nao-existe': { allOf: [{ '$ref': 'https://process-ai/schemas/nao-existe/v1' }] } },
    prompts: {},
    glossary: '',
  };
  const result = validatePackSchemas(pack);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('fora do vocabulário')));
});

test('validatePackSchemas: schema sem allOf/$ref → erro', () => {
  const pack: MethodPack = {
    manifest: { name: 'test', version: '1.0.0', description: '', artifactTypes: ['sipoc'] },
    schemas: { 'sipoc': { properties: { campo: { type: 'string' } } } },
    prompts: {},
    glossary: '',
  };
  const result = validatePackSchemas(pack);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('allOf') || e.includes('$ref')));
});

// ---- T3: loadPack + readConfig ----

test('loadPack: pack completo (toml + schemas + prompts + glossary)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-pack-'));
  try {
    const packDir = path.join(tmp, 'method-packs', 'test-pack');
    await fs.mkdir(path.join(packDir, 'schemas'), { recursive: true });
    await fs.mkdir(path.join(packDir, 'prompts'), { recursive: true });

    await fs.writeFile(path.join(packDir, 'pack.toml'), `
[pack]
name = "test-pack"
version = "1.0.0"
description = "Test pack"
artifact_types = ["sipoc", "flow"]
`.trim() + '\n', 'utf8');

    await fs.writeFile(path.join(packDir, 'schemas', 'sipoc.schema.json'), JSON.stringify({
      allOf: [
        { '$ref': 'https://process-ai/schemas/sipoc/v1' },
        { properties: { industry: { type: 'string' } } },
      ],
    }), 'utf8');

    await fs.writeFile(path.join(packDir, 'prompts', 'bento.md'), '# Bento prompt', 'utf8');
    await fs.writeFile(path.join(packDir, 'glossary.md'), '# Glossário', 'utf8');

    const pack = await loadPack(packDir);
    assert.equal(pack.manifest.name, 'test-pack');
    assert.equal(pack.manifest.version, '1.0.0');
    assert.equal(pack.prompts['bento'], '# Bento prompt');
    assert.ok(pack.glossary.includes('Glossário'));
    assert.ok('sipoc' in pack.schemas);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('loadPack: sem pack.toml → PackError', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-pack2-'));
  try {
    await assert.rejects(() => loadPack(tmp), PackError);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('readConfig: sem .process-ai/config → config vazia', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cfg-'));
  try {
    const config = await readConfig(tmp);
    assert.equal(config.activePack, undefined);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('readConfig: com active_pack → config populada', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cfg2-'));
  try {
    await fs.mkdir(path.join(tmp, '.process-ai'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.process-ai', 'config'), `
active_pack = "bpmn-sipoc"
pack_version = "1.0.0"
`, 'utf8');

    const config = await readConfig(tmp);
    assert.ok(config.activePack);
    assert.equal(config.activePack!.id, 'bpmn-sipoc');
    assert.equal(config.activePack!.version, '1.0.0');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- T4: Integração commit + pack_id ----

test('commit com pack ativo → carrega pack + estampa pack_id/version truthfully', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-pkcmt-'));
  try {
    // Cria um pack REAL em <root>/method-packs/<id>/ (commit agora carrega+valida).
    const packDir = path.join(tmp, 'method-packs', 'bpmn-sipoc');
    await fs.mkdir(path.join(packDir, 'schemas'), { recursive: true });
    await fs.writeFile(path.join(packDir, 'pack.toml'), `
[pack]
name = "bpmn-sipoc"
version = "1.0.0"
description = "Pack de teste"
artifact_types = ["sipoc"]
`.trim() + '\n', 'utf8');
    await fs.writeFile(
      path.join(packDir, 'schemas', 'sipoc.schema.json'),
      JSON.stringify({
        allOf: [
          { '$ref': 'https://process-ai/schemas/sipoc/v1' },
          { properties: { industry: { type: 'string' } } },
        ],
      }),
      'utf8',
    );

    // Config declara o pack ativo (versão corresponde ao pack real → sem warn).
    await fs.mkdir(path.join(tmp, '.process-ai'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.process-ai', 'config'), `
active_pack = "bpmn-sipoc"
pack_version = "1.0.0"
`, 'utf8');

    const payload: ProposePayload = {
      artifactType: 'sipoc',
      content: { body: '# SIPOC com pack', industry: 'servicos' },
    };
    const result = await commit(payload, { root: tmp });

    const mp = result.manifestPath.replace(/\\/g, '/');
    const manifestAbsPath = mp.startsWith('.process-ai/')
      ? path.join(tmp, mp)
      : path.resolve(tmp, mp);
    const manifestRaw = await fs.readFile(manifestAbsPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);

    assert.equal(manifest.pack_id, 'bpmn-sipoc');
    assert.equal(manifest.pack_version, '1.0.0'); // truthful (do pack carregado, não da config)
    assert.equal(manifest.artifactType, 'sipoc');
    assert.ok(manifest.sha256);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('commit com active_pack inexistente → CommitError, sem ghost pack_id (abort-before-write)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-ghost-'));
  try {
    await fs.mkdir(path.join(tmp, '.process-ai'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.process-ai', 'config'), `
active_pack = "pack-fantasma"
`, 'utf8');

    const payload: ProposePayload = {
      artifactType: 'sipoc',
      content: { body: '# nunca commitado' },
    };
    // Antes: commit estampava pack_id="pack-fantasma" sem validar (ghost). Agora: CommitError.
    await assert.rejects(() => commit(payload, { root: tmp }), CommitError);

    // Zero side-effects: nenhum artefato escrito.
    const outDir = path.join(tmp, '_process-ai_output');
    const exists = await fs.stat(outDir).then(() => true).catch(() => false);
    assert.equal(exists, false, 'abort-before-write: nenhum artefato escrito');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('commit sem pack ativo → manifesto sem pack_id (backward-compat)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-nopk-'));
  try {
    const payload: ProposePayload = {
      artifactType: 'sipoc',
      content: { body: '# SIPOC sem pack' },
    };
    const result = await commit(payload, { root: tmp });

    const mp = result.manifestPath.replace(/\\/g, '/');
    const manifestAbsPath = mp.startsWith('.process-ai/')
      ? path.join(tmp, mp)
      : path.resolve(tmp, mp);
    const manifestRaw = await fs.readFile(manifestAbsPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);

    assert.equal(manifest.pack_id, undefined, 'sem pack → sem pack_id no manifesto');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- 3.3: Load do pack real bpmn-sipoc ----

test('3.3: loadPack do pack real bpmn-sipoc → sucesso + schemas válidos', async () => {
  const packDir = path.resolve(import.meta.dirname, '..', 'method-packs', 'bpmn-sipoc');
  const pack = await loadPack(packDir);

  assert.equal(pack.manifest.name, 'bpmn-sipoc');
  assert.equal(pack.manifest.version, '1.0.0');
  assert.deepEqual(pack.manifest.artifactTypes, ['sipoc', 'value-chain', 'flow']);

  // Schemas carregados
  assert.ok('sipoc' in pack.schemas, 'deve ter schema sipoc');
  assert.ok('value-chain' in pack.schemas, 'deve ter schema value-chain');
  assert.ok('flow' in pack.schemas, 'deve ter schema flow');

  // Prompts carregados
  assert.ok('bento' in pack.prompts, 'deve ter prompt bento');
  assert.ok('miguel' in pack.prompts, 'deve ter prompt miguel');
  assert.ok('julia' in pack.prompts, 'deve ter prompt julia');
  assert.ok('zanoni' in pack.prompts, 'deve ter prompt zanoni');

  // Glossary
  assert.ok(pack.glossary.includes('BPMN'), 'glossary deve conter termos BPMN');

  // Validação de schemas
  const result = validatePackSchemas(pack);
  assert.equal(result.valid, true, `schemas do pack devem ser válidos: ${result.errors.join('; ')}`);
});

// ---- T5: AD-3 guardrail ----

test('AD-3: pack-loader.ts existe no core e exporta funções', async () => {
  assert.equal(typeof validatePackToml, 'function');
  assert.equal(typeof validatePackSchemas, 'function');
  assert.equal(typeof loadPack, 'function');
  assert.equal(typeof readConfig, 'function');
  const p = path.resolve(import.meta.dirname, '..', 'toolkit', 'src', 'pack-loader.ts');
  const st = await fs.stat(p);
  assert.ok(st.isFile());
});
