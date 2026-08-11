/**
 * scripts/docs-site/render/diagramas.ts — diagramas.html (Mermaid, offline).
 *
 * Renderiza os blocos ``` ```mermaid ``` ``` que os agentes (Miguel, Tiago,
 * Bento, Zanoni…) embebem nos artefatos: fluxos, hierarquias, cadeias. A lib
 * mermaid é vendorada (offline file://) e carregada via <script defer>; o script
 * da página chama `mermaid.run({querySelector:'.pa-mermaid'})` dentro de
 * DOMContentLoaded, quando `window.mermaid` já existe.
 *
 * Degradação honesta: sem mermaid OU erro de parse num bloco → revela o <pre>
 * (código bruto) daquele bloco. A página é útil mesmo sem a lib.
 *
 * INVARIANTE AD-3: vive em scripts/.
 * Lib: mermaid 11.16.1 (MIT, bundle esbuild ESM→IIFE, sem dynamic import()) —
 * vendor/scripts/docs-site/vendor/mermaid/11.16.1/mermaid.min.js. Ver vendor/PROVENANCE.md.
 */
import { wrapPage, escapeHtml } from './page.ts';
import type { MermaidBlock } from '../extract.ts';

export interface DiagramasInput {
  diagrams: ReadonlyArray<MermaidBlock>;
}

const STYLE = `
.pa-diagram{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:1rem 1.2rem;margin-bottom:1.2rem}
.pa-diagram h2{margin:.1rem 0 .3rem;font-size:1.1rem;border-bottom:none;padding-bottom:0}
.pa-diagram .pa-meta{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:.6rem}
.pa-mermaid{display:flex;justify-content:center;align-items:center;min-height:40px;overflow-x:auto}
.pa-mermaid svg{max-width:100%;height:auto}
.pa-fallback{display:none;background:var(--bg);border:1px dashed var(--line);border-radius:6px;padding:.7rem .9rem;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink);white-space:pre-wrap;word-break:break-word;overflow-x:auto}
.pa-fallback.pa-show{display:block}
.pa-fb-note{font-size:.8rem;color:var(--muted);margin:.2rem 0 .5rem}
`;

export function renderDiagramasPage(input: DiagramasInput): string {
  const diagrams = input.diagrams;
  const bodyHtml = `
<h1>Diagramas</h1>
<p class="muted">${diagrams.length} diagrama(s) Mermaid extraído(s) dos artefatos do processo (fluxos, hierarquias, cadeias).</p>
<style>${STYLE}</style>
${diagrams.length
  ? diagrams
      .map(
        (d, i) => `
<section class="pa-diagram">
  <div class="pa-meta">
    <h2>${escapeHtml(d.title)}</h2>
    <span class="tag">${escapeHtml(d.source)}</span>
  </div>
  <div class="pa-mermaid" id="pa-mmd-${i}">${escapeHtml(d.code)}</div>
  <pre class="pa-fallback" id="pa-fb-${i}"><span class="pa-fb-note">Visualização Mermaid indisponível — código-fonte do diagrama:</span>${escapeHtml(d.code)}</pre>
</section>`,
      )
      .join('')
  : '<p class="muted">Nenhum bloco Mermaid encontrado na documentação atual. Os agentes emitem diagramas ```mermaid nos artefatos de hierarquia, fluxo e relatório.</p>'}`;

  // mermaid 11.16.1: em <script defer> clássico anexa window.mermaid. DOMContentLoaded
  // é OBRIGATÓRIO (a lib vem num <script defer>, que roda antes do DOMContentLoaded).
  // mermaid.run processa todos os `.pa-mermaid`; em falha (sem lib OU erro de parse),
  // revela o <pre> de cada bloco NÃO renderizado (sem svg). Nunca lança para o usuário.
  const script = `window.addEventListener('DOMContentLoaded', function(){
  var blocks = Array.prototype.slice.call(document.querySelectorAll('.pa-mermaid'));
  if (!blocks.length) return;
  function revealPre(block){
    var sec = block.closest('.pa-diagram');
    var pre = sec && sec.querySelector('.pa-fallback');
    if (pre) pre.classList.add('pa-show');
  }
  if (!window.mermaid){ blocks.forEach(revealPre); return; }
  try {
    window.mermaid.initialize({ startOnLoad:false, securityLevel:'loose', theme:'default' });
    var runP = window.mermaid.run({ querySelector:'.pa-mermaid' });
    if (runP && typeof runP.then === 'function'){
      runP.catch(function(){
        blocks.forEach(function(b){ if (!b.querySelector('svg')) revealPre(b); });
      });
    }
  } catch(e){
    blocks.forEach(function(b){ if (!b.querySelector('svg')) revealPre(b); });
  }
});`;

  return wrapPage({
    title: 'Diagramas',
    bodyHtml,
    vendorDeps: ['mermaid/11.16.1/mermaid.min.js'],
    pageScript: script,
    description: 'Diagramas Mermaid (fluxos, hierarquias, cadeias) extraídos dos artefatos do processo.',
    trackView: diagrams.length === 0 ? false : undefined,
  });
}
