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
}

const STYLES = `
:root { color-scheme: light dark;
  --bg:#0e1116; --card:#161b22; --ink:#c9d1d9; --muted:#8b949e; --accent:#58a6ff; --line:#30363d; --warn:#f85149; }
* { box-sizing: border-box; }
body { margin:0; font:15px/1.6 system-ui,'Segoe UI',Roboto,sans-serif; background:var(--bg); color:var(--ink); }
header.top { position:sticky; top:0; z-index:5; background:rgba(14,17,22,.85); backdrop-filter:blur(6px); border-bottom:1px solid var(--line); }
header.top .bar { max-width:1000px; margin:0 auto; padding:.6rem 1rem; display:flex; align-items:center; gap:1rem; }
header.top a.brand { color:var(--accent); text-decoration:none; font-weight:700; }
header.top nav { margin-left:auto; }
header.top nav a { color:var(--muted); text-decoration:none; margin-left:.9rem; font-size:.9rem; }
header.top nav a:hover, header.top nav a.active { color:var(--ink); }
main { max-width:1000px; margin:0 auto; padding:2rem 1rem 4rem; }
h1 { font-size:1.8rem; margin-top:0; }
h2 { border-bottom:1px solid var(--line); padding-bottom:.3rem; }
a { color:var(--accent); }
code { background:var(--card); padding:.1em .35em; border-radius:4px; font-size:.9em; }
.card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:1rem 1.2rem; }
.grid { display:grid; gap:1rem; }
.row { display:grid; gap:1rem; }
.muted { color:var(--muted); }
.tag { display:inline-block; background:var(--card); border:1px solid var(--line); border-radius:999px; padding:.1em .7em; font-size:.8rem; color:var(--muted); margin:.1em .2em; }
table { border-collapse:collapse; width:100%; }
th,td { border:1px solid var(--line); padding:.5rem .7rem; text-align:left; vertical-align:top; }
input { background:var(--card); border:1px solid var(--line); color:var(--ink); padding:.55rem .7rem; border-radius:6px; width:100%; font:inherit; }
@media (prefers-color-scheme: light){
  :root{ --bg:#ffffff; --card:#f6f8fa; --ink:#1f2328; --muted:#57606a; --accent:#0969da; --line:#d0d7de; --warn:#cf222e; }
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
  const vendorTags =
    opts.vendorDeps && opts.vendorDeps.length
      ? opts.vendorDeps.map((d) => `<script src="assets/vendor/${d}" defer></script>`).join('\n  ')
      : '';
  const dataBlob =
    opts.embeddedData !== undefined
      ? `<script type="application/json" id="pa-data">${escapeHtml(JSON.stringify(opts.embeddedData))}</script>`
      : '';
  const pageScriptTag = opts.pageScript ? `<script>${opts.pageScript}</script>` : '';
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
  <a class="brand" href="index.html">◀ process-ai</a>
  <nav>
    <a href="index.html">Visão geral</a>
    <a href="topologia.html">Topologia</a>
    <a href="glossario.html">Glossário</a>
  </nav>
</div></header>
<main>
${opts.bodyHtml}
</main>
  ${dataBlob}
  ${vendorTags}
  ${pageScriptTag}
</body>
</html>`;
}
