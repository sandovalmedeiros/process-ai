---
baseline_commit: 181eaff
---

# Story 2.5: Confiança verificável + rastreabilidade bidirecional + relatório consolidado

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **dev/leigo**,
I want **confiança honesta aprofundada (verificação de trecho/excerpt no 🟢) + rastreabilidade bidirecional navegável (afirmação↔fonte nos dois sentidos) + um relatório de confiança consolidado que lista contagem E itens por nível 🟢🟡🔴 (claimId, statement, source, degradationReason, status de excerpt), com cada item derivado do ledger rico (que agora persiste statement+reasoning)**,
so that **eu confie no confirmado (🟢) vs. inferido (🟡) vs. gap (🔴) — a documentação do processo seja auditável ponta-a-ponta, e o encerramento da Déa embute um relatório navegável (não só contagens) sem inflar 🟢 (SM-C1)**.

## Acceptance Criteria

1. **[AC1] Verificação de trecho (excerpt) aprofunda "fonte verificável" no 🟢 (FR-14 full, AD-5)** — **Given** um 🟢 proposto cujo `ClaimSource` carrega `excerpt` (opcional), **When** o toolkit valida, **Then** o toolkit **lê o artefato-fonte** (resolvendo `.process-ai/manifests/<artifactType>-<sha256>.json` → `artifactPath` → `fs.readFile`) e verifica o trecho como **substring** do conteúdo canônico; trecho presente + casa → 🟢; trecho presente + **NÃO casa** → degrada a 🟡 com motivo **`excerpt-mismatch`** (novo). Trecho **ausente** → sem checagem (🟢 mantém, contanto que a fonte resolva — comportamento 1.4 preservado). A mecânica de source-resolution existente (`missing-source`/`malformed-source`/`unresolved-source`, 1.4) permanece **intacta e na mesma precedência**; o excerpt-check é um **novo passo 4b** que só corre **depois** da fonte resolver. *(FR-14 full, AD-5 "opcionalmente com checagem de trecho … trechos não-verificáveis falham e degradam a 🟡")*
   > **Decision #1 (flaggada — leia):** excerpt verification roda **em `validateClaims` como degradação** (🟢→🟡 `excerpt-mismatch`), leitura AD-5-fiel ("trechos não-verificáveis falham e degradam a 🟡"). Isto adiciona uma **leitura de conteúdo** (`fs.readFile` do artefato-fonte) ao path de validação — que hoje só faz `lstat` (metadados). **É seguro** porque a fonte referencia **sempre um artefato já-commitado, imutável e on-disk** (FR-20/AD-4: manifestos append-only, nunca removidos) — sem corrida com o write-deste-commit. **Não viola** o abort-before-write (validação roda antes do lock/WAL/write; só lê estado prévio). **Fallback documentado:** se uma revisão concluir que conteúdo-read em `validateClaims` quebra um invariante não-anticipado, mover o excerpt-check para o **report path** (leitor) apenas como *status exibido* (verified/mismatch/no-excerpt) **sem degradar** — mas isto NÃO satisfaz o AD-5 literal; preferir a degradação. **Confirme contra `commit.ts:418-444` antes de codar.**

2. **[AC2] Rastreabilidade bidirecional navegável, derivada do ledger (FR-15, AD-1 "índice de rastreabilidade")** — **Given** os claims commitados (cada ledger entry carrega `source?: { artifactType, sha256, excerpt? }`), **When** o toolkit constrói o índice de rastreabilidade, **Then** (a) **forward** — cada claim é navegável à sua fonte (source → manifesto → artefato, reusando o path `confidence.ts:220`); (b) **reverse** — cada artefato-fonte (`artifactType`+`sha256`) lista **todos** os claims que o citam. O índice é **derivado on-the-fly em leitura** (scan do ledger), **sem novo estado persistido** (preserva single-writer AD-1/AD-4). A cláusula de cascata do FR-15 (*"remover uma fonte rebaixa as afirmações dependentes a 🟡/🔴"*) é **moot em v1** — artefatos/manifestos são **imutáveis** (FR-20/AD-4: nunca removidos), logo a remoção nunca dispara; o **índice reverso é o que torna a navegabilidade observável**. *(FR-15; AD-1 commit aplica "índice de rastreabilidade")*
   > **Decision #2 (flaggada — leia):** **NÃO** adotar o sidecar `.process-ai/provenance.json` com `source_ids[]`/`dependents[]` recomendado pela review adversarial do PRD. **Motivo:** o ledger já carrega `source` por entry desde 1.4; o reverse-index é trivialmente derivável por agrupamento — adicionar estado persistido quebraria single-writer e duplicaria a fonte-da-verdade. O sidecar pode ser revisitado se escala justificar (índice materializado), mas v1 deriva.

