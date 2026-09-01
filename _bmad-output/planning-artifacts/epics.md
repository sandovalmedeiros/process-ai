---
stepsCompleted:
  - step-01-requirements
  - step-02-epics
  - step-03-stories
  - step-04-validation
  - step-04-validation-epic-4-hardening
  - step-04-validation-epic-5-installer
inputDocuments:
  - ../specs/spec-process-ai/SPEC.md
  - prds/prd-process-ai-2026-08-01/prd.md
  - architecture/architecture-process-ai-2026-08-01/ARCHITECTURE-SPINE.md
  - architecture/architecture-process-ai-2026-08-01/SOLUTION-DESIGN.md
  - ../specs/spec-process-ai/glossary.md
  - sprint-change-proposal-2026-08-07.md
  - ../implementation-artifacts/epic-3-retro-2026-08-03.md
---

# process-ai - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for **process-ai**, decomposing the requirements from the PRD, the SPEC (CAP-1…9), and the Architecture spine (AD-1…7) into implementable stories. v1 wedge: PME, processo de Vendas (*lead*→fechamento).

## Requirements Inventory

### Functional Requirements

- **FR-1**: Iniciar sessão via `/process-ai` no engine (v1: Claude Code). *(CAP-1)*
- **FR-2**: Déa define e confirma o escopo (Gate 0) antes de qualquer descoberta. *(CAP-1)*
- **FR-3**: Orquestrar handoffs Bento→Miguel→Júlia→Zanoni (ordem fixa no v1). *(CAP-1)*
- **FR-4**: Abrir Gates 1–4 entre handoffs, destacando 🟡/🔴. *(CAP-1)*
- **FR-5**: Encerrar com resumo + relatório de confiança. *(CAP-1)*
- **FR-6**: Bento conduz entrevista guiada (roteiro do method-pack ativo). *(CAP-2)*
- **FR-7**: Gerar SIPOC. *(CAP-2)*
- **FR-8**: Levantar Cadeia de Valor. *(CAP-2)*
- **FR-9**: Miguel estrutura a hierarquia (Macro→…→Tarefa). *(CAP-3)*
- **FR-10**: Júlia modela o processo em BPMN (2.0 XML). *(CAP-4)*
- **FR-11**: Identificar gargalos com evidência. *(CAP-4)*
- **FR-12**: Zanoni gera POPs. *(CAP-5)*
- **FR-13**: Relatório de diagnóstico. *(CAP-5)*
- **FR-14**: Marcar confiança 🟢🟡🔴 em todo achado (mecânico). *(CAP-6)*
- **FR-15**: Rastreabilidade bidirecional afirmação↔fonte. *(CAP-6)*
- **FR-16**: Relatório de confiança consolidado. *(CAP-6)*
- **FR-17**: Carregar method-packs como Skills plugáveis. *(CAP-7)*
- **FR-18**: v1 shipa 1 method-pack (BPMN+SIPOC). *(CAP-7)*
- **FR-19**: Checkpoint + resume. *(CAP-8)*
- **FR-20**: Garantia não-destrutiva (SHA-256; só pastas process-ai). *(CAP-9)*
- **FR-21**: Multi-engine *arquitetado-para* (v1: só Claude Code). *(CAP-9)*

### NonFunctional Requirements

- **NFR-1 (Honestidade)**: nenhum artefato sem marcador 🟢🟡🔴; inferência nunca apresentada como fato.
- **NFR-2 (Privacidade)**: transparência + local opcional (modelo local quando o engine permite); nenhum dado a terceiros além do engine/modelo.
- **NFR-3 (Não-destrutividade local)**: escrita restrita a `_process-ai_output/` e `.process-ai/`.
- **NFR-4 (Resumabilidade)**: checkpoint após cada etapa; resume sem perda nem duplicação.
- **NFR-5 (Observabilidade)**: log de provenance por etapa em `.process-ai/`.
- **NFR-6 (Portabilidade)**: core isolado do engine por adaptadores.
- **NFR-7 (Performance)**: sessão do wedge em ≈60–90 min / ≤30 turnos *(provisório)*.

