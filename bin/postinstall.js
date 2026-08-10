#!/usr/bin/env node
/**
 * bin/postinstall.js — Script pós-instalação (JS puro, sem TS).
 *
 * Rodado pelo npm após `npm install process-ai`. Delega o install ao CLI
 * compilado (dist/bin/process-ai.js install) — o ÚNICO caminho canônico de
 * install, o mesmo código de `npx process-ai install`. O provisionamento das
 * deps Python do ingest acontece dentro do `Installer.install`
 * (toolkit/src/installer/python-deps.ts), não aqui.
 * Encerra a duplicação do `cp -r` próprio que divergia do adapter (retro AI-2).
 *
 * JS PURO porque Node.js 24+ bloqueia type-stripping de .ts dentro de
 * node_modules/ (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). O CLI em dist/
 * é JS puro compilado pelo `npm run build` (prepublishOnly).
 *
 * Hardening (code review Epic 3 / 3.4):
 *  - INIT_CWD = diretório do consumidor (npm seta durante install); fallback cwd.
 *  - fail-soft: NÃO bloqueia `npm install`, mas SINALIZA falhas em stderr
 *    (antes o catch era vazio — hardening).
 */
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = fileURLToPath(import.meta.url).replace(/\\/g, '/').replace(/\/bin\/postinstall\.js$/, '');
const CLI = join(MODULE_DIR, 'dist', 'bin', 'process-ai.js');
// INIT_CWD = diretório de onde o usuário rodou `npm install` (projeto consumidor).
// Fallback para cwd quando ausente (ex.: `node bin/postinstall.js` manualmente).
const CWD = process.env.INIT_CWD ? resolve(process.env.INIT_CWD) : resolve('.');

// Guarda: dist/bin/process-ai.js tem que existir (prepublishOnly builda). Se o
// tarball foi publicado sem build, falha cedo com mensagem acionável em vez de
// ENOENT opaco do spawn.
let cliStat;
try {
  cliStat = statSync(CLI);
} catch {
  console.error(`[process-ai] postinstall: CLI compilado ausente (${CLI}).`);
  console.error('[process-ai] O pacote foi publicado sem build (dist/). Rode `npm run build` antes de publicar.');
  console.error('[process-ai] /process-ai NÃO foi registrado. Copie skills/ manualmente para .claude/skills/ se necessário.');
  process.exit(0); // fail-soft: não bloqueia npm install
}
if (!cliStat.isFile()) {
  console.error(`[process-ai] postinstall: ${CLI} não é um arquivo (inesperado). /process-ai não registrado.`);
  process.exit(0);
}

// Deps Python do ingest: provisionadas dentro do `Installer.install`
// (toolkit/src/installer/python-deps.ts) — este postinstall só chama `install`,
// que é o único caminho canônico e já cuida do Python. Sem bloco Python aqui.

// Delega ao CLI compilado: `node dist/bin/process-ai.js install --target <CWD>`.
// stdio 'inherit' mostra o resumo do install (skills + config + ingest) no output.
const r = spawnSync(process.execPath, [CLI, 'install', '--target', CWD], {
  cwd: CWD,
  stdio: 'inherit',
});

// fail-soft: distingue spawn-error / signal / exit-code p/ mensagem acionável
// (antes: kill por signal ou spawn ENOENT printavam "exit null" — opaco).
if (r.error) {
  console.error(`[process-ai] postinstall: install não pôde iniciar — ${r.error.message}`);
} else if (r.signal) {
  console.error(`[process-ai] postinstall: install terminado por signal ${r.signal}.`);
} else if (r.status !== 0) {
  console.error(`[process-ai] postinstall: install falhou (exit ${r.status}).`);
}
if (r.error || r.signal || r.status !== 0) {
  console.error('[process-ai] /process-ai pode não estar disponível. Copie skills/ manualmente para .claude/skills/, ou rode `npx process-ai install` no projeto.');
  // fail-soft: não bloqueia npm install com exit não-zero.
}
