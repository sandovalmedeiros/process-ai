/**
 * toolkit/src/installer/update-check.ts — detecção de global defasado.
 *
 * Verifica se a versão do process-ai EM EXECUÇÃO está atrás do `latest`
 * publicado no registro público do npm. Quando atrás, o CLI emite um aviso
 * não-bloqueante no stderr apontando para `npm i -g process-ai@latest`. Isto
 * fecha o gap que permitiu um bug já corrigido em 0.8.3 atingir um usuário
 * cujo global permanecia em 0.8.2 (ele publicou 0.8.3 mas nunca rodou o upgrade).
 *
 * `process-ai install` NÃO instala o package npm global — ele só provisiona
 * skills + deps Python num projeto consumidor. "Remover a versão anterior e
 * instalar a mais recente" já é responsabilidade do `npm i -g`; o que faltava
 * era detecção + nudge, que é exatamente o papel deste módulo.
 *
 * Design:
 *  - Todo caminho de execução passa por `main()` (bin/process-ai.ts), que chama
 *    `checkForUpdate()` uma vez por invocação.
 *  - Cache de 24h em `~/.process-ai/update-check.json` (user-level, NÃO no
 *    `.process-ai/` do projeto que é project-scoped) → no dia a dia é só leitura
 *    de arquivo; só ~1x/dia bate no registro (timeout 3s).
 *  - Fail-soft absoluto: qualquer erro (offline, DNS, JSON malformado, permissão
 *    de cache) colapsa para null → silêncio. O caller nunca trata exceção.
 *  - Comparação semver manual (split + Number) — zero deps de runtime é
 *    invariante do package; `fetch` global está disponível (Node ≥24).
 *
 * AD-3 / import-boundary: só `node:*` + relativo (./file-ops.ts, ./resource.ts).
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWrite } from './file-ops.ts';
import { getFrameworkVersion } from './resource.ts';

const REGISTRY_URL = 'https://registry.npmjs.org/process-ai/latest';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 3000; // 3s — fail-soft se o registro demorar
const SEMVER_RE = /^\d+\.\d+\.\d+$/; // espelha pack-loader.ts:51 (duplicado p/ não cruzar fronteira de módulo)

/** Resultado da verificação (null = indeterminado/silêncio). */
export interface UpdateCheckResult {
  /** true se a versão local está estritamente atrás da `latest`. */
  behind: boolean;
  /** Versão em execução (getFrameworkVersion). */
  local: string;
  /** Versão `latest` do registro (ou do cache fresco). */
  latest: string;
}

/** Cache em disco — { latest, checkedAt(epoch ms) }. */
interface UpdateCache {
  latest: string;
  checkedAt: number;
}

/**
 * Dependências injetáveis — permite ao unit-test mockar fetch, relógio, path de
 * cache e versão local sem tocar a rede nem o `$HOME` real (namespaces ESM não
 * são mockáveis pelo `node:test`, daí a injeção explícita — espelha IngestDepDeps).
 */
export interface UpdateCheckDeps {
  /** Busca o `latest` do registro. Retorna null em QUALQUER falha. */
  fetchLatest: () => Promise<string | null>;
  /** Relógio (epoch ms). */
  now: () => number;
  /** Path absoluto do arquivo de cache JSON. */
  cachePath: () => string;
  /** Versão do package em execução (getFrameworkVersion). */
  localVersion: () => string;
}

/**
 * Compara duas versões semver puras (X.Y.Z). Retorna true se `local` está
 * estritamente atrás de `latest`. Comparação NUMÉRICA por componente (0.10.0 >
 * 0.9.0, não léxica). Não-semver (0.0.0, -beta, 0.8) → false (não avisa em lixo).
 */
