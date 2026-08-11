/**
 * toolkit/src/ingest.ts — INGESTÃO DOCUMENTAL (Laura, a Arquivista).
 *
 * Orquestra a conversão de documentos (PDF/DOCX/PPTX) em artefatos
 * `reference-material` commitados via `adapter.propose()`. A detecção de
 * formato é feita por magic bytes no TS e dispatchado para o script Python
 * correspondente (`scripts/ingest_<formato>.py`).
 *
 * O script Python emite um contrato JSON na stdout:
 *   { ok, format, pages?, slides?, markdown, images, metadata }
 *
 * Este módulo lê esse JSON, constrói um `ProposePayload` com claims 🟡
 * automáticos (extração mecânica) e commita via `adapter.propose()`.
 *
 * INVARIANTE AD-3 (núcleo hexagonal): este arquivo só importa `node:*`
 * builtins ou caminhos relativos dentro do core — nunca um package npm.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommitResult, EngineAdapter, ProposePayload } from './engine-adapter.ts';
import { findPackageRoot } from './install.ts';

// ---- Tipos ----

/** Contrato JSON que cada script Python emite na stdout. */
export interface IngestResult {
  ok: boolean;
  error?: string;
  format?: string;
  pages?: number;
  slides?: number;
  sheets?: number;
  rows?: number;
  columns?: number;
  elements?: number;
  markdown?: string;
  images?: string[];
  metadata?: {
    source_file?: string;
    title?: string;
    author?: string;
    created?: string;
    modified?: string;
  };
}

/** Formatos suportados pelo pipeline de ingestão. */
export type IngestFormat = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'csv' | 'xml';

/** Resultado da operação de ingest (um ou mais Commits). */
export interface IngestCommitResult {
  /** Caminho absoluto do arquivo ingerido. */
  filePath: string;
  /** Formato detectado. */
  format: IngestFormat;
  /** CommitResult do adapter.propose(). */
  commit: CommitResult;
}

/** Erro acionável de ingest — sempre com contexto, em pt-BR. */
export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestError';
  }
}

// ---- Constantes ----

/** Extensões suportadas (para scan de diretório). */
const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set(['.pdf', '.docx', '.pptx', '.xlsx', '.csv', '.xml']);

/** Map formato → script Python (relativo ao diretório scripts/ no repo). */
const FORMAT_SCRIPT: Record<IngestFormat, string> = {
  pdf: 'ingest_pdf.py',
  docx: 'ingest_docx.py',
  pptx: 'ingest_pptx.py',
  xlsx: 'ingest_xlsx.py',
  csv: 'ingest_csv.py',
  xml: 'ingest_xml.py',
};

// ---- Detecção de formato (magic bytes, TS-side) ----

/**
 * Detecta o formato de um arquivo por magic bytes.
 *
 * PDF:  %PDF-
 * DOCX: ZIP (PK\x03\x04) + [Content_Types].xml com word/
 * PPTX: ZIP (PK\x03\x04) + [Content_Types].xml com ppt/
 *
 * @returns Formato detectado ou null se não reconhecido.
 */
async function detectFormat(filePath: string): Promise<IngestFormat | null> {
  let fd: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    fd = await fs.open(filePath, 'r');
    const header = Buffer.alloc(8);
    await fd.read(header, 0, 8, 0);

    // PDF: %PDF-
    if (header[0] === 0x25 && header[1] === 0x50 &&
        header[2] === 0x44 && header[3] === 0x46 &&
        header[4] === 0x2D) {
      return 'pdf';
    }

    // ZIP-based (DOCX/PPTX): PK\x03\x04
    if (header[0] === 0x50 && header[1] === 0x4B &&
        header[2] === 0x03 && header[3] === 0x04) {
      // Read more to find [Content_Types].xml
      const more = Buffer.alloc(4096);
      await fd.read(more, 0, 4096, 0);
      const content = more.toString('utf-8');

      if (content.includes('application/vnd.openxmlformats-officedocument.presentationml')) {
        return 'pptx';
      }
      if (content.includes('application/vnd.openxmlformats-officedocument.wordprocessingml')) {
        return 'docx';
      }
      if (content.includes('application/vnd.openxmlformats-officedocument.spreadsheetml')) {
        return 'xlsx';
      }
      // Fallback heuristic
      if (content.includes('ppt/slides/') || content.includes('ppt/slides')) {
        return 'pptx';
      }
      if (content.includes('word/')) {
        return 'docx';
      }
      if (content.includes('xl/')) {
        return 'xlsx';
      }
      return null;
    }

    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      await fd.close();
    }
  }
}

