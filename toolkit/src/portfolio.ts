/**
 * toolkit/src/portfolio.ts — PORTFÓLIO DE PROCESSOS POR PROJETO (multi-processo).
 *
 * Um engajamento de mapeamento (projeto) cobre N processos, cada um atrelado a
 * uma entidade (empresa, setor, órgão, …). Cada processo é um mini-projeto
 * autossuficiente que vive sob `<root>/processos/<slug>/` — com seu próprio
 * `_process-ai_output/` + `.process-ai/checkpoint.json`. O toolkit existente
 * (commit/checkpoint/resume/generators) roda **inalterado** dentro de cada pasta
 * de processo (root = cwd). Este módulo só gerencia o **ledger do portfólio** na
 * raiz do projeto: quais processos existem, seus nomes humanos e slugs.
 *
 * AD-1 (único escritor): o ledger `.process-ai/portfolio.json` é escrito SÓ por
 * este módulo (invocado pelo subcomando `process`), nunca pela skill. As pastas
 * `processos/<slug>/` são criadas por este módulo; todo o resto dentro delas é
 * escrito pelo commit (já escopado via cwd).
 *
 * INVARIANTE AD-3 (núcleo hexagonal): este arquivo só importa `node:*` builtins
 * — nunca um package npm, nunca outro módulo do core (mantém o boundary limpo e
 * o teste tests/import-boundary.test.ts verde). Lê o checkpoint de um processo
 * como JSON opaco (só extrai `.stage`), sem importar checkpoint.ts.
 *
 * Path-safety POR CONSTRUÇÃO: o slug só contém `[a-z0-9-]` (slugify descarta
 * todo o resto), então `processos/<slug>/` nunca escapa do escopo do projeto.
 * Nomes reservados do Windows (CON, NUL, …) são rejeitados explicitamente.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

// ---- Constantes ----

/** Subpasta do projeto onde cada processo ganha sua pasta (slug). */
const PROCESSES_DIR = 'processos';
/** Subpasta de metadados do toolkit (mesma convenção de commit.ts/checkpoint.ts). */
const META_DIR = '.process-ai';
/** Arquivo do ledger do portfólio, dentro de META_DIR na raiz do PROJETO. */
const PORTFOLIO_FILE = 'portfolio.json';
/** Comprimento máximo do slug (truncado em fronteira de hífen). */
const SLUG_MAX_LEN = 60;

// ---- Windows reserved names (espelha commit.ts P10) ----

/** Nomes reservados do Windows que passariam na allowlist kebab mas falham no FS. */
const WIN_RESERVED = new Set([
  'con', 'nul', 'aux', 'prn',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

// ---- Tipos ----

/** Entrada de um processo no ledger do portfólio. */
export interface PortfolioProcess {
  /** Nome reduzido (kebab-case, ASCII) — também é o nome da pasta. */
  slug: string;
  /** Nome humano original (ex.: "Vendas (Lead-to-Cash)"). */
  name: string;
  /** ISO-8601 de criação. */
  createdAt: string;
}

/** Ledger do portfólio na raiz do projeto. */
export interface Portfolio {
  version: 1;
  processes: PortfolioProcess[];
}

/** Status de um processo enriquecido pelo stage corrente (derivado do checkpoint). */
export interface ProcessStatus {
  slug: string;
  name: string;
  /** Stage do checkpoint do processo, ou 'nao-iniciado' se não há checkpoint. */
  stage: string;
  /** Caminho absoluto da pasta do processo, com separadores '/'. */
  path: string;
}

// ---- Erro acionável (errno-agnostic, padrão do toolkit) ----

/** Erro de portfólio — sempre acionável, em pt-BR. */
export class PortfolioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortfolioError';
  }
}

// ---- Slugify (mirror de commit.ts slugify — mantido local p/ não tocar o writer) ----

/**
 * Mapa de transliteração: caracteres acentuados → ASCII.
 * Mirror idêntico de `commit.ts` (linhas 399-417) — mesma semântica de slug em
 * todo o framework (artifact filenames + pastas de processo). Se commit.ts um
 * dia mudar, atualizar aqui junto (ou extrair para módulo compartilhado).
 */
