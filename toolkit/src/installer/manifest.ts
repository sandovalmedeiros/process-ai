/**
 * toolkit/src/installer/manifest.ts — manifest de instalação (TOML) + integridade.
 *
 * O `.process-ai/install-manifest.toml` é o equivalente do `.bmad-core/
 * install-manifest.yaml` do BMAD: registra o que foi instalado (versão do
 * framework, IDE, pack ativo, e a lista de arquivos com seus hashes SHA-256).
 * Permite que `update`/`status` detectem instalação prévia e arquivos
 * modificados localmente (mirror do `checkFileIntegrity` do BMAD).
 *
 * Formato (TOML mínimo, parser linha-a-linha — NÃO é um parser TOML genérico;
 * espelha a abordagem battle-tested do `readConfig` em `pack-loader.ts`):
 *   [install]            → escalares (framework_version, installed_at, ...)
 *   [[files]]            → uma entrada por arquivo (path + sha256)
 *
 * Desvios deliberados do BMAD: TOML (não YAML — zero-dep) e SHA-256 64-char
 * completo (não 16-char — consistência com `commit.ts`).
 *
 * AD-3 / import-boundary: só `node:*` + relativos (./file-ops.ts).
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWrite, escapeTomlString } from './file-ops.ts';

/** Caminho do manifest relativo ao target (dentro de `.process-ai/`). */
export const MANIFEST_REL_PATH = '.process-ai/install-manifest.toml';

// ---- Tipos ----

export type InstallType = 'fresh' | 'update' | 'repair';

export interface ManifestFile {
  /** Caminho forward-slash, relativo ao target (convenção P12). */
  path: string;
  /** SHA-256 64-char do conteúdo do arquivo. */
  sha256: string;
}

export interface ManifestInstall {
  framework_version: string;
  /** ISO timestamp da última install/update. */
  installed_at: string;
  install_type: InstallType;
  ide: string;
  active_pack: string;
}

export interface Manifest {
  install: ManifestInstall;
  files: ManifestFile[];
}

export interface IntegrityReport {
  /** Entradas do manifest cujo arquivo sumiu do disco. */
  missing: string[];
  /** Entradas do manifest cujo hash on-disk difere do registrado. */
  modified: string[];
}

// ---- SHA-256 ----

/** SHA-256 64-char de um conteúdo string (utf8). */
export function sha256Content(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** SHA-256 64-char de um arquivo (lê todo — SKILL.md é pequeno). Lança ENOENT se ausente. */
export async function sha256File(absPath: string): Promise<string> {
  const buf = await fs.readFile(absPath);
  return createHash('sha256').update(buf).digest('hex');
}

// ---- readManifest (parser linha-a-linha) ----

/**
 * Lê e parseia `.process-ai/install-manifest.toml`. Retorna `null` se ausente
 * (instalação limpa). Tolerante a comentários (`#`) e linhas em branco.
 * Estritamente limitado ao schema acima (não é parser TOML geral).
 */
export async function readManifest(targetDir: string): Promise<Manifest | null> {
  const abs = path.join(targetDir, MANIFEST_REL_PATH);
  let raw: string;
  try {
    raw = await fs.readFile(abs, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }

  const install: Partial<ManifestInstall> = {};
  const files: ManifestFile[] = [];
  let section: 'none' | 'install' | 'files' = 'none';
  let cur: Partial<ManifestFile> | null = null;

  const commitCurrent = (): void => {
    if (section === 'files' && cur && cur.path && cur.sha256) {
      files.push({ path: cur.path, sha256: cur.sha256 });
    }
    cur = null;
  };

  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (line === '' || line.startsWith('#')) continue;

    if (line === '[install]') {
      commitCurrent();
      section = 'install';
      continue;
    }
    if (line === '[[files]]') {
      commitCurrent();
      section = 'files';
      cur = {};
      continue;
    }
    if (line.startsWith('[')) {
      // seção desconhecida — ignora até a próxima seção conhecida
      commitCurrent();
      section = 'none';
      continue;
    }

    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // descasca aspas duplas (basic string TOML)
    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }

    if (section === 'install') {
      if (
        key === 'framework_version' ||
        key === 'installed_at' ||
        key === 'install_type' ||
        key === 'ide' ||
        key === 'active_pack'
      ) {
        (install as Record<string, string>)[key] = val;
      }
    } else if (section === 'files' && cur) {
      if (key === 'path') cur.path = val;
      else if (key === 'sha256') cur.sha256 = val;
    }
  }
  commitCurrent();

  if (
    !install.framework_version ||
    !install.installed_at ||
    !install.install_type ||
    !install.ide
  ) {
    // manifest presente mas incompleto/malformado — trata como ausente (reinstala)
    return null;
  }

  return {
    install: {
      framework_version: install.framework_version,
      installed_at: install.installed_at,
      install_type: install.install_type as InstallType,
      ide: install.ide,
      active_pack: install.active_pack ?? '',
    },
    files,
  };
}

// ---- writeManifest ----

const MANIFEST_HEADER = `# Installer-managed. Regenerado a cada install/update — treat as read-only.
# Para remover, use \`process-ai uninstall\`. Não edite manualmente.`;

/**
 * Escreve `.process-ai/install-manifest.toml` deterministicamente (arquivos
 * ordenados por `path`) e atomicamente (temp+rename via `atomicWrite`).
 */
export async function writeManifest(targetDir: string, manifest: Manifest): Promise<void> {
  const dotDir = path.join(targetDir, '.process-ai');
  await fs.mkdir(dotDir, { recursive: true });

  const i = manifest.install;
  const lines: string[] = [
    MANIFEST_HEADER,
    '',
    '[install]',
    `framework_version = "${escapeTomlString(i.framework_version)}"`,
    `installed_at = "${escapeTomlString(i.installed_at)}"`,
    `install_type = "${escapeTomlString(i.install_type)}"`,
    `ide = "${escapeTomlString(i.ide)}"`,
    `active_pack = "${escapeTomlString(i.active_pack)}"`,
  ];

  const sorted = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
  for (const f of sorted) {
    lines.push('', '[[files]]', `path = "${escapeTomlString(f.path)}"`, `sha256 = "${f.sha256}"`);
  }
  lines.push(''); // trailing newline

  await atomicWrite(path.join(targetDir, MANIFEST_REL_PATH), lines.join('\n'));
}

// ---- computeIntegrity ----

/**
 * Compara o manifest contra o disco: recompute o SHA-256 de cada arquivo
 * listado. Retorna `missing` (sumiu) e `modified` (hash diverge — edição local).
 * Espelho do `checkFileIntegrity` do BMAD (sem o truncamento p/ 16 chars).
 */
export async function computeIntegrity(
  targetDir: string,
  manifest: Manifest,
): Promise<IntegrityReport> {
  const missing: string[] = [];
  const modified: string[] = [];
  for (const f of manifest.files) {
    const abs = path.join(targetDir, f.path);
    let hash: string;
    try {
      hash = await sha256File(abs);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        missing.push(f.path);
        continue;
      }
      throw e;
    }
    if (hash !== f.sha256) modified.push(f.path);
  }
  return { missing, modified };
}
