/**
 * tests/miguel-hierarchy.test.ts — Miguel profundo (story 2.2, AC1/AC2/AC3/AC5/AD-5).
 *
 * Prova o coração da 2.2: **Miguel decompõe a Cadeia de Valor de Bento na hierarquia
 * completa e rastreável** (5 níveis canônicos Macro→Tarefa, com pai/filho explícito + IDs
 * estáveis e níveis incompletos marcados honestamente). 1.6 só produzia um rascunho raso
 * ("1–2 níveis abaixo", um 🟢 + 🟡). Duas preocupações, ambas exercitadas:
 *
 *  1. **Mecanismo (espelha bento-discovery.test.ts):** propor `value-chain` (fonte) → propor
 *     `hierarchy` com 🟢 sourcing `value-chain` (resolve) + 🟢 com sha inexistente (degrada a
 *     🟡 `unresolved-source`, não aborta) + 🟡 (inferido) + 🔴 (gap de nível). Ledger com o 🟢
 *     resolvido e o degradado; relatório sem a nota de "zeros honestos". Drive determinístico
 *     via `dispatch(parseArgs([...]), adapter, root)` com `new ClaudeCodeAdapter({ cwd: tmp })`
 *     — sem LLM.
 *  2. **Profundidade da skill + guards de honestidade (específico do Miguel):** lê
 *     `skills/process-ai-miguel/SKILL.md` e asserção de propriedades que **NÃO existem na skill
 *     1.6** (IDs de nó estáveis; ramo profundo até Tarefa) — prova que a profundidade foi
 *     autorada de fato. Mais guards `doesNotMatch` que travam as correções de honestidade do T1
 *     (título stale §3; "rascunho mínimo") contra regressões futuras.
 *
 * Padrão herdado de `e2e-pipeline.test.ts` / `bento-discovery.test.ts` (simula o que a skill do
 * Miguel instrui o agente a fazer).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, dispatch } from '../bin/process-ai.ts';
import { ClaudeCodeAdapter } from '../toolkit/adapters/claude-code/adapter.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_SKILL_MD = path.join(REPO_ROOT, 'skills', 'process-ai-miguel', 'SKILL.md');

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
  const p = path.join(os.tmpdir(), `pa-miguel-payload-${process.pid}-${_payloadCounter++}.json`);
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

test('2.2 AC2/AC3: Miguel profundo decompõe a cadeia em hierarquia completa rastreável (+ degradação)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-miguel-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });

    // ---- Sessão até discovery: Bento entrega a value-chain (fonte do Miguel) ----
    await runJson(['resume'], adapter, tmp);
    await runJson(['stage', '--to', 'scope'], adapter, tmp);
    await runJson(['gate', '--id', 'gate-0', '--decision', 'approved'], adapter, tmp);
    await runJson(['gate', '--id', 'gate-1', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'discovery'], adapter, tmp);

    // value-chain commitada por Bento — é a fonte que habilita claims 🟢 no hierarchy.
    const valueChain = await propose(adapter, tmp, {
      artifactType: 'value-chain',
      content: '# Cadeia de Valor\nAtração → Vendas → Entrega',
    });

    // ---- Gate 2 + mapping: Miguel profundo ----
    await runJson(['gate', '--id', 'gate-2', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'mapping'], adapter, tmp);

    // hierarchy: árvore completa dos 5 níveis (M1 → E1.1 → S1.1.1 → A1.1.1.1 → T1.1.1.1.1),
    // com relação pai/filho explícita + IDs estáveis. claims por nível:
    //  - 🟢 sourcing value-chain (resolve) — deriva nominalmente da cadeia;
    //  - 🟢 com sha inexistente (degrada a 🟡 unresolved-source, não aborta);
    //  - 🟡 nível inferido (sem source);
    //  - 🔴 gap de nível (não determinado).
    await propose(adapter, tmp, {
      artifactType: 'hierarchy',
      content:
        '# Hierarquia de processos — Vendas\n' +
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
        {
          statement: 'A decomposição de M1 em E1.1/S1.1.1/A1.1.1.1 é inferida',
          level: '🟡',
          reasoning: 'Decomposição estimada — não confirmada nominalmente na cadeia',
        },
        {
          statement: 'O nível Tarefa (T1.1.1.1.1) é gap',
          level: '🔴',
          reasoning: 'Tarefa não confirmada pelo leigo; representada como <?>, sem inventar',
        },
      ],
    });

    // ---- Ledger: lê e parseia ----
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

    // 🟢 resolvido sourceando a value-chain (mecanismo AD-5 exercitado ricamente sobre a árvore).
    const vcSourced = entries.find((e) => e.validated === '🟢' && e.source?.sha256 === valueChain.sha256);
    assert.ok(vcSourced, 'há um 🟢 de Miguel sourceando a value-chain (resolve)');

    // 🟢 com sha inexistente → degradado a 🟡 (unresolved-source), não abortou o commit.
    const degraded = entries.find((e) => e.degradationReason === 'unresolved-source');
    assert.ok(degraded, 'claim com fonte inexistente degradado a 🟡 (unresolved-source)');
    assert.equal(degraded!.validated, '🟡');

    // Marcadores completos e honestos (mix 🟢/🟡/🔴) — incluindo o 🔴 de gap de nível (2.2).
    assert.ok(validated.includes('🟢'), 'ao menos um 🟢');
    // 🟡 literal (inferido) distinto do 🟡 que vem de degradação — isola a preservação do 🟡 literal.
    const literalYellow = entries.find((e) => e.validated === '🟡' && !e.degradationReason);
    assert.ok(literalYellow, 'há um 🟡 literal (inferido, não vindo de degradação)');
    assert.ok(validated.includes('🟡'), 'ao menos um 🟡');
    assert.ok(validated.includes('🔴'), 'ao menos um 🔴 (gap de nível declarado pelo Miguel)');

    // ---- hierarchy + value-chain commitados ----
    const cp = (await runJson(['status'], adapter, tmp)) as {
      artifacts: Array<{ artifactType: string }>;
    };
    const types = cp.artifacts.map((a) => a.artifactType).sort();
    assert.deepEqual(types, ['hierarchy', 'value-chain'], 'Miguel commita a hierarchy (fonte: value-chain)');

    // ---- Relatório de confiança: contagens não-zeros, sem a nota de "zeros honestos" ----
    const reportRes = await dispatch(parseArgs(['report']), adapter, tmp);
    assert.match(reportRes.output, /Relatório de Confiança/);
    assert.doesNotMatch(reportRes.output, /Nenhuma afirmação registrada/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('2.2 AC1/AC2: skill do Miguel profunda — IDs estáveis + árvore completa (falha contra a 1.6 rasa)', async () => {
  const content = await fs.readFile(SOURCE_SKILL_MD, 'utf8');

  // ---- Profundidade autorada (provas que FALHAM contra a skill 1.6 rasa) ----

  // Instrução explícita de IDs estáveis (ausente na 1.6 — lá só há nomes de nível, não IDs).
  assert.match(
    content,
    /IDs estáveis/i,
    'skill do Miguel (2.2) deve instruir IDs de nó estáveis — ausente na 1.6',
  );
  // IDs de nó estáveis em uso no nível E2E (ex.: E1.1) — 1.6 não tem IDs numéricos hierárquicos.
  assert.match(
    content,
    /E\d+\.\d+/,
    'skill do Miguel (2.2) deve mostrar IDs estáveis no nível E2E (ex.: E1.1) — ausente na 1.6',
  );
  // O roteiro INSTRUI a decomposição em 5 níveis (prova instrução, não só exemplo colado).
  assert.match(
    content,
    /decomponha recursivamente/i,
    'skill do Miguel (2.2) deve instruir o roteiro de decomposição em 5 níveis (não só exemplificar)',
  );
  // Ramo profundo até Tarefa (5 segmentos: T-x.x.x.x.x) — prova hierarquia completa, não "1–2 níveis" da 1.6.
  assert.match(
    content,
    /T\d+(\.\d+){4,}/,
    'skill do Miguel (2.2) deve decompor até Tarefa (T com 5 segmentos) — 1.6 para em 1–2 níveis',
  );

  // ---- Guards de honestidade (travam as correções do T1 contra regressões futuras) ----

  // Título stale §3 corrigido: 1.6 dizia "primeiro 🟢 do sistema" (falso pós-2.1 — Bento 🟢 primeiro).
  assert.doesNotMatch(
    content,
    /primeiro 🟢 do sistema/,
    "título stale 'primeiro 🟢 do sistema' foi corrigido em 2.2 (Miguel continua a cadeia de 🟢)",
  );
  // artifactType profundo: 1.6 dizia "rascunho mínimo" — removido em 2.2.
  assert.doesNotMatch(
    content,
    /rascunho mínimo/i,
    "removido 'rascunho mínimo' do artifactType em 2.2 (hierarchy agora é completa)",
  );

  // ---- Não-regressão: núcleo preservado (strings assertadas pelo specialists.test.ts) ----
  assert.ok(content.includes('process-ai propose'), 'continua instruindo `process-ai propose`');
  assert.ok(/claims/.test(content), 'continua mencionando o campo claims');
  for (const marker of ['🟢', '🟡', '🔴']) {
    assert.ok(content.includes(marker), `continua mencionando o marcador ${marker}`);
  }
  assert.ok(/sem escrita direta/i.test(content), 'continua declarando sem escrita direta (AD-1)');
  assert.ok(content.includes('hierarchy'), 'continua referenciando o artifactType hierarchy');
});
