---
baseline_commit: 4736f354b265bf01eec747db4655221583f2d8d6
---

# Story 2.2: Miguel profundo — hierarquia completa e rastreável

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **leigo**,
I want **o mapeamento de verdade — a Cadeia de Valor de Bento decomposta na hierarquia canônica completa (Macroprocesso → Processo End-to-End → Subprocesso → Atividade → Tarefa), com relação pai/filho explícita e rastreável dentro do artefato e cada nível marcado honestamente (🟢 onde deriva da cadeia, 🟡 onde a decomposição é inferida, 🔴 onde há gap)**,
so that **a decomposição do processo deixe de ser "rascunho de 1–2 níveis" (1.6) e passe a ser uma hierarquia ponta-a-ponta, navegável e honesta — que Júlia (2.3) possa modelar e Zanoni (2.4) possa referenciar em POPs**.

## Acceptance Criteria

1. **[AC1] Roteiro de decomposição completo — não improvisado (FR-9 *intent*)** — **Given** Gate 1 aprovado, estágio `mapping`, e a Cadeia de Valor de Bento entregue, **When** Miguel decompõe, **Then** a decomposição segue um **roteiro estruturado e completo** cobrindo sistematicamente os **cinco níveis canônicos** (`Macroprocesso` → `Processo End-to-End` → `Subprocesso` → `Atividade` → `Tarefa`) para cada macroprocesso da cadeia — **não** improvisada pelo agente, **não** limitada a "1–2 níveis abaixo" (1.6). O roteiro é **conteúdo autorado na skill do Miguel** (semente do method-pack); *loader*/pack externo é **Epic 3** (3.2 loader, 3.3 extração). *(FR-9 full)*

2. **[AC2] Hierarquia completa com pai/filho rastreável dentro do artefato (FR-9)** — **Given** o roteiro e a cadeia de valor, **When** Miguel propõe, **Then** a hierarquia é proposta como um **único artefato `hierarchy`** contendo a **árvore completa dos 5 níveis**, onde a relação **pai/filho é explícita e navegável *dentro* do markdown** — cada nó referencia seu pai e lista seus filhos, com **IDs/nomes estáveis** (ex.: `M1` → `E1.1` → `S1.1.1` → `A1.1.1.1` → `T1.1.1.1.1`) para que especialistas downstream (Júlia 2.3, Zanoni 2.4) e a rastreabilidade bidirecional (2.5) possam ancorar neles. *(FR-9 full)*
   > **Escopo preciso de "rastreável" (leia — evita scope creep):** "pai/filho rastreável" nesta story = **explicitação + IDs estáveis dentro do artefato `hierarchy`** + a **provenance cross-artefato já existente** (claims 🟢 → `value-chain`, AD-5). **NÃO** é construir um **índice/grafo bidirecional navegável** no toolkit — isso é **2.5** (FR-15 full). A estrutura vive no markdown autorado, **não** num schema toolkit-validado (schema-núcleo → 3.1).

3. **[AC3] Níveis incompletos marcados 🟡/🔴 + 🟢 sourcing a `value-chain` (FR-9, AD-5, NFR-1)** — **Given** a decomposição, **When** Miguel monta os `claims`, **Then** **cada ramo/nível decomposto tem um claim** com marcador: 🟢 onde a decomposição **deriva diretamente da Cadeia de Valor** de Bento (`source: { artifactType: "value-chain", sha256: <sha de Bento> }` que **resolve ao manifesto**, validado pelo toolkit — AD-5); 🟡 onde a decomposição é **inferida** (nível estimado, não confirmado pelo leigo); 🔴 onde um nível é **gap** (não determinado). Mix honesto — **nunca inflar 🟢** (SM-C1/NFR-1): é honesto que parte da hierarquia permaneça 🟡/🔴. *(Regra operacional anti-inflação: o toolkit valida só a **resolução** do manifesto, não a semântica — logo apenas níveis cujo conteúdo aparece **nominalmente na `value-chain`** (tipicamente Macroprocesso/E2E) qualificam-se para 🟢 sourcing-a; níveis mais profundos — Subprocesso/Atividade/Tarefa — são tipicamente 🟡 (inferido da decomposição) ou 🔴 (gap), já que a cadeia lista macroprocessos, não tarefas.)* *(FR-9 full; mecanismo AD-5 já existe desde 1.4)*

4. **[AC4] Threading de provenance preservado + nota de fronteira do condutor atualizada (FR-3, AD-5)** — **Given** a ordem canônica inalterada (Bento→Miguel→Júlia; estágios `discovery`→`mapping`→…; gates `gate-1..gate-4`), **When** a Déa faz o handoff, **Then** Miguel **recebe** o `sha256` da `value-chain` de Bento e **entrega** o `sha256` da `hierarchy` à Júlia (que continua sourceando `hierarchy` para o `flow` 🟢 — regressão 1.6/2.1 preservada). A nota de fronteira do condutor (`skills/process-ai/SKILL.md` §3) é atualizada: **Miguel agora é profundo** (hierarquia completa e rastreável); Júlia/Zanoni profundos vêm nas **2.3/2.4**. *(FR-3; a linha do handoff continua listando `hierarchy` — nenhum artifactType novo)*

5. **[AC5] Fronteiras respeitadas — zero scope creep (AD-2, AD-3, AD-6)** — **Given** o escopo de "Miguel profundo", **Then** a story **NÃO** constrói: **índice/grafo de rastreabilidade bidirecional navegável**, verificação de **trecho/excerpt** nem relatório **consolidado** (→ **2.5**); gates **ricos** com contagem/lista bloqueando (→ **2.6**); **schema-núcleo** versionado por tipo (→ **3.1**); method-pack *loader*/validador (→ **3.2**); extração do roteiro para `method-packs/bpmn-sipoc/` (→ **3.3**); BPMN 2.0 XML/gargalos (→ **2.3**); diagnóstico (→ **2.4**). E **NÃO adiciona arquivo em `toolkit/src/**`** (AD-3 `import-boundary` permanece verde) — a profundidade é entregue na **camada de skill + testes**, reusando o toolkit estável de 1.1–1.5. *(AD-2, AD-3, AD-6)*

> **Critério implícito (não-negociável):** a história deixa o sistema "rodável ponta-a-ponta" no escopo dela — `node --test tests/*.test.ts` 100% verde (**175 testes herdados da 1.1–2.1 + novos, zero regressões**), `npm run typecheck` (`tsc --noEmit`) limpo, e o guardrail **AD-3** (`tests/import-boundary.test.ts`) permanece verde (esta story **não adiciona arquivos ao core** `toolkit/src/**`). Um **E2E atualizado** deve passar: Gate 0 → `gate-1`+`discovery` → Bento (entrevista + SIPOC + cadeia) → `gate-2`+`mapping` → **Miguel profundo**: propõe `hierarchy` com árvore completa (🟢 sourcing `value-chain` resolve + 🟡 nível inferido + 🔴 gap) → `gate-3`+`modeling` → Júlia (🟢 sourcing `hierarchy`) → … → ledger não-vazio → `report` → `resume` sem duplicação (**7 artefatos, 5 gates, sem órfãos**). Não basta "satisfazer os ACs literais".

## Tasks / Subtasks