### Additional Requirements

- **AR-1 (AD-1) Propose/Commit**: toolkit Node é o **único escritor**; canal de proposta toolkit-owned; adapter é **pass-through**; skills sem escrita nas pastas protegidas.
- **AR-2 (AD-2) Schema-núcleo + method-pack**: method-packs só **estendem** o schema-núcleo (aditivo); validador rejeita mudança de pipeline; checkpoint registra `pack_id`+versão por artefato.
- **AR-3 (AD-3) Núcleo hexagonal**: porta `EngineAdapter`; v1 `ClaudeCodeAdapter`; pass-through.
- **AR-4 (AD-4) Checkpoint autoritativo**: commit+checkpoint atômicos (WAL); órfão em quarentena no resume; single-writer em `.process-ai/`.
- **AR-5 (AD-5) Confiança verificável**: 🟢 exige fonte cuja ref resolve a artefato commitado (SHA-256); ghost/forward → 🟡.
- **AR-6 (AD-6) BPMN canônico**: on-disk = BPMN 2.0 XML toolkit-owned; render é derivação.
- **AR-7 (AD-7) Distribuição**: pacote npm + bootstrap que usa o adapter p/ registrar skills/slash-commands.
- **Starter/Fundação**: Node.js 24 LTS + npm; o **toolkit determinístico** (commit, checkpoint, confidence, traceability, bpmn, schema-core) + o **ClaudeCodeAdapter** são a fundação que habilita os agentes (candidato a Epic 0).
- **Stack**: Node 24 LTS · npm · TOML+YAML · skills markdown · engine v1 Claude Code.
- **Structural seed**: `skills/` (condutor + especialistas), `toolkit/` (src + `adapters/claude-code`), `method-packs/bpmn-sipoc/`, `bin/`, `templates/`; saída `_process-ai_output/` + `.process-ai/`.

### UX Design Requirements

- **N/A** — v1 é CLI/agent-driven (sem UI web; alinhado aos Non-Goals do PRD). A "UX" é a condução guiada por Q&A (CAP-1/UJ-1), capturada nos FRs, não num doc de design separado.

### FR Coverage Map

- **FR-1**: Epic 1 — `/process-ai` inicia (Claude Code)
- **FR-2**: Epic 1 — Déa define/confirma escopo (Gate 0)
- **FR-3**: Epic 1 — orquestra handoffs (básico)
- **FR-4**: Epic 1 (básico) + Epic 2 (gates completos)
- **FR-5**: Epic 1 (mínimo) + Epic 2 (resumo + relatório de confiança)
- **FR-6**: Epic 1 (mínimo) + Epic 2 — entrevista guiada (Bento)
- **FR-7**: Epic 1 (mínimo) + Epic 2 — SIPOC
- **FR-8**: Epic 1 (mínimo) + Epic 2 — Cadeia de Valor
- **FR-9**: Epic 1 (mínimo) + Epic 2 — hierarquia (Miguel)
- **FR-10**: Epic 1 (mínimo) + Epic 2 — BPMN 2.0 XML (Júlia)
- **FR-11**: Epic 2 — gargalos com evidência
- **FR-12**: Epic 1 (rascunho) + Epic 2 — POPs (Zanoni)
- **FR-13**: Epic 2 — relatório de diagnóstico
- **FR-14**: Epic 1 (básico) + Epic 2 — confiança verificável (AD-5)
- **FR-15**: Epic 2 — rastreabilidade bidirecional
- **FR-16**: Epic 2 — relatório de confiança consolidado
- **FR-17**: Epic 3 — carregar method-packs (Skills plugáveis)
- **FR-18**: Epic 3 — pack padrão v1 (BPMN+SIPOC)
- **FR-19**: Epic 1 — checkpoint + resume (AD-4)
- **FR-20**: Epic 1 — não-destrutivo (SHA-256; AD-1)
- **FR-21**: Epic 1 — porta `EngineAdapter` + `ClaudeCodeAdapter` (arquitetado-para; 2º engine pós-v1)

