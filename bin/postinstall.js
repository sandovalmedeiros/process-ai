#!/usr/bin/env node
/**
 * bin/postinstall.js — Script pós-instalação (JS puro, sem TS).
 *
 * Rodado pelo npm após `npm install process-ai`. Delega o install ao CLI
 * compilado (dist/bin/process-ai.js install), que é o ÚNICO caminho de install
 * (runInstall) — o mesmo código de `npx process-ai` e `process-ai-bootstrap`.
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
const REQS = join(MODULE_DIR, 'scripts', 'requirements-ingest.txt');
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

// Instala dependências Python para o ingest (fail-soft: avisa se Python/pip ausente).
// Tenta python3 primeiro (Unix), depois python (Windows). Usa `python -m pip` para
// garantir que o pip é o do mesmo interpretador (evita pip solto no PATH).
{
  let reqsStat;
  try {
    reqsStat = statSync(REQS);
  } catch {
    // requirements-ingest.txt não existe (tarball sem scripts/) — silencia.
  }
  if (reqsStat && reqsStat.isFile()) {
    const pythonExes = process.platform === 'win32'
      ? ['python']
      : ['python3', 'python'];
    let installed = false;
    for (const py of pythonExes) {
      const pipCheck = spawnSync(py, ['-m', 'pip', '--version'], {
        stdio: 'pipe', encoding: 'utf8', timeout: 10_000,
      });
      if (pipCheck.status === 0) {
        const pipR = spawnSync(py, ['-m', 'pip', 'install', '-r', REQS], {
          stdio: 'pipe', encoding: 'utf8', timeout: 60_000,
        });
        if (pipR.status === 0) {
          installed = true;
          break;
        }
        // pip falhou — tenta próximo Python, mas avisa
        console.error(`[process-ai] pip install falhou com ${py}: ${pipR.stderr?.slice(0, 200) || '(sem stderr)'}`);
      }
    }
    if (!installed) {
      const how = process.platform === 'win32'
        ? 'winget install Python.Python.3.11'
        : process.platform === 'darwin'
          ? 'brew install python@3.11'
          : 'sudo apt-get install python3.11 python3-pip  # ou o gerenciador da sua distro';
      console.error(`[process-ai] Python 3.11+ / pip não encontrado. O subcomando \`process-ai ingest\` não funcionará.`);
      console.error(`[process-ai] Como instalar Python: ${how}`);
      console.error(`[process-ai] Depois rode: pip install -r node_modules/process-ai/scripts/requirements-ingest.txt`);
    }
  }
}

// Delega ao CLI compilado: `node dist/bin/process-ai.js install --target <CWD>`.
// stdio 'inherit' mostra o resumo do install (skills + config) no output do npm.
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
  console.error('[process-ai] /process-ai pode não estar disponível. Copie skills/ manualmente para .claude/skills/, ou rode `npx process-ai` no projeto.');
  // fail-soft: não bloqueia npm install com exit não-zero.
}
