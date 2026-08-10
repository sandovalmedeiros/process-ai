/**
 * toolkit/src/installer/python-deps.ts — provisionamento das deps Python do ingest.
 *
 * O subcomando `process-ai ingest` delega a conversão (PDF/DOCX/PPTX/...) aos
 * scripts Python sob `scripts/ingest_*.py`, que dependem das bibliotecas listadas
 * em `scripts/requirements-ingest.txt`. Este módulo provisiona essas deps como
 * parte do install — o ÚNICO caminho canônico pós-0.8.2 é `npx process-ai install`,
 * e TODO caminho de install passa pelo orquestrador (`Installer.install`).
 *
 * Antes do 0.8.2 este bootstrap vivia isolado em `bin/postinstall.js` (lifecycle do
 * npm), o que significava que `npx process-ai install` NUNCA provisionava Python.
 * Hoist para cá fecha esse gap de arquitetura.
 *
 * Fail-soft: NUNCA lança — a ausência de Python/pip é sinalizada no resumo do
 * install e o provisionamento de skills/config/manifest segue normalmente (são
 * independentes de Python). Espelha o comportamento do bloco original do postinstall.
 *
 * AD-3 / import-boundary: só `node:*` + relativo (./resource.ts).
 */
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { getPackageRoot } from './resource.ts';

/** Resultado do provisionamento (fail-soft: o caller nunca trata exceção). */
export interface PythonDepResult {
  /** Interpretador Python + módulo pip disponíveis no PATH. */
  available: boolean;
  /** `pip install -r requirements-ingest.txt` executou com êxito (ou já estava instalado). */
  installed: boolean;
  /** Mensagem humano-legível e acionável (interpretador usado, ou como instalar Python). */
  message: string;
}

/** Retorno de spawnSync que este módulo consome (status + stderr). */
interface SpawnLikeResult {
  status: number | null;
  stderr?: string;
}

/**
 * Dependências injetáveis — permite ao unit-test mockar `spawnSync` e a resolução
 * do requirements sem Python real no PATH (namespaces ESM não são mockáveis pelo
 * `node:test`, daí a injeção explícita).
 */
export interface IngestDepDeps {
  spawnSync: (
    cmd: string,
    args: string[],
    opts: { stdio: 'pipe'; encoding: 'utf8'; timeout: number },
  ) => SpawnLikeResult;
  /** Resolve o path de `requirements-ingest.txt` dentro do pacote, ou null. */
  resolveReqs: () => string | null;
  /** `process.platform` (win32 troca a ordem de candidatos a interpretador). */
  platform: string;
}

/** Resultado neutro quando o requirements não está no pacote (tarball incompleto). */
function reqsMissing(): PythonDepResult {
  return {
    available: false,
    installed: false,
    message: 'requirements-ingest.txt não encontrado no pacote — ingest não provisionado.',
  };
}

/**
 * Procura e instala as deps Python do ingest. Idempotente (pip pula o que já está
 * instalado). Fail-soft: retorna sempre um `PythonDepResult`, nunca lança.
 *
 * Ordem de candidatos: `python3`→`python` no Unix; só `python` no Windows. Usa
 * `python -m pip` (não `pip` solto) para garantir que o pip é do mesmo interpretador.
 */
export function ensureIngestDeps(deps: IngestDepDeps = defaultDeps()): PythonDepResult {
  const reqs = deps.resolveReqs();
  if (!reqs) return reqsMissing();
  try {
    if (!statSync(reqs).isFile()) return reqsMissing();
  } catch {
    return reqsMissing();
  }

  const candidates = deps.platform === 'win32' ? ['python'] : ['python3', 'python'];
  let pipExe: string | null = null;
  for (const py of candidates) {
    const check = deps.spawnSync(py, ['-m', 'pip', '--version'], {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 10_000,
    });
    if (check.status === 0) {
      pipExe = py;
      break;
    }
  }
  if (!pipExe) {
    return {
      available: false,
      installed: false,
      message: `Python 3.11+ / pip não encontrado no PATH — \`npx process-ai ingest\` não funcionará. Como instalar: ${pythonInstallHint(deps.platform)}`,
    };
  }

  const install = deps.spawnSync(pipExe, ['-m', 'pip', 'install', '-r', reqs], {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (install.status === 0) {
    return {
      available: true,
      installed: true,
      message: `deps Python do ingest provisionadas via \`${pipExe} -m pip\``,
    };
  }
  const stderrSnippet = (install.stderr ?? '').slice(0, 200).trim() || '(sem stderr)';
  return {
    available: true,
    installed: false,
    message: `\`${pipExe} -m pip install -r requirements-ingest.txt\` falhou: ${stderrSnippet}`,
  };
}

/** Dependências de produção (Node real). Exportado p/ o teste reaproveitar defaults. */
export function defaultDeps(): IngestDepDeps {
  return {
    spawnSync,
    resolveReqs: () => {
      const root = getPackageRoot();
      return root ? path.join(root, 'scripts', 'requirements-ingest.txt') : null;
    },
    platform: process.platform,
  };
}

/** Dica de instalação de Python por plataforma (mensagem acionável do resumo). */
function pythonInstallHint(platform: string): string {
  switch (platform) {
    case 'win32':
      return 'winget install Python.Python.3.11';
    case 'darwin':
      return 'brew install python@3.11';
    default:
      return 'sudo apt-get install python3.11 python3-pip  # ou o gerenciador da sua distro';
  }
}