> **NFRs:** NFR-1/3/4/5/6 → Epic 1 (fundação determinística) + Epic 2 (profundidade); NFR-2 (privacidade) → adapter/engine (Epic 1/3); NFR-7 (perf) → calibrar no Epic 2/piloto.
> **ADs:** AD-1/3/4 → Epic 1; AD-5/6 → Epic 2; AD-2/7 → Epic 3.
> **Epic 4 (Hardening v1.1):** reforça FR-14 (confiança verificável via schema enforcement), FR-17 (method-pack contido por validador real), FR-20 (não-destrutivo blindado por smoke test), NFR-1 (honestidade — claims = código), NFR-5 (observabilidade — self-check gate). Fecha AD-2 (schema enforcement deixa de ser deferido).

## Epic List

### Epic 1: Esqueleto Ponta-a-Ponta (Walking Skeleton)
O leigo executa `/process-ai` e, conduzido pela Déa, produz uma versão **mínima mas completa** da documentação de um processo (cadeia de valor simples + 1 fluxo + 1 POP-rascunho) — com **não-destrutivo (SHA-256)**, **checkpoint/resume**, e a **porta `EngineAdapter` + `ClaudeCodeAdapter`**. Prova o paradigma propose/commit ponta-a-ponta. Constrói o núcleo determinístico (toolkit) a serviço desse valor.
**FRs covered:** FR-1, FR-2, FR-3, FR-4(básico), FR-19, FR-20, FR-21(porta+adapter) + versões mínimas de FR-5…16.

### Epic 2: Documentação Completa e Honesta do Processo
Os agentes produzem os artefatos **reais e usáveis** — SIPOC + cadeia de valor + hierarquia + **BPMN 2.0 XML** + POPs + diagnóstico — com **confiança honesta** (🟢🟡🔴 verificável, AD-5), **rastreabilidade bidirecional**, gates completos e **relatório de confiança consolidado**. No wedge Vendas/PME.
**FRs covered:** FR-4(full), FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16.

### Epic 3: Method-Agnostic + Distribuição OSS
A metodologia vira **method-pack plugável** (schema-núcleo + pack BPMN+SIPOC extraído; terceiros podem criar packs sem tocar o core) e o framework é **instalável por qualquer um** via **npm + bootstrap**. Habilita adoção (SM-3) e ecossistema.
**FRs covered:** FR-17, FR-18 (+ AD-2 schema-núcleo, AD-7 distribuição).

### Epic 4: Hardening v1.1 — Confiabilidade e Integridade
As arestas identificadas nos 3 épicos do MVP são fechadas: documentação reflete o código, o schema-núcleo tem enforcement real (fecha AD-2), o pipeline de distribuição é coberto por smoke test, e a dívida técnica [Low] acumulada no deferred-work é triada e reduzida. O framework passa de "funcional e verificável" para "robusto e auditável".
**FRs cobertos:** reforça FR-14 (confiança), FR-17 (method-pack), FR-20 (não-destrutivo), NFR-1 (honestidade), NFR-5 (observabilidade). Fecha AD-2 (schema enforcement não-deferido).

## Epic 1: Esqueleto Ponta-a-Ponta (Walking Skeleton)

O leigo executa `/process-ai` e, conduzido pela Déa, produz uma versão mínima mas completa da documentação de um processo — com não-destrutivo (SHA-256), checkpoint/resume, e a porta `EngineAdapter` + `ClaudeCodeAdapter`. Prova o paradigma propose/commit ponta-a-ponta.

### Story 1.1: Scaffold + porta EngineAdapter + ClaudeCodeAdapter
As a dev,
I want um scaffold Node 24 com a estrutura de pastas e a porta `EngineAdapter` + `ClaudeCodeAdapter` mínima,
So that o framework rode no Claude Code em dev.

**Acceptance Criteria:**
**Given** Node 24 LTS
**When** executo o bootstrap de dev
**Then** as pastas (`skills/`, `toolkit/`, `method-packs/`, `bin/`) são criadas e `/process-ai` é registrável no Claude Code via adapter
**And** o core referencia só a porta `EngineAdapter` (nunca APIs do Claude Code). *(FR-21, AD-3)*

