/**
 * tests/specialists.test.ts — Skills dos especialistas (AC1, AC2, AC3, AC4, AC5, AD-1).
 *
 * As 4 skills-fonte (skills/process-ai-{bento,miguel,julia,zanoni}/SKILL.md) são fontes
 * únicas de verdade: o ClaudeCodeAdapter as copia byte-a-byte para o alvo (T2). Aqui
 * validamos que cada skill carrega a condução mínima do especialista — persona, propose
 * com claims (marcadores 🟢🟡🔴), threading de sha256 para provenance, e o invariante
 * AD-1 (sem escrita direta nas pastas protegidas).
 *
 * Os testes de *instalação* (installSkills instala as 5 skills byte-a-byte) vivem no
 * final deste arquivo e em tests/adapter.test.ts — exigem a T2 (generalização do
 * installSkills).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ClaudeCodeAdapter, discoverSourceSkills } from '../toolkit/adapters/claude-code/adapter.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/** Os 4 especialistas: skill-dir name, artifactType(s) canônicos, persona. */
const SPECIALISTS = [
  { skill: 'process-ai-bento', persona: 'Bento', types: ['discovery-interview', 'sipoc', 'value-chain'] },
  { skill: 'process-ai-miguel', persona: 'Miguel', types: ['hierarchy'] },
  { skill: 'process-ai-julia', persona: 'Júlia', types: ['flow'] },
  { skill: 'process-ai-zanoni', persona: 'Zanoni', types: ['pop'] },
] as const;

function sourceSkillPath(skillName: string): string {
  return path.join(REPO_ROOT, 'skills', skillName, 'SKILL.md');
}

// ---- Conteúdo da skill-fonte (AC2–AC5) ----

test('AC1: cada especialista tem uma skill-fonte skills/<skill>/SKILL.md', async () => {
  for (const s of SPECIALISTS) {
    const p = sourceSkillPath(s.skill);
    const st = await fs.stat(p);
    assert.ok(st.isFile(), `esperado arquivo: ${p}`);
  }
});

for (const s of SPECIALISTS) {
  test(`AC2–AC5: skill ${s.skill} tem frontmatter name + description + persona ${s.persona}`, async () => {
    const content = await fs.readFile(sourceSkillPath(s.skill), 'utf8');
    // frontmatter name (= slash-invocável /process-ai-<x>).
    assert.match(
      content,
      new RegExp(`^---[\\s\\S]*?^name:\\s*${s.skill}\\s*$`, 'm'),
      `frontmatter deve conter name: ${s.skill}`,
    );
    assert.match(content, /^---[\s\S]*?^description:\s*\S/m, 'frontmatter deve conter description não-vazia');
    // persona nomeada.
    assert.ok(content.includes(s.persona), `skill deve nomear a persona ${s.persona}`);
    // idioma pt-BR.
    assert.ok(/pt-BR/.test(content), 'skill deve declarar idioma pt-BR');
  });

  test(`AD-1/AC2: skill ${s.skill} instrui propose com claims + marcadores + sem escrita direta`, async () => {
    const content = await fs.readFile(sourceSkillPath(s.skill), 'utf8');
    // canal propose (CLI — sem escrita direta).
    assert.ok(content.includes('process-ai propose'), 'deve instruir `process-ai propose`');
    // claims com marcadores 🟢🟡🔴 (AD-5/FR-14).
    assert.ok(/claims/.test(content), 'deve mencionar o campo claims');
    for (const marker of ['🟢', '🟡', '🔴']) {
      assert.ok(content.includes(marker), `deve mencionar o marcador ${marker}`);
    }
    // AD-1 estrutural: declara que NÃO escreve direto nas pastas protegidas.
    assert.ok(
      /sem escrita direta/i.test(content),
      'skill deve declarar sem escrita direta nas pastas protegidas (AD-1)',
    );
    // artifactType(s) canônico(s).
    for (const t of s.types) {
      assert.ok(content.includes(t), `deve referenciar o artifactType "${t}"`);
    }
  });
}

// ---- Instalação (AC1, AD-7) — exige T2 (installSkills generalizado) ----

