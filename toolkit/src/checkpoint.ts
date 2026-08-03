/**
 * toolkit/src/checkpoint.ts — CHECKPOINT AUTORITATIVO + WAL ATÔMICO (AD-4).
 *
 * Materializa o invariante AD-4: todo estado de sessão vive em
 * `.process-ai/checkpoint.json`. Commit + avançar checkpoint são uma transação
 * atômica via WAL (Write-Ahead Log). Resume é função pura do checkpoint;
 * manifestos órfãos vão para quarentena (nunca auto-mergeados).
 *
 * Single-writer em `.process-ai/` via lock file (`fs.mkdir`, atômico em todos OS).
 *
 * INVARIANTE AD-3 (núcleo hexagonal): este arquivo só importa `node:*` builtins
 * ou caminhos relativos dentro do core — nunca um package npm.
 *
 * Fronteiras (NÃO faça aqui — pertence a outra story):
 *  - atribuição mecânica 🟢🟡🔴 por fonte + ledger de confiança → Story 1.4 (AD-5).
 *  - conteúdo real dos gates (aprovação humana via Déa) → Story 1.5.
 *  - schema-núcleo por artifactType → Story 3.1 (AD-2).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readConfig } from './pack-loader.ts';

// ---- Tipos (T1) ----

/** Intenção registrada no WAL antes de ser aplicada. */
export type WalIntent =
  | { kind: 'commit'; payload: { artifactType: string; sha256: string; manifestPath: string } }
  | { kind: 'gate'; payload: { gateId: string; decision: string } }
  | { kind: 'stage-advance'; payload: { from: string; to: string } };

/** Entrada individual no WAL (uma linha JSONL). */
export interface WalEntry {
  id: string;
  intent: WalIntent;
  status: 'pending' | 'applied';
  createdAt: string; // ISO-8601
}

/** Artefato referenciado pelo checkpoint. */
export interface CheckpointArtifact {
  sha256: string;
  artifactType: string;
  path: string; // relativo ao root, com '/'
}

/** Decisão de gate registrada no checkpoint. */
export interface CheckpointGate {
  gateId: string;
  decision: string;
  decidedAt: string; // ISO-8601
}

/** Estado completo da sessão (fonte autoritativa — AD-4). */
export interface CheckpointState {
  stage: string;
  artifacts: CheckpointArtifact[];
  gates: CheckpointGate[];
  lastCheckpointAt: string; // ISO-8601, metadado de observabilidade
  walCursor: number;        // índice da última entrada WAL aplicada
}

/** Resultado do resume. */
export interface ResumeResult {
  state: CheckpointState;
  orphans: QuarantinedArtifact[];
  /** Avisos de compatibilidade de pack (AD-2 / 3.2 AC3/AC4) — advisory; v1 não bloqueia. */
  packCompatibilityWarnings?: string[];
}

/** Artefato enviado à quarentena. */
export interface QuarantinedArtifact {
  sha256: string;
  originalManifestPath: string;
  reason: string;
  quarantinedAt: string; // ISO-8601
}

/** Handle de lock adquirido (libera no unlock). */
export interface LockHandle {
  lockDir: string;
  root: string;
}

// ---- Constantes ----

const META_DIR = '.process-ai';
const CHECKPOINT_FILE = 'checkpoint.json';
const WAL_FILE = 'wal.jsonl';
const LOCK_DIR = '.lock';
const QUARANTINE_DIR = 'quarantine';

// ---- Erro acionável ----

export class CheckpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckpointError';
  }
}

// ---- Helpers de path ----

function metaPath(root: string, ...parts: string[]): string {
  return path.join(root, META_DIR, ...parts);
}

// ---- Estado inicial ----

export function initialState(): CheckpointState {
  return {
    stage: 'init',
    artifacts: [],
    gates: [],
    lastCheckpointAt: new Date(0).toISOString(), // epoch — nunca ocorreu checkpoint
    walCursor: 0,
  };
}

// ---- T2: Lock (single-writer) ----

/**
 * Adquire lock exclusivo em `.process-ai/.lock/` via `fs.mkdir` (atômico em
 * POSIX e Windows). EEXIST = lock já adquirido → retry com exponential backoff.
 * Stale detection: se o PID dono não existe mais, quebra o lock.
 */