// ---- Resolução do Python ----

/** Resolve o executável Python (tenta python3, depois python). */
function resolvePython(): string {
  // On Windows, "python" is the standard; "python3" may not exist.
  // On Unix, "python3" is preferred.
  if (process.platform === 'win32') {
    return 'python';
  }
  return 'python3';
}

/** Resolve o diretório scripts/ a partir do package root do framework. */
function resolveScriptsDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const pkgRoot = findPackageRoot(path.dirname(thisFile));
  if (!pkgRoot) {
    throw new IngestError(
      'Não foi possível localizar a raiz do framework (package.json do process-ai). ' +
      'Reinstale o módulo: npm install process-ai@latest',
    );
  }
  return path.join(pkgRoot, 'scripts');
}

// ---- Parse defensivo do contrato JSON ----

/**
 * Extrai o contrato JSON da stdout de um script Python de ingest.
 *
 * Defensivo: algumas libs Python (ex.: PyMuPDF >=1.24 ao fazer o `import fitz`
 * depreciado) escrevem avisos direto na **stdout** — não no stderr, e não via
 * módulo `warnings` (por isso `PYTHONWARNINGS=ignore` não os silencia). Tais
 * avisos podem prefixar/sufixar o JSON do contrato e quebrar `JSON.parse`. Este
 * parser recupera o objeto JSON mais externo antes de falhar, mantendo o caminho
 * feliz (JSON puro) sem custo extra.
 *
 * Exportado para teste direto (tests/ingest.test.ts).
 *
 * @throws {IngestError} se stdout não contiver um JSON válido.
 */
export function parseIngestJson(stdout: string): IngestResult {
  // Caminho feliz: stdout é JSON puro (contrato normal).
  try {
    return JSON.parse(stdout) as IngestResult;
  } catch {
    // Recuperação: localiza o objeto JSON mais externo (do primeiro '{' ao
    // último '}'). Caso comum: aviso prefixado ("warning: ...\n{...json...}").
    const start = stdout.indexOf('{');
    const end = stdout.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(stdout.slice(start, end + 1)) as IngestResult;
      } catch {
        // Aviso pode conter chaves — cai para o erro original abaixo.
      }
    }
    throw new IngestError(
      `Script Python retornou saída não-JSON. stdout (primeiros 300 chars): ${stdout.slice(0, 300)}`,
    );
  }
}

// ---- Execução do script Python ----

/**
 * Executa um script Python de ingest e devolve o contrato JSON parseado.
 *
 * @param scriptPath - Caminho absoluto do script .py
 * @param inputPath  - Caminho absoluto do arquivo de entrada
 * @param outputDir  - Diretório de saída para markdown + imagens
 * @returns IngestResult parseado
 */
function runIngestScript(
  scriptPath: string,
  inputPath: string,
  outputDir: string,
): Promise<IngestResult> {
  return new Promise((resolve, reject) => {
    const pythonExe = resolvePython();
    const args = [scriptPath, '--input', inputPath, '--output-dir', outputDir];

    execFile(pythonExe, args, {
      timeout: 120_000, // 2 min timeout for large documents
      maxBuffer: 10 * 1024 * 1024, // 10MB stdout
    }, (err, stdout, stderr) => {
      if (err) {
        const stderrPreview = stderr ? stderr.slice(0, 500) : '';
        const hint = stderrPreview.includes('ModuleNotFoundError')
          ? ` — Módulo Python ausente. Instale as dependências: pip install -r scripts/requirements-ingest.txt`
          : stderrPreview.includes('No module named')
            ? ` — Dependência Python ausente (${stderrPreview.split('\n')[0] || stderrPreview}). Rode: pip install -r scripts/requirements-ingest.txt`
            : '';
        reject(new IngestError(
          `Script Python falhou (exit ${err.code ?? 'unknown'}): ${stderrPreview || err.message}${hint}`,
        ));
        return;
      }

      // Parse JSON output (defensivo — tolera avisos não-JSON na stdout; ver parseIngestJson)
      let result: IngestResult;
      try {
        result = parseIngestJson(stdout);
      } catch (e) {
        reject(e);
        return;
      }

      if (!result.ok) {
        reject(new IngestError(
          result.error ?? 'Script Python reportou falha sem mensagem de erro.',
        ));
        return;
      }

      resolve(result);
    });
  });
}

