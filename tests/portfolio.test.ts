/**
 * tests/portfolio.test.ts — portfólio de processos (multi-processo por projeto).
 *
 * Cobre o engine do portfólio: slugify, resolução de colisão, path-safety,
 * criação de pasta + ledger atômico, derivação de stage a partir do checkpoint
 * do processo. Real-fs em os.tmpdir() (mesmo padrão de commit.test.ts).
 *
 * AD-1: o ledger só é escrito pelo toolkit (addProcess). AD-3: portfolio.ts só
 * importa node:* (coberto por tests/import-boundary.test.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  addProcess,
  listProcesses,
  readPortfolio,
  slugifyName,
  uniqueSlug,
  PortfolioError,
} from '../toolkit/src/portfolio.ts';

/** Cria um root de projeto vazio em tmpdir. */
async function newProjectRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-portfolio-'));
  return root;
}

/** Escreve um checkpoint mínimo (só stage) na pasta de um processo. */
async function writeCheckpoint(processDir: string, stage: string): Promise<void> {
  await fs.mkdir(path.join(processDir, '.process-ai'), { recursive: true });
  await fs.writeFile(
    path.join(processDir, '.process-ai', 'checkpoint.json'),
    JSON.stringify({ stage, artifacts: [], gates: [] }),
    'utf8',
  );
}

// ---- slugifyName (pura) ----

test('slugifyName: "Vendas (Lead-to-Cash)" → vendas-lead-to-cash', () => {
  assert.equal(slugifyName('Vendas (Lead-to-Cash)'), 'vendas-lead-to-cash');
});

test('slugifyName: translitera acentos e em-dash', () => {
  assert.equal(slugifyName('Compras — Pagamento'), 'compras-pagamento');
  assert.equal(slugifyName('Recursos Humanos — Admissão'), 'recursos-humanos-admissao');
  assert.equal(slugifyName('Caçamba'), 'cacamba');
  assert.equal(slugifyName('Análise'), 'analise');
});

test('slugifyName: lowercase, colapsa não-alfanuméricos, remove hífens de borda', () => {
  assert.equal(slugifyName('  Lead2Cash!!  '), 'lead2cash');
  assert.equal(slugifyName('---foo---bar---'), 'foo-bar');
  assert.equal(slugifyName('a.b.c'), 'a-b-c');
});

test('slugifyName: string vazia / só símbolos → vazio', () => {
  assert.equal(slugifyName(''), '');
  assert.equal(slugifyName('   '), '');
  assert.equal(slugifyName('!@#$%'), '');
  assert.equal(slugifyName('——'), '');
});

test('slugifyName: truncamento em fronteira de hífen (≤ 60 chars)', () => {
  const long = 'Processo Com Nome Muito Longo Que Excede O Limite De Sessenta Caracteres Do Slug';
  const slug = slugifyName(long);
  assert.ok(slug.length <= 60, `slug deve ter ≤60 chars, teve ${slug.length}`);
  assert.ok(!slug.endsWith('-'), 'slug truncado não deve terminar com hífen');
});

// ---- uniqueSlug (pura) ----

test('uniqueSlug: sem colisão → base', () => {
  assert.equal(uniqueSlug(['compras'], 'vendas'), 'vendas');
});

test('uniqueSlug: colisão → sufixo -2, -3, …', () => {
  assert.equal(uniqueSlug(['vendas'], 'vendas'), 'vendas-2');
  assert.equal(uniqueSlug(['vendas', 'vendas-2'], 'vendas'), 'vendas-3');
});

// ---- addProcess (real fs) ----

