---
baseline_commit: 9edd59370a27ad8679ac275d3202df171c92e1be
---

# Story 2.3: Júlia profunda — BPMN 2.0 XML canônico + gargalos

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **leigo**,
I want **o processo modelado de verdade em BPMN 2.0 XML canônico (a partir da hierarquia de Miguel), com os gargalos/handoffs apontados e cada um fundamentado por evidência — e cada elemento do fluxo marcado honestamente (🟢 onde deriva da hierarquia, 🟡 onde o fluxo é inferido, 🔴 onde há passo indeterminado)**,
so that **a modelagem do processo deixe de ser "rascunho de fluxo markdown" (1.6) e passe a ser o artefato canônico editável que Zanoni (2.4) referencia nos POPs, com a confiança honesta herdada da cadeia de provenance (`flow ← hierarchy ← value-chain ← discovery-interview`)**.

## Acceptance Criteria

1. **[AC1] Roteiro de modelagem completo — não improvisado (FR-10 *intent*)** — **Given** Gate 2 aprovado, estágio `modeling`, e a `hierarchy` de Miguel entregue, **When** Júlia modela, **Then** a modelagem segue um **roteiro estruturado e completo** que transforma a hierarquia em um fluxo BPMN ponta-a-ponta — **não** improvisado pelo agente, **não** limitado a "lista numerada markdown" (1.6). O roteiro é **conteúdo autorado na skill da Júlia** (semente do method-pack); *loader*/pack externo é **Epic 3** (3.2/3.3). *(FR-10 full)*

2. **[AC2] BPMN 2.0 XML canônico emitido (FR-10, AD-6)** — **Given** o roteiro e a hierarquia, **When** Júlia propõe, **Then** o fluxo é proposto como **BPMN 2.0 XML** — o formato **on-disk canônico, toolkit-owned por contrato** (AD-6) — mapeando atividades/tarefas da hierarquia em elementos BPMN (ex.: `startEvent`, `task`/`serviceTask`, `sequenceFlow`, `gateway` (`exclusiveGateway`/`parallelGateway`), `endEvent`, com `id`s estáveis referenciando os IDs da hierarquia de Miguel). O XML é commitado via `process-ai propose` (AD-1) com `artifactType: "flow"` — **a profundidade está no conteúdo (BPMN XML), não em um tipo novo**. *(FR-10 full, AD-6)*
   > **Decision #1 (flaggada — leia):** o `artifactType` **permanece `flow`**, com `content` = BPMN 2.0 XML. **Motivo (precedente 2.2, validado em code review):** 2.2 decidiu "profundidade no conteúdo, não em tipos novos" (manteve `hierarchy`); AD-3 exige zero mudança no toolkit; schema-núcleo por tipo (incl. BPMN) é **AD-2 → Epic 3 (3.1)**; `toolkit/src/bpmn.ts`, extensão `.bpmn` e validação de XML well-formed são **3.1**. Hoje o toolkit trata `content` como **opaco** (`EXT_BY_TYPE = {}` → `.md`) — o BPMN 2.0 XML vive como conteúdo hashed por SHA-256, e "toolkit-owned" é satisfeito **por contrato** (o framework define BPMN 2.0 XML como O formato; o pack não escolhe). **Alternativa considerada e rejeitada (scope creep):** introduzir tipo `bpmn` (ou renomear `flow`→`bpmn`) — adicionaria artifactType, exigiria mudar `SPECIALISTS` (`specialists.test.ts`), a contagem do `e2e-pipeline` (7) e a linha de handoff do condutor, e avançaria sobre 3.1 (schema-núcleo por tipo). **Se o dev achar que precisa de `bpmn.ts`/mudar o toolkit para emitir BPMN — pare, é 3.1.**

3. **[AC3] Gargalos/handoffs identificados com evidência (FR-11)** — **Given** o fluxo BPMN modelado, **When** Júlia analisa, **Then** gargalos e handoffs problemáticos são **listados**, cada um como **um claim** com marcador + **evidência que o fundamenta** (o `reasoning` cita o nó/elemento do `flow` ou da `hierarchy` onde o gargalo se manifesta). Gargalos são **análise inferida** → tipicamente **🟡** (nunca 🟢 sem fonte verificável; 🟢 só se a hierarquia mostrar **explicitamente** o ponto de bloqueio). Mix honesto — nunca inflar 🟢 (SM-C1/NFR-1). *(FR-11)*

4. **[AC4] Claims honestos por elemento + provenance threading preservado (FR-14, AD-5, NFR-1, FR-3)** — **Given** a modelagem, **When** Júlia monta os `claims`, **Then** **cada elemento significativo do fluxo tem um claim** com marcador: 🟢 onde o elemento **deriva nominalmente da `hierarchy`** de Miguel (`source: { artifactType: "hierarchy", sha256: <sha de Miguel> }` que **resolve** ao manifesto — AD-5); 🟡 onde o fluxo é **inferido** (elemento não confirmado na hierarquia); 🔴 onde há **passo indeterminado**. A cadeia de provenance permanece limpa: `flow ← hierarchy ← value-chain ← discovery-interview` (Júlia sourceia **só** a `hierarchy`, nunca `value-chain`/`discovery-interview` diretamente — é fonte do Miguel/Bento). Júlia **entrega** o `sha256` de `flow` ao Zanoni (que em 2.4 sourceará `flow` para o `pop` 🟢 — regressão 1.6/2.1/2.2 preservada). *(FR-14 full; mecanismo AD-5 já existe desde 1.4)*
   > **Regra operacional anti-inflação (herdada da 2.2, SM-C1/NFR-1):** o toolkit valida só a **resolução** do manifesto, não a semântica — logo 🟢 só para elementos do fluxo que mapeiam a **nós confirmados na hierarquia** (atividades/tarefas que Miguel marcados, tipicamente 🟢/🟡 na `hierarchy`). Fluxo inferido (ex.: gateways, paralelismos, ordenações não explícitas) = 🟡; passo não determinado = 🔴. **Nunca** marque 🟢 um elemento fabricado/inferido (lição da revisão da 2.2 — o exemplo da skill NÃO pode inflar 🟢).