test('AC1: installSkills instala as 5 skills (condutor + 4 especialistas) byte-a-byte', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-spec-install-'));
  try {
    const adapter = new ClaudeCodeAdapter();
    await adapter.installSkills(tmp);

    const allSkills = ['process-ai', ...SPECIALISTS.map((s) => s.skill)];
    for (const skillName of allSkills) {
      const installedPath = path.join(tmp, '.claude', 'skills', skillName, 'SKILL.md');
      const installed = await fs.readFile(installedPath, 'utf8');
      const source = await fs.readFile(sourceSkillPath(skillName), 'utf8');
      assert.equal(installed, source, `SKILL.md de ${skillName} no alvo deve ser byte-a-byte igual à fonte`);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('discoverSourceSkills: descobre só dirs process-ai* com SKILL.md regular (pula ghost/arquivo/symlink/não-matching)', async () => {
  // Fixture tree (sourceDir simulado) exercitando TODOS os ramos do discovery:
  //   process-ai/SKILL.md          → válido (descoberto)
  //   process-ai-bento/SKILL.md    → válido (descoberto)
  //   process-ai-fantasma/         → dir sem SKILL.md (pulado — não aborta)
  //   process-ai-backup            → ARQUIVO solto que casa o padrão (pulado — fecha ENOTDIR)
  //   other-skill/SKILL.md         → não casa o padrão (pulado)
  //   process-ai-symlink/SKILL.md  → symlink p/ fora (rejeitado — defense-in-depth no source)
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-discover-'));
  try {
    await fs.mkdir(path.join(root, 'process-ai'), { recursive: true });
    await fs.writeFile(path.join(root, 'process-ai', 'SKILL.md'), '---\nname: process-ai\n---\n');
    await fs.mkdir(path.join(root, 'process-ai-bento'), { recursive: true });
    await fs.writeFile(path.join(root, 'process-ai-bento', 'SKILL.md'), '---\nname: process-ai-bento\n---\n');
    await fs.mkdir(path.join(root, 'process-ai-fantasma'), { recursive: true }); // sem SKILL.md
    await fs.writeFile(path.join(root, 'process-ai-backup'), 'arquivo solto, não dir'); // arquivo
    await fs.mkdir(path.join(root, 'other-skill'), { recursive: true });
    await fs.writeFile(path.join(root, 'other-skill', 'SKILL.md'), 'nao casa\n');
    await fs.mkdir(path.join(root, 'process-ai-symlink'), { recursive: true });
    const outside = path.join(root, 'outside-target.md');
    await fs.writeFile(outside, 'segredo');
    let symlinkCreated = true;
    try {
      await fs.symlink(outside, path.join(root, 'process-ai-symlink', 'SKILL.md'));
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES') {
        symlinkCreated = false; // Windows sem Developer Mode/admin — symlink não exercitado
      } else {
        throw e;
      }
    }

    const found = await discoverSourceSkills(root);
    const names = found.map((s) => s.name).sort();

    // Em ambos os casos (symlink criado e rejeitado, OU não-criado por falta de privilégio)
    // o resultado é o mesmo: só os 2 válidos. Quando o symlink é criado, ele é rejeitado;
    // quando não é, o dir process-ai-symlink fica sem SKILL.md → pulado.
    assert.deepEqual(
      names,
      ['process-ai', 'process-ai-bento'],
      symlinkCreated
        ? 'descobre só os 2 válidos; pula ghost/arquivo/não-matching e REJEITA symlink do source'
        : 'descobre só os 2 válidos; pula ghost/arquivo/não-matching (symlink não testado: sem privilégio)',
    );
    // O conteúdo fora do escopo (alvo do symlink) nunca é lido.
    assert.equal(await fs.readFile(outside, 'utf8'), 'segredo', 'source symlink não é seguido');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('AC1: installSkills instala exatamente as 7 skills reais (condutor + 6 especialistas)', async () => {
  // Guarda de regressão: o install real (repo-fonte) instala exatamente o conjunto
  // esperado — nenhum fantasma, nenhum arquivo solto.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-spec-set-'));
  try {
    const adapter = new ClaudeCodeAdapter();
    await adapter.installSkills(tmp);
    const installed = (await fs.readdir(path.join(tmp, '.claude', 'skills'))).sort();
    assert.deepEqual(
      installed,
      ['process-ai', 'process-ai-bento', 'process-ai-julia', 'process-ai-laura', 'process-ai-miguel', 'process-ai-tiago', 'process-ai-zanoni'],
      'installSkills deve instalar exatamente as 7 skills com SKILL.md',
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
