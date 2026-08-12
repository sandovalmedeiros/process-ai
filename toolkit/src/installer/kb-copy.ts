/**
 * toolkit/src/installer/kb-copy.ts — cópia de base-conhecimento (framework → target).
 *
 * Espelha `pack-copy.ts` (method-packs): materializa a base de conhecimento
 * metodológica do framework (`base-conhecimento/`) no projeto-alvo, para que a
 * Déa (skill condutora, §2.6) consiga consultar `base-conhecimento/manifest.json`
 * relativo ao diretório do projeto-alvo. Sem esta cópia, a §2.6 é um no-op para
 * consumidores (o diretório só existiria sob node_modules/process-ai/).
 *
 * Framework-level (não IDE-specific), como method-packs — por isso vive sob
 * `toolkit/src/`, não sob `toolkit/adapters/`.
 *
 * Semântica framework-managed (igual a method-packs): os arquivos entram no
 * manifest de integridade (SHA-256). Edição local do consumer → drift → backup
 * `.bak` + sobrescrita na próxima atualização (comportamento deliberado, mirror
 * BMad; a metodologia shipada é autoritativa).
 *
 * AD-3 / import-boundary: só `node:*` + relativo (../install.ts, ./manifest.ts,
 * ../ide-setup.ts). Zero deps de adapter.
 */

import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPackageRoot } from '../install.ts';
import { sha256File } from './manifest.ts';
import type { InstalledFile } from '../ide-setup.ts';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Diretório fonte da base de conhecimento no framework (localizado via package root). */
function getSourceKbDir(): string {
  const pkgRoot = findPackageRoot(MODULE_DIR);
  if (!pkgRoot) {
    throw new Error(
      'Não foi possível localizar o package root do process-ai. ' +
        'O framework parece estar instalado de forma incompleta.',
    );
  }
  return path.join(pkgRoot, 'base-conhecimento');
}

/** Nome do diretório de base de conhecimento no projeto-alvo. */
const TARGET_KB_DIR = 'base-conhecimento';

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
 * Instala a base de conhecimento do framework no projeto-alvo.
 * Copia `base-conhecimento/` inteiro para `<targetDir>/base-conhecimento/`.
 * Idempotente: re-run sobrescreve arquivos existentes.
 *
 * No-op graceful se a fonte `base-conhecimento/` não existir (retorna []) —
 * permite pacotes futuros sem a base sem quebrar o install.
 *
 * @returns Lista de arquivos instalados (para o manifest de integridade).
 */
export async function installKb(targetDir: string): Promise<InstalledFile[]> {
  const srcDir = getSourceKbDir();
  let entries: Dirent[];
  try {
    entries = await fs.readdir(srcDir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      // Framework sem base-conhecimento/ → nada a copiar (não é erro).
      return [];
    }
    throw e;
  }

  if (entries.length === 0) return [];

  const targetKbDir = path.join(targetDir, TARGET_KB_DIR);
  await copyDir(srcDir, targetKbDir);

  // Lista os arquivos instalados (para o manifest).
  return await listKbFiles(targetDir);
}

/**
 * Remove `base-conhecimento/` do projeto-alvo (uninstall). Idempotente.
 * @returns Lista de caminhos relativos removidos.
 */
export async function uninstallKb(targetDir: string): Promise<string[]> {
  const targetKbDir = path.join(targetDir, TARGET_KB_DIR);
  try {
    await fs.rm(targetKbDir, { recursive: true, force: true });
    return [TARGET_KB_DIR];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

/**
 * Lista recursivamente todos os arquivos dentro de `<targetDir>/base-conhecimento/`
 * com seus hashes SHA-256. Retorna caminhos forward-slash relativos ao target
 * (convenção P12, compatível com `InstalledFile` do manifest).
 */
export async function listKbFiles(targetDir: string): Promise<InstalledFile[]> {
  const targetKbDir = path.join(targetDir, TARGET_KB_DIR);
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

  await walk(targetKbDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
