/**
 * toolkit/src/report.ts — RELATÓRIO DE CONFIANÇA CONSOLIDADO (AC6, AD-5, NFR-1).
 *
 * Materializa o invariante AD-5 no lado da leitura: o relatório LÊ o ledger de
 * confiança (evidência) e agrega contagens — ele NÃO reatribui níveis, NÃO infere
 * e NÃO infla. Sessões sem claims (run 1.5-only, ledger vazio) devolvem contagens
 * zeradas honestamente (NFR-1 / SM-C1).
 *
 * Versão CONSOLIDADA em 2.5 (FR-14 full, FR-15, FR-16):
 *  - AC1: excerpt-status no relatório (verified/mismatch/no-excerpt/source-missing)
 *    — calculado por helper que lê o artefato-fonte (parity com verifyExcerpt do
 *    confidence.ts: leaf-symlink guard, substring match, nunca lança).
 *  - AC2: rastreabilidade bidirecional navegável (reverse-index derivado do ledger
 *    em leitura — agrupamento por source.artifactType+source.sha256; sem novo
 *    estado persistido, Decision #2).
 *  - AC3: relatório consolidado com lista RICA por nível (claimId, statement,
 *    reasoning, source ref, degradationReason, excerptStatus) + breakdown por
 *    artifactType + órfãos LISTADOS (não só count).
 *  - AC4: statement+reasoning agora disponíveis no ledger (confidence.ts 2.5);
 *    o relatório os exibe.
 *
 * INVARIANTE AD-3 (núcleo hexagonal): este arquivo só importa `node:*` builtins
 * ou caminhos relativos dentro do core — nunca um package npm. O teste
 * tests/import-boundary.test.ts cobre `report.ts` automaticamente.
 *
 * Fronteiras (NÃO faça aqui — pertence a outra story):
 *  - gates ricos (bloqueio por 🟡/🔴) → Story 2.6.
 *  - resumo narrativo final da Déa (FR-5 full) → Story 2.6 (skill layer).
 *  - schema-núcleo por artifactType / method-pack → Epic 3.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { checkpointRead } from './checkpoint.ts';
import type { ConfidenceLevel } from './confidence.ts';

// ---- Tipos ----

/** Status de verificação de excerpt para um claim (AC1/2.5). */
export type ExcerptStatus = 'verified' | 'mismatch' | 'no-excerpt' | 'source-missing';

/** Item rico do relatório por nível (AC3/2.5). */
export interface ReportItem {
  claimId: string;
  statement: string;
  reasoning: string;
  level: ConfidenceLevel;
  source?: { artifactType: string; sha256: string };
  degradationReason?: string;
  excerptStatus: ExcerptStatus;
}

/** Breakdown por artifactType (AC3/2.5). */
export interface ArtifactBreakdown {
  artifactType: string;
  sha256: string;
  counts: { '🟢': number; '🟡': number; '🔴': number };
}

/** Entrada de órfão listada (AC3/2.5). */
export interface OrphanEntry {
  sha256: string;
  quarantinePath: string;
}

/**
 * Relatório de confiança CONSOLIDADO (2.5).
 *
 * Estende o relatório mínimo 1.5 com:
 *  - breakdown por artifactType (lista de {artifactType, sha256, counts})
 *  - itemsByLevel: lista rica de claims por nível 🟢🟡🔴
 *  - reverseIndex: sourceKey → claimId[] (rastreabilidade bidirecional, AC2)
 *  - orphanList: órfãos listados (não só count)
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
  /** Lista de órfãos (AC3/2.5). */
  orphanList: OrphanEntry[];
  /** Estágio atual da sessão (do checkpoint). */
  stage: string;
  /** Timestamp ISO-8601 em que o relatório foi gerado (metadado de observabilidade). */
  generatedAt: string;
  /** Breakdown por artifactType (AC3/2.5). */
  breakdown: ArtifactBreakdown[];
  /** Itens por nível — lista rica (AC3/2.5). */
  itemsByLevel: { '🟢': ReportItem[]; '🟡': ReportItem[]; '🔴': ReportItem[] };
  /** Reverse-index: "artifactType::sha256" → claimId[] (AC2/2.5). */
  reverseIndex: Record<string, string[]>;
}

// ---- Constantes ----

