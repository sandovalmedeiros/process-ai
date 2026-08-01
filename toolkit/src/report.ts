/**
 * toolkit/src/report.ts — RELATÓRIO DE CONFIANÇA MÍNIMO (AC6, AD-5, NFR-1).
 *
 * Materializa o invariante AD-5 no lado da leitura: o relatório LÊ o ledger de
 * confiança (evidência) e agrega contagens — ele NÃO reatribui níveis, NÃO infere
 * e NÃO infla. Sessões sem claims (run 1.5-only, ledger vazio) devolvem contagens
 * zeradas honestamente (NFR-1 / SM-C1).
 *
 * Versão MÍNIMA em 1.5: contagens 🟢/🟡/🔴 por nível VALIDADO + lista de artefatos
 * do checkpoint + nota de gaps (🔴) e orphans (quarantine/).
 *
 * INVARIANTE AD-3 (núcleo hexagonal): este arquivo só importa `node:*` builtins
 * ou caminhos relativos dentro do core — nunca um package npm. O teste
 * tests/import-boundary.test.ts cobre `report.ts` automaticamente.
 *
 * Fronteiras (NÃO faça aqui — pertence a outra story):
 *  - rastreabilidade bidirecional (navegar afirmação↔fonte) → Story 2.5.
 *  - verificação de trecho (excerpt match) → Story 2.5.
 *  - relatório consolidado navegável (contagem+lista RICA por claim) → Story 2.5.
 *  - gates ricos (bloqueio por 🟡/🔴) → Story 2.6.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { checkpointRead } from './checkpoint.ts';
import type { ConfidenceLevel } from './confidence.ts';

// ---- Tipos ----

/**
 * Relatório de confiança mínimo (AC6). Objeto canônico determinístico (exceto
 * `generatedAt`, metadado de observabilidade).
 */
export interface ConfidenceReport {
  /** Contagens por nível VALIDADO (do ledger de confiança). */
  counts: { '🟢': number; '🟡': number; '🔴': number };
  /** Total de claims no ledger (= soma das contagens). */
  totalClaims: number;
  /** Artefatos commitados referenciados pelo checkpoint ({ sha256, artifactType }). */
  artifacts: Array<{ sha256: string; artifactType: string }>;
  /** Número de manifestos órfãos em quarantine/ (não referenciados pelo checkpoint). */
  orphans: number;
  /** Estágio atual da sessão (do checkpoint). */
  stage: string;
  /** Timestamp ISO-8601 em que o relatório foi gerado (metadado de observabilidade). */
  generatedAt: string;
}

// ---- Constantes ----

const META_DIR = '.process-ai';
const CONFIDENCE_LEDGER_FILE = 'confidence-ledger.jsonl';
const QUARANTINE_DIR = 'quarantine';

/** Marcadores canônicos (espelha confidence.ts). */
const LEVELS: readonly ConfidenceLevel[] = ['🟢', '🟡', '🔴'];

// ---- Erro acionável ----

export class ReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportError';
  }
}

// ---- Helpers ----

function metaPath(root: string, ...parts: string[]): string {
  return path.join(root, META_DIR, ...parts);
}

/**
 * Lê e agrega o ledger de confiança em contagens por nível VALIDADO.
 * Robusto a ledger ausente/vazio/corrompido: linhas ilegíveis ou sem `validated`
 * válido são ignoradas (nunca lança — AD-4/NFR-1: resume/relatório sobrevivem a
 * arquivos parciais). Retorna um mapa {nível → contagem}.
 */
async function aggregateLedger(
  root: string,
): Promise<{ counts: { '🟢': number; '🟡': number; '🔴': number }; total: number }> {
  const counts: { '🟢': number; '🟡': number; '🔴': number } = { '🟢': 0, '🟡': 0, '🔴': 0 };
  let total = 0;

  const ledgerPath = metaPath(root, CONFIDENCE_LEDGER_FILE);
  let raw: string;
  try {
    raw = await fs.readFile(ledgerPath, 'utf8');
  } catch (e) {
    // Ledger ausente (sessão sem claims — run 1.5-only) → contagens zeradas.
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { counts, total };
    throw e;
  }

  for (const line of raw.split('\n')) {
    if (line.length === 0) continue;
    let entry: { validated?: unknown };
    try {
      entry = JSON.parse(line) as { validated?: unknown };
    } catch {
      continue; // linha corrompida — ignora (honestidade: não inflar nem quebrar)
    }
    const level = entry.validated;
    if (typeof level === 'string' && (LEVELS as readonly string[]).includes(level)) {
      counts[level as ConfidenceLevel]++;
      total++;
    }
  }

  return { counts, total };
}