### Story 1.2: Toolkit — propose/commit com SHA-256 (não-destrutivo)
As a dev,
I want o toolkit como único escritor com commit SHA-256,
So that artefatos sejam gravados com não-destrutividade e provenance.

**Acceptance Criteria:**
**Given** um agente propondo via canal toolkit-owned
**When** o toolkit commita
**Then** escreve só em `_process-ai_output/`+`.process-ai/`, com manifesto SHA-256 + provenance
**And** escrita fora das pastas protegidas aborta a etapa com erro
**And** o adapter repassa o payload sem mutar (pass-through). *(FR-20, AD-1)*

### Story 1.3: Toolkit — checkpoint/resume atômico (WAL + quarentena)
As a dev,
I want checkpoint atômico (WAL),
So that a sessão resume sem perda nem duplicação.

**Acceptance Criteria:**
**Given** sessão em andamento
**When** o toolkit commita
**Then** o checkpoint em `.process-ai/` avança na mesma transação atômica (WAL)
**And** após crash, resume restaura do checkpoint e manifesto órfão vai p/ quarentena (nunca auto-mergeado). *(FR-19, AD-4)*

### Story 1.4: Toolkit — confiança mecânica por fonte + ledger (básico)
As a dev,
I want atribuição mecânica de 🟢🟡🔴 por presença de fonte,
So that nenhum artefato saia sem marcador.

**Acceptance Criteria:**
**Given** um achado proposto
**When** o toolkit atribui confiança
**Then** 🟢 exige fonte; sem fonte → 🟡; não-determinado → 🔴
**And** todo artefato emitido tem toda afirmação com marcador; o ledger registra nível+fonte. *(FR-14 básico, AD-5 básico)*

### Story 1.5: Déa — skill condutor (/process-ai · Gate 0 · orquestra · gates · resumo)
As a leigo,
I want iniciar com `/process-ai` e ser conduzido pela Déa,
So que eu saiba o que fazer e veja o processo se documentando.

**Acceptance Criteria:**
**Given** Claude Code
**When** digito `/process-ai`
**Then** Déa inicia e pergunta *"Qual processo vamos mapear?"*
**And** após a resposta, o **Gate 0** confirma o escopo antes de iniciar *(FR-1,2,3)*
**And** cada especialista é precedido por um gate básico *(FR-4 básico)*
**And** ao fim, um resumo mínimo + relatório de confiança é entregue em `_process-ai_output/`. *(FR-5 mínimo)*

### Story 1.6: Pipeline mínima — especialistas produzem rascunhos
As a leigo,
I want Bento→Miguel→Júlia→Zanoni produzindo rascunhos mínimos,
So que eu veja a documentação se materializar ponta-a-ponta.

**Acceptance Criteria:**
**Given** Gate 0 aprovado
**When** Bento executa
**Then** SIPOC-rascunho + cadeia de valor simples são propostos e commitados (com marcadores) após gate *(FR-6,7,8 mínimo)*
**And** Miguel propõe/commits a hierarquia-rascunho *(FR-9 mínimo)*
**And** Júlia propõe/commits um fluxo simples *(FR-10 mínimo)*
**And** Zanoni propõe/commits um POP-rascunho. *(FR-12 mínimo)*

## Epic 2: Documentação Completa e Honesta do Processo

Os agentes produzem os artefatos reais e usáveis (SIPOC + cadeia + hierarquia + BPMN 2.0 XML + POPs + diagnóstico) com confiança honesta (AD-5), rastreabilidade bidirecional, gates completos e relatório de confiança consolidado. Wedge Vendas/PME.

### Story 2.1: Bento profundo — entrevista + SIPOC + Cadeia de Valor
As a leigo,
I want entrevista completa (roteiro do method-pack) + SIPOC + cadeia de valor reais,
So that a descoberta fique documentada de verdade.

