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

/**
 * @param terms Termos extraídos.
 * @param sourceArtifactCount Qtd de artefatos-fonte minerados (para empty-state honesto).
 */
export function renderGlossaryPage(
  terms: ReadonlyArray<GlossaryInputItem>,
  sourceArtifactCount = 0,
): string {
  const fallback = terms.length
    ? `<ul style="padding-left:1.1rem">${terms
        .map(
          (t) =>
            `<li><strong>${escapeHtml(t.term)}</strong> — ${escapeHtml(t.definition)} <span class="muted">(${escapeHtml(t.source)})</span></li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">Nenhum termo extraído da documentação atual.</p>';

  // Empty-state honesto: distingue "pipeline ainda não gerou artefatos" de
  // "artefatos existem mas nenhum padrão de termo casou" (acao diferente p/ o usuário).
  const emptyHint = sourceArtifactCount
    ? `A documentação tem ${sourceArtifactCount} artefato(s), mas nenhum padrão de glossário foi reconhecido ` +
      `(esperado: <strong>**Termo**:</strong> definição, seção <strong>## Glossário</strong> ou heading <strong>## Termo</strong>). ` +
      `Termos podem aparecer após rodar Bento (descoberta), Zanoni (POPs) ou Tiago (relatório).`
    : `Nenhum artefato-fonte encontrado — rode a pipeline do process-ai primeiro (Bento → Miguel → … → Tiago).`;

  const body = `
<h1>Glossário</h1>
<p class="muted">${terms.length} termo(s) extraído(s) da documentação do processo.${terms.length ? ' Digite para filtrar.' : ''}</p>
${terms.length ? '<p><input id="q" placeholder="Filtrar termos…" autocomplete="off" aria-label="Filtrar termos"></p>' : `<p class="muted">${emptyHint}</p>`}
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
  var q = document.getElementById('q');
  if (q) q.addEventListener('input', function(e){ render(e.target.value); });
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
