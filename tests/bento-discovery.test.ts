/**
 * tests/bento-discovery.test.ts — Mecanismo de descoberta do Bento (story 2.1, AC2/AC3/AD-5).
 *
 * Prova o coração da 2.1: **Bento persiste a entrevista (`discovery-interview`) e pode 🟢
 * sourcing-a** (1.6 só permitia 🟡/🔴). Cobre:
 *  - a entrevista é commitada como artefato-fonte (markdown, sem claims);
 *  - um claim 🟢 com `source` → `discovery-interview` (sha real) **resolve** → 🟢 validado;
 *  - um claim 🟢 com sha **inexistente** é **degradado a 🟡** (`unresolved-source`), não aborta;
 *  - 🟡 (inferido, sem source) e 🔴 (gap) preservados;
 *  - a cadeia de valor também pode 🟢 sourcing a entrevista (AC3).
 *
 * Drive via `dispatch(parseArgs([...]), adapter, root)` — determinístico, sem LLM. Padrão
 * herdado de `e2e-pipeline.test.ts` (simula o que a skill do Bento instrui o agente a fazer).
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

let _payloadCounter = 0;

/** Escreve um ProposePayload num temp, propõe via dispatcher, devolve o CommitResult. */
async function propose(
  adapter: ClaudeCodeAdapter,
  root: string,
  payload: object,
): Promise<CommitResult> {
  const p = path.join(os.tmpdir(), `pa-bento-payload-${process.pid}-${_payloadCounter++}.json`);
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

test('2.1 AC2/AC3: Bento persiste a entrevista e alcança 🟢 sourcing-a (+ degradação)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-bento-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });

    // ---- Sessão até o estágio discovery ----
    await runJson(['resume'], adapter, tmp);
    await runJson(['stage', '--to', 'scope'], adapter, tmp);
    await runJson(['gate', '--id', 'gate-0', '--decision', 'approved'], adapter, tmp);
    await runJson(['gate', '--id', 'gate-1', '--decision', 'approved'], adapter, tmp);
    await runJson(['stage', '--to', 'discovery'], adapter, tmp);

    // ---- Bento: persiste a entrevista PRIMEIRO (fonte dos claims 🟢) ----
    const interview = await propose(adapter, tmp, {
      artifactType: 'discovery-interview',
      content:
        '# Entrevista de descoberta — Vendas\n## Fornecedores\nMarketing e indicações.\n## Processo\nLead → Qualificação → Proposta → Fechamento.',
    });

    // ---- Bento: SIPOC com claim 🟢 (resolve) + 🟢 inexistente (degrada) + 🟡 + 🔴 ----
    await propose(adapter, tmp, {
      artifactType: 'sipoc',
      content: '# SIPOC\nFornecedores: Marketing. Entradas: Leads. Saídas: Proposta.',
      claims: [
        {
          statement: 'O Marketing fornece os leads',
          level: '🟢',
          source: { artifactType: 'discovery-interview', sha256: interview.sha256 },
          reasoning: 'Confirmado pelo leigo na entrevista persistida',
        },
        {
          statement: 'Claim com fonte inexistente (deve degradar)',
          level: '🟢',
          source: { artifactType: 'discovery-interview', sha256: NONEXISTENT_SHA },
          reasoning: 'sha256 não resolve a manifesto → degrada a 🟡 (unresolved-source)',
        },
        { statement: 'Taxa de conversão atual', level: '🟡', reasoning: 'Leigo estimou — inferido' },
        { statement: 'Tempo médio de resposta ao lead', level: '🔴', reasoning: 'Gap declarado' },
      ],
    });

    // ---- Bento: Cadeia de Valor com 🟢 sourcing a entrevista (AC3) ----
    await propose(adapter, tmp, {
      artifactType: 'value-chain',
      content: '# Cadeia de Valor\nAtração → Vendas → Entrega',
      claims: [
        {
          statement: 'A cadeia inclui Atração → Vendas → Entrega',
          level: '🟢',
          source: { artifactType: 'discovery-interview', sha256: interview.sha256 },
          reasoning: 'Macroprocessos confirmados na entrevista persistida',
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

    // 🟢 resolvido sourceando a entrevista (o novo mecanismo da 2.1).
    const interviewSourced = entries.find(
      (e) => e.validated === '🟢' && e.source?.sha256 === interview.sha256,
    );
    assert.ok(interviewSourced, 'há um 🟢 de Bento sourceando a discovery-interview (resolve)');

    // 🟢 com sha inexistente → degradado a 🟡 (unresolved-source), não abortou o commit.
    const degraded = entries.find((e) => e.degradationReason === 'unresolved-source');
    assert.ok(degraded, 'claim com fonte inexistente degradado a 🟡 (unresolved-source)');
    assert.equal(degraded!.validated, '🟡');

    // Marcadores completos e honestos (mix 🟢/🟡/🔴).
    assert.ok(validated.includes('🟢'), 'ao menos um 🟢');
    assert.ok(validated.includes('🟡'), 'ao menos um 🟡');
    assert.ok(validated.includes('🔴'), 'ao menos um 🔴 (gap declarado por Bento)');

    // ---- 3 artefatos de Bento commitados ----
    const cp = (await runJson(['status'], adapter, tmp)) as {
      artifacts: Array<{ artifactType: string }>;
    };
    const types = cp.artifacts.map((a) => a.artifactType).sort();
    assert.deepEqual(
      types,
      ['discovery-interview', 'sipoc', 'value-chain'],
      'Bento commita entrevista + SIPOC + cadeia',
    );

    // ---- Relatório de confiança: contagens não-zeros, sem a nota de "zeros honestos" ----
    const reportRes = await dispatch(parseArgs(['report']), adapter, tmp);
    assert.match(reportRes.output, /Relatório de Confiança/);
    assert.doesNotMatch(reportRes.output, /Nenhuma afirmação registrada/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
