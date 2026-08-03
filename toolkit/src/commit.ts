/**
 * toolkit/src/commit.ts — O ÚNICO ESCRITOR (AD-1, FR-20).
 *
 * Materializa o paradigma propose/commit NÃO-DESTRUTIVO: agentes propõem um
 * payload; o toolkit commita o artefato com manifesto SHA-256 + provenance,
 * escrevendo SOMENTE nas pastas protegidas `_process-ai_output/` (artefatos) e
 * `.process-ai/` (manifestos + provenance). Nenhum outro arquivo é tocado.
 *
 * INVARIANTE AD-3 (núcleo hexagonal): este arquivo só importa `node:*` builtins
 * ou caminhos relativos dentro do core — nunca um package npm. O teste
 * tests/import-boundary.test.ts cobre `commit.ts` automaticamente.
 *
 * Fronteiras (NÃO faça aqui — pertence a outra story):
 *  - checkpoint/WAL/transação atômica commit+checkpoint + quarentena de órfão
 *    → Story 1.3 (AD-4). Aqui há apenas atomicidade POR-ARQUIVO (temp+rename).
 *  - atribuição mecânica 🟢🟡🔴 por fonte + ledger de confiança → Story 1.4 (AD-5).
 *  - schema-núcleo por artifactType → Story 3.1 (AD-2). Aqui `content` é opaco.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CommitResult, ProposePayload } from './engine-adapter.ts';
import { acquireLock, checkpointAdvance, checkpointRead, releaseLock } from './checkpoint.ts';
import type { CheckpointState, WalIntent } from './checkpoint.ts';
import {
  validateClaims,
  buildLedgerEntries,
  appendConfidenceLedger,
  ConfidenceError,
} from './confidence.ts';
import type { ValidatedClaim } from './confidence.ts';
import { validateContent } from './schema-core.ts';
import { readConfig, loadPack, PackError } from './pack-loader.ts';

// ---- Windows reserved names (P10 — code review patch) ----

/** Nomes reservados do Windows que passariam na allowlist kebab mas falham com erro raw do FS. */
const WIN_RESERVED = new Set([
  'con', 'nul', 'aux', 'prn',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

/** Cache de dedupe de provenance em memória (P4 — evita O(n²) de reler o arquivo a cada commit). */
const _provenanceCache = new Map<string, Set<string>>();

// ---- Pastas protegidas (as ÚNICAS que o toolkit escreve) ----

/** Pasta de artefatos (output do processo). */
const OUTPUT_DIR = '_process-ai_output';
/** Pasta de metadados (manifestos + provenance). */
const META_DIR = '.process-ai';
/** Subpasta de manifestos dentro de META_DIR (content-addressed). */
const MANIFESTS_SUBDIR = 'manifests';
/** Arquivo de provenance (append-only JSONL) dentro de META_DIR. */
const PROVENANCE_FILE = 'provenance.jsonl';

/**
 * Extensão por artifactType (default `.md`). Mapeamento por tipo amadurece em
 * 3.1 (AD-2 — schema-núcleo); em 1.2 o `content` é opaco e o default basta.
 */
const EXT_BY_TYPE: Record<string, string> = {};

// ---- Erro acionável (errno-agnostic — aprendizado 1.1: traduzir, não relançar cru) ----

/** Erro de validação/escopo do commit — sempre acionável, com contexto. */
export class CommitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommitError';
  }
}

// ---- T1: serialização canônica + SHA-256 (determinístico) ----

/**
 * Serialização canônica determinística de `content` (AC5).
 *
 * Regra (registrada na Completion Notes):
 *  - string  → a própria string (forma canônica; hash sobre seus bytes UTF-8).
 *  - objeto  → JSON com chaves recursivamente ordenadas (sort asc); arrays
 *              preservam a ordem; `undefined`→`null`; números não-finitos→`null`;
 *              bigint/symbol/function → `JSON.stringify(String(v))` (fallback).
 *
 * O mesmo `content` lógico sempre produz a mesma string canônica — sem depender
 * da ordem de inserção de chaves (instável entre runtimes/JSON). Os bytes UTF-8
 * desta string são hashados (sha256) E escritos como artefato — assim o sha do
 * manifesto bate com o sha do artefato (AC2).
 */
