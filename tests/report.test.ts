/**
 * tests/report.test.ts — Relatório de confiança CONSOLIDADO (2.5: AC2, AC3).
 *
 * Cobre reportConfidence(root): scan completo do ledger de confiança com
 * breakdown por artifactType, lista rica por nível, reverse-index,
 * excerpt-status, órfãos listados, e renderização markdown pt-BR.
 *
 * Preserva a cobertura 1.5 (contagens zeradas, resiliência, markdown básico)
 * e estende com os novos recursos 2.5.
 *
 * AD-3: report.ts mora no core (só node:* + relativos); o guardrail
 * tests/import-boundary.test.ts o cobre automaticamente.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { reportConfidence, formatConfidenceReport } from '../toolkit/src/report.ts';
import type { ConfidenceReport, ReportItem, ExcerptStatus } from '../toolkit/src/report.ts';
import { commit, sha256, canonicalize } from '../toolkit/src/commit.ts';
import type { ProposePayload } from '../toolkit/src/engine-adapter.ts';

function metaPath(root: string, ...parts: string[]): string {
  return path.join(root, '.process-ai', ...parts);
}

/** Escreve um ledger de confiança com as entradas fornecidas (uma por linha JSONL). */
async function writeLedger(root: string, entries: Array<Record<string, unknown>>): Promise<void> {
  const ledgerPath = metaPath(root, 'confidence-ledger.jsonl');
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(ledgerPath, lines, 'utf8');
}

/** Cria um manifesto fake com artifactPath para testes de excerpt-status. */
async function createManifest(
  root: string,
  artifactType: string,
  sha: string,
  artifactPathRel: string,
): Promise<string> {
  const dir = metaPath(root, 'manifests');
  await fs.mkdir(dir, { recursive: true });
  const manifestPath = path.join(dir, `${artifactType}-${sha}.json`);
  await fs.writeFile(manifestPath, JSON.stringify({
    sha256: sha,
    artifactType,
    artifactPath: artifactPathRel,
  }), 'utf8');
  return manifestPath;
}

// ---- 1.5 regression: contagens zeradas, resiliência ----