test('addProcess: cria pasta processos/<slug>/ + entrada no ledger; retorna slug+path', async () => {
  const root = await newProjectRoot();
  try {
    const result = await addProcess(root, 'Vendas (Lead-to-Cash)');
    assert.equal(result.slug, 'vendas-lead-to-cash');
    assert.equal(result.name, 'Vendas (Lead-to-Cash)');
    assert.ok(result.path.endsWith('processos/vendas-lead-to-cash'));

    // Pasta criada.
    const st = await fs.stat(path.join(root, 'processos', 'vendas-lead-to-cash'));
    assert.ok(st.isDirectory());

    // Ledger criado com a entrada.
    const portfolio = await readPortfolio(root);
    assert.equal(portfolio.processes.length, 1);
    assert.equal(portfolio.processes[0].slug, 'vendas-lead-to-cash');
    assert.equal(portfolio.processes[0].name, 'Vendas (Lead-to-Cash)');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('addProcess: colisão gera sufixo (dois "Vendas")', async () => {
  const root = await newProjectRoot();
  try {
    const a = await addProcess(root, 'Vendas');
    const b = await addProcess(root, 'Vendas');
    assert.equal(a.slug, 'vendas');
    assert.equal(b.slug, 'vendas-2');
    assert.notEqual(a.path, b.path);

    // Pastas distintas.
    assert.ok((await fs.stat(path.join(root, 'processos', 'vendas'))).isDirectory());
    assert.ok((await fs.stat(path.join(root, 'processos', 'vendas-2'))).isDirectory());

    const portfolio = await readPortfolio(root);
    assert.equal(portfolio.processes.length, 2);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('addProcess: nome vazio / só símbolos → PortfolioError', async () => {
  const root = await newProjectRoot();
  try {
    await assert.rejects(() => addProcess(root, ''), PortfolioError);
    await assert.rejects(() => addProcess(root, '   '), PortfolioError);
    await assert.rejects(() => addProcess(root, '!@#$'), PortfolioError);
    // Nada escrito.
    const portfolio = await readPortfolio(root);
    assert.equal(portfolio.processes.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('addProcess: path-safety — nome malicioso é sanitizado (slug só [a-z0-9-])', async () => {
  const root = await newProjectRoot();
  try {
    const r1 = await addProcess(root, '../xss');
    const r2 = await addProcess(root, 'a/b/c');
    // Slugs sanitizados: sem '/', sem '..'.
    assert.match(r1.slug, /^[a-z0-9-]+$/);
    assert.match(r2.slug, /^[a-z0-9-]+$/);
    assert.ok(!r1.slug.includes('..'));
    assert.ok(!r2.slug.includes('/'));

    // Pastas criadas DENTRO de processos/ (não escaparam).
    const processosDir = path.join(root, 'processos');
    const entries = await fs.readdir(processosDir, { withFileTypes: true });
    assert.ok(entries.every((e) => e.isDirectory()));
    assert.equal(entries.length, 2);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('addProcess: nome reservado do Windows (CON) → PortfolioError', async () => {
  const root = await newProjectRoot();
  try {
    // "CON" vira slug "con" que é reservado.
    await assert.rejects(() => addProcess(root, 'CON'), PortfolioError);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- listProcesses (real fs) ----

test('listProcesses: sem ledger → []', async () => {
  const root = await newProjectRoot();
  try {
    const list = await listProcesses(root);
    assert.deepEqual(list, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('listProcesses: deriva stage do checkpoint; ausente → nao-iniciado', async () => {
  const root = await newProjectRoot();
  try {
    const a = await addProcess(root, 'Vendas');
    const b = await addProcess(root, 'Compras');
    // Vendas avançou até 'mapping'; Compras sem checkpoint.
    await writeCheckpoint(path.join(root, 'processos', a.slug), 'mapping');

    const list = await listProcesses(root);
    assert.equal(list.length, 2);
    const vendas = list.find((p) => p.slug === 'vendas');
    const compras = list.find((p) => p.slug === 'compras');
    assert.ok(vendas && compras);
    assert.equal(vendas.stage, 'mapping');
    assert.equal(compras.stage, 'nao-iniciado');
    assert.ok(vendas.path.endsWith('processos/vendas'));
    assert.ok(compras.path.endsWith('processos/compras'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('listProcesses: checkpoint corrompido → stage nao-iniciado (fail-soft)', async () => {
  const root = await newProjectRoot();
  try {
    const a = await addProcess(root, 'Vendas');
    await fs.mkdir(path.join(root, 'processos', a.slug, '.process-ai'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'processos', a.slug, '.process-ai', 'checkpoint.json'),
      '{ not valid json',
      'utf8',
    );
    const list = await listProcesses(root);
    assert.equal(list[0].stage, 'nao-iniciado');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- readPortfolio (fail-soft) ----

test('readPortfolio: ledger corrompido → PortfolioError', async () => {
  const root = await newProjectRoot();
  try {
    await fs.mkdir(path.join(root, '.process-ai'), { recursive: true });
    await fs.writeFile(path.join(root, '.process-ai', 'portfolio.json'), '{ broken', 'utf8');
    await assert.rejects(() => readPortfolio(root), PortfolioError);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
