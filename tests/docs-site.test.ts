/**
 * tests/docs-site.test.ts — smoke test do gerador do mini-site (time da Monique).
 *
 * Cobre:
 *  - generateDocs(): produz index + topologia + glossario com <title> e doctype.
 *  - seed determinístico (mesmo checkpoint ⇒ mesmo seed).
 *  - allowlist `only` gera só a página pedida.
 *  - checkpoint ausente ⇒ site vazio + warning, sem lançtar.
 *  - extract.ts (pure functions): resolveBody, extractTitle, extractGlossaryTerms, countByType.
 *  - escape hatch: validateContent('process-docs', …) → válido (process-docs fora do SCHEMAS).
 *
 * O gerador vive em scripts/docs-site/ (fora do core — AD-3); o teste o importa
 * diretamente. validateContent é importado do core para confirmar o escape hatch
 * (mesmo mecanismo do flow-image do Guilherme).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { generateDocs } from '../scripts/docs-site/generate.ts';
import {
  resolveBody,
  extractTitle,
  extractGlossaryTerms,
  countByType,
  parseProvenance,
  gateDecisionPt,
  gateNumber,
  parsePop,
  truncateMd,
  parseSipocRows,
  parseValueChainLinks,
  buildSupplierCustomerGraph,
  parseHierarchy,
  buildHierarchyTreemap,
  buildLevelDistribution,
  computePopCoverage,
} from '../scripts/docs-site/extract.ts';
import { renderMarkdownLite } from '../scripts/docs-site/render/markdown.ts';
import { validateContent } from '../toolkit/src/schema-core.ts';

function sha(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Monta um fixture completo (.process-ai/checkpoint.json + manifestos + bodies) em tmpdir. */
async function buildFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-docssite-'));
  const manDir = path.join(root, '.process-ai', 'manifests');
  await fs.mkdir(manDir, { recursive: true });

  async function add(type: string, body: string) {
    const h = sha(body + type);
    const short = h.slice(0, 12);
    const relFile = `_process-ai_output/${type}/${short}.md`;
    await fs.mkdir(path.join(root, `_process-ai_output/${type}`), { recursive: true });
    await fs.writeFile(path.join(root, relFile), body, 'utf8');
    const manPath = `.process-ai/manifests/${type}-${short}.json`;
    await fs.writeFile(
      path.join(root, manPath),
      JSON.stringify({ sha256: h, artifactType: type, artifactPath: relFile }),
      'utf8',
    );
    return { sha256: h, artifactType: type, path: manPath };
  }

  const artifacts: Array<{ sha256: string; artifactType: string; path: string }> = [];
  // hierarchy canônico (IDs M/E/S/A/T) — alimenta a árvore 3D (P3). 5 níveis:
  // 1 M, 1 E, 2 S, 3 A, 5 T = 12 nós. Exercita pai explícito (E1.1 → M1),
  // implícito (T... → A...) e externo (M1 → Cadeia de Valor → raiz).
  const hierarchy = await add(
    'hierarchy',
    [
      '# Hierarquia — Processo de Vendas (Lead-to-Cash)',
      '',
      '## M1. Vendas (Macroprocesso) — pai: Cadeia de Valor',
      'Gerir o ciclo comercial do lead ao fechamento.',
      '',
      '### E1.1. Lead-to-Cash (Processo) — pai: M1',
      'Ciclo completo do lead até o contrato assinado.',
      '',
      '#### S1.1.1. Prospecção (Subprocesso) — pai: E1.1',
      'Captar e qualificar leads.',
      '- A1.1.1.1. Captar leads (Atividade) — pai: S1.1.1',
      '  - T1.1.1.1.1. Receber leads do site — pai: A1.1.1.1',
      '  - T1.1.1.1.2. Importar campanhas — pai: A1.1.1.1',
      '- A1.1.1.2. Qualificar leads (Atividade) — pai: S1.1.1',
      '  - T1.1.1.2.1. Aplicar critérios BANT — pai: A1.1.1.2',
      '',
      '#### S1.1.2. Proposta (Subprocesso) — pai: E1.1',
      'Elaborar e enviar proposta comercial.',
      '- A1.1.2.1. Elaborar proposta (Atividade) — pai: S1.1.2',
      '  - T1.1.2.1.1. Calcular pricing — pai: A1.1.2.1',
      '',
    ].join('\n'),
  );
  artifacts.push(hierarchy);
  artifacts.push(await add('reference-material', '# Manual de Vendas (legado)\nDocumento ingerido.'));
  // SIPOC canônico (tabela S/I/P/O/C — formato que o parser deve ler).
  const sipoc = await add(
    'sipoc',
    [
      '# SIPOC — Processo de Vendas',
      '',
      '| | Descrição |',
      '|---|---|',
      '| **S**uppliers | Marketing (Google Ads, LinkedIn, site), Clientes atuais (indicação), CRM (HubSpot) |',
      '| **I**nputs | Leads (40/mês), MQLs qualificados |',
      '| **P**rocess | Prospecção → Qualificação → Proposta → Negociação → Fechamento |',
      '| **O**utputs | Proposta comercial, Contrato assinado |',
      '| **C**ustomers | PMEs B2B (20-200 funcionários), Indústria leve |',
      '',
    ].join('\n'),
  );
  artifacts.push(sipoc);
  // Cadeia de valor canônica (elos N. **Name** — desc).
  const valueChain = await add(
    'value-chain',
    [
      '# Cadeia de Valor — Vendas',
      '',
      '1. **Prospecção** — Captação de leads.',
      '2. **Qualificação** — Avaliação de fit.',
      '3. **Proposta** — Proposta personalizada.',
      '4. **Fechamento** — Contrato + onboarding.',
      '',
    ].join('\n'),
  );
  artifacts.push(valueChain);
  // pop com 3 POPs nos 3 estilos de heading do codebase + seção de diagnóstico.
  // Mantém **SLA**/**Gargalo** (defs bold) p/ o teste de glossário P0 continuar verde.
  const pop = await add(
    'pop',
    [
      '# Procedimentos operacionais padronizados',
      '',
      '## POP — Qualificação de lead (ref: A1.1.1.1)',
      'Critérios de qualificação do prospect.',
      '',
      '# POP-001 — Proposta comercial (ref: A1.1.2.1)',
      '**SLA**: prazo de resposta ao cliente.',
      '',
      '# POP — Envio de proposta (A1.1.2.2)',
      '**Gargalo**: etapa lenta da esteira.',
      '',
      '## Diagnóstico',
      'Gargalo concentrado na proposta comercial.',
      '',
    ].join('\n'),
  );
  artifacts.push(pop);
  const report = await add('process-report', '# Relatório de documentação\nConsolidação final do mapeamento.');
  artifacts.push(report);

  // Gates de decisão no checkpoint (cronograma).
  const gates = [
    { gateId: 'gate-3.5', decision: 'approved', decidedAt: '2026-08-01T10:00:00Z' },
    { gateId: 'gate-4.5', decision: 'changes-requested', decidedAt: '2026-08-02T14:00:00Z' },
  ];

  await fs.writeFile(
    path.join(root, '.process-ai', 'checkpoint.json'),
    JSON.stringify({ stage: 'summary', artifacts, gates }),
    'utf8',
  );

  // Ledger de provenance (condicional no mundo real — só após 1º commit). reference-material
  // é deixado de fora de propósito: exercita o caminho "artefato sem ts" (null → "s/ data").
  const prov = [
    { sha256: hierarchy.sha256, artifactType: 'hierarchy', agent: 'Miguel', committedAt: '2026-08-01T09:00:00Z' },
    { sha256: pop.sha256, artifactType: 'pop', agent: 'Zanoni', committedAt: '2026-08-01T11:00:00Z' },
    { sha256: report.sha256, artifactType: 'process-report', agent: 'Tiago', committedAt: '2026-08-03T09:00:00Z' },
  ];
  await fs.writeFile(
    path.join(root, '.process-ai', 'provenance.jsonl'),
    prov.map((e) => JSON.stringify(e)).join('\n'),
    'utf8',
  );
  return root;
}