- [x] **T1 — Aprofundar a skill do Miguel `skills/process-ai-miguel/SKILL.md` (AC: #1, #2, #3, #4)**
  - [x] **MODIFY — a skill-fonte hoje é um rascunho mínimo de 1.6** (85 linhas; "1–2 níveis abaixo"; §2 diz literalmente *"rascunho mínimo — a hierarquia completa e rastreável chega na story 2.2"*). Substituir por uma skill de **mapeamento completo**. **Fonte única de verdade** (o adapter a copia byte-a-byte).
  - [x] **Roteiro de decomposição completo (AC1):** substituir a instrução "1–2 níveis abaixo" por um **roteiro estruturado por nível** — para cada macroprocesso da cadeia, decompor recursivamente nos 5 níveis canônicos (`Macroprocesso` → `Processo End-to-End` → `Subprocesso` → `Atividade` → `Tarefa`), com orientação de *como aprofundar* níveis vagos e exemplos do wedge Vendas/PME (lead → qualificação → proposta → fechamento). O roteiro é **conteúdo autorado na skill**; marcar como exceção v1 documentada (semente do method-pack; loader → 3.2, extração → 3.3). Espelhar o §2 "Roteiro de descoberta completo" do Bento (`skills/process-ai-bento/SKILL.md`).
  - [x] **Hierarquia completa com pai/filho rastreável + IDs estáveis (AC2):** instruir o agente a redigir a **árvore completa dos 5 níveis** em markdown, com **relação pai/filho explícita** (cada nó nomeia o pai; cada pai lista os filhos) e **IDs/nomes estáveis** (recomendado: numeração hierárquica `M1`/`E1.1`/`S1.1.1`/`A1.1.1.1`/`T1.1.1.1.1` — o esquema exato é escolha do dev, mas deve ser **estável e referenciável**; justificativa: Júlia 2.3 e Zanoni 2.4 ancoram neles, e o índice bidirecional 2.5 os consome). Definir o *shape* do markdown como **convenção autorada na skill** (não há schema toolkit — `content` é opaco).
  - [x] **Claims por nível — mix honesto (AC3):** `ProposePayload` de `hierarchy` com `claims[]`: decomposições **derivadas da cadeia** = 🟢 com `source: { artifactType: "value-chain", sha256: <sha de Bento> }` (resolve); **inferidas** = 🟡 com `reasoning`; **gap de nível** = 🔴 com `reasoning`. Cada ramo/nível significativo → um claim. **Mecanismo AD-5 já existe (1.4); zero mudança no toolkit.**
  - [x] **CORRIGIR título stale do §3 (encontrado na análise):** o cabeçalho `## 3. Committa com claims (provenance cruzada — primeiro 🟢 do sistema)` (`SKILL.md:47`) está **desatualizado** — o code review da 2.1 corrigiu o *corpo* (linhas 70-71) mas o *título* ainda diz "primeiro 🟢 do sistema", falso pós-2.1 (Bento alcança 🟢 primeiro, sourcing `discovery-interview`). Reescrever para refletir que **Miguel continua a cadeia de 🟢** sourcing `value-chain` (não é o primeiro). *(correção de honestidade, NFR-1)*
  - [x] **Atualizar `artifactType`:** a linha `hierarchy — rascunho da hierarquia` (`:78`) → remover "rascunho" (agora é a hierarquia completa). O artifactType **continua `hierarchy`** (kebab; nenhum tipo novo).
  - [x] **Atualizar "O que NÃO é do Miguel (fronteiras)" (`:80-84`):** remover a linha *"Hierarquia completa e rastreável com pai/filho navegável e níveis incompletos marcados → 2.2"* (agora satisfeita **exceto** a parte "navegável bidirecional"). Reter/redirecionar: fluxo/BPMN → Júlia (**2.3**); POP → Zanoni (**2.4**); **rastreabilidade bidirecional navegável** + verificação de excerpt + relatório consolidado → **2.5**; gates ricos → **2.6**; schema-núcleo/loader/pack → **Epic 3**. **Atenção à distinção:** "pai/filho explícito dentro do artefato" É desta story; "navegável bidirecional cross-artefato" É 2.5.
  - [x] **Preservar (não-regressão 1.6):** frontmatter `name: process-ai-miguel` + `description` (pode afinar o texto, mas mantém o nome e o fato de ser "estágio mapping", "não invoque diretamente"); §"Como o Miguel opera" com **AD-1 declarado estruturalmente** (sem escrita direta; sempre `process-ai propose --payload`); persona ("Metódico", honesto NFR-1, pt-BR); padrão **Write-não-heredoc** + captura de sha + entrega à Déa + remoção do temp.

- [x] **T2 — Atualizar a nota de fronteira do condutor `skills/process-ai/SKILL.md` §3 (AC: #4, #5)**
  - [x] **MODIFY a nota de fronteira (`:89-92`):** *"Epic 2 em curso. Bento (2.1) é profundo… Miguel/Júlia/Zanoni profundos vêm nas 2.2–2.4…"* → atualizar: **Bento e Miguel agora são profundos** (descoberta + mapeamento completos e rastreáveis); Júlia/Zanoni profundos vêm nas **2.3/2.4**; BPMN 2.0 XML/gargalos/diagnóstico/gates ricos também Epic 2; method-packs Epic 3.
  - [x] **VERIFICAR (provavelmente sem mudança) a linha do handoff (`:85`) e a nota de provenance (`:113-114`):** a linha `gate-2 | mapping | Miguel | hierarquia (Macro→Tarefa) | hierarchy` **continua correta** (nenhum artifactType novo — não mexer). A nota *"Miguel → entrega o sha256 de hierarchy à Júlia (Miguel já pode 🟢 sourcing a value-chain de Bento)"* **permanece correta** pós-2.1 — manter. *(Se o texto mencionar "rascunho", ajustar; senão, deixar.)*
  - [x] **Preservar (não-regressão 1.1/1.5/1.6/2.1):** frontmatter `name: process-ai`; abertura *"Qual processo vamos mapear?"*; `resume`; Gate 0; tabela de gates/estágios canônicos; encerramento com `report`+`summary-report`; AD-1; threading dos 3 shas do Bento (2.1); `tests/skill.test.ts` deve permanecer verde.

- [x] **T3 — Testes (AC: #1–#5 + AD-1/AD-3/AD-5 + regressão 1.1–2.1)**
  - [x] **`tests/specialists.test.ts` (PROVAVELMENTE SEM MUDANÇA — verificar):** Miguel **mantém** `types: ['hierarchy']` (`:26`) — **nenhum artifactType novo** → o array `SPECIALISTS` **não muda**. As asserções de conteúdo (frontmatter, persona `Miguel`, pt-BR, `process-ai propose`, `claims`, marcadores 🟢🟡🔴, "sem escrita direta", artifactType `hierarchy`) continuam válidas **contanto que a skill reescrita retenha essas strings** (são núcleo — retenha). O teste "exatamente as 5 skills" (`:155-171`) **não muda**. *Ação: rodar e confirmar verde; se quebrar, é porque a skill perdeu uma string assertada — restaurar, não afrouxar o teste.*
  - [x] **`tests/e2e-pipeline.test.ts` (MODIFY leve — `:135-153`):** na seção Miguel, **enriquecer** para refletir "Miguel profundo": (a) o `content` do `hierarchy` → uma árvore multi-nível real com IDs estáveis + relação pai/filho explícita (em vez do one-liner atual `:137`); (b) os `claims` → manter o 🟢 sourcing `value-chain` (resolve) + o 🟢 com `NONEXISTENT_SHA` (degrada a 🟡 `unresolved-source`) + o 🟡 (inferido) e **adicionar um 🔴 (gap de nível)** para demonstrar "níveis incompletos marcados 🔴". **Contagem permanece 7** (nenhum artefato novo) → as asserções `cp.artifacts.length === 7` (`:217`) e `types` deepEqual (`:211-216`) **não mudam**. Atualizar o comentário de cabeçalho (`:13-14`) para citar **2.2: Miguel profundo**. Resume: 7 artefatos, 5 gates (`:247-256`).
  - [x] **`tests/miguel-hierarchy.test.ts` (NEW — espelhar `tests/bento-discovery.test.ts`):** teste focado, **duas preocupações**:
    - *(Mecanismo — espelhar `bento-discovery.test.ts`)*: propor `value-chain` (fonte) → propor `hierarchy` com 🟢 sourcing `value-chain` (resolve) + 🟢 com sha inexistente (degrada a 🟡 `unresolved-source`, não aborta) + 🟡 (nível inferido) + 🔴 (gap); asserir ledger com o 🟢 resolvido e o degradado; asserir relatório sem "zeros honestos". *Drive determinístico via `dispatch(parseArgs([...]), adapter, root)` com `new ClaudeCodeAdapter({ cwd: tmp })` — sem LLM.*
    - *(Profundidade da skill + guards de honestidade — específico do Miguel)*: ler `skills/process-ai-miguel/SKILL.md` (via padrão `sourceSkillPath`/`REPO_ROOT` do `tests/specialists.test.ts`) e asserir propriedades que **NÃO existem na skill 1.6 atual** — prova que a profundidade foi autorada de fato: (a) **IDs de nó estáveis** (ex.: `/M\d+\.?\d*\s*[-/]?\s*E\d+\.\d+/` ou a frase literal `IDs estáveis`) **ou** instrução explícita de **pai/filho** (`/pai.?filho|filho.*pai/` — **sem** o alternativo `→`, que já existe em 1.6 `:42` e tornaria a asserção trivial; os 5 nomes canônicos de nível **não bastam** — já estão em 1.6). **Disciplina:** rodar a asserção contra o texto 1.6 *antes* da reescrita e confirmar que ela **falha**; se passar inalterada, o teste é fraco — endurecer. (b) **Guards de honestidade (travam as correções do T1):** `assert.doesNotMatch(content, /primeiro 🟢 do sistema/, "título stale §3 corrigido (2.2)")` e `assert.doesNotMatch(content, /rascunho mínimo/i, "sem 'rascunho' no artifactType (2.2)")` — regressão contra reedições futuras.
  - [x] **Regressão intocada e verde:** `tests/{scaffold,bootstrap,commit,checkpoint,confidence,report,cli,import-boundary,skill,specialists,e2e-conductor,e2e-pipeline,adapter,bento-discovery}.test.ts` — **175 testes da 1.1–2.1 inalterados** (exceto `e2e-pipeline`, que enriquece a seção Miguel). Em especial: `tests/import-boundary.test.ts` (AD-3) verde (**nenhum arquivo novo em `toolkit/src/`**); `tests/skill.test.ts` verde após a edição leve do condutor; `tests/bento-discovery.test.ts` verde (2.1 intocada).

- [x] **T4 — Critério implícito (não-negociável)**
  - [x] `node --test tests/*.test.ts` → 100% pass (175 prévios + novos), 0 fail.
  - [x] `npm run typecheck` (`tsc --noEmit`) limpo.
  - [x] AD-3 verde (`toolkit/src/**` intocado — **nenhum** arquivo novo no core; mudança TS só em testes).
  - [x] E2E atualizado passando: …→ Miguel profundo (hierarquia completa com 🟢 sourcing `value-chain` + 🟡 + 🔴) → Júlia (regressão 🟢 sourcing `hierarchy`) → resume sem duplicação (7 artefatos, 5 gates, sem órfãos).

## Dev Notes

### O que esta história É (e o que NÃO é) — leia antes de codar

Esta é a **story 2.2 — segunda do Epic 2** (Documentação Completa e Honesta do Processo). O Epic 1 (1.1–1.6) entregou a **fundação determinística** e os **especialistas como rascunhos mínimos** — Miguel produzia uma `hierarchy` **rasa** ("1–2 níveis abaixo"), com **um** claim 🟢 sourcing `value-chain` e o restante 🟡. A **2.1 aprofundou o Bento** (entrevista persistida + SIPOC + cadeia completos com 🟢). A **2.2 é onde Miguel fica profundo**: decomposição **completa dos 5 níveis canônicos**, relação **pai/filho explícita e rastreável dentro do artefato** (com IDs estáveis), e **níveis incompletos marcados honestamente** (🟡 inferido / 🔴 gap).

**O mecanismo-chave (leia — é o que dá valor à story):** AD-5 diz que 🟢 exige uma fonte cuja referência **resolve a um artefato já commitado**. Miguel **já podia 🟢** desde 1.6 (sourcing `value-chain`); a 2.1 registrou isso e corrigiu a referência stale. Em **2.2, Miguel exercita esse mecanismo ricamente sobre a árvore completa** — múltiplos claims (um ramo/nível significativo cada), 🟢 onde deriva da cadeia, 🟡 onde infere, 🔴 onde é gap. **Isso é honesto** (SM-C1/NFR-1). E é entregue **inteiramente na camada de skill** — **zero mudança no toolkit** (o mecanismo AD-5 já existe desde 1.4; 2.2 apenas o exercita mais profundamente sobre o `hierarchy`).

**Não construa aqui (scope creep — cada item pertence a outra story):**

| Pertence a 2.2 (esta) | Pertence a histórias futuras — NÃO faça |
|---|---|
| Roteiro de decomposição **completo** (conteúdo autorado na skill do Miguel) | **Loader/validador** de method-pack, `.process-ai/config` declarando pack → **3.2** |
| Hierarquia **completa** dos 5 níveis com **pai/filho explícito + IDs estáveis** dentro do artefato | **Índice/grafo de rastreabilidade bidirecional navegável** + verificação de **excerpt** + relatório **consolidado** → **2.5** |
| Claims 🟢 (sourcing `value-chain`) + 🟡 (inferido) + 🔴 (gap) por nível | **Schema-núcleo** versionado por tipo → **3.1** (AD-2) |
| Correção do título stale §3 ("primeiro 🟢 do sistema") + nota de fronteira do condutor | Gates **ricos** (contagem+lista 🟡/🔴 bloqueando) → **2.6** |
| `artifactType: 'hierarchy'` (inalterado — profundidade no conteúdo, não em tipos novos) | BPMN 2.0 XML, gargalos → **2.3**; diagnóstico → **2.4** |
| (sem mudança no toolkit — reusa commit/validateClaims de 1.2/1.4) | **Extrair** o roteiro para `method-packs/bpmn-sipoc/prompts/` → **3.3** |

> **Fronteira 2.2 ↔ 2.x/Epic 3 (não-negociável):** a 2.2 leva **Miguel** ao nível "mapeamento completo e rastreável dentro do artefato" (5 níveis + pai/filho + IDs estáveis + marcadores honestos). A **rastreabilidade bidirecional navegável cross-artefato** é **2.5** — não construa índice/grafo no toolkit. O roteiro é **conteúdo na skill** (semente do method-pack) — **não** construir loader/pack (Epic 3).

> **Distinção "rastreável" (precisa — leia):** a AC2 diz *"pai/filho rastreável"*. Interpretação correta: (a) **dentro do artefato `hierarchy`** — pai/filho **explícito + IDs estáveis** no markdown autorado (ESTA story); (b) **cross-artefato** — o link unidirectional já existente `claims[].source → value-chain` via AD-5 (já funciona desde 1.4). **NÃO** inclui (c) índice/grafo **bidirecional navegável** no toolkit com "remover fonte → rebaixar dependentes" — isso é **2.5** (FR-15 full; `confidence.ts:22-25` frontier). Se o dev achar que precisa mudar `confidence.ts`/`commit.ts` para "rastreabilidade" — **pare**, é 2.5.

### Paradigma e invariantes binding (não quebre)

- **AD-1 — Propose/Commit:** toda escrita de artefato passa por `adapter.propose()` → `commit()`; a skill e o CLI **não tocam** `_process-ai_output/`/`.process-ai/` diretamente. Miguel commita a `hierarchy` via `process-ai propose --payload <file.json>` (gravado com a ferramenta **Write**, não heredoc). [Source: ARCHITECTURE-SPINE#AD-1]
- **AD-3 — Núcleo hexagonal:** o core (`toolkit/src/**`) **não é modificado** nesta story. A **única** mudança TS é em **testes** (fora do core) → `tests/import-boundary.test.ts` permanece verde. O adapter (fora do core) **não muda** (a skill do Miguel é editada in place, copiada byte-a-byte como antes). [Source: ARCHITECTURE-SPINE#AD-3]
- **AD-5 — Confiança verificável (mecanismo 1.4, exercitado em 2.2 sobre a árvore completa):** Miguel **propõe** nível+fonte+razão; o toolkit **valida** e grava no ledger. 🟢 exige `source` cujo manifesto existe — **`value-chain` (a fonte única e primária da hierarquia; NÃO sourcear a `discovery-interview` — a hierarquia deriva da cadeia, e a entrevista é fonte do Bento, não do Miguel; manter a cadeia de provenance limpa: `hierarchy ← value-chain ← discovery-interview`)**. Sem fonte → 🟡; não-determinado → 🔴. **Excerpt/nav bidirecional/consolidado → 2.5** (não nesta). `claimId` é toolkit-assigned e determinístico: `hierarchy-<sha>-<index>`. [Source: ARCHITECTURE-SPINE#AD-5; código `confidence.ts:177-242`]
- **AD-2 — Method-pack é conteúdo que estende (NÃO nesta story):** o roteiro fica **autorado na skill**, **não** em `method-packs/`. Loader/schema-núcleo/pack → Epic 3. `method-packs/` hoje contém só `.gitkeep`. [Source: ARCHITECTURE-SPINE#AD-2; decisão #2 da 2.1 / #5 da 1.6]
- **FR-3 — Ordem fixa:** Bento→Miguel→Júlia→Zanoni (estágios `discovery`→`mapping`→`modeling`→`standardization`; gates `gate-1..gate-4`). Miguel vive no estágio `mapping`, gate `gate-2` — **canônico, não renumerar** (o resume depende da ordem). [Source: SPEC#CAP-1/CAP-3, prd §4.1/§4.3]
- **NFR-1 / SM-C1 — Honestidade:** 🟢 **só** com source resolvida (deriva da cadeia); nunca inflar 🟢 para parecer "completo". É honesto que parte da hierarquia permaneça 🟡/🔴. [Source: prd §5/NFR-1, SM-C1]
- **Downstream consome a hierarquia (estabilidade dos IDs importa):** Júlia (2.3) sourceia `hierarchy` para o `flow` 🟢; Zanoni (2.4) referencia atividades/tarefas da hierarquia nos POPs (FR-12). Por isso os **IDs/nomes de nó devem ser estáveis e referenciáveis** — não posicional frágil. [Source: prd §FR-12 consequence; SPEC#CAP-4/CAP-5]

### O código que esta história MODIFICA — leia antes de tocar

_(Não-negociável: ler o estado atual antes de mudar. Fontes: `skills/process-ai-miguel/SKILL.md`, `skills/process-ai/SKILL.md` §3, `tests/specialists.test.ts`, `tests/e2e-pipeline.test.ts`, `tests/bento-discovery.test.ts`.)_

**`skills/process-ai-miguel/SKILL.md` (MODIFY — T1):**
- **Estado atual (1.6):** 85 linhas, rascunho mínimo. §2 "Produz a hierarquia-rascunho" (`:37-45`) instrui *"sugira 1–2 níveis abaixo"* e declara *"rascunho mínimo — a hierarquia completa e rastreável chega na story 2.2"* (`:39-40`). Níveis canônicos listados (`:42`). §3 "Committa com claims (provenance cruzada — primeiro 🟢 do sistema)" (`:47`) — **título stale** (ver abaixo); o corpo (`:56-74`) tem um exemplo de `ProposePayload` com 2 claims (um 🟢 sourcing `value-chain` + um 🟡) e instrui Write-não-heredoc + captura sha + remoção temp; as linhas 70-71 já foram corrigidas pela 2.1 (Miguel continua a cadeia, Bento já 🟢). `artifactType: hierarchy — rascunho` (`:76-78`). Fronteiras (`:80-84`) apontam *"Hierarquia completa… → 2.2"*.
- **O que muda:**
  - §2 → **roteiro de decomposição completo** (5 níveis, por macroprocesso da cadeia, com aprofundamento + exemplos Vendas/PME) — espelhar o §2 do Bento.
  - **Novo bloco "Produz a hierarquia completa e rastreável"** — árvore dos 5 níveis em markdown com **pai/filho explícito + IDs estáveis**; definir o shape como convenção autorada (ex.: headings aninhados `## M1.`/`### E1.1`/`#### S1.1.1` + listas de atividades/tarefas, cada nó nomeando o pai).
  - §3 → **claims por nível**: 🟢 sourcing `value-chain` (resolve) + 🟡 (inferido) + 🔴 (gap); **reescrever o título stale** ("primeiro 🟢 do sistema" → "Miguel continua a cadeia de 🟢 sourcing `value-chain`").
  - `artifactType` → remover "rascunho".
  - Fronteiras → remover o item satisfeito; reter BPMN→2.3, POP→2.4, **bidirecional navegável + excerpt + consolidado → 2.5**, gates ricos → 2.6, schema/loader/pack → Epic 3.
- **Preservar:** frontmatter (`name`/`description` — pode afinar texto, mantém nome + "mapping" + "não invoque diretamente"); §"Como o Miguel opera" (AD-1 estrutural); persona (Metódico, honesto, pt-BR); padrão Write-não-heredoc + captura sha + entrega à Déa + remoção temp.
- **Atenção:** é a **fonte única de verdade** — o adapter a copia byte-a-byte. `tests/specialists.test.ts` faz asserções de conteúdo sobre ela; **retenha** todas as strings assertadas (`process-ai propose`, `claims`, 🟢🟡🔴, `pt-BR`, `Miguel`, "sem escrita direta", `hierarchy`).

**`skills/process-ai/SKILL.md` (MODIFY leve — T2, só §3):**
- **Estado atual:** §3 nota de fronteira (`:89-92`) *"Epic 2 em curso. Bento (2.1) é profundo… Miguel/Júlia/Zanoni profundos vêm nas 2.2–2.4…"*; linha do handoff Miguel (`:85`) `gate-2 | mapping | Miguel | hierarquia (Macro→Tarefa) | hierarchy`; nota de provenance (`:113-114`) *"Miguel → entrega o sha256 de hierarchy à Júlia (Miguel já pode 🟢 sourcing a value-chain de Bento)"*.
- **O que muda:** nota de fronteira atualizada (**Bento e Miguel profundos**; Júlia/Zanoni → 2.3/2.4). A linha do handoff e a nota de provenance **permanecem corretas** — verificar, não reescrever (a menos que mencionem "rascunho").
- **Preservar:** frontmatter `name: process-ai`; §1 Início/resume; §2 Gate 0; tabela canônica gates/estágios; §4 Encerramento; threading dos 3 shas do Bento (2.1); Tom da Déa; AD-1. `tests/skill.test.ts` deve permanecer verde.

**`tests/specialists.test.ts` (VERIFICAR — provavelmente sem mudança):**
- **Estado atual:** `SPECIALISTS` (`:24-29`) com `{ skill: 'process-ai-miguel', persona: 'Miguel', types: ['hierarchy'] }` (`:26`). Loop de conteúdo (`:45-80`) assevera frontmatter/persona/pt-BR/`process-ai propose`/`claims`/🟢🟡🔴/"sem escrita direta"/artifactType. "Exatamente as 5 skills" (`:155-171`).
- **O que muda:** **nada**, contanto que a skill reescrita retenha as strings assertadas. Se quebrar, restaurar a string na skill — **não** afrouxar o teste nem adicionar `types`.

**`tests/e2e-pipeline.test.ts` (MODIFY leve — T3):**
- **Estado atual:** seção Miguel (`:130-153`) propõe `hierarchy` com `content` one-liner (`:137`) + 3 claims (🟢 sourcing `value-chain` resolve + 🟢 `NONEXISTENT_SHA` degrada + 🟡); asserção de **7 artefatos** (`:217`); `types` deepEqual (`:211-216`); resume 7/5 (`:247-256`); comentário de cabeçalho (`:13-14`).
- **O que muda:** enriquecer `content` (árvore multi-nível + IDs + pai/filho) e `claims` (adicionar um 🔴 de gap de nível); **contagem permanece 7** → asserções de contagem/types **não mudam**. Atualizar comentário de cabeçalho (cita 2.2).

**`tests/bento-discovery.test.ts` (NO CHANGE — é o MODELO para o novo `miguel-hierarchy.test.ts`):**
- Leia e replique a estrutura: helper `propose()` (Write temp → `dispatch(parseArgs(['propose','--payload',p]), adapter, root)` → parse `CommitResult`), `runJson()`, `NONEXISTENT_SHA = 'a'.repeat(64)`, tmpdir + `finally { fs.rm }`, leitura/parse do ledger, asserções `validated`/`degradationReason`/`source.sha256`.

**`toolkit/src/**` · `bin/process-ai.ts` · `toolkit/adapters/claude-code/adapter.ts` (NO CHANGE):**
- A 2.2 **consome** APIs estáveis, não as reescreve. Assinaturas relevantes (já estáveis):
  - `commit(payload, { root, agent }): Promise<CommitResult>` — `commit.ts:~410`. `claims?` validados via `validateClaims`; ledger atualizado.
  - `ProposePayload { artifactType: string; content: unknown; claims?: Claim[] }`, `CommitResult { sha256, artifactPath, manifestPath }` — `engine-adapter.ts:~27,45`. **`content` é opaco** (`unknown`) — a árvore da hierarquia é markdown hashed por SHA-256, **sem** schema toolkit.
  - `Claim { claimId?, statement, level: '🟢'|'🟡'|'🔴', source?, reasoning }`; `ClaimSource { artifactType, sha256, excerpt? }` — `confidence.ts:~40,57`. **`excerpt` é opcional e ignorado na validação** (verificação de trecho → 2.5).
  - `validateClaims(claims, root)` resolve 🟢 a manifesto (`.process-ai/manifests/<type>-<sha>.json` via `lstat`+`isFile`, rejeita symlink/dir) — `confidence.ts:~177`. Razões de degradação: `missing-source` | `malformed-source` | `unresolved-source`. **Degradar NÃO aborta commit; só `level` inválido aborta.**
  - `sanitizeArtifactType` aceita kebab `^[a-z0-9]+(-[a-z0-9]+)*$` → `hierarchy` é válido; `EXT_BY_TYPE = {}` → `.md`.
  - CLI: `process-ai propose --payload <file.json>` → imprime `CommitResult` JSON (com `sha256`). **Não há flag `--agent`** (defer 1.6); o `artifactType` distingue o produtor; provenance registra `agent: "claude-code"`.

**Layout resultante (delta em negrito):**
```text
skills/process-ai-miguel/SKILL.md   # MODIFY: roteiro completo + hierarquia completa c/ pai/filho + IDs estáveis + claims 🟢/🟡/🔴 + título §3 corrigido (T1)
skills/process-ai/SKILL.md          # MODIFY leve: §3 nota de fronteira (Miguel profundo) (T2)
tests/e2e-pipeline.test.ts          # MODIFY leve: seção Miguel enriquecida (árvore + 🔴) — contagem 7 (T3)
tests/miguel-hierarchy.test.ts      # NEW: mecanismo (🟢 resolve/degrada + 🟡 + 🔴) + profundidade da skill (5 níveis + pai/filho) (T3)
# NENHUM arquivo novo em toolkit/src/**  (AD-3 verde; import-boundary verde)
# No root da sessão (gerado pelo toolkit — sem mudança de layout):
_process-ai_output/hierarchy/<sha>.md
```

## Decisões de implementação (registre as escolhas na Completion Notes)

1. **Mantém um único artifactType `hierarchy` (profundidade no conteúdo, não em tipos).** A AC2 exige a "hierarquia completa" — entregue como **um** artefato `hierarchy` contendo a árvore dos 5 níveis, em vez de artefatos por nível (`macroprocessos`, `e2e`, …). **Motivo:** espelha o padrão do Bento (um `sipoc`, um `value-chain`); mantém `specialists.test.ts` `types: ['hierarchy']` inalterado; minimiza churn no `e2e-pipeline` (contagem permanece 7); mantém AD-3 verde trivialmente. **Alternativa considerada e rejeitada:** artefatos por nível — adicionaria artifactTypes, exigiria mudar `SPECIALISTS`/e2e/types, e não há ganho (a árvore é uma unidade coesa). [Source: padrão 2.1; `specialists.test.ts:26`]

2. **Roteiro de decomposição autorado na skill (não em method-pack).** A AC1 exige roteiro "completo e estruturado", mas o loader é 3.2 e a extração é 3.3 (`method-packs/` hoje é só `.gitkeep`). Construir loader/pack aqui seria scope creep de Epic 3. Portanto o roteiro é **conteúdo autorado na skill do Miguel** (semente canônica do futuro pack), satisfazendo o *intent* de AC1. Espelha a decisão #2 da 2.1 (roteiro do Bento). **Flag para o usuário confirmar.**

3. **"rastreável" = pai/filho explícito + IDs estáveis dentro do artefato (+ provenance cross-artefato já existente).** A AC2 diz "pai/filho rastreável" mas a rastreabilidade **bidirecional navegável** cross-artefato é **2.5** (`confidence.ts:22-25` frontier). Em 2.2, "rastreável" significa: (a) pai/filho **explícito + IDs estáveis** no markdown da `hierarchy` (ESTA story); (b) o link unidirectional `claims[].source → value-chain` (AD-5, já funciona). **NÃO** construir índice/grafo bidirecional no toolkit. **Decisão registrada para evitar scope creep.**

4. **IDs/nomes de nó estáveis e referenciáveis.** Recomenda-se numeração hierárquica (`M1`/`E1.1`/`S1.1.1`/`A1.1.1.1`/`T1.1.1.1.1`) — o esquema exato é do dev, mas deve ser **estável** (não posicional frágil), porque Júlia (2.3), Zanoni (2.4, FR-12) e o índice bidirecional (2.5) ancoram neles. [Source: prd §FR-12 consequence]

5. **Correção do título stale §3 (honestidade).** `SKILL.md:47` ainda diz "primeiro 🟢 do sistema" — falso pós-2.1 (Bento alcança 🟢 primeiro). A 2.1 corrigiu o corpo (70-71) mas não o título. 2.2 corrige o título. Não é inflar (SM-C1): 🟢 só com source resolvida.

6. **Nenhuma mudança no toolkit/adapter/CLI (AD-3).** Toda a profundidade é entregue na camada de skill + testes. Se o dev achar que precisa mudar `commit.ts`/`confidence.ts`/`adapter.ts`/`bin/process-ai.ts` — **pare**, é scope creep (provável 2.5 ou Epic 3).

## Padrões de teste estabelecidos (espelhar — não reinventar)

Herdados da 1.1–2.1:
- `node:test` + `node:assert/strict`; tmpdir via `fs.mkdtemp(os.tmpdir())`; `finally { fs.rm(..., { recursive: true, force: true }) }`.
- Skill-fonte é única fonte de verdade: asserções de **conteúdo** + cópia **byte-a-byte** via `installSkills` (padrão `tests/skill.test.ts`/`specialists.test.ts`).
- E2E via `dispatch(parseArgs([...]), adapter, root)` com `new ClaudeCodeAdapter({ cwd: tmp })` — drive determinístico, sem LLM (padrão `tests/e2e-pipeline.test.ts`).
- Para "simular Miguel": escrever o `ProposePayload` num temp, chamar `propose`, **ler o `sha256`** do `CommitResult`, reusar como `source` no claim (aqui: `value-chain` → `hierarchy`). Asserir ledger via `report` e/ou leitura direta de `confidence-ledger.jsonl`.
- Padrão de **degradação**: claim 🟢 com sha inexistente → `unresolved-source` → 🟡 (não aborta) — já exercitado pelo Miguel no `e2e-pipeline`; o novo `miguel-hierarchy.test.ts` o replica focado (espelhar `bento-discovery.test.ts`).
- AD-3 guardrail: `tests/import-boundary.test.ts` varre `toolkit/src/**` — esta story **não adiciona** arquivo lá, fica verde automaticamente.

## Convenções (do spine, herdadas da 1.1–2.1)

- Naming `kebab-case`; skills prefixadas `process-ai-*`; artifactTypes kebab (`hierarchy`); IDs globais estáveis (FR-n, AD-n, CAP-n) — nunca renumerados.
- Node 24 LTS; TS + ESM; imports `.ts` com extensão explícita (type-stripping nativo).
- Sem deps de runtime no core (AD-3 allowlist: só `node:` + relativos).
- Erros acionáveis em pt-BR. Pastas protegidas: escrita só em `_process-ai_output/` + `.process-ai/` (via toolkit).
- **Marca registrada:** "HAP" é marca da P-Excellence — **nunca** usar; Miguel usa só os nomes canônicos de nível, sem nome de metodologia/brand (nome da metodologia própria ainda é TBD — prd §11). [Source: prd §11/addendum §2]

## Project Structure Notes

- **Incremental sobre a fundação 1.1–2.1:** nenhuma camada determinística é reescrita. A 2.2 **aprofunda a skill do Miguel** (conteúdo + pai/filho + IDs estáveis + claims por nível) e **ajusta a nota de fronteira do condutor**. Cada peça consome APIs estáveis do toolkit.
- **Alvo ≠ framework:** skills são instaladas no projeto-alvo (`.claude/skills/`); artefatos commitados no `cwd` do projeto-alvo. Testes injetam tmpdir.
- **`.gitignore` da 1.1 já cobre** `_process-ai_output/` e `.process-ai/`.
- **Baseline:** HEAD `4736f35` (pós 2.1 `done`); suite **175 pass / 0 fail**. A 2.2 builda sobre esse estado; confirmar a baseline verde antes de codar (`node --test tests/*.test.ts` → 175 pass).
- **Estado atual do repo:** `method-packs/` contém **apenas `.gitkeep`** (confirme antes de codar — se houver conteúdo, é trabalho de outra story). `skills/process-ai-miguel/SKILL.md` é o rascunho de 85 linhas (1.6) — confirmar antes de reescrever.

## References

- [Source: SPEC.md#CAP-3] — mapeamento (Miguel): *"O processo é decomposto na hierarquia (macro → tarefa) com relações rastreáveis."*; success = *"Hierarquia commitada; níveis incompletos marcados."* *(FR-9)*
- [Source: SPEC.md#CAP-1] — condução orquestrada por Déa (ordem fixa Bento→Miguel→Júlia→Zanoni)
- [Source: glossary.md] — *"Macroprocesso / Processo End-to-End / Subprocesso / Atividade / Tarefa — níveis da hierarquia de processos, do macro ao micro."*; *"Cadeia de Valor — topo da hierarquia"*; *"Rastreabilidade — ligação bidirecional afirmação↔fonte"*; *"Marcador de confiança — 🟢 verificável / 🟡 inferido / 🔴 gap"*
- [Source: ARCHITECTURE-SPINE.md#AD-1] — propose/commit; toolkit único escritor; skill sem escrita direta
- [Source: ARCHITECTURE-SPINE.md#AD-3] — núcleo hexagonal; core engine-agnostic; adapter pass-through (2.2 não toca o core)
- [Source: ARCHITECTURE-SPINE.md#AD-5] — confiança por fonte verificável; 🟢 resolve a artefato commitado; degradação `missing/malformed/unresolved-source` (não aborta)
- [Source: ARCHITECTURE-SPINE.md#AD-2] — method-pack só estende schema-núcleo; loader/schema → Epic 3 (2.2 não constrói)
- [Source: ARCHITECTURE-SPINE Capability Map] — "FR-9 hierarquia | skills/process-ai-miguel + pack prompts | AD-2"
- [Source: prd.md §4.3/FR-9] — Miguel estrutura a hierarquia (Macro→…→Tarefa); §FR-12 consequence (POPs referenciam atividades/tarefas); §5/NFR-1 · §9/SM-C1 (honestidade; não inflar 🟢); §11 (nome da metodologia TBD; HAP é marca — não usar)
- [Source: epics.md#Story 2.2 + FR Coverage Map] — ACs originais (FR-9 full); "FR-9: Epic 1 (mínimo) + Epic 2"
- [Source: 2-1-bento-entrevista-sipoc-cadeia-valor.md] — **precedente direto** (mesmo padrão de "aprofundar especialista rascunho → profundo na camada de skill + testes; zero mudança no toolkit"); decisão #2 (roteiro autorado na skill, semente do pack); decisão #6 (sem mudança no toolkit); padrão propose-por-arquivo + Write-não-heredoc; threading de sha; Change Log 2.1 (corrigiu `skills/process-ai-miguel/SKILL.md:70-71` — Miguel continua a cadeia de 🟢)
- [Source: 1-6-pipeline-minima-rascunhos.md] — estado 1.6 do Miguel (rascunho mínimo, "1–2 níveis", 🟢 sourcing value-chain); decisão #5 (roteiro inline, extração → 3.3)
- [Source: 1-4-toolkit-confianca-mecanica-ledger.md] — `Claim`/`ClaimSource`/`validateClaims`/ledger; `validateClaims` resolve 🟢 a manifesto (`confidence.ts:177-242`); `excerpt` opcional/ignorado; razões de degradação
- [Source: 1-2-toolkit-propose-commit-sha256.md] — `commit()`, `ProposePayload`, `CommitResult`, `sanitizeArtifactType` (kebab), `EXT_BY_TYPE` vazio → `.md`; `content` opaco
- [Source: 1-5-dea-skill-condutora.md] — CLI `process-ai propose|gate|stage|resume|report`, stage/gate IDs canônicos (`mapping`/`gate-2`)
- [Source: code] — `skills/process-ai-miguel/SKILL.md` (§2 rascunho `:37-45`; §3 título stale "primeiro 🟢" `:47`, corpo `:56-74`, linhas 70-71 já corrigidas; artifactType `:76-78`; fronteiras `:80-84`); `skills/process-ai-bento/SKILL.md` §2 roteiro completo (modelo); `skills/process-ai/SKILL.md` §3 (handoff `:82-87`; nota fronteira `:89-92`; nota provenance `:113-114`); `commit.ts:~410`; `confidence.ts:~40,~57,~177-242,~22-25 frontier (bidirecional→2.5)`; `engine-adapter.ts:~27,~45`; `tests/specialists.test.ts:~24-29,~45-80,~155-171`; `tests/e2e-pipeline.test.ts:~130-153,~211-217,~247-256`; `tests/bento-discovery.test.ts` (modelo para `miguel-hierarchy.test.ts`)
- [External: https://code.claude.com/docs/en/skills.md] — skill `name` = slash-invocável; skills de projeto exigem workspace trust

## Dev Agent Record

### Agent Model Used

glm-5.1

### Debug Log References

- **Baseline confirmada antes de codar** (HEAD `4736f35`): `node --test tests/*.test.ts` → **175 pass / 0 fail**.
- **RED (disciplina TDD "falha contra 1.6"):** `node --test tests/miguel-hierarchy.test.ts` rodado contra a skill 1.6 *inalterada* → teste de mecanismo (AC2/AC3) **passa** (comportamento do toolkit, independe da skill); teste de profundidade da skill (AC1/AC2) **falha** em `assert.match(/IDs estáveis/i)` (skill rasa não tem IDs estáveis; falharia também em `E\d+\.\d+`, no guard `primeiro 🟢 do sistema` e no guard `rascunho mínimo`) → prova que as asserções não são triviais.
- **GREEN T1:** após reescrever `skills/process-ai-miguel/SKILL.md` → `node --test tests/miguel-hierarchy.test.ts tests/specialists.test.ts` → **14/14 verdes** (skill reteve todas as strings assertadas).
- **GREEN T2:** `node --test tests/skill.test.ts` → **8/8** (condutor não-regredido pela edição do §3).
- **GREEN T3:** `node --test tests/e2e-pipeline.test.ts` → verde (contagem **7** preservada; ledger 🟢/🟡/🔴 + degradação `unresolved-source` íntegros).
- **T4 final:** `node --test tests/*.test.ts` → **177 pass / 0 fail** (175 + 2 novos); `npm run typecheck` (`tsc --noEmit`) limpo; AD-3 verde (`import-boundary` passou; **nenhum** arquivo em `toolkit/src/**`).

### Completion Notes List

**Resumo da implementação (story 2.2 — Miguel profundo):**

- **T1 (AC1/AC2/AC3/AC4) — `skills/process-ai-miguel/SKILL.md` reescrita** (rascunho 1.6 de 85 linhas → skill de mapeamento completo):
  - **Roteiro de decomposição completo (AC1):** §2 substituiu "1–2 níveis abaixo" por um roteiro estruturado por nível — para cada macroprocesso da cadeia, decompor recursivamente nos **5 níveis canônicos** (M→E→S→A→T) com orientação de *como aprofundar* e wedge Vendas/PME. Marcado como roteiro **autorado na skill** (semente do method-pack; loader → 3.2, extração → 3.3).
  - **Hierarquia completa + rastreável (AC2):** §3 define a árvore dos 5 níveis em markdown com **pai/filho explícito** (cada nó nomeia o pai) e **IDs estáveis** (esquema `M1`/`E1.1`/`S1.1.1`/`A1.1.1.1`/`T1.1.1.1.1`), com convenção de shape autorada (headings aninhados + listas) e exemplo completo. "rastreável" = pai/filho explícito + IDs estáveis **dentro do artefato** (+ provenance cross-artefato `claims[].source → value-chain` já existente); **não** construiu índice/grafo bidirecional (→ 2.5).
  - **Claims por nível — mix honesto (AC3):** §4 com um claim por ramo/nível: 🟢 sourcing **só** `value-chain` (resolve, AD-5) + 🟡 (inferido) + 🔴 (gap). Regra operacional anti-inflação documentada (só níveis nominalmente na cadeia — tipicamente Macro/E2E — qualificam-se para 🟢; níveis profundos tipicamente 🟡/🔴).
  - **Honestidade (AC3/correções):** título stale §3 "primeiro 🟢 do sistema" → "Miguel continua a cadeia de 🟢 sourcing `value-chain`" (Bento alcança 🟢 primeiro desde 2.1). `artifactType: hierarchy` sem "rascunho". Provenance desembolada: 🟢 sourceia **só** `value-chain` (cadeia limpa `hierarchy ← value-chain ← discovery-interview`).
  - **Fronteiras atualizadas (AC5):** removido o item "hierarquia completa → 2.2" (satisfeito); retidos BPMN→2.3, POP→2.4, **bidirecional navegável + excerpt + consolidado → 2.5**, gates ricos → 2.6, schema/loader/pack → Epic 3; mantida a proibição de mudar o toolkit/CLI.
  - **Preservado:** frontmatter (`name: process-ai-miguel`, description refinada mantendo "mapping"/"não invoque diretamente"); §"Como o Miguel opera" (AD-1 estrutural, `sem escrita direta`); persona Metódico/Honesto/pt-BR; padrão Write-não-heredoc + captura sha + entrega à Déa + remoção do temp. Todas as strings assertadas pelo `specialists.test.ts` retidas.

- **T2 (AC4/AC5) — `skills/process-ai/SKILL.md` §3:** nota de fronteira atualizada de "Bento (2.1) é profundo… Miguel/Júlia/Zanoni profundos vêm nas 2.2–2.4" → **"Bento (2.1) e Miguel (2.2) são profundos"** (descoberta + mapeamento completos e rastreáveis); Júlia/Zanoni → 2.3/2.4. Linha do handoff (`gate-2 | mapping | Miguel | hierarchy`) e nota de provenance verificadas — **permanecem corretas** (nenhum artifactType novo, sem "rascunho").

- **T3 (AC1–AC5 + AD-1/AD-3/AD-5) — Testes:**
  - `tests/specialists.test.ts`: **sem mudança** — verde (a skill reescrita reteve `types: ['hierarchy']` e todas as strings assertadas; não afrouxado nem adicionado `types`).
  - `tests/e2e-pipeline.test.ts` (MODIFY leve): seção Miguel enriquecida — `content` virou árvore multi-nível real (M1/E1.1/S1.1.1/A1.1.1.1/T1.1.1.1.1 com pai/filho) e `claims` ganharam um **🔴 de gap de nível**; **contagem permanece 7** (nenhum artifactType novo) → asserções de count/types deepEqual inalteradas. Comentário de cabeçalho cita 2.2.
  - `tests/miguel-hierarchy.test.ts` (NEW — espelha `bento-discovery.test.ts`): (1) **mecanismo** — value-chain → hierarchy com 🟢 sourcing value-chain (resolve) + 🟢 com `NONEXISTENT_SHA` (degrada a 🟡 `unresolved-source`) + 🟡 + 🔴; ledger e relatório assercionados; (2) **profundidade da skill + guards de honestidade** — `IDs estáveis` + `E\d+\.\d+` + `T\d+(\.\d+){2,}` (provam a árvore completa) + `doesNotMatch(/primeiro 🟢 do sistema/)` e `doesNotMatch(/rascunho mínimo/i)` (travam as correções do T1) + não-regressão das strings do `specialists.test.ts`.

- **T4 (critério implícito):** `node --test tests/*.test.ts` = **177 pass / 0 fail** (175 herdados + 2 novos); `npm run typecheck` limpo; **AD-3 verde** (zero arquivos em `toolkit/src/**`); E2E atualizado passando ponta-a-ponta (Miguel profundo → Júlia sourcing `hierarchy` 🟢 → resume sem duplicação, 7 artefatos, 5 gates, sem órfãos).

- **Decisões registradas (confirmadas na implementação):** (1) único artifactType `hierarchy` — profundidade no conteúdo, não em tipos novos; (2) roteiro autorado na skill (semente do pack; loader/pack → Epic 3); (3) "rastreável" = pai/filho explícito + IDs estáveis dentro do artefato (bidirecional navegável → 2.5); (4) IDs estáveis hierárquicos `M1`/`E1.1`/…; (5) correção do título stale §3 (honestidade); (6) **zero mudança no toolkit/adapter/CLI** (AD-3). **Nome da metodologia própria não usado** (TBD; HAP é marca de terceiros — não usada).

### File List

- `skills/process-ai-miguel/SKILL.md` — MODIFY (roteiro completo + hierarquia completa c/ pai/filho + IDs estáveis + claims 🟢/🟡/🔴 + título §3 corrigido + artifactType sem "rascunho" + fronteiras) (T1)
- `skills/process-ai/SKILL.md` — MODIFY leve (§3 nota de fronteira: Bento e Miguel profundos) (T2)
- `tests/e2e-pipeline.test.ts` — MODIFY leve (seção Miguel enriquecida: árvore multi-nível + 🔴; contagem 7) (T3)
- `tests/miguel-hierarchy.test.ts` — NEW (mecanismo 🟢 resolve/degrada + 🟡 + 🔴; profundidade da skill: IDs estáveis + guards de honestidade) (T3)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFY (2-2: ready-for-dev → in-progress → review; bookkeeping do dev-story)

## Change Log

- **2026-08-02** — Story 2.2 criada (create-story): segunda do Epic 2. Aprofunda o Miguel de rascunho mínimo (1.6) para mapeamento completo e rastreável — roteiro de decomposição completo (5 níveis canônicos Macro→Tarefa), hierarquia completa com **pai/filho explícito e IDs estáveis dentro do artefato**, e claims por nível (🟢 sourcing `value-chain` + 🟡 inferido + 🔴 gap). Mantém **um** artifactType `hierarchy` (profundidade no conteúdo, não em tipos novos). Mecanismo AD-5 já existe desde 1.4; **zero mudança no toolkit** (AD-3). Correção de honestidade: título stale §3 (`SKILL.md:47` "primeiro 🟢 do sistema") → corrigido (Miguel continua a cadeia de 🟢 sourcing `value-chain`; Bento alcança 🟢 primeiro desde 2.1). Roteiro autorado na skill (semente do method-pack; loader → 3.2, extração → 3.3). "rastreável" = pai/filho explícito + IDs estáveis dentro do artefato (+ provenance cross-artefato já existente); **NÃO** inclui índice bidirecional navegável → 2.5. Fronteiras: rastreabilidade bidirecional navegável/excerpt/consolidado → 2.5; gates ricos → 2.6; BPMN XML/gargalos/diagnóstico → 2.3/2.4; schema/loader/pack → Epic 3. Mudanças: `skills/process-ai-miguel/SKILL.md` (MODIFY), `skills/process-ai/SKILL.md` §3 nota de fronteira (MODIFY leve), `tests/e2e-pipeline.test.ts` seção Miguel (MODIFY leve — contagem 7), `tests/miguel-hierarchy.test.ts` (NEW). Builda sobre 1.1–2.1 sem reescrever o toolkit; baseline 175 testes + novos.
- **2026-08-02** — Story 2.2 validada (validate-create-story, revisão adversarial independente). Veredito: *yes-with-fixes*. Forças confirmadas: line-refs exatos, strings assertadas do `specialists.test.ts` completas, enriquecimento do E2E provadamente seguro (contagem 7), `skill.test.ts` não-regredido pela edição do condutor, fronteira de escopo correta, interpretação de "rastreável" arquitecturalmente certa. **4 correções aplicadas (C1+E1+E2+E3):** (C1) asserção de profundidade da skill endurada para **falhar contra a 1.6** (o regex `/→/` casava trivialmente a skill inalterada → provava nada; agora exige IDs estáveis ou pai/filho explícito + disciplina "falha contra 1.6"); (E1) provenance desembolada — 🟢 da hierarquia sourceia **só** `value-chain` (removida a sugestão de `discovery-interview`, que quebraria a cadeia hierarchy←value-chain←entrevista); (E2) AC3 ganhou regra operacional anti-inflação (só Macro/E2E, que estão nominalmente na cadeia, qualificam-se para 🟢; níveis profundos tipicamente 🟡/🔴 — o toolkit valida resolução, não semântica); (E3) `miguel-hierarchy.test.ts` ganhou guards `doesNotMatch(/primeiro 🟢 do sistema/)` e `(/rascunho mínimo/i)` que travam as correções de honestidade do T1 contra regressões. Polimento O1/O2 ("85→~84 linhas", AC2 Given) não aplicado.
- **2026-08-02** — Story 2.2 implementada (dev-story, modelo glm-5.1). Miguel aprofundado de rascunho mínimo (1.6) para mapeamento completo e rastreável: roteiro de decomposição completo (5 níveis Macro→Tarefa) + hierarquia completa com pai/filho explícito e **IDs estáveis** (`M1`/`E1.1`/`S1.1.1`/`A1.1.1.1`/`T1.1.1.1.1`) + claims por nível (🟢 sourcing **só** `value-chain` / 🟡 inferido / 🔴 gap) + regra anti-inflação. **TDD:** novo `tests/miguel-hierarchy.test.ts` confirmado **RED contra a skill 1.6** (mecanismo passava; asserções de profundidade falhavam) antes do GREEN. Correções de honestidade aplicadas: título stale §3 ("primeiro 🟢 do sistema") corrigido; "rascunho mínimo" removido do artifactType; guards `doesNotMatch` travam ambas contra regressões. **Zero mudança no toolkit/adapter/CLI (AD-3)** — profundidade entregue na camada de skill + testes. Validação final: `node --test tests/*.test.ts` = **177 pass / 0 fail** (175 + 2 novos); `npm run typecheck` limpo; AD-3 (`import-boundary`) verde; E2E atualizado passando (7 artefatos, 5 gates, sem órfãos). Arquivos: `skills/process-ai-miguel/SKILL.md` (MODIFY), `skills/process-ai/SKILL.md` §3 (MODIFY leve), `tests/e2e-pipeline.test.ts` seção Miguel (MODIFY leve), `tests/miguel-hierarchy.test.ts` (NEW). Status → review.

- **2026-08-02** — Code review adversarial (3 camadas — Blind Hunter + Edge Case Hunter + Acceptance Auditor; commit `8ab577c`) aplicado: **11 patches** (2 medium + 9 low/low-medium), 4 defer (registrados em `deferred-work.md`), 7 dismissed. Acceptance Auditor PASS (AC1–AC5 + AD-3 + 177/177). **Patches medium:** (1) claim-exemplo 🟢 tornado honesto (ancorado só no nominal M1; a decomposição em E1.1 passou a 🟡 — antes inflamava 🟢 com "Lead-to-Close" não-nominal); (2) nó 🔴 de gap representado como placeholder `<?>` (antes a Tarefa era fabricada "Aplicar critério BANT" e marcada 🔴 — contradizia "não invente o nível"). **Low:** regex do teste `{2,}`→`{4,}` (exige 5 segmentos de Tarefa); isolamento do 🟡 literal do 🟡 degradado; asserção de roteiro (`/decomponha recursivamente/`); remoção de "tem 3 atividades" (árvore tem 1); fallback de `value-chain` ausente; "ordinal da cadeia"→M1; regra pai/filho relaxada (filho nomeia pai; estrutura aninhada mostra filhos); wording "não posicional frágil" definido; tempo verbal do forward-ref (ancorarão/consumirá). Arquivos: `skills/process-ai-miguel/SKILL.md`, `tests/e2e-pipeline.test.ts`, `tests/miguel-hierarchy.test.ts`. Validação: `node --test` = **177 pass / 0 fail**; `tsc --noEmit` limpo. **Nota:** o Blind Hunter citou linhas inexistentes de `miguel-hierarchy.test.ts` (222 linhas; citou ~362–538) — substância verificada contra o código real. Status → done.

## Review Findings

Code review adversarial (3 camadas: Blind Hunter + Edge Case Hunter + Acceptance Auditor; baseline `4736f35`, escopo 2.2, commit `8ab577c`, review mode `full`). **Acceptance Auditor: PASS** (AC1–AC5 + correções de honestidade mandatórias + AD-3 verde + 177/177 + typecheck limpo, confirmados independentemente). Triagem abaixo — severidade por consequência no consumidor principal (o agente Miguel seguindo a skill + consumers downstream).

### Patch (a corrigir)

- [x] [Review][Patch] **(medium) Exemplo de claim 🟢 infla confiança e contraria a regra anti-inflação** — o claim-exemplo "M1 (Vendas) se decompõe em E1.1 (Lead-to-Close)" é marcado 🟢, mas "Lead-to-Close" não aparece nominalmente na cadeia (só "Vendas"); a regra anti-inflação (:110-114) restringe 🟢 a conteúdo nominal na `value-chain`. O toolkit só valida resolução do sha → mascara o over-claim semântico. Replicado em `tests/miguel-hierarchy.test.ts:105-109` e `tests/e2e-pipeline.test.ts`. Fix: tornar o exemplo consistente (claim 🟢 ancorado só no nominal M1; decomposição em E1.1 = 🟡) ou apertar a regra. `[skills/process-ai-miguel/SKILL.md:110-114,131-135]`
- [x] [Review][Patch] **(medium) Nó 🔴 (gap) instanciado na árvore com ID+label concretos, contradiz "não invente o nível"** — a árvore-exemplo mostra "T1.1.1.1.1. Aplicar critério BANT" (:104) e o claim 🔴 diz que essa mesma tarefa "não está confirmada" (:142-144), contradizendo :79 ("declare o gap; **não** invente o nível"). Agente que copia o exemplo fabrica conteúdo e rotula a fabricação de honesto 🔴. A skill não tem representação canônica de nível-gap. Fix: representar o gap de forma consistente (placeholder `<?> (gap)` ou omitir o nó Tarefa e marcar o nível Atividade como tendo Tarefa indeterminada 🔴). `[skills/process-ai-miguel/SKILL.md:79,104,142-144]`
- [x] [Review][Patch] **(low-medium) Sem orientação quando a `value-chain` não foi commitada** — a skill assume (:40-45) que o sha chega; sem fallback. Mecanicamente todo 🟢 degrada, mas não há playbook para o agente. Fix: 1 linha ("se o sha da `value-chain` não chegou, não invente — proponha só 🟡/🔴 e informe a Déa"). `[skills/process-ai-miguel/SKILL.md:40-45]`
- [x] [Review][Patch] **(low-medium) "herda a posição ordinal da cadeia" (:57-58) contradiz o exemplo `M1. Vendas`** — Vendas é posição 2 em "Atração→Vendas→Entrega", mas o exemplo usa M1. Ambiguidade não reconciliada. Fix: clarificar/dropar "ordinal da cadeia" (M1 = 1º macroprocesso decomposto é a leitura natural). `[skills/process-ai-miguel/SKILL.md:57-58,100]`
- [x] [Review][Patch] **(low-medium) Regex do teste casa só 3 segmentos, não 5 (Tarefa)** — `/T\d+(\.\d+){2,}/` casa `T1.1.1` (3 segmentos = profundidade Subprocesso); não enforce os 5 segmentos que o comentário (:191) alega provar. Fix: `{4,}` (ou `{4}`). `[tests/miguel-hierarchy.test.ts:191-196]`
- [x] [Review][Patch] **(low-medium) `includes('🟡')` não isola o 🟡 literal do 🟢 degradado** — a asserção (:155) é satisfeita pelo 🟢 com sha inexistente (degradado a 🟡 via `unresolved-source`, :149-151) OU pelo 🟡 literal (S1.1.1, :117); não isola a preservação do 🟡 literal. Fix: asserir o 🟡 literal pelo seu `statement` (S1.1.1). `[tests/miguel-hierarchy.test.ts:117,149-151,155]`
- [x] [Review][Patch] **(low) "cada pai lista seus filhos" (:86) é regra bidirecional, mas o exemplo demonstra só filho→pai** — agentes copiam o exemplo (unidirecional, :100-107). Fix: relaxar a regra para "cada nó nomeia seu pai" (suficiente — filhos são reconstruíveis) ou adicionar listas-de-filhos ao exemplo. `[skills/process-ai-miguel/SKILL.md:86,100-107]`
- [x] [Review][Patch] **(low) Claim 🟡 "tem 3 atividades" (:137) contradiz a árvore (1 atividade sob S1.1.1)** — exemplo numericamente inconsistente (:102-107 mostra só A1.1.1.1); agentes emitem claims que deturpam o próprio artefato. Fix: alinhar a contagem ou remover o número. `[skills/process-ai-miguel/SKILL.md:102-107,137]`
- [x] [Review][Patch] **(low) "não posicional frágil" (:90) contradiz o scheme posicional recomendado (M1/E1.1/…); "frágil" indefinido** — Fix (wording): dropar ou definir "frágil". (As preocupações mais profundas de sort/prefixo do scheme → Defer abaixo.) `[skills/process-ai-miguel/SKILL.md:89-91]`
- [x] [Review][Patch] **(low) Forward-ref no presente deveria ser futuro** — "Júlia em 2.3 e Zanoni em 2.4 ancoram nestes IDs" (:87-88) e "sourceia a `hierarchy` para o `flow` 🟢" (:159-160) no presente, mas 2.3/2.4 não estão deep (hoje Júlia só referencia o sha, não os IDs). Fix de tempo verbal ("ancorarão"). `[skills/process-ai-miguel/SKILL.md:87-88,159-160]`
- [x] [Review][Patch] **(low) Asserções de "profundidade da skill"/"núcleo preservado" casam tokens/exemplos, provam presença não instrução** — `/IDs estáveis/i`, `/E\d+\.\d+/` e os `includes(...)` (:180-220) casam strings do exemplo, não instruções; easily satisfied. `specialists.test.ts` é o guard real das strings. Hardening opcional. `[tests/miguel-hierarchy.test.ts:180-220]`

### Defer (pré-existente / story futura — registrado em `deferred-work.md`)

- [x] [Review][Defer] **Scheme de IDs: sort lexical no 10º irmão (M1,M10,M2); prefixo "E1.1"⊂"E1.10" → match por substring casa pai errado; contrato de ancoragem downstream sub-especificado** — deferred, pré-existente; nenhum consumer atual parseia/sorta IDs (Júlia 2.3 não deep; content opaco; índice bidirecional → 2.5). `[skills/process-ai-miguel/SKILL.md:89-91,100-107]`
- [x] [Review][Defer] **Content opaco: referência de pai órfão (`pai: X` indefinido) e divergência bidirecional pai/filho passam sem checagem** — deferred; validação estrutural é 2.5/3.1 (schema). `[skills/process-ai-miguel/SKILL.md:93,100-107]`
- [x] [Review][Defer] **🟢 com `source.artifactType`≠`value-chain` é aceito mecanicamente; 🟡/🔴 com campo `source` é gravado no ledger — "sourceia só value-chain"/"não inclua source em 🟡/🔴" são só prosa** — deferred; comportamento pré-existente do toolkit (`confidence.ts`), não causado pela 2.2; enforcement = mudança no toolkit = scope creep (story futura). `[toolkit/src/confidence.ts]`
- [x] [Review][Defer] **Marcadores desacoplados da árvore (a árvore não mostra 🟡/🔴 por nó)** — deferred; marcação por-nó é enhancement de 2.5 (AC3 põe marcadores nos `claims`, in-spec para 2.2). `[skills/process-ai-miguel/SKILL.md:97-108,129-148]`

### Dismissed como ruído (7)

roteiro-vs-gap (o escape hatch "(ou declarar 🟡/🔴 quando não for possível determinar…)" já existe em :54-55); reasoning "boilerplate" (adequado — explica 🟡 como inferido); `_payloadCounter` shared state (padrão pré-existente em `bento-discovery`/`e2e-pipeline`, latente só — node:test é sequencial); 5 níveis canônicos fechados (by-design per `glossary.md`); floresta de raízes M (by-design — múltiplos macroprocessos = múltiplas raízes); validação de granularidade semântica (content opaco por design → 3.1); guard `/rascunho mínimo/i` vs `/rascunho/i` (a palavra sumiu do arquivo inteiro; cosmético).

> **Nota de qualidade dos hunters:** o Blind Hunter citou linhas de `tests/miguel-hierarchy.test.ts` inexistentes (o arquivo tem **222 linhas**; ele citou ~362–538) — suas refs de linha desse teste são não-confiáveis. A substância foi verificada contra o código real; as refs da `SKILL.md` (185 linhas) e as do Edge Case Hunter para o teste (`:117`, `:149-151`, `:155`, `:191-196`) estão corretas.