**Acceptance Criteria:**
**Given** Gate 0 aprovado
**When** Bento entrevista
**Then** as perguntas seguem o roteiro do method-pack ativo (não improvisadas) *(FR-6)*
**And** o SIPOC completo é proposto, cada campo com marcador+fonte *(FR-7)*
**And** a Cadeia de Valor é proposta, itens inferidos marcados. *(FR-8)*

### Story 2.2: Miguel profundo — hierarquia completa e rastreável
As a leigo,
I want a hierarquia Macro→Tarefa,
So que eu veja a decomposição ponta-a-ponta.

**Acceptance Criteria:**
**Given** a cadeia de valor
**When** Miguel decompõe
**Then** a hierarquia (Macro→E2E→Subprocesso→Atividade→Tarefa) é proposta com pai/filho rastreável; níveis incompletos marcados 🟡/🔴. *(FR-9)*

### Story 2.3: Júlia profunda — BPMN 2.0 XML canônico + gargalos
As a leigo,
I want o processo em BPMN + gargalos apontados,
So que eu veja o fluxo e onde travo.

**Acceptance Criteria:**
**Given** a hierarquia
**When** Júlia modela
**Then** BPMN emitido em **BPMN 2.0 XML canônico** (toolkit-owned) em `_process-ai_output/` *(FR-10, AD-6)*
**And** gargalos/handoffs listados, cada um com evidência. *(FR-11)*

### Story 2.4: Zanoni profundo — POPs + diagnóstico
As a leigo,
I want POPs + diagnóstico,
So que eu padronize e saiba onde melhorar.

**Acceptance Criteria:**
**Given** o modelo
**When** Zanoni gera
**Then** POPs produzidos, cada um referenciando atividades/tarefas da hierarquia *(FR-12)*
**And** relatório de diagnóstico (gargalos, gaps, recomendações), cada recomendação rastreada a evidência. *(FR-13)*

### Story 2.5: Confiança verificável + rastreabilidade + relatório consolidado
As a dev/leigo,
I want confiança honesta (fonte verificável) + rastreabilidade bidirecional,
So que eu confie no confirmado vs. inferido.

**Acceptance Criteria:**
**Given** um 🟢 proposto
**When** o toolkit valida
**Then** a fonte resolve a artefato commitado (SHA-256); ghost/forward-ref → degradam a 🟡 *(FR-14 full, AD-5)*
**And** qualquer afirmação é navegável à fonte nos dois sentidos *(FR-15)*
**And** o relatório de confiança consolidado lista contagem+itens por nível 🟢🟡🔴. *(FR-16)*

### Story 2.6: Gates completos + resumo final rico (Déa)
As a leigo,
I want gates informativos + resumo final útil,
So que eu valide cada etapa e saiba o próximo passo.

**Acceptance Criteria:**
**Given** cada especialista termina
**When** o gate abre
**Then** mostra contagem+lista de 🟡/🔴 e bloqueia o próximo até aprovação *(FR-4 full)*
**And** ao fim, o resumo final cita o documentado, contagem 🟢/🟡/🔴 e próximos passos. *(FR-5 full)*

### Story 2.7: Wedge Vendas/PME — validar a pipeline ponta-a-ponta
As a dev,
I want rodar e validar a pipeline no cenário Vendas/PME,
So que eu prove o valor do wedge e calibre os alvos.

**Acceptance Criteria:**
**Given** um cenário real de Vendas (lead→fechamento)
**When** um leigo executa `/process-ai`
**Then** completa o ciclo zero→cadeia→BPMN→POP sozinho, com artefatos usáveis *(SM-1)*
**And** spot-check de especialista confirma ≥85% das 🟢 (calibrar) *(SM-2)*
**And** a sessão ocorre dentro do envelope provisório (≈60–90min/≤30 turnos). *(NFR-7)*

## Epic 3: Method-Agnostic + Distribuição OSS

A metodologia vira method-pack plugável (schema-núcleo + pack BPMN+SIPOC) e o framework é instalável via npm + bootstrap. Habilita adoção (SM-3) e ecossistema.

### Story 3.1: Schema-núcleo toolkit-owned e versionado
As a dev,
I want um schema-núcleo canônico por tipo de artefato,
So that method-packs o estendam sem redefinir o shape central.

