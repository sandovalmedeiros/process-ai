/**
 * scripts/docs-site/render/markdown.ts — renderizador markdown LITE (vanilla).
 *
 * Subconjunto suficiente para exibir bodies de POPs e trechos de artefatos no
 * minisite: headings #/##/###, **bold**, *itálico*, `code`, listas -/* e 1.,
 * <hr> (---) e parágrafos. Não é um parser markdown completo (sem tabelas
 * rich, sem aninhamento profundo) — suficiente e seguro para file://.
 *
 * HTML é escapado ANTES das transforms de markdown, então conteúdo do body
 * nunca injeta HTML cru. Pure function, zero deps.
 * INVARIANTE AD-3: vive em scripts/.
 */

function inline(t: string): string {
  return t
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

export function renderMarkdownLite(md: string): string {
  if (!md) return '';
  // 1. Escapa HTML primeiro (conteúdo do body nunca é confiável como HTML).
  const s = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = s.split(/\r?\n/);
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  const closeLists = (): void => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      closeLists();
      continue;
    }
    // Heading #/##/### → h2/h3/h4 (a página já tem o h1 do título).
    const h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (h) {
      closeLists();
      const lvl = h[1].length + 1;
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }
    // Lista não-ordenada.
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inUl) {
        closeLists();
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${inline(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    // Lista ordenada.
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inOl) {
        closeLists();
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${inline(trimmed.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }
    // Régua horizontal.
    if (/^-{3,}$/.test(trimmed)) {
      closeLists();
      out.push('<hr>');
      continue;
    }
    // Linha de tabela (| … |) → preserva como texto monoespaçado (lite).
    if (/^\|.*\|$/.test(trimmed)) {
      closeLists();
      out.push(`<p class="md-table-row">${inline(trimmed)}</p>`);
      continue;
    }
    // Parágrafo.
    closeLists();
    out.push(`<p>${inline(trimmed)}</p>`);
  }
  closeLists();
  return out.join('\n');
}
