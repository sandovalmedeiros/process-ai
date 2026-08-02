---
baseline_commit: 16005c8
---

# Story 2.4: Zanoni profundo — POPs autorados + diagnóstico consolidado

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **leigo**,
I want **o Zanoni profundo — POPs completos (roteiro estruturado autorado, cada POP referenciando as atividades/tarefas da `hierarchy` de Miguel pelos IDs estáveis `A…`/`T…`) + um diagnóstico consolidado (gargalos identificados pela Júlia no `flow`, gaps declarados pelo Miguel, e recomendações), com cada afirmação marcada honestamente (🟢 onde deriva nominalmente do `flow` confirmado, 🟡 onde é inferência/recomendação, 🔴 onde é gap)**,
so that **a padronização deixe de ser "um POP-rascunho único e raso" (1.6) e passe a ser o conjunto canônico de POPs + diagnóstico rastreável que a Déa referencia no resumo de encerramento — herdando a confiança honesta da cadeia de provenance (`pop ← flow ← hierarchy ← value-chain ← discovery-interview`)**.

## Acceptance Criteria

1. **[AC1] Roteiro de padronização completo — não improvisado (FR-12 *intent*)** — **Given** Gate 3 aprovado, estágio `standardization`, e o `flow` (Júlia) + `hierarchy` (Miguel) entregues, **When** Zanoni padroniza, **Then** segue um **roteiro estruturado e completo** que transforma o fluxo em POPs + diagnóstico — **não** improvisado pelo agente, **não** limitado a "um POP-rascunho para uma atividade central" (1.6). O roteiro é **conteúdo autorado na skill da Júlia do Zanoni** (semente do method-pack); *loader*/pack externo é **Epic 3** (3.2/3.3). *(FR-12 intent)*

