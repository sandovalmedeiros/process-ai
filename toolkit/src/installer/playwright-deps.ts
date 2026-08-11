/**
 * toolkit/src/installer/playwright-deps.ts — detecção do runtime de renderização (Guilherme).
 *
 * O subcomando `process-ai render-flow` (skill Guilherme) converte o artefato `flow`
 * (BPMN 2.0 XML canônico, AD-6) em PNG+SVG via Playwright + bpmn-js. Playwright é
 * `devDependency` do framework — NÃO é shipado ao consumidor —, logo o renderer só
 * funciona se o usuário instalar Playwright no projeto-alvo (opt-in). Este módulo
 * DETECTA essa condição (no install, como aviso não-bloqueante; em runtime no
 * render-flow, como gate) e degrada honestamente (🔴 sem imagem; o XML canônico
 * segue salvo — AD-6 preservado).
 *
 * Estratégia espelho de python-deps.ts: NUNCA importa Playwright (AD-3 — toolkit/src
 * só importa `node:*` + relativos). Em vez disso, dispara a sonda
 * `scripts/bpmn-renderer/playwright-probe.cjs` via spawnSync. A sonda faz
 * `require.resolve('playwright')` a partir do SEU diretório (o mesmo de render.ts),
 * percorrendo a mesma cadeia de node_modules que o `import 'playwright'` de render.ts
 * vai percorrer em runtime — evita falsos-positivos no caso npx-cache (isolado do
 * node_modules do projeto-alvo).
 *
 * Fail-soft: NUNCA lança — a ausência de Playwright é sinalizada no resumo do
 * install; skills/config/manifest/ingest seguem normalmente (são independentes).
 *
 * AD-3 / import-boundary: só `node:*` (child_process) + relativo (./resource.ts).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { getPackageRoot } from './resource.ts';

/** Resultado da detecção (fail-soft: o caller nunca trata exceção). */
export interface RenderDepResult {
  /** Módulo `playwright` resolvível da cadeia de node_modules do renderizador. */
  available: boolean;
  /** Um navegador usável existe (Chromium bundled OU Edge/Chrome de sistema). */
  installed: boolean;
  /** Mensagem humano-legível e acionável. */
  message: string;
}

/** Retorno de spawnSync que este módulo consome (status). */
interface SpawnLikeResult {
  status: number | null;
  stderr?: string;
}

/**
 * Dependências injetáveis — permite ao unit-test mockar `spawnSync`, o node e o
 * path da sonda sem Playwright real instalado (namespaces ESM não são mockáveis
 * pelo `node:test`, daí a injeção explícita; espelha IngestDepDeps).
 */
export interface RenderDepDeps {
  spawnSync: (
    cmd: string,
    args: string[],
    opts: { stdio: 'pipe'; encoding: 'utf8'; timeout: number },
  ) => SpawnLikeResult;
  /** Executável node para disparar a sonda (default process.execPath). */
  node: string;
  /** `process.platform` (a dica varia: Windows usa Edge de sistema). */
  platform: string;
  /** Path absoluto da sonda .cjs, ou null se o pacote estiver incompleto. */
  resolveProbe: () => string | null;
}

/** Caminho da sonda no pacote, ou null se a raiz do framework não resolver. */
function defaultResolveProbe(): string | null {
  const root = getPackageRoot();
  return root ? path.join(root, 'scripts', 'bpmn-renderer', 'playwright-probe.cjs') : null;
}

/** Dica de instalação por plataforma — Windows prefere Edge do sistema. */
function enableHint(platform: string): string {
  return platform === 'win32'
    ? '`npm i playwright` (no Windows o Edge do sistema é usado automaticamente como navegador — sem download de Chromium; PA_BROWSER=msedge|chrome|chromium força um canal)'
    : '`npm i playwright && npx playwright install chromium`';
}

/**
 * Detecta a disponibilidade de Playwright + navegador. Idempotente, leitura pura
 * (nunca instala nada — opt-in é do usuário). Fail-soft: retorna sempre um
 * `RenderDepResult`, nunca lança. Códigos de saída da sonda:
 *   0 → pronto; 1 → Playwright ausente; 2 → Playwright sem navegador.
 */
export function ensureRenderDeps(deps: RenderDepDeps = defaultDeps()): RenderDepResult {
  const probe = deps.resolveProbe();
  if (!probe) {
    return {
      available: false,
      installed: false,
      message: 'Sonda de renderização (scripts/bpmn-renderer/playwright-probe.cjs) não encontrada no pacote — instalação incompleta. Rode `process-ai update` para reparar.',
    };
  }

  let res: SpawnLikeResult;
  try {
    res = deps.spawnSync(deps.node, [probe], {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 20_000,
    });
  } catch {
    // fail-soft: spawn irrompeu (node ausente?) — sinaliza indisponível, não lança.
    return {
      available: false,
      installed: false,
      message: `Não foi possível executar a sonda de Playwright. Como habilitar a renderização (Guilherme): ${enableHint(deps.platform)}.`,
    };
  }

  // status 0 → pronto; 2 → Playwright sem navegador; 1/null/outros → ausente.
  if (res.status === 0) {
    return {
      available: true,
      installed: true,
      message: 'Playwright + navegador detectados — renderização de fluxo (Guilherme) disponível.',
    };
  }
  if (res.status === 2) {
    return {
      available: true,
      installed: false,
      message:
        'Playwright instalado, mas nenhum navegador usável encontrado. Rode `npx playwright install chromium`' +
        (deps.platform === 'win32' ? ' (ou defina PA_BROWSER=msedge|chrome para usar o Edge/Chrome do sistema).' : '.'),
    };
  }
  return {
    available: false,
    installed: false,
    message:
      `Playwright não encontrado — \`npx process-ai render-flow\` (Guilherme) não gerará imagens ` +
      `(o BPMN XML canônico continua salvo). Como habilitar: ${enableHint(deps.platform)}.`,
  };
}

/** Dependências de produção (Node real). Exportado p/ o teste reaproveitar defaults. */
export function defaultDeps(): RenderDepDeps {
  return {
    spawnSync,
    node: process.execPath,
    platform: process.platform,
    resolveProbe: defaultResolveProbe,
  };
}
