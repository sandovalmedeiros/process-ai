/**
 * tests/zanoni-pop.test.ts — Zanoni profundo (story 2.4, AC1/AC2/AC3/AC4/AC5/AD-5/AD-6).
 *
 * Prova o coração da 2.4: **Zanoni padroniza o fluxo em POPs completos (ancorados nos IDs
 * `A…`/`T…` da hierarchy) + um diagnóstico consolidado (FR-13), com claims honestos por
 * elemento** (🟢 onde deriva do `flow`, 🟡 onde é inferência/recomendação, 🔴 onde é gap).
 * 1.6 só produzia **um** POP-rascunho para uma atividade, com **um** claim 🟢 (+ um 🔴),
 * e deferia "POPs completos" e "diagnóstico" para → 2.4. Duas preocupações, ambas exercitadas:
 *
 *  1. **Mecanismo (espelha julia-flow.test.ts/miguel-hierarchy.test.ts):** propor `flow`
 *     (fonte de Júlia) → propor `pop` com 🟢 sourcing `flow` (resolve) + 🟢 com sha inexistente
 *     (degrada a 🟡 `unresolved-source`, não aborta) + 🟡 (recomendação inferida) + 🔴 (gap).
 *     Ledger com o 🟢 resolvido e o degradado; relatório sem a nota de "zeros honestos". Drive
 *     determinístico via `dispatch(parseArgs([...]), adapter, root)` com
 *     `new ClaudeCodeAdapter({ cwd: tmp })` — sem LLM.
 *  2. **Profundidade da skill + guards de honestidade (específico do Zanoni):** lê
 *     `skills/process-ai-zanoni/SKILL.md` e assevera propriedades que **NÃO existem na skill
 *     1.6** (roteiro de padronização; POPs ancorados em IDs `A…`/`T…`; diagnóstico consolidado
 *     como trabalho do Zanoni; recomendações marcadas 🟡) — prova que a profundidade foi
 *     autorada de fato. Mais guards `doesNotMatch` que travam as correções de honestidade do T1
 *     (remover "rascunho" e as deferrals "→ 2.4") contra regressões futuras.
 *
 * Disciplina TDD "RED-contra-1.6" (herdada da 2.2/2.3): as asserções de profundidade (teste 2)
 * devem FALHAR contra a skill 1.6 antes da reescrita — se passarem inalteradas, o teste é fraco.
 *
 * Padrão herdado de `e2e-pipeline.test.ts` / `julia-flow.test.ts` (simula o que a skill do
 * Zanoni instrui o agente a fazer).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, dispatch } from '../bin/process-ai.ts';
import { ClaudeCodeAdapter } from '../toolkit/adapters/claude-code/adapter.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_SKILL_MD = path.join(REPO_ROOT, 'skills', 'process-ai-zanoni', 'SKILL.md');

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
  const p = path.join(os.tmpdir(), `pa-zanoni-payload-${process.pid}-${_payloadCounter++}.json`);
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

test('2.4 AC2/AC3/AC4: Zanoni profundo propõe pop com 🟢 sourcing flow + 🟡 (recomendação) + 🔴 (gap) (+ degradação)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-zanoni-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });

    // ---- Sessão até modeling: Bento (value-chain) → Miguel (hierarchy) → Júlia (flow = fonte do pop) ----
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

    // ---- Gate 2 + mapping: Miguel entrega a hierarchy ----
    await runJson(['gate', '--id', 'gate-2', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'mapping'], adapter, tmp);

    await propose(adapter, tmp, {
      artifactType: 'hierarchy',
      content: { body: '## M1. Vendas (Macroprocesso)\n' +
        '#### S1.1.1. Qualificação (Subprocesso)\n' +
        '- A1.1.1.1. Avaliar fit (Atividade)\n' +
        '#### S1.1.2. Proposta (Subprocesso)\n' +
        '- A1.1.2.1. Enviar proposta (Atividade)' },
    });

    // ---- Gate 3 + modeling: Júlia profunda (flow = a fonte que habilita 🟢 no pop) ----
    await runJson(['gate', '--id', 'gate-3', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'modeling'], adapter, tmp);

    const flow = await propose(adapter, tmp, {
      artifactType: 'flow',
      content: { body: '' },
    });

    // ---- Gate 4 + standardization: Zanoni profundo ----
    //      pop = POPs completos (ancorados em A…/T… da hierarchy) + diagnóstico consolidado (FR-13)
    //      como conteúdo (Decision #1: artifactType permanece `pop`, diagnóstico NÃO é tipo novo).
    //      claims por elemento: 🟢 sourcing flow (resolve) + 🟢 com sha inexistente (degrada a
    //      🟡 unresolved-source, não aborta) + 🟡 literal (recomendação inferida) + 🔴 (gap).
    await runJson(['gate', '--id', 'gate-4', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'standardization'], adapter, tmp);

    await propose(adapter, tmp, {
      artifactType: 'pop',
      content: { body: 'Objetivo: qualificar o lead. Responsável: Vendas. Passos: 1. Avaliar fit. 2. Documentar.\n\n' +
        '# POP — Envio de proposta (A1.1.2.1)\n' +
        'Objetivo: enviar a proposta. Responsável: Vendas. Passos: 1. Redigir proposta. 2. Enviar.\n\n' +
        '# Diagnóstico consolidado\n' +
        '- Gargalo: handoff sem sistema integrador entre A1.1.1.1 e A1.1.2.1 (🟡).\n' +
        '- Gap: SLA de resposta não determinado — <?> (🔴).\n' +
        '- Recomendação: integrar o CRM ao handoff (🟡).\n' +
        '- Contagem: 1 gargalo, 1 gap, 1 recomendação.' },
      claims: [
        {
          statement: 'O passo 1 do POP (A1.1.1.1) deriva do fluxo de Júlia',
          level: '🟢',
          source: { artifactType: 'flow', sha256: flow.sha256 },
          reasoning: 'Deriva nominalmente da tarefa A1.1.1.1 confirmada no flow — não é inferido',
        },
        {
          statement: 'Claim com fonte inexistente (deve degradar)',
          level: '🟢',
          source: { artifactType: 'flow', sha256: NONEXISTENT_SHA },
          reasoning: 'sha256 não resolve a manifesto → degrada a 🟡 (unresolved-source)',
        },
        {
          statement: 'Recomendação: integrar o CRM ao handoff',
          level: '🟡',
          reasoning: 'Recomendação inferencial (prescritiva), citando o gargalo no flow — nunca 🟢',
        },
        {
          statement: 'O SLA de resposta é indeterminado',
          level: '🔴',
          reasoning: 'Passo/medida não determinado na descoberta — gap declarado, sem inventar valor (SLA: <?>)',
        },
      ],
    });

    // ---- Ledger: lê e parseia (claims só no pop → entradas são do pop) ----
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

    // 🟢 resolvido sourceando o flow (mecanismo AD-5 exercitado sobre o pop em standardization).
    const flowSourced = entries.find(
      (e) => e.validated === '🟢' && e.source?.sha256 === flow.sha256,
    );
    assert.ok(flowSourced, 'há um 🟢 de Zanoni sourceando o flow (resolve)');

    // 🟢 com sha inexistente → degradado a 🟡 (unresolved-source), não abortou o commit.
    const degraded = entries.find((e) => e.degradationReason === 'unresolved-source');
    assert.ok(degraded, 'claim com fonte inexistente degradado a 🟡 (unresolved-source)');
    assert.equal(degraded!.validated, '🟡');

    // Marcadores completos e honestos (mix 🟢/🟡/🔴).
    assert.ok(validated.includes('🟢'), 'ao menos um 🟢');
    // 🟡 literal (recomendação inferida) distinto do 🟡 que vem de degradação — isola a preservação do 🟡 literal.
    const literalYellow = entries.find((e) => e.validated === '🟡' && !e.degradationReason);
    assert.ok(literalYellow, 'há um 🟡 literal (recomendação inferida, não vindo de degradação)');
    assert.ok(validated.includes('🟡'), 'ao menos um 🟡');
    assert.ok(validated.includes('🔴'), 'ao menos um 🔴 (gap declarado pelo Zanoni)');

    // ---- pop commitado (artifactType pop, NÃO novo tipo — Decision #1) ----
    const cp = (await runJson(['status'], adapter, tmp)) as {
      artifacts: Array<{ artifactType: string }>;
    };
    const types = cp.artifacts.map((a) => a.artifactType).sort();
    assert.ok(
      types.includes('pop') && !types.includes('pop-diagnostic') && !types.includes('diagnosis'),
      'Zanoni emite pop (NÃO pop-diagnostic/diagnosis — Decision #1)',
    );

    // ---- Relatório de confiança: contagens não-zeros, sem a nota de "zeros honestos" ----
    const reportRes = await dispatch(parseArgs(['report']), adapter, tmp);
    assert.match(reportRes.output, /Relatório de Confiança/);
    assert.doesNotMatch(reportRes.output, /Nenhuma afirmação registrada/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('2.4 AC1/AC2/AC3: skill do Zanoni profundo — roteiro + POPs (IDs A…/T…) + diagnóstico consolidado + recomendações 🟡 (falha contra a 1.6 rasa)', async () => {
  const content = await fs.readFile(SOURCE_SKILL_MD, 'utf8');

  // ---- Profundidade autorada (provas que FALHAM contra a skill 1.6 rasa) ----

  // Roteiro de padronização completo (AC1) — 1.6 não tem roteiro (só "Produz o POP-rascunho").
  assert.match(
    content,
    /roteiro/i,
    'skill do Zanoni (2.4) deve ter roteiro de padronização estruturado — ausente na 1.6',
  );

  // POPs ancorados nos IDs A…/T… da hierarchy (FR-12) — 1.6 referencia "atividades", não IDs.
  // O ID `A\d`/`T\d` deve aparecer perto de "POP" ou "hierarch" (ancora real, não coincidência solta).
  assert.match(
    content,
    /(?:POP|hierarch)[\s\S]{0,140}?(?:A\d|T\d)|(?:A\d|T\d)[\s\S]{0,140}?(?:POP|hierarch)/i,
    'skill do Zanoni (2.4) deve ancorar POPs nos IDs A…/T… da hierarchy — ausente na 1.6',
  );

  // Diagnóstico consolidado (AC3/FR-13) como trabalho do Zanoni — 1.6 só defere "→ 2.4".
  assert.match(
    content,
    /diagn[óo]stico consolidado/i,
    'skill do Zanoni (2.4) deve produzir diagnóstico consolidado (FR-13) — 1.6 só defere',
  );

  // O diagnóstico cita sua própria contagem (AC3/FR-13) — 1.6 não instrui contagem.
  assert.match(
    content,
    /contagem/i,
    'skill do Zanoni (2.4) deve instruir o diagnóstico a citar a contagem (AC3) — ausente na 1.6',
  );

  // Regra anti-inflação (NFR-1/AC4): 🟢 só para nó confirmado no flow — 1.6 não tem a regra
  // operacional. Trava a remoção futura do box anti-inflação (o toolkit valida resolução, não semântica).
  assert.match(
    content,
    /anti-infla[çc]ão/,
    'skill do Zanoni (2.4) deve ter a regra anti-inflação (🟢 só nó confirmado no flow) — ausente na 1.6',
  );
  assert.match(
    content,
    /nunca[\s\S]{0,60}🟢[\s\S]{0,60}(?:fabricado|inferido|recomenda)/i,
    'skill do Zanoni (2.4) deve proibir 🟢 em elemento fabricado/inferido/recomendação (NFR-1)',
  );

  // 🔴 gap representado com o placeholder <?> (AC4) — 1.6 não nomeia a notação.
  assert.match(
    content,
    /<\?>/,
    'skill do Zanoni (2.4) deve instruir o placeholder <?> para gap 🔴 (AC4) — ausente na 1.6',
  );

  // Recomendações são inferenciais → 🟡 (NFR-1/SM-C1) — 1.6 não instrui isso.
  assert.match(
    content,
    /recomend[\s\S]{0,150}🟡/,
    'skill do Zanoni (2.4) deve marcar recomendações como 🟡 (inferenciais) — ausente na 1.6',
  );

  // ---- Guards de honestidade (travam as correções do T1 contra regressões futuras) ----

  // Notes stale corrigidas: 1.6 deferia "Relatório de diagnóstico → 2.4" e "POPs completos → 2.4"
  // — removidos em 2.4 (agora é trabalho do Zanoni). Guard aceita seta (→/->) ou conector verbal
  // ("para"/"story") e janela de 120 chars — pega deferral reescrita, não só a forma literal.
  assert.doesNotMatch(
    content,
    /Relat[óo]rio de diagn[óo]stico[\s\S]{0,120}(?:→|->|para|\bstory)\s*2\.4/i,
    'skill (2.4) não deve mais deferir diagnóstico para 2.4 (agora é trabalho do Zanoni)',
  );
  assert.doesNotMatch(
    content,
    /POPs? completos?[\s\S]{0,120}(?:→|->|para|\bstory)\s*2\.4/i,
    'skill (2.4) não deve mais deferir POPs completos para 2.4',
  );
  // "rascunho" removido (Zanoni agora produz POPs completos + diagnóstico, não rascunho).
  assert.doesNotMatch(
    content,
    /rascunho/i,
    'skill (2.4) não deve mais dizer "rascunho" (Zanoni agora é profundo)',
  );
});
