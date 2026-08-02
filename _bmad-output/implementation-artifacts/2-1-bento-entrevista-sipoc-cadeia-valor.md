---
baseline_commit: de850385618efd73592ce8cac6e3412679b498c4
---

# Story 2.1: Bento profundo — entrevista + SIPOC + Cadeia de Valor

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **leigo**,
I want **uma descoberta de verdade — entrevista guiada por um roteiro completo (não improvisado), com a entrevista persistida e dela derivados um SIPOC completo e uma Cadeia de Valor completa, cada campo com marcador de confiança e fonte verificável**,
so that **a documentação do processo deixe de ser "rascunho inferido" (1.6) e passe a ser descoberta real e rastreável — com afirmações 🟢 sustentadas pela entrevista commitada, e não mais só 🟡/🔴**.

## Acceptance Criteria

1. **[AC1] Entrevista guiada por roteiro completo — não improvisada (FR-6)** — **Given** Gate 0 aprovado e estágio `discovery`, **When** Bento conduz a entrevista, **Then** as perguntas seguem um **roteiro de descoberta completo e estruturado** — cobrindo sistematicamente cada letra do SIPOC (Fornecedores, Entradas, Processo, Saídas, Clientes) e a Cadeia de Valor (macroprocessos) — **não** improvisadas pelo agente. O roteiro é conteúdo **autorado na skill do Bento** (semente do method-pack); o *loader*/pack externo é **Epic 3** (3.2 loader, 3.3 extração). *(FR-6 full)*

2. **[AC2] Entrevista persistida + SIPOC completo, cada campo com marcador e fonte (FR-7, AD-1, AD-5, NFR-1)** — **Given** a entrevista conduzida, **When** Bento propõe, **Then**:
   - (a) a entrevista é **persistida como artefato commitado** (`artifactType: "discovery-interview"`, markdown estruturado por bloco de pergunta/resposta) **antes** do SIPOC — é a fonte que habilita 🟢;
   - (b) o **SIPOC completo** (Fornecedores/Entradas/Processo/Saídas/Clientes, cada um com seu conteúdo) é commitado via `process-ai propose` com `claims: Claim[]`;
   - (c) **cada campo tem marcador** 🟢/🟡/🔴: campos **confirmados na entrevista** são 🟢 com `source: { artifactType: "discovery-interview", sha256: <sha da entrevista> }` que **resolve a manifesto existente** (validado pelo toolkit — AD-5); inferidos 🟡; gaps 🔴. **Bento finalmente alcança 🟢 legitimamente** (1.6 só permitia 🟡/🔴). *(FR-7 full)*

3. **[AC3] Cadeia de Valor completa, itens inferidos marcados (FR-8, AD-5)** — **Given** a entrevista persistida (`discovery-interview` commitada, sha conhecido), **When** Bento propõe a Cadeia de Valor, **Then** é commitada via `propose` com `claims`: macroprocessos **confirmados** 🟢 (sourcing a `discovery-interview`); **inferidos** 🟡 com `reasoning`; o `sha256` da cadeia é **entregue ao Miguel** (permanece a fonte para a `hierarchy`). *(FR-8 full)*

4. **[AC4] Threading de provenance atualizado — Bento entrega 3 shas (FR-3, AD-5)** — **Given** a nova ordem interna do estágio `discovery` (entrevista → SIPOC → cadeia), **When** a Déa faz o handoff ao Miguel, **Then** o condutor instrui passar os **três** `sha256` (`discovery-interview`, `sipoc`, `value-chain`) ao Miguel — este continua sourceando a `value-chain` para 🟢 na hierarquia (regressão 1.6 preservada). A premissa 1.6 *"Bento só produz 🟡/🔴 — a entrevista não é um artefato commitado"* é **substituída**: a entrevista **passa a ser** artefato commitado, e Bento pode 🟢. *(FR-3; evolução honesta da fronteira 1.6→2.1)*

5. **[AC5] Fronteiras respeitadas — zero scope creep (AD-2, AD-3, AD-6)** — **Given** o escopo de "Bento profundo", **Then** a story **NÃO** constrói: method-pack *loader*/validador (→ **3.2**), schema-núcleo (→ **3.1**), extração do roteiro para `method-packs/bpmn-sipoc/` (→ **3.3**), verificação de **trecho/excerpt** nem rastreabilidade **bidirecional navegável** nem relatório **consolidado** (→ **2.5**), gates ricos (→ **2.6**), BPMN 2.0 XML (→ **2.3**). E **NÃO adiciona arquivo em `toolkit/src/**`** (AD-3 `import-boundary` permanece verde) — a profundidade é entregue na **camada de skill + testes**, reusando o toolkit estável de 1.1–1.5. *(AD-2, AD-3)*

> **Critério implícito (não-negociável):** a história deixa o sistema "rodável ponta-a-ponta" no escopo dela — `node --test tests/*.test.ts` 100% verde (**174 testes herdados da 1.1–1.6 + novos, zero regressões**), `npm run typecheck` (`tsc --noEmit`) limpo, e o guardrail **AD-3** (`tests/import-boundary.test.ts`) permanece verde (esta story **não adiciona arquivos ao core** `toolkit/src/**` — a única mudança TS é em testes). Um **E2E atualizado** deve passar: Gate 0 → `gate-1`+`discovery` → Bento **persiste a entrevista** → propõe `sipoc` com claim 🟢 sourcing `discovery-interview` (manifesto resolve) + um claim 🟡 + um 🔴 → propõe `value-chain` (🟢 sourcing entrevista) → `gate-2`+`mapping` → Miguel (regressão: 🟢 sourcing `value-chain`) → … → ledger não-vazio com 🟢 (incl. o novo 🟢 de Bento) → `report` → `resume` sem duplicação. Não basta "satisfazer os ACs literais".

## Tasks / Subtasks

