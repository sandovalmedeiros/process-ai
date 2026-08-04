/**
 * toolkit/src/installer/resource.ts — localização de assets do próprio framework.
 *
 * Centraliza resoluções relativas ao package root (via `findPackageRoot`) para o
 * installer: versão do framework (detecção de stale) e package root (guard de
 * self-install). Reduz duplicação entre o installer e o `install.ts`.
 *
 * AD-3 / import-boundary: só `node:*` + relativo (../install.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPackageRoot } from '../install.ts';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Package root do framework (dir com `package.json` name "process-ai"), ou null. */
export function getPackageRoot(): string | null {
  return findPackageRoot(MODULE_DIR);
}

/**
 * Versão do framework lida do `package.json` do próprio package. Usada para
 * detecção de stale (manifest.framework_version !== versão atual). '0.0.0' se
 * não resolver (não deve acontecer em pacote publicado).
 */
export function getFrameworkVersion(): string {
  const root = getPackageRoot();
  if (!root) return '0.0.0';
  try {
    return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))?.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
