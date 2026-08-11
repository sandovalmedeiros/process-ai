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

<h2>Artefatos (${input.artifacts.length})</h2>
<p>${chips}</p>
<table><thead><tr><th>Tipo</th><th>Título</th><th>SHA-256 (prefixo)</th></tr></thead><tbody>${rows}</tbody></table>

${warn}

<p class="muted" style="margin-top:2rem">Dica para apresentar a stakeholders: use a <a href="topologia.html">topologia</a> (antes × depois) e o <a href="glossario.html">glossário</a>. Visualizações 3D, grafo de fornecedores↔clientes, métricas e deck navegável chegam nas próximas fases do time da Monique.</p>`;

  return wrapPage({
    title: 'Visão geral',
    bodyHtml: body,
    description: 'Mini-site do mapeamento de processos — visão geral.',
  });
}
