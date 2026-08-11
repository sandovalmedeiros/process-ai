/**
 * scripts/docs-site/render/fornecedores-clientes.ts — grafo força-dirigida (D3).
 *
 * Visualização interativa de fornecedores↔clientes: suppliers (esq.) → cadeia de
 * valor (centro) → customers (dir.). Arraste nós, hover p/ detalhe. Client-side,
 * via d3 vendorado (offline, file://). O grafo vem montado em extract.ts; aqui só
 * renderizamos o SVG + a simulação de força.
 *
 * INVARIANTE AD-3: vive em scripts/.
 * Lib: d3 v7 (ISC) — vendor/scripts/docs-site/vendor/d3/7/d3.min.js.
 */
import { wrapPage, escapeHtml } from './page.ts';
import type { ForceGraph } from '../extract.ts';

export interface FornecedoresClientesInput {
  graph: ForceGraph;
  /** SHA-256 curto do(s) artefato(s) de origem (sipoc/value-chain). */
  shaShort?: string;
  /** artifactType(s) de origem para o rodapé de rastreabilidade. */
  sourceTypes?: ReadonlyArray<string>;
}

const STYLE = `
#graph{background:var(--card);border:1px solid var(--line);border-radius:10px;min-height:520px;overflow:hidden}
#graph svg{display:block}
.node text{font:12px system-ui,sans-serif;fill:var(--ink);pointer-events:none;user-select:none}
.link{stroke:var(--line);stroke-opacity:.55}
.legend{display:flex;gap:1.2rem;flex-wrap:wrap;margin-top:.8rem;font-size:.85rem;color:var(--muted)}
.legend span{display:inline-flex;align-items:center;gap:.4rem}
.dot{width:12px;height:12px;border-radius:50%;display:inline-block;border:2px solid var(--bg)}
.dot.sup{background:#3fb950}
.dot.proc{background:#d29922}
.dot.cust{background:#58a6ff}
.hint{margin-top:.6rem;font-size:.82rem;color:var(--muted)}
@media (prefers-color-scheme: light){ .node text{fill:#1f2328} .link{stroke:#d0d7de} .dot{border-color:#fff} }
`;

export function renderForceGraphPage(input: FornecedoresClientesInput): string {
  const n = input.graph.nodes.length;
  const sources = input.sourceTypes && input.sourceTypes.length ? input.sourceTypes.join(', ') : 'sipoc, value-chain';
  const shaLine = input.shaShort ? ` · rastreabilidade <code>${escapeHtml(input.shaShort)}</code>` : '';

  const body = `
<h1>Fornecedores &amp; clientes</h1>
<p class="muted">Grafo interativo de fornecedores (verde) → cadeia de valor (âmbar) → clientes (azul). Arraste os nós; passe o mouse para ver o detalhe. Fonte: <span class="tag">${escapeHtml(sources)}</span>${shaLine}.</p>
<style>${STYLE}</style>
<div id="graph" role="img" aria-label="Grafo de fornecedores, cadeia de valor e clientes"></div>
<div class="legend">
  <span><i class="dot sup"></i> Fornecedores</span>
  <span><i class="dot proc"></i> Cadeia de valor</span>
  <span><i class="dot cust"></i> Clientes</span>
</div>
<p class="hint">Sem dados? Gere (ou regenere) os artefatos <code>sipoc</code> e <code>value-chain</code> na pipeline do process-ai.</p>`;

  // D3 v7 force graph. DOMContentLoaded é OBRIGATÓRIO: d3 vem num <script defer>,
  // que roda só após o parse (antes do DOMContentLoaded). O global `d3` só existe
  // dentro deste callback. Degrada graciosamente se a lib não carregar.
  const script = `window.addEventListener('DOMContentLoaded', function(){
  var data = JSON.parse(document.getElementById('pa-data').textContent);
  var d3 = window.d3;
  var el = document.getElementById('graph');
  if (!d3) { el.innerHTML = '<p class="muted" style="padding:2rem">Biblioteca d3 não carregada (abra via file:// após gerar o site).</p>'; return; }
  if (!data.nodes || !data.nodes.length) { el.innerHTML = '<p class="muted" style="padding:2rem">Sem dados de fornecedores/clientes — artefatos sipoc/value-chain não encontrados.</p>'; return; }
  var W = Math.max(320, el.clientWidth || 900), H = 520;
  var color = { supplier: '#3fb950', process: '#d29922', customer: '#58a6ff' };
  var svg = d3.select(el).append('svg').attr('viewBox', '0 0 ' + W + ' ' + H).attr('width', '100%').attr('height', H);
  // defs: marcador de seta nas arestas.
  svg.append('defs').append('marker').attr('id','arrow').attr('viewBox','0 -5 10 10').attr('refX',22).attr('refY',0).attr('markerWidth',7).attr('markerHeight',7).attr('orient','auto').append('path').attr('d','M0,-5L10,0L0,5').attr('fill','var(--muted)');
  var link = svg.append('g').attr('class','links').selectAll('line').data(data.links).join('line').attr('class','link').attr('stroke-width', 1.5).attr('marker-end','url(#arrow)');
  var node = svg.append('g').selectAll('g').data(data.nodes).join('g').attr('class','node').call(drag());
  node.append('circle').attr('r', function(d){ return d.group==='process'?11:9; }).attr('fill', function(d){ return color[d.group] || '#8b949e'; }).attr('stroke','var(--bg)').attr('stroke-width',2);
  node.append('text').attr('dx', 15).attr('dy', 4).text(function(d){ return d.label; });
  node.append('title').text(function(d){ return d.detail || d.label; });
  var sim = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links).id(function(d){ return d.id; }).distance(95).strength(0.5))
    .force('charge', d3.forceManyBody().strength(-280))
    .force('collide', d3.forceCollide(38))
    .force('x', d3.forceX(function(d){ return d.group==='supplier'?W*0.16 : d.group==='customer'?W*0.84 : W*0.5; }).strength(0.14))
    .force('y', d3.forceY(H/2).strength(0.06));
  sim.on('tick', function(){
    link.attr('x1',function(d){return d.source.x;}).attr('y1',function(d){return d.source.y;}).attr('x2',function(d){return d.target.x;}).attr('y2',function(d){return d.target.y;});
    node.attr('transform', function(d){ return 'translate(' + Math.max(40, Math.min(W-40, d.x)) + ',' + Math.max(24, Math.min(H-24, d.y)) + ')'; });
  });
  function drag(){
    function start(e){ if(!e.active) sim.alphaTarget(0.3).restart(); e.subject.fx=e.subject.x; e.subject.fy=e.subject.y; }
    function dragmove(e){ e.subject.fx=e.x; e.subject.fy=e.y; }
    function end(e){ if(!e.active) sim.alphaTarget(0); e.subject.fx=null; e.subject.fy=null; }
    return d3.drag().on('start',start).on('drag',dragmove).on('end',end);
  }
});`;

  return wrapPage({
    title: 'Fornecedores & clientes',
    bodyHtml: body,
    vendorDeps: ['d3/7/d3.min.js'],
    embeddedData: input.graph,
    pageScript: script,
    description: 'Grafo interativo de fornecedores, cadeia de valor e clientes do processo.',
  });
}
