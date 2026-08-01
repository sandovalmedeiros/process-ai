/**
 * tests/report.test.ts — Relatório de confiança MÍNIMO (AC6, AD-5, NFR-1).
 *
 * Cobre reportConfidence(root): agregação determinística do ledger de confiança
 * (.process-ai/confidence-ledger.jsonl) + lista de artefatos do checkpoint +
 * nota de gaps (🔴) / orphans (quarantine/). Versão MÍNIMA em 1.5 — o relatório
 * consolidado navegável (rastreabilidade bidirecional, excerpt) é 2.5.
 *
 * AD-3: report.ts mora no core (só node:* + relativos); o guardrail
 * tests/import-boundary.test.ts o cobre automaticamente (verificado abaixo).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { reportConfidence, formatConfidenceReport } from '../toolkit/src/report.ts';
import type { ConfidenceReport } from '../toolkit/src/report.ts';
import { commit } from '../toolkit/src/commit.ts';
import { checkpointAdvance, acquireLock, releaseLock, checkpointRead } from '../toolkit/src/checkpoint.ts';

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

test('AC6/AD-5: diretório vazio (sem .process-ai/) → contagens zeradas, stage init, sem artefatos', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-empty-'));
  try {
    const report = await reportConfidence(tmp);
    assert.deepEqual(report.counts, { '🟢': 0, '🟡': 0, '🔴': 0 }, 'contagens zeradas quando não há ledger');
    assert.equal(report.totalClaims, 0);
    assert.deepEqual(report.artifacts, [], 'sem artefatos');
    assert.equal(report.orphans, 0);
    assert.equal(report.stage, 'init', 'stage inicial quando não há checkpoint');
    assert.equal(typeof report.generatedAt, 'string');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC6: ledger com claims mistos (2🟢, 1🟡, 1🔴) → contagens corretas por nível VALIDADO', async () => {
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

test('AC6: contagem usa nível VALIDADO (não proposed) — honestidade AD-5/NFR-1', async () => {
  // Um claim proposto 🟢 mas degradado a 🟡 (unresolved-source) deve contar como 🟡.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-deg-'));
  try {
    await writeLedger(tmp, [
      { claimId: 'a-x-0', artifactType: 'sipoc', artifactSha256: 'x', proposed: '🟢', validated: '🟡', degradationReason: 'unresolved-source', validatedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    const report = await reportConfidence(tmp);
    assert.deepEqual(report.counts, { '🟢': 0, '🟡': 1, '🔴': 0 }, 'conta o nível validado (🟡), não o proposto (🟢)');
    assert.equal(report.totalClaims, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC6: lista de artefatos reflete o checkpoint (após commit real)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-art-'));
  try {
    const res = await commit({ artifactType: 'sipoc', content: { a: 1 } }, { root: tmp });
    const report = await reportConfidence(tmp);
    assert.equal(report.artifacts.length, 1, 'um artefato commitado deve aparecer');
    assert.equal(report.artifacts[0].sha256, res.sha256);
    assert.equal(report.artifacts[0].artifactType, 'sipoc');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC6: stage atual refletido a partir do checkpoint', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-stage-'));
  try {
    const lock = await acquireLock(tmp, 1000);
    try {
      await checkpointAdvance(
        tmp,
        await checkpointRead(tmp),
        { kind: 'stage-advance', payload: { from: 'scope', to: 'discovery' } },
        async () => {},
      );
    } finally {
      await releaseLock(lock);
    }
    const report = await reportConfidence(tmp);
    assert.equal(report.stage, 'discovery');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC6: orphans contados a partir de quarantine/', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-orph-'));
  try {
    const quarantineDir = metaPath(tmp, 'quarantine');
    await fs.mkdir(quarantineDir, { recursive: true });
    // Dois manifestos órfãos + seus reason.md
    await fs.writeFile(path.join(quarantineDir, 'sha-a.json'), '{}', 'utf8');
    await fs.writeFile(path.join(quarantineDir, 'sha-a.reason.md'), 'motivo', 'utf8');
    await fs.writeFile(path.join(quarantineDir, 'sha-b.json'), '{}', 'utf8');

    const report = await reportConfidence(tmp);
    assert.equal(report.orphans, 2, 'deve contar 2 manifestos órfãos (não os .reason.md)');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('NFR-1: ledger vazio (arquivo existe mas sem linhas) → contagens zeradas, não lança', async () => {
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

test('NFR-1: ledger com linhas corrompidas → ignora e conta só as válidas', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-corr-'));
  try {
    const ledgerPath = metaPath(tmp, 'confidence-ledger.jsonl');
    await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
    const valid = JSON.stringify({ claimId: 'a-x-0', artifactType: 'sipoc', artifactSha256: 'x', proposed: '🟢', validated: '🟢', validatedAt: '2026-08-01T00:00:00.000Z' });
    await fs.writeFile(ledgerPath, `${valid}\nnão é json { inválido\n${valid}\n`, 'utf8');

    const report = await reportConfidence(tmp);
    assert.deepEqual(report.counts, { '🟢': 2, '🟡': 0, '🔴': 0 }, 'linha corrompida ignorada; 2 válidas contadas');
    assert.equal(report.totalClaims, 2);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('formatConfidenceReport: renderiza markdown pt-BR com marcadores e nota de gaps/orphans', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rep-fmt-'));
  try {
    await writeLedger(tmp, [
      { claimId: 'a-x-0', artifactType: 'sipoc', artifactSha256: 'x', proposed: '🟢', validated: '🟢', validatedAt: '2026-08-01T00:00:00.000Z' },
      { claimId: 'a-z-0', artifactType: 'bpmn', artifactSha256: 'z', proposed: '🔴', validated: '🔴', validatedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    const report: ConfidenceReport = {
      counts: { '🟢': 1, '🟡': 0, '🔴': 1 },
      totalClaims: 2,
      artifacts: [{ sha256: 'x', artifactType: 'sipoc' }],
      orphans: 1,
      stage: 'summary',
      generatedAt: '2026-08-01T00:00:00.000Z',
    };
    const md = formatConfidenceReport(report);
    assert.ok(md.includes('🟢'), 'markdown deve conter marcador 🟢');
    assert.ok(md.includes('🔴'), 'markdown deve conter marcador 🔴');
    assert.ok(md.includes('gap') || md.includes('Gap') || md.includes('GAP'), 'deve sinalizar gap (🔴)');
    assert.ok(/órfão|orphan|quarenten/i.test(md), 'deve sinalizar orphans (quarentena)');
    assert.ok(md.includes('sipoc'), 'deve listar o artifactType');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('formatConfidenceReport: sessão sem claims (run 1.5-only) → zeros honestos, sem inflar (NFR-1)', () => {
  const report: ConfidenceReport = {
    counts: { '🟢': 0, '🟡': 0, '🔴': 0 },
    totalClaims: 0,
    artifacts: [],
    orphans: 0,
    stage: 'summary',
    generatedAt: '2026-08-01T00:00:00.000Z',
  };
  const md = formatConfidenceReport(report);
  // Zeros aparecem explicitamente — honestidade (não inflar).
  assert.match(md, /0/);
  assert.ok(/nenhum|0 claim|sem claim/i.test(md) || md.includes('total'), 'deve declarar zero claims explicitamente');
});

test('AD-3: report.ts mora no core e é coberto pelo import-boundary (existe e exporta)', async () => {
  // O guardrail tests/import-boundary.test.ts varre toolkit/src/** automaticamente;
  // aqui garantimos que reportConfidence é uma função exportada do core.
  assert.equal(typeof reportConfidence, 'function');
  assert.equal(typeof formatConfidenceReport, 'function');
  const reportPath = path.resolve(import.meta.dirname, '..', 'toolkit', 'src', 'report.ts');
  const st = await fs.stat(reportPath);
  assert.ok(st.isFile(), 'toolkit/src/report.ts deve existir no core');
});