// ---- Builder de ProposePayload ----

/**
 * Constrói o ProposePayload a partir do resultado do script Python.
 *
 * O content é um objeto estruturado (schema reference-material/v1), não
 * string pura — o canonicalize do commit serializa JSON estável.
 */
function buildPayload(
  result: IngestResult,
  inputPath: string,
  outputDir: string,
): ProposePayload {
  const filename = path.basename(inputPath);
  const fmt = result.format ?? 'desconhecido';

  // Ler o markdown do disco para incluir no payload
  // (o script Python escreveu o arquivo; nós lemos para propor)
  const mdRelPath = result.markdown ?? '';
  // O markdown será lido pelo commit via content — vamos passar o corpo diretamente

  return {
    artifactType: 'reference-material',
    content: {
      // O content é o markdown cru + metadados — o schema-core aceita objetos
      body: result.markdown ?? '',
      source_file: result.metadata?.source_file ?? filename,
      source_format: fmt,
      page_count: result.pages ?? result.slides ?? result.sheets ?? result.rows ?? result.elements ?? 1,
      metadata: {
        title: result.metadata?.title ?? filename,
        author: result.metadata?.author ?? '',
        created: result.metadata?.created ?? '',
      },
    },
    claims: [
      {
        statement: `Conteúdo extraído mecanicamente de "${filename}" ` +
          `(formato ${fmt.toUpperCase()}, ` +
          `${result.pages ? result.pages + ' páginas' : ''}` +
          `${result.slides ? result.slides + ' slides' : ''}` +
          `${result.sheets ? result.sheets + ' planilhas' : ''}` +
          `${result.rows ? result.rows + ' linhas' : ''}` +
          `${result.elements ? result.elements + ' elementos' : ''})`,
        level: '🟡', // 🟡
        reasoning: (() => {
          const base = `Conversão ${fmt.toUpperCase()} → Markdown via script Python (scripts/ingest_${fmt}.py).`;
          switch (fmt) {
            case 'pdf':
              return `${base} Estrutura (headings) inferida por heurística de font-size; conteúdo textual é determinístico.`;
            case 'docx':
              return `${base} Estrutura baseada em estilos nativos (Heading 1-6); tabelas convertidas para markdown; imagens extraídas com contexto de parágrafo.`;
            case 'pptx':
              return `${base} Estrutura baseada em títulos de slide; notas do apresentador incluídas como blockquote; SmartArt/diagramas marcados como placeholder.`;
            case 'xlsx':
              return `${base} Estrutura baseada em planilhas; fórmulas convertidas para valores (data_only); células convertidas em tabelas markdown por sheet.`;
            case 'csv':
              return `${base} Delimitador detectado automaticamente (vírgula, ponto-e-vírgula ou tab); cabeçalho inferido da primeira linha; linhas vazias removidas.`;
            case 'xml':
              return `${base} Estrutura hierárquica convertida em headings markdown; atributos representados como blockquote; namespaces XML removidos dos nomes dos elementos.`;
            default:
              return base;
          }
        })(),
      },
    ],
  };
}

// ---- Scan de diretório ----

/**
 * Lista recursivamente arquivos com extensões suportadas em um diretório.
 */
async function scanDirectory(dirPath: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await scanDirectory(fullPath)));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

// ---- Orquestrador principal ----

export interface IngestOptions {
  /** Caminho do arquivo ou diretório a ingerir. */
  path: string;
  /** Adapter para propose (composition root injeta). */
  adapter: EngineAdapter;
  /** Raiz da sessão (projeto-alvo). */
  root: string;
  /** Nome do agente (registrado em provenance; default "Laura"). */
  agent?: string;
}