export function canonicalize(content: unknown): string {
  if (typeof content === 'string') return content;
  return stableStringify(content);
}

function stableStringify(value: unknown, visited: WeakSet<object> = new WeakSet()): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    if (visited.has(value)) {
      throw new CommitError('Conteúdo circular detectado (array auto-referenciado) — serialize apenas objetos JSON-plain.');
    }
    visited.add(value);
    return '[' + value.map((v) => stableStringify(v, visited)).join(',') + ']';
  }
  if (typeof value === 'object') {
    if (visited.has(value as object)) {
      throw new CommitError('Conteúdo circular detectado (objeto auto-referenciado) — serialize apenas objetos JSON-plain.');
    }
    visited.add(value as object);
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k], visited)).join(',') + '}';
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(String(value)); // bigint/symbol/function — fallback estável
}

/** SHA-256 (hex) sobre os bytes UTF-8 da string canônica. Zero deps (node:crypto). */
export function sha256(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

// ---- T2: paths + escopo + sanitização do artifactType (AC1, AC3) ----

/** Resolve a raiz da sessão (default = cwd onde a sessão roda = projeto-alvo). */
async function resolveRoot(root?: string): Promise<string> {
  const resolved = path.resolve(root ?? process.cwd());
  // P7: valida que root é um diretório (evita ENOTDIR opaco downstream)
  const st = await fs.stat(resolved);
  if (!st.isDirectory()) {
    throw new CommitError(`Root não é um diretório: ${resolved}. O commit requer um diretório como raiz da sessão.`);
  }
  return resolved;
}

/**
 * Sanitiza `artifactType` para kebab-case restrito (AC3 — previne path traversal).
 * Normaliza para minúsculas e EXIGE o padrão `^[a-z0-9]+(-[a-z0-9]+)*$` (segmentos
 * alfanuméricos separados por um hífen). Rejeita `..`, `/`, `\`, `:` e qualquer
 * caractere fora da allowlist — ANTES de o valor tocar qualquer path.
 */
export function sanitizeArtifactType(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new CommitError(
      `artifactType inválido: esperado string kebab-case não-vazia (recebeu ${describe(raw)}).`,
    );
  }
  const normalized = raw.toLowerCase();
  // Rejeita path traversal e separadores de path/drive ANTES do casamento de allowlist.
  if (/(^|\/)\.\.(\/|$)|[/\\:]/.test(normalized)) {
    throw new CommitError(`artifactType rejeitado (traversal/separador proibido): "${raw}".`);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(normalized)) {
    throw new CommitError(
      `artifactType rejeitado (não casa com kebab-case restrito [a-z0-9-]): "${raw}".`,
    );
  }
  // P10: rejeita nomes reservados do Windows que passam na allowlist kebab mas
  // falham com erro raw do FS no mkdir (CON, NUL, AUX, COM1-9, LPT1-9, PRN).
  if (WIN_RESERVED.has(normalized)) {
    throw new CommitError(
      `artifactType rejeitado (nome reservado do Windows): "${raw}".`,
    );
  }
  return normalized;
}

/**
 * Containment check robusto (AC1/AC3): asserção de que `absPath` está dentro de
 * `scopeDir`. Usa `path.resolve` + comparação com prefixo `dir + path.sep` (o
 * separador trailing fecha o buraco de `/root/.process-ai-evil` vs `/root/.process-ai/`).
 * Pura — zero IO — roda ANTES de qualquer writeFile.
 */
export function assertWithinScope(absPath: string, scopeDir: string): void {
  let resolvedScope = path.resolve(scopeDir);
  let resolvedAbs = path.resolve(absPath);
  // P8: normaliza case no Windows (FS case-insensitive → falsearia o containment)
  if (process.platform === 'win32') {
    resolvedScope = resolvedScope.toLowerCase();
    resolvedAbs = resolvedAbs.toLowerCase();
  }
  const prefix = resolvedScope + path.sep;
  if (resolvedAbs !== resolvedScope && !resolvedAbs.startsWith(prefix)) {
    throw new CommitError(
      `Escrita fora do escopo protegido: ${absPath} (esperado dentro de ${scopeDir}).`,
    );
  }
}

