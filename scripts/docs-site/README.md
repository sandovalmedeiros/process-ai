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
  extract.ts           parsers puros (resolveBody, extractTitle, extractGlossaryTerms, countByType)
  render/
    page.ts            wrapPage() — wrapper HTML + CSS inline (template literal)
    index.ts           index.html (hero + selo + lista de artefatos + nav)
    topologia.ts       topologia "antes × depois"
    glossary.ts        glossário com busca client-side (vanilla JS)
    seal.ts            selo gerativo SVG determinístico por seed
  vendor/              libs JS vendoradas (offline) — PROVENANCE.md documenta cada uma
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
- **P1** — `cronograma.html`, `deck.html`, `processos/<id>.html` (vanilla).
- **P2** — `fornecedores-clientes.html` (D3) + skill `process-ai-monique-joao`.
- **P3** — `hierarquia-3d.html` (Three.js) + extensão da skill do João.
- **P4** — `metricas.html` (ECharts) + skills Mônica/Sarah/Victor + selo refinado + telemetry.

## Adicionar uma página nova

1. Crie `render/<pagina>.ts` exportando `render<Page>Page(input): string` (use `wrapPage`).
2. Em `generate.ts`, chame-a dentro de um bloco `if (want('<pagina>')) { … emit('<pagina>.html', …) }`.
3. Se a página usar uma lib vendorada, adicione o `.js` em `vendor/<lib>/<ver>/`, registre em
   `vendor/PROVENANCE.md`, e passe `vendorDeps: ['<lib>/<ver>/<lib>.min.js']` no `wrapPage`
   (o pageScript que usar o global da lib deve envolver-se em `DOMContentLoaded`).
4. Estenda `tests/docs-site.test.ts` com asserções para a nova página.