/**
 * Conta manifestos órfãos em quarantine/. Cada manifesto quarentenado é gravado
 * como `<sha>.json` (junto a um `<sha>.reason.md`). Conta apenas os `.json`.
 * Robusto a quarantine/ inexistente → 0.
 */
async function countOrphans(root: string): Promise<number> {
  const quarantineDir = metaPath(root, QUARANTINE_DIR);
  let entries: string[];
  try {
    entries = await fs.readdir(quarantineDir);
  } catch {
    // quarantine/ ausente, não-diretório ou ilegível → 0 órfãos (nunca lança, NFR-1).
    return 0;
  }
  return entries.filter((f) => f.endsWith('.json')).length;
}

// ---- API ----

/**
 * Gera o relatório de confiança MÍNIMO a partir do estado on-disk (AC6, AD-5).
 *
 * Lê (sem reatribuir nada):
 *  - `.process-ai/confidence-ledger.jsonl` → contagens por nível VALIDADO.
 *  - `.process-ai/checkpoint.json` (via `checkpointRead`) → artefatos + estágio.
 *  - `.process-ai/quarantine/` → contagem de órfãos.
 *
 * Nunca lança por estado ausente/vazio: run 1.5-only (ledger vazio, sem
 * especialistas) devolve contagens zeradas honestamente (NFR-1 / SM-C1).
 *
 * @param root - Raiz da sessão (default = process.cwd()).
 * @returns ConfidenceReport determinístico (exceto `generatedAt`).
 */
export async function reportConfidence(root: string): Promise<ConfidenceReport> {
  const { counts, total } = await aggregateLedger(root);

  // Checkpoint: degrada honestamente se ilegível/corrompido (espelha aggregateLedger —
  // o relatório sobrevive a estado parcial; nunca lança, NFR-1).
  let artifacts: Array<{ sha256: string; artifactType: string }> = [];
  let stage = 'unknown';
  try {
    const state = await checkpointRead(root);
    artifacts = state.artifacts.map((a) => ({ sha256: a.sha256, artifactType: a.artifactType }));
    stage = state.stage;
  } catch {
    // checkpoint.json corrompido/shape inválido → artefatos vazios, stage "unknown".
  }

  const orphans = await countOrphans(root);

  return {
    counts,
    totalClaims: total,
    artifacts,
    orphans,
    stage,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Renderiza o ConfidenceReport em markdown pt-BR canônico (para a Déa embutir no
 * entregável final de encerramento e commitar via `propose`).
 *
 * Estrutura mínima (1.5): título + contagens por nível + total + artefatos +
 * nota de gaps (🔴) e orphans (quarantine/). O relatório CONSOLIDADO navegável
 * (rastreabilidade bidirecional, excerpt) é 2.5.
 */
export function formatConfidenceReport(report: ConfidenceReport): string {
  const lines: string[] = [];
  lines.push('## Relatório de Confiança');
  lines.push('');
  lines.push('Contagem de afirmações por nível de confiança (agregada do ledger de confiança):');
  lines.push('');
  lines.push(`- 🟢 Confiança alta (verificada mecanicamente): ${report.counts['🟢']}`);
  lines.push(`- 🟡 Confiança média (inferida, sem fonte verificável): ${report.counts['🟡']}`);
  lines.push(`- 🔴 Gap declarado: ${report.counts['🔴']}`);
  lines.push('');
  lines.push(`**Total de afirmações registradas:** ${report.totalClaims}`);
  lines.push(`**Artefatos commitados:** ${report.artifacts.length}`);
  if (report.artifacts.length > 0) {
    const byType = new Map<string, number>();
    for (const a of report.artifacts) byType.set(a.artifactType, (byType.get(a.artifactType) ?? 0) + 1);
    const summary = [...byType.entries()].map(([t, n]) => `${t} (${n})`).join(', ');
    lines.push(`**Tipos:** ${summary}`);
  }
  lines.push(`**Estágio atual:** ${report.stage}`);
  lines.push('');

  // Nota de gaps/orphans — honestidade (NFR-1): sinaliza aberturas sem inflar.
  if (report.counts['🔴'] > 0) {
    lines.push(`> ⚠️ Há ${report.counts['🔴']} gap(s) declarado(s) (🔴) — pontos do processo que ainda precisam de evidência.`);
  }
  if (report.orphans > 0) {
    lines.push(`> ⚠️ Há ${report.orphans} manifesto(s) órfão(s) em quarentena (não referenciados pelo checkpoint).`);
  }
  if (report.totalClaims === 0) {
    lines.push(
      '> ℹ️ Nenhuma afirmação registrada no ledger de confiança (sessão sem produção de especialistas). ' +
        'As contagens acima são zeros honestos — não há evidência a inflar.',
    );
  }

  lines.push('');
  lines.push(`_Gerado em: ${report.generatedAt}_`);
  return lines.join('\n');
}