const META_DIR = '.process-ai';
const CONFIDENCE_LEDGER_FILE = 'confidence-ledger.jsonl';
const MANIFESTS_SUBDIR = 'manifests';
const QUARANTINE_DIR = 'quarantine';

/** Marcadores canônicos (espelha confidence.ts). */
const LEVELS: readonly ConfidenceLevel[] = ['🟢', '🟡', '🔴'];

/** SHA-256 canônico: 64 hex lowercase (espelha confidence.ts — F1/review 2.5). */
const HEX64 = /^[0-9a-f]{64}$/;
/** artifactType canônico: kebab-case restrito (espelha confidence.ts — F1/review 2.5). */
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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
 * Containment check (espelha isWithinScope do confidence.ts) — defense-in-depth.
 * Pura — zero IO.
 */
function isWithinScope(absPath: string, scopeDir: string): boolean {
  let scope = path.resolve(scopeDir);
  let abs = path.resolve(absPath);
  if (process.platform === 'win32') {
    scope = scope.toLowerCase();
    abs = abs.toLowerCase();
  }
  return abs === scope || abs.startsWith(scope + path.sep);
}

/**
 * Normaliza emoji removendo variation selector FE0F (deferred-work.md:71).
 * "🟢️" (com FE0F) → "🟢" (sem FE0F) — garante que o `includes` case.
 */
function normalizeLevel(raw: string): string {
  return raw.replace(/️/g, '');
}

/** Source key para o reverse-index: "artifactType::sha256". */
function sourceKey(artifactType: string, sha256: string): string {
  return `${artifactType}::${sha256}`;
}