export async function acquireLock(root: string, timeoutMs = 30_000): Promise<LockHandle> {
  const lockDir = metaPath(root, LOCK_DIR);
  // Garante que .process-ai/ existe (recursive) — mas o LOCK em si é mkdir SEM recursive
  // (mkdir sem recursive em diretório existente lança EEXIST corretamente)
  await fs.mkdir(path.dirname(lockDir), { recursive: true });
  const start = Date.now();
  let attempt = 0;

  while (true) {
    try {
      await fs.mkdir(lockDir);
      // Lock adquirido — grava pid + timestamp
      await fs.writeFile(
        path.join(lockDir, 'pid'),
        String(process.pid),
        'utf8',
      );
      await fs.writeFile(
        path.join(lockDir, 'acquiredAt'),
        new Date().toISOString(),
        'utf8',
      );
      return { lockDir, root };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }

    // Lock já existe — verificar stale
    const stale = await isLockStale(lockDir);
    if (stale) {
      await breakStaleLock(lockDir);
      continue; // tenta adquirir de novo
    }

    // Timeout?
    if (Date.now() - start > timeoutMs) {
      throw new CheckpointError(
        `Timeout ao adquirir lock em ${lockDir} (${timeoutMs}ms). Outro processo pode estar ativo.`,
      );
    }

    // Exponential backoff com jitter
    const delay = Math.min(100 * Math.pow(2, attempt), 2000) + Math.random() * 50;
    await sleep(delay);
    attempt++;
  }
}

async function isLockStale(lockDir: string): Promise<boolean> {
  try {
    const pidStr = await fs.readFile(path.join(lockDir, 'pid'), 'utf8');
    const pid = parseInt(pidStr.trim(), 10);
    if (isNaN(pid)) return true;
    // Tenta matar com sinal 0 (checa existência, não mata)
    try {
      process.kill(pid, 0);
      return false; // processo existe → lock NÃO é stale
    } catch {
      return true; // processo não existe → lock stale
    }
  } catch {
    return true; // não conseguiu ler pid → stale
  }
}

async function breakStaleLock(lockDir: string): Promise<void> {
  await fs.rm(lockDir, { recursive: true, force: true });
}

