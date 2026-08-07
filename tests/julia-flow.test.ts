/**
 * tests/julia-flow.test.ts — Júlia profunda (story 2.3, AC1/AC2/AC3/AC4/AC5/AD-5/AD-6).
 *
 * Prova o coração da 2.3: **Júlia modela a hierarquia de Miguel em um fluxo BPMN 2.0 XML
 * canônico, com gargalos com evidência e claims honestos por elemento** (🟢 onde deriva da
 * hierarchy, 🟡 onde o fluxo é inferido, 🔴 onde há passo indeterminado, + gargalos como 🟡
 * com reasoning citando o nó do flow). 1.6 só produzia um rascunho markdown ("lista numerada")
 * com um 🟢 + 🟡, e dizia literalmente "não emita XML". Duas preocupações, ambas exercitadas:
 *
 *  1. **Mecanismo (espelha miguel-hierarchy.test.ts):** propor `hierarchy` (fonte) → propor
 *     `flow` com 🟢 sourcing `hierarchy` (resolve) + 🟢 com sha inexistente (degrada a
 *     🟡 `unresolved-source`, não aborta) + 🟡 (fluxo inferido) + 🔴 (passo indeterminado).
 *     Ledger com o 🟢 resolvido e o degradado; relatório sem a nota de "zeros honestos". Drive
 *     determinístico via `dispatch(parseArgs([...]), adapter, root)` com
 *     `new ClaudeCodeAdapter({ cwd: tmp })` — sem LLM.
 *  2. **Profundidade da skill + guards de honestidade (específico da Júlia):** lê
 *     `skills/process-ai-julia/SKILL.md` e assevera propriedades que **NÃO existem na skill
 *     1.6** (instrução de emissão de BPMN 2.0 XML; roteiro com sequenceFlow/gateways; gargalos
 *     como claim com evidência) — prova que a profundidade foi autorada de fato. Mais guards
 *     `doesNotMatch` que travam as correções de honestidade do T1 (remover "não emita XML",
 *     "rascunho", "fluxo simples") contra regressões futuras.
 *
 * Disciplina TDD "RED-contra-1.6" (herdada da 2.2): as asserções de profundidade devem FALHAR
 * contra a skill 1.6 antes da reescrita — se passarem inalteradas, o teste é fraco (lição da
 * revisão da 2.2: o regex não pode casar trivialmente a skill antiga).
 *
 * Padrão herdado de `e2e-pipeline.test.ts` / `miguel-hierarchy.test.ts` (simula o que a skill da
 * Júlia instrui o agente a fazer).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, dispatch } from '../bin/process-ai.ts';
import { ClaudeCodeAdapter } from '../toolkit/adapters/claude-code/adapter.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_SKILL_MD = path.join(REPO_ROOT, 'skills', 'process-ai-julia', 'SKILL.md');

/** sha256 hex64 que NÃO corresponde a nenhum manifesto → claim 🟢 degrada a 🟡. */
const NONEXISTENT_SHA = 'a'.repeat(64);

interface CommitResult {
  sha256: string;
  artifactPath: string;
  manifestPath: string;
}

let _payloadCounter = 0;

/** Escreve um ProposePayload num temp, propõe via dispatcher, devolve o CommitResult. */
async function propose(
  adapter: ClaudeCodeAdapter,
  root: string,
  payload: object,
): Promise<CommitResult> {
  const p = path.join(os.tmpdir(), `pa-julia-payload-${process.pid}-${_payloadCounter++}.json`);
  await fs.writeFile(p, JSON.stringify(payload), 'utf8');
  try {
    const res = await dispatch(parseArgs(['propose', '--payload', p]), adapter, root);
    return JSON.parse(res.output) as CommitResult;
  } finally {
    await fs.rm(p, { force: true });
  }
}

async function runJson(argv: string[], adapter: ClaudeCodeAdapter, root: string): Promise<unknown> {
  return JSON.parse((await dispatch(parseArgs(argv), adapter, root)).output);
}

