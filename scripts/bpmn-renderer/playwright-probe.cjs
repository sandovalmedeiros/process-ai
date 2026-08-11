#!/usr/bin/env node
/**
 * scripts/bpmn-renderer/playwright-probe.cjs — sonda de detecção do runtime de renderização.
 *
 * Disparado por toolkit/src/installer/playwright-deps.ts (via spawnSync) para
 * verificar, no env-consumidor, se o `npx process-ai render-flow` (Guilherme)
 * conseguirá renderizar o fluxo BPMN. Vive em scripts/ (NÃO em toolkit/src/) para
 * manter a invariante AD-3: o core do toolkit nunca importa 'playwright'. A sonda,
 * sim — mas ela é um subprocesso isolado, disparado por spawnSync (mesmo padrão do
 * python-deps.ts disparar o interpretador Python).
 *
 * `require.resolve('playwright')` aqui parte do PRÓPRIO diretório da sonda
 * (scripts/bpmn-renderer/), a mesma cadeia de node_modules que render.ts (que vive
 * ao lado) percorre em runtime — logo o veredito da sonda prediz fielmente o que o
 * render.ts encontrará, inclusive no caso npx-cache (isolado do node_modules do
 * projeto-alvo).
 *
 * Códigos de saída (consumidos por ensureRenderDeps):
 *   0 → Playwright resolvível E um navegador usável existe (pronto p/ render).
 *   1 → Playwright NÃO resolvível (módulo não instalado no projeto-alvo).
 *   2 → Playwright resolvível, mas nenhum navegador usável (bundled Chromium ausente
 *       E sem Edge/Chrome de sistema detectável).
 */
'use strict';

let pwPath;
try {
  pwPath = require.resolve('playwright');
} catch {
  process.exit(1);
}

try {
  const { chromium } = require(pwPath);
  const fs = require('fs');
  // Procura um navegador usável: Chromium bundled, depois Edge/Chrome de sistema.
  for (const channel of [null, 'msedge', 'chrome']) {
    let exe;
    try {
      exe = chromium.executablePath(channel ? { channel } : {});
    } catch {
      continue;
    }
    if (exe && fs.existsSync(exe)) {
      process.exit(0);
    }
  }
  process.exit(2);
} catch {
  // playwright resolvível mas carregamento instável — trata como sem navegador.
  process.exit(2);
}
