#!/usr/bin/env node
/**
 * bin/postinstall.js — Script pós-instalação (JS puro, sem TS).
 *
 * Copia as skills do pacote para .claude/skills/ no PROJETO DO CONSUMIDOR
 * (INIT_CWD), ativando o slash-command /process-ai no Claude Code (engine v1).
 *
 * JS PURO porque Node.js 24+ bloqueia type-stripping de .ts dentro de
 * node_modules/ (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING).
 *
 * Hardening (code review Epic 3 / 3.4):
 *  - lê INIT_CWD (npm seta para o diretório do consumidor durante install) em vez
 *    de cwd (que sob npm é node_modules/process-ai/ — copiava skills para dentro
 *    do pacote, nunca para o projeto do usuário).
 *  - sinaliza falhas em stderr em vez de engoli-las silenciosamente (.catch vazio).
 */
import { cp, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = fileURLToPath(import.meta.url).replace(/\\/g, '/').replace(/\/bin\/postinstall\.js$/, '');
const SOURCE_SKILLS = join(MODULE_DIR, 'skills');
// INIT_CWD = diretório de onde o usuário rodou `npm install` (o projeto consumidor).
// Fallback para cwd quando ausente (ex.: `node bin/postinstall.js` manualmente).
const CWD = process.env.INIT_CWD ? resolve(process.env.INIT_CWD) : resolve('.');

const SKILL_DIR_PATTERN = /^process-ai(-.+)?$/;

async function install() {
  // Verifica que skills/ existe no pacote
  try {
    const st = await stat(SOURCE_SKILLS);
    if (!st.isDirectory()) {
      console.warn('[process-ai] skills/ não é um diretório no pacote — /process-ai não será registrado.');
      return;
    }
  } catch {
    console.warn('[process-ai] skills/ ausente no pacote — /process-ai não será registrado.');
    return;
  }

  const targetSkillsDir = join(CWD, '.claude', 'skills');
  await mkdir(targetSkillsDir, { recursive: true });

  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(SOURCE_SKILLS, { withFileTypes: true });

  let copied = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !SKILL_DIR_PATTERN.test(entry.name)) continue;
    const src = join(SOURCE_SKILLS, entry.name);
    const dst = join(targetSkillsDir, entry.name);
    await cp(src, dst, { recursive: true, force: true });
    copied++;
  }

  if (copied > 0) {
    console.log(`[process-ai] ${copied} skill(s) instalada(s) em ${targetSkillsDir} — /process-ai disponível.`);
  } else {
    console.warn(`[process-ai] nenhuma skill process-ai* encontrada em ${SOURCE_SKILLS}.`);
  }
}

install().catch((err) => {
  // fail-soft: não bloqueia `npm install`, mas SINALIZA (hardening — antes o catch era vazio).
  console.error(`[process-ai] postinstall falhou ao copiar skills: ${err instanceof Error ? err.message : String(err)}`);
  console.error('[process-ai] /process-ai pode não estar disponível. Copie skills/ manualmente para .claude/skills/ se necessário.');
});
