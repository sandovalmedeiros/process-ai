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

// ---- helper: extrai o texto da seção `## N.` até a próxima heading `^## ` ----

/** Retorna a heading `## <n>.` + corpo até a próxima heading de nível 2 (`^## `). */
function skillSection(md: string, n: number): string {
  const startMatch = new RegExp(`^## ${n}\\.`, 'm').exec(md);
  if (!startMatch) return '';
  const lines = md.slice(startMatch.index).split('\n');
  const body: string[] = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break; // próxima heading de nível 2
    body.push(lines[i]);
  }
  return body.join('\n');
}

// ---- 2.6: Gates informativos (AC1, AC4) ----

test('AC1/2.6: §3 menciona `process-ai report` ANTES de `process-ai gate` (gate informativo)', async () => {
  const sec3 = skillSection(await fs.readFile(SOURCE_SKILL_MD, 'utf8'), 3);
  assert.ok(sec3.length > 0, '§3 deve existir no SKILL.md');
  assert.ok(/process-ai report/.test(sec3), '§3 deve referenciar `process-ai report` no gate informativo');
  assert.ok(/process-ai gate/.test(sec3), '§3 deve referenciar `process-ai gate`');
  // Ordering: o gate informativo roda `report` ANTES de registrar a decisão via `gate`.
  assert.ok(
    sec3.indexOf('process-ai report') < sec3.indexOf('process-ai gate'),
    '§3 deve citar `process-ai report` antes de `process-ai gate`',
  );
});

test('AC1/2.6: §3 menciona os 3 caminhos de decisão do gate (approved / changes-requested / rejected)', async () => {
  const sec3 = skillSection(await fs.readFile(SOURCE_SKILL_MD, 'utf8'), 3);
  assert.ok(/changes-requested/.test(sec3), '§3 deve mencionar `changes-requested` (reabrir especialista)');
  assert.ok(/--decision rejected/.test(sec3), '§3 deve mencionar `--decision rejected` (encerrar fluxo)');
  assert.ok(/--decision approved/.test(sec3), '§3 deve mencionar `--decision approved` (avançar)');
});

test('AC1/2.6: §3 instrui a destacar 🟡 e 🔴 proativamente (honestidade NFR-1)', async () => {
  const sec3 = skillSection(await fs.readFile(SOURCE_SKILL_MD, 'utf8'), 3);
  assert.ok(/🟡/.test(sec3), '§3 deve mencionar 🟡 (inferidos) no gate informativo');
  assert.ok(/🔴/.test(sec3), '§3 deve mencionar 🔴 (gaps) no gate informativo');
});

test('AC1/2.6: §3 apresenta contagem + breakdown por artefato (FR-4 full)', async () => {
  const sec3 = skillSection(await fs.readFile(SOURCE_SKILL_MD, 'utf8'), 3);
  assert.ok(/breakdown por artefato/i.test(sec3), '§3 deve instruir o breakdown por artifactType no gate');
});

test('AC4/2.6: §3 explicita bloqueio — estágio só avança após approved; changes-requested reabre especialista', async () => {
  const sec3 = skillSection(await fs.readFile(SOURCE_SKILL_MD, 'utf8'), 3);
  assert.ok(/n[aã]o avança/.test(sec3), '§3 deve dizer que o estágio NÃO avança sem approved');
  assert.ok(/reabr[ai]|reabre|reabrir/.test(sec3), '§3 deve instruir changes-requested → reabrir especialista atual');
});

test('AC5/2.6: §3 trata zero honesto (não infla quando não há claims)', async () => {
  const sec3 = skillSection(await fs.readFile(SOURCE_SKILL_MD, 'utf8'), 3);
  assert.ok(/zerado|zero claims|nenhuma afirma/i.test(sec3), '§3 deve tratar o caso de zero claims (zero honesto)');
});

// ---- 2.6: Resumo final rico (AC2, AC3) ----

test('AC2/2.6: §4 menciona resumo narrativo por etapa + próximos passos acionáveis', async () => {
  const sec4 = skillSection(await fs.readFile(SOURCE_SKILL_MD, 'utf8'), 4);
  assert.ok(
    /\bpr[oó]ximos?\s+passos\b/i.test(sec4),
    '§4 deve mencionar próximos passos acionáveis',
  );
  assert.ok(
    /por etapa|1 parágrafo por estágio|discovery.*mapping.*modeling.*standardization/s.test(sec4),
    '§4 deve instruir resumo narrativo por etapa (discovery→mapping→modeling→standardization)',
  );
});

test('AC2/2.6: §4 sugere ações concretas atreladas a gaps (nunca genérico)', async () => {
  const sec4 = skillSection(await fs.readFile(SOURCE_SKILL_MD, 'utf8'), 4);
  assert.ok(
    /a[çc][ãa]o sugerida|a[çc][õo]es\s+concretas/i.test(sec4),
    '§4 deve instruir ações sugeridas concretas',
  );
  assert.ok(
    /nunca\b.*\bgen[ée]rico|n[aã]o\s+gen[ée]rico|evite\s+gen[ée]rico/i.test(sec4),
    '§4 deve proibir recomendações genéricas',
  );
});

test('AC2/2.6: §4 inclui o gate-0 no resumo das decisões dos gates', async () => {
  const sec4 = skillSection(await fs.readFile(SOURCE_SKILL_MD, 'utf8'), 4);
  assert.ok(/gate-0/.test(sec4), '§4 deve incluir gate-0 (escopo) no resumo das decisões dos gates');
});

test('AC3/2.6: contrato markdown preservado — `process-ai report` verbatim no `summary-report`', async () => {
  const sec4 = skillSection(await fs.readFile(SOURCE_SKILL_MD, 'utf8'), 4);
  assert.ok(/summary-report/.test(sec4), '§4 deve referenciar artifactType summary-report');
  assert.ok(/process-ai propose/.test(sec4), '§4 deve instruir propose do summary-report');
  assert.ok(
    /verbatim|n[aã]o reescreva|n[aã]o resuma|n[aã]o reformate|[ií]ntegro|contrato duro/i.test(sec4),
    '§4 deve instruir a Déa a NÃO reescrever o relatório (verbatim)',
  );
});

test('AC3/2.6: §4 instrui escaping JSON completo (inclui backslashes, não só aspas/newlines)', async () => {
  const sec4 = skillSection(await fs.readFile(SOURCE_SKILL_MD, 'utf8'), 4);
  assert.ok(
    /backslash/i.test(sec4),
    '§4 deve instruir escaping de backslashes (\\\\) no JSON — o relatório verbatim já contém backslashes do escapeMd',
  );
});

// ---- 2.6: deferred-work.md:96 — "rascunho" removido ----

test('deferred-work.md:96: §3 não contém "rascunho" (especialistas são profundos desde 2.1–2.4)', async () => {
  const sec3 = skillSection(await fs.readFile(SOURCE_SKILL_MD, 'utf8'), 3);
  assert.ok(
    !/rascunho/.test(sec3),
    '§3 não deve conter "rascunho" — todos os especialistas são profundos (2.1–2.4)',
  );
});
