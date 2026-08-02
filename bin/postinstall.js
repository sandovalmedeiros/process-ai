/**
 * bin/postinstall.js — Script pós-instalação (JS puro, sem TS).
 *
 * Copia as skills do pacote para .claude/skills/ no projeto do usuário,
 * ativando o slash-command /process-ai no Claude Code (engine v1).
 *
 * JS PURO porque Node.js 24+ bloqueia type-stripping de .ts dentro de
 * node_modules/ (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING).
 */
import { cp, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = fileURLToPath(import.meta.url).replace(/\\/g, '/').replace(/\/bin\/postinstall\.js$/, '');
const SOURCE_SKILLS = join(MODULE_DIR, 'skills');
const CWD = resolve('.');

const SKILL_DIR_PATTERN = /^process-ai(-.+)?$/;

async function install() {
  // Verifica que skills/ existe no pacote
  try {
    const st = await stat(SOURCE_SKILLS);
    if (!st.isDirectory()) return;
  } catch {
    return; // sem skills/ — nada a copiar
  }

  const targetSkillsDir = join(CWD, '.claude', 'skills');
  await mkdir(targetSkillsDir, { recursive: true });

  // Lê skills-fonte e copia cada uma
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
    console.log(`[process-ai] ${copied} skill(s) instalada(s) em .claude/skills/ — /process-ai disponível.`);
  }
}

install().catch(() => {
  // fail-soft: não bloqueia npm install
});
