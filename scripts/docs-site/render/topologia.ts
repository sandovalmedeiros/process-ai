/**
 * scripts/docs-site/render/topologia.ts — topologia "antes × depois".
 * Antes: documentação prévia ingerida (reference-material).
 * Depois: mapeamento gerado pelo pipeline (hierarchy/flow/flow-image/pop).
 * INVARIANTE AD-3: vive em scripts/.
 */
import { wrapPage, escapeHtml } from './page.ts';

export interface TopologiaItem {
  title: string;
  artifactType: string;
  shaShort: string;
}
export interface TopologiaInput {
  before: ReadonlyArray<TopologiaItem>;
  after: ReadonlyArray<TopologiaItem>;
}

function column(title: string, hint: string, items: ReadonlyArray<TopologiaItem>): string {
  const list = items.length
    ? `<ul style="padding-left:1.1rem">${items
        .map(
          (i) =>
            `<li>${escapeHtml(i.title)} <span class="tag">${escapeHtml(i.artifactType)}</span> <code>${escapeHtml(i.shaShort)}</code></li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">(nenhum)</p>';
  return `<div class="card">
  <h2 style="margin-top:0">${escapeHtml(title)}</h2>
  <p class="muted">${escapeHtml(hint)}</p>
  ${list}
</div>`;
}

export function renderTopologiaPage(input: TopologiaInput): string {
  const body = `
<h1>Topologia — antes × depois</h1>
<p class="muted">Comparação entre a documentação prévia disponível (material ingerido) e o mapeamento estruturado entregue pelo pipeline do process-ai.</p>
<div class="row" style="grid-template-columns:1fr 1fr">
${column('Antes', 'Material de referência ingerido (PDF/DOCX/PPTX/…)', input.before)}
${column('Depois', 'Mapeamento estruturado entregue (hierarquia, fluxo, POPs)', input.after)}
</div>`;
  return wrapPage({
    title: 'Topologia',
    bodyHtml: body,
    description: 'Antes × depois do mapeamento de processos.',
  });
}
