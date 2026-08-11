/**
 * scripts/docs-site/render/processo.ts — processos/<id>.html (1 página por POP).
 *
 * Cada procedimento operacional ganha sua própria página imprimível, com selo de
 * rastreabilidade (SHA-256) e o body renderizado via renderMarkdownLite.
 * O parsing (split do body pop por ID) fica em extract.ts/generate.ts.
 * INVARIANTE AD-3: vive em scripts/.
 */
import { wrapPage, escapeHtml } from './page.ts';
import { renderMarkdownLite } from './markdown.ts';

export interface ProcessoInput {
  /** ID da hierarquia (ex.: "A1.1", "T1.1.2.1"). */
  id: string;
  /** Título do procedimento. */
  title: string;
  /** Body markdown do procedimento. */
  body: string;
  /** SHA-256 curto do artefato pop de origem (rastreabilidade). */
  shaShort: string;
  /** artifactType de origem (geralmente "pop"). */
  sourceType: string;
  /** Caminho relativo de volta ao índice de processos (ex.: "../index.html"). */
  backHref: string;
  /** Lista de páginas-irmãs (id→href) para navegação entre POPs. */
  siblings?: ReadonlyArray<{ id: string; title: string; href: string }>;
}

export function renderProcessoPage(input: ProcessoInput): string {
  const siblings = input.siblings && input.siblings.length
    ? `<nav class="siblings" aria-label="Outros procedimentos"><h3>Outros procedimentos</h3><ul>${input.siblings
        .map(
          (s) =>
            `<li><a href="${escapeHtml(s.href)}"><code>${escapeHtml(s.id)}</code> ${escapeHtml(s.title)}</a></li>`,
        )
        .join('')}</ul></nav>`
    : '';

  const body = `
<div class="row" style="grid-template-columns:1fr auto;align-items:start">
  <div>
    <p class="muted" style="margin:0"><a href="${escapeHtml(input.backHref)}">◀ Todos os procedimentos</a></p>
    <h1 style="margin:.3rem 0"><code>${escapeHtml(input.id)}</code> ${escapeHtml(input.title)}</h1>
    <p class="muted">Procedimento extraído do artefato <span class="tag">${escapeHtml(input.sourceType)}</span> · rastreabilidade <code>${escapeHtml(input.shaShort)}</code></p>
  </div>
</div>
<hr>
<article class="processo-body">
${renderMarkdownLite(input.body)}
</article>
${siblings}`;

  return wrapPage({
    title: `${input.id} — ${input.title}`,
    bodyHtml: body,
    description: `Procedimento ${input.id}: ${input.title}.`,
    relPrefix: '../',
  });
}

// ---- Índice de procedimentos (processos/index.html) ----

export interface ProcessoIndexEntry {
  id: string;
  title: string;
  shaShort: string;
}

export function renderProcessoIndex(input: {
  entries: ReadonlyArray<ProcessoIndexEntry>;
  stage: string;
}): string {
  const list = input.entries.length
    ? `<ul style="padding-left:0;list-style:none">${input.entries
        .map(
          (e) =>
            `<li style="margin:.5rem 0"><a href="${escapeHtml(e.id)}.html"><code>${escapeHtml(e.id)}</code> <strong>${escapeHtml(e.title)}</strong></a> <span class="muted">${escapeHtml(e.shaShort)}</span></li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">Nenhum procedimento (POP) commitado ainda.</p>';

  const body = `
<h1>Procedimentos (POPs)</h1>
<p class="muted">${input.entries.length} procedimento(s) operacional(is) padronizado(s) — um por ID da hierarquia (A…/T…). Cada página é imprimível e rastreável pelo SHA-256.</p>
${list}`;

  return wrapPage({
    title: 'Procedimentos',
    bodyHtml: body,
    description: 'Índice de POPs do mapeamento.',
    relPrefix: '../',
  });
}