**Acceptance Criteria:**
**Given** os tipos (SIPOC, hierarquia, BPMN, POP)
**When** o toolkit define o schema-núcleo
**Then** cada tipo tem formato canônico versionado, toolkit-owned *(AD-2)*
**And** um method-pack só pode estender (aditivo), nunca redefinir o shape. *(AD-2)*

### Story 3.2: Method-pack system — loader + validador
As a dev,
I want carregar method-packs como Skills plugáveis + validador,
So that terceiros criem packs sem tocar o core.

**Acceptance Criteria:**
**Given** um pack em `method-packs/<pack>/`
**When** carregado
**Then** é ativado via `.process-ai/config` e parametriza os skills (conteúdo) *(FR-17)*
**And** um pack que tenta mudar pipeline/papéis/schema-núcleo é **rejeitado** pelo validador *(AD-2)*
**And** o checkpoint registra `pack_id`+versão por artefato. *(AD-2)*

### Story 3.3: Pack padrão BPMN+SIPOC como method-pack
As a dev/contribuidor,
I want o pack BPMN+SIPOC extraído do core,
So que o v1 rode com 1 pack plugável (prova o method-agnostic).

**Acceptance Criteria:**
**Given** o conteúdo método-specific do v1
**When** extraído para `method-packs/bpmn-sipoc/`
**Then** carrega como method-pack (`pack.toml` + `schemas/` + `prompts/` + `glossary.md`) e a sessão do wedge roda ponta-a-ponta só com ele. *(FR-18)*

### Story 3.4: Distribuição npm + bootstrap (instalação real)
As a usuário,
I want instalar via npm e rodar o bootstrap,
So que qualquer um possa usar.

**Acceptance Criteria:**
**Given** um ambiente Node 24
**When** instalo + rodo o bootstrap
**Then** ele usa o `ClaudeCodeAdapter` para registrar skills + slash-commands no Claude Code *(AD-7)*
**And** após a instalação, `/process-ai` está disponível sem passos manuais além do bootstrap.

### Story 3.5: Documentação de contribuidor (packs + adapters)
As a contribuidor,
I want docs de como criar method-packs e adapters,
So que a comunidade estenda o framework.

**Acceptance Criteria:**
**Given** o `SOLUTION-DESIGN.md`
**When** publicado como docs
**Then** cobre: criar method-pack (content-only, estende schema-núcleo), criar adapter (porta + pass-through), trabalhar no toolkit. *(SM-3)*

## Epic 4: Hardening v1.1 — Confiabilidade e Integridade

As arestas identificadas nos 3 épicos do MVP são fechadas: documentação reflete o código, o schema-núcleo tem enforcement real (fecha AD-2), o pipeline de distribuição é coberto por smoke test, e a dívida técnica [Low] acumulada no deferred-work é triada e reduzida. O framework passa de "funcional e verificável" para "robusto e auditável".

**FRs cobertos:** reforça FR-14 (confiança), FR-17 (method-pack), FR-20 (não-destrutivo), NFR-1 (honestidade), NFR-5 (observabilidade). Fecha AD-2 (schema enforcement não-deferido).

**Dependências:** Épicos 1–3 concluídos.

### Story 4.1: Schema-núcleo — enforcement estrito (fecha AD-2)

As a dev/contribuidor,
I want o schema-núcleo com validação real de shape (required, additionalProperties: false, rejeitar não-objetos),
So that method-packs sejam contidos pelo contrato e o AD-2 saia do papel.

**Acceptance Criteria:**
**Given** o validador v1 leniente (AC4 backward-compat)
**When** esta story implementa o endurecimento
**Then** (a) todos os payloads do E2E + fixtures de teste são auditados para conformidade ANTES de endurecer
**And** (b) `validateContent` rejeita não-objetos (string, número, array), ativa `required` por tipo, fecha `additionalProperties: false` nos 7 schemas, e rejeita objetos exóticos (Date, boxed String/Number)
**And** (c) headers/JSDoc de cada schema voltam a refletir o código (sem doc falsa)
**And** (d) 259+ testes continuam passando; typecheck limpo; AD-3 (não mexer no core além do schema-core) respeitado.