3. **[AC3] Relatório de confiança consolidado com lista rica por nível (FR-16, NFR-1, SM-C1)** — **Given** o ledger, **When** o toolkit gera o relatório (`process-ai report`), **Then** ele lista **contagem E itens** por nível 🟢🟡🔴 — cada item carrega **claimId, statement, source ref (artifactType+sha256+excerpt-status), degradationReason**; com **breakdown por artifactType**; e **órfãos em quarentena listados** (não só `orphans: number`). Saída em **markdown pt-BR** (contrato duro: a Déa embute este markdown *verbatim* no artifactType `summary-report` em `skills/process-ai/SKILL.md:124-141` — o `report` **continua arg-less, exit 0, default markdown**). Zero claims → **zeros honestos** (ℹ️ callout, sem inflar 🟢 — SM-C1/NFR-1). **Nunca lança** por ledger/checkpoint ausente/corrompido (resiliência — linhas ilegíveis ignoradas, degradam honestamente). *(FR-16; PRD glossário "Relatório de confiança — contagem e itens por nível")*
   > **Fronteira de contagem (anti-colisão):** o relatório de confiança consolidado (FR-16) é o **payload** que a Déa embute; o **resumo narrativo final** de FR-5 (o que foi documentado, próximos passos) é a **skill layer → story 2.6**; o diagnóstico de FR-13 é **conteúdo dentro do `pop` → 2.4 (feito)**. Três deliverables distintos — não conflate. 2.5 produz o **payload do relatório**; a entrega no encerramento é FR-5 (mecanismo de closure já existe desde 1.5).

4. **[AC4] Persistência rica no ledger: `statement` + `reasoning` (habilita AC3; fecha deferral 2.3)** — **Given** um `Claim { statement, reasoning, ... }`, **When** commitado, **Then** o `ConfidenceLedgerEntry` carrega **`statement`** e **`reasoning`** (hoje **dropped** em `buildLedgerEntries` — `confidence.ts:395-415`). **Backward-compat:** linhas antigas do ledger **sem** esses campos são toleradas pelos leitores (tratar como `''`). Idempotência/atomicidade/dedupe do ledger **preservadas** (chave `(claimId, artifactSha256)` inalterada; `validatedAt` fora da chave; `update-on-change` byte-estável; `atomicWriteLedger` temp+rename). *(fecha `_bmad-output/implementation-artifacts/deferred-work.md:90`)*
   > **Decision #3:** campos novos são **opcionais no tipo persistido** (`statement?`, `reasoning?`) para que leitores não quebrem em ledgers legados. O **escritor sempre preenche** (a partir do `Claim`); leitores defensivos (`.statement ?? ''`).