const TRANSLIT: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a', æ: 'ae',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o', ø: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ñ: 'n', ç: 'c', ß: 'ss', ÿ: 'y',
  œ: 'oe', þ: 'th', ð: 'd', đ: 'd', ħ: 'h', ł: 'l',
  š: 's', ž: 'z',
  À: 'a', Á: 'a', Â: 'a', Ã: 'a', Ä: 'a', Å: 'a', Æ: 'ae',
  È: 'e', É: 'e', Ê: 'e', Ë: 'e',
  Ì: 'i', Í: 'i', Î: 'i', Ï: 'i',
  Ò: 'o', Ó: 'o', Ô: 'o', Õ: 'o', Ö: 'o', Ø: 'o',
  Ù: 'u', Ú: 'u', Û: 'u', Ü: 'u',
  Ñ: 'n', Ç: 'c', Ÿ: 'y',
  Œ: 'oe', Þ: 'th', Ð: 'd', Đ: 'd', Ħ: 'h', Ł: 'l',
  Š: 's', Ž: 'z',
};

/**
 * Slugify do nome do processo → `[a-z0-9]+(-[a-z0-9]+)*`.
 *
 * Pipeline (mirror de commit.ts): trim → transliterar acentos → lowercase →
 * substituir não-alfanuméricos por `-` → colapsar/remover hífens de borda →
 * truncar em SLUG_MAX_LEN (em fronteira de hífen). Retorna string vazia se o
 * resultado não tiver caracteres alfanuméricos.
 */
export function slugifyName(text: string): string {
  let s = text.trim();
  if (s.length === 0) return '';

  let out = '';
  for (const ch of s) {
    out += TRANSLIT[ch] ?? ch;
  }
  s = out;

  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/^-+/, '').replace(/-+$/, '');

  if (s.length > SLUG_MAX_LEN) {
    const cut = s.lastIndexOf('-', SLUG_MAX_LEN);
    s = s.slice(0, cut > 0 ? cut : SLUG_MAX_LEN).replace(/-+$/, '');
  }

  return s;
}

/**
 * Resolve colisão de slug anexando `-2`, `-3`, … (`vendas` → `vendas-2`).
 * Pura — zero IO.
 */
export function uniqueSlug(existing: readonly string[], base: string): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// ---- Escrita atômica (mirror de commit.ts atomicWriteFile) ----

let tempCounter = 0;

/**
 * Escrita atômica: temp + `fs.rename` no mesmo diretório (atômico em POSIX,
 * near-atômico em NTFS). Em falha, remove o temp — não deixa arquivo torn/0-byte.
 * Mirror de `commit.ts:295` (mantido local para não tocar o writer consolidado).
 */
