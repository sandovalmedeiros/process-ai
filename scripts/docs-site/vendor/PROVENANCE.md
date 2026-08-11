# Vendor provenance — `scripts/docs-site/vendor/`

Este diretório abriga as bibliotecas JS **vendoradas** (offline) usadas pelo
minisite. Cada lib é pinada e documentada aqui com fonte, versão, SHA-256 e
licença. O minisite abre via `file://` — **nenhuma lib pode vir de CDN**.

## Status (P5)

| Lib    | Versão  | Licença    | Página                       | Estado |
| ------ | ------- | ---------- | ---------------------------- | ------ |
| d3     | 7.9.0   | ISC        | `fornecedores-clientes.html` | ✅ P2  |
| three  | 0.137.0 | MIT        | `hierarquia-3d.html`         | ✅ P3  |
| echarts | 5.5.0  | Apache-2.0 | `metricas.html`              | ✅ P4  |
| mermaid | 11.16.1 | MIT       | `diagramas.html`             | ✅ P5  |

## Como adicionar uma lib

1. Baixe a versão pinada da CDN oficial (ex.: `https://unpkg.com/<lib>@<ver>/...`).
2. Salve em `vendor/<lib>/<versão>/<lib>.min.js`.
3. Compute o SHA-256 do arquivo e registre abaixo (lib, versão, sourceUrl, sha256, licença).
4. Referencie por caminho relativo na página: `wrapPage({ vendorDeps: ['<lib>/<versão>/<lib>.min.js'] })`.
   O gerador copia `vendor/**\/*.js` → `_process-ai_output/docs/assets/vendor/**` automaticamente.

## Regra de licença

Todas as libs DEVEM ter licença permissiva (**MIT / ISC / Apache-2.0**).
**Nunca** vendorar Highcharts (CC BY-NC — uso comercial exige licença paga;
incompatível com framework MIT distribuído via npm). Use **ECharts** (Apache-2.0)
no lugar, para treemap/sankey/histograma/colunas.

## Regra de build (UMD global obrigatório para `file://`)

As páginas consumidoras usam `<script defer src=…>` + global dentro de
`DOMContentLoaded` (padrão offline `file://`). Por isso só serve build **UMD**
que expõe um global na `window` (`window.d3`, `window.THREE`). Builds **ESM-only**
não funcionam via `file://` em todos os navegadores (Firefox bloqueia module
scripts de `file://`). Ver nota do three r137 abaixo.

---

## d3 — 7.9.0

- **Arquivo:** `vendor/d3/7/d3.min.js` (279 706 bytes)
- **Fonte:** https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js
- **SHA-256:** `f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539`
- **Cabeçalho do arquivo:** `// https://d3js.org v7.9.0 Copyright 2010-2023 Mike Bostock`
- **Licença:** ISC — https://github.com/d3/d3/blob/main/LICENSE
- **Uso:** `fornecedores-clientes.html` (grafo força-dirigida fornecedores → cadeia → clientes)

## three — 0.137.0

- **Arquivo:** `vendor/three/0.137.0/three.min.js` (618 904 bytes)
- **Fonte:** https://cdn.jsdelivr.net/npm/three@0.137.0/build/three.min.js
- **SHA-256:** `13b5db27493abeb2a9cf1a3c6684dc2e6045dd4b5ae976d9a41dfbad135a5eef`
- **Cabeçalho do arquivo:** `/** @license Copyright 2010-2022 Three.js Authors. SPDX-License-Identifier: MIT */`
- **Licença:** MIT — https://github.com/mrdoob/three.js/blob/r137/LICENSE
- **Uso:** `hierarquia-3d.html` (cone-tree da hierarquia Macro → Tarefa)
- **Por que r137 (e não r168 como planejado):** o Three.js **removeu o build UMD**
  (`build/three.min.js`) a partir de r160 — o arquivo 404 em r168 (ESM-only desde
  então). O requisito offline via `file://` exige um global UMD (`window.THREE`)
  carregado por `<script defer>` dentro de `DOMContentLoaded` (igual ao d3); um
  build ESM via `<script type=module>` quebra em `file://` no Firefox e exige
  bundler. r150–r159 ainda shipam `three.min.js`, mas com `console.warn` de
  deprecation prepended (ruído no console do stakeholder). **r137 é o último build
  UMD limpo, sem warn.** A API usada aqui (`Scene`, `PerspectiveCamera`,
  `WebGLRenderer`, `BoxGeometry`, `MeshBasicMaterial`, `Mesh`, `BufferGeometry`,
  `Float32BufferAttribute`, `LineSegments`, `LineBasicMaterial`, `Group`,
  `Vector3`) é estável desde ~r100 — sem risco funcional. OrbitControls (addon
  separado, também ESM) é evitado: a página implementa órbita manual
  (drag/zoom/touch) ~30 linhas, mantendo o padrão single-global.