5. **[AC5] Fronteiras respeitadas — zero scope creep (AD-3, AD-6)** — **Given** o escopo de "Júlia profunda", **Then** a story **NÃO** constrói: **render** BPMN (Mermaid/SVG/diagrama → **deferred** AD-6 / PRD §11); **schema-núcleo** BPMN versionado, `toolkit/src/bpmn.ts`, extensão `.bpmn`, validação de XML well-formed (→ **3.1**, AD-2); **loader**/validador de method-pack (→ **3.2**); extração de roteiro para `method-packs/` (→ **3.3**); **diagnóstico** consolidado (→ **2.4** Zanoni); **rastreabilidade bidirecional navegável** cross-artefato + verificação de **excerpt** + relatório **consolidado** (→ **2.5**); **gates ricos** com contagem/lista bloqueando (→ **2.6**); novo artifactType `bpmn` (→ **3.1**, ver Decision #1). E **NÃO adiciona arquivo em `toolkit/src/**`** (AD-3 `import-boundary` permanece verde) — a profundidade é entregue na **camada de skill + testes**, reusando o toolkit estável de 1.1–1.5/2.1/2.2. *(AD-3, AD-6)*

> **Critério implícito (não-negociável):** a história deixa o sistema "rodável ponta-a-ponta" no escopo dela — `node --test tests/*.test.ts` 100% verde (**177 testes herdados da 1.1–2.2 + novos, zero regressões**), `npm run typecheck` (`tsc --noEmit`) limpo, e o guardrail **AD-3** (`tests/import-boundary.test.ts`) permanece verde (esta story **não adiciona arquivos ao core** `toolkit/src/**`). Um **E2E atualizado** deve passar: Gate 0 → `gate-1`+`discovery` → Bento → `gate-2`+`mapping` → Miguel profundo → `gate-3`+`modeling` → **Júlia profunda**: propõe `flow` com **content = BPMN 2.0 XML** + claims (🟢 sourcing `hierarchy` resolve + 🟡 fluxo inferido + 🔴 passo indeterminado + gargalo 🟡 com evidência) → `gate-4`+`standardization` → Zanoni (🟢 sourcing `flow` — regressão) → ledger não-vazio → `report` → `resume` sem duplicação (**7 artefatos, 5 gates, sem órfãos**). Não basta "satisfazer os ACs literais".

## Tasks / Subtasks

- [x] **T1 — Aprofundar a skill da Júlia `skills/process-ai-julia/SKILL.md` (AC: #1, #2, #3, #4)**
  - [x] **MODIFY — a skill-fonte hoje é o rascunho 1.6** (~83 linhas; produz "fluxo simples em markdown"; diz literalmente *"não BPMN 2.0 XML, que chega na story 2.3"*). Substituir por uma skill de **modelagem BPMN completa**. **Fonte única de verdade** (o adapter a copia byte-a-byte).
  - [x] **Roteiro de modelagem completo (AC1):** substituir "lista numerada markdown" por um **roteiro estruturado** que transforma a hierarquia em BPMN: (a) identificar início/fim do processo (`startEvent`/`endEvent` a partir dos limites da cadeia); (b) mapear atividades/tarefas da hierarquia em `task`/`serviceTask` (referenciando os IDs estáveis `A…`/`T…` de Miguel); (c) conectar em `sequenceFlow`; (d) identificar pontos de decisão/paralelismo (`exclusiveGateway`/`parallelGateway`) — marcando-os 🟡 (inferido) salvo evidência explícita; (e) identificar gargalos/handoffs (AC3). Espelhar o §2 "Roteiro de decomposição completo" do Miguel (`skills/process-ai-miguel/SKILL.md`). O roteiro é **conteúdo autorado na skill** (semente do pack; loader → 3.2, extração → 3.3).
  - [x] **BPMN 2.0 XML canônico (AC2):** instruir o agente a redigir **BPMN 2.0 XML válido** como `content` do `flow` (Decision #1). Definir um **shape mínimo de exemplo** (declarar `<?xml …>` + `<definitions … xmlns:bpmn=…>` + `<process id=… isExecutable="false">` + startEvent/task/sequenceFlow/endEvent, com `id`s estáveis ancorados nos IDs da hierarquia). **Não** construir render. **Não** introduzir artifactType `bpmn` (→ 3.1).
  - [x] **Gargalos com evidência (AC3):** um claim por gargalo/handoff identificado, tipicamente 🟡, com `reasoning` citando o nó/elemento do `flow`/`hierarchy` onde se manifesta.
  - [x] **Claims honestos por elemento (AC4) + regra anti-inflação:** `ProposePayload` de `flow` com `claims[]`: 🟢 sourcing **só** `hierarchy` (resolve, AD-5) para elementos que mapeiam a nós confirmados; 🟡 para fluxo inferido; 🔴 para passo indeterminado; gargalos 🟡 com evidência. **Mecanismo AD-5 já existe (1.4); zero mudança no toolkit.** Inclua a **regra anti-inflação operacional** (só elementos derivados nominalmente da hierarquia confirmada qualificam-se a 🟢).
  - [x] **CORRIGIR notes stale (honestidade, NFR-1):** o cabeçalho/intro diz *"fluxo simples (rascunho em markdown — não BPMN 2.0 XML, que chega na story 2.3)"* e §2 *"Não emita XML aqui"* — **ambos stale** (2.3 é esta story). Reescrever: Júlia agora **emite BPMN 2.0 XML**. O `artifactType`: remover a reserva *"Não use `bpmn` (reservado para 2.3)"* — `flow` **permanece** o tipo (Decision #1), agora com conteúdo BPMN XML.
  - [x] **Atualizar "O que NÃO é da Júlia" (fronteiras):** remover *"BPMN 2.0 XML canônico → 2.3"* e *"Gargalos/handoffs → 2.3"* (satisfeitos nesta story). Reter/redirecionar: **render** BPMN → **deferred** (AD-6/PRD §11); **diagnóstico** consolidado → **Zanoni (2.4)**; **rastreabilidade bidirecional navegável** + verificação de **excerpt** + relatório **consolidado** → **2.5**; **gates ricos** → **2.6**; **schema-núcleo** BPMN / `bpmn.ts` / extensão `.bpmn` / loader / pack → **Epic 3** (3.1/3.2/3.3); hierarquia (Miguel) / POP (Zanoni).
  - [x] **Preservar (não-regressão 1.6):** frontmatter `name: process-ai-julia` + `description` (pode afinar texto, mantém nome + "modeling" + "não invoque diretamente"); §"Como a Júlia opera" com **AD-1 declarado estruturalmente** (sem escrita direta; sempre `process-ai propose --payload`); persona ("Visual e estrutural", honesto NFR-1, pt-BR); padrão **Write-não-heredoc** + captura de sha + entrega à Déa (→ Zanoni) + remoção do temp.

- [x] **T2 — Atualizar a nota de fronteira do condutor `skills/process-ai/SKILL.md` §3 (AC: #4, #5)**
  - [x] **MODIFY a nota de fronteira (`:89-94`):** *"Bento (2.1) e Miguel (2.2) são profundos… Júlia/Zanoni profundos vêm nas 2.3/2.4…"* → atualizar: **Bento, Miguel e Júlia agora são profundos** (descoberta + mapeamento + modelagem BPMN completos e rastreáveis); Zanoni profundo vem na **2.4**; diagnóstico/gates ricos também Epic 2; method-packs Epic 3.
  - [x] **MODIFY a linha do handoff da Júlia (`:86`):** `gate-3 | modeling | Júlia | fluxo simples (não BPMN XML) | flow` → `gate-3 | modeling | Júlia | fluxo BPMN 2.0 XML | flow` (artifactType `flow` **inalterado** — só a descrição do artefato muda de "rascunho markdown" para "BPMN 2.0 XML"). **Atenção:** o `artifactType` continua `flow` (Decision #1) — não renomear.
  - [x] **VERIFICAR a nota de provenance (`:117`):** *"Júlia → entrega o sha256 de flow ao Zanoni"* **permanece correta** — manter (Zanoni em 2.4 sourceará `flow`). *(Se mencionar "rascunho" ou "markdown", ajustar; senão, deixar.)*
  - [x] **Preservar (não-regressão 1.1/1.5/2.1/2.2):** frontmatter `name: process-ai`; abertura *"Qual processo vamos mapear?"*; `resume`; Gate 0; tabela de gates/estágios canônicos; threading dos shas; encerramento com `report`+`summary-report`; AD-1; `tests/skill.test.ts` deve permanecer verde.

- [x] **T3 — Testes (AC: #1–#5 + AD-1/AD-3/AD-5 + regressão 1.1–2.2)**
  - [x] **`tests/specialists.test.ts` (PROVAVELMENTE SEM MUDANÇA — verificar):** Júlia **mantém** `types: ['flow']` (`:27`) — **nenhum artifactType novo** (Decision #1) → o array `SPECIALISTS` **não muda**. As asserções de conteúdo (frontmatter, persona `Júlia`, pt-BR, `process-ai propose`, `claims`, marcadores 🟢🟡🔴, "sem escrita direta", artifactType `flow`) continuam válidas **contanto que a skill reescrita retenha essas strings**. *Ação: rodar e confirmar verde; se quebrar, é porque a skill perdeu uma string assertada — restaurar, não afrouxar o teste nem adicionar `types`.*
  - [x] **`tests/e2e-pipeline.test.ts` (MODIFY leve — seção Júlia `:166-181`):** enriquecer para refletir "Júlia profunda": (a) o `content` do `flow` → uma string **BPMN 2.0 XML** real (mínimo válido: `<definitions>…<process>…<startEvent/>…<task/>…<sequenceFlow/>…<endEvent/></process></definitions>`) em vez do markdown one-liner atual (`:172`); (b) os `claims` → manter o 🟢 sourcing `hierarchy` (resolve) + **adicionar um 🟡 (fluxo inferido), um 🔴 (passo indeterminado) e um gargalo 🟡 com `reasoning` citando o nó do flow** (FR-11). **Contagem permanece 7** (nenhum artefato novo — `flow` continua `flow`) → as asserções `cp.artifacts.length === 7` e `types` deepEqual **não mudam**. Zanoni (`:187-198`) continua sourceando `flow` 🟢 — **regressão preservada**. Atualizar o comentário de cabeçalho da seção para citar **2.3: Júlia profunda (BPMN XML)**.
  - [x] **`tests/julia-flow.test.ts` (NEW — espelhar `tests/miguel-hierarchy.test.ts`):** teste focado, **duas preocupações**:
    - *(Mecanismo — espelhar `miguel-hierarchy.test.ts`/`bento-discovery.test.ts`)*: propor `hierarchy` (fonte) → propor `flow` com 🟢 sourcing `hierarchy` (resolve) + 🟢 com sha inexistente (degrada a 🟡 `unresolved-source`, não aborta) + 🟡 (fluxo inferido) + 🔴 (passo indeterminado); asserir ledger com o 🟢 resolvido e o degradado; asserir relatório sem "zeros honestos". *Drive determinístico via `dispatch(parseArgs([...]), adapter, root)` com `new ClaudeCodeAdapter({ cwd: tmp })` — sem LLM.*
    - *(Profundidade da skill + guards de honestidade — específico da Júlia)*: ler `skills/process-ai-julia/SKILL.md` e asserir propriedades que **NÃO existem na skill 1.6** — prova que a profundidade foi autorada: (a) a skill **instrui emissão de BPMN 2.0 XML** (ex.: `/BPMN 2\.0 XML|<bpmn:|<definitions/i` — **falha contra 1.6**, que diz "não emita XML"); (b) **gargalos com evidência** (`/gargalo/i` + instrução de evidência); (c) **guards de honestidade**: `assert.doesNotMatch(content, /não emita XML/i, …)` e `assert.doesNotMatch(content, /rascunho/i, …)` travam as correções do T1 contra regressões. **Disciplina TDD (herdada da 2.2):** rodar as asserções de profundidade contra o texto 1.6 *antes* da reescrita e confirmar que **falham**; se passarem inalteradas, o teste é fraco — endurecer (lição da revisão da 2.2: o regex não pode casar trivialmente a skill antiga).
  - [x] **Regressão intocada e verde:** `tests/{scaffold,bootstrap,commit,checkpoint,confidence,report,cli,import-boundary,skill,specialists,e2e-conductor,e2e-pipeline,adapter,bento-discovery,miguel-hierarchy}.test.ts` — **177 testes da 1.1–2.2 inalterados** (exceto `e2e-pipeline`, que enriquece a seção Júlia). Em especial: `tests/import-boundary.test.ts` (AD-3) verde (**nenhum arquivo novo em `toolkit/src/`**); `tests/miguel-hierarchy.test.ts` verde (2.2 intocada); `tests/skill.test.ts` verde após a edição leve do condutor.

- [x] **T4 — Critério implícito (não-negociável)**
  - [x] `node --test tests/*.test.ts` → 100% pass (177 prévios + novos), 0 fail.
  - [x] `npm run typecheck` (`tsc --noEmit`) limpo.
  - [x] AD-3 verde (`toolkit/src/**` intocado — **nenhum** arquivo novo no core; mudança TS só em testes).
  - [x] E2E atualizado passando: …→ Miguel profundo → **Júlia profunda** (flow = BPMN 2.0 XML + 🟢 sourcing `hierarchy` + 🟡 + 🔴 + gargalo com evidência) → Zanoni (regressão 🟢 sourcing `flow`) → resume sem duplicação (7 artefatos, 5 gates, sem órfãos).

## Dev Notes

### O que esta história É (e o que NÃO é) — leia antes de codar

Esta é a **story 2.3 — terceira do Epic 2**. O Epic 1 (1.1–1.6) entregou a fundação e especialistas como rascunhos mínimos — Júlia produzia um `flow` **em markdown** ("lista numerada"), com **um** claim 🟢 sourcing `hierarchy`. A **2.1 aprofundou o Bento**; a **2.2 aprofundou o Miguel** (hierarquia completa e rastreável, com IDs estáveis — que **esta story consome**). A **2.3 é onde a Júlia fica profunda**: modelagem em **BPMN 2.0 XML canônico** (FR-10, AD-6), **gargalos com evidência** (FR-11), e claims honestos por elemento.

**O mecanismo-chave (leia — é o que dá valor à story):** AD-5 diz que 🟢 exige fonte que **resolve a artefato commitado**. Júlia **já podia 🟢** desde 1.6 (sourcing `hierarchy`); a 2.1/2.2 registraram/disponibilizaram isso. Em **2.3, Júlia exercita esse mecanismo ricamente sobre o fluxo BPMN completo** — múltiplos claims (um elemento significativo cada), 🟢 onde deriva da hierarquia, 🟡 onde infere, 🔴 onde é indeterminado, **+ gargalos como análise 🟡 com evidência (FR-11)**. Entregue **inteiramente na camada de skill** — **zero mudança no toolkit** (AD-3; o mecanismo AD-5 já existe desde 1.4; 2.3 apenas o exercita sobre o `flow` em BPMN XML).

**Não construa aqui (scope creep — cada item pertence a outra story):**

| Pertence a 2.3 (esta) | Pertence a histórias futuras — NÃO faça |
|---|---|
| Roteiro de modelagem **completo** (conteúdo autorado na skill da Júlia) | **Loader/validador** de method-pack → **3.2** |
| **BPMN 2.0 XML** canônico como `content` do `flow` (artifactType inalterado) | **Render** BPMN (Mermaid/SVG) → **deferred** (AD-6 / PRD §11) |
| Gargalos/handoffs **com evidência** (claim 🟡 + reasoning) | **Schema-núcleo** BPMN / `toolkit/src/bpmn.ts` / extensão `.bpmn` / validação XML well-formed → **3.1** (AD-2) |
| Claims 🟢 (sourcing `hierarchy`) + 🟡 (inferido) + 🔴 (indeterminado) | **Diagnóstico** consolidado → **2.4** (Zanoni) |
| Correção das notes stale ("não emita XML"/"rascunho") + nota do condutor | **Rastreabilidade bidirecional navegável** + **excerpt** + relatório **consolidado** → **2.5** |
| `artifactType: 'flow'` (inalterado — profundidade no conteúdo) | **Gates ricos** (contagem+lista bloqueando) → **2.6**; novo tipo `bpmn` → **3.1** |
| (sem mudança no toolkit — reusa commit/validateClaims de 1.2/1.4) | **Extrair** o roteiro para `method-packs/bpmn-sipoc/prompts/` → **3.3** |

> **Fronteira 2.3 ↔ 2.x/Epic 3 (não-negociável):** a 2.3 leva **Júlia** ao nível "modelagem BPMN completa e honesta" (BPMN 2.0 XML + gargalos com evidência + marcadores honestos), **sem** construir render, schema-núcleo, `bpmn.ts`, validador XML, loader/pack. O **BPMN 2.0 XML é conteúdo** do `flow` (toolkit opaco); "toolkit-owned" (AD-6) é satisfeito **por contrato** (o framework define o formato), não por código no toolkit (isso é 3.1).

### Inteligência da revisão da 2.2 (lições aplicáveis — NÃO repita)

O code review da 2.2 (commit `9edd593`) encontrou **2 achados medium** que são **diretamente aplicáveis** a esta story — codifique-os como prevenção:

1. **🟢 inflado no exemplo (medium):** o exemplo de claim 🟢 da skill do Miguel afirmava uma decomposição **inferida** (não nominal na cadeia) como 🟢. **Prevenção 2.3:** o exemplo de claim 🟢 da Júlia deve ancorar **só** em elementos do fluxo que mapeiam a **nós confirmados na hierarquia**; fluxo inferido (gateways, ordenações, paralelismos não explícitos) = 🟡. O toolkit só valida resolução do sha — **não** máscare inferência como 🟢.
2. **Nó 🔴 fabricado (medium):** o exemplo do Miguel preenchia um nível-gap com conteúdo concreto e o marcava 🔴, contradizendo "não invente o nível". **Prevenção 2.3:** se um passo do fluxo é 🔴 (indeterminado), represente honestamente (ex.: o elemento existe no XML mas o `reasoning` declara o gap; ou o elemento é omitido e declarado gap) — **não fabrique** um passo concreto e o rotule de 🔴.
3. **Teste que prova só "presença" (low/medium):** as asserções de profundidade da skill na 2.2 casavam **strings do exemplo**, não **instrução**, e um regex (`{2,}`) era frouxo demais. **Prevenção 2.3:** as asserções de profundidade do `julia-flow.test.ts` devem (a) **falhar contra a skill 1.6** (disciplina TDD — rode antes da reescrita), e (b) provar **instrução** (ex.: a skill **instrui** emitir BPMN 2.0 XML — regex que casa a skill nova mas **falha** na 1.6, que diz "não emita XML").
4. **`includes('🟡')` não isolava o 🟡 literal do degradado (low/medium).** **Prevenção 2.3:** no `julia-flow.test.ts`, isole o 🟡 literal do 🟢-degradado (`e.validated === '🟡' && !e.degradationReason`).

### Paradigma e invariantes binding (não quebre)

- **AD-1 — Propose/Commit:** toda escrita passa por `adapter.propose()` → `commit()`; a skill/CLI **não tocam** `_process-ai_output/`/`.process-ai/`. Júlia commita o `flow` via `process-ai propose --payload <file.json>` (gravado com a ferramenta **Write**, não heredoc). [Source: ARCHITECTURE-SPINE#AD-1]
- **AD-3 — Núcleo hexagonal:** o core (`toolkit/src/**`) **não é modificado** nesta story. A **única** mudança TS é em **testes** → `tests/import-boundary.test.ts` permanece verde. [Source: ARCHITECTURE-SPINE#AD-3]
- **AD-5 — Confiança verificável:** Júlia propõe elemento+fonte+razão; o toolkit valida e grava no ledger. 🟢 exige `source` cujo manifesto existe — **`hierarchy` (a fonte única e primária do fluxo; NÃO sourcear `value-chain`/`discovery-interview` — manter a cadeia limpa: `flow ← hierarchy ← value-chain ← discovery-interview`)**. Sem fonte → 🟡; não-determinado → 🔴. **Excerpt/nav bidirecional/consolidado → 2.5.** `claimId` toolkit-assigned: `flow-<sha>-<index>`. [Source: ARCHITECTURE-SPINE#AD-5; código `confidence.ts:177-242`]
- **AD-6 — BPMN canônico on-disk:** o formato **on-disk canônico** do BPMN é **BPMN 2.0 XML**, **toolkit-owned** (não definido pelo pack). Em 2.3, isto realiza-se como **conteúdo do `flow`** (toolkit opaco hoje; schema/bpmn.ts → 3.1). **Render é derivação → deferred.** [Source: ARCHITECTURE-SPINE#AD-6]
- **AD-2 — Method-pack/schema-núcleo → Epic 3:** o roteiro fica **autorado na skill**; schema-núcleo BPMN/loader/pack/extração → 3.1/3.2/3.3. [Source: ARCHITECTURE-SPINE#AD-2]
- **FR-3 — Ordem fixa:** Bento→Miguel→Júlia→Zanoni (estágios `discovery`→`mapping`→`modeling`→`standardization`; gates `gate-1..gate-4`). Júlia vive no estágio `modeling`, gate `gate-3` — **canônico, não renumerar**. [Source: SPEC#CAP-1/CAP-4, prd §4.1/§4.4]
- **NFR-1 / SM-C1 — Honestidade:** 🟢 **só** com source resolvida; nunca inflar 🟢. É honesto que parte do fluxo permaneça 🟡/🔴 e que gargalos sejam análise 🟡. [Source: prd §5/NFR-1, SM-C1]

### O código que esta história MODIFICA — leia antes de tocar

_(Não-negociável: ler o estado atual antes de mudar. Fontes: `skills/process-ai-julia/SKILL.md`, `skills/process-ai/SKILL.md` §3, `tests/specialists.test.ts`, `tests/e2e-pipeline.test.ts`, `tests/miguel-hierarchy.test.ts` (modelo).)_

**`skills/process-ai-julia/SKILL.md` (MODIFY — T1):**
- **Estado atual (1.6):** ~83 linhas, rascunho mínimo. Intro diz *"modela o processo como um fluxo simples (rascunho em markdown — **não** BPMN 2.0 XML, que chega na story 2.3)"*. §2 *"Produz o fluxo simples"* + nota *"fronteira AD-6: … Não emita XML aqui"*. §3 exemplo `ProposePayload` com `artifactType: flow`, content markdown, 2 claims (🟢 sourcing `hierarchy` + 🟡). artifactType: *"Não use `bpmn` (reservado para 2.3)"*. Fronteiras apontam *"BPMN 2.0 XML → 2.3"* e *"Gargalos → 2.3"*.
- **O que muda:** §2 → roteiro de modelagem BPMN completo (start/end, mapear atividades/tarefas em `task`, `sequenceFlow`, gateways, gargalos); novo bloco "Produz o BPMN 2.0 XML" (shape mínimo de exemplo, IDs ancorados na hierarquia); §3 → claims por elemento (🟢 hierarchy + 🟡 inferido + 🔴 indeterminado) + gargalos 🟡 com evidência; **reescrever notes stale** ("não emita XML" → "emite BPMN 2.0 XML"; remover reserva "bpmn reservado para 2.3"); fronteiras atualizadas (remover itens satisfeitos).
- **Preservar:** frontmatter (`name: process-ai-julia`/`description` — pode afinar, mantém nome + "modeling" + "não invoque diretamente"); §"Como a Júlia opera" (AD-1 estrutural, `sem escrita direta`); persona (Visual e estrutural, honesto, pt-BR); padrão Write-não-heredoc + captura sha + entrega à Déa/Zanoni + remoção temp. **Todas as strings assertadas pelo `specialists.test.ts` retidas** (`process-ai propose`, `claims`, 🟢🟡🔴, `pt-BR`, `Júlia`, "sem escrita direta", `flow`).

**`skills/process-ai/SKILL.md` (MODIFY leve — T2, só §3):**
- **Estado atual:** §3 nota de fronteira (`:89-94`) *"Bento (2.1) e Miguel (2.2) são profundos… Júlia/Zanoni profundos vêm nas 2.3/2.4…"*; linha do handoff Júlia (`:86`) `gate-3 | modeling | Júlia | fluxo simples (não BPMN XML) | flow`; nota de provenance (`:117`) *"Júlia → entrega o sha256 de flow ao Zanoni"*.
- **O que muda:** nota de fronteira → **Bento, Miguel e Júlia profundos** (Zanoni → 2.4); linha do handoff → `fluxo BPMN 2.0 XML` (artifactType `flow` **inalterado**); nota de provenance **permanece correta** (Zanoni sourceia `flow`).
- **Preservar:** frontmatter `name: process-ai`; §1/§2/§4; tabela canônica; threading dos shas; Tom da Déa; AD-1. `tests/skill.test.ts` verde.

**`tests/specialists.test.ts` (VERIFICAR — provavelmente sem mudança):** `SPECIALISTS` (`:27`) `{ skill: 'process-ai-julia', persona: 'Júlia', types: ['flow'] }`. **Nada muda** contanto que a skill reescrita retenha as strings assertadas. Se quebrar, restaurar a string — **não** afrouxar nem adicionar `types`.

**`tests/e2e-pipeline.test.ts` (MODIFY leve — T3):** seção Júlia (`:166-181`) propõe `flow` com `content` markdown one-liner (`:172`) + 1 claim (🟢 sourcing `hierarchy`); asserção **7 artefatos**; `types` deepEqual; resume 7/5. **Muda:** `content` → BPMN 2.0 XML; `claims` → +🟡 +🔴 +gargalo 🟡 com evidência; **contagem permanece 7**; Zanoni (`:187-198`) continua sourceando `flow` 🟢. Atualizar comentário de cabeçalho (cita 2.3).

**`tests/miguel-hierarchy.test.ts` (NO CHANGE — é o MODELO para o novo `julia-flow.test.ts`):** replique a estrutura: helper `propose()` (Write temp → `dispatch(parseArgs(['propose','--payload',p]), adapter, root)` → parse `CommitResult`), `runJson()`, `NONEXISTENT_SHA = 'a'.repeat(64)`, tmpdir + `finally { fs.rm }`, leitura/parse do ledger, asserções `validated`/`degradationReason`/`source.sha256` + a **disciplina RED-contra-1.6** + **isolar 🟡 literal** herdadas.

**`toolkit/src/**` · `bin/process-ai.ts` · `toolkit/adapters/claude-code/adapter.ts` (NO CHANGE):** a 2.3 **consome** APIs estáveis. Assinaturas relevantes (já estáveis): `commit(payload, { root, agent })`, `ProposePayload { artifactType: string; content: unknown; claims?: Claim[] }` (**`content` opaco** — o BPMN 2.0 XML é uma string hashed por SHA-256, **sem** schema toolkit), `Claim { statement, level, source?, reasoning }`, `validateClaims(claims, root)` resolve 🟢 a manifesto; `sanitizeArtifactType` aceita kebab (`flow` válido); `EXT_BY_TYPE = {}` → `.md`. CLI: `process-ai propose --payload <file.json>`.

**Layout resultante (delta em negrito):**
```text
skills/process-ai-julia/SKILL.md      # MODIFY: roteiro BPMN completo + BPMN 2.0 XML content + claims 🟢/🟡/🔴 + gargalos c/ evidência + notes stale corrigidas (T1)
skills/process-ai/SKILL.md           # MODIFY leve: §3 nota de fronteira (Júlia profunda) + linha handoff (fluxo BPMN 2.0 XML) (T2)
tests/e2e-pipeline.test.ts           # MODIFY leve: seção Júlia enriquecida (BPMN XML + 🟡 + 🔴 + gargalo) — contagem 7 (T3)
tests/julia-flow.test.ts             # NEW: mecanismo (🟢 resolve/degrada + 🟡 + 🔴) + profundidade da skill (BPMN 2.0 XML instruído) + guards de honestidade (T3)
# NENHUM arquivo novo em toolkit/src/**  (AD-3 verde; import-boundary verde)
# No root da sessão (gerado pelo toolkit — sem mudança de layout):
_process-ai_output/flow/<sha>.md     # content = BPMN 2.0 XML (extensão .md é cosmética em v1; .bpmn → 3.1)
```

## Decisões de implementação (registre as escolhas na Completion Notes)

1. **Mantém um único artifactType `flow` (profundidade no conteúdo = BPMN 2.0 XML, não tipo novo).** AC2 entregue como **um** artefato `flow` cujo `content` é BPMN 2.0 XML. **Motivo:** precedente direto da 2.2 ("profundidade no conteúdo, não tipos novos" — manteve `hierarchy`); mantém `specialists.test.ts` `types: ['flow']` inalterado; mantém contagem do `e2e-pipeline` em 7; mantém AD-3 verde trivialmente; "toolkit-owned" (AD-6) satisfeito por contrato. **Alternativa rejeitada:** tipo `bpmn` → churn (SPECIALISTS/e2e/conductor) + scope creep 3.1 (schema-núcleo por tipo). [Source: padrão 2.2; `specialists.test.ts:27`]

2. **Roteiro de modelagem autorado na skill (não em method-pack).** AC1 exige roteiro "completo e estruturado"; loader é 3.2, extração é 3.3 (`method-packs/` hoje é só `.gitkeep`). Construir loader/pack aqui seria scope creep de Epic 3. Logo o roteiro é **conteúdo autorado na skill da Júlia** (semente canônica do futuro pack). Espelha a decisão #2 da 2.1/2.2. **Flag para o usuário confirmar.**

3. **Gargalos = claims 🟡 com evidência (FR-11).** Gargalos/handoffs são **análise inferida** → 🟡 (nunca 🟢 sem fonte verificável). A "evidência" exigida pelo FR-11 é o `reasoning` citando o nó/elemento do `flow`/`hierarchy` onde o gargalo se manifesta. **Não** construir estrutura separada de gargalos — vivem nos `claims[]` do `flow`. (Verificação de excerpt → 2.5.)

4. **"toolkit-owned" (AD-6) = por contrato, não por código (zero toolkit).** O formato BPMN 2.0 XML é definido pelo framework (não pelo pack) — satisfeito por o `flow` carregar BPMN 2.0 XML como conteúdo. `bpmn.ts`/schema-núcleo/extensão `.bpmn`/validação XML well-formed → **3.1**. Se o dev achar que precisa mudar o toolkit para "BPMN canônico" — **pare**, é 3.1.

5. **Render → deferred (AD-6 / PRD §11).** A 2.3 **não** gera Mermaid/SVG/diagrama — só o XML canônico editável. Render é derivação e está explicitamente deferida.

6. **Nenhuma mudança no toolkit/adapter/CLI (AD-3).** Toda a profundidade é entregue na camada de skill + testes. [Source: decisão #6 da 2.2]

## Padrões de teste estabelecidos (espelhar — não reinventar)

Herdados da 1.1–2.2:
- `node:test` + `node:assert/strict`; tmpdir via `fs.mkdtemp(os.tmpdir())`; `finally { fs.rm(..., { recursive: true, force: true }) }`.
- Skill-fonte é única fonte de verdade: asserções de **conteúdo** + cópia **byte-a-byte** via `installSkills` (padrão `tests/skill.test.ts`/`specialists.test.ts`).
- E2E via `dispatch(parseArgs([...]), adapter, root)` com `new ClaudeCodeAdapter({ cwd: tmp })` — drive determinístico, sem LLM (padrão `tests/e2e-pipeline.test.ts`).
- Para "simular Júlia": escrever o `ProposePayload` num temp, chamar `propose`, **ler o `sha256`** do `CommitResult` de Miguel (`hierarchy`) e reusar como `source` no claim (aqui: `hierarchy` → `flow`). Asserir ledger via `report` e/ou leitura direta de `confidence-ledger.jsonl`.
- Padrão de **degradação**: claim 🟢 com sha inexistente → `unresolved-source` → 🟡 (não aborta) — espelhar `miguel-hierarchy.test.ts`.
- **Disciplina TDD "RED-contra-1.6":** asserções de profundidade da skill devem **falhar** contra a skill 1.6 *antes* da reescrita (lição da revisão da 2.2 — regex não pode casar trivialmente a skill antiga).
- **Isolar 🟡 literal do degradado:** `entries.find(e => e.validated === '🟡' && !e.degradationReason)` (lição da revisão da 2.2).
- AD-3 guardrail: `tests/import-boundary.test.ts` varre `toolkit/src/**` — esta story **não adiciona** arquivo lá, fica verde automaticamente.

## Convenções (do spine, herdadas da 1.1–2.2)

- Naming `kebab-case`; skills prefixadas `process-ai-*`; artifactTypes kebab (`flow`); IDs globais estáveis (FR-n, AD-n, CAP-n) — nunca renumerados.
- Node 24 LTS; TS + ESM; imports `.ts` com extensão explícita (type-stripping nativo).
- Sem deps de runtime no core (AD-3 allowlist: só `node:` + relativos).
- Erros acionáveis em pt-BR. Pastas protegidas: escrita só em `_process-ai_output/` + `.process-ai/` (via toolkit).
- **Marca registrada:** "HAP" é marca da P-Excellence — **nunca** usar; a modelagem usa só BPMN 2.0 (padrão OMG) e os nomes canônicos, sem nome de metodologia/brand (nome da metodologia própria ainda é TBD — prd §11). [Source: prd §11/addendum §2]

## Project Structure Notes

- **Incremental sobre a fundação 1.1–2.2:** nenhuma camada determinística é reescrita. A 2.3 **aprofunda a skill da Júlia** (conteúdo BPMN XML + gargalos + claims por elemento) e **ajusta a nota de fronteira/linha de handoff do condutor**. Cada peça consome APIs estáveis do toolkit.
- **Alvo ≠ framework:** skills são instaladas no projeto-alvo (`.claude/skills/`); artefatos commitados no `cwd` do projeto-alvo. Testes injetam tmpdir.
- **`.gitignore` da 1.1 já cobre** `_process-ai_output/` e `.process-ai/`.
- **Baseline:** HEAD `9edd593` (pós 2.2 `done`+code review); suite **177 pass / 0 fail**. A 2.3 builda sobre esse estado; confirmar a baseline verde antes de codar (`node --test tests/*.test.ts` → 177 pass).
- **Estado atual do repo:** `method-packs/` contém **apenas `.gitkeep`** (confirme antes de codar — se houver conteúdo, é trabalho de outra story). `skills/process-ai-julia/SKILL.md` é o rascunho de ~83 linhas (1.6) — confirmar antes de reescrever.

## References

- [Source: SPEC.md#CAP-4] — modelagem (Júlia): *"O processo é modelado em BPMN (2.0 XML) com gargalos identificados."* *(FR-10, FR-11)*
- [Source: SPEC.md#CAP-1] — condução orquestrada por Déa (ordem fixa Bento→Miguel→Júlia→Zanoni)
- [Source: glossary.md] — *"BPMN — Business Process Model and Notation; notação de modelagem de processos."*; *"Gargalo"*; *"Marcador de confiança — 🟢/🟡/🔴"*
- [Source: ARCHITECTURE-SPINE.md#AD-6] — BPMN canônico on-disk = BPMN 2.0 XML, toolkit-owned; render é derivação
- [Source: ARCHITECTURE-SPINE.md#AD-1] — propose/commit; toolkit único escritor; skill sem escrita direta
- [Source: ARCHITECTURE-SPINE.md#AD-3] — núcleo hexagonal; core engine-agnostic; adapter pass-through (2.3 não toca o core)
- [Source: ARCHITECTURE-SPINE.md#AD-5] — confiança por fonte verificável; 🟢 resolve a artefato commitado; degradação (não aborta)
- [Source: ARCHITECTURE-SPINE.md#AD-2] — method-pack só estende schema-núcleo; loader/schema → Epic 3 (2.3 não constrói)
- [Source: ARCHITECTURE-SPINE.md Structural Seed + Capability Map] — "FR-10 BPMN · FR-11 gargalos (Júlia) | skill Júlia + pack + toolkit (BPMN XML) | AD-1, AD-2, AD-5, AD-6"; `toolkit/src/bpmn.ts` listado no seed é **3.1** (não construído em 2.3)
- [Source: prd.md §4.4/FR-10] — Júlia gera o diagrama BPMN; consequence: *"BPMN emitido em formato editável (BPMN 2.0 XML + render) em `_process-ai_output/`; elementos sem fonte marcados 🟡/🔴"*
- [Source: prd.md §4.4/FR-11] — Júlia aponta gargalos e handoffs; consequence: *"Gargalos listados com a evidência que os fundamenta (rastreabilidade)"*
- [Source: prd.md §11] — *"Formato de render do BPMN (BPMN 2.0 XML + qual visualização)"* — deferred; §5/NFR-1 + §9/SM-C1 (honestidade; não inflar 🟢); §11 (nome da metodologia TBD; HAP é marca — não usar)
- [Source: epics.md#Story 2.3 + FR Coverage Map] — ACs originais (FR-10/FR-11 full); "FR-10: Epic 1 (mínimo) + Epic 2"; "FR-11: Epic 2"
- [Source: 2-2-miguel-hierarquia-completa.md] — **precedente direto** (mesmo padrão de "aprofundar especialista rascunho → profundo na camada de skill + testes; zero mudança no toolkit"); decisão #1 (profundidade no conteúdo, não tipos novos — manteve `hierarchy`; 2.3 mantém `flow`); decisão #6 (sem mudança no toolkit); padrão propose-por-arquivo + Write-não-heredoc; threading de sha; **Review Findings da 2.2 (2 medium + lições de teste) — codificadas acima como prevenção**
- [Source: 1-6-pipeline-minima-rascunhos.md] — estado 1.6 da Júlia (rascunho markdown, "não emita XML", 🟢 sourcing hierarchy)
- [Source: 1-4-toolkit-confianca-mecanica-ledger.md] — `Claim`/`ClaimSource`/`validateClaims`/ledger; `validateClaims` resolve 🟢 a manifesto; `excerpt` opcional/ignorado; razões de degradação
- [Source: 1-2-toolkit-propose-commit-sha256.md] — `commit()`, `ProposePayload`, `CommitResult`, `sanitizeArtifactType` (kebab), `EXT_BY_TYPE` vazio → `.md`; `content` opaco
- [Source: 1-5-dea-skill-condutora.md] — CLI `process-ai propose|gate|stage|resume|report`, stage/gate IDs canônicos (`modeling`/`gate-3`)
- [Source: code] — `skills/process-ai-julia/SKILL.md` (intro "não BPMN 2.0 XML" `:8-10`; §2 "Não emita XML" `:42-44`; §3 exemplo `:51-65`; artifactType `:75-76`; fronteiras `:78-83`); `skills/process-ai/SKILL.md` §3 (handoff Júlia `:86`; nota fronteira `:89-94`; nota provenance `:117`); `commit.ts:~410`; `confidence.ts:~40,~57,~177-242`; `engine-adapter.ts:~27,~45`; `tests/specialists.test.ts:~27,~61-79`; `tests/e2e-pipeline.test.ts:~166-198`; `tests/miguel-hierarchy.test.ts` (modelo para `julia-flow.test.ts`)
- [External: OMG BPMN 2.0 spec] — BPMN 2.0 XML é o formato de intercâmbio canônico (`.bpmn`); elementos: `definitions/process/startEvent/task/serviceTask/sequenceFlow/gateway(exclusive|parallel)/endEvent`. A 2.3 emite XML canônico; render → deferred.

## Dev Agent Record

### Agent Model Used

GLM-5.1 (via Claude Code, skill `bmad-dev-story`).

### Debug Log References

- **Baseline confirmada (antes de codar):** `node --test tests/*.test.ts` → **177 pass / 0 fail / 0 skipped** (HEAD `9edd593`, pós-2.2).
- **RED-contra-1.6 (TDD):** `node --test tests/julia-flow.test.ts` contra a skill 1.6 atual → test 1 (mecanismo) passou; test 2 (profundidade) **falhou** já na 1ª asserção `/<bpmn:definitions|<bpmn:process/i` (ausente na 1.6, que diz "Não emita XML aqui") — profundeza não autorada, conforme esperado. Regexes validados: nenhum casa trivialmente a skill 1.6.
- **GREEN (pós-T1):** após reescrita da skill → `julia-flow.test.ts` 2/2 pass.
- **Foco T1/T2/T3:** `specialists + skill + e2e-pipeline + julia-flow` → 23/23 pass.
- **T4 final:** suite completa → **179 pass / 0 fail** (177 prévios + 2 novos); `npm run typecheck` (`tsc --noEmit`) limpo; `git status --short -- toolkit/src/` **vazio** (AD-3 verde — nenhum arquivo no core); `import-boundary.test.ts` verde (parte da suite).

### Completion Notes List

- **T1 (skill da Júlia):** `skills/process-ai-julia/SKILL.md` reescrita do rascunho markdown 1.6 para modelagem BPMN completa. §2 roteiro estruturado (limites start/end → `task`/`serviceTask` ancorados nos IDs `A…`/`T…` de Miguel → `sequenceFlow` → `exclusiveGateway`/`parallelGateway` 🟡 → gargalos); §3 **BPMN 2.0 XML canônico** com shape mínimo (`<bpmn:definitions>` + `<bpmn:process isExecutable="false">` + startEvent/task/gateway/sequenceFlow/endEvent, IDs ancorados); §4 claims por elemento (🟢 sourcing `hierarchy` + 🟡 fluxo inferido + 🔴 passo indeterminado + gargalo 🟡 com `reasoning`) + **regra anti-inflação** (🟢 só para nós confirmados na hierarchy). Notes stale corrigidas (removido "não emita XML"/"rascunho"/"fluxo simples"); fronteiras atualizadas (render→deferred AD-6; diagnóstico→Zanoni 2.4; rastreabilidade/excerpt/consolidado→2.5; gates ricos→2.6; schema-núcleo/`bpmn.ts`/`.bpmn`/loader/pack→Epic 3). `artifactType: flow` **mantido** (Decision #1). Strings assertadas pelo `specialists.test.ts` retidas.
- **T2 (condutor):** `skills/process-ai/SKILL.md` §3 — nota de fronteira → "Bento, Miguel e Júlia profundos" (Zanoni→2.4); linha de handoff da Júlia → "fluxo BPMN 2.0 XML" (`artifactType flow` inalterado); nota de provenance verificada (limpa — "Júlia entrega o sha256 de flow ao Zanoni", mantida).
- **T3 (testes):** `tests/julia-flow.test.ts` **NEW** (espelha `miguel-hierarchy.test.ts`): mecanismo (🟢 resolve + 🟢 sha inexistente degrada a 🟡 `unresolved-source` + 🟡 literal isolado do degradado + 🔴) + profundidade da skill (BPMN XML instruído, `sequenceFlow`, gateways, gargalo-com-evidência) + guards `doesNotMatch` ("não emita XML"/"rascunho"/"fluxo simples"). `tests/e2e-pipeline.test.ts` seção Júlia enriquecida (content=BPMN 2.0 XML + 🟡 + 🔴 + gargalo 🟡 com `reasoning`; **contagem permanece 7**, `artifactType flow`). `tests/specialists.test.ts` **sem mudança** (`types: ['flow']` retido; skill reescrita mantém as strings assertadas).
- **T4 (critério implícito):** 179 pass / 0 fail; typecheck limpo; AD-3 verde (zero arquivos em `toolkit/src/`); E2E atualizado passando (7 artefatos, 5 gates, sem órfãos; resume sem duplicação).
- **Decisões registradas:** #1 (um `artifactType flow`, profundidade no conteúdo = BPMN XML); #2 (roteiro autorado na skill, semente do pack); #3 (gargalos = claims 🟡 com evidência em `reasoning`); #4 (toolkit-owned por contrato, não por código); #5 (render → deferred); #6 (zero mudança no toolkit).
- **Prevenção da revisão 2.2 codificada:** (1) 🟢 não inflado — o exemplo âncora só na atividade `A1.1.1.1` confirmada na hierarchy; (2) 🔴 não fabricado — a medida é omitida e o gap declarado no `reasoning`; (3) asserções de profundidade provam **instrução** (falham contra a 1.6); (4) 🟡 literal isolado do 🟡-de-gradado (`e.validated === '🟡' && !e.degradationReason`).

### File List

- `skills/process-ai-julia/SKILL.md` — **MODIFIED** (T1: skill profunda — BPMN 2.0 XML + roteiro + gargalos + claims honestos + notes stale corrigidas + fronteiras).
- `skills/process-ai/SKILL.md` — **MODIFIED** (T2: §3 nota de fronteira + linha de handoff da Júlia).
- `tests/e2e-pipeline.test.ts` — **MODIFIED** (T3: seção Júlia enriquecida com BPMN XML + 🟡/🔴/gargalo + docstring; contagem 7).
- `tests/julia-flow.test.ts` — **NEW** (T3: mecanismo + profundidade da skill + guards de honestidade).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — **MODIFIED** (status 2-3: ready-for-dev → in-progress → review).
- _(Nenhum arquivo em `toolkit/src/**` — AD-3 verde.)_

## Change Log

- **2026-08-02** — Story 2.3 criada (create-story): terceira do Epic 2. Aprofunda a Júlia de rascunho markdown (1.6) para **modelagem BPMN 2.0 XML canônica + gargalos com evidência**. Mantém **um** artifactType `flow` (profundidade no **conteúdo** = BPMN 2.0 XML — Decision #1, espelha 2.2; tipo `bpmn`/`bpmn.ts`/schema → 3.1). Mecanismo AD-5 já existe desde 1.4; **zero mudança no toolkit** (AD-3). Honestidade: 🟢 só onde deriva nominalmente da `hierarchy` confirmada (regra anti-inflação); gargalos = 🟡 com evidência (FR-11); correção das notes stale ("não emita XML"/"rascunho"). Render → deferred (AD-6/PRD §11). Cadeia de provenance limpa: `flow ← hierarchy ← value-chain ← discovery-interview`. **Inteligência da revisão da 2.2 codificada** (2 medium + lições de teste) como prevenção. Mudanças: `skills/process-ai-julia/SKILL.md` (MODIFY), `skills/process-ai/SKILL.md` §3 (MODIFY leve), `tests/e2e-pipeline.test.ts` seção Júlia (MODIFY leve — contagem 7), `tests/julia-flow.test.ts` (NEW). Builda sobre 1.1–2.2 sem reescrever o toolkit; baseline 177 testes + novos. Status → ready-for-dev.
- **2026-08-02** — Story 2.3 implementada (dev-story, GLM-5.1): Júlia profunda. Skill reescrita do rascunho markdown (1.6) para **modelagem BPMN 2.0 XML canônica + gargalos com evidência (FR-11) + claims honestos por elemento** (🟢 sourcing `hierarchy` + 🟡 fluxo inferido + 🔴 passo indeterminado). `artifactType: flow` mantido (profundidade no **conteúdo**, Decision #1; tipo `bpmn`/`bpmn.ts` → Epic 3). **TDD RED-contra-1.6** confirmado antes da reescrita (test 2 falhou em `/<bpmn:definitions|<bpmn:process/i`); GREEN após. Condutor §3 atualizado (Júlia profunda; linha handoff "fluxo BPMN 2.0 XML"). `julia-flow.test.ts` NEW + `e2e-pipeline` seção Júlia enriquecida (contagem 7). **Zero mudança no toolkit** (AD-3 verde). Suite 177 → **179 pass / 0 fail**; `tsc --noEmit` limpo. Prevenção da revisão 2.2 codificada (🟢 não inflado; 🔴 não fabricado; asserções provam instrução; 🟡 literal isolado). Status → **review**.
