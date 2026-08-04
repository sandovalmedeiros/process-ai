/**
 * toolkit/src/installer/state.ts — detecção do estado de instalação.
 *
 * O pivot do dispatch do orquestrador (espelho do `detectInstallationState` do
 * BMAD). Lê o manifest on-disk e classifica o target em:
 *  - clean               — sem manifest (instalação nova).
 *  - installed-current   — manifest ok, todos os hashes batem, versão igual.
 *  - installed-modified  — ≥1 arquivo sumiu ou foi editado localmente.
 *  - installed-stale     — hashes batem, mas a versão do framework mudou (upgrade).
 *
 * NÃO depende do adapter (IdeSetup): trabalha só com o manifest + hashing (core).
 * A detecção de "skill nova no source" (extra) é coberta pelo caminho de update
 * (framework_version stale → re-install traz skills novas).
 *
 * AD-3 / import-boundary: só `node:*` + relativos (./manifest.ts).
 */
import { computeIntegrity, readManifest } from './manifest.ts';
import type { IntegrityReport, Manifest } from './manifest.ts';

export type InstallState =
  | { kind: 'clean' }
  | { kind: 'installed-current'; manifest: Manifest }
  | { kind: 'installed-modified'; manifest: Manifest; report: IntegrityReport }
  | {
      kind: 'installed-stale';
      manifest: Manifest;
      currentVersion: string;
      manifestVersion: string;
    };

/**
 * Classifica o estado de instalação em `targetDir`. `currentVersion` é a versão
 * atual do framework (de `getFrameworkVersion`).
 */
export async function detectInstallationState(
  targetDir: string,
  currentVersion: string,
): Promise<InstallState> {
  const manifest = await readManifest(targetDir);
  if (!manifest) return { kind: 'clean' };

  const report = await computeIntegrity(targetDir, manifest);
  if (report.missing.length > 0 || report.modified.length > 0) {
    return { kind: 'installed-modified', manifest, report };
  }

  if (manifest.install.framework_version !== currentVersion) {
    return {
      kind: 'installed-stale',
      manifest,
      currentVersion,
      manifestVersion: manifest.install.framework_version,
    };
  }

  return { kind: 'installed-current', manifest };
}
