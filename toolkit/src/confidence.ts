/**
 * toolkit/src/confidence.ts — CONFIANÇA MECÂNICA POR FONTE (AD-5, FR-14).
 *
 * Materializa o invariante AD-5: o toolkit atribui o nível de confiança 🟢🟡🔴
 * por regra mecânica. 🟢 exige fonte cuja referência RESOLVE a um artefato já
 * commitado (manifesto SHA-256 existe em .process-ai/manifests/). Sem fonte
 * verificável → 🟡 no máximo. Referências fantasmas/forward-refs → degradam a 🟡.
 *
 * 2.5 (FR-14 full, AD-5 "opcionalmente com checagem de trecho … degradam a 🟡"):
 * aprofunda a confiança 🟢 com verificação de EXCERPT (passo 4b) — se o claim
 * carrega `source.excerpt`, o toolkit LÊ o artefato-fonte (via manifesto →
 * artifactPath → fs.readFile) e casa o trecho como SUBSTRING dos bytes canônicos
 * (AD-6: content opaco). Trecho presente + casa → 🟢; trecho presente + NÃO casa
 * → degrada a 🟡 (`excerpt-mismatch`). Trecho ausente → sem checagem (🟢 mantém,
 * contanto que a fonte resolva — comportamento 1.4 preservado). Também persiste
 * `statement`+`reasoning` no ledger (AC4 — fecha deferral 2.3).
 *
 * O agente PROPÕE nível + fonte; o toolkit VALIDA e grava no ledger de confiança
 * (.process-ai/confidence-ledger.jsonl, append-only JSONL).
 *
 * INVARIANTE AD-3 (núcleo hexagonal): este arquivo só importa `node:*` builtins
 * ou caminhos relativos dentro do core — nunca um package npm. O teste
 * tests/import-boundary.test.ts cobre `confidence.ts` automaticamente.
 *
 * DEFENSE-IN-DEPTH (code review 1.4, P1): os campos agent-supplied
 * `source.artifactType` + `source.sha256` fluem para um path de manifesto. São
 * validados (hex64 + kebab) e o path resolvido é checado contra o escopo
 * `.process-ai/manifests/` — espelhando `sanitizeArtifactType`/`assertWithinScope`
 * do commit.ts. `manifestExists` usa `lstat`+`isFile()` (rejeita symlink e dir).
 * O passo 4b (excerpt) lê conteúdo do artefato-fonte: o manifesto é append-only/
 * imutável (FR-20/AD-4), o `artifactPath` é checado contra o escopo do root e o
 * leaf do artefato passa por `lstat`+`isFile()` (parity com `manifestExists` —
 * deferred-work.md:63). Nunca lança fora do path de erro (trecho não-verificável
 * → degrada honestamente a 🟡).
 *
 * Fronteiras (NÃO faça aqui — pertence a outra story):
 *  - rastreabilidade bidirecional (navegar afirmação↔fonte) → Story 2.5 (report.ts).
 *  - relatório de confiança consolidado (contagem+lista) → Story 2.5 (report.ts).
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
  /** Tipo do artefato-fonte (ex.: "sipoc", "hierarchy"). Validado como kebab-case. */
  artifactType: string;
  /**
   * SHA-256 (hex64 lowercase) do artefato-fonte (resolve a manifesto existente).
   * Validado contra `/^[0-9a-f]{64}$/` — fecha path traversal/injection no path do manifesto.
   */
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

/**
 * Resultado da validação de um claim (T2). Sem claimId — atribuído após sha256.
 * `degradationReason` ∈ { 'missing-source', 'malformed-source', 'unresolved-source',
 * 'excerpt-mismatch' } (2.5: trecho presente + não-casa → 🟡 excerpt-mismatch).
 */
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
  /**
   * Texto da afirmação (AC4/2.5). Opcional no tipo persistido p/ backward-compat
   * (ledgers legados da 1.4 não o carregam — leitores defensivos `?? ''`); o
   * ESCRITOR sempre preenche a partir do `Claim`. Decision #3.
   */
  statement?: string;
  /**
   * Justificativa do agente (AC4/2.5). Opcional no tipo persistido pelo mesmo
   * motivo que `statement`; o ESCRITOR sempre preenche. Decision #3.
   */
  reasoning?: string;
}

