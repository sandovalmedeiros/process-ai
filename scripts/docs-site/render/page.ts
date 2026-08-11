/**
 * scripts/docs-site/render/page.ts — wrapper HTML compartilhado (template literal).
 *
 * Sem dependências npm. Apenas string templates + CSS inline. O minisite abre
 * via file:// então TODO o CSS/JS deve ser inline ou caminho relativo vendorado.
 *
 * INVARIANTE AD-3: vive em scripts/.
 *
 * Convenção para páginas que usam libs vendoradas (P2+): o pageScript deve
 * envolver sua lógica em `window.addEventListener('DOMContentLoaded', …)`
 * — os <script src=… defer> externos rodam só após o parse, antes do
 * DOMContentLoaded, garantindo que o global da lib (ex.: echarts) exista.
 */

export interface PageOptions {
  title: string;
  bodyHtml: string;
  /** Caminhos relativos de libs vendoradas (ex.: 'echarts/5.5/echarts.min.js'). */
  vendorDeps?: string[];
  /** JS inline da página (consome o embeddedData / global da lib). */
  pageScript?: string;
  /** Dado serializado em <script type="application/json" id="pa-data">. */
  embeddedData?: unknown;
  description?: string;
  /**
   * Prefixo de caminho relativo para páginas em subpasta (ex.: '../' para
   * processos/<id>.html). Default ''. Prefixa nav, brand link e vendorDeps.
   */
  relPrefix?: string;
  /**
   * Telemetry local (localStorage): quando truthy (default), registra a visita
   * desta página em `pa:views` para o index mostrar "últimas páginas vistas".
   * 100% local — nada é enviado para fora. try/catch: silencioso se o navegador
   * bloquear storage. O index (hub) passa trackView:false p/ não se auto-registrar.
   */
  trackView?: boolean;
}

const STYLES = `
:root { color-scheme: light dark;
  /* Light-first (default). Tokens redefinidos só no @media dark abaixo. */
  --bg:#ffffff; --card:#f8fafc; --ink:#0f172a; --muted:#475569; --accent:#2563eb; --accent-strong:#1d4ed8; --line:#e2e8f0; --warn:#dc2626;
  --header-bg:rgba(255,255,255,.9); --header-border:#e2e8f0;
}
* { box-sizing: border-box; }
body { margin:0; font:15px/1.6 system-ui,'Segoe UI',Roboto,sans-serif; background:var(--bg); color:var(--ink); }
header.top { position:sticky; top:0; z-index:5; background:var(--header-bg); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border-bottom:1px solid var(--header-border); }
header.top .bar { max-width:1000px; margin:0 auto; padding:.55rem 1rem; display:flex; align-items:center; gap:1rem; }
header.top a.brand { color:var(--accent-strong); text-decoration:none; font-weight:700; white-space:nowrap; }
header.top nav { margin-left:auto; display:flex; gap:.2rem; flex-wrap:wrap; }
header.top nav a { color:var(--muted); text-decoration:none; padding:.35rem .6rem; font-size:.9rem; border-radius:6px; border-bottom:2px solid transparent; }
header.top nav a:hover { color:var(--ink); background:var(--card); }
header.top nav a.active { color:var(--accent-strong); border-bottom-color:var(--accent); font-weight:600; }
main { max-width:1000px; margin:0 auto; padding:2rem 1rem 4rem; }
h1 { font-size:1.8rem; margin-top:0; }
h2 { border-bottom:1px solid var(--line); padding-bottom:.3rem; }
a { color:var(--accent); }
code { background:var(--card); padding:.1em .35em; border:1px solid var(--line); border-radius:4px; font-size:.9em; }
.card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:1rem 1.2rem; }
.grid { display:grid; gap:1rem; }
.row { display:grid; gap:1rem; }
.muted { color:var(--muted); }
.tag { display:inline-block; background:var(--card); border:1px solid var(--line); border-radius:999px; padding:.1em .7em; font-size:.8rem; color:var(--muted); margin:.1em .2em; }
table { border-collapse:collapse; width:100%; }
th,td { border:1px solid var(--line); padding:.5rem .7rem; text-align:left; vertical-align:top; }
input { background:var(--bg); border:1px solid var(--line); color:var(--ink); padding:.55rem .7rem; border-radius:6px; width:100%; font:inherit; }
input:focus { outline:2px solid var(--accent); outline-offset:-1px; border-color:var(--accent); }
@media (prefers-color-scheme: dark){
  :root{
    --bg:#0d1117; --card:#161b22; --ink:#e6edf3; --muted:#8b949e; --accent:#58a6ff; --accent-strong:#79b8ff; --line:#30363d; --warn:#f85149;
    --header-bg:rgba(13,17,23,.85); --header-border:#30363d;
  }
}
`;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wrapPage(opts: PageOptions): string {
  const rel = opts.relPrefix ?? '';
  const vendorTags =
    opts.vendorDeps && opts.vendorDeps.length
      ? opts.vendorDeps.map((d) => `<script src="${rel}assets/vendor/${d}" defer></script>`).join('\n  ')
      : '';
  const dataBlob =
    opts.embeddedData !== undefined
      ? `<script type="application/json" id="pa-data">${escapeHtml(JSON.stringify(opts.embeddedData))}</script>`
      : '';
  const pageScriptTag = opts.pageScript ? `<script>${opts.pageScript}</script>` : '';
  // Telemetry local (opt-out via trackView:false). try/catch: localStorage pode
  // estar bloqueado (modo privado / restrições de file://) — silencioso se falhar.
  // Registra {href, title, ts}; dedupe por href (move a página ao topo); cap 12.
  const trackerTag =
    opts.trackView === false
      ? ''
      : `<script>try{var k='pa:views';var raw=localStorage.getItem(k);var a=raw?JSON.parse(raw):[];if(!Array.isArray(a))a=[];var h=location.href;a=a.filter(function(v){return v&&v.href!==h;});a.unshift({href:h,title:document.title,ts:Date.now()});if(a.length>12)a.length=12;localStorage.setItem(k,JSON.stringify(a));}catch(e){}</script>`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)} — process-ai</title>
<meta name="generator" content="process-ai docs-site">
<meta name="description" content="${escapeHtml(opts.description ?? 'Mini-site do mapeamento de processos gerado pelo process-ai.')}">
<style>${STYLES}</style>
</head>
<body>
<header class="top"><div class="bar">
  <a class="brand" href="${rel}index.html">◀ process-ai</a>
  <nav>
    <a href="${rel}index.html">Visão geral</a>
    <a href="${rel}topologia.html">Topologia</a>
    <a href="${rel}glossario.html">Glossário</a>
    <a href="${rel}diagramas.html">Diagramas</a>
  </nav>
</div></header>
<main>
${opts.bodyHtml}
</main>
  ${dataBlob}
  ${trackerTag}
  ${vendorTags}
  <script>try{var here=location.pathname.replace(/.*\\//,'');Array.prototype.forEach.call(document.querySelectorAll('header.top nav a'),function(a){var href=a.getAttribute('href')||'';if(href.replace(/.*\\//,'')===here)a.classList.add('active');});}catch(e){}</script>
  ${pageScriptTag}
</body>
</html>`;
}