test('1.5-regression: diretório vazio (sem .process-ai/) → contagens zeradas, stage unknown, sem artefatos', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-empty-'));
  try {
    const report = await reportConfidence(tmp);
    assert.deepEqual(report.counts, { '🟢': 0, '🟡': 0, '🔴': 0 });
    assert.equal(report.totalClaims, 0);
    assert.deepEqual(report.artifacts, []);
    assert.equal(report.orphans, 0);
    assert.deepEqual(report.orphanList, []);
    assert.equal(report.stage, 'init');
    assert.deepEqual(report.breakdown, []);
    assert.deepEqual(report.itemsByLevel, { '🟢': [], '🟡': [], '🔴': [] });
    assert.deepEqual(report.reverseIndex, {});
    assert.equal(typeof report.generatedAt, 'string');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('1.5-regression: ledger com claims mistos (2🟢, 1🟡, 1🔴) → contagens corretas por nível VALIDADO', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-mix-'));
  try {
    await writeLedger(tmp, [
      { claimId: 'a-x-0', artifactType: 'sipoc', artifactSha256: 'x', proposed: '🟢', validated: '🟢', validatedAt: '2026-08-01T00:00:00.000Z' },
      { claimId: 'a-x-1', artifactType: 'sipoc', artifactSha256: 'x', proposed: '🟢', validated: '🟢', validatedAt: '2026-08-01T00:00:00.000Z' },
      { claimId: 'a-y-0', artifactType: 'hierarchy', artifactSha256: 'y', proposed: '🟡', validated: '🟡', validatedAt: '2026-08-01T00:00:00.000Z' },
      { claimId: 'a-z-0', artifactType: 'bpmn', artifactSha256: 'z', proposed: '🔴', validated: '🔴', validatedAt: '2026-08-01T00:00:00.000Z' },
    ]);

    const report = await reportConfidence(tmp);
    assert.deepEqual(report.counts, { '🟢': 2, '🟡': 1, '🔴': 1 });
    assert.equal(report.totalClaims, 4);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('1.5-regression: contagem usa nível VALIDADO (não proposed) — honestidade AD-5/NFR-1', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-deg-'));
  try {
    await writeLedger(tmp, [
      { claimId: 'a-x-0', artifactType: 'sipoc', artifactSha256: 'x', proposed: '🟢', validated: '🟡', degradationReason: 'unresolved-source', validatedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    const report = await reportConfidence(tmp);
    assert.deepEqual(report.counts, { '🟢': 0, '🟡': 1, '🔴': 0 });
    assert.equal(report.totalClaims, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('1.5-regression: lista de artefatos reflete o checkpoint (após commit real)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-art-'));
  try {
    const res = await commit({ artifactType: 'sipoc', content: { a: 1 } }, { root: tmp });
    const report = await reportConfidence(tmp);
    assert.equal(report.artifacts.length, 1);
    assert.equal(report.artifacts[0].sha256, res.sha256);
    assert.equal(report.artifacts[0].artifactType, 'sipoc');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('1.5-regression: ledger vazio (arquivo existe mas sem linhas) → contagens zeradas', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-blank-'));
  try {
    const ledgerPath = metaPath(tmp, 'confidence-ledger.jsonl');
    await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
    await fs.writeFile(ledgerPath, '', 'utf8');

    const report = await reportConfidence(tmp);
    assert.deepEqual(report.counts, { '🟢': 0, '🟡': 0, '🔴': 0 });
    assert.equal(report.totalClaims, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('1.5-regression: ledger com linhas corrompidas → ignora e conta só as válidas', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-corr-'));
  try {
    const valid = JSON.stringify({ claimId: 'a-x-0', artifactType: 'sipoc', artifactSha256: 'x', proposed: '🟢', validated: '🟢', validatedAt: '2026-08-01T00:00:00.000Z' });
    await writeLedger(tmp, [
      JSON.parse(valid),
    ]);
    // Append linha corrompida + duplicata manualmente
    const ledgerPath = metaPath(tmp, 'confidence-ledger.jsonl');
    await fs.appendFile(ledgerPath, 'não é json { inválido\n' + valid + '\n', 'utf8');

    const report = await reportConfidence(tmp);
    // Dedupe-on-read: segunda ocorrência da mesma chave substitui a primeira.
    // Linha corrompida ignorada. Resultado: 1 entrada única.
    assert.deepEqual(report.counts, { '🟢': 1, '🟡': 0, '🔴': 0 });
    assert.equal(report.totalClaims, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- 2.5: AC3 — Breakdown por artifactType ----

test('AC3/2.5: breakdown por artifactType agrupa corretamente', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-bd-'));
  try {
    await writeLedger(tmp, [
      { claimId: 'sipoc-x-0', artifactType: 'sipoc', artifactSha256: 'x', proposed: '🟢', validated: '🟢', validatedAt: '2026-08-01T00:00:00.000Z' },
      { claimId: 'sipoc-x-1', artifactType: 'sipoc', artifactSha256: 'x', proposed: '🟡', validated: '🟡', validatedAt: '2026-08-01T00:00:00.000Z' },
      { claimId: 'hier-y-0', artifactType: 'hierarchy', artifactSha256: 'y', proposed: '🟢', validated: '🟢', validatedAt: '2026-08-01T00:00:00.000Z' },
      { claimId: 'hier-y-1', artifactType: 'hierarchy', artifactSha256: 'y', proposed: '🔴', validated: '🔴', validatedAt: '2026-08-01T00:00:00.000Z' },
      { claimId: 'hier-y-2', artifactType: 'hierarchy', artifactSha256: 'y', proposed: '🟡', validated: '🟡', validatedAt: '2026-08-01T00:00:00.000Z' },
    ]);

    const report = await reportConfidence(tmp);
    assert.equal(report.breakdown.length, 2);

    const sipoc = report.breakdown.find((b) => b.artifactType === 'sipoc');
    assert.ok(sipoc);
    assert.equal(sipoc.sha256, 'x');
    assert.deepEqual(sipoc.counts, { '🟢': 1, '🟡': 1, '🔴': 0 });

    const hier = report.breakdown.find((b) => b.artifactType === 'hierarchy');
    assert.ok(hier);
    assert.equal(hier.sha256, 'y');
    assert.deepEqual(hier.counts, { '🟢': 1, '🟡': 1, '🔴': 1 });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- 2.5: AC3 — Lista rica de itens por nível ----

test('AC3/2.5: itemsByLevel lista claims com claimId, statement, source, degradationReason', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-items-'));
  try {
    await writeLedger(tmp, [
      {
        claimId: 'sipoc-x-0', artifactType: 'sipoc', artifactSha256: 'x',
        proposed: '🟢', validated: '🟢',
        source: { artifactType: 'interview', sha256: 'i'.repeat(64) },
        statement: 'Fornecedores A e B confirmados',
        reasoning: 'Entrevista com o dono',
        validatedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        claimId: 'sipoc-x-1', artifactType: 'sipoc', artifactSha256: 'x',
        proposed: '🟢', validated: '🟡',
        degradationReason: 'unresolved-source',
        statement: 'Cliente típico é PME',
        reasoning: 'Inferido do contexto',
        validatedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        claimId: 'sipoc-x-2', artifactType: 'sipoc', artifactSha256: 'x',
        proposed: '🔴', validated: '🔴',
        statement: 'Não sabemos o SLA da entrega',
        reasoning: 'Usuário não soube responder',
        validatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);

    const report = await reportConfidence(tmp);

    // 🟢 items
    assert.equal(report.itemsByLevel['🟢'].length, 1);
    const greenItem = report.itemsByLevel['🟢'][0];
    assert.equal(greenItem.claimId, 'sipoc-x-0');
    assert.equal(greenItem.statement, 'Fornecedores A e B confirmados');
    assert.equal(greenItem.reasoning, 'Entrevista com o dono');
    assert.equal(greenItem.source?.artifactType, 'interview');
    assert.equal(greenItem.degradationReason, undefined);
    assert.equal(greenItem.excerptStatus, 'no-excerpt');

    // 🟡 items
    assert.equal(report.itemsByLevel['🟡'].length, 1);
    const yellowItem = report.itemsByLevel['🟡'][0];
    assert.equal(yellowItem.claimId, 'sipoc-x-1');
    assert.equal(yellowItem.degradationReason, 'unresolved-source');
    assert.equal(yellowItem.excerptStatus, 'source-missing');

    // 🔴 items
    assert.equal(report.itemsByLevel['🔴'].length, 1);
    const redItem = report.itemsByLevel['🔴'][0];
    assert.equal(redItem.statement, 'Não sabemos o SLA da entrega');
    assert.equal(redItem.source, undefined);
    assert.equal(redItem.excerptStatus, 'source-missing');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- 2.5: AC2 — Reverse-index (rastreabilidade bidirecional) ----

test('AC2/2.5: reverse-index agrupa claims por fonte (sourceKey → claimId[])', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-rev-'));
  try {
    const sourceSha = 'a'.repeat(64);
    await writeLedger(tmp, [
      { claimId: 'a-x-0', artifactType: 'sipoc', artifactSha256: 'x', proposed: '🟢', validated: '🟢', source: { artifactType: 'interview', sha256: sourceSha }, validatedAt: '2026-08-01T00:00:00.000Z' },
      { claimId: 'a-x-1', artifactType: 'sipoc', artifactSha256: 'x', proposed: '🟢', validated: '🟢', source: { artifactType: 'interview', sha256: sourceSha }, validatedAt: '2026-08-01T00:00:00.000Z' },
      { claimId: 'a-y-0', artifactType: 'hierarchy', artifactSha256: 'y', proposed: '🟢', validated: '🟢', source: { artifactType: 'interview', sha256: sourceSha }, validatedAt: '2026-08-01T00:00:00.000Z' },
      { claimId: 'a-z-0', artifactType: 'bpmn', artifactSha256: 'z', proposed: '🟢', validated: '🟢', source: { artifactType: 'sipoc', sha256: 'b'.repeat(64) }, validatedAt: '2026-08-01T00:00:00.000Z' },
    ]);

    const report = await reportConfidence(tmp);
    const revKeys = Object.keys(report.reverseIndex);
    assert.equal(revKeys.length, 2);

    const interviewKey = `interview::${sourceSha}`;
    assert.ok(interviewKey in report.reverseIndex);
    const interviewCiters = report.reverseIndex[interviewKey];
    assert.deepEqual(interviewCiters.sort(), ['a-x-0', 'a-x-1', 'a-y-0'].sort());

    const sipocKey = `sipoc::${'b'.repeat(64)}`;
    assert.ok(sipocKey in report.reverseIndex);
    assert.deepEqual(report.reverseIndex[sipocKey], ['a-z-0']);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- 2.5: AC1 — Excerpt status no relatório ----

test('AC1/2.5: excerpt-status verified quando trecho casa no artefato-fonte', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-exv-'));
  try {
    const sourceSha = 'c'.repeat(64);
    const content = 'O processo tem 3 etapas bem definidas: prospecção, qualificação e fechamento.';
    const outputDir = path.join(tmp, '_process-ai_output', 'sipoc');
    await fs.mkdir(outputDir, { recursive: true });
    const artifactPath = path.join(outputDir, `${sourceSha}.md`);
    await fs.writeFile(artifactPath, content, 'utf8');
    const relPath = path.relative(tmp, artifactPath).split(path.sep).join('/');
    await createManifest(tmp, 'sipoc', sourceSha, relPath);

    await writeLedger(tmp, [
      {
        claimId: 'vc-x-0', artifactType: 'value-chain', artifactSha256: 'x',
        proposed: '🟢', validated: '🟢',
        source: { artifactType: 'sipoc', sha256: sourceSha, excerpt: 'prospecção, qualificação e fechamento' },
        statement: 'Vendas tem 3 etapas',
        reasoning: 'Confirmado no SIPOC',
        validatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);

    const report = await reportConfidence(tmp);
    assert.equal(report.itemsByLevel['🟢'].length, 1);
    assert.equal(report.itemsByLevel['🟢'][0].excerptStatus, 'verified');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC1/2.5: excerpt-status mismatch quando trecho NÃO casa', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-exm-'));
  try {
    const sourceSha = 'd'.repeat(64);
    const content = 'Apenas duas etapas.';
    const outputDir = path.join(tmp, '_process-ai_output', 'sipoc');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, `${sourceSha}.md`), content, 'utf8');
    const relPath = path.relative(tmp, path.join(outputDir, `${sourceSha}.md`)).split(path.sep).join('/');
    await createManifest(tmp, 'sipoc', sourceSha, relPath);

    await writeLedger(tmp, [
      {
        claimId: 'vc-x-0', artifactType: 'value-chain', artifactSha256: 'x',
        proposed: '🟢', validated: '🟢',
        source: { artifactType: 'sipoc', sha256: sourceSha, excerpt: 'três etapas' },
        statement: 'Alegação errada',
        reasoning: 'Erro',
        validatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);

    const report = await reportConfidence(tmp);
    assert.equal(report.itemsByLevel['🟢'][0].excerptStatus, 'mismatch');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC1/2.5: excerpt-status no-excerpt quando source sem excerpt', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-exn-'));
  try {
    await writeLedger(tmp, [
      {
        claimId: 'vc-x-0', artifactType: 'value-chain', artifactSha256: 'x',
        proposed: '🟢', validated: '🟢',
        source: { artifactType: 'sipoc', sha256: 'e'.repeat(64) },
        statement: 'Afirmação genérica',
        reasoning: 'Ok',
        validatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);

    const report = await reportConfidence(tmp);
    assert.equal(report.itemsByLevel['🟢'][0].excerptStatus, 'no-excerpt');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC1/2.5: excerpt-status source-missing quando source sem manifesto', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-exs-'));
  try {
    await writeLedger(tmp, [
      {
        claimId: 'vc-x-0', artifactType: 'value-chain', artifactSha256: 'x',
        proposed: '🟢', validated: '🟢',
        source: { artifactType: 'sipoc', sha256: 'f'.repeat(64), excerpt: 'algum trecho' },
        statement: 'Fonte inexistente',
        reasoning: 'Erro',
        validatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);

    const report = await reportConfidence(tmp);
    assert.equal(report.itemsByLevel['🟢'][0].excerptStatus, 'source-missing');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- 2.5: AC3 — Órfãos listados ----

test('AC3/2.5: orphanList lista manifestos órfãos (não só count)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-orphl-'));
  try {
    const quarantineDir = metaPath(tmp, 'quarantine');
    await fs.mkdir(quarantineDir, { recursive: true });
    await fs.writeFile(path.join(quarantineDir, 'abc12345.json'), '{}', 'utf8');
    await fs.writeFile(path.join(quarantineDir, 'abc12345.reason.md'), 'motivo', 'utf8');
    await fs.writeFile(path.join(quarantineDir, 'def67890.json'), '{}', 'utf8');

    const report = await reportConfidence(tmp);
    assert.equal(report.orphans, 2);
    assert.equal(report.orphanList.length, 2);
    const shas = report.orphanList.map((o) => o.sha256).sort();
    assert.deepEqual(shas, ['abc12345', 'def67890']);
    for (const o of report.orphanList) {
      assert.ok(o.quarantinePath.includes('quarantine/'));
      assert.ok(o.quarantinePath.endsWith('.json'));
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- 2.5: AC4 — Backward-compat: ledger legado (sem statement/reasoning) ----

test('AC4/2.5: backward-compat — ledger legado sem statement/reasoning → leitores toleram (??\'\')', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-legacy-'));
  try {
    // Linha de ledger da 1.4 — sem statement/reasoning.
    await writeLedger(tmp, [
      {
        claimId: 'sipoc-old-0', artifactType: 'sipoc', artifactSha256: 'oldsha',
        proposed: '🟢', validated: '🟡',
        degradationReason: 'unresolved-source',
        validatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const report = await reportConfidence(tmp);
    assert.equal(report.totalClaims, 1);
    assert.equal(report.itemsByLevel['🟡'].length, 1);
    // Statement/reasoning ausentes → '' (?? '')
    assert.equal(report.itemsByLevel['🟡'][0].statement, '');
    assert.equal(report.itemsByLevel['🟡'][0].reasoning, '');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- 2.5: Markdown renderização rica ----

test('AC3/2.5: formatConfidenceReport renderiza breakdown por artifactType (tabela)', () => {
  const report: ConfidenceReport = {
    counts: { '🟢': 2, '🟡': 1, '🔴': 1 },
    totalClaims: 4,
    artifacts: [],
    orphans: 0,
    orphanList: [],
    stage: 'summary',
    generatedAt: '2026-08-01T00:00:00.000Z',
    breakdown: [
      { artifactType: 'sipoc', sha256: 'a'.repeat(64), counts: { '🟢': 1, '🟡': 1, '🔴': 0 } },
      { artifactType: 'hierarchy', sha256: 'b'.repeat(64), counts: { '🟢': 1, '🟡': 0, '🔴': 1 } },
    ],
    itemsByLevel: {
      '🟢': [
        { claimId: 'sipoc-a-0', statement: 'A', reasoning: 'rA', level: '🟢', source: { artifactType: 'int', sha256: 'c'.repeat(64) }, excerptStatus: 'verified' },
        { claimId: 'hier-b-0', statement: 'B', reasoning: 'rB', level: '🟢', excerptStatus: 'no-excerpt' },
      ],
      '🟡': [
        { claimId: 'sipoc-a-1', statement: 'C', reasoning: 'rC', level: '🟡', degradationReason: 'unresolved-source', excerptStatus: 'source-missing' },
      ],
      '🔴': [
        { claimId: 'hier-b-1', statement: 'D', reasoning: 'rD', level: '🔴', excerptStatus: 'source-missing' },
      ],
    },
    reverseIndex: {
      [`int::${'c'.repeat(64)}`]: ['sipoc-a-0'],
    },
  };
  const md = formatConfidenceReport(report);

  // Seções
  assert.ok(md.includes('## Relatório de Confiança'));
  assert.ok(md.includes('### Breakdown por Artefato'));
  assert.ok(md.includes('### 🟢 Confiança Alta'));
  assert.ok(md.includes('### 🟡 Confiança Média'));
  assert.ok(md.includes('### 🔴 Gaps Declarados'));
  assert.ok(md.includes('### Rastreabilidade Bidirecional'));
  // Breakdown table
  assert.ok(md.includes('sipoc'));
  assert.ok(md.includes('hierarchy'));

  // Items com detalhes
  assert.ok(md.includes('sipoc-a-0'));
  assert.ok(md.includes('verified'));
  assert.ok(md.includes('sipoc-a-1'));
  assert.ok(md.includes('unresolved-source'));

  // Reverse-index
  assert.ok(md.includes('int'));

  // Zeros honestos — sem claims → callout
  assert.ok(md.includes('⚠️') || md.includes('gap'));
});

test('AC3/2.5: formatConfidenceReport sessão sem claims → zeros honestos + ℹ️ callout (NFR-1)', () => {
  const report: ConfidenceReport = {
    counts: { '🟢': 0, '🟡': 0, '🔴': 0 },
    totalClaims: 0,
    artifacts: [],
    orphans: 0,
    orphanList: [],
    stage: 'summary',
    generatedAt: '2026-08-01T00:00:00.000Z',
    breakdown: [],
    itemsByLevel: { '🟢': [], '🟡': [], '🔴': [] },
    reverseIndex: {},
  };
  const md = formatConfidenceReport(report);
  assert.match(md, /0/);
  assert.ok(/nenhum|0 claim|sem claim|total/i.test(md) || md.includes('total'), 'deve declarar zero claims');
  assert.ok(md.includes('ℹ️'), 'deve ter callout de zeros honestos');
});

test('AC3/2.5: formatConfidenceReport escapa markdown no stage e campos (deferred-work.md:65)', () => {
  const report: ConfidenceReport = {
    counts: { '🟢': 0, '🟡': 0, '🔴': 0 },
    totalClaims: 0,
    artifacts: [],
    orphans: 0,
    orphanList: [],
    stage: 'summary [special] *bold*',
    generatedAt: '2026-08-01T00:00:00.000Z',
    breakdown: [],
    itemsByLevel: { '🟢': [], '🟡': [], '🔴': [] },
    reverseIndex: {},
  };
  const md = formatConfidenceReport(report);
  // O stage deve ser escapado — os caracteres especiais markdown são literais.
  assert.ok(md.includes('summary \\[special\\] \\*bold\\*'));
});

test('AC3/2.5: formatConfidenceReport renderiza órfãos listados', () => {
  const report: ConfidenceReport = {
    counts: { '🟢': 0, '🟡': 0, '🔴': 0 },
    totalClaims: 0,
    artifacts: [],
    orphans: 2,
    orphanList: [
      { sha256: 'a'.repeat(64), quarantinePath: 'quarantine/aaaaaaaa.json' },
      { sha256: 'b'.repeat(64), quarantinePath: 'quarantine/bbbbbbbb.json' },
    ],
    stage: 'summary',
    generatedAt: '2026-08-01T00:00:00.000Z',
    breakdown: [],
    itemsByLevel: { '🟢': [], '🟡': [], '🔴': [] },
    reverseIndex: {},
  };
  const md = formatConfidenceReport(report);
  assert.ok(md.includes('aaaaaaaa'));
  assert.ok(md.includes('bbbbbbbb'));
});

// ---- 2.5: deferred-work fixes ----

test('deferred-work.md:71 — emoji com variation selector FE0F normalizado na contagem', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-emoji-'));
  try {
    // "🟢️" com FE0F (variation selector) — normalizado para "🟢"
    const greenWithVS = '🟢️';
    await writeLedger(tmp, [
      { claimId: 'a-x-0', artifactType: 'sipoc', artifactSha256: 'x', proposed: greenWithVS, validated: greenWithVS, validatedAt: '2026-08-01T00:00:00.000Z' },
      { claimId: 'a-x-1', artifactType: 'sipoc', artifactSha256: 'x', proposed: '🟢', validated: '🟢', validatedAt: '2026-08-01T00:00:00.000Z' },
    ]);

    const report = await reportConfidence(tmp);
    assert.equal(report.counts['🟢'], 2, 'ambos contam como 🟢 após normalização FE0F');
    assert.equal(report.totalClaims, 2);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('deferred-work.md:63 — leaf-symlink guard no read do ledger', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-sym-'));
  try {
    const realLedger = path.join(tmp, 'real-ledger.jsonl');
    await fs.mkdir(path.dirname(realLedger), { recursive: true });
    await fs.writeFile(realLedger, JSON.stringify({ claimId: 'a-x-0', artifactType: 'sipoc', artifactSha256: 'x', proposed: '🟢', validated: '🟢', validatedAt: '2026-08-01T00:00:00.000Z' }) + '\n', 'utf8');

    const metaDir = metaPath(tmp);
    await fs.mkdir(metaDir, { recursive: true });
    const symlinkPath = metaPath(tmp, 'confidence-ledger.jsonl');
    try {
      await fs.symlink(realLedger, symlinkPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EPERM' || (e as NodeJS.ErrnoException).code === 'EEXIST') {
        return; // Windows sem Developer Mode — skip.
      }
      throw e;
    }

    // lstat no symlink → isFile=false → scanLedger retorna zeros (não segue link).
    const report = await reportConfidence(tmp);
    assert.equal(report.totalClaims, 0, 'symlink no ledger → zeros honestos, não segue');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- 2.5: AD-3 guardrail ----

test('AD-3: report.ts mora no core e é coberto pelo import-boundary', async () => {
  assert.equal(typeof reportConfidence, 'function');
  assert.equal(typeof formatConfidenceReport, 'function');
  const reportPath = path.resolve(import.meta.dirname, '..', 'toolkit', 'src', 'report.ts');
  const st = await fs.stat(reportPath);
  assert.ok(st.isFile(), 'toolkit/src/report.ts deve existir no core');
});
