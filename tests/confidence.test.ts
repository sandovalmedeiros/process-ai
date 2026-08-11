/**
 * tests/confidence.test.ts — validateClaims + appendConfidenceLedger + buildLedgerEntries
 * (AC1–AC6 + AD-5 + regressão + patches P1/P4/P5/P6/P8 do code review 1.4).
 *
 * Cobre o invariante AD-5: confiança mecânica por fonte verificável. O toolkit
 * valida claims (🟢 exige SHA-256 hex64 resolvido; ghost/forward-ref → unresolved;
 * missing/malformed source → 🟡; 🔴 = gap) e grava o ledger de confiança.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  validateClaims,
  appendConfidenceLedger,
  buildLedgerEntries,
  ConfidenceError,
  VALID_CONFIDENCE_LEVELS,
} from '../toolkit/src/confidence.ts';
import type { Claim, ConfidenceLedgerEntry, ValidatedClaim } from '../toolkit/src/confidence.ts';
import { commit, CommitError, sha256, canonicalize } from '../toolkit/src/commit.ts';
import type { ProposePayload } from '../toolkit/src/engine-adapter.ts';

/** Lista recursiva de arquivos sob `dir`. */
async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  try {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await listFiles(full, base)));
      else out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  } catch {
    // dir não existe — retorna vazio
  }
  return out;
}

/** Cria um manifesto fake para source resolution (SHA-256 stub). */
async function createManifest(
  root: string,
  artifactType: string,
  sha: string,
  opts?: { artifactPath?: string },
): Promise<string> {
  const dir = path.join(root, '.process-ai', 'manifests');
  await fs.mkdir(dir, { recursive: true });
  const manifestPath = path.join(dir, `${artifactType}-${sha}.json`);
  await fs.writeFile(manifestPath, JSON.stringify({
    sha256: sha,
    artifactType,
    artifactPath: opts?.artifactPath,
  }), 'utf8');
  return manifestPath;
}

/** Cria um artefato-fonte real (com conteúdo) + manifesto apontando para ele — para testes de excerpt. */
async function createArtifactWithManifest(
  root: string,
  artifactType: string,
  sha: string,
  content: string,
): Promise<string> {
  const outputDir = path.join(root, '_process-ai_output', artifactType);
  await fs.mkdir(outputDir, { recursive: true });
  const artifactPath = path.join(outputDir, `${sha}.md`);
  await fs.writeFile(artifactPath, content, 'utf8');
  const relPath = path.relative(root, artifactPath).split(path.sep).join('/');
  await createManifest(root, artifactType, sha, { artifactPath: relPath });
  return artifactPath;
}

const LEDGER = (root: string) => path.join(root, '.process-ai', 'confidence-ledger.jsonl');

// SHAs hex64 válidos que NÃO resolvem (nenhum manifesto criado) — p/ testar unresolved-source.
// P1: a validação agora exige hex64; placeholders não-hex ('abacate'.repeat(8) etc.) dariam
// 'malformed-source'. Estes são hex64 reais que simplesmente não têm manifesto.
const GHOST_SHA = sha256('ghost-unresolved-1');
const FORWARD_SHA = sha256('forward-unresolved-2');

// ---- T1: VALID_CONFIDENCE_LEVELS ----

test('VALID_CONFIDENCE_LEVELS contém 🟢🟡🔴', () => {
  assert.equal(VALID_CONFIDENCE_LEVELS.size, 3);
  assert.ok(VALID_CONFIDENCE_LEVELS.has('🟢'));
  assert.ok(VALID_CONFIDENCE_LEVELS.has('🟡'));
  assert.ok(VALID_CONFIDENCE_LEVELS.has('🔴'));
});

// ---- T2: validateClaims — AC1 (🟢 com source resolvida) ----