2. **[AC2] `pop` profundo emitido (FR-12, Decision #1, AD-6)** — **Given** o roteiro, **When** Zanoni propõe, **Then** o `pop` é commitado via `process-ai propose --payload` (AD-1) com **`artifactType: "pop"`** — o `content` (markdown) contém **(a)** POPs completos, cada um referenciando **IDs estáveis `A…`/`T…`** da `hierarchy` de Miguel, e **(b)** o **diagnóstico consolidado (FR-13)** como seção markdown. O `artifactType` **permanece `pop`** (a profundidade está no **conteúdo**, não em um tipo novo — Decision #1, espelha 2.2/2.3). O diagnóstico **NÃO** vira um 8º artefato (contagem permanece **7**). *(FR-12, AD-6)*
   > **Decision #1 (flaggada — leia):** o diagnóstico (FR-13) vive como **conteúdo markdown dentro do `pop`**; `artifactType` **permanece `pop`**. **Motivo (precedente 2.2/2.3):** "profundidade no conteúdo, não em tipos novos"; AD-3 exige zero mudança no toolkit; `tests/e2e-pipeline.test.ts` fixa a contagem em 7; schema-núcleo por tipo é **AD-2 → Epic 3 (3.1)**. **Alternativa considerada e rejeitada (scope creep):** introduzir tipo `pop-diagnostic`/`diagnosis` — adicionaria artifactType, exigiria mudar `SPECIALISTS` (`specialists.test.ts`), a contagem do `e2e-pipeline` (7) e a linha de handoff do condutor, e avançaria sobre 3.1. **Se o dev achar que precisa de um tipo novo ou mudar o toolkit — pare, é 3.1.**

3. **[AC3] Diagnóstico consolidado com evidência (FR-13)** — **Given** o `flow` (com seus gargalos 🟡 da Júlia) e a `hierarchy` (com seus gaps 🔴 do Miguel), **When** Zanoni consolida, **Then** o diagnóstico lista **gargalos, gaps e recomendações** — cada **recomendação** é um claim tipicamente **🟡 (inferencial)** cujo `reasoning` **cita o nó/elemento do `flow`/`hierarchy`** que a motiva; o diagnóstico **cita a contagem do que consolidou** (ex.: "N gargalos, M gaps, K recomendações"). Recomendações são **prescritivas/inferenciais → nunca 🟢** (NFR-1/SM-C1). *(FR-13)*
   > **Fronteira de contagem (anti-colisão com 2.5):** o diagnóstico cita **suas próprias contagens diagnósticas** (o que ele consolidou). A **agregação completa do ledger** ponta-a-ponta (relatório de confiança consolidado) é **FR-16 → story 2.5**. O resumo narrativo de encerramento da Déa é **FR-5 → story 2.6**. Três deliverables distintos — não conflate.

4. **[AC4] Claims honestos por elemento + provenance threading preservado (FR-14, AD-5, NFR-1, FR-3)** — **Given** a padronização, **When** Zanoni monta os `claims`, **Then** **cada elemento significativo do POP tem um claim** com marcador: 🟢 onde o elemento **deriva nominalmente do `flow`** (`source: { artifactType: "flow", sha256: <sha do flow da Júlia> }` que **resolve** ao manifesto — AD-5); 🟡 onde o passo/ferramenta/responsável é **inferido** (elemento não confirmado no flow); 🔴 onde é **gap** (placeholder `<?>` no `reasoning` — **não fabrique** conteúdo concreto e o rotule de 🔴). A cadeia de provenance permanece limpa: `pop ← flow ← hierarchy ← value-chain ← discovery-interview` (Zanoni sourceia **só** o `flow`, nunca `hierarchy`/`value-chain`/`discovery-interview` diretamente — é fonte da Júlia/Bento). Zanoni **entrega** o `sha256` do `pop` à Déa (regressão 1.6/2.1/2.2/2.3 preservada). *(FR-14 full; mecanismo AD-5 já existe desde 1.4)*
   > **Regra operacional anti-inflação (herdada da 2.2/2.3, SM-C1/NFR-1):** o toolkit valida só a **resolução** do manifesto, não a semântica — logo 🟢 só para elementos do POP que mapeiam a **nós confirmados no `flow`**. Passo/ferramenta/responsável estimado = 🟡; gap não determinado = 🔴 com `<?>`. **Nunca** marque 🟢 um elemento fabricado/inferido, nem uma recomendação.

5. **[AC5] Fronteiras respeitadas — zero scope creep (AD-3, AD-6)** — **Given** o escopo de "Zanoni profundo", **Then** a story **NÃO** constrói: **rastreabilidade bidirecional navegável** cross-artefato + verificação de **excerpt** + relatório de confiança **consolidado** (FR-16) (→ **2.5**); **gates ricos** com contagem/lista 🟡/🔴 bloqueando (FR-4/FR-5 *full*) (→ **2.6**); **schema-núcleo** por tipo, `toolkit/src/pop.ts`, extensão proprietária, **loader**/validador de method-pack, extração de roteiro para `method-packs/` (→ **Epic 3**, 3.1/3.2/3.3); novo artifactType `pop-diagnostic`/`diagnosis` (→ **3.1**, Decision #1). E **NÃO adiciona arquivo em `toolkit/src/**`** (AD-3 `import-boundary` permanece verde) — a profundidade é entregue na **camada de skill + testes**, reusando o toolkit estável de 1.1–1.5/2.1/2.2/2.3. *(AD-3, AD-6)*

> **Critério implícito (não-negociável):** a história deixa o sistema "rodável ponta-a-ponta" no escopo dela — `node --test tests/*.test.ts` 100% verde (**179 testes herdados da 1.1–2.3 + novos, zero regressões**), `npm run typecheck` (`tsc --noEmit`) limpo, e o guardrail **AD-3** (`tests/import-boundary.test.ts`) permanece verde (esta story **não adiciona arquivos ao core** `toolkit/src/**`). Um **E2E atualizado** deve passar: Gate 0 → …→ Miguel profundo → Júlia profunda (`flow` = BPMN 2.0 XML) → `gate-4`+`standardization` → **Zanoni profundo**: propõe `pop` com **content = POPs (IDs `A…`/`T…`) + diagnóstico (FR-13)** + claims (🟢 sourcing `flow` resolve + 🟡 inferido/recomendação + 🔴 gap) → ledger não-vazio → `report` → `summary-report` → `resume` sem duplicação (**7 artefatos, 5 gates, sem órfãos**). Não basta "satisfazer os ACs literais".

## Tasks / Subtasks

- [x] **T1 — Aprofundar a skill do Zanoni `skills/process-ai-zanoni/SKILL.md` (AC: #1, #2, #3, #4)**
  - [x] **MODIFY — a skill-fonte hoje é o rascunho 1.6** (~79 linhas; §2 "Produz o POP-rascunho" = **um** POP para **uma** atividade; 1 claim 🟢 + 1 🔴; sem roteiro estruturado; sem cláusula anti-forja de sha). Substituir por skill de **padronização completa**. **Fonte única de verdade** (o adapter a copia byte-a-byte).
  - [x] **Roteiro de padronização completo (AC1):** substituir "Produz o POP-rascunho" por um **roteiro estruturado**: (a) identificar as atividades/tarefas significativas que aparecem no `flow` (âncora nos IDs `A…`/`T…` da `hierarchy`); (b) para cada uma, estruturar um POP completo; (c) consolidar o diagnóstico (gargalos do `flow` + gaps da `hierarchy` + recomendações); (d) emitir claims por elemento. Espelhar o §2 "Roteiro … completo" de Bento/Miguel/Júlia. O roteiro é **conteúdo autorado na skill** (semente do pack; loader → 3.2, extração → 3.3).
  - [x] **POPs completos (AC2/FR-12):** múltiplos POPs como **seções markdown dentro do `content` do `pop`** (um único artefato `pop`), cada POP referenciando os IDs estáveis `A…`/`T…` da hierarchy. **Estrutura mínima do POP fixada na skill** (Decision #3): objetivo, escopo, responsável, passos numerados, insumos/saídas, referência ao ID da hierarchy, marcador por afirmação. **Não** construir schema-núcleo (→ 3.1).
  - [x] **Diagnóstico consolidado (AC3/FR-13):** seção markdown dentro do `content` do `pop` (Decision #1) — gargalos (do `flow`) + gaps (da `hierarchy`) + recomendações; cada recomendação 🟡 com `reasoning` citando o nó do `flow`/`hierarchy`; cita **suas contagens diagnósticas** (NÃO a agregação do ledger — FR-16/2.5).
  - [x] **Claims honestos por elemento (AC4) + regra anti-inflação:** `ProposePayload` de `pop` com `claims[]`: 🟢 sourcing **só** `flow` (resolve, AD-5) para elementos que mapeiam a nós confirmados no flow; 🟡 para passo/ferramenta/responsável inferido e para recomendações; 🔴 para gap (`<?>`, sem fabricar). **Mecanismo AD-5 já existe (1.4); zero mudança no toolkit.** Inclua a **regra anti-inflação operacional** herdada da 2.2/2.3.
  - [x] **ADICIONAR cláusula anti-forja de sha (paridade com Bento/Miguel/Júlia):** "Se o `sha256` do `flow` não chegou, **não invente** a fonte — proponha só 🟡/🔴; 🟢 sem fonte degrada a 🟡 (`unresolved-source`)." (Ausente na 1.6.)
  - [x] **CORRIGIR notes stale (honestidade, NFR-1):** a seção "O que NÃO é do Zanoni" hoje diz *"Relatório de diagnóstico (… FR-13) → 2.4"* e *"POPs completos (… ) → 2.4"* — **ambas stale** (2.4 é esta story). **Absorver** como trabalho do Zanoni e **remover** essas duas deferrals. Atualizar o `description` do frontmatter (Zanoni agora produz **POPs + diagnóstico**, não "POP-rascunho").
  - [x] **Atualizar "O que NÃO é do Zanoni" (fronteiras):** remover os 2 itens satisfeitos (POP completo, diagnóstico). Reter/redirecionar: **rastreabilidade bidirecional navegável** + verificação de **excerpt** + relatório **consolidado** (FR-16) → **2.5**; **gates ricos** → **2.6**; **schema-núcleo** / `pop.ts` / loader / pack → **Epic 3** (3.1/3.2/3.3); fluxo (Júlia) / hierarquia (Miguel).
  - [x] **Preservar (não-regressão 1.6):** frontmatter `name: process-ai-zanoni` + `description` (afinar texto, mantém nome + "standardization" + "não invoque diretamente"); §"Como o Zanoni opera" com **AD-1 declarado estruturalmente** (sem escrita direta; sempre `process-ai propose --payload`); persona ("Pragmático", honesto NFR-1, pt-BR); padrão **Write-não-heredoc** + captura sha + entrega à Déa + remoção do temp.

- [x] **T2 — Atualizar a nota de fronteira do condutor `skills/process-ai/SKILL.md` §3 (AC: #4, #5)**
  - [x] **MODIFY a nota de fronteira:** *"…Zanoni profundo vem na 2.4…"* → atualizar: **Bento, Miguel, Júlia e Zanoni agora são profundos** (descoberta + mapeamento + modelagem BPMN + padronização/diagnóstico completos e rastreáveis); diagnóstico consolidado (FR-13) entregue; gates ricos também Epic 2; method-packs Epic 3.
  - [x] **VERIFICAR a linha de handoff do Zanoni** (`gate-4 | standardization | Zanoni | POP-rascunho | pop`): o `artifactType` **permanece `pop`** (Decision #1) — se a descrição disser "POP-rascunho", atualizar para "POPs + diagnóstico (FR-13)"; **não renomear** o tipo.
  - [x] **VERIFICAR a nota de provenance** ("Zanoni sourceia `flow`" / "Zanoni entrega o sha256 de `pop` à Déa"): **permanece correta** — manter.
  - [x] **Preservar (não-regressão 1.1/1.5/2.1/2.2/2.3):** frontmatter `name: process-ai`; abertura *"Qual processo vamos mapear?"*; `resume`; Gate 0; tabela de gates/estágios canônicos; threading dos shas; encerramento com `report`+`summary-report`; AD-1; `tests/skill.test.ts` verde.

- [x] **T3 — Testes (AC: #1–#5 + AD-1/AD-3/AD-5 + regressão 1.1–2.3)**
  - [x] **`tests/specialists.test.ts` (PROVAVELMENTE SEM MUDANÇA — verificar):** Zanoni **mantém** `types: ['pop']` → o array `SPECIALISTS` **não muda** (Decision #1). As asserções de conteúdo (frontmatter `name: process-ai-zanoni`, persona `Zanoni`, pt-BR, `process-ai propose`, `claims`, marcadores 🟢🟡🔴, "sem escrita direta", artifactType `pop`) continuam válidas **contanto que a skill reescrita retenha essas strings**. *Ação: rodar e confirmar verde; se quebrar, é porque a skill perdeu uma string assertada — restaurar, não afrouxar o teste nem adicionar `types`.*
  - [x] **`tests/e2e-pipeline.test.ts` (MODIFY leve — seção Zanoni):** enriquecer para refletir "Zanoni profundo": (a) o `content` do `pop` → markdown com **POPs (referenciando IDs `A…`/`T…`) + seção de diagnóstico**; (b) os `claims` → manter o 🟢 sourcing `flow` (resolve) + **adicionar um 🟡 (recomendação/passo inferido) e um 🔴 (gap)**. **Contagem permanece 7** (`pop` continua `pop`, diagnóstico é conteúdo) → asserções `artifacts.length === 7` e `types` deepEqual **não mudam**. Ledger não-vazio; resume sem duplicação.
  - [x] **`tests/zanoni-pop.test.ts` (NEW — espelhar `tests/miguel-hierarchy.test.ts`/`julia-flow.test.ts`):** teste focado, **duas seções**:
    - *(Mecanismo — espelhar miguel-hierarchy/julia-flow)*: propor `flow` (fonte) → propor `pop` com 🟢 sourcing `flow` (resolve) + 🟢 com sha inexistente (degrada a 🟡 `unresolved-source`, não aborta) + 🟡 literal (recomendação/passo inferido) + 🔴 (gap); asserir ledger com o 🟢 resolvido e o degradado; asserir relatório sem "zeros honestos". *Drive determinístico via `dispatch(parseArgs([...]), adapter, root)` com `new ClaudeCodeAdapter({ cwd: tmp })` — sem LLM.*
    - *(Profundidade da skill + guards de honestidade — específico do Zanoni)*: ler `skills/process-ai-zanoni/SKILL.md` e asserir propriedades que **NÃO existem na skill 1.6**: (a) a skill **instrui POPs referenciando IDs da hierarchy** (ex.: `/A\d|T\d|hierarchy/i` combinado com `/POP/i` — **falha contra 1.6**); (b) **diagnóstico consolidado** (`/diagn[ió]stico/i` + instrução de evidência/recomendação); (c) **regra anti-inflação** para recomendações (🟡, nunca 🟢); (d) **guards `doesNotMatch`**: a skill **não** contém mais `"Relatório de diagnóstico.*→\s*2\.4"` nem `"POPs completos.*→\s*2\.4"` nem `"rascunho"` (travam as correções do T1 contra regressões). **Disciplina TDD:** rodar a seção 2 contra o texto 1.6 *antes* da reescrita e confirmar que **falha**; se passar inalterada, o teste é fraco — endurecer.
  - [x] **Regressão intocada e verde:** `tests/{scaffold,bootstrap,commit,checkpoint,confidence,report,cli,import-boundary,skill,specialists,e2e-conductor,e2e-pipeline,adapter,bento-discovery,miguel-hierarchy,julia-flow}.test.ts` — **179 testes da 1.1–2.3 inalterados** (exceto `e2e-pipeline`, que enriquece a seção Zanoni). Em especial: `tests/import-boundary.test.ts` (AD-3) verde (**nenhum arquivo novo em `toolkit/src/`**); `tests/julia-flow.test.ts` verde (2.3 intocada); `tests/skill.test.ts` verde após a edição leve do condutor.

- [x] **T4 — Critério implícito (não-negociável)**
  - [x] `node --test tests/*.test.ts` → 100% pass (179 prévios + novos), 0 fail.
  - [x] `npm run typecheck` (`tsc --noEmit`) limpo.
  - [x] AD-3 verde (`toolkit/src/**` intocado — **nenhum** arquivo novo no core; mudança TS só em testes).
  - [x] E2E atualizado passando: …→ Júlia profunda (`flow`) → `gate-4`+`standardization` → **Zanoni profundo** (`pop` = POPs + diagnóstico + 🟢 sourcing `flow` + 🟡 + 🔴) → `report` → `summary-report` → `resume` sem duplicação (7 artefatos, 5 gates, sem órfãos).

## Dev Notes

### O que esta história É (e o que NÃO é) — leia antes de codar

Esta é a **story 2.4 — quarta e última de especialista do Epic 2**. O Epic 1 (1.1–1.6) entregou a fundação e especialistas como rascunhos mínimos — Zanoni produzia **um** POP-rascunho para **uma** atividade, com **um** claim 🟢 sourcing `flow` (+ um 🔴 de exemplo). A **2.1 aprofundou o Bento**; a **2.2 aprofundou o Miguel** (hierarquia completa e rastreável, IDs estáveis — que **esta story ancora**); a **2.3 aprofundou a Júlia** (BPMN 2.0 XML + gargalos com evidência — cujo `flow` é a **fonte** do Zanoni). A **2.4 é onde o Zanoni fica profundo**: **POPs completos (FR-12)** + **diagnóstico consolidado (FR-13)**, com claims honestos por elemento. O **mecanismo AD-5 já existe desde 1.4** (🟢 com `source` que resolve ao manifesto); esta story apenas o **exercita mais ricamente** sobre o `pop` (múltiplos claims por elemento + diagnóstico).

### Escopo — tabela anti-scope-creep

| Pertence a esta story (2.4) | Pertence a histórias futuras — NÃO faça |
|---|---|
| POPs completos, cada um referenciando IDs `A…`/`T…` da `hierarchy` (FR-12) | **Rastreabilidade bidirecional navegável** cross-artefato + verificação de **excerpt** + relatório **consolidado** (FR-16) → **2.5** |
| Diagnóstico consolidado (gargalos do `flow` + gaps da `hierarchy` + recomendações, FR-13) | **Gates ricos** com contagem/lista 🟡/🔴 bloqueando (FR-4/FR-5 *full*) → **2.6** |
| Claims 🟢/🟡/🔴 por elemento de POP, sourceando **`flow`** | **Schema-núcleo** por tipo / `toolkit/src/pop.ts` / loader / pack → **Epic 3** (3.1/3.2/3.3) |
| `artifactType: pop` **inalterado**; diagnóstico como **conteúdo** | Novo artifactType `pop-diagnostic`/`diagnosis` → **3.1** (Decision #1) |

### Paradigma e invariantes binding (cada um limita esta story)

- **AD-1 (Propose/Commit — toolkit é o único escritor):** só `process-ai propose --payload <file.json>`; temp escrito com **Write** (não heredoc de Bash); **sem escrita direta** nas pastas protegidas.
- **AD-3 (Núcleo hexagonal / import-boundary):** `toolkit/src/**` importa só `node:*` + relativos; o guardrail é `tests/import-boundary.test.ts`. Esta story **não cria arquivo em `toolkit/src/`**.
- **AD-5 (Confiança por fonte verificável):** 🟢 exige `source` cujo `sha256` **resolve a um manifesto commitado** (`.process-ai/manifests/<artifactType>-<sha256>.json`); sem fonte → 🟡; não-determinado → 🔴. O **toolkit valida resolução, não semântica** — daí a regra anti-inflação operacional.
- **AD-6 (Formato on-disk canônico toolkit-owned):** o `content` do `pop` é **opaco** para o toolkit (markdown livre; schema-núcleo é Epic 3/3.1). Logo a profundidade é **conteúdo**.
- **NFR-1 / SM-C1 (Honestidade não-inflável):** marcadores obrigatórios; 🟢 exige fonte; **recomendações são inferenciais → 🟡/🔴, nunca 🟢**.

### O código que esta história MODIFICA — leia antes de tocar

- **`skills/process-ai-zanoni/SKILL.md`** — **Estado atual (1.6, ~79 linhas):** rascunho; §2 "Produz o POP-rascunho" = 1 POP para 1 atividade; §3 com 1 claim 🟢 (sourcing `flow`) + 1 🔴; **sem** roteiro estruturado; **sem** cláusula anti-forja de sha; "O que NÃO é" defere POP-completo e diagnóstico **para 2.4**. **O que muda:** reescrita profunda (roteiro + POPs múltiplos + diagnóstico + claims por elemento + regra anti-inflação + cláusula anti-forja + notes stale corrigidas). **Preservar:** `name: process-ai-zanoni`, persona, AD-1 estrutural, pt-BR, padrão Write/propose/captura-sha/entrega-à-Déa/remove-temp, `artifactType: pop`.
- **`skills/process-ai/SKILL.md` §3** — **Estado atual:** nota *"Zanoni profundo vem na 2.4"* + handoff `gate-4 | standardization | Zanoni | POP-rascunho | pop`. **O que muda:** nota → "Zanoni profundo"; descrição do artefato se disser "rascunho". **Preservar:** `artifactType: pop`, tabela de gates, threading dos shas, encerramento `report`+`summary-report`.
- **`tests/e2e-pipeline.test.ts`** — **Estado atual:** seção Zanoni com 1 `pop` (markdown curto) + 1 claim 🟢 sourcing `flow`. **O que muda:** enriquecer `content` (POPs + diagnóstico) e `claims` (+🟡 +🔴); **contagem 7 preservada**. **Preservar:** asserções `artifacts.length === 7`, `types` deepEqual, ledger, resume.
- **`tests/zanoni-pop.test.ts`** — **NEW** (mecanismo + profundidade da skill + guards de honestidade).
- **`toolkit/src/**` · `bin/process-ai.ts` · `toolkit/adapters/claude-code/adapter.ts`** — **NO CHANGE.** Assinaturas consumidas (estáveis): `process-ai propose --payload` → `CommitResult{sha256}`; `Claim{statement,level,source?,reasoning}`; `validateClaims` (AD-5, resolução de manifesto); `confidence-ledger.jsonl` (append-only, idempotente).

### Decisões de implementação

1. **Diagnóstico (FR-13) é conteúdo markdown dentro do `pop`; `artifactType` permanece `pop` (contagem 7).** *Motivo:* precedente 2.2/2.3 ("profundidade no conteúdo, não em tipos novos"); AD-3; `e2e-pipeline` fixa contagem em 7. *Alternativa rejeitada:* tipo `pop-diagnostic`/`diagnosis` (quebraria contagem, `SPECIALISTS`, handoff; scope creep sobre 3.1).
2. **Granularidade/parada do POP:** POPs para as atividades/tarefas significativas que **aparecem no `flow`** (âncora nos IDs `A…`/`T…` da `hierarchy`), consolidados no `content` do `pop`. *Critério de parada:* cobrir o que o `flow` modela (não toda a árvore de Miguel — só o que foi modelado).
3. **Estrutura mínima do POP** (sem schema v1 — Epic 3): objetivo, escopo, responsável, passos numerados, insumos, saídas, referência ao ID da hierarchy, marcador por afirmação. *Autorado na skill como convenção* (o toolkit só hasha bytes).
4. **Recomendações do diagnóstico = 🟡 por padrão** (inferenciais/prescritivas), com `reasoning` citando o nó do `flow`/`hierarchy` que motiva; **nunca 🟢** (NFR-1/SM-C1). O diagnóstico cita **suas próprias contagens** (gargalos/gaps/recomendações por marcador); a agregação completa do ledger é **FR-16 (2.5)**.

### Aprendizados das revisões 2.2/2.3 — prevenção codificada (MUST)

- **🟢 não inflado:** o exemplo 🟢 do Zanoni ancora **só** em elemento do POP que mapeia a **nó confirmado no `flow`** (não inferido/alargado). O toolkit valida resolução do sha, **não** semântica.
- **🔴 não fabricado:** passo 🔴 = placeholder `<?>` (gap declarado no `reasoning`), **nunca** conteúdo concreto rotulado de 🔴.
- **Asserções que provam instrução (TDD RED-contra-1.6):** `tests/zanoni-pop.test.ts` seção 2 deve **falhar** contra a skill 1.6 antes da reescrita; casar **instrução** (não string de exemplo); regex apertado.
- **🟡 literal isolado do degradado:** `entries.find(e => e.validated === '🟡' && !e.degradationReason)`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4] — AC literal ("Given o modelo, When Zanoni gera, Then POPs + diagnóstico").
- [Source: _bmad-output/planning-artifacts/prds/prd-process-ai-2026-08-01#FR-12, FR-13, NFR-1] — FR-12 (POP referencia hierarchy, emitido em `_process-ai_output/`); FR-13 (diagnóstico: gargalos/gaps/recomendações, cita contagem 🟢/🟡/🔴, cada recomendação rastreada a evidência); NFR-1 (honestidade não-inflável).
- [Source: _bmad-output/planning-artifacts/architecture/architecture-process-ai-2026-08-01#AD-1, AD-3, AD-5, AD-6] — invariantes binding.
- [Source: skills/process-ai-zanoni/SKILL.md] — estado 1.6 (rascunho, deferrals "→ 2.4").
- [Source: skills/process-ai/SKILL.md#82-119,122-141] — handoff `gate-4 | standardization | Zanoni | pop`; encerramento `report`+`summary-report`.
- [Source: _bmad-output/implementation-artifacts/2-3-julia-bpmn-xml-gargalos.md#AC4] — "Júlia entrega o sha256 de `flow` ao Zanoni (que em 2.4 sourceará `flow` para o `pop` 🟢)".
- [Source: _bmad-output/implementation-artifacts/2-2-miguel-hierarquia-completa.md#Dev Notes] — IDs `A…`/`T…` estáveis que o Zanoni ancora (FR-12).
- [Source: toolkit/src/confidence.ts#177-242] — mecânica AD-5 (🟢 resolve manifesto; degradação não aborta).

## Dev Agent Record

### Agent Model Used

GLM-5.1 (via Claude Code, skill `bmad-dev-story`).

### Debug Log References

- **Baseline confirmada (antes de codar):** `node --test tests/*.test.ts` → **179 pass / 0 fail** (HEAD `16005c8`, pós-2.3 + code review). `npm run typecheck` limpo. `git status --short -- toolkit/src/` vazio (AD-3).
- **RED-contra-1.6 (TDD):** `node --test tests/zanoni-pop.test.ts` contra a skill 1.6 → teste 1 (mecanismo) passou; teste 2 (profundidade) **falhou** já na 1ª asserção (`/roteiro/i` ausente na 1.6) — profundidade não autorada, conforme esperado.
- **GREEN (pós-T1):** após reescrita da skill → `zanoni-pop.test.ts` 2/2 pass.
- **T4 final:** suite completa → **181 pass / 0 fail** (179 prévios + 2 novos); `npm run typecheck` (`tsc --noEmit`) limpo; `git status --short -- toolkit/` **vazio** (AD-3 verde — nenhum arquivo no core); `import-boundary.test.ts` verde (parte da suite).

### Completion Notes List

- **T1 (skill do Zanoni):** `skills/process-ai-zanoni/SKILL.md` reescrita do rascunho 1.6 (~79 linhas → ~135) para padronização completa. §2 roteiro de padronização estruturado (atividades/tarefas → POPs ancorados nos IDs `A…`/`T…` → diagnóstico); §3 POPs + diagnóstico consolidado (FR-13) como **conteúdo** do `pop` (Decision #1); §4 claims por elemento (🟢 sourcing `flow` + 🟡 inferido/recomendação + 🔴 gap) + regra anti-inflação + cláusula anti-forja de sha. Notes stale corrigidas (removido "rascunho" e as deferrals "→ 2.4"); fronteiras atualizadas (rastreabilidade bidirecional/excerpt/consolidado→2.5; gates ricos→2.6; schema/loader/pack→Epic 3). `artifactType: pop` mantido (Decision #1). Strings assertadas pelo `specialists.test.ts` retidas.
- **T2 (condutor):** `skills/process-ai/SKILL.md` §3 — nota de fronteira → "Zanoni (2.4) agora é profundo" (POPs + diagnóstico consolidado, FR-13); célula da tabela `gate-4` → "POPs + diagnóstico" (`artifactType pop` inalterado); nota de provenance verificada (limpa — "Júlia entrega o sha256 de flow ao Zanoni", mantida).
- **T3 (testes):** `tests/zanoni-pop.test.ts` **NEW** (espelha `julia-flow.test.ts`): mecanismo (🟢 sourcing `flow` resolve + 🟢 sha inexistente degrada a 🟡 `unresolved-source` + 🟡 literal/recomendação + 🔴) + profundidade da skill (roteiro, IDs `A…`/`T…`, diagnóstico consolidado, recomendações 🟡) + guards `doesNotMatch` ("rascunho", "→ 2.4"). `tests/e2e-pipeline.test.ts` seção Zanoni enriquecida (content=POPs A1.1.1.1 + diagnóstico + 🟡 + 🔴; **contagem permanece 7**, `artifactType pop`). `tests/specialists.test.ts` **sem mudança** (`types: ['pop']` retido).
- **T4 (critério implícito):** 179 → **181 pass / 0 fail**; typecheck limpo; AD-3 verde (zero arquivos em `toolkit/src/`); E2E atualizado passando (7 artefatos, 5 gates, sem órfãos; resume sem duplicação).
- **Decisões registradas:** #1 (diagnóstico é conteúdo dentro do `pop`, artifactType `pop` inalterado — contagem 7); #2 (POPs para o que o `flow` modela); #3 (estrutura mínima do POP autorada na skill); #4 (recomendações 🟡, nunca 🟢).
- **Prevenção da revisão 2.2/2.3 codificada:** (1) 🟢 não inflado — exemplo 🟢 ancora só em `A1.1.1.1` confirmado no flow; (2) 🔴 não fabricado — gap declarado no `reasoning`; (3) asserções provam instrução (RED-contra-1.6); (4) 🟡 literal isolado do degradado (`!degradationReason`).

### File List

- `skills/process-ai-zanoni/SKILL.md` — **MODIFIED** (T1: skill profunda — roteiro + POPs completos + diagnóstico + claims honestos + anti-forja sha + notes stale corrigidas + fronteiras).
- `skills/process-ai/SKILL.md` — **MODIFIED** (T2: §3 nota de fronteira + linha de handoff do Zanoni).
- `tests/e2e-pipeline.test.ts` — **MODIFIED** (T3: seção Zanoni enriquecida com POPs + diagnóstico + 🟡/🔴; contagem 7).
- `tests/zanoni-pop.test.ts` — **NEW** (T3: mecanismo + profundidade da skill + guards de honestidade).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — **MODIFIED** (status 2-4: ready-for-dev → in-progress → review).
- _(Nenhum arquivo em `toolkit/src/**` — AD-3 verde.)_

## Change Log

- **2026-08-02** — Story 2.4 implementada (dev-story, GLM-5.1): Zanoni profundo. Skill reescrita do rascunho 1.6 (~79 linhas) para **POPs completos (FR-12, ancorados nos IDs `A…`/`T…` da hierarchy) + diagnóstico consolidado (FR-13)** como conteúdo do `pop` (Decision #1 — `artifactType: pop` inalterado, contagem 7 preservada). Claims honestos por elemento (🟢 sourcing `flow` + 🟡 inferido/recomendação + 🔴 gap) + regra anti-inflação (SM-C1) + cláusula anti-forja de sha. Condutor §3 atualizado (Zanoni profundo; célula tabela "POPs + diagnóstico"). `zanoni-pop.test.ts` **NEW** (RED-contra-1.6 confirmado antes da reescrita; GREEN após) + `e2e-pipeline` seção Zanoni enriquecida (contagem 7). **Zero mudança no toolkit** (AD-3 verde). Suite 179 → **181 pass / 0 fail**; `tsc --noEmit` limpo. Prevenção da revisão 2.2/2.3 codificada (🟢 não inflado; 🔴 não fabricado; asserções provam instrução; 🟡 literal isolado). Status → **review**.
