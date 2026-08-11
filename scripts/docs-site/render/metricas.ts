/**
 * scripts/docs-site/render/metricas.ts — painel de métricas (ECharts).
 *
 * Quatro visuais honestos, cada um degradando para "sem dados" quando falta o
 * artefato de origem (nada é inventado):
 *   1. Treemap da hierarquia (estrutura Macro → Tarefa) — `hierarchy`.
 *   2. Donut de distribuição por nível (M/E/S/A/T) — `hierarchy`.
 *   3. Barras de artefatos por tipo — checkpoint (contagem).
 *   4. Donut de cobertura de POPs (Atividades com POP vs. gap) — `hierarchy`+`pop`.
 *
 * Client-side, via echarts vendorado (offline, file://). Dados pré-computados em
 * extract.ts (pure) + generate.ts; aqui só renderizamos os containers + opções.
 *
 * INVARIANTE AD-3: vive em scripts/.
 * Lib: echarts 5.5.0 (Apache-2.0) — vendor/scripts/docs-site/vendor/echarts/5.5.0/echarts.min.js.
 */
import { wrapPage, escapeHtml } from './page.ts';
import type { TreemapNode, LevelDistributionEntry, PopCoverage } from '../extract.ts';

export interface MetricasInput {
  treemap: TreemapNode[];
  levelDistribution: LevelDistributionEntry[];
  /** Contagem de artefatos por tipo, ordenada desc por valor (gera.ts monta). */
  artifactCounts: ReadonlyArray<{ name: string; value: number }>;
  popCoverage: PopCoverage;
  totalArtifacts: number;
  /** SHA-256 curto do artefato de origem principal (hierarchy). */
  shaShort?: string;
  /** artifactType(s) de origem para o rodapé de rastreabilidade. */
  sourceTypes?: ReadonlyArray<string>;
}

const STYLE = `
.pa-chart{width:100%;height:360px}
.pa-grid-2{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.pa-card-title{margin:0 0 .6rem;font-size:1rem;color:var(--ink)}
.pa-cap{font-size:.8rem;margin:.5rem 0 0;line-height:1.4}
@media (max-width:640px){ .pa-chart{height:300px} }
`;