/**
 * Ingere um ou mais documentos e os commita como `reference-material`.
 *
 * Se `opts.path` for um diretório, processa recursivamente todos os
 * `.pdf`/`.docx`/`.pptx` (1 commit por arquivo). Se for um arquivo,
 * processa apenas ele.
 *
 * @returns Lista de IngestCommitResult, um por arquivo ingerido.
 */
export async function ingest(opts: IngestOptions): Promise<IngestCommitResult[]> {
  const { adapter, root } = opts;
  const inputPath = path.resolve(opts.path);
  const agent = opts.agent ?? 'Laura';
  const scriptsDir = resolveScriptsDir();

  // Resolver lista de arquivos
  let st: Awaited<ReturnType<typeof fs.stat>>;
  try {
    st = await fs.stat(inputPath);
  } catch {
    throw new IngestError(
      `Caminho não encontrado: ${inputPath}. Verifique se o arquivo ou diretório existe.`,
    );
  }

  let files: string[];
  if (st.isDirectory()) {
    files = await scanDirectory(inputPath);
    if (files.length === 0) {
      throw new IngestError(
        `Nenhum arquivo suportado (.pdf, .docx, .pptx, .xlsx, .csv, .xml) encontrado em: ${inputPath}.`,
      );
    }
  } else if (st.isFile()) {
    const ext = path.extname(inputPath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new IngestError(
        `Formato não suportado: "${ext}". Formatos aceitos: .pdf, .docx, .pptx, .xlsx, .csv, .xml.`,
      );
    }
    files = [inputPath];
  } else {
    throw new IngestError(
      `Caminho não é arquivo nem diretório: ${inputPath}.`,
    );
  }

  // Output dir: _process-ai_output/reference-material/ (sem escrita direta — só
  // passamos o dir para o Python escrever assets; o markdown é lido de volta e
  // passado via propose ao toolkit, que é o único escritor nas pastas protegidas).
  const outputDir = path.join(root, '_process-ai_output', 'reference-material');
  await fs.mkdir(outputDir, { recursive: true });

  const results: IngestCommitResult[] = [];

  for (const filePath of files) {
    // 1) Detectar formato
    const format = await detectFormat(filePath);
    if (!format) {
      // Tenta detecção por extensão como fallback
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      if (ext === 'pdf' || ext === 'docx' || ext === 'pptx' || ext === 'xlsx' || ext === 'csv' || ext === 'xml') {
        throw new IngestError(
          `Não foi possível confirmar o formato de "${path.basename(filePath)}" ` +
          `(extensão .${ext} mas magic bytes não reconhecidos). O arquivo pode estar corrompido.`,
        );
      }
      throw new IngestError(
        `Formato não reconhecido para: ${path.basename(filePath)}.`,
      );
    }

    const scriptName = FORMAT_SCRIPT[format];
    const scriptPath = path.join(scriptsDir, scriptName);

    // 2) Verificar que o script existe
    try {
      await fs.access(scriptPath);
    } catch {
      throw new IngestError(
        `Script de ingestão não encontrado: ${scriptPath}. ` +
        `O framework pode estar com a instalação incompleta. Rode "process-ai update" para reparar.`,
      );
    }

    // 3) Executar script Python
    const result = await runIngestScript(scriptPath, filePath, outputDir);

    // 4) Ler o markdown gerado e construir payload
    const markdownAbsPath = result.markdown
      ? path.resolve(outputDir, result.markdown)
      : null;
    let mdBody = '';
    if (markdownAbsPath) {
      try {
        mdBody = await fs.readFile(markdownAbsPath, 'utf-8');
      } catch {
        // markdown file not readable — use empty body
      }
    }

    // Construir payload com o markdown real
    const payload = buildPayload(result, filePath, outputDir);
    // Substituir o body placeholder pelo conteúdo real do arquivo
    if (typeof payload.content === 'object' && payload.content !== null) {
      (payload.content as Record<string, unknown>).body = mdBody;
    }

    // 5) Propor (commit)
    const commitResult = await adapter.propose(payload);

    results.push({
      filePath: path.resolve(filePath),
      format,
      commit: commitResult,
    });
  }

  return results;
}

// ---- Helpers públicos ----

/**
 * Lista os formatos suportados para mensagens de erro/help.
 */
export function supportedFormats(): string {
  return '.pdf, .docx, .pptx, .xlsx, .csv, .xml';
}
