# Implementation Artifacts — Índice

## Relatórios e Diagnósticos

- **[relatorio-erros-instalacao-2026-08-08.md](./relatorio-erros-instalacao-2026-08-08.md)** — 5 erros ao instalar em máquina limpa: causas, severidade e soluções
- **[deferred-work.md](./deferred-work.md)** — Dívida técnica triada: 35 itens [Low] em 8 grupos + decisão D2 (Chromium)
- **[sprint-status.yaml](./sprint-status.yaml)** — Status de todos os épicos e stories (4 épicos, 25 stories)

## Retrospectivas

- **[epic-1-retro-2026-08-07.md](./epic-1-retro-2026-08-07.md)** — Epic 1: Walking Skeleton — lições do toolkit determinístico
- **[epic-2-retro-2026-08-07.md](./epic-2-retro-2026-08-07.md)** — Epic 2: Documentação Completa — claims com excerpt, gates informativos
- **[epic-3-retro-2026-08-03.md](./epic-3-retro-2026-08-03.md)** — Epic 3: Method-Agnostic + OSS — 6 action items, decisão de abrir Epic 4
- **[epic-4-retro-2026-08-07.md](./epic-4-retro-2026-08-07.md)** — Epic 4: Hardening v1.1 — AD-2 fechado, v1.1 declarado pronto

---

## Epic 1: Esqueleto Ponta-a-Ponta (Walking Skeleton)

- **[1-1-scaffold-engineadapter-claudecodeadapter.md](./1-1-scaffold-engineadapter-claudecodeadapter.md)** — Scaffold Node 24 + porta EngineAdapter + ClaudeCodeAdapter
- **[1-2-toolkit-propose-commit-sha256.md](./1-2-toolkit-propose-commit-sha256.md)** — Toolkit propose/commit com SHA-256 não-destrutivo
- **[1-3-toolkit-checkpoint-resume-atomico.md](./1-3-toolkit-checkpoint-resume-atomico.md)** — Checkpoint/resume atômico com WAL + quarentena
- **[1-4-toolkit-confianca-mecanica-ledger.md](./1-4-toolkit-confianca-mecanica-ledger.md)** — Confiança mecânica 🟢🟡🔴 por fonte + ledger
- **[1-5-dea-skill-condutora.md](./1-5-dea-skill-condutora.md)** — Skill condutora Déa: /process-ai, Gate 0, orquestração, gates, resumo
- **[1-6-pipeline-minima-rascunhos.md](./1-6-pipeline-minima-rascunhos.md)** — Pipeline mínima: Bento→Miguel→Júlia→Zanoni produzindo rascunhos

## Epic 2: Documentação Completa e Honesta do Processo

- **[2-1-bento-entrevista-sipoc-cadeia-valor.md](./2-1-bento-entrevista-sipoc-cadeia-valor.md)** — Bento profundo: entrevista guiada + SIPOC + Cadeia de Valor
- **[2-2-miguel-hierarquia-completa.md](./2-2-miguel-hierarquia-completa.md)** — Miguel profundo: hierarquia completa e rastreável (Macro→Tarefa)
- **[2-3-julia-bpmn-xml-gargalos.md](./2-3-julia-bpmn-xml-gargalos.md)** — Júlia profunda: BPMN 2.0 XML canônico + gargalos com evidência
- **[2-4-zanoni-pops-diagnostico.md](./2-4-zanoni-pops-diagnostico.md)** — Zanoni profundo: POPs + diagnóstico consolidado
- **[2-5-confianca-verificavel-rastreabilidade-relatorio.md](./2-5-confianca-verificavel-rastreabilidade-relatorio.md)** — Confiança verificável + rastreabilidade + relatório consolidado
- **[2-6-gates-completos-resumo-final.md](./2-6-gates-completos-resumo-final.md)** — Gates completos + resumo final rico (Déa)
- **[2-7-wedge-vendas-pme-validacao.md](./2-7-wedge-vendas-pme-validacao.md)** — Wedge Vendas/PME: validar pipeline ponta-a-ponta

## Epic 3: Method-Agnostic + Distribuição OSS

- **[3-1-schema-nucleo-toolkit-owned.md](./3-1-schema-nucleo-toolkit-owned.md)** — Schema-núcleo toolkit-owned e versionado
- **[3-2-method-pack-loader-validador.md](./3-2-method-pack-loader-validador.md)** — Method-pack system: loader + validador
- **[3-3-pack-padrao-bpmn-sipoc.md](./3-3-pack-padrao-bpmn-sipoc.md)** — Pack padrão BPMN+SIPOC como method-pack
- **[3-4-distribuicao-npm-bootstrap.md](./3-4-distribuicao-npm-bootstrap.md)** — Distribuição npm + bootstrap (instalação real)
- **[3-5-docs-contribuidor-packs-adapters.md](./3-5-docs-contribuidor-packs-adapters.md)** — Documentação de contribuidor (packs + adapters)

## Epic 4: Hardening v1.1 — Confiabilidade e Integridade

- **[4-1-schema-enforcement-estrito.md](./4-1-schema-enforcement-estrito.md)** — Schema-núcleo com enforcement real (fecha AD-2)
- **[4-2-self-check-gate.md](./4-2-self-check-gate.md)** — Self-check gate: ACs com evidência antes de done
- **[4-3-smoke-test-consumer-install.md](./4-3-smoke-test-consumer-install.md)** — Smoke test de consumer-install no pipeline
- **[4-4-correcao-drift-docs.md](./4-4-correcao-drift-docs.md)** — Documentação drift zero (código ↔ docs)
- **[4-5-claims-validadas-consumo.md](./4-5-claims-validadas-consumo.md)** — Claims de contrato/doc validadas contra consumo
- **[4-6-triagem-deferred-work.md](./4-6-triagem-deferred-work.md)** — Triagem do deferred-work: agrupar, priorizar, fechar lotes
- **[4-7-readiness-final.md](./4-7-readiness-final.md)** — Readiness final: fechar dimensões pendentes da retro