test('2.3 AC2/AC3/AC4: Júlia profunda modela a hierarquia em fluxo BPMN 2.0 XML + gargalos (+ degradação)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-julia-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });

    // ---- Sessão até mapping: Bento (value-chain) → Miguel (hierarchy = fonte do flow) ----
    await runJson(['resume'], adapter, tmp);
    await runJson(['stage', '--to', 'scope'], adapter, tmp);
    await runJson(['gate', '--id', 'gate-0', '--decision', 'approved'], adapter, tmp);
    await runJson(['gate', '--id', 'gate-1', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'discovery'], adapter, tmp);

    // value-chain commitada por Bento (sem claims — só estrutura a cadeia real).
    await propose(adapter, tmp, {
      artifactType: 'value-chain',
      content: { body: '' },
    });

    // ---- Gate 2 + mapping: Miguel entrega a hierarchy (fonte que habilita 🟢 no flow) ----
    await runJson(['gate', '--id', 'gate-2', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'mapping'], adapter, tmp);

    // hierarchy commitada por Miguel — é a fonte que habilita claims 🟢 no flow (AD-5).
    const hierarchy = await propose(adapter, tmp, {
      artifactType: 'hierarchy',
      content: { body: '## M1. Vendas (Macroprocesso) — pai: cadeia de valor\n' +
        '### E1.1. Lead-to-Close (Processo End-to-End) — pai: M1\n' +
        '#### S1.1.1. Qualificação (Subprocesso) — pai: E1.1\n' +
        '- A1.1.1.1. Avaliar fit (Atividade) — pai: S1.1.1\n' +
        '#### S1.1.2. Proposta (Subprocesso) — pai: E1.1\n' +
        '- A1.1.2.1. Enviar proposta (Atividade) — pai: S1.1.2' },
    });

    // ---- Gate 3 + modeling: Júlia profunda ----
    await runJson(['gate', '--id', 'gate-3', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'modeling'], adapter, tmp);

    // flow: BPMN 2.0 XML canônico (content) mapeando a hierarchy. claims por elemento:
    //  - 🟢 sourcing hierarchy (resolve) — tarefa A1.1.1.1 deriva nominalmente da hierarchy;
    //  - 🟢 com sha inexistente (degrada a 🟡 unresolved-source, não aborta);
    //  - 🟡 fluxo inferido (gateway de decisão não explícito na hierarchy);
    //  - 🔴 passo indeterminado (medida/tempo não determinado na descoberta).
    await propose(adapter, tmp, {
      artifactType: 'flow',
      content: { body: '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
        'id="Definitions_vendas" targetNamespace="http://process-ai/flow/vendas">\n' +
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
        '</bpmn:definitions>' },
      claims: [
        {
          statement: 'A tarefa A1.1.1.1 (Avaliar fit) corresponde à atividade nominal na hierarchy',
          level: '🟢',
          source: { artifactType: 'hierarchy', sha256: hierarchy.sha256 },
          reasoning: 'Deriva nominalmente da atividade A1.1.1.1 confirmada na hierarchy de Miguel',
        },
        {
          statement: 'Claim com fonte inexistente (deve degradar)',
          level: '🟢',
          source: { artifactType: 'hierarchy', sha256: NONEXISTENT_SHA },
          reasoning: 'sha256 não resolve a manifesto → degrada a 🟡 (unresolved-source)',
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
      ],
    });

    // ---- Ledger: lê e parseia (só o flow tem claims → entradas são do flow) ----
    const ledgerRaw = await fs.readFile(path.join(tmp, '.process-ai', 'confidence-ledger.jsonl'), 'utf8');
    const entries = ledgerRaw
      .split('\n')
      .filter((l) => l.length > 0)
      .map(
        (l) =>
          JSON.parse(l) as {
            validated: string;
            degradationReason?: string;
            source?: { artifactType: string; sha256: string };
          },
      );
    const validated = entries.map((e) => e.validated);

    // 🟢 resolvido sourceando a hierarchy (mecanismo AD-5 exercitado sobre o flow em BPMN XML).
    const hierSourced = entries.find(
      (e) => e.validated === '🟢' && e.source?.sha256 === hierarchy.sha256,
    );
    assert.ok(hierSourced, 'há um 🟢 de Júlia sourceando a hierarchy (resolve)');

    // 🟢 com sha inexistente → degradado a 🟡 (unresolved-source), não abortou o commit.
    const degraded = entries.find((e) => e.degradationReason === 'unresolved-source');
    assert.ok(degraded, 'claim com fonte inexistente degradado a 🟡 (unresolved-source)');
    assert.equal(degraded!.validated, '🟡');

    // Marcadores completos e honestos (mix 🟢/🟡/🔴) — incluindo o 🔴 de passo indeterminado (2.3).
    assert.ok(validated.includes('🟢'), 'ao menos um 🟢');
    // 🟡 literal (fluxo inferido) distinto do 🟡 que vem de degradação — isola a preservação do 🟡 literal.
    const literalYellow = entries.find((e) => e.validated === '🟡' && !e.degradationReason);
    assert.ok(literalYellow, 'há um 🟡 literal (fluxo inferido, não vindo de degradação)');
    assert.ok(validated.includes('🟡'), 'ao menos um 🟡');
    assert.ok(validated.includes('🔴'), 'ao menos um 🔴 (passo indeterminado declarado pela Júlia)');

    // ---- flow + hierarchy + value-chain commitados ----
    const cp = (await runJson(['status'], adapter, tmp)) as {
      artifacts: Array<{ artifactType: string }>;
    };
    const types = cp.artifacts.map((a) => a.artifactType).sort();
    assert.deepEqual(
      types,
      ['flow', 'hierarchy', 'value-chain'],
      'Júlia commita o flow (fonte: hierarchy) — artifactType flow, NÃO bpmn',
    );
    assert.ok(types.includes('flow') && !types.includes('bpmn'), 'flow (não bpmn) — Decision #1');

    // ---- Relatório de confiança: contagens não-zeros, sem a nota de "zeros honestos" ----
    const reportRes = await dispatch(parseArgs(['report']), adapter, tmp);
    assert.match(reportRes.output, /Relatório de Confiança/);
    assert.doesNotMatch(reportRes.output, /Nenhuma afirmação registrada/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('2.3 AC1/AC2/AC3: skill da Júlia profunda — BPMN 2.0 XML + roteiro + gargalos c/ evidência (falha contra a 1.6 rasa)', async () => {
  const content = await fs.readFile(SOURCE_SKILL_MD, 'utf8');

  // ---- Profundidade autorada (provas que FALHAM contra a skill 1.6 rasa) ----

  // Instrução/exemplo de emissão de BPMN 2.0 XML (1.6 dizia "não emita XML" — não tem XML).
  assert.match(
    content,
    /<bpmn:definitions|<bpmn:process/i,
    'skill da Júlia (2.3) deve instruir/exemplar a emissão de BPMN 2.0 XML — ausente na 1.6',
  );
  // Roteiro conecta elementos via sequenceFlow — 1.6 não tem elementos BPMN.
  assert.match(
    content,
    /sequenceFlow/i,
    'skill da Júlia (2.3) deve instruir o uso de sequenceFlow no roteiro — ausente na 1.6',
  );
  // Roteiro identifica pontos de decisão/paralelismo (gateways) — 1.6 não tem gateways.
  assert.match(
    content,
    /exclusiveGateway|parallelGateway/i,
    'skill da Júlia (2.3) deve instruir gateways (decisão/paralelismo) — ausente na 1.6',
  );
  // Gargalos como CLAIM com evidência (reasoning/🟡/claim) — 1.6 só defere "→ 2.3".
  assert.match(
    content,
    /gargalo[\s\S]{0,120}reasoning/i,
    'skill da Júlia (2.3) deve instruir gargalos como claim cujo reasoning cita evidência — 1.6 só defere',
  );

  // ---- Guards de honestidade (travam as correções do T1 contra regressões futuras) ----

  // Note stale corrigida: 1.6 dizia "Não emita XML aqui" — removido em 2.3 (Júlia agora emite BPMN 2.0 XML).
  assert.doesNotMatch(
    content,
    /não emita XML/i,
    "removido 'não emita XML' da skill em 2.3 (Júlia agora emite BPMN 2.0 XML)",
  );
  // Note stale corrigida: 1.6 dizia "rascunho em markdown" — removido em 2.3.
  assert.doesNotMatch(
    content,
    /rascunho/i,
    "removido 'rascunho' da skill em 2.3 (flow agora é BPMN 2.0 XML, não rascunho markdown)",
  );
  // Note stale corrigida: 1.6 dizia "fluxo simples" — removido em 2.3.
  assert.doesNotMatch(
    content,
    /fluxo simples/i,
    "removido 'fluxo simples' da skill em 2.3 (Júlia agora modela em BPMN 2.0 XML)",
  );

  // ---- Não-regressão: núcleo preservado (strings assertadas pelo specialists.test.ts) ----
  assert.ok(content.includes('process-ai propose'), 'continua instruindo `process-ai propose`');
  assert.ok(/claims/.test(content), 'continua mencionando o campo claims');
  for (const marker of ['🟢', '🟡', '🔴']) {
    assert.ok(content.includes(marker), `continua mencionando o marcador ${marker}`);
  }
  assert.ok(/sem escrita direta/i.test(content), 'continua declarando sem escrita direta (AD-1)');
  assert.ok(content.includes('flow'), 'continua referenciando o artifactType flow (Decision #1)');
});
