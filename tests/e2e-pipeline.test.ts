/**
 * tests/e2e-pipeline.test.ts — E2E da pipeline COM rascunhos de especialistas (CRITÉRIO IMPLÍCITO 1.6).
 *
 * Diferente do `e2e-conductor.test.ts` (loop do condutor SEM especialistas → ledger vazio
 * → zeros honestos, regressão da 1.5), este teste exercita a pipeline **com produção de
 * rascunhos + claims**, provando:
 *  - cada especialista commita seu rascunho via `propose` com `claims` (FR-6/7/8/9/10/12 mínimo);
 *  - **provenance cruzada (AD-5, mecanismo 1.4):** Miguel alcança 🟢 sourcing a `value-chain`
 *    de Bento (manifesto resolve); um claim com sha **inexistente** é **degradado a 🟡**
 *    (unresolved-source) — não aborta o commit;
 *  - o ledger `.process-ai/confidence-ledger.jsonl` é **não-vazio** e o relatório de confiança
 *    deixa de ter a nota de "zeros honestos" (AC6);
 *  - 6 artefatos commitados (sipoc, value-chain, hierarchy, flow, pop, summary-report);
 *    **(2.1: +discovery-interview → 7 artefatos; Bento agora pode 🟢 sourcing a entrevista)**;
 *    **(2.2: Miguel profundo — hierarchy com árvore completa (5 níveis, IDs estáveis, pai/filho)
 *    + 🔴 de gap de nível; a contagem permanece 7 — nenhum artifactType novo)**;
 *    **(2.3: Júlia profunda — flow com content = BPMN 2.0 XML + 🟡 fluxo inferido + 🔴 passo
 *    indeterminado + gargalo 🟡 com evidência; a contagem permanece 7 — artifactType flow
 *    inalterado, profundidade no conteúdo (Decision #1))**;
 *  - resume subsequente não duplica estado nem cria órfãos.
 *
 * Drive via `dispatch(parseArgs(...), adapter, root)` — determinístico, sem LLM (o teste
 * simula o que a skill instrui o agente a fazer). Padrão herdado da 1.1–1.5.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, dispatch } from '../bin/process-ai.ts';
import { ClaudeCodeAdapter } from '../toolkit/adapters/claude-code/adapter.ts';

/** sha256 hex64 que NÃO corresponde a nenhum manifesto → claim 🟢 degrada a 🟡. */
const NONEXISTENT_SHA = 'a'.repeat(64);

interface CommitResult {
  sha256: string;
  artifactPath: string;
  manifestPath: string;
}

interface CheckpointArtifact {
  sha256: string;
  artifactType: string;
  path: string;
}

interface CheckpointState {
  stage: string;
  artifacts: CheckpointArtifact[];
  gates: Array<{ gateId: string; decision: string; decidedAt: string }>;
  lastCheckpointAt: string;
  walCursor: number;
}

function checkpointPath(root: string): string {
  return path.join(root, '.process-ai', 'checkpoint.json');
}
async function readCheckpoint(root: string): Promise<CheckpointState> {
  return JSON.parse(await fs.readFile(checkpointPath(root), 'utf8')) as CheckpointState;
}
function ledgerPath(root: string): string {
  return path.join(root, '.process-ai', 'confidence-ledger.jsonl');
}

/** Drive um comando JSON-retornador via dispatcher e devolve o objeto parseado. */
async function runJson(argv: string[], adapter: ClaudeCodeAdapter, root: string): Promise<unknown> {
  return JSON.parse((await dispatch(parseArgs(argv), adapter, root)).output);
}

let _payloadCounter = 0;

/** Escreve um ProposePayload num temp, propõe via dispatcher, devolve o CommitResult. */
async function propose(
  adapter: ClaudeCodeAdapter,
  root: string,
  payload: object,
): Promise<CommitResult> {
  const p = path.join(os.tmpdir(), `pa-e2e-payload-${process.pid}-${_payloadCounter++}.json`);
  await fs.writeFile(p, JSON.stringify(payload), 'utf8');
  try {
    const res = await dispatch(parseArgs(['propose', '--payload', p]), adapter, root);
    return JSON.parse(res.output) as CommitResult;
  } finally {
    await fs.rm(p, { force: true });
  }
}

