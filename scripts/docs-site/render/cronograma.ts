/**
 * scripts/docs-site/render/cronograma.ts — cronograma.html (timeline vertical).
 *
 * View-model genérico: o parsing (provenance.jsonl + gates + artifacts) fica em
 * extract.ts/generate.ts; aqui só renderiza uma lista de eventos temporais.
 * INVARIANTE AD-3: vive em scripts/.
 */
import { wrapPage, escapeHtml } from './page.ts';

export type TimelineKind = 'artifact' | 'gate' | 'stage';

export interface TimelineEntry {
  /** ISO timestamp (ex.: "2026-08-11T14:03:01Z") ou null se indisponível. */
  ts: string | null;
  /** Rótulo humano curto: "Bento commitou sipoc", "Gate 1 aprovado". */
  label: string;
  /** Categoria para cor do marcador. */
  kind: TimelineKind;
  /** Detalhe opcional (sha curto, tipo, etc.). */
  detail?: string;
}

export interface CronogramaInput {
  entries: ReadonlyArray<TimelineEntry>;
}

const STYLE = `
.timeline{list-style:none;margin:1.5rem 0;padding:0;position:relative}
.timeline::before{content:"";position:absolute;left:7.5em;top:0;bottom:0;width:2px;background:var(--line)}
.tl{position:relative;padding:.5rem 0 .5rem 9em;display:flex;align-items:flex-start;gap:.8rem}
.tl time{position:absolute;left:0;top:.55rem;width:7em;text-align:right;font-size:.78rem;color:var(--muted);font-family:ui-monospace,monospace}
.tl-dot{width:12px;height:12px;border-radius:50%;margin-top:.35rem;flex:0 0 auto;background:var(--accent);border:2px solid var(--bg);box-shadow:0 0 0 2px var(--accent)}
.tl-artifact .tl-dot{background:#3fb950}
.tl-gate .tl-dot{background:#d29922}
.tl-stage .tl-dot{background:var(--accent)}
.tl-body{flex:1 1 auto}
.tl-body strong{display:block}
@media (max-width:560px){.timeline::before{left:14px}.tl{padding-left:2em}.tl time{position:static;display:block;width:auto;text-align:left;font-size:.72rem;margin-bottom:.15rem}}
`;

export function renderCronogramaPage(input: CronogramaInput): string {
  const items = input.entries.length
    ? input.entries
        .map((e) => {
          const time = e.ts
            ? `<time>${escapeHtml(e.ts)}</time>`
            : '<time class="muted">s/ data</time>';
          const detail = e.detail ? `<br><span class="muted">${escapeHtml(e.detail)}</span>` : '';
          return `<li class="tl tl-${e.kind}">${time}<div class="tl-dot" aria-hidden="true"></div><div class="tl-body"><strong>${escapeHtml(e.label)}</strong>${detail}</div></li>`;
        })
        .join('\n')
    : '<li class="muted" style="padding-left:0">Sem eventos de cronograma disponíveis (ledger de provenance e gates não encontrados nesta sessão).</li>';

  const body = `
<h1>Cronograma do mapeamento</h1>
<p class="muted">${input.entries.length} evento(s) na ordem em que ocorreram — artefatos commitados (verde), gates de decisão (âmbar) e mudanças de estágio (azul).</p>
<style>${STYLE}</style>
<ul class="timeline">
${items}
</ul>`;

  return wrapPage({
    title: 'Cronograma',
    bodyHtml: body,
    description: 'Linha do tempo da sessão de mapeamento.',
  });
}