test('AC1: 🟢 com source resolvida → 🟢 mantido', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-ac1-'));
  try {
    const sourceSha = sha256(canonicalize({ data: 'entrevista' }));
    await createManifest(root, 'sipoc', sourceSha);

    const claims: Claim[] = [{
      statement: 'O processo tem 3 etapas',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: sourceSha },
      reasoning: 'Confirmado na entrevista',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result.length, 1);
    assert.equal(result[0].proposed, '🟢');
    assert.equal(result[0].validated, '🟢');
    assert.equal(result[0].degradationReason, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- validateClaims — AC1 (ghost/forward-ref → degradado) ----

test('AC1: 🟢 com source ghost (SHA inexistente) → 🟡 + unresolved-source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-ghost-'));
  try {
    const claims: Claim[] = [{
      statement: 'Afirmação sem fonte real',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: GHOST_SHA },
      reasoning: 'Fonte alucinada',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].proposed, '🟢');
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'unresolved-source');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC1: 🟢 com source forward-ref (manifesto não existe) → 🟡 + unresolved-source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-fwd-'));
  try {
    const claims: Claim[] = [{
      statement: 'Referência a artefato ainda não commitado',
      level: '🟢',
      source: { artifactType: 'hierarchy', sha256: FORWARD_SHA },
      reasoning: 'Fonte futura',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'unresolved-source');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- P1: source malformada (path traversal / não-hex) → malformed-source (não 🟢) ----

test('P1: 🟢 com sha256 não-hex → 🟡 + malformed-source (fecha path traversal)', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-mal-'));
  try {
    const claims: Claim[] = [{
      statement: 'SHA inválida',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: 'not-a-valid-hex-sha' },
      reasoning: 'Malformado',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'malformed-source');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('P1: 🟢 com sha256 de path traversal → 🟡 + malformed-source (sem escapar do root)', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-trav-'));
  try {
    // Pré-fix: cria um arquivo FORA do root p/ confirmar que não é lido (oráculo de existência).
    await fs.mkdir(path.join(root, 'evil'), { recursive: true });
    await fs.writeFile(path.join(root, 'evil', 'pwned.json'), 'gotcha', 'utf8');

    const claims: Claim[] = [{
      statement: 'Tentativa de traversal',
      level: '🟢',
      source: { artifactType: 'x', sha256: '../../../../evil/pwned' },
      reasoning: 'Ataque',
    }];

    const result = await validateClaims(claims, root);
    // Não vira 🟢 — degrada a 🟡 + malformed-source (hex validation rejeita antes do path).
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'malformed-source');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('P1: 🟢 com sha256 whitespace → 🟡 + missing-source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-ws-'));
  try {
    const claims: Claim[] = [{
      statement: 'Whitespace',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: '   ' },
      reasoning: 'Erro',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'missing-source');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('P1: 🟢 com sha256 não-string (number) → 🟡 + missing-source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-num-'));
  try {
    const claims = [{
      statement: 'Não-string',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: 12345 },
      reasoning: 'Tipo errado',
    }] as unknown as Claim[];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'missing-source');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('P1: 🟢 com source.artifactType inválido (mesmo com sha hex válida) → malformed-source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-badtype-'));
  try {
    const claims: Claim[] = [{
      statement: 'Tipo com traversal',
      level: '🟢',
      source: { artifactType: '../evil', sha256: GHOST_SHA },
      reasoning: 'Bad type',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'malformed-source');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('P1: diretório no path do manifesto → não resolve (lstat isFile=false) → unresolved', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-dir-'));
  try {
    const sha = sha256(canonicalize({ data: 'dir-test' }));
    // Cria um DIRETÓRIO onde o manifesto deveria ser um arquivo regular.
    await fs.mkdir(path.join(root, '.process-ai', 'manifests', `sipoc-${sha}.json`), { recursive: true });

    const claims: Claim[] = [{
      statement: 'Dir no path',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: sha },
      reasoning: 'Dir',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'unresolved-source');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('P1: symlink no path do manifesto → não resolve (lstat não segue) → unresolved', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-sym-'));
  try {
    const sha = sha256(canonicalize({ data: 'sym-test' }));
    const target = path.join(root, 'real-target.json');
    await fs.writeFile(target, 'hello', 'utf8');
    const linkPath = path.join(root, '.process-ai', 'manifests', `sipoc-${sha}.json`);
    await fs.mkdir(path.dirname(linkPath), { recursive: true });
    try {
      await fs.symlink(target, linkPath);
    } catch (e) {
      // Windows sem Developer Mode não cria symlink — skip silencioso (não é falha).
      if ((e as NodeJS.ErrnoException).code === 'EPERM' || (e as NodeJS.ErrnoException).code === 'EEXIST') {
        return;
      }
      throw e;
    }

    const claims: Claim[] = [{
      statement: 'Symlink no manifesto',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: sha },
      reasoning: 'Sym',
    }];

    const result = await validateClaims(claims, root);
    // lstat vê o symlink (não segue) → isFile=false → não resolve → não vira 🟢.
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'unresolved-source');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- validateClaims — AC2 (sem fonte → 🟡; não-determinado → 🔴) ----

test('AC2a: 🟢 sem source → 🟡 + missing-source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-nosrc-'));
  try {
    const claims: Claim[] = [{
      statement: 'Afirmação ousada sem fonte',
      level: '🟢',
      reasoning: 'Agente confiante demais',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'missing-source');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC2a: 🟢 com source.sha256 vazia → 🟡 + missing-source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-empty-'));
  try {
    const claims: Claim[] = [{
      statement: 'Fonte vazia',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: '' },
      reasoning: 'Erro do agente',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'missing-source');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC2b: 🟡 com source → 🟡 mantido', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-yel-'));
  try {
    const claims: Claim[] = [{
      statement: 'Provavelmente é assim',
      level: '🟡',
      source: { artifactType: 'sipoc', sha256: 'whatever'.repeat(8) },
      reasoning: 'Inferido de indícios',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].proposed, '🟡');
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC2b: 🟡 sem source → 🟡 mantido', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-yel2-'));
  try {
    const claims: Claim[] = [{
      statement: 'Inferido, sem fonte',
      level: '🟡',
      reasoning: 'Melhor palpite',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].validated, '🟡');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC2c: 🔴 → 🔴 mantido', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-red-'));
  try {
    const claims: Claim[] = [{
      statement: 'Não sabemos como funciona esta etapa',
      level: '🔴',
      reasoning: 'Usuário não soube responder',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].proposed, '🔴');
    assert.equal(result[0].validated, '🔴');
    assert.equal(result[0].degradationReason, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- validateClaims — AC4 (nível inválido → aborta) ----

test('AC4: nível inválido → ConfidenceError', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-bad-'));
  try {
    const claims: Claim[] = [{
      statement: 'Nível errado',
      level: 'blue' as unknown as '🟢',
      reasoning: 'Falha do agente',
    }];

    await assert.rejects(
      () => validateClaims(claims, root),
      ConfidenceError,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC4: nível ausente/null → ConfidenceError', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-null-'));
  try {
    const claims: Claim[] = [{
      statement: 'Sem nível',
      level: null as unknown as '🟢',
      reasoning: '',
    }];

    await assert.rejects(
      () => validateClaims(claims, root),
      ConfidenceError,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- P5: guards de claims malformados (não-array / elemento não-objeto) ----

test('P5: validateClaims com claims não-array → ConfidenceError', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-na-'));
  try {
    await assert.rejects(
      () => validateClaims({ foo: 'bar' } as unknown as Claim[], root),
      ConfidenceError,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('P5: validateClaims com elemento null → ConfidenceError acionável', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-nullclaim-'));
  try {
    const claims = [null] as unknown as Claim[];
    await assert.rejects(
      () => validateClaims(claims, root),
      ConfidenceError,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- validateClaims — múltiplos claims ----

test('AC1+AC2: múltiplos claims, um ghost → só o ghost degradado, outros intactos', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-multi-'));
  try {
    const sourceSha = sha256(canonicalize({ data: 'real' }));
    await createManifest(root, 'interview', sourceSha);

    const claims: Claim[] = [
      {
        statement: 'Afirmação sólida',
        level: '🟢',
        source: { artifactType: 'interview', sha256: sourceSha },
        reasoning: 'Confirmado',
      },
      {
        statement: 'Afirmação fantasma',
        level: '🟢',
        source: { artifactType: 'sipoc', sha256: GHOST_SHA },
        reasoning: 'Alucinação',
      },
      {
        statement: 'Inferência',
        level: '🟡',
        reasoning: 'Estimativa',
      },
      {
        statement: 'Gap',
        level: '🔴',
        reasoning: 'Desconhecido',
      },
    ];

    const result = await validateClaims(claims, root);
    assert.equal(result.length, 4);
    // [0] 🟢 sólido → 🟢
    assert.equal(result[0].validated, '🟢');
    assert.equal(result[0].degradationReason, undefined);
    // [1] 🟢 ghost → 🟡
    assert.equal(result[1].validated, '🟡');
    assert.equal(result[1].degradationReason, 'unresolved-source');
    // [2] 🟡 → 🟡
    assert.equal(result[2].validated, '🟡');
    // [3] 🔴 → 🔴
    assert.equal(result[3].validated, '🔴');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- T3: buildLedgerEntries + appendConfidenceLedger (AC3, AC5) ----

test('AC3: appendConfidenceLedger grava entradas no ledger', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-ledger-'));
  try {
    const entries: ConfidenceLedgerEntry[] = [{
      claimId: 'sipoc-abc123-0',
      artifactType: 'sipoc',
      artifactSha256: 'abc123',
      proposed: '🟢',
      validated: '🟢',
      source: { artifactType: 'interview', sha256: 'def456' },
      validatedAt: new Date().toISOString(),
    }];

    await appendConfidenceLedger(root, entries);

    const raw = await fs.readFile(LEDGER(root), 'utf8');
    const lines = raw.trim().split('\n');
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.claimId, 'sipoc-abc123-0');
    assert.equal(parsed.validated, '🟢');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC5: ledger idempotente — mesma claimId+artifactSha256 2× → 1 entrada', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-idem-'));
  try {
    const entries: ConfidenceLedgerEntry[] = [{
      claimId: 'sipoc-abc123-0',
      artifactType: 'sipoc',
      artifactSha256: 'abc123',
      proposed: '🟢',
      validated: '🟢',
      source: { artifactType: 'interview', sha256: 'def456' },
      validatedAt: new Date().toISOString(),
    }];

    await appendConfidenceLedger(root, entries);
    await appendConfidenceLedger(root, entries); // segunda chamada

    const raw = await fs.readFile(LEDGER(root), 'utf8');
    const lines = raw.trim().split('\n');
    assert.equal(lines.length, 1, 'ledger não deve duplicar entradas');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('P6: appendConfidenceLedger atualiza a linha quando o nível validado muda', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-upd-'));
  try {
    const base: Pick<ConfidenceLedgerEntry, 'claimId' | 'artifactType' | 'artifactSha256' | 'proposed' | 'source'> = {
      claimId: 'sipoc-abc123-0',
      artifactType: 'sipoc',
      artifactSha256: 'abc123',
      proposed: '🟢',
      source: { artifactType: 'interview', sha256: 'def456' },
    };

    // Commit 1: 🟡 (unresolved-source).
    await appendConfidenceLedger(root, [{ ...base, validated: '🟡', degradationReason: 'unresolved-source', validatedAt: new Date().toISOString() }]);
    // Commit 2 (mesma chave): nível mudou p/ 🟢 → deve SUBSTITUIR, não duplicar.
    await appendConfidenceLedger(root, [{ ...base, validated: '🟢', validatedAt: new Date().toISOString() }]);

    const raw = await fs.readFile(LEDGER(root), 'utf8');
    const lines = raw.trim().split('\n');
    assert.equal(lines.length, 1, 'mesma chave → atualiza a linha, não duplica');
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.validated, '🟢');
    assert.equal(parsed.degradationReason, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('buildLedgerEntries gera claimIds determinísticos', () => {
  const claims: Claim[] = [
    { statement: 'A', level: '🟢', source: { artifactType: 'int', sha256: 'src' }, reasoning: 'ok' },
    { statement: 'B', level: '🟡', reasoning: 'inferido' },
    { statement: 'C', level: '🔴', reasoning: 'gap' },
  ];

  const validated: ValidatedClaim[] = [
    { proposed: '🟢', validated: '🟢' },
    { proposed: '🟡', validated: '🟡' },
    { proposed: '🔴', validated: '🔴' },
  ];

  const entries = buildLedgerEntries(claims, validated, 'sipoc', 'abc123');
  assert.equal(entries.length, 3);
  assert.equal(entries[0].claimId, 'sipoc-abc123-0');
  assert.equal(entries[1].claimId, 'sipoc-abc123-1');
  assert.equal(entries[2].claimId, 'sipoc-abc123-2');
  // Mesmo input → mesma saída (determinístico)
  const entries2 = buildLedgerEntries(claims, validated, 'sipoc', 'abc123');
  assert.deepEqual(entries.map((e) => e.claimId), entries2.map((e) => e.claimId));
});

test('buildLedgerEntries inclui degradationReason quando presente', () => {
  const claims: Claim[] = [{
    statement: 'Ghost',
    level: '🟢',
    source: { artifactType: 'sipoc', sha256: 'ghost' },
    reasoning: '???',
  }];
  const validated: ValidatedClaim[] = [{
    proposed: '🟢',
    validated: '🟡',
    degradationReason: 'unresolved-source',
  }];

  const entries = buildLedgerEntries(claims, validated, 'sipoc', 'abc');
  assert.equal(entries[0].degradationReason, 'unresolved-source');
  assert.equal(entries[0].proposed, '🟢');
  assert.equal(entries[0].validated, '🟡');
});

// ---- Integração commit + confidence (AC1, AC3, AC4, AC6) ----

test('AC6: payload sem claims → commit OK, sem ledger', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-noclaim-'));
  try {
    const payload: ProposePayload = {
      artifactType: 'sipoc',
      content: { body: 'SIPOC', suppliers: ['A'] },
    };

    const result = await commit(payload, { root, agent: 'bento' });
    assert.ok(result.sha256);
    assert.ok(result.artifactPath);

    // Ledger NÃO deve existir
    const files = await listFiles(path.join(root, '.process-ai'));
    const ledgerFiles = files.filter((f) => f.includes('confidence-ledger'));
    assert.equal(ledgerFiles.length, 0, 'ledger não deve existir para payload sem claims');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC6: payload com claims vazio → commit OK, sem ledger', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-emptyc-'));
  try {
    const payload: ProposePayload = {
      artifactType: 'sipoc',
      content: { body: 'data test' },
      claims: [],
    };

    const result = await commit(payload, { root, agent: 'bento' });
    assert.ok(result.sha256);

    const files = await listFiles(path.join(root, '.process-ai'));
    const ledgerFiles = files.filter((f) => f.includes('confidence-ledger'));
    assert.equal(ledgerFiles.length, 0, 'ledger não deve existir para claims vazio');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC1+AC3: commit com claims válidos → artefato + ledger gravados', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-ok-'));
  try {
    const sourceSha = sha256(canonicalize({ data: 'entrevista real' }));
    await createManifest(root, 'interview', sourceSha);

    const payload: ProposePayload = {
      artifactType: 'sipoc',
      content: { body: 'SIPOC', suppliers: ['A', 'B'] },
      claims: [
        {
          statement: 'Fornecedores A e B confirmados',
          level: '🟢',
          source: { artifactType: 'interview', sha256: sourceSha },
          reasoning: 'Entrevista confirmou',
        },
        {
          statement: 'Cliente típico é PME',
          level: '🟡',
          reasoning: 'Inferido do contexto',
        },
      ],
    };

    const result = await commit(payload, { root, agent: 'bento' });
    assert.ok(result.sha256);

    // Ledger deve existir com 2 entradas
    const ledgerRaw = await fs.readFile(LEDGER(root), 'utf8');
    const lines = ledgerRaw.trim().split('\n');
    assert.equal(lines.length, 2);

    const e0 = JSON.parse(lines[0]);
    assert.equal(e0.validated, '🟢');
    assert.equal(e0.artifactType, 'sipoc');
    assert.equal(e0.artifactSha256, result.sha256);
    assert.equal(e0.claimId, `sipoc-${result.sha256}-0`);

    const e1 = JSON.parse(lines[1]);
    assert.equal(e1.validated, '🟡');
    assert.equal(e1.degradationReason, undefined);

    // Manifesto + artefato devem existir (result.artifactPath é a fonte de verdade do nome;
    // desde os "nomes legíveis" o arquivo é <slug>--<hash12>.md, não <sha64>.md).
    await fs.access(result.artifactPath);
    await fs.access(path.join(root, '.process-ai', 'manifests', `sipoc-${result.sha256}.json`));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC1: commit com 🟢 ghost → commit OK (degradado), ledger mostra degradação', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-ghost2-'));
  try {
    const payload: ProposePayload = {
      artifactType: 'sipoc',
      content: { body: 'data test' },
      claims: [
        {
          statement: 'Afirmação com fonte fantasma',
          level: '🟢',
          source: { artifactType: 'interview', sha256: GHOST_SHA },
          reasoning: 'Erro',
        },
      ],
    };

    const result = await commit(payload, { root, agent: 'bento' });
    assert.ok(result.sha256);

    // Commit deve ter sucesso (degradação, não rejeição)
    const ledgerRaw = await fs.readFile(LEDGER(root), 'utf8');
    const entry = JSON.parse(ledgerRaw.trim().split('\n')[0]);
    assert.equal(entry.proposed, '🟢');
    assert.equal(entry.validated, '🟡');
    assert.equal(entry.degradationReason, 'unresolved-source');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC4+P8: commit com nível inválido → CommitError, aborta antes de qualquer escrita', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-abort-'));
  try {
    const payload: ProposePayload = {
      artifactType: 'sipoc',
      content: { body: 'data test' },
      claims: [
        {
          statement: 'Nível inválido',
          level: 'blue' as unknown as '🟢',
          reasoning: '',
        },
      ],
    };

    // P8: commit() wrappa ConfidenceError → CommitError no boundary (contrato 1.2 / AC4).
    await assert.rejects(
      () => commit(payload, { root, agent: 'bento' }),
      CommitError,
    );

    // P4: NENHUM side-effect — zero artefato/manifesto/provenance/ledger (abort-before-write).
    const files = await listFiles(root);
    const sideEffects = files.filter(
      (f) =>
        f.startsWith('_process-ai_output/') ||
        f.startsWith('.process-ai/manifests/') ||
        f.startsWith('.process-ai/provenance.jsonl') ||
        f.startsWith('.process-ai/confidence-ledger.jsonl'),
    );
    assert.deepEqual(sideEffects, [], 'zero artefatos/manifestos/provenance/ledger — abort-before-write');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('P6: re-validação atualiza a linha do ledger quando a base de source muda', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-revalidate-'));
  try {
    const sourceSha = sha256(canonicalize({ data: 'fonte-real' }));
    const payload: ProposePayload = {
      artifactType: 'sipoc',
      content: { body: 'SIPOC', suppliers: ['A'] },
      claims: [
        {
          statement: 'Confirmado pela entrevista',
          level: '🟢',
          source: { artifactType: 'interview', sha256: sourceSha },
          reasoning: 'Entrevista',
        },
      ],
    };

    // Commit 1: source ainda NÃO existe → degrada a 🟡 (unresolved-source).
    await commit(payload, { root, agent: 'bento' });
    let lines = (await fs.readFile(LEDGER(root), 'utf8')).trim().split('\n');
    assert.equal(lines.length, 1);
    let entry = JSON.parse(lines[0]);
    assert.equal(entry.validated, '🟡');
    assert.equal(entry.degradationReason, 'unresolved-source');

    // A source passa a existir (manifesto criado entre commits) — re-commit do MESMO payload.
    await createManifest(root, 'interview', sourceSha);
    await commit(payload, { root, agent: 'bento' });

    // Ledger atualizado: mesma claimId/artifactSha256, nível agora 🟢 — 1 linha (não 2).
    lines = (await fs.readFile(LEDGER(root), 'utf8')).trim().split('\n');
    assert.equal(lines.length, 1, 'ledger não deve duplicar — atualiza a linha existente');
    entry = JSON.parse(lines[0]);
    assert.equal(entry.validated, '🟢');
    assert.equal(entry.degradationReason, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- T3 (2.5) — AC4: statement + reasoning persistidos no ledger ----

test('AC4/2.5: buildLedgerEntries persiste statement + reasoning', () => {
  const claims: Claim[] = [
    {
      statement: 'O processo tem 3 etapas bem definidas',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: 'a'.repeat(64) },
      reasoning: 'Confirmado na entrevista com o dono e revisado no SIPOC',
    },
    {
      statement: 'Provavelmente há um gargalo na expedição',
      level: '🟡',
      reasoning: 'Inferido do tempo médio relatado',
    },
  ];

  const validated: ValidatedClaim[] = [
    { proposed: '🟢', validated: '🟢' },
    { proposed: '🟡', validated: '🟡' },
  ];

  const entries = buildLedgerEntries(claims, validated, 'value-chain', 'b'.repeat(64));
  assert.equal(entries.length, 2);

  // Entry 0: 🟢 com source → statement + reasoning presentes
  assert.equal(entries[0].statement, 'O processo tem 3 etapas bem definidas');
  assert.equal(entries[0].reasoning, 'Confirmado na entrevista com o dono e revisado no SIPOC');
  assert.equal(entries[0].source?.artifactType, 'sipoc');

  // Entry 1: 🟡 sem source → statement + reasoning presentes
  assert.equal(entries[1].statement, 'Provavelmente há um gargalo na expedição');
  assert.equal(entries[1].reasoning, 'Inferido do tempo médio relatado');
  assert.equal(entries[1].source, undefined);
});

test('AC4/2.5: round-trip statement/reasoning via buildLedgerEntries → append → parse on-disk', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-rt-'));
  try {
    const stmt = 'Fornecedor principal entrega em 48h';
    const reason = 'Relatado pelo dono na entrevista e confirmado no SIPOC';

    const entries: ConfidenceLedgerEntry[] = [{
      claimId: 'sipoc-abc123-0',
      artifactType: 'sipoc',
      artifactSha256: 'abc123',
      proposed: '🟢',
      validated: '🟢',
      source: { artifactType: 'interview', sha256: 'def456' },
      validatedAt: new Date().toISOString(),
      statement: stmt,
      reasoning: reason,
    }];

    await appendConfidenceLedger(root, entries);

    const raw = await fs.readFile(LEDGER(root), 'utf8');
    const parsed = JSON.parse(raw.trim().split('\n')[0]);
    assert.equal(parsed.statement, stmt);
    assert.equal(parsed.reasoning, reason);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC4/2.5: backward-compat — ledger legado sem statement/reasoning → leitores toleram', () => {
  // Simula uma linha de ledger da 1.4 (sem statement/reasoning).
  const legacy = JSON.stringify({
    claimId: 'sipoc-old-0',
    artifactType: 'sipoc',
    artifactSha256: 'oldsha',
    proposed: '🟢',
    validated: '🟡',
    degradationReason: 'unresolved-source',
    validatedAt: '2026-01-01T00:00:00.000Z',
  });

  const parsed = JSON.parse(legacy) as ConfidenceLedgerEntry;
  // Campos ausentes → undefined, leitores defensivos usam ?? ''
  assert.equal(parsed.statement, undefined);
  assert.equal(parsed.reasoning, undefined);
  // Campos existentes preservados
  assert.equal(parsed.claimId, 'sipoc-old-0');
  assert.equal(parsed.validated, '🟡');
});

// ---- T3 (2.5) — AC1: excerpt verification (passo 4b) ----

test('AC1/2.5: 🟢 com excerpt que CASA no artefato-fonte → 🟢 mantido', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-exc-ok-'));
  try {
    const content = 'O processo de vendas tem 3 etapas: prospecção, qualificação e fechamento.';
    const sourceSha = sha256(canonicalize({ data: 'excerpt-source' }));
    await createArtifactWithManifest(root, 'sipoc', sourceSha, content);

    const claims: Claim[] = [{
      statement: 'Vendas tem 3 etapas',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: sourceSha, excerpt: 'prospecção, qualificação e fechamento' },
      reasoning: 'Trecho exato do SIPOC',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].validated, '🟢');
    assert.equal(result[0].degradationReason, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC1/2.5 (F6): excerpt com divergência CRLF(artefato) vs LF(excerpt) → 🟢 (canonicalização de line-endings)', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-exc-crlf-'));
  try {
    // Artefato-fonte salvo com CRLF (Windows); excerpt copiado com LF.
    const content = 'O processo de vendas tem 3 etapas:\r\nprospecção, qualificação e fechamento.';
    const sourceSha = sha256(canonicalize({ data: 'excerpt-crlf' }));
    await createArtifactWithManifest(root, 'sipoc', sourceSha, content);

    const claims: Claim[] = [{
      statement: 'Vendas tem 3 etapas',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: sourceSha, excerpt: '3 etapas:\nprospecção, qualificação' },
      reasoning: 'Trecho com LF contra artefato CRLF',
    }];

    const result = await validateClaims(claims, root);
    // Sem canonicalização, o includes falharia (CRLF ≠ LF) → falso 🟡 excerpt-mismatch.
    assert.equal(result[0].validated, '🟢');
    assert.equal(result[0].degradationReason, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC1/2.5: 🟢 com excerpt que NÃO casa → 🟡 + excerpt-mismatch', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-exc-mis-'));
  try {
    const content = 'O processo de vendas tem 3 etapas: prospecção, qualificação e fechamento.';
    const sourceSha = sha256(canonicalize({ data: 'excerpt-mismatch' }));
    await createArtifactWithManifest(root, 'sipoc', sourceSha, content);

    const claims: Claim[] = [{
      statement: 'Vendas tem 4 etapas',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: sourceSha, excerpt: 'quatro etapas no total' },
      reasoning: 'Afirmação que contradiz a fonte',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].proposed, '🟢');
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'excerpt-mismatch');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC1/2.5: 🟢 sem excerpt → 🟢 mantido (comportamento 1.4 preservado)', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-exc-none-'));
  try {
    const content = 'Dado irrelevante.';
    const sourceSha = sha256(canonicalize({ data: 'no-excerpt' }));
    await createArtifactWithManifest(root, 'sipoc', sourceSha, content);

    const claims: Claim[] = [{
      statement: 'Afirmação com fonte mas sem trecho',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: sourceSha },
      reasoning: 'Fonte genérica',
    }];

    const result = await validateClaims(claims, root);
    assert.equal(result[0].validated, '🟢');
    assert.equal(result[0].degradationReason, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC1/2.5: 🟢 com excerpt presente mas fonte unresolved → 🟡 + unresolved-source (precedência: passo 4 antes de 4b)', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-exc-prec-'));
  try {
    // NÃO criamos manifesto → fonte não resolve.
    const claims: Claim[] = [{
      statement: 'Afirmação com excerpt para fonte inexistente',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: GHOST_SHA, excerpt: 'algum trecho' },
      reasoning: 'Fonte fantasma',
    }];

    const result = await validateClaims(claims, root);
    // Passo 4 (source resolution) falha ANTES do passo 4b (excerpt) — precedência preservada.
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'unresolved-source');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC1/2.5: 🟢 com excerpt vazio (whitespace-only) → 🟢 (tratado como ausente, comportamento 1.4)', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-exc-ws-'));
  try {
    const content = 'Conteúdo real.';
    const sourceSha = sha256(canonicalize({ data: 'ws-excerpt' }));
    await createArtifactWithManifest(root, 'sipoc', sourceSha, content);

    const claims: Claim[] = [{
      statement: 'Afirmação com excerpt whitespace-only',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: sourceSha, excerpt: '   ' },
      reasoning: 'Agente deixou espaço',
    }];

    const result = await validateClaims(claims, root);
    // isNonEmptyString('   ') → false → pula passo 4b → 🟢 mantido.
    assert.equal(result[0].validated, '🟢');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC1/2.5: 🟢 com excerpt — artefato-fonte é symlink → 🟡 + excerpt-mismatch (leaf-symlink guard, deferred-work.md:63)', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'conf-exc-sym-'));
  try {
    const realContent = 'Conteúdo real do artefato.';
    const sourceSha = sha256(canonicalize({ data: 'symlink-excerpt' }));

    // Cria artefato real + symlink apontando para ele.
    const outputDir = path.join(root, '_process-ai_output', 'sipoc');
    await fs.mkdir(outputDir, { recursive: true });
    const realPath = path.join(outputDir, `real-${sourceSha}.md`);
    await fs.writeFile(realPath, realContent, 'utf8');
    const symlinkPath = path.join(outputDir, `${sourceSha}.md`);
    try {
      await fs.symlink(realPath, symlinkPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EPERM' || (e as NodeJS.ErrnoException).code === 'EEXIST') {
        return; // Windows sem Developer Mode — skip.
      }
      throw e;
    }

    const relPath = path.relative(root, symlinkPath).split(path.sep).join('/');
    await createManifest(root, 'sipoc', sourceSha, { artifactPath: relPath });

    const claims: Claim[] = [{
      statement: 'Afirmação com fonte symlink',
      level: '🟢',
      source: { artifactType: 'sipoc', sha256: sourceSha, excerpt: 'Conteúdo real' },
      reasoning: 'Symlink no artifactPath',
    }];

    const result = await validateClaims(claims, root);
    // Leaf-symlink guard: lstat vê symlink → isFile=false → não-verificável → 🟡 excerpt-mismatch.
    assert.equal(result[0].validated, '🟡');
    assert.equal(result[0].degradationReason, 'excerpt-mismatch');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
