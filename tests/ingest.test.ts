/**
 * tests/ingest.test.ts — parseIngestJson() (camada defensiva do contrato JSON).
 *
 * O wrapper Node (ingest.ts) lê da stdout do script Python um contrato JSON
 * { ok, format, markdown, images, metadata, ... }. Algumas libs Python escrevem
 * avisos direto na stdout (ex.: PyMuPDF >=1.24 ao fazer `import fitz` depreciado),
 * o que quebra um `JSON.parse` ingênuo. `parseIngestJson` recupera o objeto JSON
 * mais externo antes de falhar.
 *
 * Regressão do bug: ingest de PDF falhava com "saída não-JSON" porque o warning
 * do PyMuPDF prefixava o JSON. (Raiz corrigida em ingest_pdf.py: `import pymupdf
 * as fitz`; defesa adicional aqui.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngestJson, IngestError } from '../toolkit/src/ingest.ts';

/** Aviso real do PyMuPDF >=1.24 ao importar o nome `fitz` depreciado. */
const FITZ_WARNING =
  'warning: The `fitz` API is deprecated and will be removed in future. Use `import pymupdf` instead.\n';

/** Contrato de sucesso representativo (emitido por ingest_common.emit_success). */
const SUCCESS_CONTRACT = {
  ok: true,
  format: 'pdf',
  markdown: 'baseconhcertidoesprodebfat140519portal.md',
  images: ['images/baseconhcertidoesprodebfat140519portal/img000.jpeg'],
  metadata: {
    source_file: 'baseconhcertidoesprodebfat140519portal.pdf',
    title: 'Certidão',
    author: '',
    created: '',
  },
  pages: 3,
};

test('JSON puro → parsed sem alteração (caminho feliz, sem custo extra)', () => {
  const out = parseIngestJson(JSON.stringify(SUCCESS_CONTRACT));
  assert.equal(out.ok, true);
  assert.equal(out.format, 'pdf');
  assert.equal(out.pages, 3);
  assert.deepEqual(out.images, SUCCESS_CONTRACT.images);
});

test('REGRESSÃO: warning do PyMuPDF prefixando o JSON → recupera o contrato', () => {
  // Reprodução fiel do bug reportado: stdout começava com o warning, depois o JSON.
  const stdout = FITZ_WARNING + JSON.stringify(SUCCESS_CONTRACT);
  const out = parseIngestJson(stdout);
  assert.equal(out.ok, true);
  assert.equal(out.format, 'pdf');
  assert.equal(out.pages, 3);
  // Objeto aninhado (metadata) preservado — prova que lastIndexOf('}') acha a
  // chave externa, não a do objeto interno.
  assert.equal(out.metadata?.title, 'Certidão');
});

test('warning antes + lixo depois do JSON → ainda recupera (prefix+suffix)', () => {
  const stdout = FITZ_WARNING + JSON.stringify(SUCCESS_CONTRACT) + '\n-- trailing noise --';
  const out = parseIngestJson(stdout);
  assert.equal(out.ok, true);
  assert.equal(out.format, 'pdf');
});

test('contrato de erro (ok:false) com chaves na mensagem → recuperado; !ok flui p/ runIngestScript', () => {
  const errContract = { ok: false, error: 'Falha ao converter PDF "x.pdf": EOF inesperado {linha 42}' };
  const out = parseIngestJson(FITZ_WARNING + JSON.stringify(errContract));
  assert.equal(out.ok, false);
  assert.match(out.error ?? '', /EOF inesperado/);
});

test('stdout sem nenhum JSON → lança IngestError com msg "não-JSON"', () => {
  assert.throws(
    () => parseIngestJson('puramente texto, nenhum JSON aqui'),
    (err) => {
      assert.ok(err instanceof IngestError, 'deve ser IngestError');
      assert.match((err as Error).message, /saída não-JSON/i);
      return true;
    },
  );
});

test('warning contendo chave desbalanceada → falha gracosa (não corrompe silenciosamente)', () => {
  // Limitação documentada do heurístico first-{'/last-}': se o aviso contiver um
  // '{' antes do JSON real, o slice fica inválido e o parser falha com erro claro
  // — preferível a devolver um JSON parcial/corrompido. Na prática nenhum aviso
  // real de lib tem chave desbalanceada; a correção de raiz (import pymupdf)
  // elimina o aviso do PyMuPDF inteiramente.
  const stdout = 'warning: use {pymupdf} instead\n' + JSON.stringify(SUCCESS_CONTRACT);
  assert.throws(() => parseIngestJson(stdout), IngestError);
});