## echarts — 5.5.0

- **Arquivo:** `vendor/echarts/5.5.0/echarts.min.js` (1 029 203 bytes)
- **Fonte:** https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js
- **SHA-256:** `42f8329d989b6f6539dd2b15bbdf0d82025762ac112fbb60dc57b27d7bcf3946`
- **Cabeçalho do arquivo:** `/* * Licensed to the Apache Software Foundation (ASF) … */` (Apache 2.0)
- **Licença:** Apache-2.0 — https://github.com/apache/echarts/blob/master/LICENSE
- **Uso:** `metricas.html` (treemap da hierarquia, donut de níveis M/E/S/A/T, barras de artefatos por tipo, donut de cobertura de POPs)
- **Por que o build UMD (`dist/echarts.min.js`):** a build `dist/` expõe o global
  `window.echarts` (compatível com o padrão offline `file://` + `<script defer>` +
  `DOMContentLoaded`, igual ao d3 e ao three). A build ESM (`dist/echarts.esm.min.js`)
  via `<script type=module>` quebra em `file://` no Firefox. A API usada aqui
  (`echarts.init`, `setOption`, séries `treemap`/`pie`/`bar`) é estável desde 5.0.

## mermaid — 11.16.1

- **Arquivo:** `vendor/mermaid/11.16.1/mermaid.min.js` (3 566 058 bytes)
- **Fonte:** https://cdn.jsdelivr.net/npm/mermaid@11.16.1/dist/mermaid.min.js
- **SHA-256:** `18327bef70d96fb505fe7287d9f6a7362ebf07ff6576ddfaffb1a06f3e1a2954`
- **Cabeçalho do arquivo:** `"use strict";var __esbuild_esm_mermaid_nm;(__esbuild_esm_mermaid_nm||={}).mermaid=(()=>{` (bundle esbuild ESM→IIFE)
- **Licença:** MIT — https://github.com/mermaid-js/mermaid/blob/develop/LICENSE
- **Uso:** `diagramas.html` (renderiza os blocos ``` ```mermaid ``` ``` embebidos nos artefatos pelo Miguel/Tiago/Bento/Zanoni — fluxos, hierarquias, cadeias)
- **Por que o build `dist/mermaid.min.js` (e não ESM `+import`):** o `dist/mermaid.min.js` é um
  bundle esbuild ESM→IIFE sem **nenhum** `import()` dinâmico (verificado: 0 ocorrências) —
  essencial para `file://`, onde `import()` de specifiers relativos quebra por CORS de módulos.
  Em `<script defer>` (script clássico), o `var __esbuild_esm_mermaid_nm` de topo vira global
  do `window`, e a última linha `globalThis["mermaid"]=…default` anexa `window.mermaid`
  (`initialize`/`run`/`render`). Confirmado em contexto browser-like (`vm.runInThisContext`).
  Sem `type="module"` (não há `import`/`export` de topo), evita o bloqueio de module scripts
  no Firefox sob `file://`. Degrada para `<pre>` (código bruto) se a lib não carregar.

<!-- Template por lib (preencher ao adicionar):
## <lib> — <versão>

- **Arquivo:** `vendor/<lib>/<versão>/<lib>.min.js`
- **Fonte:** https://unpkg.com/<lib>@<versão>/...
- **SHA-256:** <hex>
- **Licença:** <SPDX> — https://...
- **Uso:** <página>
-->