async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${tempCounter++}`;
  try {
    await fs.writeFile(tmp, data, 'utf8');
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
  try {
    await fs.rename(tmp, filePath);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

// ---- Ledger: read / write ----

/** Caminho absoluto do ledger do portfólio na raiz do projeto. */
function portfolioPath(root: string): string {
  return path.join(root, META_DIR, PORTFOLIO_FILE);
}

/**
 * Lê o ledger do portfólio. Fail-soft: ausente (ENOENT) → portfolio vazio.
 * JSON inválido → PortfolioError acionável (o ledger é toolkit-owned; corrupção
 * é exceção que o usuário deve inspecionar, não silenciar).
 */
export async function readPortfolio(root: string): Promise<Portfolio> {
  const pPath = portfolioPath(root);
  try {
    const raw = await fs.readFile(pPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Portfolio>;
    if (parsed && Array.isArray(parsed.processes)) {
      return { version: 1, processes: parsed.processes as PortfolioProcess[] };
    }
    return { version: 1, processes: [] };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, processes: [] };
    }
    if (e instanceof SyntaxError) {
      throw new PortfolioError(
        `Portfolio corrompido (JSON inválido): ${pPath}. Inspecione o arquivo manualmente ou remova-o para recriar.`,
      );
    }
    throw e;
  }
}

/** Escreve o ledger atomicamente (temp + rename). */
async function writePortfolio(root: string, portfolio: Portfolio): Promise<void> {
  await atomicWriteFile(portfolioPath(root), JSON.stringify(portfolio, null, 2) + '\n');
}

// ---- Stage de um processo (lê checkpoint como JSON opaco — sem importar checkpoint.ts) ----

/**
 * Lê o stage corrente do processo a partir do checkpoint dele. Best-effort:
 * checkpoint ausente (ENOENT) ou corrompido (SyntaxError) → 'nao-iniciado'.
 * Outros erros de IO propagam.
 */
async function readProcessStage(processDir: string): Promise<string> {
  const cpPath = path.join(processDir, META_DIR, 'checkpoint.json');
  try {
    const raw = await fs.readFile(cpPath, 'utf8');
    const cp = JSON.parse(raw) as { stage?: unknown };
    return typeof cp.stage === 'string' && cp.stage.length > 0 ? cp.stage : 'nao-iniciado';
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 'nao-iniciado';
    if (e instanceof SyntaxError) return 'nao-iniciado';
    throw e;
  }
}

// ---- API pública ----

/**
 * Adiciona um processo ao portfólio do projeto.
 *
 * 1. slugifica o nome → base; rejeita slug vazio (nome sem alfanuméricos).
 * 2. resolve colisão vs slugs existentes (`vendas` → `vendas-2`).
 * 3. rejeita nomes reservados do Windows (CON, NUL, …).
 * 4. cria `processos/<slug>/` (recursive).
 * 5. append no ledger (atômico).
 *
 * @param root - Raiz do PROJETO (não a pasta do processo).
 * @param name - Nome humano do processo (ex.: "Vendas (Lead-to-Cash)").
 * @returns `{ slug, name, path }` — path absoluto da pasta criada (com '/').
 */
export async function addProcess(
  root: string,
  name: string,
): Promise<{ slug: string; name: string; path: string }> {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new PortfolioError(
      `Nome de processo ausente ou vazio. Forneça um nome (ex.: "Vendas — Lead-to-Cash").`,
    );
  }

  const base = slugifyName(name);
  if (!base) {
    throw new PortfolioError(
      `Nome de processo inválido (gera slug vazio): "${name}". Use ao menos um caractere alfanumérico.`,
    );
  }

  const portfolio = await readPortfolio(root);
  const slug = uniqueSlug(portfolio.processes.map((p) => p.slug), base);

  if (WIN_RESERVED.has(slug)) {
    throw new PortfolioError(
      `Nome de processo rejeitado (slug "${slug}" é nome reservado do Windows): "${name}". Escolha outro nome.`,
    );
  }

  const processDir = path.join(root, PROCESSES_DIR, slug);
  await fs.mkdir(processDir, { recursive: true });

  const entry: PortfolioProcess = {
    slug,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  portfolio.processes.push(entry);
  await writePortfolio(root, portfolio);

  return {
    slug,
    name: entry.name,
    path: processDir.split(path.sep).join('/'),
  };
}

/**
 * Lista os processos do portfólio com o stage corrente de cada um (derivado do
 * checkpoint do processo). Ordem de inserção (a do ledger). Fail-soft: sem
 * ledger → lista vazia.
 *
 * @param root - Raiz do PROJETO.
 * @returns `ProcessStatus[]` (slug, name, stage, path absoluto com '/').
 */
export async function listProcesses(root: string): Promise<ProcessStatus[]> {
  const portfolio = await readPortfolio(root);
  const result: ProcessStatus[] = [];
  for (const p of portfolio.processes) {
    const processDir = path.join(root, PROCESSES_DIR, p.slug);
    const stage = await readProcessStage(processDir);
    result.push({
      slug: p.slug,
      name: p.name,
      stage,
      path: processDir.split(path.sep).join('/'),
    });
  }
  return result;
}
