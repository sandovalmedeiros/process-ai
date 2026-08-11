/**
 * scripts/docs-site/generate.ts — gerador determinístico do mini-site HTML.
 *
 * Lê .process-ai/checkpoint.json (+ manifestos + bodies) em <root>, parseia,
 * e emite páginas HTML estáticas em <outDir> (default <root>/_process-ai_output/docs).
 * O site abre via file:// — 100% offline, sem servidor, sem CDN.
 *
 * Sem dependências npm — apenas node:* builtins. Lê o checkpoint DIRETAMENTE
 * (não importa toolkit/src/* — que não é shipado no pacote npm; só dist/ é).
 * .process-ai/checkpoint.json é a fonte autoritativa (AD-4).
 *
 * INVARIANTE AD-3: vive em scripts/ (fora do core toolkit/src/).
 * Precedente arquitetural: scripts/bpmn-renderer/render.ts (gerador com assets
 * sidecar — escreve diretamente em _process-ai_output/, fora do canal propose).
 *
 * O agente Monique invoca via:  npx tsx -e "import {generateDocs} from './scripts/docs-site/generate.ts'; …"
 * e depois propõe UM artefato `process-docs` (escape hatch) referenciando as
 * páginas geradas — padrão Guilherme two-step (AD-1 preservado).
 */

import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  resolveBody,
  extractTitle,
  extractGlossaryTerms,
  extractMermaidBlocks,
  countByType,
  parseProvenance,
  gateDecisionPt,
  gateNumber,
  parsePop,
  truncateMd,
  buildSupplierCustomerGraph,
  parseHierarchy,
  buildHierarchyTreemap,
  buildLevelDistribution,
  computePopCoverage,
} from './extract.ts';
import { renderIndexPage } from './render/index.ts';
import { renderTopologiaPage } from './render/topologia.ts';
import { renderGlossaryPage } from './render/glossary.ts';
import { renderDiagramasPage } from './render/diagramas.ts';
import { renderCronogramaPage, type TimelineEntry } from './render/cronograma.ts';
import { renderDeckPage, type DeckSlide } from './render/deck.ts';
import { renderProcessoPage, renderProcessoIndex } from './render/processo.ts';
import { renderForceGraphPage } from './render/fornecedores-clientes.ts';
import { renderHierarchy3dPage } from './render/hierarquia-3d.ts';
import { renderMetricasPage } from './render/metricas.ts';
import { renderMarkdownLite } from './render/markdown.ts';
import { escapeHtml } from './render/page.ts';

export interface GenerateOptions {
  /** Raiz do projeto (onde vivem .process-ai/ e _process-ai_output/). */
  root: string;
  /** Diretório de saída (default <root>/_process-ai_output/docs). */
  outDir?: string;
  /** Allowlist de páginas (regeneração isolada por sub-agente). undefined = todas. */
  only?: string[];
  /** Seed override (default: derivado dos sha256 dos artefatos + stage). */
  seed?: string;
}

export interface VendoredLib {
  name: string;
  version: string;
  license: string;
  sourceUrl: string;
  /** Caminho relativo em vendor/ (ex.: 'd3/7/d3.min.js') — casa com `vendorDeps` e com o que `copyVendor` copiou. */
  vendorPath: string;
}

export interface GenerateResult {
  indexUrl: string;
  pages: string[];
  sourceArtifacts: Array<{ sha256: string; artifactType: string }>;
  seed: string;
  vendoredLibs: VendoredLib[];
  warnings: string[];
}

const OUTPUT_REL = '_process-ai_output/docs';
const DOCS_SITE_VERSION = 'process-ai-docs-site/v0.1.0';

/**
 * Registry estático das libs vendoradas (mantido em sync com vendor/PROVENANCE.md).
 * Uma lib entra no `vendoredLibs` do GenerateResult SÓ se alguma página que a usa
 * foi efetivamente gerada (honesto — não anuncia o que não usou).
 */