// ---- Constantes ----

const META_DIR = '.process-ai';
const MANIFESTS_SUBDIR = 'manifests';
const CONFIDENCE_LEDGER_FILE = 'confidence-ledger.jsonl';

/** SHA-256 canônico: 64 hex lowercase. */
const HEX64 = /^[0-9a-f]{64}$/;
/** artifactType canônico: kebab-case restrito (espelha sanitizeArtifactType do commit.ts). */
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---- Erro acionável ----

export class ConfidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfidenceError';
  }
}

// ---- Helpers de validação (P1 — espelham commit.ts, sem import circular) ----

function isNonEmptyString(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function isHex64(s: unknown): boolean {
  return typeof s === 'string' && HEX64.test(s);
}

function isKebab(s: unknown): boolean {
  return typeof s === 'string' && KEBAB.test(s);
}

/**
 * Containment check (espelha assertWithinScope do commit.ts) — defense-in-depth.
 * Pura — zero IO. O formato hex64+kebab já garante containment; esta asserção
 * protege contra mudanças futuras na construção do path.
 */
function isWithinScope(absPath: string, scopeDir: string): boolean {
  let scope = path.resolve(scopeDir);
  let abs = path.resolve(absPath);
  // Normaliza case no Windows (FS case-insensitive falsearia o containment).
  if (process.platform === 'win32') {
    scope = scope.toLowerCase();
    abs = abs.toLowerCase();
  }
  return abs === scope || abs.startsWith(scope + path.sep);
}

// ---- T2: Validação de confiança ----

/**
 * Valida claims mecanicamente contra as regras AD-5.
 *
 * Regras (ordem de precedência):
 *  0. Claims deve ser array de objetos Claim (P5) — senão ConfidenceError.
 *  1. Nível inválido (fora de {🟢,🟡,🔴}) → lança ConfidenceError (aborta commit).
 *  2. 🟢 + source ausente ou sha256 ausente/vazio/whitespace/não-string → 🟡 (missing-source).
 *  3. 🟢 + sha256 presente mas fora do formato hex64, OU artifactType fora do kebab
 *     → 🟡 (malformed-source). Fecha path traversal/injection no path do manifesto.
 *  4. 🟢 + source bem-formado → verifica manifesto via `lstat`+`isFile()`
 *     (rejeita symlink e diretório). Não existe → 🟡 (unresolved-source).
 * 4b. (2.5, AD-5 excerpt) 🟢 cuja fonte resolveu E carrega `source.excerpt` (string
 *     não-vazia) → lê o artefato-fonte (manifesto → artifactPath → fs.readFile) e
 *     casa o trecho como SUBSTRING dos bytes canônicos (AD-6: content opaco). Casa
 *     → 🟢. NÃO casa (ou artefato ilegível/não-verificável) → 🟡 (excerpt-mismatch).
 *     Trecho ausente → sem checagem (🟢 mantém — comportamento 1.4 preservado).
 *  5. 🟡 → mantido (inferido, sem exigência de fonte).
 *  6. 🔴 → mantido (gap, não exige fonte).
 *
 * `statement` e `reasoning` NÃO são validados (responsabilidade da skill layer);
 * apenas persistidos no ledger (AC4/2.5).
 * Degradação (passos 2/3/4/4b) NÃO aborta o commit — só nível inválido aborta (AC4).
 * O passo 4b só corre DEPOIS da fonte resolver (passo 4); a mecânica de
 * source-resolution existente permanece intacta e na mesma precedência.
 *
 * @param claims - Claims propostos pelo agente.
 * @param root - Raiz da sessão (para resolver paths de manifesto e artefato-fonte).
 * @returns ValidatedClaim[] com os níveis validados (possivelmente degradados).
 */
export async function validateClaims(
  claims: Claim[],
  root: string,
): Promise<ValidatedClaim[]> {
  // P5 — guard de entrada: claims deve ser array.
  if (!Array.isArray(claims)) {
    throw new ConfidenceError(`Claims inválidos: esperado array, recebeu ${typeof claims}.`);
  }

  const results: ValidatedClaim[] = [];

  for (const claim of claims) {
    // P5 — guard por-elemento: cada claim deve ser objeto Claim.
    if (claim == null || typeof claim !== 'object' || Array.isArray(claim)) {
      throw new ConfidenceError(
        `Claim inválido: esperado objeto Claim, recebeu ${Array.isArray(claim) ? 'array' : typeof claim}.`,
      );
    }

    // Regra 1: nível inválido → aborta
    if (!claim.level || !VALID_CONFIDENCE_LEVELS.has(claim.level)) {
      const stmt = typeof claim.statement === 'string' ? claim.statement : '(statement ausente)';
      throw new ConfidenceError(
        `Claim com nível inválido: "${claim.level}". ` +
        `Esperado um de: ${[...VALID_CONFIDENCE_LEVELS].join(', ')}. ` +
        `Claim statement: "${stmt.slice(0, 80)}${stmt.length > 80 ? '…' : ''}"`,
      );
    }

    if (claim.level === '🟢') {
      const src = claim.source;
      // Regra 2: 🟢 exige source com sha256 NÃO-VAZIO (missing-source).
      if (!src || !isNonEmptyString(src.sha256)) {
        results.push({ proposed: '🟢', validated: '🟡', degradationReason: 'missing-source' });
        continue;
      }
      // Regra 3 (P1): sha256 hex64 + artifactType kebab — fecha traversal/injection.
      if (!isHex64(src.sha256) || !isKebab(src.artifactType)) {
        results.push({ proposed: '🟢', validated: '🟡', degradationReason: 'malformed-source' });
        continue;
      }
      // Regra 4: source bem-formado → resolve manifesto.
      const manifestsDir = path.join(root, META_DIR, MANIFESTS_SUBDIR);
      const sourceManifestPath = path.join(manifestsDir, `${src.artifactType}-${src.sha256}.json`);
      // P1 defense-in-depth: asserção de containment (formato já garante; belt-and-suspenders).
      if (!isWithinScope(sourceManifestPath, manifestsDir)) {
        results.push({ proposed: '🟢', validated: '🟡', degradationReason: 'malformed-source' });
        continue;
      }
      const sourceResolved = await manifestExists(sourceManifestPath);
      if (!sourceResolved) {
        results.push({ proposed: '🟢', validated: '🟡', degradationReason: 'unresolved-source' });
        continue;
      }
      // Passo 4b (2.5, AD-5 excerpt): só corre DEPOIS da fonte resolver (passo 4).
      // Trecho presente → casa contra bytes canônicos do artefato-fonte; NÃO casa
      // (ou não-verificável) → degrada a 🟡 (excerpt-mismatch). Trecho ausente → 🟢.
      if (isNonEmptyString(src.excerpt)) {
        const excerptMatches = await verifyExcerpt(root, sourceManifestPath, src.excerpt);
        if (!excerptMatches) {
          results.push({ proposed: '🟢', validated: '🟡', degradationReason: 'excerpt-mismatch' });
          continue;
        }
      }
      results.push({ proposed: '🟢', validated: '🟢' });
    } else if (claim.level === '🟡') {
      // Regra 5: 🟡 mantido
      results.push({ proposed: '🟡', validated: '🟡' });
    } else {
      // Regra 6: 🔴 mantido
      results.push({ proposed: '🔴', validated: '🔴' });
    }
  }

  return results;
}

/**
 * Verifica se um manifesto (arquivo regular) existe no filesystem.
 * Puramente mecânico: `lstat`+`isFile()` — NÃO segue symlink (lstat), rejeita
 * diretório, sem leitura de conteúdo, sem comparação semântica. (P1)
 */
async function manifestExists(manifestPath: string): Promise<boolean> {
  try {
    const st = await fs.lstat(manifestPath);
    return st.isFile();
  } catch {
    return false;
  }
}

/**
 * Passo 4b (2.5 — AD-5 excerpt): verifica se `excerpt` é SUBSTRING dos bytes
 * canônicos do artefato-fonte (AD-6: content opaco — match sobre bytes, sem parse
 * semântico). Lê o manifesto (cuja existência o passo 4 já confirmou) para achar
 * o `artifactPath`, resolve-o contra o root, aplica leaf-symlink guard (`lstat`+
 * `isFile()`, parity com `manifestExists` — deferred-work.md:63) e lê o conteúdo.
 *
 * NUNCA lança (resiliência): manifesto sumiu/ilegível, `artifactPath` ausente/
 * fora-de-escopo, artefato ilegível/symlink/dir → retorna `false` (trecho não-
 * verificável). O caller (passo 4b) decide a degradação a 🟡 `excerpt-mismatch`;
 * este helper só reporta "casa / não-casa / não-verificável". O `excerpt` recebido
 * é garantidamente string não-vazia pelo caller.
 *
 * Segurança do conteúdo-read (Decision #1): o artefato-fonte é sempre já-commitado,
 * imutável e on-disk (manifestos append-only — FR-20/AD-4); a validação roda ANTES
 * do lock/WAL/write (abort-before-write, `commit.ts:418-444`), lendo estado prévio
 * — sem corrida com o write-deste-commit.
 *
 * @param root - Raiz da sessão (para resolver o artifactPath do manifesto).
 * @param manifestPath - Path absoluto do manifesto-fonte (já confirmado existente).
 * @param excerpt - Trecho citado (string não-vazia).
 * @returns true se o trecho é substring do conteúdo do artefato-fonte; false caso contrário.
 */
async function verifyExcerpt(root: string, manifestPath: string, excerpt: string): Promise<boolean> {
  // Lê o manifesto para achar o artifactPath (path relativo ao root, escrito pelo commit.ts).
  let manifestRaw: string;
  try {
    manifestRaw = await fs.readFile(manifestPath, 'utf8');
  } catch {
    return false; // manifesto sumiu entre o passo 4 e aqui → não-verificável.
  }
  let manifest: { artifactPath?: unknown };
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    return false; // manifesto corrompido → não-verificável.
  }
  if (typeof manifest.artifactPath !== 'string' || manifest.artifactPath.length === 0) {
    return false;
  }
  const artifactAbsPath = path.join(root, manifest.artifactPath);
  // Defense-in-depth (cinturão-e-suspensórios): o artifactPath vem do manifesto
  // (toolkit-written, append-only), mas um manifesto editado poderia escapar do root.
  if (!isWithinScope(artifactAbsPath, root)) {
    return false;
  }
  // Leaf-symlink guard (parity com manifestExists / deferred-work.md:63): só lê
  // arquivo regular — rejeita symlink e diretório (não-verificável, não lança).
  try {
    const st = await fs.lstat(artifactAbsPath);
    if (!st.isFile()) return false;
  } catch {
    return false;
  }
  let content: string;
  try {
    content = await fs.readFile(artifactAbsPath, 'utf8');
  } catch {
    return false;
  }
  // F6 (review 2.5): canonicaliza line-endings (CRLF/CR → LF) antes do substring
  // match — AD-6 "bytes canônicos" interpretado como bytes normalizados; evita falso
  // excerpt-mismatch quando artefato (CRLF, Windows) e excerpt (LF) divergem.
  const canon = (s: string) => s.replace(/\r\n?/g, '\n');
  return canon(content).includes(canon(excerpt));
}