export function isVersionBehind(local: string, latest: string): boolean {
  if (!SEMVER_RE.test(local) || !SEMVER_RE.test(latest)) return false;
  const la = local.split('.').map(Number);
  const lb = latest.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const a = la[i] ?? 0;
    const b = lb[i] ?? 0;
    if (a < b) return true;
    if (a > b) return false;
  }
  return false; // igual
}

/**
 * Busca o `latest` no registro npm. Production fetcher (sem DI — o teste stuba
 * `globalThis.fetch`). Timeout via AbortController; qualquer falha (rede, DNS,
 * abort, HTTP não-2xx, JSON malformado, version ausente/fora-de-shape) → null.
 */
export async function fetchLatestVersion(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(REGISTRY_URL, { signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown } | null;
    const version = body?.version;
    return typeof version === 'string' && SEMVER_RE.test(version) ? version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Lê o cache; null se ausente/ilegível/malformado. */
async function readCache(filePath: string): Promise<UpdateCache | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as unknown;
    if (typeof data !== 'object' || data === null) return null;
    const { latest, checkedAt } = data as { latest?: unknown; checkedAt?: unknown };
    if (typeof latest !== 'string' || !SEMVER_RE.test(latest)) return null;
    if (typeof checkedAt !== 'number' || !Number.isFinite(checkedAt)) return null;
    return { latest, checkedAt };
  } catch {
    return null;
  }
}

/**
 * Escreve o cache (best-effort). `atomicWrite` NÃO cria o dir pai, daí o
 * `mkdir -p` prévio (necessário no first-run — `~/.process-ai/` pode não existir).
 * Falha de escrita é silenciada: o cache é otimização, não requisito.
 */
async function writeCache(filePath: string, data: UpdateCache): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await atomicWrite(filePath, JSON.stringify(data));
  } catch {
    // best-effort: cache não é requisito
  }
}

/**
 * Orquestra a verificação. Cache-first (24h); no miss/stale busca no registro.
 * Nunca lança — toda exceção colapsa para null (o caller não trata erro).
 * Retorna null se: versão local não-semver (0.0.0/garbage), fetch falhou, ou
 * erro inesperado. Caso contrário retorna { behind, local, latest }.
 */
export async function checkForUpdate(deps: UpdateCheckDeps = defaultDeps()): Promise<UpdateCheckResult | null> {
  const local = deps.localVersion();
  // '0.0.0' é o sentinel de fallback de getFrameworkVersion() (não conseguiu ler
  // o package.json) — não é uma versão real. Sem versão local confiável, não há
  // comparação significativa: silêncio. (isVersionBehind permanece um comparador puro.)
  if (!SEMVER_RE.test(local) || local === '0.0.0') return null;
  try {
    const cache = await readCache(deps.cachePath());
    let latest: string | null;
    if (cache && deps.now() - cache.checkedAt < CACHE_TTL_MS) {
      latest = cache.latest; // cache fresco — não busca
    } else {
      latest = await deps.fetchLatest();
      if (latest !== null) {
        await writeCache(deps.cachePath(), { latest, checkedAt: deps.now() });
      }
    }
    if (latest === null) return null; // fetch falhou → silêncio
    return { behind: isVersionBehind(local, latest), local, latest };
  } catch {
    return null; // never throws to caller
  }
}

/** Aviso pt-BR no stderr (uma linha + \n). Não menciona `process-ai update` (esse é outro subcomando). */
export function formatUpdateWarning(local: string, latest: string): string {
  return `⚠ Versão desatualizada: você está rodando a v${local}, mas a mais recente publicada no npm é a v${latest}. Atualize o instalador global com: npm i -g process-ai@latest\n`;
}

/** Dependências de produção (Node real). Exportado p/ o teste reaproveitar defaults. */
export function defaultDeps(): UpdateCheckDeps {
  return {
    fetchLatest: fetchLatestVersion,
    now: () => Date.now(),
    cachePath: () => path.join(os.homedir(), '.process-ai', 'update-check.json'),
    localVersion: getFrameworkVersion,
  };
}