export function renderMetricasPage(input: MetricasInput): string {
  const sources =
    input.sourceTypes && input.sourceTypes.length ? input.sourceTypes.join(', ') : 'hierarchy, pop';
  const shaLine = input.shaShort ? ` · rastreabilidade <code>${escapeHtml(input.shaShort)}</code>` : '';

  const body = `
<h1>Métricas</h1>
<p class="muted">Indicadores derivados dos artefatos commitados. Cada visual degrada para "sem dados" quando falta o artefato de origem — nada é inventado. Fonte principal: <span class="tag">${escapeHtml(sources)}</span>${shaLine}.</p>
<style>${STYLE}</style>

<h2>Estrutura da hierarquia</h2>
<div class="grid pa-grid-2">
  <div class="card">
    <h3 class="pa-card-title">Hierarquia (treemap)</h3>
    <div id="ch-treemap" class="pa-chart" role="img" aria-label="Treemap da hierarquia de processos"></div>
    <p class="muted pa-cap">Distribuição da hierarquia Macro → Tarefa por subárvore. Cada folha = 1 nó. Fonte: <code>hierarchy</code>.</p>
  </div>
  <div class="card">
    <h3 class="pa-card-title">Níveis (donut)</h3>
    <div id="ch-levels" class="pa-chart" role="img" aria-label="Distribuição de nós por nível da hierarquia"></div>
    <p class="muted pa-cap">Contagem de nós por nível (M/E/S/A/T). Fonte: <code>hierarchy</code>.</p>
  </div>
</div>

<h2>Composição e cobertura</h2>
<div class="card">
  <h3 class="pa-card-title">Artefatos por tipo (barras)</h3>
  <div id="ch-types" class="pa-chart" role="img" aria-label="Quantidade de artefatos por tipo"></div>
  <p class="muted pa-cap">${input.totalArtifacts} artefato(s) commitado(s) no checkpoint.</p>
</div>
<div class="card" style="margin-top:1rem">
  <h3 class="pa-card-title">Cobertura de POPs (donut)</h3>
  <div id="ch-coverage" class="pa-chart" role="img" aria-label="Cobertura de procedimentos operacionais padronizados"></div>
  <p class="muted pa-cap">Atividades (nível A) com procedimento padronizado documentado vs. gap. Um POP numa Tarefa cobre a Atividade-mãe. Fonte: <code>hierarchy</code> + <code>pop</code>.</p>
</div>`;

  // ECharts. DOMContentLoaded é OBRIGATÓRIO: echarts vem num <script defer>, que
  // roda só após o parse (antes do DOMContentLoaded). O global `echarts` só existe
  // dentro deste callback. Cada visual checa seu próprio fatiamento de dados e
  // degrada para "sem dados" — honesto, nunca inventa. Cores de texto/legenda
  // adaptam-se a prefers-color-scheme (a página tem CSS light/dark próprio).
  const script = `window.addEventListener('DOMContentLoaded', function () {
  var data = JSON.parse(document.getElementById('pa-data').textContent);
  var echarts = window.echarts;
  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var INK = dark ? '#c9d1d9' : '#1f2328';
  var MUTED = dark ? '#8b949e' : '#57606a';
  var ACCENT = '#58a6ff', GREEN = '#3fb950', RED = '#f85149';
  var GRID = dark ? '#30363d' : '#d0d7de', BORDER = dark ? '#0e1116' : '#ffffff';
  var instances = [];
  function empty(id, msg) { var el = document.getElementById(id); if (el) el.innerHTML = '<p class="muted" style="padding:1.5rem">' + msg + '</p>'; }

  if (!echarts) {
    ['ch-treemap','ch-levels','ch-types','ch-coverage'].forEach(function (id) { empty(id, 'Biblioteca echarts não carregada (abra via file:// após gerar o site).'); });
    return;
  }

  // 1. Treemap da hierarquia.
  if (data.treemap && data.treemap.length) {
    var c1 = echarts.init(document.getElementById('ch-treemap'));
    instances.push(c1);
    c1.setOption({
      tooltip: { formatter: function (info) { return info.name; } },
      series: [{
        type: 'treemap', name: 'Hierarquia', data: data.treemap,
        roam: false, nodeClick: false, breadcrumb: { show: false },
        label: { show: true, color: '#ffffff', formatter: '{b}', fontSize: 11 },
        upperLabel: { show: false },
        itemStyle: { borderColor: BORDER, borderWidth: 2, gapWidth: 2 },
        levels: [{ itemStyle: { borderColor: BORDER, borderWidth: 2, gapWidth: 2 } }]
      }]
    });
  } else { empty('ch-treemap', 'Sem hierarquia — artefato hierarchy não encontrado no checkpoint.'); }

  // 2. Donut distribuição por nível.
  if (data.levelDistribution && data.levelDistribution.length) {
    var c2 = echarts.init(document.getElementById('ch-levels'));
    instances.push(c2);
    c2.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { color: MUTED } },
      color: ['#4338ca', '#2563eb', '#0d9488', '#d97706', '#64748b'],
      series: [{
        type: 'pie', radius: ['42%', '68%'], avoidLabelOverlap: true,
        label: { show: true, color: INK, formatter: '{b}\\n{c}' },
        labelLine: { lineStyle: { color: MUTED } },
        data: data.levelDistribution.map(function (d) { return { name: d.levelName, value: d.count }; })
      }]
    });
  } else { empty('ch-levels', 'Sem hierarquia para distribuir por nível.'); }

  // 3. Barras de artefatos por tipo.
  if (data.artifactCounts && data.artifactCounts.length) {
    var types = data.artifactCounts;
    var c3 = echarts.init(document.getElementById('ch-types'));
    instances.push(c3);
    c3.setOption({
      tooltip: {},
      grid: { left: '14%', right: '8%', top: 20, bottom: types.length > 6 ? 70 : 40 },
      xAxis: {
        type: 'category', data: types.map(function (t) { return t.name; }),
        axisLabel: { color: MUTED, interval: 0, rotate: types.length > 6 ? 35 : 0 },
        axisLine: { lineStyle: { color: MUTED } }
      },
      yAxis: {
        type: 'value', minInterval: 1,
        axisLabel: { color: MUTED }, splitLine: { lineStyle: { color: GRID } }
      },
      series: [{
        type: 'bar', barMaxWidth: 48,
        data: types.map(function (t) { return t.value; }),
        itemStyle: { color: ACCENT, borderRadius: [4, 4, 0, 0] }
      }]
    });
  } else { empty('ch-types', 'Sem artefatos commitados no checkpoint.'); }

  // 4. Donut cobertura de POPs.
  var cov = data.popCoverage;
  if (cov && cov.total > 0) {
    var c4 = echarts.init(document.getElementById('ch-coverage'));
    instances.push(c4);
    c4.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} de ' + cov.total + ' ({d}%)' },
      legend: { bottom: 0, textStyle: { color: MUTED } },
      color: [GREEN, RED],
      series: [{
        type: 'pie', radius: ['42%', '68%'],
        label: { show: true, color: INK, formatter: '{b}: {c}' },
        labelLine: { lineStyle: { color: MUTED } },
        data: [
          { name: 'Com POP', value: cov.covered },
          { name: 'Sem POP', value: cov.gap }
        ]
      }]
    });
  } else { empty('ch-coverage', 'Sem Atividades (nível A) na hierarquia — cobertura de POPs indisponível.'); }

  window.addEventListener('resize', function () { instances.forEach(function (c) { c.resize(); }); });
});`;

  return wrapPage({
    title: 'Métricas',
    bodyHtml: body,
    vendorDeps: ['echarts/5.5.0/echarts.min.js'],
    embeddedData: {
      treemap: input.treemap,
      levelDistribution: input.levelDistribution,
      artifactCounts: input.artifactCounts,
      popCoverage: input.popCoverage,
      totalArtifacts: input.totalArtifacts,
    },
    pageScript: script,
    description: 'Indicadores do mapeamento: treemap da hierarquia, distribuição por nível, artefatos por tipo e cobertura de POPs.',
  });
}
