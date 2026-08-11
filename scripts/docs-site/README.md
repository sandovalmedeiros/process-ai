# process-ai docs-site

Gerador determinístico do **mini-site HTML** do mapeamento de processos — a
camada de apresentação produzida pelo **time da Monique** (orquestradora) e seus
4 especialistas (João, Mônica, Sarah, Victor).

O minisite abre via `file://` (100% offline, sem servidor, sem CDN) e renderiza
os artefatos commitados pelo pipeline do process-ai.

## Arquitetura

```
scripts/docs-site/
  generate.ts          entry: generateDocs({ root, outDir?, only?, seed? }) → GenerateResult
  extract.ts           parsers puros (resolveBody, extractTitle, extractGlossaryTerms,
                      countByType, parseProvenance, gateDecisionPt, gateNumber,
                      parsePop, truncateMd, parseSipocRows, parseValueChainLinks,
                      buildSupplierCustomerGraph, parseHierarchy, buildHierarchyTreemap,
                      buildLevelDistribution, computePopCoverage)
  render/
    page.ts            wrapPage() — wrapper HTML + CSS inline + relPrefix p/ subpastas + telemetry
    index.ts           index.html (hero + selo + nav + artefatos + "últimas páginas vistas")
    topologia.ts       topologia "antes × depois"
    glossary.ts        glossário com busca client-side (vanilla JS)
    cronograma.ts      cronograma.html — timeline vertical (gates + commits por ts)
    deck.ts            deck.html — apresentação navegável (teclado ← → espaço)
    processo.ts        processos/<id>.html (1 por POP) + processos/index.html
    fornecedores-clientes.ts  grafo força-dirigida (D3): fornecedores → cadeia → clientes
    hierarquia-3d.ts   cone-tree 3D (Three.js): Macro → Processo → Sub → Atividade → Tarefa
    metricas.ts        métricas (ECharts): treemap + donut níveis + barras tipos + donut POPs
    markdown.ts        renderMarkdownLite — markdown→HTML (escape-first, vanilla)
    seal.ts            selo gerativo SVG determinístico por seed (anéis + bezel "coin-edge")
  vendor/
    d3/7/d3.min.js     d3 v7.9.0 (ISC) — grafo de fornecedores↔clientes
    three/0.137.0/three.min.js  three r137 (MIT, UMD) — árvore 3D da hierarquia
    echarts/5.5.0/echarts.min.js  echarts 5.5.0 (Apache-2.0, UMD) — painel de métricas
    PROVENANCE.md      fonte + versão + SHA-256 + licença de cada lib vendorada
  README.md            (este arquivo)
```

### Invariante AD-3 (core hexagonal)

Este gerador vive em `scripts/` (fora do core `toolkit/src/`). O core não é
importado — o checkpoint é lido **diretamente** de `.process-ai/checkpoint.json`
(pois `toolkit/src/*` não é shipado no pacote npm; só `dist/`). Sem dependências
npm — apenas `node:*` builtins. Precedente: `scripts/bpmn-renderer/`.

### Invariante AD-1 (escritor único)

O gerador escreve os HTMLs **diretamente** em `_process-ai_output/docs/` (sidecar
assets, como o Guilherme faz com PNG/SVG). O agente Monique então propõe **um**
artefato `process-docs` (artifactType fora do `SCHEMAS` → escape hatch) cujo
`body` descreve o site e cujos campos advisory (`pages`, `seed`, `indexUrl`, …)
referenciam os sidecars — só o `body` é persistido/hashado.

## Fluxo de dados

```
generateDocs()
  → lê .process-ai/checkpoint.json (CheckpointState, AD-4)
  → para cada artifacts[]: lê .process-ai/manifests/<type>-<sha>.json → artifactPath
  → lê body em _process-ai_output/<type>/<file>  (resolveBody aceita md cru ou {body} legado)
  → extract.ts parseia  →  render/*.ts envolve em HTML (JSON embutido + vendor relativo)
  → atomicWrite em outDir
  → copia vendor/**.js → outDir/assets/vendor/
  → retorna GenerateResult { pages, seed, vendoredLibs, warnings, … }
```

## Invocação

O agente Monique (skill `process-ai-monique`) roda:

```bash
npx tsx -e "
  const { generateDocs } = await import('./scripts/docs-site/generate.ts');
  const result = await generateDocs({ root: process.cwd() });
  console.log(JSON.stringify(result, null, 2));
"
```

E depois propõe o artefato `process-docs` via `npx process-ai propose --payload`.

## Fases (roadmap)

- **P0** ✅ — fundação: gerador + `index.html` + selo + `topologia.html` + `glossario.html` (vanilla, sem libs).
- **P1** ✅ — `cronograma.html` (gates + commits, ts do `provenance.jsonl`), `deck.html` (slides navegáveis), `processos/<id>.html` (1 página por POP, keyed por ID da hierarquia) + `processos/index.html`. Markdown lite (`renderMarkdownLite`) para bodies de POPs e trechos. Ainda vanilla, sem libs.
- **P2** ✅ — `fornecedores-clientes.html`: grafo força-dirigida **D3** (vendorado v7.9.0/ISC, offline) de fornecedores → cadeia de valor → clientes. Dados do `sipoc` (linhas S/I/P/O/C) + `value-chain` (elos); cadeia vem da VC ou, na falta, da linha `**P**rocess` do SIPOC. Skill `process-ai-monique-joao` (cartógrafo, regeneração isolada via `only:['fornecedores-clientes']`, sem propose).
- **P3** ✅ — `hierarquia-3d.html`: cone-tree **Three.js** (vendorado r0.137.0/MIT UMD, offline) da hierarquia Macro → Processo → Subprocesso → Atividade → Tarefa. Dados do `hierarchy` (IDs M/E/S/A/T); pai resolvido por `— pai:` explícito-in-set → implícito-por-estrutura-do-ID → raiz. Órbita manual (drag/zoom/touch), rótulos em overlay HTML projetados 3D→2D, fallback textual aninhado (sem WebGL). Skill `process-ai-monique-joao` estendida: `only:['fornecedores-clientes','hierarquia-3d']`.
- **P4** ✅ — `metricas.html` (ECharts: treemap da hierarquia, donut de níveis M/E/S/A/T, barras de artefatos por tipo, donut de cobertura de POPs). Lib vendorada echarts 5.5.0 (Apache-2.0, build UMD — global `window.echarts`). Cada visual degrada para "sem dados" quando falta o artefato de origem (honesto, nunca inventa). Skills `process-ai-monique-monica` (Analista, `only:['metricas','cronograma']`), `process-ai-monique-sarah` (Narradora, `only:['glossario','deck','processos']`), `process-ai-monique-victor` (Publicador, `only:['index']`). Selo refinado (bezel "coin-edge"); telemetry local (`localStorage`, "últimas páginas vistas" no index).

## Adicionar uma página nova

1. Crie `render/<pagina>.ts` exportando `render<Page>Page(input): string` (use `wrapPage`).
2. Em `generate.ts`, chame-a dentro de um bloco `if (want('<pagina>')) { … emit('<pagina>.html', …) }`.
3. Se a página usar uma lib vendorada, adicione o `.js` em `vendor/<lib>/<ver>/`, registre em
   `vendor/PROVENANCE.md`, e passe `vendorDeps: ['<lib>/<ver>/<lib>.min.js']` no `wrapPage`
   (o pageScript que usar o global da lib deve envolver-se em `DOMContentLoaded`).
4. Estenda `tests/docs-site.test.ts` com asserções para a nova página.
