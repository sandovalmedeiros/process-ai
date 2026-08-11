# Vendor provenance — `scripts/docs-site/vendor/`

Este diretório abriga as bibliotecas JS **vendoradas** (offline) usadas pelo
minisite. Cada lib é pinada e documentada aqui com fonte, versão, SHA-256 e
licença. O minisite abre via `file://` — **nenhuma lib pode vir de CDN**.

## Status (P0 — fundação)

Nenhuma biblioteca vendorada ainda. As dependências entram por fase:

| Fase | Lib    | Versão | Licença     | Página                       |
| ---- | ------ | ------ | ----------- | ---------------------------- |
| P2   | d3     | 7.x    | ISC         | `fornecedores-clientes.html` |
| P3   | three  | r168   | MIT         | `hierarquia-3d.html`         |
| P4   | echarts | 5.5   | Apache-2.0  | `metricas.html`              |

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

---

<!-- Template por lib (preencher ao adicionar):
## <lib> — <versão>

- **Arquivo:** `vendor/<lib>/<versão>/<lib>.min.js`
- **Fonte:** https://unpkg.com/<lib>@<versão>/...
- **SHA-256:** <hex>
- **Licença:** <SPDX> — https://...
- **Uso:** <página>
-->