const VENDOR_REGISTRY: Record<string, VendoredLib> = {
  d3: { name: 'd3', version: '7.9.0', license: 'ISC', sourceUrl: 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js', vendorPath: 'd3/7/d3.min.js' },
  // r137 = último build UMD limpo (sem console.warn de deprecation). r160+ é ESM-only
  // (sem global window.THREE), o que quebraria o padrão offline file:// + <script defer>.
  // API usada (Scene/Camera/WebGLRenderer/BufferGeometry/LineSegments/…) estável desde ~r100.
  three: { name: 'three', version: '0.137.0', license: 'MIT', sourceUrl: 'https://cdn.jsdelivr.net/npm/three@0.137.0/build/three.min.js', vendorPath: 'three/0.137.0/three.min.js' },
  // echarts 5.5.0: build UMD expõe global `window.echarts` (compatível com o
  // padrão offline file:// + <script defer> + DOMContentLoaded). API usada
  // (init/setOption, series treemap/pie/bar) estável desde 5.0.
  echarts: { name: 'echarts', version: '5.5.0', license: 'Apache-2.0', sourceUrl: 'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js', vendorPath: 'echarts/5.5.0/echarts.min.js' },
  // mermaid 11.16.1: bundle esbuild ESM→IIFE sem dynamic import() (viable em file://).
  // Em <script defer> clássico, anexa window.mermaid (initialize/run/render). Degrada p/ <pre>.
  mermaid: { name: 'mermaid', version: '11.16.1', license: 'MIT', sourceUrl: 'https://cdn.jsdelivr.net/npm/mermaid@11.16.1/dist/mermaid.min.js', vendorPath: 'mermaid/11.16.1/mermaid.min.js' },
};

interface LoadedArtifact {
  sha256: string;
  artifactType: string;
  artifactPath: string;
  body: string;
  title: string;
}

interface Manifest {
  sha256: string;
  artifactType: string;
  artifactPath: string;
}
interface CheckpointArtifact {
  sha256: string;
  artifactType: string;
  path: string;
}
interface CheckpointGate {
  gateId: string;
  decision: string;
  decidedAt: string;
}
interface CheckpointState {
  stage: string;
  artifacts: CheckpointArtifact[];
  gates?: CheckpointGate[];
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
}

async function atomicWrite(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, file);
}

function shortSha(sha: string): string {
  return (sha || '').slice(0, 12);
}

/** Copia recursivamente *.js de vendor/ → outDir/assets/vendor/ (no-op se vazio). Retorna caminhos RELATIVOS a vendorSrc. */
async function copyVendor(vendorSrc: string, vendorOut: string, rel = ''): Promise<string[]> {
  const copied: string[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(vendorSrc, { withFileTypes: true });
  } catch {
    return copied; // diretório vendor ausente → no-op silencioso
  }
  for (const e of entries) {
    const src = path.join(vendorSrc, e.name);
    const dst = path.join(vendorOut, e.name);
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      copied.push(...(await copyVendor(src, dst, childRel)));
    } else if (e.isFile() && e.name.endsWith('.js')) {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(src, dst);
      copied.push(childRel);
    }
  }
  return copied;
}

/**
 * Resolve o diretório vendor nos dois layouts de execução:
 *  - dev: roda de scripts/docs-site/ → vendor ao lado (./vendor).
 *  - publicado/CLI: roda de dist/scripts/docs-site/ → vendor NÃO está ao lado
 *    (copy-assets.cjs não o copia para dist/); é shipado em <raiz>/scripts/docs-site/vendor
 *    via o campo `files`. Sobe até a raiz do pacote e procura scripts/docs-site/vendor.
 * Prova cada candidato pela presença de three/0.137.0/three.min.js (lib canônica).
 * Retorna null se nenhum existir — caller avisa (warnings) e NÃO anuncia libs (honesto).
 */
