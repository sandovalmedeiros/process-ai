/**
 * scripts/docs-site/render/deck.ts — deck.html (apresentação navegável).
 *
 * Deck de slides com navegação por teclado (← → e espaço) e botões. Cada slide
 * recebe HTML já renderizado (use renderMarkdownLite). View-model genérico;
 * a montagem dos slides (a partir dos artefatos) fica em generate.ts.
 * INVARIANTE AD-3: vive em scripts/.
 */
import { wrapPage, escapeHtml } from './page.ts';

export type DeckSlideKind = 'cover' | 'section' | 'metrics' | 'closing';

export interface DeckSlide {
  title: string;
  /** HTML já renderizado (não escapado aqui — vem de renderMarkdownLite). */
  html: string;
  kind?: DeckSlideKind;
  /** Notas do apresentador (speaker notes). */
  notes?: string;
}

export interface DeckInput {
  slides: ReadonlyArray<DeckSlide>;
}

const STYLE = `
.deck{margin-top:1rem}
.deck-viewport{background:var(--card);border:1px solid var(--line);border-radius:10px;min-height:320px;padding:2rem 2.2rem}
.slide{display:none}
.slide.active{display:block;animation:fade .18s ease}
@keyframes fade{from{opacity:.4}to{opacity:1}}
.slide.cover h2{font-size:2rem;border:none}
.slide.cover{text-align:center;padding-top:2rem}
.slide.metrics ul{font-size:1.15rem}
.slide-body{margin-top:.6rem;line-height:1.7}
.slide-body ul{padding-left:1.2rem}
.notes{margin-top:1.4rem;padding:.7rem .9rem;background:var(--bg);border-left:3px solid var(--accent);border-radius:4px;font-size:.85rem;color:var(--muted)}
.notes::before{content:"Notas: "}
.deck-controls{display:flex;align-items:center;justify-content:center;gap:1.2rem;margin-top:1rem}
.deck-controls button{background:var(--card);border:1px solid var(--line);color:var(--ink);padding:.45rem .9rem;border-radius:6px;cursor:pointer;font-size:1rem}
.deck-controls button:hover{border-color:var(--accent)}
#counter{font-family:ui-monospace,monospace;color:var(--muted);font-size:.9rem;min-width:5em;text-align:center}
`;

export function renderDeckPage(input: DeckInput): string {
  const n = input.slides.length;
  const sections = input.slides.length
    ? input.slides
        .map((sl, i) => {
          const kind = sl.kind ? ` slide ${sl.kind}` : ' slide';
          const notes = sl.notes
            ? `<aside class="notes">${escapeHtml(sl.notes)}</aside>`
            : '';
          return `<section class="${kind.trim()}" data-i="${i}">
  <h2>${escapeHtml(sl.title)}</h2>
  <div class="slide-body">${sl.html}</div>
  ${notes}
</section>`;
        })
        .join('\n')
    : '<section class="slide active"><p class="muted">Sem conteúdo para o deck (gere o mapeamento primeiro).</p></section>';

  const body = `
<h1>Deck — apresentação do mapeamento</h1>
<p class="muted">${n} slide(s). Navegue com <kbd>←</kbd> <kbd>→</kbd> (ou espaço) / botões.</p>
<style>${STYLE}</style>
<div class="deck">
  <div class="deck-viewport" id="viewport">
${sections}
  </div>
  <div class="deck-controls">
    <button id="prev" aria-label="Slide anterior">◀ Anterior</button>
    <span id="counter">1 / ${Math.max(n, 1)}</span>
    <button id="next" aria-label="Próximo slide">Próximo ▶</button>
  </div>
</div>
<noscript><p class="muted">Ative JavaScript para navegar. Os slides aparecem empilhados abaixo.</p></noscript>`;

  const script = `(function(){
  var slides=[].slice.call(document.querySelectorAll('.slide'));
  var i=0,n=slides.length;
  function show(k){if(!n)return;i=Math.max(0,Math.min(n-1,k));slides.forEach(function(el,idx){if(idx===i){el.classList.add('active');}else{el.classList.remove('active');}});var c=document.getElementById('counter');if(c)c.textContent=(i+1)+' / '+n;}
  document.getElementById('prev').addEventListener('click',function(){show(i-1);});
  document.getElementById('next').addEventListener('click',function(){show(i+1);});
  document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();show(i+1);}else if(e.key==='ArrowLeft'){e.preventDefault();show(i-1);}});
  show(0);
})();`;

  return wrapPage({
    title: 'Deck',
    bodyHtml: body,
    pageScript: script,
    description: 'Apresentação navegável do mapeamento de processos.',
  });
}