// ---- T3: Ledger de confiança ----

/**
 * Faz append/upsert de entradas no ledger de confiança (.process-ai/confidence-ledger.jsonl).
 *
 * Idempotência + update (AC5 + P6): antes de escrever, lê o ledger existente e
 * indexa por `(claimId, artifactSha256)`. Para cada entrada nova:
 *  - chave inexistente → append (nova linha).
 *  - chave existente com MESMO nível validado/degradationReason → idempotente
 *    (mantém a linha, byte-estável).
 *  - chave existente com nível/degradationReason MUDADOS → substitui a linha
 *    (reflete a realidade corrente quando a base de source mudou entre commits).
 *
 * O `validatedAt` (timestamp) NÃO participa da chave nem dispara update.
 *
 * Atomicidade (P3): temp + rename com cleanup em falha (espelha atomicWriteFile).
 * Defense-in-depth (P2): leaf-symlink check antes do read/rewrite (espelha
 * appendProvenance) — recusa operar sobre symlink que escaparia do escopo.
 *
 * @param root - Raiz da sessão.
 * @param entries - Entradas a adicionar/atualizar no ledger.
 */
export async function appendConfidenceLedger(
  root: string,
  entries: ConfidenceLedgerEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  const ledgerPath = path.join(root, META_DIR, CONFIDENCE_LEDGER_FILE);
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });

  // P2 — leaf-symlink check (espelha appendProvenance P1 da 1.2).
  await assertNotSymlinkLeaf(ledgerPath);

  // Lê linhas existentes (preserva corruptas no output; só indexa as parseáveis).
  let lines: string[] = [];
  try {
    const raw = await fs.readFile(ledgerPath, 'utf8');
    lines = raw.split('\n').filter((l) => l.length > 0);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    // ENOENT = ledger novo — lines vazio.
  }

  // Índice: chave (claimId::artifactSha256) → posição em `lines`.
  const keyToIndex = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    try {
      const obj = JSON.parse(lines[i]) as { claimId?: string; artifactSha256?: string };
      if (obj.claimId && obj.artifactSha256) {
        keyToIndex.set(ledgerDedupeKey(obj.claimId, obj.artifactSha256), i);
      }
    } catch {
      // linha corrompida — preserva no output, não indexa.
    }
  }

  // P6 — dedupe + update-on-change.
  for (const entry of entries) {
    const key = ledgerDedupeKey(entry.claimId, entry.artifactSha256);
    const idx = keyToIndex.get(key);
    if (idx === undefined) {
      lines.push(JSON.stringify(entry));
      keyToIndex.set(key, lines.length - 1);
    } else {
      // chave existe — só reescreve se o nível/degradation mudaram (senão idempotente).
      let replace = true;
      try {
        const existing = JSON.parse(lines[idx]) as ConfidenceLedgerEntry;
        replace =
          existing.validated !== entry.validated ||
          existing.degradationReason !== entry.degradationReason;
      } catch {
        // linha existente corrompida — substitui pela nova (recupera a entrada).
      }
      if (replace) lines[idx] = JSON.stringify(entry);
    }
  }

  // P3 — escrita atômica com cleanup (espelha atomicWriteFile do commit.ts).
  await atomicWriteLedger(ledgerPath, lines.join('\n') + '\n');
}

