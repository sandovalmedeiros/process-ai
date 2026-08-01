---
id: SPEC-process-ai
companions:
  - ../../planning-artifacts/architecture/architecture-process-ai-2026-08-01/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/architecture/architecture-process-ai-2026-08-01/SOLUTION-DESIGN.md
  - ../../planning-artifacts/prds/prd-process-ai-2026-08-01/prd.md
  - glossary.md
sources:
  - ../../planning-artifacts/briefs/brief-process-ai-2026-08-01/brief.md
---

> **Contrato canônico.** Este SPEC + os arquivos em `companions:` formam o contrato completo e validado por preservação do que construir, testar e validar. `sources:` é só rastreabilidade (o brief foi absorvido em *Why*). Em conflito, o `ARCHITECTURE-SPINE.md` (ADs) e este SPEC prevalecem; o PRD detém o detalhe testável das FRs.

# process-ai — SPEC

## Why

**Dor + visão.** Nas PMEs, os processos críticos vivem só na cabeça das pessoas; quando alguém sai, o conhecimento operacional vai junto, a operação fica frágil, reprova em auditorias e trava qualquer IA/automação "com cirurgia". Sair disso hoje exige consultoria de meses ou ferramenta que pede especialista. O **process-ai** resolve isso dando a uma pessoa comum — sem formação em processos — uma equipe de agentes que a conduz, por perguntas e respostas, a documentar a arquitetura completa dos processos da empresa (cadeia de valor → BPMN → POPs). Herda o **rigor de especificação do Reversa** e o **modo de conduzir do BMad**, aplicados a processos de negócio.

## Capabilities

- **CAP-1 — Condução guiada (Déa)**
  - **intent:** O usuário inicia com `/process-ai` e é conduzido, por portas de aprovação humanas (gates), do escopo ao resumo final da documentação do processo.
  - **success:** Um leigo completa o ciclo *zero → cadeia de valor → BPMN → POP* sozinho (SM-1: ≥70% de ≥5 pilotos). *(FR-1…5)*

- **CAP-2 — Descoberta (Bento)**
  - **intent:** O processo tácito é extraído do usuário por entrevista e estruturado em SIPOC e cadeia de valor.
  - **success:** SIPOC + cadeia de valor commitados, cada campo com marcador de confiança e fonte. *(FR-6…8)*

- **CAP-3 — Mapeamento (Miguel)**
  - **intent:** O processo é decomposto na hierarquia (macro → tarefa) com relações rastreáveis.
  - **success:** Hierarquia commitada; níveis incompletos marcados. *(FR-9)*

- **CAP-4 — Modelagem (Júlia)**
  - **intent:** O processo é modelado em BPMN e seus gargalos são identificados.
  - **success:** BPMN 2.0 XML + lista de gargalos, cada um com evidência. *(FR-10/11)*

- **CAP-5 — Padronização (Zanoni)**
  - **intent:** O modelo vira POPs e um diagnóstico do processo.
  - **success:** POPs referenciam a hierarquia; o diagnóstico rastreia cada recomendação a uma evidência. *(FR-12/13)*

- **CAP-6 — Confiança & rastreabilidade**
  - **intent:** Todo achado recebe um marcador de confiança verificável e é rastreável à sua fonte.
  - **success:** SM-2 — ≥85% de concordância num spot-check de afirmações 🟢 por especialista. *(FR-14/15/16)*

- **CAP-7 — Method-agnostic**
  - **intent:** Metodologias são plugáveis como *method-packs* de conteúdo, sem alterar o core.
  - **success:** Sessão roda ponta-a-ponta com o pack BPMN+SIPOC; SM-3 — adoção OSS (1º pack de terceiro). *(FR-17/18)*

- **CAP-8 — Sessão resiliente**
  - **intent:** A sessão pode ser interrompida e retomada sem perda nem duplicação.
  - **success:** `resume` reinicia no último gate concluído; nenhum artefato duplicado. *(FR-19)*

- **CAP-9 — Não-destrutivo & multi-engine**
  - **intent:** Nada no projeto do usuário é alterado; o core roda em qualquer engine via adaptador.
  - **success:** Somente `_process-ai_output/` e `.process-ai/` são escritos (manifestos SHA-256); v1 roda em Claude Code. *(FR-20/21)*

## Constraints

- **AD-1…AD-7 binding** (IDs estáveis; texto integral de *Binds/Prevents/Rule* no companion `ARCHITECTURE-SPINE.md`): AD-1 propose/commit (toolkit = único escritor; canal toolkit-owned; adapter pass-through); AD-2 method-pack só estende o schema-núcleo (aditivo); AD-3 núcleo hexagonal (`EngineAdapter`); AD-4 checkpoint autoritativo + commit/checkpoint atômicos (WAL) + órfão em quarentena; AD-5 confiança por fonte verificável; AD-6 BPMN 2.0 XML on-disk canônico; AD-7 distribuição npm + bootstrap via adapter.
- **Stack:** Node.js 24 LTS · npm · TOML+YAML · engine v1 Claude Code · skills em markdown.
- **Privacidade (PRD §5):** postura "transparência + local opcional" — binding na escolha de engine/modelo e do adapter.
- **Marca/metodologia próprias:** não usar "HAP" (marca INPI da P-Excellence).
- **Wedge v1:** PME, processo de Vendas (*lead* → fechamento).

## Non-goals

- Não é ferramenta de **execução/migração** de processos — só descobre e documenta.
- Não é **SaaS/web no v1** — CLI/agent-driven.
- Não **substitui consultor humano** em casos complexos, regulados ou de alto risco.
- Não **entrega multi-engine no v1** — somente Claude Code (demais engines são *arquitetado-para*).
- Não promove **lock-in metodológico**.
- Não promete **privacidade total por padrão** no provedor do modelo.

## Success signal

- **SM-1:** ≥70% de ≥5 pilotos leigos completam o ciclo sozinhos, guiados. *(valida CAP-1…5)*
- **SM-2:** ≥85% de concordância no spot-check de afirmações 🟢. *(valida CAP-6)*
- **SM-3:** adoção OSS — installs/stars, contribuidores externos, 1º method-pack de terceiro. *(valida CAP-7)*
- **SM-4:** ≥1 usuário/empresa demonstra *willingness-to-pay* — valida a tese *open-core*.
- **Counter SM-C1:** *não* inflar 🟢 para inflar a taxa de conclusão (contrabalanceia SM-1/2).

## Assumptions

- Limites de **performance provisórios** (60–90 min / ≤30 turnos por sessão do wedge) — calibrar no piloto.
- Alvos de **SM-1/SM-2 provisórios** (≥70%/≥5; ≥85%) — calibrar no piloto.

## Open Questions

- **Nome da metodologia própria** (CAP-7) — inspirada em BPM/APQC, sem usar "HAP".
- **Calibrar** performance (§Constraints) e alvos de SM-1/SM-2 no piloto.
- **UX do resume por engine** (CAP-8) — como invocar em cada engine.
- **Campos exatos das extensões de schema** do method-pack (CAP-7) — detalhe de implementação.