export function resolveVendorDir(here: string): string | null {
  const probe = (dir: string): boolean => existsSync(path.join(dir, 'three', '0.137.0', 'three.min.js'));
  const candidates = [
    path.join(here, 'vendor'), // dev
    path.join(here, '..', '..', '..', 'scripts', 'docs-site', 'vendor'), // publicado: dist/scripts/docs-site → <raiz>/scripts/docs-site/vendor
  ];
  for (const c of candidates) if (probe(c)) return c;
  // walk-up: cobre layouts node_modules/... aninhados.
  let dir = here;
  for (let i = 0; i < 10; i++) {
    const cand = path.join(dir, 'scripts', 'docs-site', 'vendor');
    if (probe(cand)) return cand;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function generateDocs(opts: GenerateOptions): Promise<GenerateResult> {
  const root = opts.root;
  const outDir = opts.outDir ?? path.join(root, OUTPUT_REL);
  const only = opts.only ? new Set(opts.only) : undefined;
  const warnings: string[] = [];

  // 1. Checkpoint autoritativo (AD-4) — lido diretamente.
  const cpPath = path.join(root, '.process-ai', 'checkpoint.json');
  let stage = '';
  let cpArtifacts: CheckpointArtifact[] = [];
  let cpGates: CheckpointGate[] = [];
  try {
    const cp = (await readJson(cpPath)) as CheckpointState;
    stage = typeof cp.stage === 'string' ? cp.stage : '';
    cpArtifacts = Array.isArray(cp.artifacts) ? cp.artifacts : [];
    cpGates = Array.isArray(cp.gates) ? cp.gates : [];
  } catch {
    warnings.push(`Checkpoint não legível em ${cpPath} — gerando minisite vazio. Rode a pipeline do process-ai primeiro.`);
  }

  // 1b. Provenance ledger (best-effort — condicional: só existe após o 1º commit).
  //     Shape por commit.ts: {sha256, artifactType, agent, committedAt}. Cruzado
  //     por `sha256|artifactType` p/ obter o timestamp/agent de cada artefato no
  //     cronograma (checkpoint.artifacts[] NÃO carrega timestamp por artefato).
  const provPath = path.join(root, '.process-ai', 'provenance.jsonl');
  const provMap = new Map<string, { agent: string; committedAt: string }>();
  try {
    const rawProv = await fs.readFile(provPath, 'utf8');
    for (const e of parseProvenance(rawProv)) {
      provMap.set(`${e.sha256}|${e.artifactType}`, { agent: e.agent, committedAt: e.committedAt });
    }
  } catch {
    // sem provenance — artefatos aparecem sem timestamp no cronograma (honesto).
  }

  // 2. Resolver manifestos + bodies.
  const loaded: LoadedArtifact[] = [];
  for (const a of cpArtifacts) {
    const manifestFile = path.join(root, a.path);
    try {
      const man = (await readJson(manifestFile)) as Manifest;
      let raw = '';
      try {
        raw = await fs.readFile(path.join(root, man.artifactPath), 'utf8');
      } catch {
        warnings.push(`Body do artefato não encontrado: ${man.artifactPath}`);
      }
      const body = resolveBody(raw);
      loaded.push({
        sha256: a.sha256,
        artifactType: a.artifactType,
        artifactPath: man.artifactPath,
        body,
        title: extractTitle(body) || a.artifactType,
      });
    } catch {
      warnings.push(`Manifesto não encontrado: ${a.path}`);
    }
  }

  // 3. Seed determinístico.
  const seedBase = loaded.map((l) => l.sha256).join('|') + '|' + stage;
  const seed = opts.seed ?? crypto.createHash('sha256').update(seedBase).digest('hex').slice(0, 16);
  const seedPrefix = shortSha(seed);

  const counts = countByType(loaded.map((l) => l.artifactType));
  const pages: string[] = [];
  const usedVendors = new Set<string>();
  const want = (name: string): boolean => !only || only.has(name);
  const emit = async (relName: string, html: string): Promise<void> => {
    await atomicWrite(path.join(outDir, relName), html);
    pages.push(`${OUTPUT_REL}/${relName}`);
  };

  // 4. Páginas (P0 — vanilla, sem libs vendoradas).
  if (want('index')) {
    const navPages = [
      { key: 'topologia', href: 'topologia.html', label: 'Topologia', hint: 'Antes × depois do mapeamento' },
      { key: 'hierarquia-3d', href: 'hierarquia-3d.html', label: 'Hierarquia 3D', hint: 'Árvore 3D interativa (Three.js): Macro → Tarefa' },
      { key: 'fornecedores-clientes', href: 'fornecedores-clientes.html', label: 'Fornecedores & clientes', hint: 'Grafo interativo (D3): fornecedores → cadeia → clientes' },
      { key: 'metricas', href: 'metricas.html', label: 'Métricas', hint: 'Cobertura, níveis e composição (ECharts)' },
      { key: 'diagramas', href: 'diagramas.html', label: 'Diagramas', hint: 'Fluxos e hierarquias Mermaid dos artefatos' },
      { key: 'cronograma', href: 'cronograma.html', label: 'Cronograma', hint: 'Linha do tempo da sessão (gates + commits)' },
      { key: 'glossario', href: 'glossario.html', label: 'Glossário', hint: 'Termos do processo, com busca' },
      { key: 'deck', href: 'deck.html', label: 'Deck', hint: 'Apresentação navegável para stakeholders' },
      { key: 'processos', href: 'processos/index.html', label: 'Procedimentos', hint: 'POPs por ID da hierarquia' },
    ]
      .filter((p) => want(p.key))
      .map((p) => ({ href: p.href, label: p.label, hint: p.hint }));
    await emit(
      'index.html',
      renderIndexPage({
        seed,
        seedPrefix,
        stage,
        artifacts: loaded.map((l) => ({
          artifactType: l.artifactType,
          title: l.title,
          shaShort: shortSha(l.sha256),
        })),
        counts,
        pages: navPages,
        warnings,
      }),
    );
  }

  if (want('topologia')) {
    const isAfter = (t: string): boolean =>
      t === 'hierarchy' || t === 'flow' || t === 'flow-image' || t === 'pop';
    const before = loaded
      .filter((l) => l.artifactType === 'reference-material')
      .map((l) => ({ title: l.title, artifactType: l.artifactType, shaShort: shortSha(l.sha256) }));
    const after = loaded
      .filter((l) => isAfter(l.artifactType))
      .map((l) => ({ title: l.title, artifactType: l.artifactType, shaShort: shortSha(l.sha256) }));
    await emit('topologia.html', renderTopologiaPage({ before, after }));
  }

  // 4a-bis. Fornecedores & clientes (grafo força-dirigida D3).
  if (want('fornecedores-clientes')) {
    const sipoc = loaded.find((l) => l.artifactType === 'sipoc');
    const vc = loaded.find((l) => l.artifactType === 'value-chain');
    const graph = buildSupplierCustomerGraph(
      sipoc?.body ?? '',
      vc?.body,
    );
    const sourceTypes = [sipoc?.artifactType, vc?.artifactType].filter((t): t is string => !!t);
    const shaShort = sipoc ? shortSha(sipoc.sha256) : vc ? shortSha(vc.sha256) : undefined;
    await emit(
      'fornecedores-clientes.html',
      renderForceGraphPage({ graph, shaShort, sourceTypes }),
    );
    usedVendors.add('d3'); // advisory: d3 efetivamente usada por esta página.
  }

  // 4a-ter. Hierarquia 3D (cone-tree Three.js).
  if (want('hierarquia-3d')) {
    const hier = loaded.find((l) => l.artifactType === 'hierarchy');
    const tree = parseHierarchy(hier?.body ?? '');
    await emit(
      'hierarquia-3d.html',
      renderHierarchy3dPage({
        tree,
        shaShort: hier ? shortSha(hier.sha256) : undefined,
        sourceTypes: hier ? ['hierarchy'] : undefined,
      }),
    );
    usedVendors.add('three'); // advisory: three efetivamente usada por esta página.
  }

  // 4a-quat. Métricas (4 charts ECharts: treemap, níveis, tipos, cobertura POP).
  if (want('metricas')) {
    const hier = loaded.find((l) => l.artifactType === 'hierarchy');
    const tree = parseHierarchy(hier?.body ?? '');
    const treemap = buildHierarchyTreemap(tree);
    const levelDistribution = buildLevelDistribution(tree);
    // IDs de POP (p/ cobertura): parseia todos os artefatos pop commitados.
    const popIds = new Set<string>();
    for (const p of loaded.filter((l) => l.artifactType === 'pop')) {
      for (const e of parsePop(p.body).entries) popIds.add(e.id);
    }
    const popCoverage = computePopCoverage(tree, popIds);
    const artifactCounts = Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const hierType = loaded.find((l) => l.artifactType === 'hierarchy');
    const popType = loaded.find((l) => l.artifactType === 'pop');
    const sourceTypes = [hierType?.artifactType, popType?.artifactType].filter(
      (t): t is string => !!t,
    );
    await emit(
      'metricas.html',
      renderMetricasPage({
        treemap,
        levelDistribution,
        artifactCounts,
        popCoverage,
        totalArtifacts: loaded.length,
        shaShort: hier ? shortSha(hier.sha256) : undefined,
        sourceTypes,
      }),
    );
    usedVendors.add('echarts'); // advisory: echarts efetivamente usada por esta página.
  }

  if (want('glossario')) {
    // Mineração ampliada: BOLD_TERM/HEADING_TERM/seção ## Glossário sobre TODOS os
    // artefatos (antes só 3 tipos — frágil, saía vazio se o pipeline não os gerou).
    const terms = extractGlossaryTerms(
      loaded.map((l) => ({ body: l.body, source: l.artifactType })),
    );
    await emit('glossario.html', renderGlossaryPage(terms, loaded.length));
  }

  // 4a-quin. Diagramas Mermaid (blocos ```mermaid embebidos nos artefatos).
  if (want('diagramas')) {
    const diagrams = extractMermaidBlocks(
      loaded.map((l) => ({ body: l.body, source: l.artifactType })),
    );
    if (diagrams.length) {
      await emit('diagramas.html', renderDiagramasPage({ diagrams }));
      usedVendors.add('mermaid'); // advisory: mermaid efetivamente usada por esta página.
    } else {
      warnings.push('Nenhum bloco ```mermaid encontrado nos artefatos — página diagramas.html suprimida.');
    }
  }

  // 4b. Cronograma (timeline de gates + commits, com ts do provenance).
  if (want('cronograma')) {
    const timeline: TimelineEntry[] = [];
    for (const l of loaded) {
      const prov = provMap.get(`${l.sha256}|${l.artifactType}`);
      timeline.push({
        ts: prov?.committedAt || null,
        label: prov?.agent ? `${prov.agent} → ${l.artifactType}` : `Artefato commitado: ${l.artifactType}`,
        kind: 'artifact',
        detail: `${shortSha(l.sha256)}${l.title && l.title !== l.artifactType ? ' · ' + l.title : ''}`,
      });
    }
    for (const g of cpGates) {
      timeline.push({
        ts: g.decidedAt || null,
        label: `Gate ${gateNumber(g.gateId)} — ${gateDecisionPt(g.decision)}`,
        kind: 'gate',
        detail: g.gateId,
      });
    }
    // Ordena por ts asc; nulls por último (sort estável do V8 preserva ordem de inserção).
    timeline.sort((a, b) => {
      if (a.ts && b.ts) return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
      if (a.ts) return -1;
      if (b.ts) return 1;
      return 0;
    });
    await emit('cronograma.html', renderCronogramaPage({ entries: timeline }));
  }

  // 4c. Deck (apresentação navegável para stakeholders).
  if (want('deck')) {
    const findByType = (t: string): LoadedArtifact | undefined => loaded.find((l) => l.artifactType === t);
    const slides: DeckSlide[] = [];
    const hero =
      (findByType('process-report') || findByType('discovery-interview') || loaded[0])?.title ||
      'Mapeamento de processos';
    slides.push({
      title: hero,
      kind: 'cover',
      html: `<p>Mini-site do mapeamento — estágio <span class="tag">${escapeHtml(stage || '—')}</span>.</p><p class="muted">Gerado pelo process-ai · use <kbd>→</kbd> para avançar.</p>`,
    });
    const overview = findByType('process-report') || findByType('discovery-interview');
    if (overview) {
      slides.push({ title: 'Visão geral', kind: 'section', html: renderMarkdownLite(truncateMd(overview.body)) });
    }
    const sipoc = findByType('sipoc') || findByType('value-chain');
    if (sipoc) {
      slides.push({ title: 'SIPOC & cadeia de valor', kind: 'section', html: renderMarkdownLite(truncateMd(sipoc.body)) });
    }
    const hier = findByType('hierarchy');
    if (hier) {
      slides.push({ title: 'Hierarquia de processos', kind: 'section', html: renderMarkdownLite(truncateMd(hier.body, 800)) });
    }
    const flow = findByType('flow');
    if (flow) {
      slides.push({
        title: 'Fluxo BPMN',
        kind: 'section',
        html: `<p>Fluxo modelado em <strong>BPMN 2.0 XML canônico</strong>.</p><p class="muted">Rastreabilidade: <code>${escapeHtml(shortSha(flow.sha256))}</code>.</p>`,
      });
    }
    const popEntries = loaded
      .filter((l) => l.artifactType === 'pop')
      .flatMap((p) => parsePop(p.body).entries);
    if (popEntries.length) {
      slides.push({
        title: 'Padronização (POPs)',
        kind: 'section',
        html: `<p>${popEntries.length} procedimento(s) operacional(is) padronizado(s):</p>${popEntries
          .slice(0, 8)
          .map((e) => `<code>${escapeHtml(e.id)}</code> ${escapeHtml(e.title)}`)
          .join('<br>')}${popEntries.length > 8 ? '<br>…' : ''}`,
      });
    }
    slides.push({
      title: 'Próximos passos & rastreabilidade',
      kind: 'closing',
      html: `<p>Confiança 🟢🟡🔴, glossário, topologia e cronograma nas demais páginas do mini-site.</p><p class="muted">Cada artefato é rastreável pelo SHA-256 · selo (seed): <code>${escapeHtml(shortSha(seed))}</code></p>`,
    });
    await emit('deck.html', renderDeckPage({ slides }));
  }

  // 4d. Processos (1 página por POP, keyed por ID da hierarquia) + índice.
  if (want('processos')) {
    const allEntries = loaded
      .filter((l) => l.artifactType === 'pop')
      .flatMap((p) => parsePop(p.body).entries.map((e) => ({ ...e, shaShort: shortSha(p.sha256) })));
    // Dedupe por ID (keep first) — múltiplos artefatos pop podem cobrir o mesmo ID.
    const seen = new Set<string>();
    const entries = allEntries.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    const siblings = entries.map((e) => ({ id: e.id, title: e.title, href: `${e.id}.html` }));
    for (const e of entries) {
      await emit(
        `processos/${e.id}.html`,
        renderProcessoPage({
          id: e.id,
          title: e.title,
          body: e.body,
          shaShort: e.shaShort,
          sourceType: 'pop',
          backHref: 'index.html',
          siblings,
        }),
      );
    }
    await emit(
      'processos/index.html',
      renderProcessoIndex({
        entries: entries.map((e) => ({ id: e.id, title: e.title, shaShort: e.shaShort })),
        stage,
      }),
    );
  }

  // 5. Copiar vendor. resolveVendorDir cobre dev (scripts/docs-site/vendor) e o layout
  // publicado (vendor shipado em <raiz>/scripts/docs-site/vendor, NÃO em dist/). Sem isso,
  // o pacote publicado copia 0 arquivos → os <script src=assets/vendor/…> falham sob file://
  // e os visuais 3D/D3/ECharts caem no fallback (bug de campo, fix 0.12.0).
  const here = path.dirname(fileURLToPath(import.meta.url));
  const vendorSrc = resolveVendorDir(here);
  const copied = vendorSrc
    ? await copyVendor(vendorSrc, path.join(outDir, 'assets', 'vendor'))
    : [];
  if (copied.length) pages.push(`${OUTPUT_REL}/assets/vendor/`);
  if (!vendorSrc) {
    warnings.push(
      'Diretório vendor não encontrado — visuais 3D/grafo/métricas/diagramas podem não carregar. ' +
        'Reinstale o módulo: npm install process-ai@latest.',
    );
  }
  // vendoredLibs: libs (a) usadas por páginas geradas E (b) efetivamente copiadas para o
  // outDir. Honestidade dupla — não anuncia o que não usou nem o que não shipou.
  const vendoredLibs: VendoredLib[] = Object.keys(VENDOR_REGISTRY)
    .filter((name) => usedVendors.has(name))
    .filter((name) => copied.includes(VENDOR_REGISTRY[name].vendorPath))
    .map((name) => VENDOR_REGISTRY[name]);

  const indexUrl =
    `${OUTPUT_REL}/index.html`;

  return {
    indexUrl,
    pages,
    sourceArtifacts: loaded.map((l) => ({ sha256: l.sha256, artifactType: l.artifactType })),
    seed,
    vendoredLibs,
    warnings,
  };
}

export { DOCS_SITE_VERSION };
