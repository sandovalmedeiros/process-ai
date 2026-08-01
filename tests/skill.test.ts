/**
 * tests/skill.test.ts — Skill condutora Déa (AC1, AC2, AC3, AC5, AC6, AD-1).
 *
 * A skill-fonte (skills/process-ai/SKILL.md) é a ÚNICA fonte de verdade: o
 * ClaudeCodeAdapter a copia byte-a-byte para o alvo. Aqui validamos que a skill
 * carrega o condutor COMPLETO (substitui o stub 1.1): abertura, entry/resume,
 * Gate 0, pipeline + gates, encerramento — e que o agente é instruído a usar o
 * CLI `process-ai` (sem escrita direta nas pastas protegidas — AD-1).
 *
 * Não-regressão 1.1: frontmatter `name: process-ai` preservado (é o que torna
 * `/process-ai` slash-invocável) e cópia byte-a-byte via installSkills.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ClaudeCodeAdapter } from '../toolkit/adapters/claude-code/adapter.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_SKILL_MD = path.join(REPO_ROOT, 'skills', 'process-ai', 'SKILL.md');

test('AC1: skill-fonte preserva o frontmatter name: process-ai (não-regressão 1.1)', async () => {
  const content = await fs.readFile(SOURCE_SKILL_MD, 'utf8');
  assert.match(
    content,
    /^---[\s\S]*?^name:\s*process-ai\s*$/m,
    'frontmatter deve conter name: process-ai (torna /process-ai slash-invocável)',
  );
  assert.match(content, /^---[\s\S]*?^description:\s*\S/m, 'frontmatter deve conter description não-vazia');
});

test('AC2: skill-fonte contém Gate 0 (escopo antes de qualquer descoberta)', async () => {
  const content = await fs.readFile(SOURCE_SKILL_MD, 'utf8');
  assert.ok(/Gate 0/.test(content), 'deve mencionar Gate 0');
  assert.ok(/gate-0/.test(content), 'deve referenciar gate-0 no CLI');
});

test('AC3: skill-fonte declara a pipeline fixa com os 4 slots de especialista + gates 1–4', async () => {
  const content = await fs.readFile(SOURCE_SKILL_MD, 'utf8');
  // Slots canônicos (Bento/Miguel/Júlia/Zanoni) — em 1.5 são handoffs declarados.
  for (const slot of ['Bento', 'Miguel', 'Júlia', 'Zanoni']) {
    assert.ok(content.includes(slot), `pipeline deve declarar o slot ${slot}`);
  }
  // Gates 1–4 (um por especialista).
  for (const g of ['gate-1', 'gate-2', 'gate-3', 'gate-4']) {
    assert.ok(content.includes(g), `pipeline deve referenciar ${g}`);
  }
});

test('AC5: skill-fonte instrui resume no início (retomar sessão em andamento)', async () => {
  const content = await fs.readFile(SOURCE_SKILL_MD, 'utf8');
  assert.ok(/process-ai resume/.test(content), 'deve instruir `process-ai resume` no início');
});

test('AC6: skill-fonte instrui encerramento com relatório de confiança + propose do resumo', async () => {
  const content = await fs.readFile(SOURCE_SKILL_MD, 'utf8');
  assert.ok(/process-ai report/.test(content), 'deve instruir `process-ai report` no encerramento');
  assert.ok(/process-ai propose/.test(content), 'deve instruir `process-ai propose` para commitar o entregável');
  assert.ok(/summary-report/.test(content), 'deve usar artifactType summary-report no encerramento');
});

test('AC1: skill-fonte abre perguntando o processo a mapear', async () => {
  const content = await fs.readFile(SOURCE_SKILL_MD, 'utf8');
  assert.ok(/Qual processo vamos mapear/.test(content), 'a Déa deve abrir perguntando o processo');
});

test('AD-1: skill-fonte instrui o agente a usar o CLI (sem escrita direta nas pastas protegidas)', async () => {
  const content = await fs.readFile(SOURCE_SKILL_MD, 'utf8');
  // O condutor usa o canal CLI para gate/stage/propose/report/resume.
  for (const cmd of ['process-ai gate', 'process-ai stage', 'process-ai propose']) {
    assert.ok(content.includes(cmd), `skill deve instruir o uso do canal \`${cmd}\``);
  }
  // AD-1 enforcement estrutural: declara que a skill NÃO escreve direto.
  assert.ok(
    /n[ãa]o escrev|nunca escrev|sem escrita direta/i.test(content),
    'skill deve declarar que NÃO escreve diretamente nas pastas protegidas (AD-1)',
  );
});

test('Fonte única de verdade: installSkills copia a skill-fonte byte-a-byte para o alvo', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-skill-'));
  try {
    const adapter = new ClaudeCodeAdapter();
    await adapter.installSkills(tmp);

    const installedPath = path.join(tmp, '.claude', 'skills', 'process-ai', 'SKILL.md');
    const installed = await fs.readFile(installedPath, 'utf8');
    const source = await fs.readFile(SOURCE_SKILL_MD, 'utf8');
    assert.equal(installed, source, 'SKILL.md no alvo deve ser byte-a-byte igual à skill-fonte');

    // O condutor completo (não o stub 1.1) está instalado: contém Gate 0 + pipeline.
    assert.ok(/Gate 0/.test(installed), 'skill instalada deve conter o condutor (Gate 0)');
    assert.ok(!/Stub \(story 1\.1\)/.test(installed), 'o stub da 1.1 foi substituído pelo condutor completo');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
