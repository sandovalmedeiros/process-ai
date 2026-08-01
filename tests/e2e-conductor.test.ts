/**
 * tests/e2e-conductor.test.ts — E2E simulado do loop do condutor (CRITÉRIO IMPLÍCITO).
 *
 * Exerce o condutor Déa ponta-a-ponta via dispatcher num tmpdir, simulando a
 * sequência de comandos que a skill instrui o agente a executar:
 *   resume (vazio) → Gate 0 → pipeline (gates + estágios, slots de especialista
 *   sem artefatos em 1.5) → report + propose do resumo → resume-sem-duplicação.
 *
 * Valida (Critério implícito da story 1.5):
 *  - artefato commitado em _process-ai_output/;
 *  - checkpoint com gate-0..gate-4 + estágio final + 1 artefato (sem duplicação de gates);
 *  - resume subsequente não duplica estado nem cria órfãos;
 *  - run 1.5-only → relatório com zeros honestos (ledger vazio, NFR-1).
 *
 * Drive via `dispatch(parseArgs(...), adapter, root)` — o dispatcher é o canal de
 * runtime; adapter real injetando cwd=tmpdir (padrão herdado da 1.1–1.4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, dispatch } from '../bin/process-ai.ts';
import { ClaudeCodeAdapter } from '../toolkit/adapters/claude-code/adapter.ts';

function checkpointPath(root: string): string {
  return path.join(root, '.process-ai', 'checkpoint.json');
}

interface CheckpointState {
  stage: string;
  artifacts: Array<{ sha256: string; artifactType: string; path: string }>;
  gates: Array<{ gateId: string; decision: string; decidedAt: string }>;
  lastCheckpointAt: string;
  walCursor: number;
}

async function readCheckpoint(root: string): Promise<CheckpointState> {
  return JSON.parse(await fs.readFile(checkpointPath(root), 'utf8')) as CheckpointState;
}

/** Drive um comando JSON-retornador via dispatcher e devolve o objeto parseado. */
async function runJson(argv: string[], adapter: ClaudeCodeAdapter, root: string): Promise<unknown> {
  const res = await dispatch(parseArgs(argv), adapter, root);
  return JSON.parse(res.output);
}