test('E2E: pipeline com rascunhos + claims + provenance cruzada ponta-a-ponta', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-e2e-pipe-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });

    // ---- Início + Gate 0 ----
    await runJson(['resume'], adapter, tmp);
    await runJson(['stage', '--to', 'scope'], adapter, tmp);
    await runJson(['gate', '--id', 'gate-0', '--decision', 'approved'], adapter, tmp);

    // ---- Bento (discovery): entrevista persistida + sipoc + value-chain (2.1: Bento pode 🟢 sourcing a entrevista) ----
    await runJson(['gate', '--id', 'gate-1', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'discovery'], adapter, tmp);

    // 2.1: Bento persiste a entrevista PRIMEIRO — é a fonte que habilita claims 🟢.
    const interview = await propose(adapter, tmp, {
      artifactType: 'discovery-interview',
      content: '# Entrevista de descoberta — Vendas\n## Fornecedores\nMarketing e indicações.\n## Processo\nLead → Qualificação → Proposta → Fechamento.',
    });

    const sipoc = await propose(adapter, tmp, {
      artifactType: 'sipoc',
      content: '# SIPOC\nFornecedores: Marketing. Entradas: Leads. Processo: Vendas. Saídas: Proposta. Clientes: Lead.',
      claims: [
        {
          statement: 'O Marketing fornece os leads',
          level: '🟢',
          source: { artifactType: 'discovery-interview', sha256: interview.sha256 },
          reasoning: 'Confirmado pelo leigo na entrevista persistida (2.1)',
        },
        { statement: 'Taxa de conversão atual', level: '🔴', reasoning: 'Leigo não soube informar — gap declarado' },
      ],
    });
    const valueChain = await propose(adapter, tmp, {
      artifactType: 'value-chain',
      content: '# Cadeia de Valor\nLead → Qualificação → Proposta → Fechamento',
      claims: [
        {
          statement: 'A cadeia de valor tem 4 macroprocessos',
          level: '🟢',
          source: { artifactType: 'discovery-interview', sha256: interview.sha256 },
          reasoning: 'Macroprocessos confirmados na entrevista persistida (2.1)',
        },
      ],
    });

    // ---- Miguel (2.2) profundo (mapping): hierarchy com árvore completa (5 níveis, IDs
    //      estáveis, pai/filho explícito) + 🟢 sourcing value-chain (resolve) + 🟢 com sha
    //      inexistente (degrada a 🟡, unresolved-source) + 🟡 inferido + 🔴 gap de nível.
    //      (Bento já 🟢 em 2.1; Miguel continua a cadeia sourcing value-chain.) ----
    await runJson(['gate', '--id', 'gate-2', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'mapping'], adapter, tmp);

    const hierarchy = await propose(adapter, tmp, {
      artifactType: 'hierarchy',
      content:
        '# Hierarquia — Vendas\n' +
        '## M1. Vendas (Macroprocesso) — pai: cadeia de valor\n' +
        '### E1.1. Lead-to-Close (Processo End-to-End) — pai: M1\n' +
        '#### S1.1.1. Qualificação (Subprocesso) — pai: E1.1\n' +
        '- A1.1.1.1. Avaliar fit (Atividade) — pai: S1.1.1\n' +
        '  - T1.1.1.1.1. <?> (Tarefa — gap: não confirmada) — pai: A1.1.1.1',
      claims: [
        {
          statement: 'O macroprocesso M1 (Vendas) consta nominalmente na Cadeia de Valor',
          level: '🟢',
          source: { artifactType: 'value-chain', sha256: valueChain.sha256 },
          reasoning: 'M1 (Vendas) aparece nominalmente na value-chain (deriva da fonte)',
        },
        {
          statement: 'Claim com fonte inexistente (deve degradar)',
          level: '🟢',
          source: { artifactType: 'value-chain', sha256: NONEXISTENT_SHA },
          reasoning: 'sha256 não resolve a manifesto → degrada a 🟡 (unresolved-source)',
        },
        { statement: 'A decomposição de M1 em E1.1/S1.1.1/A1.1.1.1 é inferida', level: '🟡', reasoning: 'Decomposição estimada — não confirmada nominalmente na cadeia' },
        { statement: 'O nível Tarefa (T1.1.1.1.1) é gap', level: '🔴', reasoning: 'Tarefa não confirmada pelo leigo; representada como <?>, sem inventar' },
      ],
    });

    // ---- Júlia (2.3) profunda (modeling): flow com content = BPMN 2.0 XML + claims honestos
    //      (🟢 sourcing hierarchy resolve + 🟡 fluxo inferido + 🔴 passo indeterminado + gargalo 🟡
    //      com evidência citando o nó do flow). artifactType flow inalterado (Decision #1);
    //      contagem permanece 7 (nenhum artefato novo). ----
    await runJson(['gate', '--id', 'gate-3', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'modeling'], adapter, tmp);

    const flow = await propose(adapter, tmp, {
      artifactType: 'flow',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_vendas" targetNamespace="http://process-ai/flow/vendas">\n' +
        '  <bpmn:process id="Process_vendas" isExecutable="false">\n' +
        '    <bpmn:startEvent id="Start_captao_lead" name="Captação do lead"/>\n' +
        '    <bpmn:task id="A1.1.1.1" name="Avaliar fit (Qualificação)"/>\n' +
        '    <bpmn:exclusiveGateway id="Gateway_fit" name="Lead qualificado?"/>\n' +
        '    <bpmn:task id="A1.1.2.1" name="Enviar proposta"/>\n' +
        '    <bpmn:endEvent id="End_fechamento" name="Fechamento"/>\n' +
        '    <bpmn:endEvent id="End_rejeicao" name="Lead descartado"/>\n' +
        '    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_captao_lead" targetRef="A1.1.1.1"/>\n' +
        '    <bpmn:sequenceFlow id="Flow_2" sourceRef="A1.1.1.1" targetRef="Gateway_fit"/>\n' +
        '    <bpmn:sequenceFlow id="Flow_3" sourceRef="Gateway_fit" targetRef="A1.1.2.1">\n' +
        '      <bpmn:conditionExpression>fit aprovado</bpmn:conditionExpression>\n' +
        '    </bpmn:sequenceFlow>\n' +
        '    <bpmn:sequenceFlow id="Flow_3n" sourceRef="Gateway_fit" targetRef="End_rejeicao">\n' +
        '      <bpmn:conditionExpression>fit reprovado</bpmn:conditionExpression>\n' +
        '    </bpmn:sequenceFlow>\n' +
        '    <bpmn:sequenceFlow id="Flow_4" sourceRef="A1.1.2.1" targetRef="End_fechamento"/>\n' +
        '  </bpmn:process>\n' +
        '</bpmn:definitions>',
      claims: [
        {
          statement: 'A tarefa A1.1.1.1 (Avaliar fit) corresponde à atividade nominal na hierarchy',
          level: '🟢',
          source: { artifactType: 'hierarchy', sha256: hierarchy.sha256 },
          reasoning: 'Deriva nominalmente da atividade A1.1.1.1 confirmada na hierarchy de Miguel',
        },
        {
          statement: 'O gateway exclusivo Gateway_fit (decisão de qualificação) é inferido',
          level: '🟡',
          reasoning: 'Ponto de decisão não explícito na hierarchy — fluxo inferido pela Júlia',
        },
        {
          statement: 'O tempo de espera entre qualificação e proposta é indeterminado',
          level: '🔴',
          reasoning: 'Passo/medida não determinado na descoberta — gap declarado, sem inventar valor',
        },
        {
          statement: 'Gargalo: handoff manual entre A1.1.1.1 (Qualificação) e A1.1.2.1 (Proposta)',
          level: '🟡',
          reasoning: 'Evidência: a sequenceFlow Flow_3 liga A1.1.1.1 a A1.1.2.1 sem sistema integrador — handoff inferido como ponto de espera',
        },
      ],
    });

    // ---- Zanoni (standardization): pop com 🟢 sourcing flow ----
    await runJson(['gate', '--id', 'gate-4', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'standardization'], adapter, tmp);

    await propose(adapter, tmp, {
      artifactType: 'pop',
      content: '# POP — Qualificação de lead\nObjetivo: qualificar. Passos: 1. Verificar fito. 2. Documentar.',
      claims: [
        {
          statement: 'O passo 1 do POP é qualificar o lead',
          level: '🟢',
          source: { artifactType: 'flow', sha256: flow.sha256 },
          reasoning: 'Derivado do passo correspondente no fluxo de Júlia',
        },
      ],
    });

    // ---- Encerramento: summary + relatório (ledger NÃO-VAZIO) ----
    await runJson(['stage', '--to', 'summary'], adapter, tmp);

    const reportRes = await dispatch(parseArgs(['report']), adapter, tmp);
    assert.match(reportRes.output, /Relatório de Confiança/);
    // AC6: ledger não-vazio → a nota de "zeros honestos" (1.5) some.
    assert.doesNotMatch(
      reportRes.output,
      /Nenhuma afirmação registrada/,
      'ledger não-vazio → relatório sem a nota de zeros honestos',
    );

    // Entregável final (resumo + relatório embutido).
    const summary = await propose(adapter, tmp, {
      artifactType: 'summary-report',
      content: '# Resumo de encerramento\nPipeline completa.\n\n' + reportRes.output,
    });

    // ---- Asserções de estado ----
    const cp = await readCheckpoint(tmp);

    // 7 artefatos commitados (2.1: +discovery-interview de Bento; 5 especialistas + summary-report).
    const types = cp.artifacts.map((a) => a.artifactType).sort();
    assert.deepEqual(
      types,
      ['discovery-interview', 'flow', 'hierarchy', 'pop', 'sipoc', 'summary-report', 'value-chain'],
      '7 artefatos commitados pela pipeline (2.1: +discovery-interview)',
    );
    assert.equal(cp.artifacts.length, 7);
    assert.ok(types.includes('flow') && !types.includes('bpmn'), 'Júlia emite flow (NÃO bpmn — AD-6 é 2.3)');

    // Gates gate-0..gate-4 (cada um uma vez).
    const gateIds = cp.gates.map((g) => g.gateId).sort();
    assert.deepEqual(gateIds, ['gate-0', 'gate-1', 'gate-2', 'gate-3', 'gate-4']);
    assert.equal(cp.stage, 'summary');

    // ---- Ledger: não-vazio, com 🟢 resolvido (provenance cruzada) + degradação 🟡 ----
    const ledgerRaw = await fs.readFile(ledgerPath(tmp), 'utf8');
    const entries = ledgerRaw
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as { validated: string; degradationReason?: string; source?: { sha256: string } });
    const validated = entries.map((e) => e.validated);
    assert.ok(validated.length > 0, 'ledger não-vazio');
    assert.ok(validated.includes('🟢'), 'ao menos um 🟢 validado (provenance cruzada resolveu)');
    // 2.1: Bento agora alcança 🟢 — há um 🟢 cuja fonte é a entrevista persistida.
    const interviewSourced = entries.find(
      (e) => e.validated === '🟢' && e.source?.sha256 === interview.sha256,
    );
    assert.ok(interviewSourced, 'ao menos um 🟢 de Bento sourceando a discovery-interview (mecanismo 2.1)');
    assert.ok(validated.includes('🟡'), 'ao menos um 🟡');
    assert.ok(validated.includes('🔴'), 'ao menos um 🔴 (gap declarado por Bento)');

    // O claim com sha inexistente foi degradado a 🟡 (unresolved-source) — não abortou o commit.
    const degraded = entries.find((e) => e.degradationReason === 'unresolved-source');
    assert.ok(degraded, 'claim com fonte inexistente degradado a 🟡 (unresolved-source)');
    assert.equal(degraded!.validated, '🟡');

    // ---- Resume subsequente NÃO duplica estado nem cria órfãos (AC5) ----
    const walCursorBefore = cp.walCursor;
    const reResume = (await runJson(['resume'], adapter, tmp)) as {
      state: CheckpointState;
      orphans: unknown[];
    };
    assert.equal(reResume.state.artifacts.length, 7, 'artefatos não duplicados em re-resume (2.1: 7 artefatos)');
    assert.equal(reResume.state.gates.length, 5, 'gates não duplicados em re-resume');
    assert.equal(reResume.state.walCursor, walCursorBefore, 'walCursor não deve regredir/avançar');
    assert.deepEqual(reResume.orphans, [], 'todos os manifestos referenciados → sem órfãos');

    // Sanity: o summary-report está em _process-ai_output/summary-report/.
    const norm = (p: string) => p.replace(/\\/g, '/');
    assert.ok(
      norm(summary.artifactPath).includes('_process-ai_output/summary-report/'),
      'entregável final em _process-ai_output/summary-report/',
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