### Story 4.2: Self-check gate — ACs com evidência antes de done

As a dev,
I want que toda story tenha um checklist de ACs verificadas + Dev Agent Record preenchido antes de `done`,
So that o review adversarial encontre problemas sutis, não incompletude básica.

**Acceptance Criteria:**
**Given** uma story em desenvolvimento
**When** o agente marca `done`
**Then** o Dev Agent Record está preenchido (sem `{{placeholder}}`) com: modelo, data, escopo, arquivos tocados
**And** cada AC da story tem checkbox + evidência (link a commit/arquivo/teste)
**And** items não cobertos são explicitamente marcados como deferidos com justificativa
**And** o template/story-helper inclui esse checklist como seção obrigatória.

### Story 4.3: Smoke test de consumer-install no pipeline

As a dev,
I want um smoke test que simula `npm install` real em projeto consumidor limpo,
So that "testes verdes na raiz do repo" não deem falsa confiança sobre distribuição.

**Acceptance Criteria:**
**Given** o pacote buildado (`npm pack`)
**When** o smoke roda
**Then** `npm install <tarball>` em dir temporário limpo → `npx process-ai --help` funciona
**And** `/process-ai` slash-command é registrado no engine-alvo (Claude Code)
**And** o smoke é integrado ao CI (roda em todo commit que toca `package.json`/`bin`/`postinstall`)
**And** falha de registro ou bootstrap reporta erro claro (não `exit(0)` mascarado).

### Story 4.4: Documentação — drift zero (código ↔ docs)

As a contribuidor,
I want docs que reflitam o código real (paths, imports, contagens),
So that um novo contribuidor siga as instruções e chegue a resultado funcional.

**Acceptance Criteria:**
**Given** o código atual (ESM, 259 testes)
**When** a doc é conferida
**Then** `docs/method-packs.md` instrui `import` (não `require`) e não referencia paths `.ts` fora do repo
**And** `docs/toolkit.md` tem contagem de testes correta e atualizada
**And** um teste leve automatizado confere: contagem da doc vs contagem real
**And** headers/JSDoc de schema-core não afirmam enforcement que o código não cumpre (pré-4.1: remover claims falsas; pós-4.1: claims verdadeiras).

### Story 4.5: Claims de contrato/doc validadas contra consumo

As a dev/contribuidor,
I want que nenhuma header/JSDoc/claim afirme enforcement que o código não cumpre,
So that a intenção declarada e o comportamento real sejam indistinguíveis.

**Acceptance Criteria:**
**Given** o toolkit com schemas, validação e docs
**When** claims são conferidas contra consumo real
**Then** um teste no estilo `doesNotMatch(/pattern/)` cobre cada arquivo de schema-core, adapter, e doc que faça afirmação de enforcement
**And** claims falsas são removidas ou o código é corrigido para cumpri-las (nunca deixadas em desacordo)
**And** o teste é integrado à suite principal (roda em todo commit).

### Story 4.6: Triagem do deferred-work — agrupar, priorizar, fechar lotes

As a dev,
I want o deferred-work triado por arquivo-gatilho e os lotes simples fechados,
So that o backlog de dívida diminua e o resto fique corretamente governado.

**Acceptance Criteria:**
**Given** os ~50 itens [Low] em `deferred-work.md`
**When** a triagem é concluída
**Then** itens são agrupados por arquivo-gatilho (ex.: 4 de `confidence.ts` = 1 lote; 3 de `report.ts` = 1 lote)
**And** lotes com custo/risco justificado são fechados (PRs com correções + testes)
**And** itens mantidos em aberto são reavaliados: severidade ainda é [Low]? gatilho ainda é válido?
**And** `deferred-work.md` é atualizado com status pós-triagem: fechados, reagrupados, reavaliados.

### Story 4.7: Readiness final — fechar dimensões pendentes da retro

