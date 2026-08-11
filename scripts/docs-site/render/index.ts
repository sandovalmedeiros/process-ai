/**
 * scripts/docs-site/render/index.ts — index.html: hero + selo + artefatos + nav.
 * INVARIANTE AD-3: vive em scripts/.
 */
import { wrapPage, escapeHtml } from './page.ts';
import { renderSeal } from './seal.ts';

export interface IndexArtifact {
  artifactType: string;
  title: string;
  shaShort: string;
}
export interface IndexPageLink {
  href: string;
  label: string;
  hint: string;
}
export interface IndexInput {
  seed: string;
  seedPrefix: string;
  stage: string;
  artifacts: ReadonlyArray<IndexArtifact>;
  counts: Record<string, number>;
  pages: ReadonlyArray<IndexPageLink>;
  warnings: ReadonlyArray<string>;
}

export function renderIndexPage(input: IndexInput): string {
  const seal = renderSeal(input.seed, input.seedPrefix);

  const rows = input.artifacts.length
    ? input.artifacts
        .map(
          (a) =>
            `<tr><td><span class="tag">${escapeHtml(a.artifactType)}</span></td><td>${escapeHtml(a.title)}</td><td><code>${escapeHtml(a.shaShort)}</code></td></tr>`,
        )
        .join('')
    : `<tr><td colspan="3" class="muted">Nenhum artefato commitado ainda. Rode a pipeline do process-ai antes de gerar o minisite.</td></tr>`;

  const chips = Object.keys(input.counts).length
    ? Object.entries(input.counts)
        .map(([t, n]) => `<span class="tag">${escapeHtml(t)}: ${n}</span>`)
        .join(' ')
    : '<span class="muted">—</span>';

  const navCards = input.pages.length
    ? input.pages
        .map(
          (p) =>
            `<a class="card" href="${escapeHtml(p.href)}" style="text-decoration:none;color:inherit;display:block"><strong>${escapeHtml(p.label)}</strong><br><span class="muted">${escapeHtml(p.hint)}</span></a>`,
        )
        .join('\n')
    : '<p class="muted">Nenhuma página auxiliar gerada nesta execução.</p>';

  const warn = input.warnings.length
    ? `<div class="card" style="border-color:var(--warn)"><strong>⚠ Avisos</strong><ul style="margin:.5rem 0">${input.warnings
        .map((w) => `<li>${escapeHtml(w)}</li>`)
        .join('')}</ul></div>`
    : '';

  // "Últimas páginas vistas" — lê o telemetry local (pa:views) escrito pelas
  // páginas de conteúdo (trackView default true). O index NÃO se auto-registra
  // (trackView:false). Default visível antes do JS rodar; o pageScript substitui.
  const recent = `
<h2>Últimas páginas vistas</h2>
<div id="pa-recent" class="card"><p class="muted">Nenhuma página vista nesta sessão ainda (ou armazenamento local bloqueado).</p></div>`;

  const body = `
<div class="row" style="grid-template-columns:auto 1fr; align-items:center">
  <div>${seal}</div>
  <div>
    <h1 style="margin:0">Mini-site do Mapeamento de Processos</h1>
    <p class="muted">Gerado deterministicamente pelo <strong>process-ai</strong> (time da Monique). Abre via <code>file://</code> — sem servidor, 100% offline.</p>
    <p class="muted">Estágio do checkpoint: <span class="tag">${escapeHtml(input.stage || '—')}</span> &middot; Selo (seed): <code>${escapeHtml(input.seedPrefix)}</code></p>
  </div>
</div>

<h2>Navegação</h2>
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
${navCards}
</div>

${recent}

<h2>Artefatos (${input.artifacts.length})</h2>
<p>${chips}</p>
<table><thead><tr><th>Tipo</th><th>Título</th><th>SHA-256 (prefixo)</th></tr></thead><tbody>${rows}</tbody></table>

${warn}

<p class="muted" style="margin-top:2rem">Dica para apresentar a stakeholders: comece pela <a href="topologia.html">topologia</a> (antes × depois), pelo <a href="hierarquia-3d.html">mapa 3D</a> e pelas <a href="metricas.html">métricas</a>; o <a href="deck.html">deck</a> navega por teclado.</p>`;

  // Lê pa:views (escrito pelo tracker de cada página de conteúdo) e renderiza os
  // 6 mais recentes como links. try/catch: localStorage pode estar bloqueado.
  // Escape-first: href/title vêm do storage local (self-XSS no pior caso), mas
  // mesmo assim escapamos p/ seguir a disciplina do codebase.
  const recentScript = `try {
  var raw = localStorage.getItem('pa:views');
  var arr = raw ? JSON.parse(raw) : [];
  if (Array.isArray(arr) && arr.length) {
    function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    var html = arr.slice(0, 6).map(function (v) {
      var label = (v.title || v.href || '').replace(/ \\u2014 process-ai$/, '');
      var d = v.ts ? new Date(v.ts) : null;
      var when = d ? d.toLocaleString('pt-BR') : '';
      return '<li><a href="' + esc(v.href) + '">' + esc(label) + '</a>' + (when ? ' <span class="muted">' + esc(when) + '</span>' : '') + '</li>';
    }).join('');
    document.getElementById('pa-recent').innerHTML = '<ul style="margin:0">' + html + '</ul>';
  }
} catch (e) {}`;

  return wrapPage({
    title: 'Visão geral',
    bodyHtml: body,
    pageScript: recentScript,
    trackView: false,
    description: 'Mini-site do mapeamento de processos — visão geral.',
  });
}
