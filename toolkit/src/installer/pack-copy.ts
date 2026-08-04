/**
 * toolkit/src/installer/pack-copy.ts — cópia de method-packs (framework → target).
 *
 * Materializa a segunda metade do install que faltava: o installer copiava skills
 * e escrevia config apontando p/ bpmn-sipoc, mas NUNCA copiava method-packs/ para
 * o projeto-alvo. O `commit.ts` resolve o pack em `<root>/method-packs/<id>/` e
 * falhava com ENOENT (pack.toml não encontrado).
 *
 * Este módulo é framework-level (não IDE-specific) — method-packs são agnósticos
 * à IDE e vivem em `method-packs/` na raiz do projeto-alvo (visíveis ao usuário,
 * editáveis para criar packs customizados). Por isso está sob `toolkit/src/`, não
 * sob `toolkit/adapters/`.
 *
 * AD-3 / import-boundary: só `node:*` + relativo (../install.ts p/ findPackageRoot).
 * Zero deps de adapter.
 */

import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPackageRoot } from '../install.ts';
import { sha256File } from './manifest.ts';
import type { InstalledFile } from '../ide-setup.ts';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Diretório fonte de method-packs no framework (localizado via package root). */
function getSourcePacksDir(): string {
  const pkgRoot = findPackageRoot(MODULE_DIR);
  if (!pkgRoot) {
    throw new Error(
      'Não foi possível localizar o package root do process-ai. ' +
        'O framework parece estar instalado de forma incompleta.',
    );
  }
  return path.join(pkgRoot, 'method-packs');
}

/** Nome do diretório de method-packs no projeto-alvo. */
const TARGET_PACKS_DIR = 'method-packs';

/**
 * Copia recursivamente um diretório (source → dest). Pula symlinks (defense-in-depth).
 * Idempotente: sobrescreve arquivos existentes (re-run seguro).
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) continue; // defense-in-depth
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      // lstat no destino: recusa escrever sobre symlink
      try {
        const destStat = await fs.lstat(destPath);
        if (destStat.isSymbolicLink()) {
          throw new Error(
            `Recusa escrever ${destPath}: destino é um symlink (escaparia do escopo).`,
          );
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Instala method-packs do framework no projeto-alvo.
 * Copia `method-packs/` inteiro (todos os packs) para `<targetDir>/method-packs/`.
 * Idempotente: re-run sobrescreve arquivos existentes.
 *
 * @returns Lista de arquivos instalados (para o manifest de integridade).
 */
export async function installMethodPacks(targetDir: string): Promise<InstalledFile[]> {
  const srcDir = getSourcePacksDir();
  let packNames: string[];
  try {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    packNames = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      // Framework sem method-packs/ → nada a copiar (não é erro).
      return [];
    }
    throw e;
  }

  if (packNames.length === 0) return [];

  const targetPacksDir = path.join(targetDir, TARGET_PACKS_DIR);
  await fs.mkdir(targetPacksDir, { recursive: true });

  for (const packName of packNames) {
    const srcPack = path.join(srcDir, packName);
    const destPack = path.join(targetPacksDir, packName);
    await copyDir(srcPack, destPack);
  }

  // Lista os arquivos instalados (para o manifest).
  return await listPackFiles(targetDir);
}

/**
 * Remove `method-packs/` do projeto-alvo (uninstall). Idempotente.
 * @returns Lista de caminhos relativos removidos.
 */
export async function uninstallMethodPacks(targetDir: string): Promise<string[]> {
  const targetPacksDir = path.join(targetDir, TARGET_PACKS_DIR);
  try {
    await fs.rm(targetPacksDir, { recursive: true, force: true });
    return [TARGET_PACKS_DIR];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

/**
 * Lista recursivamente todos os arquivos dentro de `<targetDir>/method-packs/`
 * com seus hashes SHA-256. Retorna caminhos forward-slash relativos ao target
 * (convenção P12, compatível com `InstalledFile` do manifest).
 */
export async function listPackFiles(targetDir: string): Promise<InstalledFile[]> {
  const targetPacksDir = path.join(targetDir, TARGET_PACKS_DIR);
  const files: InstalledFile[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw e;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const rel = path.relative(targetDir, full).replace(/\\/g, '/');
        const sha256 = await sha256File(full);
        files.push({ path: rel, sha256 });
      }
    }
  }

  await walk(targetPacksDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
