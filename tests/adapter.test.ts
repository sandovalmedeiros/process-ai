/**
 * tests/adapter.test.ts — ClaudeCodeAdapter (AC2, AC4, AC5).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ClaudeCodeAdapter } from '../toolkit/adapters/claude-code/adapter.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_SKILL_MD = path.join(REPO_ROOT, 'skills', 'process-ai', 'SKILL.md');

test('AC2: installSkills escreve .claude/skills/process-ai/SKILL.md com frontmatter name válido', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-adapter-'));
  try {
    const adapter = new ClaudeCodeAdapter();
    await adapter.installSkills(tmp);

    const skillFile = path.join(tmp, '.claude', 'skills', 'process-ai', 'SKILL.md');
    const stat = await fs.stat(skillFile);
    assert.ok(stat.isFile(), 'SKILL.md deve existir no alvo após installSkills');

    const content = await fs.readFile(skillFile, 'utf8');
    assert.match(
      content,
      /^---[\s\S]*?^name:\s*process-ai\s*$/m,
      'frontmatter deve conter name: process-ai',
    );
    assert.match(
      content,
      /^---[\s\S]*?^description:\s*\S/m,
      'frontmatter deve conter description não-vazia',
    );

    // Fonte única de verdade: o conteúdo no alvo é byte-a-byte igual à skill-fonte do framework.
    const source = await fs.readFile(SOURCE_SKILL_MD, 'utf8');
    assert.equal(
      content,
      source,
      'SKILL.md no alvo deve ser idêntico à skill-fonte do framework (skills/process-ai/SKILL.md)',
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC4: propose() é pass-through e delega ao commit (CommitResult, sem mutação)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-prop-'));
  try {
    // cwd injetado => o commit escreve em tmp, não no repositório do framework.
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });
    const payload = {
      artifactType: 'sipoc',
      content: { body: 'SIPOC de teste', suppliers: ['Fornecedor A'], outputs: ['x', 'y'] },
      claims: [{
        statement: 'Fornecedor A confirmado',
        level: '🟡' as const,
        reasoning: 'Inferido de indícios na entrevista',
      }],
    };
    const snapshot = structuredClone(payload);

    const result = await adapter.propose(payload);

    // (a) payload não mutado (deep-equal ao snapshot pré-chamada) — pass-through (AD-3)
    assert.deepEqual(payload, snapshot, 'payload não deve ser mutado pelo adapter/commit');
    // (b) resultado é um CommitResult com sha256, escrito sob o cwd injetado
    assert.equal(typeof result.sha256, 'string');
    assert.ok(result.sha256.length > 0, 'CommitResult.sha256 deve estar presente');
    // P12: CommitResult paths usam `/` — normaliza ambos os lados para comparação
    const norm = (p: string) => p.replace(/\\/g, '/');
    assert.ok(
      norm(result.artifactPath).startsWith(norm(tmp)),
      'artifactPath deve estar sob o cwd injetado (não no repo do framework)',
    );
    // (c) conteúdo lido de _process-ai_output/ é deep-equal ao payload.content
    // P12: fs.readFile aceita paths com `/` no Windows
    const committed = JSON.parse(await fs.readFile(result.artifactPath, 'utf8'));
    assert.deepEqual(committed, payload.content, 'conteúdo commitado deve igualar payload.content');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC5: registerSlashCommands (no-op) não cria nada no alvo', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-reg-'));
  try {
    const adapter = new ClaudeCodeAdapter();
    await adapter.registerSlashCommands(tmp);
    const entries = await fs.readdir(tmp);
    assert.deepEqual(entries, [], 'registerSlashCommands não deve criar nada no alvo');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- CR-hardening (code review da story 1.1) ----

test('CR item 1: installSkills recusa target inexistente (erro acionável, não árvore dispersa)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-ne-'));
  try {
    const ghost = path.join(tmp, 'subdir-inexistente');
    const adapter = new ClaudeCodeAdapter();
    await assert.rejects(
      () => adapter.installSkills(ghost),
      /Diretório-alvo não existe/,
    );
    // Nada foi criado (sem árvore dispersa).
    const remaining = await fs.readdir(tmp);
    assert.deepEqual(remaining, [], 'nenhuma árvore deve ser materializada para um target inexistente');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('CR item 1: installSkills recusa arquivo como target (não-diretório, evita ENOTDIR opaco)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-file-'));
  try {
    const fileTarget = path.join(tmp, 'arquivo.txt');
    await fs.writeFile(fileTarget, 'x');
    const adapter = new ClaudeCodeAdapter();
    await assert.rejects(
      () => adapter.installSkills(fileTarget),
      /não é um diretório/,
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('CR item 2: installSkills recusa symlink no destino do SKILL.md (não escapa de .claude/)', async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-sym-'));
  try {
    // Pré-cria a árvore e um symlink SKILL.md -> arquivo fora da pasta da skill.
    const skillDir = path.join(tmp, '.claude', 'skills', 'process-ai');
    await fs.mkdir(skillDir, { recursive: true });
    const outsideFile = path.join(tmp, 'outside-target.md');
    await fs.writeFile(outsideFile, 'segredo');
    const skillFile = path.join(skillDir, 'SKILL.md');
    try {
      await fs.symlink(outsideFile, skillFile);
    } catch (e) {
      // Windows sem privilégio de symlink (Developer Mode/admin): SKIP explícito
      // (CR R2#3) — `return` vazio faria node:test marcar como PASS sem asserção.
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES') {
        return t.skip('symlinks requerem Developer Mode/admin no Windows');
      }
      throw e;
    }
    const adapter = new ClaudeCodeAdapter();
    await assert.rejects(
      () => adapter.installSkills(tmp),
      /symlink/,
    );
    // O alvo do symlink não foi sobrescrito.
    const outside = await fs.readFile(outsideFile, 'utf8');
    assert.equal(outside, 'segredo', 'o symlink não deve ter sido seguido/escrito');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('CR R2#1: installSkills recusa parent-symlink no caminho de .claude/ (walk, não segue)', async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-psym-'));
  try {
    // Pré-cria um symlink .claude -> diretório FORA do escopo do alvo.
    const outsideDir = path.join(tmp, 'outside-claude');
    await fs.mkdir(outsideDir, { recursive: true });
    const claudeLink = path.join(tmp, '.claude');
    try {
      await fs.symlink(outsideDir, claudeLink);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES') {
        return t.skip('symlinks requerem Developer Mode/admin no Windows');
      }
      throw e;
    }
    const adapter = new ClaudeCodeAdapter();
    await assert.rejects(
      () => adapter.installSkills(tmp),
      /componente do caminho é um symlink/i,
    );
    // O walk recusou antes de qualquer escrita: nada no destino do symlink (fora do escopo).
    const outsideEntries = await fs.readdir(outsideDir);
    assert.deepEqual(outsideEntries, [], 'parent-symlink não deve ser seguido (nada escrito fora do escopo)');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- P16: code-review patch test gaps (adapter) ----

// P9: cwd e agent vazios rejeitados no construtor
test('P9: construtor rejeita cwd vazio', () => {
  assert.throws(
    () => new ClaudeCodeAdapter({ cwd: '' }),
    /cwd não pode ser string vazia/i,
  );
});

test('P9: construtor rejeita agent vazio', () => {
  assert.throws(
    () => new ClaudeCodeAdapter({ agent: '' }),
    /agent não pode ser string vazia/i,
  );
});

test('P9: construtor aceita cwd e agent válidos', () => {
  const a = new ClaudeCodeAdapter({ cwd: '/tmp/test', agent: 'bento' });
  assert.ok(a instanceof ClaudeCodeAdapter);
});

// P12: CommitResult paths normalizados com `/`
test('P12: CommitResult.artifactPath e manifestPath usam `/` (não path.sep do OS)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-p12-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });
    const result = await adapter.propose({ artifactType: 'sipoc', content: { body: '' } });
    assert.ok(!result.artifactPath.includes('\\'), 'artifactPath não deve conter backslash');
    assert.ok(!result.manifestPath.includes('\\'), 'manifestPath não deve conter backslash');
    assert.ok(result.artifactPath.includes('/'), 'artifactPath deve usar forward slash');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
