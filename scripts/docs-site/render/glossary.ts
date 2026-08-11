/**
 * scripts/docs-site/render/glossary.ts — glossario.html (busca client-side, vanilla).
 * INVARIANTE AD-3: vive em scripts/.
 */
import { wrapPage, escapeHtml } from './page.ts';

export interface GlossaryInputItem {
  term: string;
  definition: string;
  source: string;
}

export function renderGlossaryPage(terms: ReadonlyArray<GlossaryInputItem>): string {
  const fallback = terms.length
    ? `<ul style="padding-left:1.1rem">${terms
        .map(
          (t) =>
            `<li><strong>${escapeHtml(t.term)}</strong> — ${escapeHtml(t.definition)} <span class="muted">(${escapeHtml(t.source)})</span></li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">Nenhum termo extraído da documentação atual.</p>';

  const body = `
<h1>Glossário</h1>
<p class="muted">${terms.length} termo(s) extraído(s) da documentação do processo. Digite para filtrar.</p>
<p><input id="q" placeholder="Filtrar termos…" autocomplete="off" aria-label="Filtrar termos"></p>
<div class="grid" id="list"></div>
<noscript>
  <p>Ative JavaScript para usar a busca. Lista completa:</p>
  ${fallback}
</noscript>`;

  // O script está ao final do <body> (após #pa-data e #list) — DOM já parsed.
  const script = `
(function(){
  var data = JSON.parse(document.getElementById('pa-data').textContent || '[]');
  var list = document.getElementById('list');
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function render(q){
    var f = (q||'').toLowerCase();
    var items = data.filter(function(t){ return !f || t.term.toLowerCase().indexOf(f)>=0 || t.definition.toLowerCase().indexOf(f)>=0; });
    list.innerHTML = items.length
      ? items.map(function(t){ return '<div class="card"><strong>'+esc(t.term)+'</strong> <span class="muted">('+esc(t.source)+')</span><br>'+esc(t.definition)+'</div>'; }).join('')
      : '<p class="muted">Nenhum termo corresponde a "'+esc(q)+'".</p>';
  }
  document.getElementById('q').addEventListener('input', function(e){ render(e.target.value); });
  render('');
})();`;

  return wrapPage({
    title: 'Glossário',
    bodyHtml: body,
    embeddedData: terms,
    pageScript: script,
    description: 'Glossário dos termos do processo, com busca.',
  });
}