test('E2E: loop completo do condutor — Gate 0 → pipeline(gates+estágios) → resumo+relatório → resume-sem-duplicação', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-e2e-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });

    // 1) Início — resume em sessão vazia (AC5).
    const initial = (await runJson(['resume'], adapter, tmp)) as {
      state: CheckpointState;
      orphans: unknown[];
    };
    assert.equal(initial.state.stage, 'init', 'sessão nova começa no estágio init');
    assert.deepEqual(initial.orphans, []);

    // 2) Déa inicia a sessão + Gate 0 (escopo).
    await runJson(['stage', '--to', 'scope'], adapter, tmp);
    await runJson(['gate', '--id', 'gate-0', '--decision', 'approved'], adapter, tmp);

    // 3) Pipeline fixa: cada slot de especialista precedido por seu gate (AC3).
    //    Em 1.5 são slots declarados — sem artefatos de especialista (ledger vazio).
    const flow: Array<[string, string]> = [
      ['gate-1', 'discovery'], // Bento
      ['gate-2', 'mapping'], // Miguel
      ['gate-3', 'modeling'], // Júlia
      ['gate-4', 'standardization'], // Zanoni
    ];
    for (const [gateId, stage] of flow) {
      await runJson(['gate', '--id', gateId, '--decision', 'approved'], adapter, tmp);
      await runJson(['stage', '--to', stage], adapter, tmp);
    }

    // 4) Encerramento — estágio final summary (AC6).
    await runJson(['stage', '--to', 'summary'], adapter, tmp);
    let cp = await readCheckpoint(tmp);
    assert.equal(cp.stage, 'summary', 'estágio final deve ser summary');

    // 5) Relatório de confiança (run 1.5-only → zeros honestos, NFR-1).
    const reportRes = await dispatch(parseArgs(['report']), adapter, tmp);
    assert.match(reportRes.output, /Relatório de Confiança/);
    assert.match(reportRes.output, /0/, 'run sem especialistas deve mostrar contagens zero');

    // 6) Propose do entregável final (resumo + relatório embutido).
    const payloadPath = path.join(tmp, 'summary-report.json');
    const summaryContent = [
      '# Resumo de encerramento',
      '',
      'Processo mapeado: lead → fechamento.',
      'Decisões dos gates: gate-0..gate-4 aprovados (loop do condutor).',
      '',
      reportRes.output, // relatório de confiança embutido
    ].join('\n');
    await fs.writeFile(payloadPath, JSON.stringify({ artifactType: 'summary-report', content: summaryContent }), 'utf8');

    const proposeRes = await dispatch(parseArgs(['propose', '--payload', payloadPath]), adapter, tmp);
    const commit = JSON.parse(proposeRes.output) as { sha256: string; artifactPath: string; manifestPath: string };
    assert.ok(typeof commit.sha256 === 'string' && commit.sha256.length > 0);

    // 7) Asserções de estado pós-loop.
    cp = await readCheckpoint(tmp);

    // (a) Artefato commitado em _process-ai_output/.
    const norm = (p: string) => p.replace(/\\/g, '/');
    assert.ok(
      norm(commit.artifactPath).includes('_process-ai_output/summary-report/'),
      'artefato deve estar em _process-ai_output/summary-report/',
    );
    await fs.access(commit.artifactPath);
    const committed = await fs.readFile(commit.artifactPath, 'utf8');
    assert.ok(committed.includes('Resumo de encerramento'), 'conteúdo commitado deve igualar o payload.content');

    // (b) Checkpoint com gate-0..gate-4 (cada um uma única vez) + 1 artefato.
    const gateIds = cp.gates.map((g) => g.gateId).sort();
    assert.deepEqual(gateIds, ['gate-0', 'gate-1', 'gate-2', 'gate-3', 'gate-4'], 'todos os gates gate-0..gate-4 registrados');
    assert.equal(new Set(gateIds).size, gateIds.length, 'nenhum gate duplicado');
    assert.equal(cp.artifacts.length, 1, 'exatamente 1 artefato (o summary-report)');
    assert.equal(cp.artifacts[0].artifactType, 'summary-report');
    assert.equal(cp.artifacts[0].sha256, commit.sha256);

    // 8) Resume subsequente NÃO duplica estado nem cria órfãos (AC5).
    const walCursorBefore = cp.walCursor;
    const reResume = (await runJson(['resume'], adapter, tmp)) as {
      state: CheckpointState;
      orphans: unknown[];
    };
    assert.equal(reResume.state.walCursor, walCursorBefore, 'walCursor não deve regredir/avançar em re-resume');
    assert.equal(reResume.state.artifacts.length, 1, 'artefato não duplicado em re-resume');
    assert.equal(reResume.state.gates.length, 5, 'gates não duplicados em re-resume');
    assert.equal(reResume.state.stage, 'summary');
    assert.deepEqual(reResume.orphans, [], 'summary-report é referenciado → não vira órfão');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('E2E: retomada no meio da pipeline — resume volta ao último estágio/gate concluído', async () => {
  // Simula uma sessão interrompida após Gate 1 + discovery: ao "reiniciar",
  // o resume reflete o estado persistido e o condutor continua dali.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-e2e-resume-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });

    await runJson(['stage', '--to', 'scope'], adapter, tmp);
    await runJson(['gate', '--id', 'gate-0', '--decision', 'approved'], adapter, tmp);
    await runJson(['gate', '--id', 'gate-1', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'discovery'], adapter, tmp);

    // "Reinício" — novo adapter (novo processo) lê o checkpoint persistido.
    const adapter2 = new ClaudeCodeAdapter({ cwd: tmp });
    const resumed = (await runJson(['resume'], adapter2, tmp)) as {
      state: CheckpointState;
      orphans: unknown[];
    };
    assert.equal(resumed.state.stage, 'discovery', 'retoma no último estágio concluído');
    const gateIds = resumed.state.gates.map((g) => g.gateId).sort();
    assert.deepEqual(gateIds, ['gate-0', 'gate-1'], 'gates já registrados preservados');

    // O condutor continua dali (sem duplicar gate-1).
    await runJson(['gate', '--id', 'gate-2', '--decision', 'approved'], adapter2, tmp);
    await runJson(['stage', '--to', 'mapping'], adapter2, tmp);
    const cp = await readCheckpoint(tmp);
    assert.equal(cp.stage, 'mapping');
    assert.equal(cp.gates.length, 3, 'gate-2 adicionado sem duplicar gate-0/gate-1');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