/**
 * Defense-in-depth (AC1 — espelha adapter.ts:65-82 da 1.1): nenhum componente do
 * caminho de `startDir` até `endDir` pode ser symlink — senão mkdir/writeFile
 * seguiriam o link e gravariam FORA do escopo protegido. lstat-walk só LÊ (não
 * escreve); ENOENT de componente ainda-não-criado é ignorado (mkdir o criará).
 *
 * Torna AC1 literalmente estanque mesmo se `_process-ai_output/`/`.process-ai/`
 * forem substituídos por symlinks apontando para fora do root da sessão.
 */
async function assertNoSymlinkComponent(startDir: string, endDir: string): Promise<void> {
  let cur = path.resolve(startDir);
  const rel = path.relative(cur, path.resolve(endDir)).split(path.sep).filter(Boolean);
  for (const seg of rel) {
    cur = path.join(cur, seg);
    let st: Awaited<ReturnType<typeof fs.lstat>>;
    try {
      st = await fs.lstat(cur);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      continue; // componente ainda não existe; mkdir o criará normalmente
    }
    if (st.isSymbolicLink()) {
      throw new CommitError(
        `Recusa: componente do caminho é symlink (escaparia do escopo protegido): ${cur}`,
      );
    }
    // P11: arquivo regular onde deveria ter um diretório causa ENOTDIR opaco no mkdir
    if (!st.isDirectory()) {
      throw new CommitError(
        `Recusa: componente do caminho não é um diretório (bloquearia mkdir): ${cur}`,
      );
    }
  }
}

// ---- T4: validação runtime do payload + abort-before-write (AC3, AC6) ----

/**
 * Valida o shape do payload (AC6 — item deferred explícito da story 1.1).
 * Rejeita: null/undefined; payload não-objeto (ou array); artifactType ausente/
 * não-string/vazio; content ausente (null/undefined). Erros acionáveis com
 * contexto. Pura — zero IO.
 *
 * Nota: `content` pode ser qualquer valor PRESENTE — incluindo `0`, `false` ou
 * `''` (vazio é conteúdo válido; só null/undefined é "ausente").
 */
export function validatePayload(payload: unknown): void {
  if (payload == null) {
    throw new CommitError('Payload ausente (null/undefined). Esperado { artifactType, content }.');
  }
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CommitError(
      `Payload inválido: esperado objeto, recebeu ${
        Array.isArray(payload) ? 'array' : typeof payload
      }.`,
    );
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.artifactType !== 'string' || p.artifactType.length === 0) {
    throw new CommitError(
      `artifactType ausente ou inválido: deve ser string não-vazia (recebeu ${describe(
        p.artifactType,
      )}).`,
    );
  }
  if (p.content === null || p.content === undefined) {
    throw new CommitError('content ausente (null/undefined). O artefato precisa de um corpo.');
  }
}

// ---- T3: escrita atômica + manifesto + provenance ----

let tempCounter = 0;

/**
 * Escrita atômica (AC implícito — espelha adapter.ts:101-111 da 1.1): temp +
 * `fs.rename` no mesmo diretório (mesmo FS → atômico em POSIX, near-atômico em
 * NTFS). Em falha de rename, remove o temp — não deixa arquivo torn/0-byte.
 */