- [x] **T1 — Aprofundar a skill do Bento `skills/process-ai-bento/SKILL.md` (AC: #1, #2, #3, #4)**
  - [x] **MODIFY** — a skill-fonte hoje é um **rascunho mínimo** de 1.6 (roteiro inline de 5+1 perguntas; produz só 🟡/🔴). Substituir por uma skill de **descoberta completa**. **Fonte única de verdade** (o adapter a copia byte-a-byte).
  - [x] **Roteiro de descoberta completo (AC1):** substituir as 5 perguntas-sketch + 1 de cadeia por um **roteiro estruturado por bloco** — um bloco por letra do SIPOC (Fornecedores/Entradas/Processo/Saídas/Clientes) + um bloco de Cadeia de Valor (macroprocessos) — com orientação de *como aprofundar* respostas vagas (exemplos do wedge Vendas/PME: *lead*, qualificação, proposta, fechamento). O roteiro é **conteúdo autorado na skill**; marcar como exceção v1 documentada (semente do method-pack; loader → 3.2, extração → 3.3).
  - [x] **Persistir a entrevista (AC2a — o coração da story):** instruir o agente a **commitar a entrevista primeiro** como `artifactType: "discovery-interview"` (markdown estruturado por bloco pergunta→resposta, em pt-BR) via `process-ai propose --payload <file.json>` (Write-não-heredoc), **capturando o `sha256`** do `CommitResult`. Esta é a **fonte** que habilita 🟢.
  - [x] **Produzir o SIPOC completo (AC2b,c):** após a entrevista commitada, montar o `ProposePayload` de `sipoc` com `claims[]` — campos confirmados na entrevista = 🟢 com `source: { artifactType: "discovery-interview", sha256: <sha capturado> }`; inferidos = 🟡 com `reasoning`; não-determinados = 🔴. **Atualizar a regra 1.6** ("Não proponha 🟢 aqui") → "🟢 é agora **permitido e esperado** quando o campo é confirmado na entrevista persistida; sem fonte → 🟡; gap → 🔴."
  - [x] **Produzir a Cadeia de Valor completa (AC3):** `value-chain` com claims análogos (🟢 sourcing `discovery-interview` onde confirmado; 🟡 inferido). Entregar o `sha256` da cadeia (e os demais) à Déa.
  - [x] **Atualizar `artifactTypes`:** adicionar `discovery-interview` ao lado de `sipoc`/`value-chain`.
  - [x] **Atualizar "O que NÃO é do Bento (fronteiras)":** remover as notas *"→ 2.1"* agora satisfeitas; reter hierarquia/fluxo/POP → outros especialistas; roteiro via *loader* de method-pack → 3.2/3.3; excerpt/rastreabilidade/relatório consolidado → 2.5.
  - [x] **Preservar (não-regressão 1.6):** frontmatter `name: process-ai-bento` + `description`; §"Como o Bento opera" com **AD-1 declarado estruturalmente** (sem escrita direta; sempre `process-ai propose --payload`); persona ("Curioso e direto", honesto NFR-1, pt-BR); padrão Write-não-heredoc + captura de sha + remoção do temp.

- [x] **T2 — Atualizar o handoff do condutor `skills/process-ai/SKILL.md` §3 (AC: #4, #5)**
  - [x] **MODIFY §3 (Pipeline):** na tabela de handoff, o row do Bento passa a listar **três** `artifactType`s (`discovery-interview`, `sipoc`, `value-chain`); ajustar "Rascunho produzido" de "SIPOC + cadeia" → "Entrevista persistida + SIPOC + cadeia de valor".
  - [x] **MODIFY a nota de provenance do Bento (AC4):** substituir *"Bento (1º estágio) → entrega os sha256 de sipoc e value-chain ao Miguel. (Bento só produz 🟡/🔴 — a entrevista não é um artefato commitado.)"* por instrução atualizada: Bento **persiste a entrevista** (`discovery-interview`) e **pode 🟢** sourcing-a; entrega os **3 shas** ao Miguel (que continua sourceando `value-chain`).
  - [x] **MODIFY a nota de fronteira:** *"Estes são rascunhos mínimos do Walking Skeleton. Profundidade… é Epic 2."* → atualizar: **estamos no Epic 2**; Bento agora é **profundo** (entrevista + SIPOC + cadeia completos). Manter a indicação de que Miguel/Júlia/Zanoni profundos vêm nas stories 2.2/2.3/2.4 e method-packs no Epic 3.
  - [x] **Preservar (não-regressão 1.1/1.5/1.6):** frontmatter `name: process-ai`; abertura *"Qual processo vamos mapear?"*; `resume`; Gate 0; tabela de gates/estágios canônicos; encerramento com `report`+`summary-report`; AD-1; `tests/skill.test.ts` deve permanecer verde.

- [x] **T3 — Testes (AC: #1–#5 + AD-1/AD-3/AD-5 + regressão 1.1–1.6)**
  - [x] **`tests/specialists.test.ts` (MODIFY):** no array `SPECIALISTS`, atualizar Bento → `types: ['discovery-interview', 'sipoc', 'value-chain']` (linha ~25). As asserções de conteúdo (frontmatter, persona, propose+claims+marcadores, AD-1, artifactTypes) continuam válidas — só cresce o conjunto de types do Bento. O teste "instala exatamente as 5 skills" (linha ~155) **não muda** (nenhuma skill-dir nova; só o conteúdo do Bento é editado).
  - [x] **`tests/e2e-pipeline.test.ts` (MODIFY):** na seção Bento (linha ~93):
    - Adicionar `propose` de `discovery-interview` **antes** do `sipoc`; capturar seu `sha256`.
    - Atualizar os claims do `sipoc`: pelo menos um claim **🟢** com `source: { artifactType: 'discovery-interview', sha256: <sha da entrevista> }` (manifesto resolve); manter um 🟡 e um 🔴.
    - Atualizar `value-chain` com um claim 🟢 sourcing a entrevista.
    - Atualizar a asserção de contagem de artefatos (linha ~194): **6 → 7** (`discovery-interview`, `sipoc`, `value-chain`, `hierarchy`, `flow`, `pop`, `summary-report`).
    - O ledger agora tem 🟢 **inclusive de Bento** (não só de Miguel); as asserções "ao menos um 🟢/🟡/🔴" continuam válidas — idealmente adicionar asserção de que **há um 🟢 cujo source.artifactType === 'discovery-interview'** (prova o novo mecanismo).
    - O `resume` não-duplicação: 7 artefatos, 5 gates.
  - [x] **(Opcional, recomendado) `tests/bento-discovery.test.ts` (NEW):** teste focado no mecanismo — propor `discovery-interview`, depois um `sipoc` com claim 🟢 sourcing-a (resolve) + claim 🟢 com sha **inexistente** (degrada a 🟡, `unresolved-source`, não aborta) + 🟡 + 🔴; asserir ledger com o 🟢 resolvido e o degradado. Espelha o padrão de degradação do `e2e-pipeline` (Miguel), aplicado a Bento. Se preferir, folded no `e2e-pipeline` (T3 anterior).
  - [x] **Regressão intocada e verde:** `tests/{scaffold,bootstrap,commit,checkpoint,confidence,report,cli,import-boundary,skill,e2e-conductor,adapter}.test.ts` — **174 testes da 1.1–1.6 inalterados** (exceto `specialists`/`e2e-pipeline`, que crescem). Em especial: `tests/e2e-conductor.test.ts` (1.5, loop sem especialistas → zeros honestos) permanece verde; `tests/skill.test.ts` permanece verde após a edição do condutor; `tests/import-boundary.test.ts` verde (**nenhum arquivo novo em `toolkit/src/`**).

- [x] **T4 — Critério implícito (não-negociável)**
  - [x] `node --test tests/*.test.ts` → 100% pass (174 prévios + novos), 0 fail.
  - [x] `npm run typecheck` (`tsc --noEmit`) limpo.
  - [x] AD-3 verde (`toolkit/src/**` intocado — só `node:*` + relativos; **nenhum** arquivo novo no core; mudança TS só em testes).
  - [x] E2E atualizado passando: entrevista persistida → SIPOC 🟢 sourcing entrevista → cadeia → Miguel (regressão) → ledger com 🟢 de Bento → resume sem duplicação.

## Dev Notes

### O que esta história É (e o que NÃO é) — leia antes de codar

Esta é a **story 2.1 — primeira do Epic 2** (Documentação Completa e Honesta do Processo). O Epic 1 (1.1–1.6) entregou a **fundação determinística** (porta/adapter, commit SHA-256, checkpoint atômico, confiança+ledger, condutor Déa) e os **especialistas como rascunhos mínimos** — Bento produzia `sipoc`+`value-chain` **majoritariamente 🟡/🔴, sem fontes**, porque *"a entrevista não era um artefato commitado"*. A **2.1 é onde Bento fica profundo**: entrevista **real e persistida**, SIPOC **completo**, Cadeia de Valor **completa** — com 🟢 **legitimamente sustentados** pela entrevista commitada.

**O mecanismo-chave (leia — é o que dá valor à story):** AD-5 diz que 🟢 exige uma fonte cuja referência **resolve a um artefato já commitado** (entrevista persistida *ou* documento). Em 1.6 a entrevista era só conversacional (não commitada) → Bento nunca tinha fonte → só 🟡/🔴. Em **2.1, Bento persiste a entrevista como `discovery-interview`** (commitado, com SHA-256 e manifesto) **antes** de produzir o SIPOC. Agora os campos do SIPOC confirmados na entrevista podem ser 🟢 com `source: { artifactType: 'discovery-interview', sha256 }` — e o toolkit (1.4, `validateClaims`) **resolve** esse source ao manifesto da entrevista. **Isso é honesto** (SM-C1/NFR-1): 🟢 só onde a entrevista confirma; 🟡 onde Bento infere; 🔴 onde é gap. E é entregue **inteiramente na camada de skill** — **zero mudança no toolkit** (o mecanismo AD-5 já existe desde 1.4; 2.1 apenas o exercita com a entrevista como fonte).

**Não construa aqui (scope creep — cada item pertence a outra story):**

| Pertence a 2.1 (esta) | Pertence a histórias futuras — NÃO faça |
|---|---|
| Roteiro de descoberta **completo** (conteúdo autorado na skill do Bento) | **Loader/validador** de method-pack, `.process-ai/config` declarando pack → **3.2** |
| **Persistir a entrevista** (`discovery-interview`) + SIPOC/cadeia completos com 🟢 | **Extrair** o roteiro para `method-packs/bpmn-sipoc/prompts/` → **3.3** |
| 🟢 de Bento sourcing a **entrevista persistida** | Verificação de **trecho/excerpt** + rastreabilidade **bidirecional navegável** + relatório **consolidado** → **2.5** |
| Threading de **3 shas** (entrevista, sipoc, value-chain) ao Miguel | Gates **ricos** (contagem+lista 🟡/🔴 bloqueando) → **2.6** |
| `artifactType: 'discovery-interview'` (decisão da story — kebab, `.md`) | **Schema-núcleo** versionado por tipo → **3.1** (AD-2) |
| (sem mudança no toolkit — reusa commit/validateClaims de 1.2/1.4) | BPMN 2.0 XML, gargalos, diagnóstico → **2.3/2.4** |

> **Fronteira 2.1 ↔ 2.x/Epic 3 (não-negociável):** a 2.1 leva **Bento** ao nível "descoberta real e rastreável" (entrevista persistida + SIPOC/cadeia completos com 🟢). O roteiro é **conteúdo na skill** (semente do method-pack) — **não** construir loader/pack (Epic 3). A profundidade dos **demais especialistas** (hierarquia rastreável, BPMN XML, gargalos, diagnóstico) vem nas **2.2–2.4**; **excerpt/bidirecional/consolidado** na **2.5**; **gates ricos** na **2.6**.

> **Fronteira roteiro (precisa — leia):** AC1/FR-6 dizem *"roteiro do method-pack ativo"*. O **method-pack não existe** (`method-packs/` tem só `.gitkeep`; loader é 3.2; extração é 3.3 — decisão #5 da story 1.6). Portanto, em 2.1 o "roteiro do method-pack ativo" = **roteiro completo autorado na skill do Bento**, tratado como a **semente canônica** do futuro pack. Isso satisfaz o **intent** de AC1 (perguntas *estruturadas e completas, não improvisadas* pelo LLM) sem construir infra de Epic 3. **Decisão registrada + flag para confirmação do usuário ao final.**

### Paradigma e invariantes binding (não quebre)

- **AD-1 — Propose/Commit:** toda escrita de artefato (incl. a entrevista!) passa por `adapter.propose()` → `commit()`; a skill e o CLI **não tocam** `_process-ai_output/`/`.process-ai/` diretamente. Bento commita entrevista + SIPOC + cadeia via `process-ai propose --payload <file.json>`. [Source: ARCHITECTURE-SPINE#AD-1]
- **AD-3 — Núcleo hexagonal:** o core (`toolkit/src/**`) **não é modificado** nesta story. A **única** mudança TS é em **testes** (fora do core) → `tests/import-boundary.test.ts` permanece verde. O adapter (fora do core) **não muda** (já generalizado em 1.6; a skill do Bento é editada em place, copiada byte-a-byte como antes). [Source: ARCHITECTURE-SPINE#AD-3]
- **AD-5 — Confiança verificável (mecanismo 1.4, exercitado em 2.1 com a entrevista como fonte):** Bento **propõe** nível+fonte+razão; o toolkit **valida** e grava no ledger. 🟢 exige `source` cujo manifesto existe — agora **incl. `discovery-interview`** (a entrevista persistida). Sem fonte → 🟡; não-determinado → 🔴. **Excerpt/nav/consolidado → 2.5** (não nesta). [Source: ARCHITECTURE-SPINE#AD-5; código `confidence.ts:177-242`]
- **AD-2 — Method-pack é conteúdo que estende (NÃO nesta story):** o roteiro fica **autorado na skill**, **não** em `method-packs/`. Loader/schema-núcleo/pack → Epic 3. [Source: ARCHITECTURE-SPINE#AD-2; decisão #5 da 1.6]
- **FR-3 — Ordem fixa:** Bento→Miguel→Júlia→Zanoni (estágios `discovery`→…; gates `gate-1..gate-4`). Internamente ao `discovery`, a ordem é **entrevista → SIPOC → cadeia** (a entrevista precisa ser commitada antes para servir de fonte). O resume depende dessa ordem — **não renumerar** gates/estágios. [Source: SPEC#CAP-1, prd §4.1]
- **NFR-1 / SM-C1 — Honestidade:** 🟢 **só** com source resolvida (a entrevista confirma); nunca inflar 🟢 para parecer "completo". É honesto que parte do SIPOC permaneça 🟡/🔴. [Source: prd §5/NFR-1, SM-C1]

### O código que esta história MODIFICA — leia antes de tocar

_(Não-negociável: ler o estado atual antes de mudar. Fontes: `skills/process-ai-bento/SKILL.md`, `skills/process-ai/SKILL.md`, `tests/specialists.test.ts`, `tests/e2e-pipeline.test.ts`.)_

**`skills/process-ai-bento/SKILL.md` (MODIFY — T1):**
- **Estado atual (1.6):** 96 linhas, rascunho mínimo. §2 "Entrevista mínima (roteiro inline)" com 5 perguntas SIPOC + 1 de cadeia (linha ~38-54). §3 "Produz os rascunhos e committa com claims" produz `sipoc`+`value-chain` com **🟡/🔴 apenas**, com a regra explícita *"Não proponha 🟢 aqui"* (linha ~74-76). `artifactTypes: sipoc, value-chain` (linha ~87-90). Fronteiras apontam *"Entrevista guiada por method-pack → 2.1"* e *"SIPOC/Cadeia completos → 2.1"* (linha ~92-96).
- **O que muda:**
  - §2 → **roteiro de descoberta completo** (blocos por letra SIPOC + cadeia, com orientação de aprofundamento e exemplos do wedge Vendas/PME).
  - §3 → **novo passo "persistir a entrevista"** (`discovery-interview`) **antes** do SIPOC; capturar sha; depois SIPOC completo com claims 🟢 (sourceando a entrevista) + 🟡 + 🔴; depois cadeia.
  - **Remover/substituir a regra "Não proponha 🟢"** → "🟢 é permitido e esperado quando confirmado na entrevista persistida".
  - `artifactTypes` → adicionar `discovery-interview`.
  - Fronteiras → remover "→ 2.1" satisfeitos; reter os demais.
- **Preservar:** frontmatter (`name`/`description`); §"Como o Bento opera" (AD-1 estrutural); persona (Curioso/direto, honesto, pt-BR); padrão Write-não-heredoc + captura sha + remoção temp.
- **Atenção:** é a **fonte única de verdade** — o adapter a copia byte-a-byte. `tests/specialists.test.ts` faz asserções de conteúdo sobre ela (atualizar o `types` do Bento no array `SPECIALISTS`).

**`skills/process-ai/SKILL.md` (MODIFY — T2, só §3):**
- **Estado atual (1.6):** §3 "Pipeline" tabela de handoff (linha ~82-87) com row Bento = `sipoc, value-chain`; nota de provenance *"Bento (1º estágio) → entrega os sha256 de sipoc e value-chain ao Miguel. (Bento só produz 🟡/🔴 — a entrevista não é um artefato commitado.)"* (linha ~108-109); nota de fronteira *"rascunhos mínimos do Walking Skeleton… Profundidade é Epic 2"* (linha ~89-90).
- **O que muda:** row Bento → 3 artifactTypes (`discovery-interview`, `sipoc`, `value-chain`); nota de provenance reescrita (Bento persiste a entrevista, **pode 🟢**, entrega 3 shas); nota de fronteira atualizada (Epic 2 em curso; Bento profundo).
- **Preservar:** frontmatter `name: process-ai`; §1 Início/resume; §2 Gate 0; tabela canônica de gates/estágios; §4 Encerramento; Tom da Déa; AD-1. `tests/skill.test.ts` deve permanecer verde.

**`tests/specialists.test.ts` (MODIFY — T3):**
- **Estado atual:** array `SPECIALISTS` (linha ~24-29) com `{ skill: 'process-ai-bento', persona: 'Bento', types: ['sipoc', 'value-chain'] }`. Testes de conteúdo (frontmatter/persona/propose+claims/marcadores/AD-1/artifactTypes) + instalação byte-a-byte das 5 skills + "exatamente 5 skills".
- **O que muda:** `types` do Bento → `['discovery-interview', 'sipoc', 'value-chain']`. Nenhuma skill-dir nova → o teste "exatamente 5 skills" **não muda**.

**`tests/e2e-pipeline.test.ts` (MODIFY — T3):**
- **Estado atual:** seção Bento (linha ~93-111) propõe `sipoc` (🟡/🔴) + `value-chain` (🟡); asserção de **6 artefatos** (linha ~194-200); ledger com 🟢 vindo do Miguel (linha ~216).
- **O que muda:** adicionar `propose` de `discovery-interview` (primeiro); claims do `sipoc`/`value-chain` com 🟢 sourcing a entrevista; contagem **6 → 7**; (recomendado) asserção de 🟢 cujo `source.artifactType === 'discovery-interview'`. Resume: 7 artefatos, 5 gates.

**`toolkit/src/**` · `bin/process-ai.ts` · `toolkit/adapters/claude-code/adapter.ts` (NO CHANGE):**
- A 2.1 **consome** APIs estáveis, não as reescreve. A entrevista é commitada com o mesmo caminho de qualquer artefato. Assinaturas relevantes (já estáveis):
  - `commit(payload, { root, agent }): Promise<CommitResult>` — `commit.ts:~410`. `claims?` validados via `validateClaims`; ledger atualizado.
  - `ProposePayload { artifactType: string; content: unknown; claims?: Claim[] }`, `CommitResult { sha256, artifactPath, manifestPath }` — `engine-adapter.ts:~27,45`.
  - `Claim { claimId?, statement, level: '🟢'|'🟡'|'🔴', source?, reasoning }`; `ClaimSource { artifactType, sha256, excerpt? }` — `confidence.ts:~40,57`. **`excerpt` é opcional** — 2.1 pode incluir um trecho (legibilidade/futuro 2.5), mas o toolkit em 2.1 só valida a **resolução do manifesto**, não o conteúdo do trecho.
  - `validateClaims(claims, root)` resolve 🟢 a manifesto (`.process-ai/manifests/<type>-<sha>.json`) — `confidence.ts:~177`. Degradar NÃO aborta commit; nível inválido aborta.
  - `sanitizeArtifactType` aceita kebab `^[a-z0-9]+(-[a-z0-9]+)*$` → `discovery-interview` é válido; `EXT_BY_TYPE = {}` → `.md`.
  - CLI: `process-ai propose --payload <file.json>` → imprime `CommitResult` JSON (com `sha256`). **Não há flag `--agent`** (defer 1.6); o `artifactType` distingue o produtor.

**Layout resultante (delta em negrito):**
```text
skills/process-ai-bento/SKILL.md   # MODIFY: roteiro completo + persistir entrevista + SIPOC/cadeia c/ 🟢 (T1)
skills/process-ai/SKILL.md         # MODIFY: §3 handoff Bento (3 artifactTypes) + nota provenance (T2)
tests/specialists.test.ts          # MODIFY: Bento types += 'discovery-interview' (T3)
tests/e2e-pipeline.test.ts         # MODIFY: entrevista + 🟢 de Bento + contagem 7 (T3)
tests/bento-discovery.test.ts      # NEW (opcional): mecanismo entrevista→🟢 + degradação (T3)
# NENHUM arquivo novo em toolkit/src/**  (AD-3 verde; import-boundary verde)
# No root da sessão (gerado pelo toolkit — sem mudança de layout):
_process-ai_output/{discovery-interview,sipoc,value-chain,...}/<sha>.md
```

## Decisões de implementação (registre as escolhas na Completion Notes)

1. **Persistir a entrevista como `discovery-interview` (o habilitador da story).** AC2 exige "cada campo com marcador+**fonte**"; AD-5 só valida 🟢 com source que resolve a artefato commitado. Em 1.6 a entrevista era só conversacional → Bento nunca tinha fonte. Em 2.1, Bento commita a entrevista **antes** do SIPOC → campos confirmados viram 🟢. Mecanismo AD-5 já existe (1.4); **zero mudança no toolkit**. Nome `discovery-interview` (kebab, `.md`); alternativas consideradas: `interview` (mais curto, mas menos específico — pode colidir com entrevistas de validação futuras, ex.: spot-check 2.5) → rejeitado. [Source: ARCHITECTURE-SPINE#AD-5 ("entrevista persistida"); prd FR-7 consequence]

2. **Roteiro completo autorado na skill (não em method-pack).** AC1 diz "roteiro do method-pack ativo", mas o loader é 3.2 e a extração é 3.3 (decisão #5 da 1.6; `method-packs/` hoje é só `.gitkeep`). Construir um loader/pack aqui seria scope creep de Epic 3. Portanto o roteiro é **conteúdo autorado na skill do Bento** (semente canônica do futuro pack), satisfazendo o *intent* de AC1 (estruturado/completo, não improvisado). **Alternativa considerada e rejeitada:** criar `method-packs/bpmn-sipoc/prompts/bento-discovery.md` + leitura hardcoded — rejeitada porque (a) contradiz a fronteira documentada 1.6→3.3, (b) exigiria um loader (3.2) ou um path-read hack (não-method-agnostic), (c) toca em AD-2/schema-núcleo (3.1). **Flag para o usuário confirmar.**

3. **Bento agora pode 🟢 (evolução honesta da premissa 1.6).** A regra 1.6 "Não proponha 🟢" derivava do fato de a entrevista não ser commitada. Com a entrevista persistida, essa premissa **muda** — 🟢 passa a ser **permitido e esperado** onde há confirmação. Não é inflar (SM-C1): 🟢 só com source resolvida; 🟡/🔴 permanecem onde não há confirmação. Atualizar essa instrução na skill é parte do T1.

4. **Ordem interna do `discovery`: entrevista → SIPOC → cadeia.** A entrevista precisa ser commitada **antes** do SIPOC para servir de fonte 🟢. Tudo dentro do mesmo estágio `discovery`, antes do `gate-2`. **Nenhuma mudança** na sequência canônica de gates/estágios (FR-3 preservado; resume não afetado).

5. **Threading de 3 shas ao Miguel.** Bento entrega `discovery-interview` + `sipoc` + `value-chain`. Miguel continua sourceando `value-chain` para a hierarquia (regressão 1.6). Os shas da entrevista/SIPOC ficam disponíveis para stories futuras (ex.: rastreabilidade 2.5).

6. **Nenhuma mudança no toolkit/adapter/CLI (AD-3).** Toda a profundidade é entregue na camada de skill + testes. Se o dev achar que precisa mudar `commit.ts`/`confidence.ts`/`adapter.ts`/`bin/process-ai.ts` — **pare**, é scope creep (provável Epic 3 ou 2.5).

## Padrões de teste estabelecidos (espelhar — não reinventar)

Herdados da 1.1–1.6:
- `node:test` + `node:assert/strict`; tmpdir via `fs.mkdtemp(os.tmpdir())`; `finally { fs.rm(...) }`.
- Skill-fonte é única fonte de verdade: asserções de **conteúdo** + cópia **byte-a-byte** via `installSkills` (padrão `tests/skill.test.ts`/`specialists.test.ts`).
- E2E via `dispatch(parseArgs([...]), adapter, root)` com `new ClaudeCodeAdapter({ cwd: tmp })` — drive determinístico, sem LLM (padrão `tests/e2e-pipeline.test.ts`).
- Para "simular Bento": escrever o `ProposePayload` num temp, chamar `propose`, **ler o `sha256`** do `CommitResult`, reusar como `source` no claim seguinte (aqui: entrev → SIPOC/cadeia). Asserir ledger via `report` e/ou leitura direta de `confidence-ledger.jsonl`.
- Padrão de **degradação**: claim 🟢 com sha inexistente → `unresolved-source` → 🟡 (não aborta) — já exercitado pelo Miguel no `e2e-pipeline`; **replicar para Bento** (🟢 sourcing entrevista resolve; sha inexistente degrada).
- AD-3 guardrail: `tests/import-boundary.test.ts` varre `toolkit/src/**` — esta story **não adiciona** arquivo lá, fica verde automaticamente.

## Convenções (do spine, herdadas da 1.1–1.6)

- Naming `kebab-case`; skills prefixadas `process-ai-*`; artifactTypes kebab (`discovery-interview`); IDs globais estáveis (FR-n, AD-n, CAP-n) — nunca renumerados.
- Node 24 LTS; TS + ESM; imports `.ts` com extensão explícita (type-stripping nativo).
- Sem deps de runtime no core (AD-3 allowlist: só `node:` + relativos).
- Erros acionáveis em pt-BR. Pastas protegidas: escrita só em `_process-ai_output/` + `.process-ai/` (via toolkit).

## Project Structure Notes

- **Incremental sobre a fundação 1.1–1.6:** nenhuma camada determinística é reescrita. A 2.1 **aprofunda a skill do Bento** (conteúdo + entrevista persistida) e **ajusta o handoff do condutor**. Cada peça consome APIs estáveis do toolkit.
- **Alvo ≠ framework:** skills são instaladas no projeto-alvo (`.claude/skills/`); artefatos commitados no `cwd` do projeto-alvo. Testes injetam tmpdir.
- **`.gitignore` da 1.1 já cobre** `_process-ai_output/` e `.process-ai/`.
- **Baseline:** HEAD `de85038` (pós 1.6 `done`); suite **174 pass / 0 fail**. A 2.1 builda sobre esse estado; confirmar a baseline verde antes de codar (`node --test tests/*.test.ts` → 174 pass).
- **Estado atual do repo:** `method-packs/` contém **apenas `.gitkeep`** (confirme antes de codar — se houver conteúdo, é trabalho de outra story). `.process-ai/checkpoint.json` está em `stage: "scope"` (gate-0 approved, 0 artefatos) — estado limpo.

## References

- [Source: SPEC.md#CAP-2] — descoberta (Bento): "processo tácito extraído por entrevista e estruturado em SIPOC e cadeia de valor"; success = "SIPOC + cadeia commitados, cada campo com marcador e fonte"
- [Source: SPEC.md#CAP-1] — condução orquestrada por Déa (ordem fixa Bento→Miguel→Júlia→Zanoni)
- [Source: ARCHITECTURE-SPINE.md#AD-1] — propose/commit; toolkit único escritor; skill sem escrita direta
- [Source: ARCHITECTURE-SPINE.md#AD-3] — núcleo hexagonal; core engine-agnostic; adapter pass-through (2.1 não toca o core)
- [Source: ARCHITECTURE-SPINE.md#AD-5] — confiança por fonte verificável; 🟢 resolve a artefato commitado; **"entrevista persistida" listada como fonte válida**
- [Source: ARCHITECTURE-SPINE.md#AD-2] — method-pack só estende schema-núcleo; loader/schema → Epic 3 (2.1 não constrói)
- [Source: ARCHITECTURE-SPINE Capability Map] — "FR-6 entrevista | skills/process-ai-bento + pack prompts | AD-2"; "FR-7/8 | skill Bento + schema-núcleo + pack"
- [Source: prd.md §4.2/FR-6/FR-7/FR-8] — Bento: entrevista guiada (roteiro do pack, não improvisado); SIPOC persistido, cada campo sem fonte → 🟡/🔴; cadeia antes do Gate 1
- [Source: prd.md §5/NFR-1 · §9/SM-C1] — honestidade; não inflar 🟢
- [Source: glossary.md "SIPOC" · "Cadeia de Valor" · "Marcador de confiança" · "Rastreabilidade"] — vocabulário canônico
- [Source: epics.md#Story 2.1 + FR Coverage Map] — ACs originais (FR-6,7,8 full); "FR-6/7/8: Epic 1 (mínimo) + Epic 2"
- [Source: 1-6-pipeline-minima-rascunhos.md] — estado 1.6 do Bento (rascunho mínimo, 🟡/🔴, "Não proponha 🟢"); decisão #5 (roteiro inline, extração → 3.3); padrão propose-por-arquivo + Write-não-heredoc; threading de sha
- [Source: 1-4-toolkit-confianca-mecanica-ledger.md] — `Claim`/`ClaimSource`/`validateClaims`/ledger; `validateClaims` resolve 🟢 a manifesto (confidence.ts:177-242); `excerpt` opcional
- [Source: 1-2-toolkit-propose-commit-sha256.md] — `commit()`, `ProposePayload`, `CommitResult`, `sanitizeArtifactType` (kebab), `EXT_BY_TYPE` vazio
- [Source: 1-5-dea-skill-condutora.md] — CLI `process-ai propose|gate|stage|resume|report`, stage/gate IDs canônicos
- [Source: code] — `skills/process-ai-bento/SKILL.md` (§2 roteiro inline ~38-54; §3 ~56-85; regra "não 🟢" ~74-76); `skills/process-ai/SKILL.md` §3 (tabela ~82-87; nota Bento ~108-109); `commit.ts:~61,~410`; `confidence.ts:~40,~57,~177-242`; `engine-adapter.ts:~27,~45`; `tests/specialists.test.ts:~24-29`; `tests/e2e-pipeline.test.ts:~93-111,~194-200`
- [External: https://code.claude.com/docs/en/skills.md] — skill `name` = slash-invocável; skills de projeto exigem workspace trust

## Dev Agent Record

### Agent Model Used

glm-5.1 (skill `bmad-dev-story`)

### Debug Log References

- Baseline confirmada antes de codar: `node --test tests/*.test.ts` → **174 pass / 0 fail** (1.1–1.6); `npm run typecheck` (`tsc --noEmit`) limpo.
- RED→GREEN (T1): `tests/specialists.test.ts` 1 fail (*"deve referenciar o artifactType 'discovery-interview'"*) → 12 pass após reescrever a skill do Bento.
- T2: `tests/skill.test.ts` 8/8 verde (regressão do condutor preservada após a edição do §3); full suite 174/0.
- T3: `tests/bento-discovery.test.ts` GREEN na 1ª execução (entrevista→🟢 resolve; sha inexistente degrada a 🟡 `unresolved-source`); `tests/e2e-pipeline.test.ts` atualizado GREEN (7 artefatos + 🟢 de Bento sourceando entrevista).
- Final: `node --test tests/*.test.ts` → **175 pass / 0 fail** (174 regressão 1.1–1.6 + 1 novo `bento-discovery`); `tsc --noEmit` limpo; `tests/import-boundary.test.ts` (AD-3) 4/4 verde; `git status` confirma **nenhum arquivo em `toolkit/src/**`**.

### Completion Notes List

- **T1 — Skill do Bento** (`skills/process-ai-bento/SKILL.md`): reescrita de rascunho mínimo (1.6) para descoberta completa. (a) **Roteiro de descoberta completo** — blocos por letra do SIPOC + cadeia, com orientação de aprofundamento (perguntas-filhas) e exemplos do wedge Vendas/PME; roteiro autorado na skill (semente do method-pack — loader → 3.2/3.3). (b) **Persistir a entrevista** (`discovery-interview`) **primeiro** — markdown estruturado por bloco, commit via `propose` (Write-não-heredoc), captura do `sha256`. (c) **SIPOC completo** com `claims`: 🟢 (sourceando `discovery-interview`, `source` resolve a manifesto) + 🟡 (inferido) + 🔴 (gap). (d) **Cadeia completa** análoga. (e) Regra 1.6 "Não proponha 🟢" → "🟢 é **permitido e esperado** quando confirmado na entrevista persistida". (f) `artifactTypes` += `discovery-interview`. (g) Fronteiras atualizadas. AD-1 estrutural, persona (Curioso/direto, honesto, pt-BR) e padrão Write-não-heredoc + captura sha + remoção temp preservados.
- **T2 — Condutor §3** (`skills/process-ai/SKILL.md`): row do Bento na tabela de handoff → 3 `artifactType`s (`discovery-interview`, `sipoc`, `value-chain`); nota de provenance reescrita (Bento **persiste a entrevista** e **pode 🟢** sourcing-a; entrega os **3 shas** ao Miguel, que continua sourceando `value-chain`); nota de fronteira atualizada (Epic 2 em curso; Bento profundo). `tests/skill.test.ts` 8/8 verde (regressão — todas as asserções preservadas: frontmatter, Gate 0, slots, gates 1–4, resume, report/propose/summary-report, AD-1, byte-a-byte).
- **T3 — Testes:** `tests/specialists.test.ts` (Bento `types` += `discovery-interview`); `tests/e2e-pipeline.test.ts` (Bento propõe `discovery-interview` primeiro + claims 🟢 sourcing entrevista + contagem 6→7 + asserção de 🟢 sourceando `discovery-interview` + resume 7 artefatos); **NEW** `tests/bento-discovery.test.ts` (mecanismo entrevista→🟢 resolve + degradação `unresolved-source` + mix 🟢/🟡/🔴 + 3 artefatos de Bento + relatório sem "zeros honestos").
- **T4 — Critério implícito:** suite **175 pass / 0 fail** (174 regressão 1.1–1.6 + 1 `bento-discovery`); `npm run typecheck` (`tsc --noEmit`) limpo; `tests/import-boundary.test.ts` (AD-3) 4/4 verde; `git status` confirma **nenhum arquivo novo em `toolkit/src/**`** (mudança TS só em testes). E2E real via dispatcher passando: entrevista persistida → SIPOC 🟢 sourcing entrevista (manifesto resolve) → cadeia 🟢 → Miguel (regressão 🟢 sourcing `value-chain`) → ledger com 🟢 inclusive de Bento → resume sem duplicação (7 artefatos, 5 gates, sem órfãos).
- **Decisões realizadas (registradas):** (1) **persistir a entrevista como `discovery-interview`** — habilitador de 🟢 em Bento (AD-5 já prevê "entrevista persistida" como fonte; mecanismo de 1.4 exercitado, zero mudança no toolkit); (2) **roteiro autorado na skill** (semente do method-pack; loader → 3.2, extração → 3.3); (3) **Bento agora pode 🟢** (evolução honesta da regra 1.6 — não inflar, SM-C1); (4) **ordem interna do `discovery`: entrevista → SIPOC → cadeia** (a entrevista precisa ser commitada antes para servir de fonte); (5) **threading de 3 shas** ao Miguel; (6) **zero mudança no toolkit/adapter/CLI** (AD-3).
- **Fronteiras respeitadas (zero scope creep):** method-pack loader/schema-núcleo/pack → **Epic 3** (3.1/3.2/3.3); verificação de trecho/excerpt + rastreabilidade bidirecional navegável + relatório consolidado → **2.5**; gates ricos → **2.6**; BPMN 2.0 XML/gargalos → **2.3**; diagnóstico → **2.4**.

### File List

- `skills/process-ai-bento/SKILL.md` — **MODIFIED** (T1): rascunho mínimo → descoberta completa (roteiro completo + persistir `discovery-interview` + SIPOC/cadeia com 🟢 sourcing entrevista + regra de 🟢 atualizada + artifactTypes += `discovery-interview`).
- `skills/process-ai/SKILL.md` — **MODIFIED** (T2): §3 handoff do Bento (3 artifactTypes) + nota de provenance (persiste entrevista, pode 🟢, entrega 3 shas) + nota de fronteira (Epic 2 em curso).
- `tests/specialists.test.ts` — **MODIFIED** (T3): `SPECIALISTS` Bento `types` += `discovery-interview`.
- `tests/e2e-pipeline.test.ts` — **MODIFIED** (T3): Bento persiste `discovery-interview` + claims 🟢 sourcing entrevista + contagem 6→7 + asserção 🟢-sourceando-entrevista + resume 7.
- `tests/bento-discovery.test.ts` — **NEW** (T3): mecanismo entrevista→🟢 (resolve) + degradação `unresolved-source` + mix 🟢/🟡/🔴 + 3 artefatos de Bento.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — **MODIFIED**: `2-1-...` ready-for-dev → review; `epic-2` backlog → in-progress.
- (NENHUM arquivo em `toolkit/src/**`, `toolkit/adapters/**`, ou `bin/**` — AD-3 preservado; a profundidade é toda na camada de skill + testes.)

## Change Log

- **2026-08-02** — Story 2.1 criada (create-story): primeira do Epic 2. Aprofunda o Bento de rascunho mínimo (1.6) para descoberta real e rastreável — roteiro de descoberta completo, **entrevista persistida** (`discovery-interview`) como novo artefato-fonte, SIPOC completo e Cadeia de Valor completa com claims 🟢 (sourcing a entrevista) + 🟡 + 🔴. Mecanismo-chave: persistir a entrevista habilita 🟢 legítimo em Bento (AD-5 já existe desde 1.4; zero mudança no toolkit — AD-3 preservado). Roteiro autorado na skill (semente do method-pack; loader → 3.2, extração → 3.3). Fronteiras: excerpt/bidirecional/consolidado → 2.5; gates ricos → 2.6; BPMN XML/gargalos/diagnóstico → 2.3/2.4; method-packs/schema-núcleo → Epic 3. Mudanças: `skills/process-ai-bento/SKILL.md` (MODIFY), `skills/process-ai/SKILL.md` §3 (MODIFY), `tests/specialists.test.ts` + `tests/e2e-pipeline.test.ts` (MODIFY), `tests/bento-discovery.test.ts` (NEW opcional). Builda sobre 1.1–1.6 sem reescrever o toolkit; baseline 174 testes + novos.
- **2026-08-02** — Story 2.1 implementada (status → review). Entregues: skill do Bento aprofundada (`skills/process-ai-bento/SKILL.md` — T1: roteiro completo + persistir `discovery-interview` + SIPOC/cadeia completos com claims 🟢 sourcing a entrevista + 🟡 + 🔴); condutor `skills/process-ai/SKILL.md` §3 atualizado (T2: handoff Bento com 3 artifactTypes + nota de provenance + fronteira); `tests/specialists.test.ts` + `tests/e2e-pipeline.test.ts` (T3, MODIFY) + `tests/bento-discovery.test.ts` (T3, NEW). **Suite: 175 pass / 0 fail** (174 regressão 1.1–1.6 + 1 novo); `tsc --noEmit` limpo; AD-3 `import-boundary` 4/4 verde; `git status` confirma **nenhum arquivo em `toolkit/src/**`** (profundidade toda na camada de skill + testes). Mecanismo-chave comprovado: Bento persiste a entrevista (`discovery-interview`) → SIPOC/cadeia alcançam 🟢 legitimamente (AD-5, `validateClaims` resolve o source ao manifesto da entrevista); claim com sha inexistente degrada a 🟡 (`unresolved-source`) sem abortar. Resume sem duplicação (7 artefatos, 5 gates, sem órfãos). Zero arquivos de regressão modificados por esta story (apart from os testes que cresceram).
- **2026-08-02** — Code review (status → done). Revisão adversarial do delta 2.1: suite **175 pass / 0 fail** confirmada; `tsc --noEmit` limpo; AD-3 (`import-boundary`) verde; mecanismo AD-5 verificado contra `confidence.ts:177-242` (`validateClaims` resolve `discovery-interview-<sha>.json`; `NONEXISTENT_SHA` exercita `unresolved-source`). **1 finding aplicado:** referência cruzada defasada na skill do Miguel (`skills/process-ai-miguel/SKILL.md:70-71` — dizia que o 🟢 da hierarquia era o "primeiro 🟢 da pipeline" e que "Bento foi só 🟡/🔴", ambas falsas pós-2.1) → corrigida para refletir que Bento já alcança 🟢 sourcing a `discovery-interview` e Miguel continua a cadeia. Achado cosmético (comentário "6 artefatos" no `e2e-pipeline.test.ts:13`, corrigido pela linha 2.1 logo abaixo) mantido como está. Pós-correção: **175 pass / 0 fail**; `specialists.test.ts` verde.