/** Chave de dedupe do ledger: `claimId::artifactSha256`. */
function ledgerDedupeKey(claimId: string, artifactSha256: string): string {
  return `${claimId}::${artifactSha256}`;
}

let _ledgerTempCounter = 0;

/**
 * Escrita atômica (temp + rename no mesmo diretório) com cleanup em falha —
 * espelha `atomicWriteFile` (commit.ts). Usa contador monótono (não `Date.now()`)
 * para evitar colisão de mesmo-ms.
 */
async function atomicWriteLedger(filePath: string, data: string): Promise<void> {
  const tmp = `${filePath}.tmp-${process.pid}-${_ledgerTempCounter++}`;
  try {
    await fs.writeFile(tmp, data, 'utf8');
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
  try {
    await fs.rename(tmp, filePath);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

/**
 * Defense-in-depth (espelha appendProvenance P1 da 1.2): recusa operar sobre
 * symlink leaf — senão readFile seguiria o link (info disclosure) e o rename
 * substituiria o link. ENOENT (arquivo novo) é ignorado.
 */
async function assertNotSymlinkLeaf(filePath: string): Promise<void> {
  try {
    const st = await fs.lstat(filePath);
    if (st.isSymbolicLink()) {
      throw new ConfidenceError(
        `Recusa escrever ${path.basename(filePath)}: o destino é um symlink e escaparia do escopo .process-ai/: ${filePath}`,
      );
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    // ENOENT = arquivo novo — prossegue normalmente.
  }
}

/**
 * Constrói ConfidenceLedgerEntry[] a partir dos claims originais + resultados da
 * validação + artifactSha256 (calculado pós-canonicalize).
 *
 * O claimId é atribuído deterministicamente: `{artifactType}-{artifactSha256}-{index}`.
 * Isso garante idempotência (AC5): mesmo payload → mesmo sha256 → mesmos claimIds.
 *
 * AC4/2.5: copia `statement`+`reasoning` do Claim para a entry (hoje o escritor
 * sempre preenche; leitores defensivos toleram entries legadas sem esses campos).
 * Função PURA — sem IO (só mapeia). Ordem de chaves preservada.
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
      statement: claim.statement,
      reasoning: claim.reasoning,
    };
  });
}
