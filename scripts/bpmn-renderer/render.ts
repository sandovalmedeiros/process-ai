/**
 * scripts/bpmn-renderer/render.ts — Renderizador BPMN → PNG/SVG (Guilherme).
 *
 * Usa Playwright + bpmn-js (CDN) para converter BPMN 2.0 XML em imagens
 * profissionais com estilo Bizagi-like. AD-6 compliant: o XML canônico é a fonte;
 * a imagem é derivação.
 *
 * Este módulo vive em scripts/ (não em toolkit/src/) porque importa 'playwright'
 * (dev dependency). O core do toolkit (toolkit/src/) permanece AD-3 compliant
 * (apenas node:* e imports relativos).
 */

import { chromium, Browser, Page } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoLayout } from './auto-layout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, 'render.html');

/** Resultado da renderização. */
export interface RenderResult {
  /** Caminho do arquivo PNG gerado. */
  pngPath: string;
  /** Caminho do arquivo SVG gerado. */
  svgPath: string;
  /** Avisos do bpmn-js (ex.: elementos não-suportados). */
  warnings: string[];
}

/**
 * Renderiza BPMN 2.0 XML como PNG + SVG.
 *
 * Abre um Chromium headless, carrega o bpmn-js viewer, injeta o XML,
 * extrai o SVG do DOM e tira screenshot para PNG.
 *
 * @param bpmnXml - String BPMN 2.0 XML canônica (AD-6).
 * @param outputDir - Diretório de saída (ex.: _process-ai_output/flow/).
 * @param baseName - Nome base para os arquivos (ex.: sha256 do artefato).
 * @returns RenderResult com paths dos arquivos gerados.
 */
export async function renderBpmn(
  bpmnXml: string,
  outputDir: string,
  baseName: string,
): Promise<RenderResult> {
  await mkdir(outputDir, { recursive: true });

  let browser: Browser | null = null;
  const warnings: string[] = [];

  // Se o XML não tem BPMNDiagram (comum em BPMN gerado por LLMs),
  // aplica auto-layout para gerar coordenadas visuais básicas.
  let finalXml = bpmnXml;
  if (!/<bpmndi:BPMNDiagram/i.test(bpmnXml) && /<bpmn:process/i.test(bpmnXml)) {
    finalXml = autoLayout(bpmnXml);
    warnings.push('auto-layout: coordenadas BPMNDiagram geradas automaticamente');
  }

  try {
    // 1. Launch headless Chromium
    browser = await chromium.launch({ headless: true });

    const page: Page = await browser.newPage();
    await page.setViewportSize({ width: 1560, height: 1002 });

    // 2. Load the bpmn-js viewer HTML template
    const html = await readFile(TEMPLATE_PATH, 'utf-8');
    await page.setContent(html, { waitUntil: 'networkidle' });

    // 3. Inject BPMN XML and wait for render
    await page.evaluate(
      (xml) => (window as unknown as Record<string, unknown>)['renderBpmn'](xml),
      finalXml,
    );

    // Wait for the viewer to finish rendering (title is set to OK/WARN/ERROR)
    await page.waitForFunction(
      () => document.title === 'OK' || document.title.startsWith('WARN') || document.title.startsWith('ERROR'),
      { timeout: 15000 },
    );

    const title = await page.title();
    if (title.startsWith('ERROR:')) {
      throw new Error(`bpmn-js render error: ${title.slice(6)}`);
    }
    if (title.startsWith('WARN:')) {
      warnings.push(...title.slice(5).split('; '));
    }

    // 4. Fit viewport to diagram
    await page.evaluate(() => {
      const v = (window as unknown as Record<string, unknown>)['_viewer'] as { get: (s: string) => { zoom: (f: string, a: string) => void } } | undefined;
      if (v) {
        v.get('canvas').zoom('fit-viewport', 'auto');
      }
    });

    // 5. Extract SVG from the bpmn-js canvas
    const svgContent = await page.evaluate(() => {
      const svg = document.querySelector('#canvas svg');
      if (!svg) return null;
      return new XMLSerializer().serializeToString(svg);
    });

    const svgPath = path.join(outputDir, `${baseName}.svg`);
    if (svgContent) {
      await writeFile(svgPath, svgContent, 'utf-8');
    }

    // 6. Screenshot → PNG (full page, crops to content)
    const pngPath = path.join(outputDir, `${baseName}.png`);
    const canvasHandle = await page.$('#canvas');
    if (canvasHandle) {
      await canvasHandle.screenshot({ path: pngPath, type: 'png' });
    } else {
      await page.screenshot({ path: pngPath, type: 'png', fullPage: true });
    }

    return { pngPath, svgPath, warnings };
  } finally {
    if (browser) await browser.close();
  }
}
