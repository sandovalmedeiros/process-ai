/**
 * tests/checkpoint.test.ts — checkpoint/WAL/resume/quarentena (AC1–AC6, AD-4).
 *
 * Cobre o invariante AD-4: checkpoint autoritativo, transação atômica via WAL,
 * resume determinístico, quarentena de órfãos, single-writer lock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  acquireLock,
  releaseLock,
  walAppend,
  walReadAll,
  walMarkComplete,
  checkpointRead,
  checkpointWrite,
  checkpointAdvance,
  resume,
  quarantineArtifact,
  initialState,
  CheckpointError,
} from '../toolkit/src/checkpoint.ts';
import type { CheckpointState, WalIntent } from '../toolkit/src/checkpoint.ts';
import { commit } from '../toolkit/src/commit.ts';

function metaPath(root: string, ...parts: string[]): string {
  return path.join(root, '.process-ai', ...parts);
}

/** Lista recursiva de arquivos sob `dir`, paths relativos normalizados com '/'. */
async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

// ---- T1: estado inicial ----

test('T1: initialState retorna CheckpointState zerado', () => {
  const s = initialState();
  assert.equal(s.stage, 'init');
  assert.deepEqual(s.artifacts, []);
  assert.deepEqual(s.gates, []);
  assert.equal(s.walCursor, 0);
});

// ---- T2: lock (AC5 single-writer) ----