/** Escapa texto para markdown inline (deferred-work.md:65; F2/review 2.5). */
function escapeMd(s: string): string {
  // Strip newlines primeiro: `\n`/`\r` em texto do agente (statement/reasoning)
  // quebrariam a estrutura de lista do relatório embutido verbatim no summary-report.
  // Depois escapa caracteres com significado especial inline em markdown.
  // `-` e `.` são seguros inline (só especiais como prefixo de linha: listas).
  const noNL = s.replace(/[\r\n]+/g, ' ');
  return noNL.replace(/[\\\`\*\_\{\}\[\]\(\)\#\+\!\|]/g, '\\$&');
}

// ---- T2 (2.5): Leitura do ledger com scan completo ----

/** Entrada parseada do ledger (inclui campos opcionais 2.5). */
interface ParsedLedgerEntry {
  claimId: string;
  artifactType: string;
  artifactSha256: string;
  proposed: ConfidenceLevel;
  validated: ConfidenceLevel;
  source?: { artifactType: string; sha256: string; excerpt?: string };
  degradationReason?: string;
  validatedAt: string;
  statement?: string;
  reasoning?: string;
}

/**
 * Resultado do scan completo do ledger (AC2+AC3/2.5).
 * Substitui o fold counts-only da 1.5 por um scan que preserva entries.
 */
interface LedgerScan {
  counts: { '🟢': number; '🟡': number; '🔴': number };
  total: number;
  entries: ParsedLedgerEntry[];
  /** Reverse-index: sourceKey → claimId[] (AC2). */
  reverseIndex: Record<string, string[]>;
}

/**
 * Lê e faz scan completo do ledger de confiança (AC2+AC3/2.5).
 *
 * Generalizado do fold counts-only da 1.5: agora preserva entries para
 * construir item-list + reverse-index. Resiliência preservada (ENOENT → zeros;
 * linhas ilegíveis/sem validated válido ignoradas — deferred-work.md:64).
 *
 * Dedupe-on-read (deferred-work.md:64): chave (claimId, artifactSha256);
 * se duplicata (ledger editado manualmente), a última ocorrência vence.
 *
 * Leaf-symlink guard (deferred-work.md:63): recusa ler symlink (parity com
 * o escritor confidence.ts `assertNotSymlinkLeaf`).
 *
 * Emoji normalization (deferred-work.md:71): normaliza FE0F antes de
 * `LEVELS.includes` — "🟢️" conta como "🟢".
 *
 * v1 whole-file (deferred-work.md:72): permanece materialização completa;
 * streaming é scale futuro.
 */
async function scanLedger(root: string): Promise<LedgerScan> {
  const counts: { '🟢': number; '🟡': number; '🔴': number } = { '🟢': 0, '🟡': 0, '🔴': 0 };
  const entries: ParsedLedgerEntry[] = [];
  const reverseIndex: Record<string, string[]> = {};
  let total = 0;

  const ledgerPath = metaPath(root, CONFIDENCE_LEDGER_FILE);

  // Leaf-symlink guard (deferred-work.md:63 — parity com o escritor).
  try {
    const st = await fs.lstat(ledgerPath);
    if (!st.isFile()) return { counts, total, entries, reverseIndex };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { counts, total, entries, reverseIndex };
    }
    // ledgerPath inacessível por outro motivo → zeros honestos (resiliência).
    return { counts, total, entries, reverseIndex };
  }

  let raw: string;
  try {
    raw = await fs.readFile(ledgerPath, 'utf8');
  } catch {
    return { counts, total, entries, reverseIndex };
  }
  // F4 (review 2.5): strip BOM UTF-8 líder (editor Windows re-salvando o ledger) —
  // JSON.parse lança em '﻿{...}' e a primeira entry seria dropada silenciosamente.
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  // Dedupe-on-read (deferred-work.md:64): chave (claimId, artifactSha256).
  const seen = new Map<string, number>(); // key → index in entries

  for (const line of raw.split('\n')) {
    if (line.length === 0) continue;
    let parsed: { claimId?: unknown; artifactSha256?: unknown; validated?: unknown; [k: string]: unknown };
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // linha corrompida — ignora (honestidade: não inflar nem quebrar)
    }
    const rawLevel = typeof parsed.validated === 'string' ? parsed.validated : '';
    const level = normalizeLevel(rawLevel);
    if (!level || !(LEVELS as readonly string[]).includes(level)) continue;

    const entry: ParsedLedgerEntry = {
      claimId: typeof parsed.claimId === 'string' ? parsed.claimId : '',
      artifactType: typeof parsed.artifactType === 'string' ? parsed.artifactType : '',
      artifactSha256: typeof parsed.artifactSha256 === 'string' ? parsed.artifactSha256 : '',
      proposed: (typeof parsed.proposed === 'string' && (LEVELS as readonly string[]).includes(normalizeLevel(parsed.proposed)))
        ? normalizeLevel(parsed.proposed) as ConfidenceLevel
        : level as ConfidenceLevel,
      validated: level as ConfidenceLevel,
      degradationReason: typeof parsed.degradationReason === 'string' ? parsed.degradationReason : undefined,
      validatedAt: typeof parsed.validatedAt === 'string' ? parsed.validatedAt : '',
      statement: typeof parsed.statement === 'string' ? parsed.statement : undefined,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined,
    };

    // Source (opcional)
    if (parsed.source && typeof parsed.source === 'object' && !Array.isArray(parsed.source)) {
      const src = parsed.source as Record<string, unknown>;
      if (typeof src.artifactType === 'string' && typeof src.sha256 === 'string') {
        entry.source = {
          artifactType: src.artifactType,
          sha256: src.sha256,
          excerpt: typeof src.excerpt === 'string' ? src.excerpt : undefined,
        };
      }
    }

    const key = `${entry.claimId}::${entry.artifactSha256}`;
    // F5 (review 2.5): só dedupa quando a chave é bem-formada (ambos campos não-
    // vazios). Entries corrompidas sem identidade colidiriam em '::' e a última
    // substituiria a anterior (sub-contagem); não-indexadas, cada uma conta como si.
    const wellFormedKey = entry.claimId.length > 0 && entry.artifactSha256.length > 0;
    const existingIdx = wellFormedKey ? seen.get(key) : undefined;
    if (existingIdx !== undefined) {
      // Dedupe: última ocorrência vence (substitui entrada anterior).
      const oldEntry = entries[existingIdx];
      // Decrementa contagem da entrada antiga antes de substituir.
      counts[oldEntry.validated]--;
      total--;
      // Remove old entry do reverse-index.
      if (oldEntry.source) {
        const sk = sourceKey(oldEntry.source.artifactType, oldEntry.source.sha256);
        const arr = reverseIndex[sk];
        if (arr) {
          const idx = arr.indexOf(oldEntry.claimId);
          if (idx >= 0) arr.splice(idx, 1);
          if (arr.length === 0) delete reverseIndex[sk];
        }
      }
      entries[existingIdx] = entry;
    } else {
      if (wellFormedKey) seen.set(key, entries.length);
      entries.push(entry);
    }

    counts[entry.validated]++;
    total++;

    // Reverse-index (AC2)
    if (entry.source) {
      const sk = sourceKey(entry.source.artifactType, entry.source.sha256);
      if (!reverseIndex[sk]) reverseIndex[sk] = [];
      if (!reverseIndex[sk].includes(entry.claimId)) {
        reverseIndex[sk].push(entry.claimId);
      }
    }
  }

  return { counts, total, entries, reverseIndex };
}

// ---- T2 (2.5): Excerpt status helper ----

/**
 * Computa o status de verificação de excerpt para uma entry do ledger (AC1/2.5).
 *
 * Dado um ParsedLedgerEntry com `source.excerpt`, resolve o artefato-fonte e
 * verifica se o trecho é substring do conteúdo canônico. Espelha `verifyExcerpt`
 * do confidence.ts: lê manifesto → artifactPath → fs.readFile → substring match
 * + leaf-symlink guard. NUNCA lança (resiliência).
 *
 * @returns ExcerptStatus: 'verified' | 'mismatch' | 'no-excerpt' | 'source-missing'
 */
async function computeExcerptStatus(
  entry: ParsedLedgerEntry,
  root: string,
): Promise<ExcerptStatus> {
  if (!entry.source) return 'source-missing';
  if (!entry.source.excerpt || entry.source.excerpt.trim().length === 0) {
    return 'no-excerpt';
  }

  // F1 (review 2.5): defense-in-depth parity com validateClaims. Os campos do ledger
  // não são validados no write-path para claims degradados (buildLedgerEntries persiste
  // `source` mesmo em malformed-source), e ledger editado manualmente pode injetar
  // valores arbitrários. Validar hex64+kebab + containment antes de construir o path do
  // manifesto e aplicar leaf-symlink guard antes de ler (parity com manifestExists/
  // scanLedger — fecha deferred-work.md:63 no lado leitura).
  const srcType = entry.source.artifactType;
  const srcSha = entry.source.sha256;
  if (!HEX64.test(srcSha) || !KEBAB.test(srcType)) {
    return 'source-missing';
  }
  const manifestsDir = metaPath(root, MANIFESTS_SUBDIR);
  const manifestPath = path.join(manifestsDir, `${srcType}-${srcSha}.json`);
  if (!isWithinScope(manifestPath, manifestsDir)) {
    return 'source-missing';
  }
  try {
    const st = await fs.lstat(manifestPath);
    if (!st.isFile()) return 'source-missing';
  } catch {
    return 'source-missing';
  }

  // Resolve manifesto
  let manifestRaw: string;
  try {
    manifestRaw = await fs.readFile(manifestPath, 'utf8');
  } catch {
    return 'source-missing'; // manifesto não existe/ilegível
  }

  let manifest: { artifactPath?: unknown };
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    return 'source-missing';
  }

  if (typeof manifest.artifactPath !== 'string' || manifest.artifactPath.length === 0) {
    return 'source-missing';
  }

  const artifactAbsPath = path.join(root, manifest.artifactPath);
  if (!isWithinScope(artifactAbsPath, root)) {
    return 'source-missing';
  }

  // Leaf-symlink guard (parity com verifyExcerpt — deferred-work.md:63)
  try {
    const st = await fs.lstat(artifactAbsPath);
    if (!st.isFile()) return 'source-missing';
  } catch {
    return 'source-missing';
  }

  let content: string;
  try {
    content = await fs.readFile(artifactAbsPath, 'utf8');
  } catch {
    return 'source-missing';
  }

  // F6 (review 2.5): canonicaliza line-endings (CRLF/CR → LF) antes do substring
  // match — AD-6 "bytes canônicos" como bytes normalizados; evita falso mismatch
  // quando artefato (CRLF, Windows) e excerpt (LF) divergem (degradação 🟢→🟡).
  const canon = (s: string) => s.replace(/\r\n?/g, '\n');
  return canon(content).includes(canon(entry.source.excerpt)) ? 'verified' : 'mismatch';
}

// ---- T2 (2.5): Contagem de órfãos estendida ----

/**
 * Lista manifestos órfãos em quarantine/ (AC3/2.5).
 * Cada manifesto quarentenado é `<sha>.json` junto a um `<sha>.reason.md`.
 * Retorna a lista de órfãos + count.
 */
async function listOrphans(root: string): Promise<{ count: number; entries: OrphanEntry[] }> {
  const quarantineDir = metaPath(root, QUARANTINE_DIR);
  let dirents: string[];
  try {
    dirents = await fs.readdir(quarantineDir);
  } catch {
    return { count: 0, entries: [] };
  }
  const orphanEntries: OrphanEntry[] = [];
  for (const f of dirents) {
    if (!f.endsWith('.json')) continue;
    const sha = f.slice(0, -5); // remove '.json'
    orphanEntries.push({
      sha256: sha,
      quarantinePath: path.join(QUARANTINE_DIR, f).split(path.sep).join('/'),
    });
  }
  return { count: orphanEntries.length, entries: orphanEntries };
}

// ---- API ----

/**
 * Gera o relatório de confiança CONSOLIDADO a partir do estado on-disk (2.5).
 *
 * Lê (sem reatribuir nada):
 *  - `.process-ai/confidence-ledger.jsonl` → scan completo (counts + entries + reverse-index).
 *  - `.process-ai/checkpoint.json` (via `checkpointRead`) → artefatos + estágio.
 *  - `.process-ai/quarantine/` → lista de órfãos.
 *  - `.process-ai/manifests/<type>-<sha>.json` → excerpt-status por entry (AC1).
 *
 * Nunca lança por estado ausente/vazio: run 1.5-only (ledger vazio, sem
 * especialistas) devolve contagens zeradas honestamente (NFR-1 / SM-C1).
 *
 * Assinatura preservada desde 1.5: `(root: string) => Promise<ConfidenceReport>`.
 *
 * @param root - Raiz da sessão (default = process.cwd()).
 * @returns ConfidenceReport determinístico (exceto `generatedAt`).
 */
export async function reportConfidence(root: string): Promise<ConfidenceReport> {
  const scan = await scanLedger(root);

  // Checkpoint: degrada honestamente se ilegível/corrompido (espelha scanLedger —
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

  const { count: orphans, entries: orphanList } = await listOrphans(root);

  // Build breakdown per artifactType (AC3)
  const breakdownMap = new Map<string, ArtifactBreakdown>();
  for (const entry of scan.entries) {
    const key = `${entry.artifactType}::${entry.artifactSha256}`;
    let b = breakdownMap.get(key);
    if (!b) {
      b = {
        artifactType: entry.artifactType,
        sha256: entry.artifactSha256,
        counts: { '🟢': 0, '🟡': 0, '🔴': 0 },
      };
      breakdownMap.set(key, b);
    }
    b.counts[entry.validated]++;
  }
  const breakdown = [...breakdownMap.values()];

  // Build itemsByLevel (AC3) — com excerpt-status (AC1)
  const itemsByLevel: ConfidenceReport['itemsByLevel'] = { '🟢': [], '🟡': [], '🔴': [] };

  for (const entry of scan.entries) {
    const excerptStatus = await computeExcerptStatus(entry, root);

    const item: ReportItem = {
      claimId: entry.claimId,
      statement: entry.statement ?? '',
      reasoning: entry.reasoning ?? '',
      level: entry.validated,
      degradationReason: entry.degradationReason,
      excerptStatus,
    };

    if (entry.source) {
      item.source = {
        artifactType: entry.source.artifactType,
        sha256: entry.source.sha256,
      };
    }

    itemsByLevel[entry.validated].push(item);
  }

  return {
    counts: scan.counts,
    totalClaims: scan.total,
    artifacts,
    orphans,
    orphanList,
    stage,
    generatedAt: new Date().toISOString(),
    breakdown,
    itemsByLevel,
    reverseIndex: scan.reverseIndex,
  };
}

// ---- T2 (2.5): Renderização markdown rica ----

/**
 * Renderiza o ConfidenceReport em markdown pt-BR canônico CONSOLIDADO (2.5).
 *
 * Estrutura (2.5):
 *  1. Título + contagens por nível
 *  2. Breakdown por artifactType (tabela)
 *  3. Lista rica de itens por nível 🟢🟡🔴 (claimId, statement, source,
 *     degradationReason, excerptStatus)
 *  4. Reverse-index (fonte → claims que citam — rastreabilidade bidirecional, AC2)
 *  5. Órfãos listados
 *  6. Notas de honestidade (zeros, gaps)
 *
 * Default markdown é CONTRATO DURO (SKILL.md:124-141 embute verbatim).
 * Estágio e campos são escapados para markdown inline (deferred-work.md:65).
 */
export function formatConfidenceReport(report: ConfidenceReport): string {
  const lines: string[] = [];

  // ---- Seção 1: Sumário ----
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
  lines.push(`**Estágio atual:** ${escapeMd(report.stage)}`);
  lines.push('');

  // ---- Seção 2: Breakdown por artifactType (AC3) ----
  if (report.breakdown.length > 0) {
    lines.push('### Breakdown por Artefato');
    lines.push('');
    lines.push('| Artefato (sha256) | Tipo | 🟢 | 🟡 | 🔴 |');
    lines.push('|---|---|---|---|---|');
    for (const b of report.breakdown) {
      const shortSha = b.sha256.slice(0, 8);
      lines.push(
        `| \`${escapeMd(shortSha)}…\` | ${escapeMd(b.artifactType)} | ${b.counts['🟢']} | ${b.counts['🟡']} | ${b.counts['🔴']} |`,
      );
    }
    lines.push('');
  }

  // ---- Seção 3: Lista rica por nível (AC3) ----
  for (const level of LEVELS) {
    const items = report.itemsByLevel[level];
    if (items.length === 0) continue;

    const label = level === '🟢' ? 'Confiança Alta (verificada)' :
                  level === '🟡' ? 'Confiança Média (inferida)' :
                  'Gaps Declarados';

    lines.push(`### ${level} ${label} (${items.length})`);
    lines.push('');

    for (const item of items) {
      lines.push(`- **${escapeMd(item.claimId)}** — ${escapeMd(item.statement)}`);
      if (item.reasoning) {
        lines.push(`  - *Fundamentação:* ${escapeMd(item.reasoning)}`);
      }
      if (item.source) {
        const srcRef = `\`${escapeMd(item.source.artifactType)}\` (\`${escapeMd(item.source.sha256.slice(0, 8))}…\`)`;
        lines.push(`  - *Fonte:* ${srcRef}`);
      }
      if (item.degradationReason) {
        lines.push(`  - *Degradação:* \`${escapeMd(item.degradationReason)}\``);
      }
      lines.push(`  - *Excerpt:* \`${item.excerptStatus}\``);
    }
    lines.push('');
  }

  // ---- Seção 4: Reverse-index (AC2) ----
  const revKeys = Object.keys(report.reverseIndex);
  if (revKeys.length > 0) {
    lines.push('### Rastreabilidade Bidirecional (Fonte → Claims)');
    lines.push('');
    for (const key of revKeys.sort()) {
      const claimIds = report.reverseIndex[key];
      const [artifactType, sha256] = key.split('::');
      lines.push(
        `- **${escapeMd(artifactType)}** (\`${escapeMd(sha256.slice(0, 8))}…\`): ${claimIds.map((c) => `\`${escapeMd(c)}\``).join(', ')}`,
      );
    }
    lines.push('');
  }

  // ---- Seção 5: Órfãos (AC3) ----
  if (report.orphanList.length > 0) {
    lines.push('### Manifestos Órfãos em Quarentena');
    lines.push('');
    for (const o of report.orphanList) {
      lines.push(`- \`${escapeMd(o.sha256.slice(0, 8))}…\` → \`${escapeMd(o.quarantinePath)}\``);
    }
    lines.push('');
  }

  // ---- Seção 6: Notas de honestidade ----
  if (report.counts['🔴'] > 0) {
    lines.push(
      `> ⚠️ Há ${report.counts['🔴']} gap(s) declarado(s) (🔴) — pontos do processo que ainda precisam de evidência.`,
    );
  }
  if (report.orphans > 0) {
    lines.push(
      `> ⚠️ Há ${report.orphans} manifesto(s) órfão(s) em quarentena (não referenciados pelo checkpoint).`,
    );
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