export async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${tempCounter++}`;
  try {
    await fs.writeFile(tmp, data, 'utf8');
  } catch (e) {
    // P5: cleanup do temp se writeFile falha (disco cheio/EACCES/EIO)
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

/** Constrói uma linha JSONL de provenance com ordem de chaves estável. */
function provenanceLine(entry: {
  sha256: string;
  artifactType: string;
  agent: string;
  committedAt: string;
}): string {
  return JSON.stringify({
    sha256: entry.sha256,
    artifactType: entry.artifactType,
    agent: entry.agent,
    committedAt: entry.committedAt,
  });
}

/**
 * Chave de dedupe de provenance: tripla (sha256, agent, artifactType).
 * P3: inclui artifactType — dois tipos diferentes com mesmo sha+agente são commits distintos.
 */
function provenanceDedupeKey(sha256: string, agent: string, artifactType: string): string {
  return `${sha256}::${agent}::${artifactType}`;
}

/**
 * Append idempotente (AC5) com cache em memória (P4 — O(1) por commit, evita
 * O(n²) de reler e parsear o arquivo inteiro a cada chamada). O `committedAt`
 * (variável) NÃO participa da chave de dedupe.
 *
 * P1: lstat do leaf antes do append — recusa provenance.jsonl symlink que
 * escaparia do escopo protegido (espelha adapter.ts:110-120).
 *
 * NOTA: atomicidade TRANSACIONAL (commit+checkpoint) é da Story 1.3 (AD-4).
 */
async function appendProvenance(
  provenancePath: string,
  entry: { sha256: string; artifactType: string; agent: string; committedAt: string },
): Promise<void> {
  // P1 — leaf symlink check (espelha adapter.ts:110-120): recusa append sobre symlink
  try {
    const leafSt = await fs.lstat(provenancePath);
    if (leafSt.isSymbolicLink()) {
      throw new CommitError(
        `Recusa escrever provenance.jsonl: o destino é um symlink e escaparia do escopo .process-ai/: ${provenancePath}`,
      );
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      if (e instanceof CommitError) throw e;
      throw e;
    }
    // ENOENT = arquivo novo; prossegue normalmente
  }

  const dedupeKey = provenanceDedupeKey(entry.sha256, entry.agent, entry.artifactType);

  // P4 — cache em memória: primeira chamada popula do arquivo; depois só consulta o Set
  let seen = _provenanceCache.get(provenancePath);
  if (!seen) {
    seen = new Set();
    try {
      const raw = await fs.readFile(provenancePath, 'utf8');
      for (const line of raw.split('\n')) {
        if (!line) continue;
        try {
          const obj = JSON.parse(line) as { sha256?: string; agent?: string; artifactType?: string };
          if (obj.sha256 && obj.agent && obj.artifactType) {
            seen.add(provenanceDedupeKey(obj.sha256, obj.agent, obj.artifactType));
          }
        } catch { /* linha ilegível — ignora */ }
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    _provenanceCache.set(provenancePath, seen);
  }

  if (seen.has(dedupeKey)) return; // P3+P4: dedupe por (sha256, agent, artifactType)
  seen.add(dedupeKey);

  await fs.mkdir(path.dirname(provenancePath), { recursive: true });
  await fs.appendFile(provenancePath, provenanceLine(entry) + '\n', 'utf8');
}

// ---- commit: o orquestrador (AD-1) ----

export interface CommitOptions {
  /** Raiz da sessão (default = process.cwd()). O commit escreve sob este root. */
  root?: string;
  /** Agente que propôs o artefato (registrado em provenance; default "unknown"). */
  agent?: string;
}

/**
 * Commita um artefato de forma NÃO-DESTRUTIVA (AD-1, FR-20) com
 * checkpoint atômico integrado (AD-4, Story 1.3).
 *
 * Transação (5 passos, crash-safe):
 *   1. acquireLock
 *   2. WAL append (intent pending)
 *   3. Escrever artefato + manifesto + provenance (1.2)
 *   4. checkpointAdvance (atualiza artifacts[], stage, walCursor)
 *   5. WAL mark-complete → releaseLock
 *
 * Crash entre 2 e 3 → WAL pending, artefato não existe → resume descarta.
 * Crash entre 3 e 4 → WAL pending, artefato existe sem checkpoint → resume quarantena.
 * Crash entre 4 e 5 → WAL pending, checkpoint avançado → resume replay (idempotente).
 * Crash após 5 → tudo applied → resume normal.
 *
 * Ordem interna (AC3 — abort-before-write PRESERVADA): validar payload → validar claims
 * (1.4, source resolution read-only) → canonicalizar/hash → sanitizar artifactType → checar
 * escopo → SÓ ENTÃO lock+WAL+escrever. Toda validação roda ANTES do lock: payloads inválidos
 * falham fast, sem adquirir lock/WAL (zero side-effects). O TOCTOU entre validateClaims e o
 * write é benigno — manifests são append-only (nunca deletados), então a direção insegura
 * (🟢→🟡 por remoção concorrente) não ocorre (decisão code-review 1.4).
 *
 * Saídas (todas sob `root`):
 *  - artefato:   `_process-ai_output/<artifactType>/<sha256>.<ext>` (content-addressed)
 *  - manifesto:  `.process-ai/manifests/<artifactType>-<sha256>.json` ({ sha256, artifactType, artifactPath })
 *  - provenance: `.process-ai/provenance.jsonl` (append idempotente por (sha256, agent, artifactType))
 *  - checkpoint: `.process-ai/checkpoint.json` (atualizado atomicamente via WAL)
 *  - wal:        `.process-ai/wal.jsonl` (append-only, transação registrada)
 *
 * @returns CommitResult com sha256 + paths absolutos do artefato e do manifesto.
 */
export async function commit(
  payload: ProposePayload,
  opts: CommitOptions = {},
): Promise<CommitResult> {
  // P7: resolveRoot agora é async — valida que root é um diretório antes de qualquer IO.
  const root = await resolveRoot(opts.root);
  const agent = opts.agent ?? 'unknown';

  // 1) VALIDAÇÃO (zero IO) — AC6
  validatePayload(payload);

  // 1.3) CONFIG + PACK (IO — AD-2 / 3.2) — carrega o pack ativo, se declarado em
  // .process-ai/config. Roda ANTES da validação de schema para que validateContent
  // valide contra o schema MERGEADO (núcleo + pack). Abort-before-write: se o pack
  // declarado não existe/falha ao carregar → CommitError, nada é escrito (nenhum
  // ghost pack_id). Race LOW: config é advisory; as escritas reais são protegidas
  // pelo lock adquirido mais abaixo.
  let packSchemas: Record<string, unknown> | undefined;
  let packId: string | undefined;
  let packVersion: string | undefined;
  try {
    const config = await readConfig(root);
    if (config.activePack) {
      const packDir = path.join(root, 'method-packs', config.activePack.id);
      const loaded = await loadPack(packDir);
      packSchemas = loaded.schemas;
      packId = loaded.manifest.name; // truthful (do pack carregado, não da config)
      packVersion = loaded.manifest.version;
      if (config.activePack.version && config.activePack.version !== loaded.manifest.version) {
        console.warn(
          `[process-ai] AVISO: .process-ai/config declara pack_version="${config.activePack.version}" ` +
          `mas o pack "${packId}" em method-packs/${config.activePack.id}/ é versão "${loaded.manifest.version}". Estampando a versão real.`,
        );
      }
    }
  } catch (e) {
    // readConfig/loadPack → PackError; traduz no boundary para CommitError
    // (contrato: toda falha de commit é CommitError).
    throw e instanceof PackError ? new CommitError(e.message) : e;
  }

  // 1.5) VALIDAÇÃO DE SCHEMA (zero IO — AD-2, 3.1). Abort-before-write:
  // content fora do schema-núcleo (ou do schema mergeado, se pack ativo) → CommitError.
  const schemaResult = validateContent(payload.artifactType, payload.content, packSchemas);
  if (!schemaResult.valid) {
    throw new CommitError(
      `artifactType "${payload.artifactType}": content inválido — ${schemaResult.errors.join('; ')}.`,
    );
  }

  // 1.4) VALIDAÇÃO DE CONFIANÇA (zero IO, exceto source resolution) — AD-5 / AC1-AC4.
  // P8: ConfidenceError (erro interno do módulo confidence) → CommitError no boundary,
  // preservando o contrato 1.2 ("falhas de commit são CommitError") e o AC4 literal.
  let validatedClaims: ValidatedClaim[] | undefined;
  if (payload.claims && Array.isArray(payload.claims) && payload.claims.length > 0) {
    try {
      validatedClaims = await validateClaims(payload.claims, root);
    } catch (e) {
      throw e instanceof ConfidenceError ? new CommitError(e.message) : e;
    }
  }

  // 2) CANONICALIZAÇÃO + SHA-256 determinístico (zero IO) — AC2/AC5
  const canonical = canonicalize(payload.content);
  const digest = sha256(canonical);

  // 3) SANITIZAÇÃO do artifactType (zero IO) — AC3
  const artifactType = sanitizeArtifactType(payload.artifactType);

  // (3.2 CONFIG + pack_id movidos para antes da validação de schema — passo 1.3 acima.)

  // 1.4) BUILD LEDGER ENTRIES (zero IO — após sha256 para claimId determinístico) — AD-5 / AC3
  const ledgerEntries =
    validatedClaims && payload.claims
      ? buildLedgerEntries(payload.claims, validatedClaims, artifactType, digest)
      : undefined;

  // P15: valida extensão — previne que entradas futuras de EXT_BY_TYPE injetem
  // separadores `/`, `..`, `.` ou caracteres não-seguros no path do artefato.
  const ext = EXT_BY_TYPE[artifactType] ?? '.md';
  if (!/^[a-z0-9.-]+$/.test(ext) || ext.includes('..') || ext.includes('/') || ext.includes('\\')) {
    throw new CommitError(`Extensão inválida para artifactType "${artifactType}": "${ext}".`);
  }

  // 4) PATHS + ESCOPO (zero IO — defense-in-depth) — AC1/AC3
  // D1: manifesto com prefixo artifactType — evita colisão cross-type (mesmo sha, tipos diferentes).
  const artifactPath = path.join(root, OUTPUT_DIR, artifactType, `${digest}${ext}`);
  const manifestPath = path.join(root, META_DIR, MANIFESTS_SUBDIR, `${artifactType}-${digest}.json`);
  const provenancePath = path.join(root, META_DIR, PROVENANCE_FILE);
  assertWithinScope(artifactPath, path.join(root, OUTPUT_DIR));
  assertWithinScope(manifestPath, path.join(root, META_DIR));
  assertWithinScope(provenancePath, path.join(root, META_DIR));
  // Defense-in-depth (AC1): nenhum componente symlink nas pastas protegidas.
  await assertNoSymlinkComponent(root, path.dirname(artifactPath));
  await assertNoSymlinkComponent(root, path.dirname(manifestPath));
  await assertNoSymlinkComponent(root, path.dirname(provenancePath));

  // 5) TRANSAÇÃO ATÔMICA commit+checkpoint via WAL (AD-4, Story 1.3).
  //    Lock → WAL append → write artifact/manifest/provenance → checkpoint → WAL complete → unlock.
  const lock = await acquireLock(root);

  try {
    const manifestRelPath = path.relative(root, manifestPath).split(path.sep).join('/');

    const finalCheckpoint: CheckpointState = await checkpointAdvance(
      root,
      await checkpointRead(root),
      {
        kind: 'commit',
        payload: { artifactType, sha256: digest, manifestPath: manifestRelPath },
      } satisfies WalIntent,
      async () => {
        // Escritas (atômicas por arquivo) — só aqui há IO.
        // Artefato: bytes canônicos (hash == sha do manifesto).
        await atomicWriteFile(artifactPath, canonical);
        // Manifesto: byte-estável (sem timestamp) → idempotente em re-commit.
        const manifest: Record<string, unknown> = {
          sha256: digest,
          artifactType,
          artifactPath: path.relative(root, artifactPath).split(path.sep).join('/'),
        };
        // 3.2: registrar pack_id+versão se pack ativo (AD-2).
        if (packId) {
          manifest.pack_id = packId;
          manifest.pack_version = packVersion;
        }
        await atomicWriteFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
        // Provenance: append idempotente (dedupe por (sha256, agent, artifactType)).
        await appendProvenance(provenancePath, {
          sha256: digest,
          artifactType,
          agent,
          committedAt: new Date().toISOString(),
        });
        // 1.4) Ledger de confiança: append idempotente (AD-5, AC3/AC5). P8: wrap no boundary.
        if (ledgerEntries && ledgerEntries.length > 0) {
          try {
            await appendConfidenceLedger(root, ledgerEntries);
          } catch (e) {
            throw e instanceof ConfidenceError ? new CommitError(e.message) : e;
          }
        }
      },
    );

    // P12: normaliza paths no CommitResult para `/` (consistente com manifest.artifactPath).
    return {
      sha256: digest,
      artifactPath: artifactPath.split(path.sep).join('/'),
      manifestPath: manifestPath.split(path.sep).join('/'),
    };
  } finally {
    await releaseLock(lock);
  }
}

// ---- util ----

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  return typeof v;
}
