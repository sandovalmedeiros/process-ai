/**
 * bin/copy-assets.cjs — build-time only (não shipa no tarball; ausente de `files`).
 *
 * O tsc só emite .js; assets não-TS que os scripts resolvem via __dirname precisam
 * ser copiados ao lado do .js compilado. Hoje o único caso é render.html, que
 * render.ts resolve via `path.join(__dirname, 'render.html')` (import.meta.url).
 *
 * [0.9.2] Necessário porque o Node 24 recusa type-strip de .ts sob node_modules:
 * os generators são compilados para dist/scripts/*.js e shipados como .js.
 */
'use strict';
const { cpSync, mkdirSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const assets = [
  ['scripts/bpmn-renderer/render.html', 'dist/scripts/bpmn-renderer/render.html'],
];

for (const [src, dest] of assets) {
  const destAbs = path.join(root, dest);
  mkdirSync(path.dirname(destAbs), { recursive: true });
  cpSync(path.join(root, src), destAbs);
  console.log(`copied ${src} → ${dest}`);
}
