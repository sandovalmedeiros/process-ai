/**
 * toolkit/src/confidence.ts — CONFIANÇA MECÂNICA POR FONTE (AD-5, FR-14).
 *
 * Materializa o invariante AD-5: o toolkit atribui o nível de confiança 🟢🟡🔴
 * por regra mecânica. 🟢 exige fonte cuja referência RESOLVE a um artefato já
 * commitado (manifesto SHA-256 existe em .process-ai/manifests/). Sem fonte
 * verificável → 🟡 no máximo. Referências fantasmas/forward-refs → degradam a 🟡.
 *
 * O agente PROPÕE nível + fonte; o toolkit VALIDA e grava no ledger de confiança
 * (.process-ai/confidence-ledger.jsonl, append-only JSONL).
 *
 * INVARIANTE AD-3 (núcleo hexagonal): este arquivo só importa `node:*` builtins
 * ou caminhos relativos dentro do core — nunca um package npm.
 *
 * Fronteiras (NÃO faça aqui — pertence a outra story):
 *  - verificação de trecho (excerpt match) → Story 2.5.
 *  - rastreabilidade bidirecional (navegar afirmação↔fonte) → Story 2.5.
 *  - relatório de confiança consolidado (contagem+lista) → Story 2.5.
 *  - conteúdo real dos claims (agentes proporem claims) → Story 1.5/1.6.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

// ---- Tipos (T1) ----

/** Níveis canônicos de confiança (AD-5, Glossário "Marcador de confiança"). */
export type ConfidenceLevel = '🟢' | '🟡' | '🔴';

/** Conjunto válido para validação de nível. */
export const VALID_CONFIDENCE_LEVELS: ReadonlySet<string> = new Set(['🟢', '🟡', '🔴']);

/** Fonte de um claim — referência a artefato commitado com SHA-256. */
export interface ClaimSource {
  /** Tipo do artefato-fonte (ex.: "sipoc", "hierarchy"). */
  artifactType: string;
  /** SHA-256 do artefato-fonte (resolve a manifesto existente). */
  sha256: string;
  /** Trecho citado da fonte (opcional — aceito, ignorado na validação em 1.4). */
  excerpt?: string;
}

/**
 * Claim proposto pelo agente.
 * `claimId` é opcional — o agente PODE propor um ID, mas o toolkit SUBSTITUI
 * pelo formato determinístico `{artifactType}-{sha256}-{index}` após o hash.
 */
export interface Claim {
  /** ID proposto pelo agente (opcional — toolkit substitui no commit). */
  claimId?: string;
  /** Texto da afirmação. */
  statement: string;
  /** Nível de confiança proposto pelo agente. */
  level: ConfidenceLevel;
  /** Fonte da afirmação (obrigatória para 🟢). */
  source?: ClaimSource;
  /** Justificativa do agente para o nível proposto. */
  reasoning: string;
}

/** Resultado da validação de um claim (T2). Sem claimId — atribuído após sha256. */
export interface ValidatedClaim {
  /** Nível proposto pelo agente. */
  proposed: ConfidenceLevel;
  /** Nível após validação do toolkit. */
  validated: ConfidenceLevel;
  /** Motivo da degradação (se validated < proposed). */
  degradationReason?: string;
}

/** Entrada no ledger de confiança (append-only JSONL). */
export interface ConfidenceLedgerEntry {
  /** ID determinístico do claim: `{artifactType}-{artifactSha256}-{index}`. */
  claimId: string;
  /** Tipo do artefato que contém o claim. */
  artifactType: string;
  /** SHA-256 do artefato que contém o claim. */
  artifactSha256: string;
  /** Nível proposto pelo agente. */
  proposed: ConfidenceLevel;
  /** Nível após validação do toolkit. */
  validated: ConfidenceLevel;
  /** Fonte referenciada (se houver). */
  source?: ClaimSource;
  /** Timestamp da validação (ISO-8601, metadado de observabilidade). */
  validatedAt: string;
  /** Motivo da degradação (se validated < proposed). */
  degradationReason?: string;
}

// ---- Constantes ----

const META_DIR = '.process-ai';
const MANIFESTS_SUBDIR = 'manifests';
const CONFIDENCE_LEDGER_FILE = 'confidence-ledger.jsonl';

// ---- Erro acionável ----

export class ConfidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfidenceError';
  }
}

// ---- T2: Validação de confiança ----

/**
 * Valida claims mecanicamente contra as regras AD-5.
 *
 * Regras (ordem de precedência):
 *  1. Nível inválido (fora de {🟢,🟡,🔴}) → lança ConfidenceError (aborta commit).
 *  2. 🟢 + source ausente ou sha256 vazio → degrada a 🟡 (missing-source).
 *  3. 🟢 + source com sha256 → verifica existência do manifesto em
 *     `.process-ai/manifests/<artifactType>-<sha256>.json`.
 *     Existe → 🟢 mantido. Não existe → degrada a 🟡 (unresolved-source).
 *  4. 🟡 → mantido (inferido, sem exigência de fonte).
 *  5. 🔴 → mantido (gap, não exige fonte).
 *
 * `source.excerpt` é IGNORADO na validação (verificação de trecho → Story 2.5).
 * `statement` e `reasoning` NÃO são validados (responsabilidade da skill layer).
 *
 * @param claims - Claims propostos pelo agente.
 * @param root - Raiz da sessão (para resolver paths de manifesto).
 * @returns ValidatedClaim[] com os níveis validados (possivelmente degradados).
 */