As a project lead / dev,
I want as 3 dimensões pendentes de readiness resolvidas ou explicitamente deferidas,
So that o v1.1 seja declarado completo com confiança.

**Acceptance Criteria:**
**Given** as dimensões pendentes do §11 da retro do Épico 3
**When** esta story conclui
**Then** (a) Deploy/publicação npm: decisão documentada (publicar agora vs aguardar X)
**And** (b) Aceitação de stakeholders: wedge Vendas/PME validado com ≥1 pessoa externa ou explicitamente deferido com justificativa
**And** (c) Estabilidade (gut): o Project Lead declara o v1.1 pronto — decisão documentada
**And** retros opcionais dos Épicos 1 e 2 são consideradas (rodar ou declarar N/A com justificativa).

## Epic 5: Instalador — UX Interativa paridade Reversa

O instalador (`npx process-ai`) atinge **paridade de UX** com a rotina interativa do Reversa (framework de referência — [arXiv:2605.18684](../../docs/2605.18684v1_Reversa-pt-BR.md)): banner ciano + tema + spinner (zero-dep), perguntas no formato Reversa com contagem real de agentes, checkbox raw-mode para seleção de engines, preferências persistidas em `config.user`, e resumo por time ao final. O objetivo é que a primeira experiência de instalação seja guiada, profissional e sem dependências externas — alinhado ao AD-3 (core isolado do engine, hexagonal) e ao NFR-6 (portabilidade).

**FRs cobertos:** reforça FR-21 (porta `EngineAdapter` multi-engine) e a experiência de onboarding (antes implícita no AD-7 — Story 3.4).

### Story 5.1: Banner ciano + tema + spinner (zero-dep)

As a usuário,
I want um banner ciano + tema de cores + spinner de progresso no instalador,
So that a primeira impressão do `npx process-ai` seja polida e acolhedora.

**Acceptance Criteria:**
**Given** a execução do install interativo
**When** o instalador inicia
**Then** um banner ciano é renderizado com tema de cores consistente e um spinner indica progresso nas etapas
**And** tudo é zero-dep (`node:*`), sem dependências npm externas. *(AD-3, NFR-6)*

### Story 5.2: Perguntas no formato Reversa + contagem real (12 agentes)

As a usuário,
I want que o instalador faça perguntas no formato do Reversa com a contagem real de agentes,
So that as escolhas reflitam exatamente o time instalado, sem números genéricos.

**Acceptance Criteria:**
**Given** o install interativo
**When** as perguntas são apresentadas
**Then** seguem o formato do Reversa (nome do projeto, como te chamar, idiomas, estratégia git, engines)
**And** a contagem de agentes é real (12 agentes), não um placeholder. *(FR-21)*

### Story 5.3: UX interativa completa — checkbox raw-mode, prefs em config.user, resumo por time

As a usuário,
I want a UX interativa completa (checkbox raw-mode de engines, preferências gravadas em `config.user`, resumo por time),
So that eu configure a instalação inteira numa única passada guiada.

**Acceptance Criteria:**
**Given** o install interativo
**When** completo as perguntas
**Then** o checkbox raw-mode permite selecionar engines sem dependência de `inquirer`
**And** as preferências (nome, como chamar, idiomas, git) são persistidas em `config.user` no topo do install
**And** um resumo por time é exibido ao final. *(AD-3, FR-21)*

### Story 5.4: Engines persistidas + checkbox com wrap e validação visível

As a usuário,
I want engines "(em breve)" marcáveis e registradas em `config.user`, e um checkbox que navega com wrap e mostra validação no enter vazio,
So that a seleção de engines seja fiel ao comportamento do inquirer do Reversa.

**Acceptance Criteria:**
**Given** o checkbox de engines
**When** navego e seleciono
**Then** a navegação percorre TODOS os itens com wrap (inquirer loop); itens "(em breve)" são navegáveis mas só os registrados alternam
**And** `engines` é persistido em `config.user` como CSV (incluindo as "(em breve)" marcadas)
**And** enter com zero marcadas exibe validação visível em vez de silêncio. *(AD-3, FR-21)*