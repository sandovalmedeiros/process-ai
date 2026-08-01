/**
 * tests/import-boundary.test.ts — O GUARDRAIL DE AD-3 (o teste que impede o desastre).
 *
 * Materializa a invariante "o core nunca toca engine": varre recursivamente os
 * arquivos .ts sob toolkit/src e falha se algum import/export referenciar um
 * adapter concreto ou uma API de engine.
 * É o teste de aceitação de FR-21/AD-3 — garante que um 2º engine possa ser
 * adicionado sem reescrever o core.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(REPO_ROOT, 'toolkit', 'src');

/** Caminha recursivamente em busca de arquivos .ts. */
async function walkTs(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkTs(full)));
    else if (e.isFile() && e.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Remove comentários de linha e bloco para evitar falsos-positivos em JSDoc.
 *  Best-effort (não parseia strings perfeitamente), suficiente para um guardrail. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments (incl. JSDoc)
    .replace(/\/\/[^\n]*/g, ' ');        // line comments
}

/** Extrai specifiers de módulo de import/export — estáticos, side-effect e dinâmicos. */
function extractSpecifiers(content: string): string[] {
  const src = stripComments(content);
  const specs: string[] = [];
  const reStatic = /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g; // import/export ... from 'x'
  const reSideEffect = /\bimport\s*['"]([^'"]+)['"]/g;                  // import 'x' (sem from)
  const reDynamic = /(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g; // import('x') / require('x')
  let m: RegExpExecArray | null;
  while ((m = reStatic.exec(src)) !== null) specs.push(m[1]);
  while ((m = reSideEffect.exec(src)) !== null) specs.push(m[1]);
  while ((m = reDynamic.exec(src)) !== null) specs.push(m[1]);
  return specs;
}

/** Retorna o motivo se o specifier viola o allowlist do core; senão null.
 *  ALLOWLIST (CR R1#5): o core só pode importar de `node:` builtins ou caminhos
 *  relativos. Qualquer package externo (npm — especialmente SDKs de engine) é
 *  proibido. Fecha o buraco da denylist fechada (SDKs futuros escapavam) e pega
 *  side-effect imports (`import 'pkg'`, extraídos pelo reSideEffect). */
function forbiddenReason(specifier: string): string | null {
  // 1. node: builtins → permitido.
  if (specifier.startsWith('node:')) return null;
  // 2. Caminho relativo → permitido, EXCETO apontando para adapter concreto
  //    (o core não depende de adapter; invariante da porta).
  if (specifier.startsWith('.')) {
    return /(^|\/)adapters(\/|$)/.test(specifier)
      ? `import relativo para adapters (o core não depende de adapter concreto): "${specifier}"`
      : null;
  }
  // 3. Qualquer outro specifier (bare package, absolute, etc.) → PROIBIDO.
  return `import de package externo viola o allowlist do core (só node: + relativos): "${specifier}"`;
}

test('AD-3: toolkit/src/** não importa adapters nem APIs de engine', async () => {
  const files = await walkTs(SRC_DIR);
  assert.ok(
    files.length > 0,
    'toolkit/src deve conter ao menos um .ts — senão este teste é vazio (falso-positivo de conformidade).',
  );

  const violations: string[] = [];
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    const content = await fs.readFile(file, 'utf8');
    for (const spec of extractSpecifiers(content)) {
      const reason = forbiddenReason(spec);
      if (reason) violations.push(`${rel}: ${reason}`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Violação de AD-3 — o core acoplou-se a uma engine/adapter:\n${violations.join('\n')}`,
  );
});

// ---- CR R1#5: cobertura do novo allowlist ----

test('AD-3 allowlist: node: e relativos permitidos; package externo proibido', () => {
  assert.equal(forbiddenReason('node:fs'), null);
  assert.equal(forbiddenReason('node:path'), null);
  assert.equal(forbiddenReason('./sibling'), null);
  assert.equal(forbiddenReason('../bar'), null);
  assert.ok(forbiddenReason('some-npm-pkg') !== null, 'bare package deve ser proibido');
  assert.ok(forbiddenReason('@anthropic-ai/sdk') !== null, 'scoped package deve ser proibido');
  assert.ok(forbiddenReason('./adapters/x') !== null, 'relativo p/ adapters deve ser proibido');
});

test('AD-3 allowlist: side-effect import (sem from) é extraído e proibido', () => {
  const specs = extractSpecifiers("import '@anthropic-ai/sdk';");
  assert.ok(specs.includes('@anthropic-ai/sdk'), 'side-effect import deve ser extraído pelo reSideEffect');
  assert.ok(forbiddenReason(specs[0]) !== null, 'package externo side-effect deve ser proibido');
});

test('AD-3 allowlist: specifiers dentro de comentários/JSDoc são ignorados (stripComments)', () => {
  const src = [
    '/** docs: ver @anthropic-ai/sdk — NÃO importar de engine */',
    '// import "fake-pkg-from-comment"',
    "const x = 'import \\'still-not-a-real-import\\'';",
    'export {};',
  ].join('\n');
  assert.deepEqual(extractSpecifiers(src), [], 'nenhum specifier deve ser extraído de comentários');
});