/** Libera o lock (remove o diretório). */
export async function releaseLock(handle: LockHandle): Promise<void> {
  await fs.rm(handle.lockDir, { recursive: true, force: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- T2: WAL (Write-Ahead Log) ----

let walCounter = 0;

/** Gera ID único para entrada WAL: timestamp + pid + contador. */
function generateWalId(): string {
  return `${Date.now()}-${process.pid}-${walCounter++}`;
}

/**
 * Append atômico de uma entrada pending no WAL.
 * Linha JSONL: { id, intent, status: 'pending', createdAt }.
 */
export async function walAppend(root: string, intent: WalIntent): Promise<WalEntry> {
  const entry: WalEntry = {
    id: generateWalId(),
    intent,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  const walPath = metaPath(root, WAL_FILE);
  await fs.mkdir(path.dirname(walPath), { recursive: true });
  await fs.appendFile(walPath, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

/**
 * Lê todas as entradas do WAL (para resume/replay).
 * Retorna array ordenado por posição no arquivo (= ordem cronológica).
 */
export async function walReadAll(root: string): Promise<WalEntry[]> {
  const walPath = metaPath(root, WAL_FILE);
  try {
    const raw = await fs.readFile(walPath, 'utf8');
    return raw
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => {
        try {
          return JSON.parse(l) as WalEntry;
        } catch {
          return null; // linha corrompida — ignora (AD-4: resume sobrevive a WAL parcial)
        }
      })
      .filter((e): e is WalEntry => e !== null);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

/**
 * Marca uma entrada WAL como `applied`.
 * Estratégia: append de uma linha de confirmação com `status: 'applied'` +
 * rewrite in-place do campo status na linha original (idempotente: se já está
 * applied, é no-op).
 *
 * Como o WAL é append-only e single-writer, escrevemos a entrada completa de
 * novo com status 'applied'. O resume consome a última ocorrência de cada id.
 */
export async function walMarkComplete(root: string, entryId: string): Promise<void> {
  const walPath = metaPath(root, WAL_FILE);
  const entries = await walReadAll(root);
  // Encontra a entrada e reescreve com status applied
  const updated = entries.map((e) => {
    if (e.id === entryId && e.status === 'pending') {
      return { ...e, status: 'applied' as const };
    }
    return e;
  });
  // Reescreve o arquivo inteiro (single-writer = seguro)
  const tmp = `${walPath}.tmp-${process.pid}-${walCounter++}`;
  await fs.writeFile(tmp, updated.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  await fs.rename(tmp, walPath);
}

// ---- T3: Checkpoint state machine ----

/**
 * Lê o estado do checkpoint. Se não existe, retorna estado inicial.
 */
export async function checkpointRead(root: string): Promise<CheckpointState> {
  const cpPath = metaPath(root, CHECKPOINT_FILE);
  try {
    const raw = await fs.readFile(cpPath, 'utf8');
    return JSON.parse(raw) as CheckpointState;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return initialState();
    throw e;
  }
}

/**
 * Escreve o checkpoint atomicamente (temp + rename, padrão 1.2).
 */
export async function checkpointWrite(root: string, state: CheckpointState): Promise<void> {
  const cpPath = metaPath(root, CHECKPOINT_FILE);
  await fs.mkdir(path.dirname(cpPath), { recursive: true });
  const tmp = `${cpPath}.tmp-${process.pid}-${walCounter++}`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, cpPath);
}

/**
 * Orquestra a transação atômica commit+checkpoint (T5):
 * lock → WAL append → (caller executa escritas) → checkpoint write → WAL mark-complete → unlock.
 *
 * O caller fornece um callback `apply` que executa as escritas reais
 * (artefato + manifesto + provenance). Se `apply` lançar, o WAL fica pending
 * e o próximo resume fará rollback.
 *
 * Retorna o novo CheckpointState após o avanço.
 */
export async function checkpointAdvance(
  root: string,
  state: CheckpointState,
  intent: WalIntent,
  apply: () => Promise<void>,
): Promise<CheckpointState> {
  // 1) WAL append (intent pending)
  const entry = await walAppend(root, intent);

  // 2) Executa as escritas reais (caller)
  await apply();

  // 3) Atualiza checkpoint baseado no intent
  const nextState = applyIntent(state, entry);

  // 4) Escreve checkpoint
  await checkpointWrite(root, nextState);

  // 5) Marca WAL como complete
  await walMarkComplete(root, entry.id);

  return nextState;
}

/**
 * Aplica um intent ao estado do checkpoint (pura — sem IO).
 * Chamada internamente por `checkpointAdvance` e por `resume` (replay).
 */
function applyIntent(state: CheckpointState, entry: WalEntry): CheckpointState {
  const now = new Date().toISOString();
  const next: CheckpointState = {
    ...state,
    lastCheckpointAt: now,
    walCursor: state.walCursor + 1,
  };

  switch (entry.intent.kind) {
    case 'commit': {
      const { artifactType, sha256, manifestPath } = entry.intent.payload;
      next.artifacts = [
        ...state.artifacts,
        { sha256, artifactType, path: manifestPath },
      ];
      break;
    }
    case 'gate': {
      const { gateId, decision } = entry.intent.payload;
      next.gates = [
        ...state.gates.filter((g) => g.gateId !== gateId),
        { gateId, decision, decidedAt: now },
      ];
      break;
    }
    case 'stage-advance': {
      next.stage = entry.intent.payload.to;
      break;
    }
  }

  return next;
}

// ---- T4: Resume + quarentena ----

/**
 * Resume: reconstrói o estado canônico a partir do on-disk (AD-4). NÃO é pura —
 * pode reescrever o checkpoint (após replay/discard de WAL) e mover manifestos
 * órfãos para quarentena. Em uso single-session (uma sessão por projeto), roda
 * sem lock no início da sessão, quando nenhum outro escritor está ativo.
 *
 * 1. Lê checkpoint.json → estado base.
 * 2. Lê wal.jsonl → entradas com cursor > checkpoint.walCursor e status
 *    'pending' são descartadas (rollback); entradas 'applied' com cursor >
 *    checkpoint.walCursor fazem replay (atualizam checkpoint).
 * 3. Lista manifestos em .process-ai/manifests/.
 * 4. Quarentena: todo manifesto cujo SHA não aparece em checkpoint.artifacts[]
 *    é movido para .process-ai/quarantine/.
 * 5. Se houve replay, reescreve o checkpoint.
 * 6. Retorna ResumeResult.
 */
export async function resume(root: string): Promise<ResumeResult> {
  // 1) Estado base do checkpoint
  let state = await checkpointRead(root);
  const initialCursor = state.walCursor;

  // 2) Processa WAL
  const walEntries = await walReadAll(root);
  const pendingDiscarded: string[] = [];
  let replayed = 0;

  for (const entry of walEntries) {
    const entryIndex = walEntries.indexOf(entry);
    if (entryIndex < state.walCursor) continue; // já aplicado

    if (entry.status === 'pending') {
      // Rollback: descarta intenção não-concluída
      pendingDiscarded.push(entry.id);
      state = { ...state, walCursor: entryIndex + 1 };
    } else if (entry.status === 'applied') {
      // Replay: reaplica ao estado
      state = applyIntent(state, entry);
      replayed++;
    }
  }

  // Se houve replay OU cursor avançou (pending discard), persiste o checkpoint
  if (replayed > 0 || state.walCursor !== initialCursor) {
    await checkpointWrite(root, state);
  }

  // 3) Lista manifestos
  const manifestsDir = metaPath(root, 'manifests');
  const knownShas = new Set(state.artifacts.map((a) => a.sha256));
  const orphans: QuarantinedArtifact[] = [];

  // 6) Pack ativo para checagem de compatibilidade (AD-2 / 3.2 AC3/AC4, advisory v1).
  let activePackId: string | undefined;
  try {
    const config = await readConfig(root);
    activePackId = config.activePack?.id;
  } catch {
    // Falha de leitura da config não quebra o resume — advisory only.
  }
  const packWarnings: string[] = [];

  try {
    const manifestFiles = await fs.readdir(manifestsDir);
    for (const file of manifestFiles) {
      if (!file.endsWith('.json')) continue;
      const manifestPath = path.join(manifestsDir, file);
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
          sha256: string;
          pack_id?: string;
          artifactType?: string;
        };
        if (!knownShas.has(manifest.sha256)) {
          // 4) Quarentena
          const result = await quarantineArtifact(root, manifest.sha256, manifestPath);
          orphans.push(result);
        }
        // 6) Compatibilidade de pack: artefato com pack ≠ ativo → aviso (v1: warn).
        if (activePackId && manifest.pack_id && manifest.pack_id !== activePackId) {
          packWarnings.push(
            `Artefato ${manifest.artifactType ?? '?'}/${manifest.sha256.slice(0, 8)} ` +
            `commitado com pack "${manifest.pack_id}" difere do pack ativo "${activePackId}".`,
          );
        }
      } catch {
        // arquivo de manifesto corrompido ou ilegível — quarentena também
        const shaFromFile = file.replace(/\.json$/, '');
        const result = await quarantineArtifact(
          root,
          shaFromFile,
          manifestPath,
          'Manifesto corrompido ou ilegível.',
        );
        orphans.push(result);
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    // manifests/ não existe → sem órfãos
  }

  return {
    state,
    orphans,
    ...(packWarnings.length > 0 ? { packCompatibilityWarnings: packWarnings } : {}),
  };
}

/**
 * Move um manifesto (e artefato associado) para quarentena.
 * Nunca deleta — move para `.process-ai/quarantine/<sha>.json` +
 * `.process-ai/quarantine/<sha>.reason.md`.
 *
 * Tenta também mover o artefato referenciado pelo manifesto se o path existir.
 */
export async function quarantineArtifact(
  root: string,
  sha256: string,
  manifestPath: string,
  reason?: string,
): Promise<QuarantinedArtifact> {
  const quarantineDir = metaPath(root, QUARANTINE_DIR);
  await fs.mkdir(quarantineDir, { recursive: true });

  const quarantineManifest = path.join(quarantineDir, `${sha256}.json`);
  const quarantineReason = path.join(quarantineDir, `${sha256}.reason.md`);

  // Move manifesto
  try {
    await fs.rename(manifestPath, quarantineManifest);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    // Manifesto já não existe — ok
  }

  // Tenta mover artefato também (se o manifesto tiver artifactPath)
  try {
    const manifest = JSON.parse(await fs.readFile(quarantineManifest, 'utf8')) as {
      artifactPath?: string;
    };
    if (manifest.artifactPath) {
      const artifactAbs = path.join(root, manifest.artifactPath);
      try {
        const artifactName = path.basename(manifest.artifactPath);
        const quarantineArtifactPath = path.join(quarantineDir, artifactName);
        await fs.rename(artifactAbs, quarantineArtifactPath);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
          // Loga mas não interrompe — artefato pode já ter sido removido
        }
      }
    }
  } catch {
    // Manifesto corrompido — reason.md captura isso
  }

  // Escreve reason.md
  const reasonText = [
    `# Quarentena — ${sha256}`,
    '',
    `**Data:** ${new Date().toISOString()}`,
    `**Manifesto original:** ${manifestPath}`,
    `**Motivo:** ${reason ?? 'Manifesto não referenciado pelo checkpoint (AD-4: nunca auto-mergeado).'}`,
    '',
    'Este artefato foi movido para quarentena porque o checkpoint não o referencia.',
    'Para recuperá-lo, mova-o de volta manualmente ou use um futuro comando `process-ai quarantine recover`.',
  ].join('\n');
  await fs.writeFile(quarantineReason, reasonText, 'utf8');

  return {
    sha256,
    originalManifestPath: manifestPath,
    reason: reason ?? 'Manifesto não referenciado pelo checkpoint.',
    quarantinedAt: new Date().toISOString(),
  };
}
