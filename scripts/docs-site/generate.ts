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

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveBody, extractTitle, extractGlossaryTerms, countByType } from './extract.ts';
import { renderIndexPage } from './render/index.ts';
import { renderTopologiaPage } from './render/topologia.ts';
import { renderGlossaryPage } from './render/glossary.ts';

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
interface CheckpointState {
  stage: string;
  artifacts: CheckpointArtifact[];
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

/** Copia recursivamente *.js de vendor/ → outDir/assets/vendor/ (no-op se vazio). */
async function copyVendor(vendorSrc: string, vendorOut: string): Promise<string[]> {
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
    if (e.isDirectory()) {
      copied.push(...(await copyVendor(src, dst)));
    } else if (e.isFile() && e.name.endsWith('.js')) {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(src, dst);
      copied.push(e.name);
    }
  }
  return copied;
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
  try {
    const cp = (await readJson(cpPath)) as CheckpointState;
    stage = typeof cp.stage === 'string' ? cp.stage : '';
    cpArtifacts = Array.isArray(cp.artifacts) ? cp.artifacts : [];
  } catch {
    warnings.push(`Checkpoint não legível em ${cpPath} — gerando minisite vazio. Rode a pipeline do process-ai primeiro.`);
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
  const want = (name: string): boolean => !only || only.has(name);
  const emit = async (relName: string, html: string): Promise<void> => {
    await atomicWrite(path.join(outDir, relName), html);
    pages.push(`${OUTPUT_REL}/${relName}`);
  };

  // 4. Páginas (P0 — vanilla, sem libs vendoradas).
  if (want('index')) {
    const navPages = [
      { href: 'topologia.html', label: 'Topologia', hint: 'Antes × depois do mapeamento' },
      { href: 'glossario.html', label: 'Glossário', hint: 'Termos do processo, com busca' },
    ].filter((p) => want(p.href.replace(/\.html$/, '')));
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

  if (want('glossario')) {
    const terms = extractGlossaryTerms(
      loaded
        .filter((l) => l.artifactType === 'discovery-interview' || l.artifactType === 'pop' || l.artifactType === 'process-report')
        .map((l) => ({ body: l.body, source: l.artifactType })),
    );
    await emit('glossario.html', renderGlossaryPage(terms));
  }

  // 5. Copiar vendor (P0: dir existe mas sem *.js → no-op).
  const here = path.dirname(fileURLToPath(import.meta.url));
  const copied = await copyVendor(path.join(here, 'vendor'), path.join(outDir, 'assets', 'vendor'));
  if (copied.length) pages.push(`${OUTPUT_REL}/assets/vendor/`);
  // vendoredLibs: P0 = vazio. Fases futuras populam a partir de vendor/PROVENANCE.md.
  const vendoredLibs: VendoredLib[] = [];

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