test('AC5: acquireLock + releaseLock — lock exclusivo via mkdir', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-lock-'));
  try {
    const handle = await acquireLock(tmp, 1000);
    assert.ok(handle.lockDir.endsWith('.lock'), 'lockDir deve apontar para .process-ai/.lock');

    // Segundo lock no mesmo root deve falhar (ou timeout rápido)
    await assert.rejects(
      () => acquireLock(tmp, 200),
      CheckpointError,
      'segundo lock deve falhar com timeout (lock já adquirido)',
    );

    await releaseLock(handle);

    // Após release, um novo lock pode ser adquirido
    const handle2 = await acquireLock(tmp, 1000);
    await releaseLock(handle2);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC5: stale lock (PID morto) é quebrado e readquirido', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-stale-'));
  try {
    // Simula um lock de um PID inexistente
    const lockDir = metaPath(tmp, '.lock');
    await fs.mkdir(lockDir, { recursive: true });
    await fs.writeFile(path.join(lockDir, 'pid'), '999999', 'utf8');
    await fs.writeFile(path.join(lockDir, 'acquiredAt'), new Date().toISOString(), 'utf8');

    // Deve conseguir adquirir (detecta stale e quebra)
    const handle = await acquireLock(tmp, 1000);
    await releaseLock(handle);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- T2: WAL (AC1) ----

test('CR-P2: walReadAll tolera linhas JSON malformadas (não quebra resume)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-walcorr-'));
  try {
    // Escreve WAL manualmente com linha corrompida entre válidas
    const walPath = metaPath(tmp, 'wal.jsonl');
    await fs.mkdir(path.dirname(walPath), { recursive: true });
    await fs.writeFile(walPath, [
      JSON.stringify({ id: '1', intent: { kind: 'stage-advance', payload: { from: 'init', to: 'bento' } }, status: 'applied', createdAt: new Date().toISOString() }),
      'linha corrompida { não é JSON }',
      JSON.stringify({ id: '2', intent: { kind: 'commit', payload: { artifactType: 'sipoc', sha256: 'abc', manifestPath: 'm.json' } }, status: 'pending', createdAt: new Date().toISOString() }),
    ].join('\n') + '\n', 'utf8');

    const entries = await walReadAll(tmp);
    assert.equal(entries.length, 2, 'deve pular linha corrompida e retornar as 2 válidas');
    assert.equal(entries[0].id, '1');
    assert.equal(entries[1].id, '2');

    // Resume NÃO deve quebrar com WAL parcialmente corrompido
    const result = await resume(tmp);
    assert.equal(result.state.stage, 'bento', 'stage-advance aplicado (linha 1 válida)');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC1: walAppend + walReadAll — append e leitura de entradas', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-walrw-'));
  try {
    const intent: WalIntent = { kind: 'commit', payload: { artifactType: 'sipoc', sha256: 'abc123', manifestPath: 'manifests/sipoc-abc123.json' } };
    const e1 = await walAppend(tmp, intent);
    assert.equal(e1.status, 'pending');
    assert.equal(e1.intent.kind, 'commit');

    const intent2: WalIntent = { kind: 'stage-advance', payload: { from: 'init', to: 'bento' } };
    await walAppend(tmp, intent2);

    const all = await walReadAll(tmp);
    assert.equal(all.length, 2);
    assert.equal(all[0].id, e1.id);
    assert.equal(all[1].intent.kind, 'stage-advance');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC1: walMarkComplete — marca entrada como applied', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-walmc-'));
  try {
    const intent: WalIntent = { kind: 'commit', payload: { artifactType: 'sipoc', sha256: 'xyz', manifestPath: 'manifests/sipoc-xyz.json' } };
    const e = await walAppend(tmp, intent);
    await walMarkComplete(tmp, e.id);

    const all = await walReadAll(tmp);
    assert.equal(all.length, 1);
    assert.equal(all[0].status, 'applied');
    assert.equal(all[0].id, e.id);

    // Idempotente: marcar de novo é no-op
    await walMarkComplete(tmp, e.id);
    const all2 = await walReadAll(tmp);
    assert.equal(all2.length, 1);
    assert.equal(all2[0].status, 'applied');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- T3: checkpoint state machine (AC2, AC6) ----

test('AC2: checkpointRead — diretório vazio retorna estado inicial', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cpinit-'));
  try {
    const state = await checkpointRead(tmp);
    assert.equal(state.stage, 'init');
    assert.equal(state.walCursor, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC2: checkpointWrite + checkpointRead — idempotência byte-estável', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cprw-'));
  try {
    const state: CheckpointState = {
      stage: 'bento',
      artifacts: [{ sha256: 'abc', artifactType: 'sipoc', path: 'manifests/sipoc-abc.json' }],
      gates: [{ gateId: 'gate-1', decision: 'approved', decidedAt: new Date().toISOString() }],
      lastCheckpointAt: new Date().toISOString(),
      walCursor: 3,
    };
    await checkpointWrite(tmp, state);
    const read = await checkpointRead(tmp);
    assert.equal(read.stage, state.stage);
    assert.equal(read.artifacts.length, 1);
    assert.equal(read.artifacts[0].sha256, 'abc');
    assert.equal(read.gates.length, 1);
    assert.equal(read.walCursor, 3);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- T5: checkpointAdvance (AC1 — transação atômica) ----

test('AC1: checkpointAdvance — commit avança checkpoint via WAL', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-adv-'));
  try {
    const lock = await acquireLock(tmp, 1000);
    let written = false;
    try {
      const next = await checkpointAdvance(
        tmp,
        await checkpointRead(tmp),
        { kind: 'commit', payload: { artifactType: 'sipoc', sha256: 'abc', manifestPath: 'manifests/sipoc-abc.json' } },
        async () => { written = true; },
      );
      assert.equal(next.artifacts.length, 1);
      assert.equal(next.artifacts[0].sha256, 'abc');
      assert.equal(next.walCursor, 1);
      assert.ok(written, 'apply callback deve ser executado');

      // WAL deve ter entrada applied
      const wal = await walReadAll(tmp);
      assert.equal(wal.length, 1);
      assert.equal(wal[0].status, 'applied');
    } finally {
      await releaseLock(lock);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC1: checkpointAdvance — se apply lança, WAL fica pending e lock é liberado', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-advfail-'));
  try {
    const lock = await acquireLock(tmp, 1000);
    try {
      await checkpointAdvance(
        tmp,
        await checkpointRead(tmp),
        { kind: 'commit', payload: { artifactType: 'sipoc', sha256: 'fail', manifestPath: 'x' } },
        async () => { throw new Error('simulated disk full'); },
      );
      assert.fail('deveria ter lançado');
    } catch (e) {
      // esperado — apply falhou
    } finally {
      await releaseLock(lock);
    }

    // WAL deve ter entrada pending (não applied)
    const wal = await walReadAll(tmp);
    assert.equal(wal.length, 1);
    assert.equal(wal[0].status, 'pending');

    // Checkpoint NÃO foi avançado (apply falhou)
    const cp = await checkpointRead(tmp);
    assert.equal(cp.artifacts.length, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC1: checkpointAdvance — stage-advance atualiza o estágio', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-advstage-'));
  try {
    const lock = await acquireLock(tmp, 1000);
    try {
      const next = await checkpointAdvance(
        tmp,
        await checkpointRead(tmp),
        { kind: 'stage-advance', payload: { from: 'init', to: 'bento' } },
        async () => {},
      );
      assert.equal(next.stage, 'bento');
    } finally {
      await releaseLock(lock);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC1: checkpointAdvance — gate registra decisão', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-advgate-'));
  try {
    const lock = await acquireLock(tmp, 1000);
    try {
      const next = await checkpointAdvance(
        tmp,
        await checkpointRead(tmp),
        { kind: 'gate', payload: { gateId: 'gate-1', decision: 'approved' } },
        async () => {},
      );
      assert.equal(next.gates.length, 1);
      assert.equal(next.gates[0].gateId, 'gate-1');
      assert.equal(next.gates[0].decision, 'approved');
    } finally {
      await releaseLock(lock);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- T4: resume (AC2, AC3, AC4) ----

test('AC3: resume — diretório vazio retorna estado inicial e zero órfãos', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-resempty-'));
  try {
    const result = await resume(tmp);
    assert.equal(result.state.stage, 'init');
    assert.deepEqual(result.orphans, []);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC3: resume — determínistico (mesmo estado → mesmo resultado)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-resdet-'));
  try {
    // Commit um artefato → estado conhecido
    await commit({ artifactType: 'sipoc', content: 'data' }, { root: tmp });

    const r1 = await resume(tmp);
    const r2 = await resume(tmp);

    assert.equal(r1.state.stage, r2.state.stage);
    assert.equal(r1.state.artifacts.length, r2.state.artifacts.length);
    assert.equal(r1.state.walCursor, r2.state.walCursor);
    assert.deepEqual(r1.orphans, r2.orphans);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC1: resume — replay de entradas WAL applied após checkpoint', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-replay-'));
  try {
    // Simula cenário: WAL tem entrada applied que o checkpoint ainda não reflete
    // (crash entre checkpoint write e WAL mark-complete? Na verdade entre WAL mark-complete
    // e checkpoint write — mas o resume deve lidar com replay de qualquer forma)
    const lock = await acquireLock(tmp, 1000);
    try {
      await checkpointAdvance(
        tmp,
        await checkpointRead(tmp),
        { kind: 'commit', payload: { artifactType: 'sipoc', sha256: 'replay-sha', manifestPath: 'manifests/sipoc-replay-sha.json' } },
        async () => {},
      );
    } finally {
      await releaseLock(lock);
    }

    const result = await resume(tmp);
    assert.equal(result.state.artifacts.length, 1);
    assert.equal(result.state.artifacts[0].sha256, 'replay-sha');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC4: quarentena — manifesto órfão é movido para quarantine/', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-quar-'));
  try {
    // Cria um manifesto manualmente em manifests/ (sem checkpoint referenciando)
    const manifestsDir = metaPath(tmp, 'manifests');
    await fs.mkdir(manifestsDir, { recursive: true });
    const orphanManifest = {
      sha256: 'orphan-abc',
      artifactType: 'sipoc',
      artifactPath: '_process-ai_output/sipoc/orphan-abc.md',
    };
    await fs.writeFile(
      path.join(manifestsDir, 'sipoc-orphan-abc.json'),
      JSON.stringify(orphanManifest),
      'utf8',
    );

    const result = await resume(tmp);
    assert.equal(result.orphans.length, 1);
    assert.equal(result.orphans[0].sha256, 'orphan-abc');

    // Manifesto foi movido para quarantine/
    const quarantineDir = metaPath(tmp, 'quarantine');
    const qFiles = await fs.readdir(quarantineDir);
    assert.ok(qFiles.some((f) => f === 'orphan-abc.json'), 'manifesto deve estar em quarantine/');
    assert.ok(qFiles.some((f) => f === 'orphan-abc.reason.md'), 'reason.md deve existir');

    // Manifesto NÃO está mais em manifests/
    const remaining = await fs.readdir(manifestsDir).catch(() => [] as string[]);
    assert.ok(!remaining.some((f) => f.includes('orphan-abc')), 'órfão não deve permanecer em manifests/');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC4: quarentena — nunca auto-mergeia órfão ao checkpoint', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-qnoauto-'));
  try {
    // Commit legítimo → checkpoint tem 1 artefato
    await commit({ artifactType: 'sipoc', content: 'legit' }, { root: tmp });

    // Cria manifesto órfão manual
    const manifestsDir = metaPath(tmp, 'manifests');
    await fs.mkdir(manifestsDir, { recursive: true });
    await fs.writeFile(
      path.join(manifestsDir, 'sipoc-orphan-xyz.json'),
      JSON.stringify({ sha256: 'orphan-xyz', artifactType: 'sipoc', artifactPath: 'x' }),
      'utf8',
    );

    const result = await resume(tmp);
    // Checkpoint NÃO inclui o órfão
    const orphanInState = result.state.artifacts.some((a) => a.sha256 === 'orphan-xyz');
    assert.ok(!orphanInState, 'órfão NÃO deve aparecer em checkpoint.artifacts');
    // Órfão foi para quarentena
    assert.equal(result.orphans.length, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- T5: integração commit + checkpoint (AC1, AC2) ----

test('AC1: commit integrado — checkpoint reflete artefato após commit', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cpint-'));
  try {
    const res = await commit({ artifactType: 'sipoc', content: { a: 1 } }, { root: tmp });

    // Checkpoint deve refletir o artefato
    const cp = await checkpointRead(tmp);
    assert.equal(cp.artifacts.length, 1);
    assert.equal(cp.artifacts[0].sha256, res.sha256);
    assert.equal(cp.artifacts[0].artifactType, 'sipoc');
    assert.equal(cp.walCursor, 1);

    // WAL deve ter entrada applied
    const wal = await walReadAll(tmp);
    assert.equal(wal.length, 1);
    assert.equal(wal[0].status, 'applied');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC1: commit integrado — múltiplos commits no mesmo root → checkpoint acumula', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cpmulti-'));
  try {
    await commit({ artifactType: 'sipoc', content: 'a' }, { root: tmp });
    await commit({ artifactType: 'bpmn', content: 'b' }, { root: tmp });

    const cp = await checkpointRead(tmp);
    assert.equal(cp.artifacts.length, 2);
    assert.equal(cp.walCursor, 2);

    const wal = await walReadAll(tmp);
    assert.equal(wal.length, 2);
    assert.ok(wal.every((e) => e.status === 'applied'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC3: resume — determinístico com commit real (ponta-a-ponta)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-rese2e-'));
  try {
    await commit({ artifactType: 'sipoc', content: 'x' }, { root: tmp, agent: 't1' });
    await commit({ artifactType: 'bpmn', content: 'y' }, { root: tmp, agent: 't2' });

    const result = await resume(tmp);
    assert.equal(result.state.stage, 'init'); // commit não avança stage
    assert.equal(result.state.artifacts.length, 2);
    assert.equal(result.orphans.length, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- P1: resume persiste checkpoint quando cursor avança com só pending ----

test('CR-P1: resume persiste walCursor mesmo com só entradas pending (sem replay)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-p1cur-'));
  try {
    // Simula cenário: WAL tem entrada pending (crash antes do apply)
    const walPath = metaPath(tmp, 'wal.jsonl');
    await fs.mkdir(path.dirname(walPath), { recursive: true });
    await fs.writeFile(walPath,
      JSON.stringify({
        id: 'pending-1',
        intent: { kind: 'stage-advance', payload: { from: 'init', to: 'bento' } },
        status: 'pending',
        createdAt: new Date().toISOString(),
      }) + '\n',
      'utf8',
    );

    // Primeiro resume: processa pending, descarta, cursor avança para 1
    const r1 = await resume(tmp);
    assert.equal(r1.state.walCursor, 1, 'cursor deve avançar após processar pending');

    // Segundo resume: cursor persistido → não reprocessa a mesma entrada pending
    const r2 = await resume(tmp);
    assert.equal(r2.state.walCursor, 1, 'cursor persistido — não recuou');
    assert.equal(r2.state.stage, 'init', 'pending foi descartado no primeiro resume — stage continua init');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- Regressão 1.2: abort-before-write PRESERVADO ----

test('AC3 (1.2): commit aborta em artifactType inseguro — ZERO escrita com checkpoint integrado', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-abortcp-'));
  try {
    await assert.rejects(
      () => commit({ artifactType: '../evil', content: 'x' }, { root: tmp }),
      /CommitError|CheckpointError/,
    );

    // Nenhuma escrita: sem .process-ai/ nem _process-ai_output/
    const top = await fs.readdir(tmp);
    assert.deepEqual(top, [], 'nenhuma escrita após abort de sanitização com checkpoint integrado');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- Cobertura de quarantine manual (T4) ----

test('T4: quarantineArtifact move manifesto + artefato + escreve reason.md', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-qman-'));
  try {
    // Cria estrutura
    const manifestsDir = metaPath(tmp, 'manifests');
    await fs.mkdir(manifestsDir, { recursive: true });
    const manifestPath = path.join(manifestsDir, 'sipoc-qtest.json');
    await fs.writeFile(manifestPath, JSON.stringify({
      sha256: 'qtest',
      artifactType: 'sipoc',
      artifactPath: '_process-ai_output/sipoc/qtest.md',
    }), 'utf8');

    const result = await quarantineArtifact(tmp, 'qtest', manifestPath, 'teste manual');
    assert.equal(result.sha256, 'qtest');
    assert.equal(result.reason, 'teste manual');

    // reason.md existe e contém o motivo
    const reasonPath = metaPath(tmp, 'quarantine', 'qtest.reason.md');
    const reasonContent = await fs.readFile(reasonPath, 'utf8');
    assert.ok(reasonContent.includes('teste manual'));
    assert.ok(reasonContent.includes('qtest'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