test('docs-site: generateDocs produz index + topologia + glossario com <title>', async () => {
  const root = await buildFixture();
  try {
    const result = await generateDocs({ root });
    const out = path.join(root, '_process-ai_output/docs');
    for (const name of ['index.html', 'topologia.html', 'glossario.html']) {
      const p = path.join(out, name);
      const st = await fs.stat(p);
      assert.ok(st.isFile(), `${name} deve existir`);
      const html = await fs.readFile(p, 'utf8');
      assert.match(html, /<!doctype html>/i, `${name} deve ter doctype`);
      assert.match(html, /<title>/, `${name} deve ter <title>`);
    }
    assert.ok(result.pages.length >= 3, 'deve listar ≥3 páginas');
    assert.match(result.seed, /^[0-9a-f]{16}$/, 'seed deve ter 16 hex chars');
    assert.equal(result.indexUrl, '_process-ai_output/docs/index.html');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('docs-site: glossario.html contém termos extraídos dos POPs', async () => {
  const root = await buildFixture();
  try {
    await generateDocs({ root, only: ['glossario'] });
    const html = await fs.readFile(path.join(root, '_process-ai_output/docs/glossario.html'), 'utf8');
    assert.ok(html.includes('SLA'), 'glossário deve conter o termo "SLA"');
    assert.ok(html.includes('Gargalo'), 'glossário deve conter o termo "Gargalo"');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('docs-site: seed determinístico (mesmo checkpoint ⇒ mesmo seed)', async () => {
  const root = await buildFixture();
  try {
    const a = await generateDocs({ root });
    const b = await generateDocs({ root });
    assert.equal(a.seed, b.seed, 'seed deve ser idêntico para o mesmo conjunto de artefatos');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('docs-site: allowlist only:[glossario] gera só a página pedida', async () => {
  const root = await buildFixture();
  try {
    const result = await generateDocs({ root, only: ['glossario'] });
    assert.ok(result.pages.includes('_process-ai_output/docs/glossario.html'), 'glossario deve ser gerada');
    assert.ok(!result.pages.includes('_process-ai_output/docs/index.html'), 'index NÃO deve ser gerada');
    assert.ok(!result.pages.includes('_process-ai_output/docs/topologia.html'), 'topologia NÃO deve ser gerada');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('docs-site: checkpoint ausente ⇒ site vazio + warning, sem lançar', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-docssite-empty-'));
  try {
    const result = await generateDocs({ root });
    assert.ok(result.warnings.length >= 1, 'deve registrar warning de checkpoint ausente');
    const idx = await fs.readFile(path.join(root, '_process-ai_output/docs/index.html'), 'utf8');
    assert.match(idx, /<title>/, 'mesmo vazio, index.html é gerada');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('extract: resolveBody aceita markdown cru, envelope {body} e vazio', () => {
  assert.equal(resolveBody('# Título\nplano'), '# Título\nplano');
  assert.equal(resolveBody('{"body":"# Título"}'), '# Título');
  assert.equal(resolveBody(''), '');
  // JSON sem campo body → devolve o raw.
  assert.equal(resolveBody('{"x":1}'), '{"x":1}');
});

test('extract: extractTitle pega # heading, senão primeira linha útil', () => {
  assert.equal(extractTitle('# Meu Título\nresto'), 'Meu Título');
  assert.equal(extractTitle('linha solta útil\n## ignora depois'), 'linha solta útil');
  assert.equal(extractTitle(''), '');
});

test('extract: extractGlossaryTerms pega **Termo**: def e ## Termo', () => {
  const terms = extractGlossaryTerms([
    { body: '**SLA**: prazo de resposta.\n**Gargalo**: etapa lenta.', source: 'pop' },
  ]);
  const names = terms.map((t) => t.term);
  assert.ok(names.includes('SLA'), 'deve extrair SLA');
  assert.ok(names.includes('Gargalo'), 'deve extrair Gargalo');

  const heading = extractGlossaryTerms([{ body: '## Negociação\nProposta enviada.', source: 'pop' }]);
  assert.ok(heading.some((t) => t.term === 'Negociação'), 'deve extrair termo de heading ##');
});

test('extract: countByType agrega corretamente', () => {
  assert.deepEqual(countByType(['a', 'a', 'b']), { a: 2, b: 1 });
  assert.deepEqual(countByType([]), {});
});

test('docs-site: process-docs passa pelo escape hatch do validateContent', () => {
  // process-docs está FORA do SCHEMAS canônico — deve ser aceito (escape hatch,
  // mesmo mecanismo do flow-image). Campos advisory (indexUrl, pages, seed, …)
  // não são rejeitados: só o `body` é persistido/hashado pelo commit.
  const r = validateContent('process-docs', {
    body: 'Mini-site HTML interativo do mapeamento.',
    indexUrl: '_process-ai_output/docs/index.html',
    pages: ['_process-ai_output/docs/index.html'],
    seed: 'abc123',
    vendoredLibs: [],
    warnings: [],
  });
  assert.equal(r.valid, true, 'process-docs deve ser aceito pelo escape hatch');
  assert.deepEqual(r.errors, []);
});

// ---- P1: extract (parsePop, parseProvenance, gates, truncateMd) ----

test('extract: parsePop divide o body nos 3 estilos de heading + captura diagnóstico', () => {
  const body = [
    '# Procedimentos',
    '',
    '## POP — Qualificação de lead (ref: A1.1.1.1)',
    'Critérios.',
    '',
    '# POP-001 — Proposta comercial (ref: A1.1.2.1)',
    'Envio.',
    '',
    '# POP — Envio de proposta (A1.1.2.2)',
    'Entrega.',
    '',
    '## Diagnóstico',
    'Gargalo na proposta.',
  ].join('\n');
  const parsed = parsePop(body);
  assert.equal(parsed.entries.length, 3, 'deve dividir em 3 POPs');
  assert.deepEqual(
    parsed.entries.map((e) => e.id),
    ['A1.1.1.1', 'A1.1.2.1', 'A1.1.2.2'],
    'ids na ordem de aparição',
  );
  assert.deepEqual(
    parsed.entries.map((e) => e.title),
    ['Qualificação de lead', 'Proposta comercial', 'Envio de proposta'],
    'títulos sem prefixo POP/POP-NNN',
  );
  assert.ok(parsed.diagnostic.includes('Gargalo na proposta'), 'diagnóstico capturado');
  // body de cada entry NÃO inclui a linha de heading.
  assert.ok(!parsed.entries[0].body.includes('POP —'), 'body sem o heading');
});

test('extract: parsePop sem headings de POP → entries vazias (defensivo)', () => {
  const parsed = parsePop('# Só um título\ntexto sem POPs aqui.');
  assert.equal(parsed.entries.length, 0);
  assert.equal(parsed.diagnostic, '');
});

test('extract: parseProvenance lê JSONL e pula linhas malformadas', () => {
  const jsonl = [
    '{"sha256":"aaa","artifactType":"pop","agent":"Zanoni","committedAt":"2026-08-01T11:00:00Z"}',
    '',
    'isto não é json',
    '{"sha256":"bbb"}',
    '{"artifactType":"x"}',
    '{"sha256":"ccc","artifactType":"hierarchy","agent":"Miguel","committedAt":"2026-08-01T09:00:00Z"}',
  ].join('\n');
  const entries = parseProvenance(jsonl);
  assert.equal(entries.length, 2, 'só as 2 linhas válidas com sha256+artifactType');
  assert.equal(entries[0].sha256, 'aaa');
  assert.equal(entries[1].agent, 'Miguel');
});

test('extract: gateDecisionPt traduz decisões canônicas p/ pt-BR; gateNumber extrai o número', () => {
  assert.equal(gateDecisionPt('approved'), 'aprovado');
  assert.equal(gateDecisionPt('rejected'), 'rejeitado');
  assert.equal(gateDecisionPt('changes-requested'), 'ajustes solicitados');
  assert.equal(gateDecisionPt('desconhecido'), 'desconhecido');
  assert.equal(gateNumber('gate-3.5'), '3.5');
  assert.equal(gateNumber('gate-5'), '5');
  assert.equal(gateNumber('sem-prefixo'), 'sem-prefixo');
});

test('extract: truncateMd preserva curtos e trunca longos com nota de trecho', () => {
  assert.equal(truncateMd('curto', 600), 'curto');
  const long = 'linha um\n'.repeat(200);
  const t = truncateMd(long, 600);
  assert.ok(t.length < long.length, 'deve truncar');
  assert.ok(t.includes('trecho'), 'deve anexar nota de trecho');
});

// ---- P1: render (renderMarkdownLite) ----

test('render: renderMarkdownLite cobre heading/bold/italic/code/listas/hr e escapa HTML', () => {
  assert.equal(renderMarkdownLite(''), '');
  const md = [
    '# Título',
    'Texto com **negrito** e *itálico* e `código`.',
    '- item a',
    '- item b',
    '1. primeiro',
    '---',
    '<script>x</script>',
  ].join('\n');
  const html = renderMarkdownLite(md);
  assert.ok(html.includes('<h2>Título</h2>'), 'heading # → h2');
  assert.ok(html.includes('<strong>negrito</strong>'), 'bold');
  assert.ok(html.includes('<em>itálico</em>'), 'itálico');
  assert.ok(html.includes('<code>código</code>'), 'code inline');
  assert.ok(html.includes('<ul>'), 'lista não-ordenada');
  assert.ok(html.includes('<ol>'), 'lista ordenada');
  assert.ok(html.includes('<hr>'), 'régua horizontal');
  // escape-first: conteúdo nunca injeta HTML cru.
  assert.ok(!html.includes('<script>'), 'script deve estar escapado');
  assert.ok(html.includes('&lt;script&gt;'), 'tags escapadas');
});

// ---- P1: generate (cronograma, deck, processos) ----

test('docs-site: cronograma.html com gates + commits ordenados por ts (provenance)', async () => {
  const root = await buildFixture();
  try {
    const result = await generateDocs({ root, only: ['cronograma'] });
    const html = await fs.readFile(path.join(root, '_process-ai_output/docs/cronograma.html'), 'utf8');
    assert.ok(result.pages.includes('_process-ai_output/docs/cronograma.html'));
    assert.match(html, /<title>Cronograma/, 'título da página');
    // Gates traduzidos.
    assert.ok(html.includes('Gate 3.5 — aprovado'), 'gate aprovado');
    assert.ok(html.includes('Gate 4.5 — ajustes solicitados'), 'gate changes-requested');
    // Commit do pop com agente (provenance cross-ref).
    assert.ok(html.includes('Zanoni → pop'), 'commit do pop com agente');
    // reference-material ficou sem provenance → "s/ data" honesto.
    assert.ok(html.includes('s/ data'), 'artefato sem ts mostra s/ data');
    // Ordenação: hierarchy (09:00) deve aparecer antes do gate-3.5 (10:00).
    const iHier = html.indexOf('2026-08-01T09:00:00Z');
    const iGate35 = html.indexOf('Gate 3.5');
    assert.ok(iHier > -1 && iGate35 > -1 && iHier < iGate35, 'commits ordenados antes do gate da mesma manhã');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('docs-site: deck.html gerada com slides (hero, POPs, rastreabilidade)', async () => {
  const root = await buildFixture();
  try {
    const result = await generateDocs({ root, only: ['deck'] });
    const html = await fs.readFile(path.join(root, '_process-ai_output/docs/deck.html'), 'utf8');
    assert.ok(result.pages.includes('_process-ai_output/docs/deck.html'));
    assert.match(html, /<title>Deck/);
    // hero = título do process-report.
    assert.ok(html.includes('Relatório de documentação'), 'slide cover usa o título do relatório');
    // POPs enumerados.
    assert.ok(html.includes('3 procedimento'), 'slide de POPs conta 3');
    assert.ok(html.includes('A1.1.1.1'), 'slide de POPs lista um ID');
    // nav por teclado presente.
    assert.ok(html.includes('ArrowRight'), 'navegação por teclado');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('docs-site: processos/<id>.html + processos/index.html (1 página por POP)', async () => {
  const root = await buildFixture();
  try {
    const result = await generateDocs({ root, only: ['processos'] });
    const ids = ['A1.1.1.1', 'A1.1.2.1', 'A1.1.2.2'];
    for (const id of ids) {
      const rel = `_process-ai_output/docs/processos/${id}.html`;
      assert.ok(result.pages.includes(rel), `${id}.html deve ser gerada`);
      const p = await fs.readFile(path.join(root, '_process-ai_output/docs/processos', `${id}.html`), 'utf8');
      assert.match(p, /<title>/);
      // páginas em subpasta usam relPrefix '../' → links relativos corretos.
      assert.ok(p.includes('../index.html'), 'nav relativa de volta à raiz');
    }
    const idx = await fs.readFile(path.join(root, '_process-ai_output/docs/processos/index.html'), 'utf8');
    for (const id of ids) {
      assert.ok(idx.includes(id), `índice lista ${id}`);
    }
    // body do POP A1.1.2.1 contém o termo SLA (bold → strong).
    const p121 = await fs.readFile(path.join(root, '_process-ai_output/docs/processos/A1.1.2.1.html'), 'utf8');
    assert.ok(p121.includes('SLA'), 'página do POP renderiza o body');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- P2: extract (grafo fornecedores↔clientes) ----

test('extract: parseSipocRows extrai as 5 linhas (split por vírgula de nível 0; process em →)', () => {
  const body = [
    '# SIPOC — Vendas',
    '',
    '| | Descrição |',
    '|---|---|',
    '| **S**uppliers | Marketing (Google Ads, LinkedIn, site), Clientes atuais (indicação), CRM (HubSpot) |',
    '| **I**nputs | Leads, MQLs |',
    '| **P**rocess | Prospecção → Qualificação → Proposta |',
    '| **O**utputs | Proposta, Contrato |',
    '| **C**ustomers | PMEs B2B, Indústria |',
  ].join('\n');
  const rows = parseSipocRows(body);
  assert.equal(rows.suppliers.length, 3, '3 fornecedores (vírgulas dentro de () não contam)');
  assert.ok(rows.suppliers[0].startsWith('Marketing'));
  assert.equal(rows.customers.length, 2);
  assert.deepEqual(rows.process, ['Prospecção', 'Qualificação', 'Proposta'], 'process split em →');
  // robustez: letra bold "**C**customers" (typo) ainda casa pelo fallback de letra.
  const typo = parseSipocRows('| **C**customers | A, B |');
  assert.equal(typo.customers.length, 2, 'fallback de letra SIPOC casa **C**customers');
  assert.equal(parseSipocRows('').suppliers.length, 0, 'body vazio → vazio');
});

test('extract: parseValueChainLinks extrai elos ordenados (N. **Name** — desc)', () => {
  const body = [
    '# Cadeia de Valor',
    '',
    '1. **Prospecção** — Captação de leads.',
    '2. **Qualificação** — Avaliação de fit.',
    '3. **Proposta** — Personalizada.',
  ].join('\n');
  assert.deepEqual(parseValueChainLinks(body), ['Prospecção', 'Qualificação', 'Proposta']);
  assert.deepEqual(parseValueChainLinks('sem lista'), []);
  assert.deepEqual(parseValueChainLinks(''), []);
});

test('extract: buildSupplierCustomerGraph monta suppliers→cadeia→customers', () => {
  const sipocBody = [
    '| **S**uppliers | Marketing, CRM |',
    '| **P**rocess | Prospecção → Proposta |',
    '| **C**ustomers | PMEs, Indústria |',
  ].join('\n');
  const vcBody = '1. **Prospecção** — x\n2. **Proposta** — y\n';
  const g = buildSupplierCustomerGraph(sipocBody, vcBody);
  // value-chain tem prioridade → cadeia = elos da VC.
  const procLabels = g.nodes.filter((n) => n.group === 'process').map((n) => n.label);
  assert.deepEqual(procLabels, ['Prospecção', 'Proposta'], 'cadeia vem da value-chain');
  assert.equal(g.nodes.filter((n) => n.group === 'supplier').length, 2);
  assert.equal(g.nodes.filter((n) => n.group === 'customer').length, 2);
  // arestas: suppliers → Prospecção; Prospecção → Proposta; Proposta → customers.
  assert.equal(g.links.length, 2 + 1 + 2, '2 sup→first + 1 chain + 2 last→cust');
  assert.ok(g.links.some((l) => l.source.startsWith('sup:') && l.target.endsWith('Prospecção')));
  assert.ok(g.links.some((l) => l.source.endsWith('Prospecção') && l.target.endsWith('Proposta')));
});

test('extract: buildSupplierCustomerGraph sem value-chain cai para a linha Process do SIPOC', () => {
  const sipocBody = '| **S**uppliers | A, B |\n| **P**rocess | Captação → Fechamento |\n| **C**ustomers | X |';
  const g = buildSupplierCustomerGraph(sipocBody);
  const procLabels = g.nodes.filter((n) => n.group === 'process').map((n) => n.label);
  assert.deepEqual(procLabels, ['Captação', 'Fechamento'], 'sem VC, cadeia = Process do SIPOC');
});

test('extract: buildSupplierCustomerGraph sem cadeia usa nó "Processo" central', () => {
  // só suppliers + customers, sem Process e sem VC.
  const g = buildSupplierCustomerGraph('| **S**uppliers | A |\n| **C**ustomers | B |');
  const proc = g.nodes.filter((n) => n.group === 'process');
  assert.equal(proc.length, 1);
  assert.equal(proc[0].label, 'Processo', 'fallback: nó Processo central');
  assert.equal(g.links.length, 2, 'A→Processo, Processo→B');
});

test('extract: buildSupplierCustomerGraph sem nada → grafo vazio (honesto)', () => {
  const g = buildSupplierCustomerGraph('');
  assert.equal(g.nodes.length, 0);
  assert.equal(g.links.length, 0);
});

// ---- P2: generate (fornecedores-clientes + D3 vendorado) ----

test('docs-site: fornecedores-clientes.html gerada com grafo + dep d3 vendorado', async () => {
  const root = await buildFixture();
  try {
    const result = await generateDocs({ root, only: ['fornecedores-clientes'] });
    assert.ok(result.pages.includes('_process-ai_output/docs/fornecedores-clientes.html'));
    // d3 entra em vendoredLibs (advisory honesto — só libs usadas).
    assert.ok(result.vendoredLibs.some((v) => v.name === 'd3' && v.license === 'ISC'), 'd3 em vendoredLibs');
    const html = await fs.readFile(path.join(root, '_process-ai_output/docs/fornecedores-clientes.html'), 'utf8');
    assert.match(html, /<title>Fornecedores/, 'título da página');
    // referencia d3 vendorado por caminho relativo.
    assert.ok(html.includes('assets/vendor/d3/7/d3.min.js'), 'script src d3 vendorado');
    // embute o grafo como JSON p/ o pageScript consumir.
    assert.ok(html.includes('id="pa-data"'), 'dados do grafo embutidos');
    // pageScript envolvido em DOMContentLoaded (invariante p/ lib defer).
    assert.ok(html.includes("window.addEventListener('DOMContentLoaded'"), 'DOMContentLoaded wrap');
    // O JSON embutido é HTML-escapado (&quot;) — decodifica e parseia para validar a estrutura.
    const m = /<script type="application\/json" id="pa-data">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(m, 'blob pa-data presente');
    const data = JSON.parse(
      m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    ) as { nodes: Array<{ group: string; label: string }>; links: Array<{ source: string; target: string }> };
    const groups = data.nodes.map((n) => n.group);
    assert.ok(groups.includes('supplier'), 'grafo tem nós supplier');
    assert.ok(groups.includes('process'), 'grafo tem nós process (cadeia da value-chain)');
    assert.ok(groups.includes('customer'), 'grafo tem nós customer');
    assert.ok(data.links.length > 0, 'grafo tem arestas');
    // a lib d3 foi copiada para o output (file:// offline).
    const d3Out = path.join(root, '_process-ai_output/docs/assets/vendor/d3/7/d3.min.js');
    const st = await fs.stat(d3Out);
    assert.ok(st.isFile(), 'd3.min.js copiado para assets/vendor');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('docs-site: skill do João tem frontmatter + escopo only:[fornecedores-clientes, hierarquia-3d] + sem propose', async () => {
  const skill = await fs.readFile(
    path.resolve(import.meta.dirname, '..', 'skills', 'process-ai-monique-joao', 'SKILL.md'),
    'utf8',
  );
  assert.match(skill, /^name: process-ai-monique-joao/m, 'frontmatter name');
  assert.match(skill, /^description: .+/m, 'frontmatter description');
  assert.ok(skill.includes('João, o Cartógrafo'), 'persona João');
  // P3: o João agora cobre as DUAS páginas (fornecedores-clientes + hierarquia-3d).
  assert.ok(
    skill.includes("only: ['fornecedores-clientes', 'hierarquia-3d']"),
    'escopo P3 do João (ambas as páginas)',
  );
  assert.ok(skill.includes('hierarquia-3d.html'), 'skill referencia hierarquia-3d.html');
  // o João NÃO propõe artefato (AD-1) — o process-docs é da Monique.
  assert.ok(/não propõe|n[oã]o.*propor|Nenhum.*prop[oõ]e/i.test(skill), 'declara que não propõe artefato');
});

// ---- P3: extract (parseHierarchy) ----

/** Body canônico de hierarquia para os testes unitários do parser. */
const HIERARCHY_BODY = [
  '# Hierarquia — Vendas',
  '',
  '## M1. Vendas (Macroprocesso) — pai: Cadeia de Valor',
  'Gerir o ciclo comercial.',
  '',
  '### E1.1. Lead-to-Cash (Processo) — pai: M1',
  'Ciclo do lead ao contrato.',
  '',
  '#### S1.1.1. Prospecção (Subprocesso) — pai: E1.1',
  'Captar e qualificar.',
  '- A1.1.1.1. Captar leads (Atividade) — pai: S1.1.1',
  '  - T1.1.1.1.1. Receber leads do site — pai: A1.1.1.1',
  '- A1.1.1.2. Qualificar leads (Atividade) — pai: S1.1.1',
  '',
  '#### S1.1.2. Proposta (Subprocesso) — pai: E1.1',
  'Elaborar proposta.',
  '- A1.1.2.1. Elaborar (Atividade) — pai: S1.1.2',
  '',
].join('\n');

test('extract: parseHierarchy extrai nós M/E/S/A/T com id/label/levelName/depth', () => {
  const tree = parseHierarchy(HIERARCHY_BODY);
  // 1 M + 1 E + 2 S + 3 A + 1 T = 8 nós.
  assert.equal(tree.nodes.length, 8, '8 nós no total');
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const m1 = byId.get('M1');
  assert.ok(m1, 'M1 presente');
  assert.equal(m1!.level, 'M');
  assert.equal(m1!.depth, 0);
  assert.equal(m1!.label, 'Vendas', 'label limpo (sem ID, sem parentética, sem pai)');
  assert.equal(m1!.levelName, 'Macroprocesso', 'levelName da parentética');
  const t = byId.get('T1.1.1.1.1');
  assert.ok(t, 'T1.1.1.1.1 presente');
  assert.equal(t!.level, 'T');
  assert.equal(t!.depth, 4);
  assert.equal(t!.label, 'Receber leads do site');
  assert.equal(t!.levelName, 'Tarefa', 'levelName default p/ T (sem parentética)');
});

test('extract: parseHierarchy resolve pai (explícito in-set → implícito → raiz)', () => {
  const tree = parseHierarchy(HIERARCHY_BODY);
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  // pai explícito que existe na árvore.
  assert.equal(byId.get('E1.1')!.parentId, 'M1', 'E1.1 → M1 (explícito)');
  assert.equal(byId.get('S1.1.1')!.parentId, 'E1.1', 'S1.1.1 → E1.1');
  // pai implícito pela estrutura do ID (T1.1.1.1.1 → A1.1.1.1, mesmo sem conferir o "pai:").
  assert.equal(byId.get('T1.1.1.1.1')!.parentId, 'A1.1.1.1', 'T → A (implícito por drop de segmento)');
  assert.equal(byId.get('A1.1.2.1')!.parentId, 'S1.1.2', 'A1.1.2.1 → S1.1.2 (explícito)');
  // pai externo ("Cadeia de Valor") não está na árvore → implícito é null (M é raiz) → parentId null.
  assert.equal(byId.get('M1')!.parentId, null, 'M1 é raiz (pai externo não resolvível)');
  assert.deepEqual(tree.rootIds, ['M1'], 'única raiz = M1');
});

test('extract: parseHierarchy resolve pai implícito mesmo sem sufixo "— pai:"', () => {
  // Sem nenhum "— pai:" explícito — o parser deve reconstruir a árvore pela estrutura do ID.
  const body = [
    '## M1. Vendas (Macroprocesso)',
    '### E1.1. Lead-to-Cash (Processo)',
    '#### S1.1.1. Prospecção (Subprocesso)',
    '- A1.1.1.1. Captar (Atividade)',
    '  - T1.1.1.1.1. Receber (Atividade)',
  ].join('\n');
  const tree = parseHierarchy(body);
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  assert.equal(byId.get('E1.1')!.parentId, 'M1', 'E1.1 → M1 implícito');
  assert.equal(byId.get('S1.1.1')!.parentId, 'E1.1', 'S1.1.1 → E1.1 implícito');
  assert.equal(byId.get('A1.1.1.1')!.parentId, 'S1.1.1', 'A → S implícito');
  assert.equal(byId.get('T1.1.1.1.1')!.parentId, 'A1.1.1.1', 'T → A implícito');
});

test('extract: parseHierarchy defensivo (vazio / sem IDs / dedupe)', () => {
  assert.equal(parseHierarchy('').nodes.length, 0, 'body vazio → árvore vazia');
  assert.equal(parseHierarchy('# Só um título\ntexto comum sem IDs.').nodes.length, 0, 'sem IDs hierárquicos → vazio');
  // linha de bullet comum (sem ID) é ignorada.
  assert.equal(parseHierarchy('- item genérico\n- outro').nodes.length, 0);
  // dedupe: o mesmo ID em heading + bullet conta uma vez.
  const dup = parseHierarchy('## M1. Vendas (Macroprocesso)\n- M1. Vendas (Macroprocesso)');
  const m1 = dup.nodes.filter((n) => n.id === 'M1');
  assert.equal(m1.length, 1, 'ID duplicado conta uma vez (primeira ocorrência)');
});

// ---- P3: generate (hierarquia-3d + Three.js vendorado) ----

test('docs-site: hierarquia-3d.html gerada com árvore + dep three vendorada', async () => {
  const root = await buildFixture();
  try {
    const result = await generateDocs({ root, only: ['hierarquia-3d'] });
    assert.ok(result.pages.includes('_process-ai_output/docs/hierarquia-3d.html'));
    // three entra em vendoredLibs (advisory honesto — só libs usadas).
    assert.ok(
      result.vendoredLibs.some((v) => v.name === 'three' && v.license === 'MIT' && v.version === '0.137.0'),
      'three r137 MIT em vendoredLibs',
    );
    const html = await fs.readFile(path.join(root, '_process-ai_output/docs/hierarquia-3d.html'), 'utf8');
    assert.match(html, /<title>Hierarquia 3D/, 'título da página');
    // referencia three vendorado por caminho relativo.
    assert.ok(html.includes('assets/vendor/three/0.137.0/three.min.js'), 'script src three vendorado');
    // embute a árvore como JSON p/ o pageScript consumir.
    assert.ok(html.includes('id="pa-data"'), 'dados da árvore embutidos');
    // pageScript envolvido em DOMContentLoaded (invariante p/ lib defer).
    assert.ok(html.includes("window.addEventListener('DOMContentLoaded'"), 'DOMContentLoaded wrap');
    // a lib three foi copiada para o output (file:// offline).
    const threeOut = path.join(root, '_process-ai_output/docs/assets/vendor/three/0.137.0/three.min.js');
    const st = await fs.stat(threeOut);
    assert.ok(st.isFile(), 'three.min.js copiado para assets/vendor');
    assert.ok(st.size > 600_000, 'three.min.js tem tamanho esperado (~619 KB)');

    // O JSON embutido é HTML-escapado — decodifica e parseia para validar a árvore.
    const m = /<script type="application\/json" id="pa-data">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(m, 'blob pa-data presente');
    const data = JSON.parse(
      m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    ) as {
      nodes: Array<{ id: string; level: string; label: string; parentId: string | null; depth: number }>;
      rootIds: string[];
    };
    const levels = data.nodes.map((n) => n.level);
    for (const lv of ['M', 'E', 'S', 'A', 'T']) {
      assert.ok(levels.includes(lv), `árvore tem ao menos um nó de nível ${lv}`);
    }
    assert.ok(data.rootIds.includes('M1'), 'M1 é raiz');
    const t = data.nodes.find((n) => n.id === 'T1.1.1.1.1');
    assert.ok(t && t.parentId === 'A1.1.1.1', 'T1.1.1.1.1 → A1.1.1.1 no JSON embutido');

    // fallback textual (lista aninhada) está no DOM — legível sem WebGL.
    assert.ok(html.includes('pa-fallback'), 'container de fallback presente');
    assert.ok(html.includes('pa-tree'), 'árvore textual aninhada renderizada server-side');
    assert.ok(html.includes('T1.1.1.1.1'), 'fallback lista o ID de tarefa');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- P4: extract (métricas: treemap, nível, cobertura POP) ----

test('extract: buildHierarchyTreemap monta floresta aninhada (folhas value=1)', () => {
  const tree = parseHierarchy(HIERARCHY_BODY);
  const tm = buildHierarchyTreemap(tree);
  // 1 raiz (M1) → floresta de 1 elemento.
  assert.equal(tm.length, 1, 'uma raiz → top-level de 1');
  assert.equal(tm[0].name, 'Vendas', 'raiz = M1 (label Vendas)');
  assert.ok(tm[0].children && tm[0].children.length > 0, 'raiz tem filhos');
  // Folhas (value=1): T1.1.1.1.1 (Receber), A1.1.1.2 (Qualificar), A1.1.2.1 (Elaborar) = 3.
  const json = JSON.stringify(tm);
  assert.equal((json.match(/"value":1/g) || []).length, 3, '3 folhas com value=1');
  // Nomes legíveis chegaram ao treemap (escapados no JSON).
  assert.ok(json.includes('Receber'), 'folha Tarefa presente');
  assert.ok(json.includes('Qualificar'), 'folha Atividade presente');
  // nó interno NÃO carrega value (delega a soma aos filhos).
  assert.ok(!/"name":"Vendas","value":/.test(json), 'interno sem value');
});

test('extract: buildHierarchyTreemap defensivo (vazio → [])', () => {
  assert.deepEqual(buildHierarchyTreemap(parseHierarchy('')), []);
  assert.deepEqual(buildHierarchyTreemap(parseHierarchy('# sem IDs')), []);
});

test('extract: buildLevelDistribution conta nós por nível M→T na ordem canônica', () => {
  const dist = buildLevelDistribution(parseHierarchy(HIERARCHY_BODY));
  // HIERARCHY_BODY: 1 M, 1 E, 2 S, 3 A, 1 T.
  assert.deepEqual(
    dist.map((d) => d.level),
    ['M', 'E', 'S', 'A', 'T'],
    'ordem canônica, todos os níveis presentes',
  );
  assert.deepEqual(
    dist.map((d) => d.count),
    [1, 1, 2, 3, 1],
    'contagens por nível',
  );
  assert.equal(dist[2].levelName, 'Subprocesso', 'levelName do nível S');
  // níveis ausentes são omitidos (só M presente).
  const onlyM = buildLevelDistribution(parseHierarchy('## M1. X (Macroprocesso)'));
  assert.deepEqual(onlyM.map((d) => d.level), ['M'], 'omite níveis sem nós');
});

test('extract: computePopCoverage cruza Atividades com IDs de POP (A direto + T→A implícito)', () => {
  const tree = parseHierarchy(HIERARCHY_BODY);
  // Atividades: A1.1.1.1, A1.1.1.2, A1.1.2.1 (3).
  // POPs: A1.1.1.1 (direto), T1.1.1.1.1 (→ A1.1.1.1 implícito, mesma cobertura),
  //       A1.1.2.2 (A-level mas não é Atividade da árvore). → cobertas = {A1.1.1.1}.
  const cov = computePopCoverage(tree, new Set(['A1.1.1.1', 'T1.1.1.1.1', 'A1.1.2.2']));
  assert.equal(cov.total, 3, '3 Atividades');
  assert.equal(cov.covered, 1, 'só A1.1.1.1 coberta');
  assert.equal(cov.gap, 2, '2 em gap');
  // sem hierarquia → 0/0/0 (a página mostra "sem dados").
  assert.deepEqual(computePopCoverage(parseHierarchy(''), new Set(['A1.1.1.1'])), {
    total: 0,
    covered: 0,
    gap: 0,
  });
});

// ---- P4: generate (metricas.html + ECharts vendorado) ----

test('docs-site: metricas.html gerada com 4 charts + dep echarts vendorada', async () => {
  const root = await buildFixture();
  try {
    const result = await generateDocs({ root, only: ['metricas'] });
    assert.ok(result.pages.includes('_process-ai_output/docs/metricas.html'));
    // echarts entra em vendoredLibs (advisory honesto — só libs usadas).
    assert.ok(
      result.vendoredLibs.some(
        (v) => v.name === 'echarts' && v.license === 'Apache-2.0' && v.version === '5.5.0',
      ),
      'echarts 5.5.0 Apache-2.0 em vendoredLibs',
    );
    const html = await fs.readFile(path.join(root, '_process-ai_output/docs/metricas.html'), 'utf8');
    assert.match(html, /<title>Métricas/, 'título da página');
    // referencia echarts vendorado por caminho relativo.
    assert.ok(html.includes('assets/vendor/echarts/5.5.0/echarts.min.js'), 'script src echarts vendorado');
    // embute os dados como JSON p/ o pageScript consumir.
    assert.ok(html.includes('id="pa-data"'), 'dados das métricas embutidos');
    // pageScript envolvido em DOMContentLoaded (invariante p/ lib defer).
    assert.ok(html.includes("window.addEventListener('DOMContentLoaded'"), 'DOMContentLoaded wrap');
    // 4 containers de chart.
    for (const id of ['ch-treemap', 'ch-levels', 'ch-types', 'ch-coverage']) {
      assert.ok(html.includes(`id="${id}"`), `container de chart ${id} presente`);
    }
    // a lib echarts foi copiada para o output (file:// offline).
    const echartsOut = path.join(root, '_process-ai_output/docs/assets/vendor/echarts/5.5.0/echarts.min.js');
    const st = await fs.stat(echartsOut);
    assert.ok(st.isFile(), 'echarts.min.js copiado para assets/vendor');
    assert.ok(st.size > 1_000_000, 'echarts.min.js tem tamanho esperado (~1.0 MB)');

    // O JSON embutido é HTML-escapado — decodifica e parseia para validar as métricas.
    const m = /<script type="application\/json" id="pa-data">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(m, 'blob pa-data presente');
    const data = JSON.parse(
      m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    ) as {
      treemap: Array<{ name: string }>;
      levelDistribution: Array<{ level: string; levelName: string; count: number }>;
      artifactCounts: Array<{ name: string; value: number }>;
      popCoverage: { total: number; covered: number; gap: number };
      totalArtifacts: number;
    };
    assert.ok(data.treemap.length > 0, 'treemap não-vazio (hierarchy presente no fixture)');
    // distribuição cobre os 5 níveis.
    const levels = data.levelDistribution.map((d) => d.level).sort();
    assert.deepEqual(levels, ['A', 'E', 'M', 'S', 'T'], 'donut tem os 5 níveis');
    // cobertura: fixture tem 3 Atividades, POPs em A1.1.1.1 + A1.1.2.1 (A1.1.2.2 é POP sem Atividade) → 2 cobertas, 1 gap.
    assert.deepEqual(data.popCoverage, { total: 3, covered: 2, gap: 1 }, 'cobertura de POPs honesta');
    // barras: ao menos os tipos do fixture (hierarchy, sipoc, value-chain, pop, …).
    assert.ok(data.artifactCounts.length > 0, 'contagem por tipo não-vazia');
    assert.ok(data.artifactCounts.some((t) => t.name === 'pop'), 'barras incluem o tipo pop');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- P4: generate (telemetry local) ----

test('docs-site: telemetry local — conteúdo escreve pa:views; index só lê (trackView:false)', async () => {
  const root = await buildFixture();
  try {
    await generateDocs({ root });
    const out = path.join(root, '_process-ai_output/docs');
    const idx = await fs.readFile(path.join(out, 'index.html'), 'utf8');
    // index tem a seção de leitura e NÃO escreve (trackView:false → sem tracker).
    assert.ok(idx.includes('pa-recent'), 'index tem a seção "últimas páginas vistas"');
    assert.ok(idx.includes('pa:views'), 'index lê pa:views');
    assert.ok(!idx.includes('setItem'), 'index não escreve no localStorage (só lê)');
    // uma página de conteúdo tem o tracker (default-on) que escreve.
    const metricas = await fs.readFile(path.join(out, 'metricas.html'), 'utf8');
    assert.ok(metricas.includes('pa:views'), 'página de conteúdo tem o tracker');
    assert.ok(metricas.includes('setItem'), 'página de conteúdo escreve pa:views');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---- P4: skills Mônica / Sarah / Victor ----

test('docs-site: skill da Mônica tem frontmatter + escopo only:[metricas, cronograma] + sem propose', async () => {
  const skill = await fs.readFile(
    path.resolve(import.meta.dirname, '..', 'skills', 'process-ai-monique-monica', 'SKILL.md'),
    'utf8',
  );
  assert.match(skill, /^name: process-ai-monique-monica/m, 'frontmatter name');
  assert.match(skill, /^description: .+/m, 'frontmatter description');
  assert.ok(skill.includes('Mônica, a Analista'), 'persona Mônica');
  assert.ok(skill.includes("only: ['metricas', 'cronograma']"), 'escopo da Mônica');
  assert.ok(skill.includes('metricas.html'), 'skill referencia metricas.html');
  assert.ok(skill.includes('echarts'), 'skill menciona echarts (Apache-2.0)');
  assert.ok(/não propõe|n[oã]o.*propor|Nenhum.*prop[oõ]e/i.test(skill), 'declara que não propõe artefato');
});

test('docs-site: skill da Sarah tem frontmatter + escopo only:[glossario, deck, processos] + sem propose', async () => {
  const skill = await fs.readFile(
    path.resolve(import.meta.dirname, '..', 'skills', 'process-ai-monique-sarah', 'SKILL.md'),
    'utf8',
  );
  assert.match(skill, /^name: process-ai-monique-sarah/m, 'frontmatter name');
  assert.match(skill, /^description: .+/m, 'frontmatter description');
  assert.ok(skill.includes('Sarah, a Narradora'), 'persona Sarah');
  assert.ok(
    skill.includes("only: ['glossario', 'deck', 'processos']"),
    'escopo da Sarah',
  );
  assert.ok(skill.includes('deck.html'), 'skill referencia deck.html');
  assert.ok(/não propõe|n[oã]o.*propor|Nenhum.*prop[oõ]e/i.test(skill), 'declara que não propõe artefato');
});

test('docs-site: skill do Victor tem frontmatter + escopo only:[index] + sem propose', async () => {
  const skill = await fs.readFile(
    path.resolve(import.meta.dirname, '..', 'skills', 'process-ai-monique-victor', 'SKILL.md'),
    'utf8',
  );
  assert.match(skill, /^name: process-ai-monique-victor/m, 'frontmatter name');
  assert.match(skill, /^description: .+/m, 'frontmatter description');
  assert.ok(skill.includes('Victor, o Publicador'), 'persona Victor');
  assert.ok(skill.includes("only: ['index']"), 'escopo do Victor');
  assert.ok(skill.includes('index.html'), 'skill referencia index.html');
  assert.ok(/não propõe|n[oã]o.*propor|Nenhum.*prop[oõ]e/i.test(skill), 'declara que não propõe artefato');
});