export async function validateClaims(
  claims: Claim[],
  root: string,
): Promise<ValidatedClaim[]> {
  const results: ValidatedClaim[] = [];

  for (const claim of claims) {
    // Regra 1: nível inválido → aborta
    if (!claim.level || !VALID_CONFIDENCE_LEVELS.has(claim.level)) {
      throw new ConfidenceError(
        `Claim com nível inválido: "${claim.level}". ` +
        `Esperado um de: ${[...VALID_CONFIDENCE_LEVELS].join(', ')}. ` +
        `Claim statement: "${claim.statement.slice(0, 80)}${claim.statement.length > 80 ? '…' : ''}"`,
      );
    }

    if (claim.level === '🟢') {
      // Regra 2: 🟢 exige source com sha256
      if (!claim.source || !claim.source.sha256 || claim.source.sha256.length === 0) {
        results.push({
          proposed: '🟢',
          validated: '🟡',
          degradationReason: 'missing-source',
        });
        continue;
      }

      // Regra 3: verifica existência do manifesto da fonte
      const sourceManifestPath = path.join(
        root,
        META_DIR,
        MANIFESTS_SUBDIR,
        `${claim.source.artifactType}-${claim.source.sha256}.json`,
      );

      const sourceResolved = await manifestExists(sourceManifestPath);

      if (sourceResolved) {
        results.push({
          proposed: '🟢',
          validated: '🟢',
        });
      } else {
        results.push({
          proposed: '🟢',
          validated: '🟡',
          degradationReason: 'unresolved-source',
        });
      }
    } else if (claim.level === '🟡') {
      // Regra 4: 🟡 mantido
      results.push({
        proposed: '🟡',
        validated: '🟡',
      });
    } else {
      // Regra 5: 🔴 mantido
      results.push({
        proposed: '🔴',
        validated: '🔴',
      });
    }
  }

  return results;
}

/**
 * Verifica se um manifesto existe no filesystem.
 * Puramente mecânico: fs.access — sem leitura de conteúdo, sem comparação semântica.
 */
async function manifestExists(manifestPath: string): Promise<boolean> {
  try {
    await fs.access(manifestPath);
    return true;
  } catch {
    return false;
  }
}

// ---- T3: Ledger de confiança ----

/**
 * Faz append de entradas no ledger de confiança (.process-ai/confidence-ledger.jsonl).
 *
 * Idempotência (AC5): antes do append, lê o ledger existente e constrói um Set
 * das chaves `(claimId, artifactSha256)` já presentes. Entradas duplicadas são
 * puladas. O `validatedAt` (timestamp) NÃO participa da chave de dedupe.
 *
 * Atomicidade: lê o arquivo existente, concatena novas linhas, escreve via
 * temp + rename (padrão 1.2/1.3). Append puro em single-writer.
 *
 * @param root - Raiz da sessão.
 * @param entries - Entradas a adicionar ao ledger.
 */
export async function appendConfidenceLedger(
  root: string,
  entries: ConfidenceLedgerEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  const ledgerPath = path.join(root, META_DIR, CONFIDENCE_LEDGER_FILE);
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });

  // Constrói Set de chaves existentes para dedupe
  const existingKeys = new Set<string>();
  try {
    const raw = await fs.readFile(ledgerPath, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try {
        const obj = JSON.parse(line) as { claimId?: string; artifactSha256?: string };
        if (obj.claimId && obj.artifactSha256) {
          existingKeys.add(ledgerDedupeKey(obj.claimId, obj.artifactSha256));
        }
      } catch {
        // linha corrompida — ignora
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    // ENOENT = ledger novo — prossegue
  }

  // Filtra duplicatas
  const newLines: string[] = [];
  for (const entry of entries) {
    const key = ledgerDedupeKey(entry.claimId, entry.artifactSha256);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    newLines.push(JSON.stringify(entry));
  }

  if (newLines.length === 0) return; // tudo deduplicado

  // Append atômico: lê existente + concatena + temp+rename
  let existingContent = '';
  try {
    existingContent = await fs.readFile(ledgerPath, 'utf8');
    if (existingContent.length > 0 && !existingContent.endsWith('\n')) {
      existingContent += '\n';
    }
  } catch {
    // arquivo novo
  }

  const tmp = `${ledgerPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, existingContent + newLines.join('\n') + '\n', 'utf8');
  await fs.rename(tmp, ledgerPath);
}

/** Chave de dedupe do ledger: `claimId::artifactSha256`. */
function ledgerDedupeKey(claimId: string, artifactSha256: string): string {
  return `${claimId}::${artifactSha256}`;
}

/**
 * Constrói ConfidenceLedgerEntry[] a partir dos claims originais + resultados da
 * validação + artifactSha256 (calculado pós-canonicalize).
 *
 * O claimId é atribuído deterministicamente: `{artifactType}-{artifactSha256}-{index}`.
 * Isso garante idempotência (AC5): mesmo payload → mesmo sha256 → mesmos claimIds.
 */
export function buildLedgerEntries(
  claims: Claim[],
  validated: ValidatedClaim[],
  artifactType: string,
  artifactSha256: string,
): ConfidenceLedgerEntry[] {
  const now = new Date().toISOString();
  return claims.map((claim, i) => {
    const v = validated[i];
    return {
      claimId: `${artifactType}-${artifactSha256}-${i}`,
      artifactType,
      artifactSha256,
      proposed: v.proposed,
      validated: v.validated,
      source: claim.source,
      validatedAt: now,
      degradationReason: v.degradationReason,
    };
  });
}
