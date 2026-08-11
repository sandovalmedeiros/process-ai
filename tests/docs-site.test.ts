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
} from '../scripts/docs-site/extract.ts';
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
  artifacts.push(
    await add('hierarchy', '# Hierarquia: Vendas\n\n**Lead**: contato inicial do prospect.\n\n## Negociação\nProposta enviada.'),
  );
  artifacts.push(await add('reference-material', '# Manual de Vendas (legado)\nDocumento ingerido.'));
  artifacts.push(
    await add('pop', '# POP — Proposta comercial\n**SLA**: prazo de resposta ao cliente.\n\n**Gargalo**: etapa lenta da esteira.'),
  );
  artifacts.push(await add('process-report', '# Relatório de documentação\nConsolidação final do mapeamento.'));

  await fs.writeFile(
    path.join(root, '.process-ai', 'checkpoint.json'),
    JSON.stringify({ stage: 'summary', artifacts }),
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
