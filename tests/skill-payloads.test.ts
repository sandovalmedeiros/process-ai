/**
 * tests/skill-payloads.test.ts — regressão do Erro 3 (content como { body }).
 *
 * Pós-Story 4.1, TODO artifactType exige `content` como objeto `{ body: string }`
 * (schema-core: `content deve ser um objeto`). Cinco skills especialistas ainda
 * emitiam o payload pré-4.1 (`"content": "<string>"`), o que derrubava todo commit.
 * Este teste escaneia as skills e falha se alguma voltar a emitir content-string.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const SKILLS_DIR = path.resolve(import.meta.dirname, '..', 'skills');

/** Casa `"content": "..."` (ou aspas simples) — content como string, não objeto. */
const CONTENT_AS_STRING = /["']content["']\s*:\s*["']/;

test('nenhuma skill emite `content` como string — sempre objeto { body } (pós-4.1)', async () => {
  const skillDirs = (await readdir(SKILLS_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name.startsWith('process-ai'))
    .map((e) => e.name)
    .sort();
  assert.ok(skillDirs.length >= 5, `esperado ≥5 skills, got ${skillDirs.length}`);

  const violations: string[] = [];
  for (const dir of skillDirs) {
    const md = path.join(SKILLS_DIR, dir, 'SKILL.md');
    let content: string;
    try {
      content = await readFile(md, 'utf8');
    } catch {
      continue; // skill sem SKILL.md — pula
    }
    // remove linhas de comentário markdown (não são payloads), depois procura.
    const hits = content
      .split('\n')
      .filter((ln) => CONTENT_AS_STRING.test(ln))
      .map((ln) => ln.trim());
    if (hits.length > 0) {
      violations.push(`${dir}/SKILL.md: ${hits.length}× — ex: "${hits[0].slice(0, 80)}"`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `skills com payload pré-4.1 (content como string): ${violations.join('; ')}. Use \`"content": { "body": "..." }\`.`,
  );
});