5. **[AC5] Fronteiras respeitadas — zero scope creep (AD-3, AD-6)** — **Given** o escopo de "confiança verificável + rastreabilidade + relatório consolidado", **Then** a story **NÃO** constrói: **gates ricos bloqueantes** com contagem/lista 🟡/🔴 (FR-4 full → **2.6**); **resumo narrativo final** da Déa (FR-5 full → **2.6**, skill layer); **schema-núcleo** por artifactType, novo artifactType (`confidence-report`/`traceability-index`), extensão proprietária (→ **Epic 3**, 3.1); **method-pack loader**/validador (→ **3.2/3.3**); **marcadores por-nó no `content`** do artefato (enhancement — `deferred-work.md:84`, não exigido por FR-15/16); **cascata-on-removal** de fonte (moot — imutabilidade, Decision #2). Vocabulário de artifactTypes **permanece fechado em 7** (`discovery-interview`, `sipoc`, `value-chain`, `hierarchy`, `flow`, `pop`, `summary-report`). **AD-3 verde** (`tests/import-boundary.test.ts`): novo código em `toolkit/src/` importa só `node:*` + relativos (nunca `adapters/`, nunca npm). *(AD-3, AD-6)*
   > **Decision #4:** **NÃO** introduzir artifactType `confidence-report`/`traceability-index`. O relatório é **derivação de leitura** do ledger (`report.ts` docstring: "LÊ o ledger … NÃO reatribui, NÃO infere, NÃO infla"). O reverse-index vive em memória no `report`, não como artefato commitado.

> **Critério implícito (não-negociável):** a história deixa o sistema "rodável ponta-a-ponta" no escopo dela — `node --test tests/*.test.ts` 100% verde (**~181 testes herdados da 1.1–2.4 + novos, zero regressões**), `npm run typecheck` (`tsc --noEmit`) limpo, e o guardrail **AD-3** (`tests/import-boundary.test.ts`) permanece verde. Um **E2E atualizado** deve passar: Gate 0 → …→ Zanoni profundo (`pop`) → encerramento: `report` **rico** (lista de itens por nível + reverse-index navegável + excerpt-status) → `summary-report` → `resume` sem duplicação (**7 artefatos, 5 gates, sem órfãos**). O fluxo de encerramento da Déa (`SKILL.md:124-141`) permanece funcionando **sem reescrita** (contrato markdown preservado). Não basta "satisfazer os ACs literais".

## Tasks / Subtasks

- [x] **T1 — Aprofundar `toolkit/src/confidence.ts` (AC: #1, #4)**
  - [x] **MODIFY `ConfidenceLedgerEntry` (`:84-101`):** adicionar **`statement?: string`** + **`reasoning?: string`** (opcionais p/ backward-compat — Decision #3). Documentar no JSDoc que o escritor sempre preenche.
  - [x] **MODIFY `buildLedgerEntries` (`:395-415`):** copiar `claim.statement` + `claim.reasoning` para a entry (hoje dropped — fecha `deferred-work.md:90`). **Preservar:** `claimId` determinístico (`{artifactType}-{artifactSha256}-{index}`), ordem de chaves, e o fato de ser **função pura sem IO** (só mapeia).
  - [x] **MODIFY `validateClaims` (`:177-242`):** inserir **passo 4b — excerpt verification** (Decision #1). Após a fonte resolver (passo 4 🟢 confirmado por `manifestExists`), **se** `source.excerpt` for string não-vazia: resolver `artifactPath` via manifesto, `fs.readFile` do artefato-fonte, substring-match `excerpt`. Casa → 🟢 (sem mudança); **não casa** → 🟡 **`excerpt-mismatch`**. Trecho ausente → 🟢 (pula 4b). **Precedência preservada:** nível inválido ainda aborta (throw); degradação não aborta. **Edge:** read-failure inesperado (manifesto existe mas artefato ilegível) → tratar como `excerpt-mismatch` (não-verificável), **nunca lançar** fora do path de erro. Estender o tipo `degradationReason` com **`'excerpt-mismatch'`**.
  - [x] **Reusar, não reinventar:** o path do manifesto é `path.join(manifestsDir, \`${src.artifactType}-${src.sha256}.json\`)` (`confidence.ts:220`) — **mesmo contrato**; ler o `artifactPath` do manifesto para achar o artefato. Adicionar **leaf-symlink guard** no read do artefato (espelhar `manifestExists` `lstat`+`isFile` — `deferred-work.md:63` defense-in-depth parity).
  - [x] **Preservar (não-regressão 1.4):** tipo `ConfidenceLevel`, `VALID_CONFIDENCE_LEVELS`, `Claim`/`ClaimSource`/`ValidatedClaim`, hex64/kebab/scope guards, `assertNotSymlinkLeaf`, `atomicWriteLedger`, `appendConfidenceLedger` (dedupe + update-on-change), `validateClaims` para claims 🟡/🔴 (pass-through).

- [x] **T2 — Aprofundar `toolkit/src/report.ts` (AC: #2, #3)**
  - [x] **MODIFY `ConfidenceReport` (`:34-47`):** estender com **(a)** breakdown por artifactType (`{ artifactType, sha256, counts: {🟢,🟡,🔴} }[]` ou map); **(b)** lista rica de itens por nível (`{ claimId, statement, reasoning?, level, source?(artifactType+sha256), degradationReason?, excerptStatus }[]`); **(c)** reverse-index (`sourceKey → claimId[]`); **(d)** órfãos como **lista** (não só count), quando factível; manter `counts`, `totalClaims`, `stage`, `generatedAt`.
  - [x] **MODIFY `aggregateLedger` (`:79-111`):** generalizar do fold counts-only para **scan completo** que preserva entries (statement/reasoning agora presentes — AC4) + constrói o **reverse-index** agrupando por `source.artifactType+source.sha256` (AC2). **Resiliência preservada** (ENOENT → zeros; linhas ilegíveis/sem `validated` ignoradas — `deferred-work.md:64`). **Leaf-symlink guard** no read do ledger (`deferred-work.md:63` — parity com o escritor). v1 pode permanecer whole-file (streaming = scale futuro — `deferred-work.md:72`).
  - [x] **ADD helper de excerpt-status** (em `report.ts` ou `confidence.ts`): dado uma entry com `source.excerpt`, computar status (`verified` | `mismatch` | `no-excerpt` | `source-missing`) lendo o artefato-fonte (mesmo path do T1). Usado pelo item-list do relatório (AC3). **Nunca lançar** (resiliência).
  - [x] **MODIFY `formatConfidenceReport` (`:181-219`):** renderizar a estrutura rica como **markdown pt-BR** — seções por artifactType, lista de itens por nível (claimId + statement + source + degradationReason + excerptStatus), seção de reverse-index (fonte → claims que citam — navegabilidade FR-15), órfãos listados. **Default markdown é contrato duro** (`SKILL.md:124-141` embute verbatim). Escapar `stage`/campos no markdown (`deferred-work.md:65`). Normalizar emoji variation selector na contagem (`deferred-work.md:71`).
  - [x] **Preservar (não-regressão 1.5):** `reportConfidence` (`:146-171`) — assinatura `(root) => ConfidenceReport`, try/catch em `checkpointRead` (resiliência), `countOrphans`; CLI `report` **arg-less, exit 0, default markdown** (`bin/process-ai.ts:344-347` intocado, a menos que `--json` opcional seja adicionado — ver abaixo).
  - [x] **OPCIONAL `--json` no `report`** (nice-to-have, **não obrigatório**): deixado de fora — contrato markdown com a Déa preservado sem risco.

- [x] **T3 — Testes (AC: #1–#5 + AD-3 + regressão 1.1–2.4)**
  - [x] **`tests/confidence.test.ts` (MODIFY — AC1/AC4):** (a) round-trip `statement`/`reasoning` via `buildLedgerEntries` → `appendConfidenceLedger` → parse on-disk; (b) **excerpt verification**: 🟢+excerpt-casa → 🟢; 🟢+excerpt-**não-casa** → 🟡 `excerpt-mismatch`; 🟢+sem-excerpt → 🟢; (c) **backward-compat**: linha de ledger legada (sem statement/reasoning) ainda parseia nos leitores; (d) precedência preservada (nível inválido aborta; degradação não). Reusar helpers `createManifest`/`writeLedger`/`GHOST_SHA`; drive via `dispatch(parseArgs([...]), adapter, root)` com `new ClaudeCodeAdapter({ cwd: tmp })` — **sem LLM**.
  - [x] **`tests/report.test.ts` (MODIFY — AC2/AC3):** (a) breakdown por artifactType correto; (b) lista de itens por nível (claimId, statement, source, degradationReason, excerptStatus); (c) **reverse-index**: dada N claims citando o mesmo artefato-fonte, o reverse lista todos; (d) excerpt-status outcomes (verified/mismatch/no-excerpt/source-missing); (e) markdown renderiza as novas seções; (f) **resiliência**: ledger corrompido → relatório parcial (sem throw); zero claims → zeros honestos; (g) órfãos listados. Reusar `writeLedger` helper.
  - [x] **`tests/report.test.ts` (NEW integration — AC2/AC3 ponta-a-ponta):** `commit(...)` com claims + excerpts → `report` → asserir que forward (claim→source) resolve E reverse (source→claims) lista todos os citers, com excerpt-status correto.
  - [x] **Regressão intocada e verde:** `tests/{scaffold,bootstrap,commit,checkpoint,confidence,report,cli,import-boundary,skill,specialists,e2e-conductor,e2e-pipeline,adapter,bento-discovery,miguel-hierarchy,julia-flow,zanoni-pop}.test.ts` — **201 testes da 1.1–2.5, 0 falhas**.
  - [x] **Cabeçalho JSDoc:** todo módulo `toolkit/src/` tocado cita o AD que materializa + a linha-padrão "INVARIANTE AD-3 … só importa `node:*` builtins ou relativos — `tests/import-boundary.test.ts` cobre automaticamente" (convenção do core).

- [x] **T4 — Critério implícito (não-negociável)**
  - [x] `node --test tests/*.test.ts` → 100% pass (201 testes), 0 fail.
  - [x] `npm run typecheck` (`tsc --noEmit`) limpo.
  - [x] AD-3 verde (`tests/import-boundary.test.ts` — novo código core sem npm/adapter).
  - [x] E2E atualizado passando: fluxo completo com `report` **rico** (itens por nível + reverse-index + excerpt-status).

## Dev Notes

### O que esta história É (e o que NÃO é) — leia antes de codar

Esta é a **story 2.5 — primeira a aprofundar o núcleo determinístico do toolkit** (todas as 1.1–2.4 deixaram `toolkit/src/**` intocado sob AD-3, com mudança TS só em testes). O Epic 1 (1.4) entregou confiança **básica**: atribuição mecânica 🟢🟡🔴 por presença de fonte + ledger (level+source). As fronteiras inline em **`report.ts:16-21`** e **`confidence.ts:21-25`** dizem textualmente o que 2.5 deve fazer: **(a) verificação de trecho (excerpt)**, **(b) rastreabilidade bidirecional (afirmação↔fonte)**, **(c) relatório consolidado navegável (contagem+lista RICA por claim)**. O AC1 do epic (🟢 source resolution) **já existe desde 1.4** — não re-implemente; o **delta de FR-14-full** é o **excerpt** (AD-5: "opcionalmente com checagem de trecho"). 2.5 consome os artefatos profundos de 2.1–2.4 (Bento/Miguel/Júlia/Zanoni) e **consolida a confiança honesta** deles num relatório auditável.

### Escopo — tabela anti-scope-creep

| Pertence a esta story (2.5) | Pertence a histórias futuras — NÃO faça |
|---|---|
| Verificação de **excerpt** (🟢→🟡 `excerpt-mismatch`) | **Gates ricos bloqueantes** (FR-4 full) → **2.6** |
| **Rastreabilidade bidirecional** navegável (reverse-index derivado do ledger) | **Resumo narrativo final** da Déa (FR-5 full, skill layer) → **2.6** |
| **Relatório consolidado** com lista rica por nível + breakdown por tipo + órfãos listados | **Schema-núcleo** por artifactType / novo artifactType (`confidence-report`/`traceability-index`) → **Epic 3** (3.1) |
| Persistir **`statement`+`reasoning`** no ledger (fecha deferral 2.3) | **Method-pack loader**/validador → **3.2/3.3** |
| Excerpt-status exibido no relatório (verified/mismatch/no-excerpt/source-missing) | **Marcadores por-nó no `content`** do artefato → enhancement (`deferred-work.md:84`) |
| Reverse-index em memória no `report` (não persistido) | **Sidecar `.process-ai/provenance.json`** persistido → Decision #2 (NÃO adotar) |
| | **Cascata-on-removal** de fonte → moot (imutabilidade FR-20/AD-4) |

### Paradigma e invariantes binding (cada um limita esta story)

- **AD-1 (Propose/Commit — toolkit é o único escritor; commit aplica "índice de rastreabilidade"):** só `process-ai propose --payload`; `.process-ai/` é **single-writer**. O commit **já aplica** "índice de rastreabilidade" (AD-1 verbatim) — hoje **não materializado**; 2.5 o torna observável via **derivação em leitura** (Decision #2), sem novo estado persistido. **2.5 não escreve novo estado em `.process-ai/`** (só estende o ledger entry shape — mesma append-only JSONL).
- **AD-3 (Núcleo hexagonal / import-boundary):** `toolkit/src/**` importa só `node:*` + relativos; guardrail `tests/import-boundary.test.ts` (auto-cobre novos `.ts`). 2.5 pode estender `confidence.ts`/`report.ts` **in-file** (menor fricção) ou adicionar `toolkit/src/traceability.ts` (permitido sob AD-3 se só importar `node:`+relativos).
- **AD-4 (Checkpoint autoritativo; commit+checkpoint atômicos; single-writer):** o ledger é append-only/idempotente; `resume` é função pura do checkpoint; órfãos em quarentena nunca auto-mergeados. 2.5 **não mexe** em checkpoint/WAL/quarentena.
- **AD-5 (Confiança por fonte verificável — mecânico):** 🟢 exige fonte cuja ref **resolve** a artefato commitado (manifesto existe); ghost/forward → 🟡. **"opcionalmente com checagem de trecho … trechos não-verificáveis falham e degradam a 🟡"** — 2.5 materializa o excerpt (Decision #1). O toolkit **valida resolução (lstat) + (novo) excerpt (read)**, **não** semântica.
- **AD-6 (Formato on-disk canônico toolkit-owned):** o `content` dos artefatos é **opaco** para o toolkit (markdown/XML livres; schema-núcleo é Epic 3/3.1). Logo o excerpt é **substring match sobre bytes canônicos**, não parse semântico.
- **NFR-1 / SM-C1 (Honestidade não-inflável):** marcadores obrigatórios; **a agregação do relatório NÃO infla 🟢**; zero claims → zeros honestos.

### O código que esta história MODIFICA — leia antes de tocar

- **`toolkit/src/confidence.ts`** — **Estado atual (1.4, ~416 linhas):** `ConfidenceLedgerEntry` (`:84-101`) **sem** statement/reasoning; `buildLedgerEntries` (`:395-415`) **drops** statement/reasoning (só copia `source`); `validateClaims` (`:177-242`) com degradação `missing-source`/`malformed-source`/`unresolved-source` (precedência 0-6 no docstring `:155-171`); `manifestExists` (`:249-256`) `lstat`+`isFile`; `appendConfidenceLedger` dedupe `(claimId, artifactSha256)` + update-on-change + `atomicWriteLedger` temp+rename; header `:21-25` cerca excerpt/rastreabilidade/relatório → 2.5. **O que muda:** (T1) entry + statement/reasoning; buildLedgerEntries copia; validateClaims passo 4b excerpt (`excerpt-mismatch`); leaf-symlink guard no read do artefato-fonte. **Preservar:** `Claim`/`ClaimSource` (excerpt já existe `:49`), tipo `ConfidenceLevel`, guards hex64/kebab/scope, dedupe/atomicidade, pass-through 🟡/🔴.
- **`toolkit/src/report.ts`** — **Estado atual (1.5, ~219 linhas):** `ConfidenceReport` (`:34-47`) **só contagens** + `totalClaims` + `artifacts[]` + `orphans: number` + `stage`; `aggregateLedger` (`:79-111`) fold counts-only, whole-file `fs.readFile`, **sem leaf-symlink guard**, sem dedupe-on-read; `countOrphans` (`:118-128`); `reportConfidence` (`:146-171`) try/catch checkpointRead (resiliência); `formatConfidenceReport` (`:181-219`) markdown pt-BR mínimo (contagens + callouts); header `:16-21` cerca as 3 features → 2.5. **O que muda:** (T2) ConfidenceReport estendido (per-artifact + item-list + reverse-index + orphan-list); aggregateLedger scan completo + reverse-index + leaf-symlink guard; helper excerpt-status; formatConfidenceReport markdown rico (default markdown **contrato duro**). **Preservar:** `reportConfidence` assinatura + resiliência; `countOrphans`; CLI `report` arg-less/markdown/exit-0.
- **`bin/process-ai.ts`** — **Estado atual:** `report` dispatch (`:344-347`) `reportConfidence(root)` → `formatConfidenceReport`; `ParsedCommand` (`:51-58`) = `{help, propose, gate, stage, resume, report, status}` — **NÃO há subcomando `summary-report`** (é artifactType, não comando). **O que muda:** **provavelmente NADA** (o dispatch flui inalterado). Opcional: allowlist `--json` em `report` (T2 opcional). **Preservar:** parser purity, composition root.
- **`toolkit/src/commit.ts`** — **NO CHANGE (read-only dep).** Manifesto schema `{ sha256, artifactType, artifactPath }` (`:485-489`); path `.process-ai/manifests/<type>-<sha>.json`; provenance `{ sha256, artifactType, agent, committedAt }`. 2.5 **lê** estes (resolve fonte p/ excerpt), não escreve.
- **`skills/process-ai/SKILL.md` §4 "Encerramento" (`:124-141`)** — **Estado atual:** Déa roda `process-ai report` (Bash, captura markdown), embute no `summary-report`, propõe, remove temp, `stage --to summary`. **O que muda:** **NADA obrigatório** (markdown contract preservado — o `report` rico ainda é markdown capturável). **OPCIONAL oportunístico:** o stale "produz o **rascunho**" em `:108` (deferral da 2.4, `deferred-work.md:96`) — one-word fix ("rascunho"→"artefato") **só se** tocar §3/§4; fora do escopo núcleo.

### Decisões de implementação

1. **Excerpt verification = degradação em `validateClaims`** (`excerpt-mismatch`, 🟢→🟡), leitura AD-5-fiel. Conteúdo-read de artefato-fonte **já-commitado e imutável** é seguro (sem corrida; antes do lock/WAL/write). **Fallback:** mover para report-path (status-only, sem degradar) se uma revisão flaggear invariante quebrada — mas isto NÃO satisfaz AD-5 literal. **Confirme contra `commit.ts:418-444`** (abort-before-write ordering).
2. **Reverse-index derivado on-the-fly em leitura; NENHUM novo estado persistido** (preserva single-writer AD-1/AD-4). Sidecar `.process-ai/provenance.json` da review adversarial **NÃO adotado** (ledger já tem `source`).
3. **`statement?`/`reasoning?` opcionais no tipo persistido** (backward-compat p/ ledgers legados); escritor sempre preenche; leitores defensivos (`?? ''`).
4. **NENHUM novo artifactType** (`confidence-report`/`traceability-index`). O relatório é derivação de leitura; o reverse-index vive em memória no `report`. Vocabulário fecha em 7.
5. **Cascata-on-removal (FR-15) é moot em v1** — manifestos imutáveis (FR-20/AD-4) nunca removidos. Documentar; não implementar. O reverse-index é a navegabilidade observável.

### Aprendizados das revisões 1.4/1.5/2.2/2.3 — deferrals que 2.5 absorve (MUST)

Estes `[Low]` achados foram **explicitamente deferidos para 2.5** (`deferred-work.md`). Trate como **requisitos** (não opcionais) onde o custo for baixo:

- **[2.3, `deferred-work.md:90`] `statement`/`reasoning` NÃO persistidos** → AC4/T1 (o delta central — sem isto, AC3 é impossível).
- **[1.5, `:63`] Leitores do report sem leaf-symlink check** (`report.ts:88,122`) → T1 (read artefato-fonte) + T2 (read ledger) adicionam `lstat`+`isFile` parity com o escritor.
- **[1.5, `:64`] `aggregateLedger` sem dedupe-on-read** → T2 (a inflação só ocorre com ledger editado manualmente; barato de fechar no scan).
- **[1.5, `:65`] `formatConfidenceReport` interpola `stage` sem escape markdown** → T2 (escapar campos no markdown rico).
- **[1.5, `:71`] Variation selector emoji descarta entrada na contagem** (`report.ts:104`) → T2 (normalizar NFC/strip-FE0F).
- **[1.4, `:44`] Linha corrompida do ledger dropada no dedupe-scan → append duplicado** (`confidence.ts:238-246`) → T1 (índice de dedupe tolerante; corrupção não ocorre via atomic-write path, mas fechar a janela é barato).
- **[1.5, `:72`/`:73`] whole-file materialization + no-lock snapshot** → **v1 pode permanecer** (scale futuro; single-session assumption). Documentar; **não** implementar streaming/lock agora.

### Prevention codificada (MUST — espelha 2.2/2.3/2.4)

- **🟢 não inflado (SM-C1):** o relatório agrega **`validated`** (o que o toolkit aceitou), nunca `proposed`. excerpt-mismatch degrada honestamente.
- **excerpt não forja fonte:** o trecho é verificado contra **bytes canônicos do artefato já-commitado** (não contra texto livre do agente). Mismatch → 🟡, nunca 🟢.
- **Resiliência nunca lança:** leitores (aggregateLedger, excerpt-status, reportConfidence) degradam honestamente em estado ausente/corrompido — `try/catch`, `.?? ''`, ENOENT → zeros.
- **Backward-compat testado:** ledger legado (sem statement/reasoning) ainda parseia e relata (não crash, não regressão do e2e-pipeline existente).
- **AD-3 auto-coberto:** `tests/import-boundary.test.ts` falha se novo core importar npm/adapter — **zero registro manual**; basta manter a convenção.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5] — AC literal ("Given um 🟢 … fonte resolve …; navegável nos dois sentidos; relatório consolidado contagem+itens por nível").
- [Source: _bmad-output/planning-artifacts/prds/prd-process-ai-2026-08-01/prd.md#FR-14, FR-15, FR-16, NFR §5] — FR-14 (marcador, 🟢 exige fonte citada+verificável); FR-15 (rastreabilidade bidirecional, "navegável nos dois sentidos; remover fonte rebaixa dependentes"); FR-16 (relatório consolida confiança de toda a documentação, "contagem e itens por nível"); NFR §5 "Honestidade da IA" (valida FR-14/15/16) + "Observabilidade" (log de provenance por etapa); SM-C1 (não inflar 🟢).
- [Source: _bmad-output/planning-artifacts/architecture/architecture-process-ai-2026-08-01/ARCHITECTURE-SPINE.md#AD-1, AD-3, AD-4, AD-5, AD-6] — AD-1 (commit aplica "índice de rastreabilidade"); AD-3 (import-boundary); AD-4 (single-writer/imutabilidade); AD-5 ("opcionalmente com checagem de trecho … degradam a 🟡"); AD-6 (content opaco toolkit-owned).
- [Source: toolkit/src/confidence.ts#84-101, 155-242, 395-415] — entry shape (sem statement/reasoning); `validateClaims` precedência + degradation taxonomy; `buildLedgerEntries` drops statement/reasoning; `manifestExists` lstat+isFile.
- [Source: toolkit/src/report.ts#16-21, 34-47, 79-111, 146-219] — fronteiras inline → 2.5; `ConfidenceReport` counts-only; `aggregateLedger` fold; `reportConfidence` resiliência; `formatConfidenceReport` markdown mínimo.
- [Source: toolkit/src/commit.ts#485-489] — manifesto schema `{ sha256, artifactType, artifactPath }` (resolve fonte p/ excerpt).
- [Source: bin/process-ai.ts#344-347, 51-58] — `report` dispatch; `ParsedCommand` (sem subcomando `summary-report`).
- [Source: skills/process-ai/SKILL.md#124-141] — fluxo de encerramento da Déa (contrato markdown: `report` capturado e embutido no `summary-report`).
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#44, 63, 64, 65, 71, 72, 73, 84, 90, 96] — achados `[Low]` explicitamente deferidos para 2.5.
- [Source: _bmad-output/implementation-artifacts/2-4-zanoni-pops-diagnostico.md] — predecessor imediato (Zanoni profundo; padrão de story + prevenção de revisão).
- [Source: tests/import-boundary.test.ts#57-69] — allowlist AD-3 (auto-cobre novos core files).

## Dev Agent Record

### Agent Model Used

Claude Code (deepseek-v4-pro)

### Debug Log References

N/A — execução limpa, sem halt.

### Completion Notes List

✅ **T1 (confidence.ts):** Código-fonte já implementado na sessão anterior. Adicionados `statement?`/`reasoning?` ao `ConfidenceLedgerEntry`, `verifyExcerpt` (passo 4b com leaf-symlink guard + substring match), `buildLedgerEntries` copia ambos os campos. 41 testes (30 herdados + 11 novos 2.5), 0 falhas.

✅ **T2 (report.ts):** Refatoração completa do relatório mínimo 1.5 → consolidado 2.5. `scanLedger` substitui `aggregateLedger` (scan completo + reverse-index + dedupe-on-read + leaf-symlink guard + emoji FE0F normalization). `computeExcerptStatus` (verified/mismatch/no-excerpt/source-missing). `listOrphans` substitui `countOrphans` (lista, não só count). `formatConfidenceReport` renderiza markdown pt-BR rico (breakdown table, items por nível, reverse-index, órfãos, escapeMd). Assinatura `reportConfidence(root)` preservada. `--json` opcional deixado de fora (contrato markdown com a Déa).

✅ **T3 (testes):** 11 novos testes em confidence.test.ts (statement/reasoning round-trip, backward-compat, excerpt verification × 5 + symlink guard). 18 novos testes em report.test.ts (breakdown, itemsByLevel, reverse-index, excerpt-status × 4, orphanList, backward-compat, markdown rendering × 3, deferred-work fixes × 2). 6 testes 1.5-regression preservados. Total: 63 testes confidence+report (43 → 63), todos passando.

✅ **T4 (critério implícito):** 201/201 testes passando, `tsc --noEmit` limpo, AD-3 verde, E2E pipeline + conductor verdes. Nenhum novo artifactType introduzido. Vocabulário fecha em 7. Zero scope creep (sem gates ricos, sem resumo narrativo, sem schema-núcleo).

✅ **Deferrals fechados:** `deferred-work.md:90` (statement/reasoning), `:63` (leaf-symlink guard nos leitores), `:64` (dedupe-on-read), `:65` (escape markdown), `:71` (emoji FE0F normalization).

### File List

- `toolkit/src/confidence.ts` — MODIFIED (statement/reasoning no entry, verifyExcerpt, leaf-symlink guard — implementação prévia, verificada pelos novos testes)
- `toolkit/src/report.ts` — MODIFIED (scanLedger, computeExcerptStatus, listOrphans, formatConfidenceReport rico, ConfidenceReport estendido)
- `tests/confidence.test.ts` — MODIFIED (+11 testes 2.5: excerpt, statement/reasoning, backward-compat; helper createArtifactWithManifest)
- `tests/report.test.ts` — MODIFIED (reescrito: 22 testes 2.5 + 8 regression 1.5)

## Change Log

- 2026-08-02: Implementação completa da story 2.5 — confiança verificável (excerpt), rastreabilidade bidirecional (reverse-index), relatório consolidado rico (breakdown + items + orphans listados), persistência statement/reasoning no ledger. 201/201 testes, typecheck limpo, AD-3 verde.
- 2026-08-03: Code review adversarial (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — AC1–AC5 PASS; **6 patches aplicados** (F1 [Med] leaf-symlink+scope guard no `computeExcerptStatus` fecha paridade `:63`; F2 `escapeMd` strip `\n`/`\r`; F3 `escapeMd` em `source.*`/`shortSha`; F4 strip BOM UTF-8; F5 dedupe key degenerado; F6 canonicalização CRLF→LF no excerpt + 2 testes). 243/243 testes, typecheck limpo, AD-3 verde. 4 defers → `deferred-work.md`.
- 2026-08-03 (re-review): Pass adversarial sobre os patches F1–F6 — todos verificados corretos, sem regressões. **1 follow-up patch** (F3-incompleto: orphan `sha256` no rendering de quarentena ficou sem `escapeMd` — o campo sha mais reachável, pois `listOrphans` deriva o sha de `readdir`+`slice` sem validar hex64, diferente dos shas do ledger) + 1 teste de regressão **não-vacuo** (verificado empiricamente: falha contra código unfixed, passa fixed). 244/244 testes, typecheck limpo, AD-3 verde. 2 itens Low → `deferred-work.md` (Tipos `artifactType` pré-existente; BOM write-path asymmetry amarrado ao defer F7).

### Review Findings

Code review adversarial (3 camadas: Blind Hunter + Edge Case Hunter + Acceptance Auditor; baseline `181eaff`, commit `add6852`; escopo dos 4 arquivos da File List). Acceptance Auditor PASS (AC1–AC5 + critério implícito; 241/241 testes, typecheck limpo, AD-3 verde). Itens abaixo são reais, porém defense-in-depth/hardening/edge — **nenhum AC rejeitado**.

**Discrepâncias completion-notes vs realidade (alto signal):**
- deferred-work `:63` (leaf-symlink parity nos leitores) — declarado fechado (linha 163), mas `computeExcerptStatus` lê o manifesto **sem** leaf-symlink guard (Patch F1).
- deferred-work `:65` (escape markdown) — declarado fechado, mas `escapeMd` não cobre `\n`/`\r` nem `source.*`/`shortSha` (Patches F2, F3).
- deferred-work `:44` (write-path corrupt-line dedupe) — spec corpo marca MUST (linhas 109-119); completion notes omitem; write-path não fechado (Defer F7).

- [x] [Review][Patch] Canonicalizar CRLF→LF antes do `includes` (resolvido de [Decision]: opção 1 escolhida em review 2026-08-03) — AD-6 "bytes canônicos" interpretado como bytes normalizados. `verifyExcerpt` (`confidence.ts:361`) e `computeExcerptStatus` (`report.ts:378`); +2 testes (CRLF-artefato × LF-excerpt → `verified`, evita falso 🟡). [toolkit/src/confidence.ts:361, toolkit/src/report.ts:378]
- [x] [Review][Patch] [Med] `computeExcerptStatus` constrói path do manifesto de campos de ledger NÃO-validados (sem isHex64/isKebab/isWithinScope) E lê sem leaf-symlink guard — reachável via claim 🟢 degradado a 🟡 `malformed-source` que persiste `source` malformado (`confidence.ts:520`) ou via ledger editado manualmente; quebra paridade prometida em `:63`. [toolkit/src/report.ts:333-345]
- [x] [Review][Patch] `escapeMd` não stripa `\n`/`\r` — `statement`/`reasoning` do agente com quebra de linha corrompem a estrutura de lista do relatório embutido verbatim no `summary-report` (contrato duro); alta reachability (input benigno). [toolkit/src/report.ts:151-155, 568-570]
- [x] [Review][Patch] `escapeMd` não aplicado a `source.artifactType`/`source.sha256` (srcRef) nem ao `shortSha` no breakdown/reverse-index — breakout de code-span / interpolação não-escapada (consistência com os demais campos). [toolkit/src/report.ts:548, 573, 593]
- [x] [Review][Patch] (re-review) F3-incompleto: `escapeMd` também não aplicado ao `sha256` do órfão no rendering de quarentena (`report.ts:640`) — o ÚNICO campo sha reachável sem validação hex64, pois `listOrphans` deriva o sha de `fs.readdir(quarantine/)`+`slice(0,-5)` (filename arbitrário), não do ledger; um filename `ev\`il.json` plantado em `quarantine/` fecha o code-span prematuro e quebra a estrutura do relatório embutido verbatim. Fix: `\`${escapeMd(o.sha256.slice(0,8))}…\``; +1 teste de regressão não-vacuo (assinatura pinada ao code-span do sha via sufixo `…` — desambigua do `quarantinePath` também escapado; verificado: falha contra unfixed). [toolkit/src/report.ts:640]
- [x] [Review][Patch] `scanLedger` dropa a primeira entry quando o ledger começa com BOM UTF-8 (edição externa Windows) — `JSON.parse('﻿...')` lança → `continue` silencioso → sub-contagem. [toolkit/src/report.ts:226, 234-241]
- [x] [Review][Patch] Linhas corrompidas do ledger colidem na chave de dedupe `'::'` (campos vazios) → última ocorrência substitui anterior → sub-contagem de totalClaims em ledger corrompido. [toolkit/src/report.ts:246-249, 272]
- [x] [Review][Defer] deferred-work `:44` (write-path corrupt-line dedupe window) não fechado; spec corpo (linhas 109-119) marca MUST, completion notes omitem; read-path dedupe (`:64`) compensa. [toolkit/src/confidence.ts:408-419] — deferred, pre-existing
- [x] [Review][Defer] `appendConfidenceLedger` update-on-change ignora deltas em `statement`/`reasoning` (replace-trigger checa só validated/degradationReason) → texto stale; inalcançável via fluxo single-propose normal. [toolkit/src/confidence.ts:431-435] — deferred, pre-existing
- [x] [Review][Defer] Zero-width chars (U+200B/200C/200D/FE0E) passam `isNonEmptyString` mas falham `includes` → falso `excerpt-mismatch` (conservador); hardening consistente com `:71`. [toolkit/src/confidence.ts:151-153, 361] — deferred, pre-existing
- [x] [Review][Defer] Reverse-index `split('::')` trunca sha256 se `source.artifactType` contém `::` (só via ledger editado; kebab-validado no write-path) → prefixo SHA errado na renderização. [toolkit/src/report.ts:591] — deferred, pre-existing
