---
baseline_commit: NO_VCS
---

# Story 1.2: Toolkit — propose/commit com SHA-256 (não-destrutivo)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **dev**,
I want **o toolkit Node como único escritor, commitando artefatos com manifesto SHA-256 + provenance**,
so that **artefatos sejam gravados com não-destrutividade e provenance verificável, sem que o agente (ou o adapter) precise saber de nada disso**.

## Acceptance Criteria

1. **[AC1] Toolkit é o único escritor (AD-1)** — **Given** um payload proposto via canal toolkit-owned, **When** o toolkit commita, **Then** ele escreve **somente** em `_process-ai_output/` e `.process-ai/` sob o *root* da sessão; nenhum arquivo fora dessas duas pastas é criado/modificado. *(FR-20, AD-1)*

2. **[AC2] Manifesto SHA-256 + provenance** — **Given** um commit, **When** o toolkit finaliza, **Then** existe um **manifesto SHA-256** (hash sobre os bytes canônicos do artefato) em `.process-ai/` e uma **entrada de provenance** (agente, artifactType, sha256) registrada em `.process-ai/`; o conteúdo commitado em `_process-ai_output/` tem hash que bate com o manifesto. *(FR-20, AD-1, NFR-5)*

3. **[AC3] Não-destrutivo aborta fora do escopo** — **Given** um `artifactType`/path que escaparia das pastas protegidas (ex.: `../x`, path absoluto, ou caracteres não-seguros no nome), **When** o toolkit tenta commitar, **Then** ele **aborta com erro acionável ANTES de qualquer escrita**; nada é gravado. *(FR-20, AD-1)*

4. **[AC4] Adapter pass-through não muta (AD-3)** — **Given** um payload qualquer, **When** passa por `ClaudeCodeAdapter.propose()`, **Then** o payload chega ao toolkit **sem mutação** (deep-equal ao snapshot pré-chamada); o adapter apenas **delega** ao commit e devolve um `CommitResult` (com o `sha256`); o adapter **não** implementa SHA/manifesto/provenance. *(AD-1, AD-3)*

5. **[AC5] Determinismo + idempotência** — **Given** o mesmo payload, **When** commitado (1× ou N×), **Then** produz o **mesmo `sha256`** (serialização canônica determinística) e **não duplica nem corrompe** o artefato/manifesto (re-commit do mesmo conteúdo = estado estável). *(AD-1, ethos "determinístico" do toolkit)*

6. **[AC6] Validação runtime do payload (deferred da 1.1)** — **Given** um payload malformado, **When** proposto, **Then** o toolkit rejeita com erro acionável: `null`/`undefined`, `artifactType` ausente/não-string/vazio, ou `content` ausente. *(Item deferred explícito da story 1.1 → pertence ao contrato commit/SHA-256)*

> **Critério implícito (não-negociável):** a história deixa o sistema "rodável ponta-a-ponta" no escopo dela — `node --test` 100% verde, `npm run typecheck` (`tsc --noEmit`) limpo, e o guardrail **AD-3** (`tests/import-boundary.test.ts`) permanece verde **com o novo `commit.ts` no core**. Não basta "satisfazer os ACs literais".

## Tasks / Subtasks

- [x] **T1 — `toolkit/src/commit.ts`: serialização canônica + SHA-256 (AC: #2, #5)**
  - [x] Função `canonicalize(content)` → string determinística (JSON com chaves ordenadas estáveis; tratamento de `unknown` sem depender de ordem de inserção de chave). **Decida** o formato canônico e registre na Completion Notes.
  - [x] `sha256(bytes)` via `node:crypto` `createHash('sha256')` (zero deps; alinha ao allowlist AD-3). Hash sobre os **bytes UTF-8 da forma canônica**.
  - [x] Ainda **não** integrar ao adapter (T6); T1 é a base testável isoladamente.

- [x] **T2 — Paths + enforcement de escopo + sanitização do `artifactType` (AC: #1, #3)**
  - [x] Constantes/resolve de `_process-ai_output/` e `.process-ai/` sob um `root` (default `process.cwd()`). Considere um `paths.ts` ou constants em `commit.ts` (decisão do dev).
  - [x] `sanitizeArtifactType(raw)` → `kebab-case` restrito; **rejeitar** se contiver `..`, `/`, `\`, `:`, ou não casar com a allowlist de chars. (Previne path traversal via `artifactType`.)
  - [x] `assertWithinScope(absPath, root)` → containment check robusto (`path.resolve` + `startsWith` do diretório + `path.sep`); rejeita path absoluto fora do root e traversal. **Antes** de qualquer `writeFile`.
  - [x] Defense-in-depth opcional (espelhar a 1.1): recusar componente symlink no caminho (lstat-walk) — **opcional em 1.2**, registre se aplicar.

- [x] **T3 — Manifesto SHA-256 + provenance + escrita atômica (AC: #2)**
  - [x] Manifesto em `.process-ai/manifests/<sha>.json` (content-addressed; **determinístico** — sem timestamp no manifesto, para idempotência byte-estável). Campos: `{ sha256, artifactType, artifactPath }`.
  - [x] Artefato em `_process-ai_output/<artifactType>/<sha>.<ext>` (content-addressed → dedupe natural; `ext` por tipo, default `.md`).
  - [x] Provenance: append em `.process-ai/provenance.jsonl` (uma linha JSON por commit: `{ sha256, artifactType, agent, committedAt }`). Idempotência: **não** reinsere linha idêntica `(sha256, agent)`.
  - [x] Escrita **atômica** (temp + `fs.rename` no mesmo diretório; cleanup do temp em falha) — espelhar o padrão CR-hardening da 1.1 (`adapter.ts:101-111`). **Não** é o WAL do AD-4 (isso é 1.3) — é só atomicidade por-arquivo.

- [x] **T4 — Validação runtime do payload + abort-before-write (AC: #3, #6)**
  - [x] `validatePayload(payload)`: rejeita `null`/`undefined`, `artifactType` ausente/não-string/vazio, `content` ausente (`null`/`undefined`). Erro acionável (mensagem + contexto), errno-agnostic (aprendizado da 1.1: traduzir, não relançar cru).
  - [x] Ordenação garantida: **validar → sanitizar → checar escopo → só então escrever**. Falha em qualquer passo anterior = zero escrita.

- [x] **T5 — Cristalizar a porta `EngineAdapter` (AC: #4)**
  - [x] `toolkit/src/engine-adapter.ts`: `ProposePayload` amadurece (mantém `artifactType` + `content`; `claims?` permanece opaco — cristaliza em 1.4).
  - [x] Adicionar `CommitResult` (retorno do commit): no mínimo `{ sha256: string; artifactPath: string; manifestPath: string }`.
  - [x] Trocar o retorno de `propose()` de `Promise<unknown>` para `Promise<CommitResult>`.
  - [x] **Zero imports** de engine neste arquivo (mantém o guardrail AD-3).

- [x] **T6 — `ClaudeCodeAdapter.propose()` delega ao commit (AC: #4)**
  - [x] `toolkit/adapters/claude-code/adapter.ts`: remover o stub `return payload` (echo). `propose()` agora chama o `commit()` do toolkit com `root` resolvido.
  - [x] **Decisão do dev (registre):** como o adapter obtém o `root`. Recomendado: construtor `new ClaudeCodeAdapter({ cwd } = {})` default `process.cwd()`, guardado como estado de instância; `propose()` passa `this.cwd` ao commit. Mantém a assinatura da porta (`propose(payload)`) limpa e é testável (injetar `cwd = tmpdir`).
  - [x] O adapter **continua pass-through**: não computa SHA, não escreve manifesto, não muta payload.

- [x] **T7 — Testes (AC: #1–#6 + AD-3 + atomicidade + idempotência)**
  - [x] **`tests/commit.test.ts` (NOVO):**
    - commit escreve artefato em `_process-ai_output/<type>/` + manifesto em `.process-ai/manifests/` + linha em `.process-ai/provenance.jsonl` (AC2)
    - sha do manifesto bate com sha computado do conteúdo (AC2)
    - **nada fora** de `_process-ai_output/` + `.process-ai/` (snapshot do root; AC1) — espelhar `bootstrap.test.ts:77-90`
    - traversal/absoluto/char-não-seguro em `artifactType` → aborta, **zero escrita** (AC3)
    - mesmo payload → mesmo sha; re-commit não duplica/corrompe, manifesto byte-estável (AC5)
    - escrita atômica: sem arquivo torn/0-byte após falha simulada (espelhar 1.1; AC implícito)
    - payload null/undefined/sem-artifactType/sem-content → erro acionável (AC6)
  - [x] **`tests/adapter.test.ts` (ATUALIZAR — regressão intencional):** o teste `AC4: propose() é pass-through` atual (que asserciona `deepEqual(result, payload)`) **vai quebrar** — `result` agora é `CommitResult`. Reescreva para: (a) payload não mutado (deep-equal ao snapshot), (b) `result.sha256` presente, (c) conteúdo lido de `_process-ai_output/` é deep-equal ao `payload.content`. **Use `new ClaudeCodeAdapter({ cwd: tmp })`** — senão o commit grava no cwd=repositorio e polui o repo.
  - [x] **`tests/import-boundary.test.ts`:** sem mudança esperada, mas o guardrail agora cobre `commit.ts` automaticamente — confirme verde (AD-3 estendido).

- [x] **T8 — Critério implícito (não-negociável)**
  - [x] `node --test` → 100% pass (suíte existente da 1.1 + nova da 1.2); zero regressões.
  - [x] `npm run typecheck` (`tsc --noEmit`) limpo.
  - [x] AD-3 verde com `commit.ts` no core (commit importa só `node:*`).

### Review Findings

**Code review executado em 2026-08-01.** 3 camadas paralelas: Blind Hunter (adversarial), Edge Case Hunter (branching paths), Acceptance Auditor (AC1–AC6). 46/46 testes verdes, `tsc --noEmit` limpo, AD-3 verde com `commit.ts` no core. Todos os 6 ACs funcionalmente satisfeitos no happy path. Achados abaixo cobrem defeitos de borda, robustez e qualidade de erro.

#### decision_needed

_(Resolvidos — D1 movido para patch, D2 movido para defer.)_

#### patch

- [x] **[Review][Patch] D1: Manifest SHA-only key → cross-artifactType corruption (AC2, AC5)** — ✅ Corrigido: prefixo `<type>-<sha>.json`. Manifesto em `.process-ai/manifests/<artifactType>-<sha>.json`. `[commit.ts]`

- [x] **[Review][Patch] P1: Provenance leaf-symlink escapa do escopo protegido (AC1)** — ✅ Corrigido: `lstat` do leaf `provenance.jsonl` antes do append em `appendProvenance`, espelhando `adapter.ts:110-120`. `[commit.ts]`

- [x] **[Review][Patch] P2: Conteúdo circular → RangeError cru, não CommitError acionável (AC6)** — ✅ Corrigido: `WeakSet` em `stableStringify` para rastrear objetos visitados; lança `CommitError` com mensagem acionável. `[commit.ts]`

- [x] **[Review][Patch] P3: Provenance dedupe key `(sha256, agent)` colapsa artifactTypes distintos (NFR-5)** — ✅ Corrigido: chave de dedupe agora é `(sha256, agent, artifactType)`. `[commit.ts]`

- [x] **[Review][Patch] P4: Provenance append é O(n²) com race window (AC5)** — ✅ Corrigido: cache `Map<path, Set<dedupeKey>>` em memória; arquivo lido só no primeiro commit; O(1) por chamada subsequente. `[commit.ts]`

- [x] **[Review][Patch] P5: writeFile sem cleanup em falha deixa .tmp- órfão** — ✅ Corrigido: try/catch com `fs.rm(tmp, {force:true})` no `writeFile` também, não só no `rename`. `[commit.ts]`

- [x] **[Review][Patch] P6: `adapter.ts` installSkills temp name é só pid (concorrência)** — ✅ Corrigido: `installTempCounter` adicionado; temp nome usa `pid + counter`. `[adapter.ts]`

- [x] **[Review][Patch] P7: Root apontando para arquivo, não diretório → ENOTDIR opaco** — ✅ Corrigido: `resolveRoot` agora é async, valida com `fs.stat` + `isDirectory()` e lança `CommitError` acionável. `[commit.ts]`

- [x] **[Review][Patch] P8: `assertWithinScope` é case-sensitive no Windows (AC1)** — ✅ Corrigido: `toLowerCase()` em `resolvedScope` e `resolvedAbs` quando `process.platform === 'win32'`. `[commit.ts]`

- [x] **[Review][Patch] P9: `cwd` e `agent` vazios no adapter silenciosamente aceitos** — ✅ Corrigido: validação no construtor — rejeita strings vazias com erro descritivo. `[adapter.ts]`

- [x] **[Review][Patch] P10: `sanitizeArtifactType` não trata reserved names do Windows** — ✅ Corrigido: blocklist `WIN_RESERVED` (CON, NUL, AUX, PRN, COM1-9, LPT1-9). `[commit.ts]`

- [x] **[Review][Patch] P11: Pasta protegida pré-existindo como arquivo regular → ENOTDIR opaco** — ✅ Corrigido: `assertNoSymlinkComponent` agora checa `isDirectory()` no else do symlink check. `[commit.ts]`

- [x] **[Review][Patch] P12: `CommitResult` paths com separadores inconsistentes** — ✅ Corrigido: `CommitResult.artifactPath` e `manifestPath` normalizados para `/`. `[commit.ts]`

- [x] **[Review][Patch] P13: Decoupling `--target` vs `cwd` é footgun latente** — ✅ Corrigido: JSDoc expandido no `ClaudeCodeAdapterOptions.cwd` documentando a distinção `--target` vs `cwd`. `[adapter.ts]`

- [x] **[Review][Patch] P14: Source SKILL.md ausente → ENOENT cru** — ✅ Corrigido: `fs.stat` + verificação `isFile()` antes do `readFile`; erro descritivo com path completo. `[adapter.ts]`

- [x] **[Review][Patch] P15: `EXT_BY_TYPE` pode injetar separadores no path do artefato** — ✅ Corrigido: validação de extensão contra allowlist `[a-z0-9.-]+` + rejeição de `..` e separadores. `[commit.ts]`

- [x] **[Review][Patch] P16: Test gaps para os achados acima** — ✅ Corrigido: +11 testes em `commit.test.ts` (P1/P2/P3/D1/P7/P8/P10/P11/P15) + 4 testes em `adapter.test.ts` (P9/P12). Total: 60 testes (eram 46). `[tests/commit.test.ts, tests/adapter.test.ts]`

#### defer

- [x] **[Review][Defer] D2: Non-plain objects (Date/Map/Set/RegExp) colapsam para `{}` → perda silenciosa (AC5)** — ✅ Decidido: documentar invariante "content deve ser JSON-plain", enforcement adiado para Story 3.1 (AD-2). Consistente com `content: unknown` opaco. `[commit.ts:73-86]` — deferred: invariante documentado, enforcement em 3.1
- [x] **[Review][Defer] W1: Falha parcial deixa artefato órfão sem manifesto/provenance (AC2 boundary)** — Se manifest ou provenance falham após artefato escrito, `_process-ai_output/<type>/<sha>.md` existe sem manifesto. Exatamente a fronteira 1.3 WAL/quarentena; documentado, não implementar aqui. `[commit.ts:329-343]` — deferred: Story 1.3 WAL boundary
- [x] **[Review][Defer] W2: TOCTOU symlink race entre walk e write (AC1 "estanque" overstated)** — Componente de diretório trocado por symlink após `assertNoSymlinkComponent` e antes de `mkdir`/`writeFile`. Não fechável sem `O_NOFOLLOW` (não-portátil no Windows). `[commit.ts:323-325]` — deferred: O_NOFOLLOW não disponível no Windows
- [x] **[Review][Defer] W3: Prototype pollution bypassa validação de payload** — `validatePayload` usa `p.artifactType`/`p.content` sem `Object.hasOwn`; propriedade herdada via `Object.prototype` poluído passaria na validação. Cenário extremamente improvável (conteúdo vem de agentes, não input externo). `[commit.ts:193-203]` — deferred: conteúdo de agentes, não input adversarial
- [x] **[Review][Defer] W4: Sem `fsync` em `atomicWriteFile` (durabilidade)** — `temp + rename` sem fsync; em power loss o rename pode persistir com dados não-flushados. Durabilidade não é claim da 1.2. `[commit.ts:215-225]` — deferred: durabilidade não reivindicada em 1.2
- [x] **[Review][Defer] W5: Extensão `.md` para conteúdo objeto/JSON é frágil** — Objetos escritos como `.md`; `adapter.test.ts:72` faz `JSON.parse` sobre `.md`. Acoplamento quebra quando extensões mudarem em 3.1. `[commit.ts:40, 315-316]` — deferred: resolve em 3.1 (AD-2)

#### dismissed

- ~~String=JSON canonical collision~~ — regra documentada ("string passa direto"), conteúdo opaco até 3.1. Consciente, não é bug.
- ~~Accessor/Proxy trap → raw error~~ — cenário inexistente na prática (payloads vêm de agentes).
- ~~Redundant traversal pre-check in sanitizeArtifactType~~ — deliberado para mensagens de erro distintas (UX).
- ~~tempCounter overflow além de 2^53~~ — requer > 9×10^15 commits na mesma sessão.
- ~~`registerSlashCommands` no-op como violação de AC4~~ — documentado desde a 1.1; ação distinta de propose.

## Dev Notes

### O que esta história É (e o que NÃO é) — leia antes de codar

Esta é a **story 1.2 de 6 do Epic 1** (Walking Skeleton). Ela prova **uma coisa só**: o paradigma **propose/commit não-destrutivo** — agentes propõem, o toolkit commita com **SHA-256 + provenance**, escrevendo **só** nas pastas protegidas. O commit real substitui o stub `propose()` da 1.1 (que era `return payload`).

**Não construa aqui (scope creep — cada item pertence a outra story):**

| Pertence a 1.2 (esta) | Pertence a histórias futuras — NÃO faça |
|---|---|
| `commit.ts` (SHA-256 + manifesto + provenance + escopo + validação de payload) | `checkpoint.ts` / **WAL** / resume / quarentena de órfão → **1.3** |
| Manifesto SHA-256 + provenance.jsonl | **Transação atômica commit+checkpoint** (AD-4 WAL) → **1.3** |
| `ClaudeCodeAdapter.propose()` delega ao commit (pass-through) | Atribuição **mecânica** 🟢🟡🔴 por fonte + **ledger** de confiança → **1.4** |
| `CommitResult` na porta `EngineAdapter` | **Índice de rastreabilidade bidirecional** (AD-1/AD-5 full) → amadurece em **1.4/2.5** |
| Validação **de shape** do payload (estrutura) | **BPMN 2.0 XML canônico** (AD-6) → **2.3** (1.2 trata `content` como opaco) |
| Enforcement de escopo (só `_process-ai_output/` + `.process-ai/`) | **Schema-núcleo** por tipo de artefato (AD-2) → **3.1** |

> **Fronteira 1.2 ↔ 1.3 (não-negociável):** AD-1 *descreve* o commit completo (incluindo "avanço atômico do checkpoint (AD-4)"), mas a **transação atômica commit+checkpoint via WAL + quarentena de órfão é literalmente a Story 1.3**. Em 1.2 você commita **artefato + manifesto + provenance** com atomicidade **por-arquivo** (temp+rename, padrão 1.1) — mas **NÃO** acopla isso a um checkpoint transacional. Não escreva `.process-ai/checkpoint` nem implemente WAL/lock single-writer; isso é 1.3.

> **Fronteira 1.2 ↔ 1.4:** AD-1 menciona "validação do marcador de confiança". Em 1.2 isso se satisfaz só como **validação de shape do payload** (estrutura presente). A **atribuição semântica** 🟢🟡🔴 por presença de fonte + **ledger** é a **Story 1.4** (FR-14, AD-5). Não implemente lógica de confiança aqui.

### Paradigma e invariantes binding (não quebre)

- **AD-1 — Propose/Commit (o coração desta história):** o toolkit Node é o **único escritor** de `_process-ai_output/` e `.process-ai/`. Agentes só propõem via canal cujo **shape é toolkit-owned**; o adapter é **pass-through**. Em todo commit: **manifesto SHA-256 + provenance** (+ validação de marcador → 1.4; + avanço atômico de checkpoint → 1.3). Skills **não têm** acesso de escrita às pastas protegidas. [Source: ARCHITECTURE-SPINE.md#AD-1, SPEC.md#CAP-9]
- **AD-3 — Núcleo hexagonal:** o `commit.ts` vive no core (`toolkit/src/`) e **só pode importar** `node:*` builtins ou caminhos relativos — nunca um package npm (o allowlist do `import-boundary.test.ts` baniria). O adapter chama o commit; o commit não conhece adapter. [Source: ARCHITECTURE-SPINE.md#AD-3]
- **FR-20 — Não-destrutivo:** escrita só em `_process-ai_output/` + `.process-ai/`; manifesto SHA-256 por output; **escrita fora aborta a etapa com erro**. [Source: prd.md §4.9/FR-20, glossary.md "Garantia não-destrutiva"]
- **NFR-5 — Observabilidade:** log de provenance por etapa em `.process-ai/` (um registro por etapa: agente, ação, fonte, marcador). Em 1.2: agente + artifactType + sha (+ timestamp). [Source: prd.md §5]

### O código que esta história MODIFICA — leia antes de tocar

_(Não-negociável: ler o estado atual antes de mudar. Fontes: `toolkit/src/engine-adapter.ts`, `toolkit/adapters/claude-code/adapter.ts`, `tests/adapter.test.ts`.)_

**`toolkit/src/engine-adapter.ts` (UPDATE):**
- **Estado atual:** define `ProposePayload { artifactType: string; content: unknown; claims?: unknown[] }` e a porta `EngineAdapter` com `propose(payload): Promise<unknown>`. O comentário do arquivo já diz: *"amadurece em 1.2 (commit/SHA-256) e 1.4 (confiança/ledger)"*.
- **O que muda:** `ProposePayload` cristaliza (pode estreitar tipos, mas `claims?` permanece opaco → 1.4); **adiciona `CommitResult`**; troca o retorno de `propose()` para `Promise<CommitResult>`.
- **O que preservar:** a invariante AD-3 (zero imports de engine) — o arquivo continua sendo a porta limpa.

**`toolkit/adapters/claude-code/adapter.ts` (UPDATE):**
- **Estado atual:** `propose(payload)` é um **stub pass-through** que faz `return payload` (echo), com JSDoc explícito: *"O commit real (manifesto SHA-256, ledger) é a story 1.2."*.
- **O que muda:** remover o echo; `propose()` agora **delega ao `commit()`** do toolkit, devolvendo o `CommitResult`. O adapter precisa do `root` (ver decisão T6). Mantém o `installSkills`/`registerSlashCommands` intocados (são da 1.1 e seguem verdes).
- **O que preservar:** o adapter **continua pass-through** — não implementa SHA/manifesto/provenance; não muta payload. A composition root (`bootstrap.ts`) continua fazendo `new ClaudeCodeAdapter()` (o novo ctor com `cwd` default mantém isso compatível).

**`tests/adapter.test.ts` (UPDATE — regressão intencional):**
- **Estado atual:** o teste `AC4: propose() é pass-through` asserciona `deepEqual(result, payload)` — **vai quebrar** quando `result` virar `CommitResult`.
- **O que fazer:** reescrever (T7). E injetar `cwd = tmpdir` no adapter, senão o commit grava `_process-ai_output/` no **repositório do framework** (poluição — o `.gitignore` da 1.1 já cobre essas pastas, mas em teste use tmpdir).

> **A story deve deixar o sistema funcionando ponta-a-ponta.** O comportamento emergente (commit real) deve substituir o stub sem quebrar o que já passa. Se algo precisa funcionar para o commit operar no sistema existente (ex.: o adapter saber o root), é requisito desta story — o dev é dono disso.

### Decisões de implementação (registre as escolhas na Completion Notes)

1. **Root da sessão / como o adapter sabe onde escrever (T6 — a decisão mais importante).** O `commit()` precisa de um `root` (default `process.cwd()` = o projeto-alvo onde a sessão roda). Recomendado: `ClaudeCodeAdapter({ cwd } = {})` guarda o root como estado de instância; `propose()` passa `this.cwd`. Mantém a porta limpa (`propose(payload)`) e é testável (injetar `cwd`). **Registre a escolha.** [Porque: a sessão roda no cwd do usuário; o `--target` do bootstrap é só pro install da skill, não pro commit.]
2. **Formato do manifesto + provenance (zero deps).** Node 24 **não tem** parser YAML/TOML built-in, e o allowlist AD-3 **proíbe** package npm no core. Logo: **manifesto = JSON** (`.process-ai/manifests/<sha>.json`) e **provenance = JSONL append** (`.process-ai/provenance.jsonl`). O "TOML+YAML" do spine refere-se a **configs humanas** (pack/config) — manifestos/provenance são machine-owned → JSON é fiel + zero-dep. [Source: ARCHITECTURE-SPINE.md#Consistency Conventions "Data & formats"]
3. **Canonicalização para SHA determinístico (T1).** Hash sobre bytes UTF-8 de uma forma **canônica** (JSON chaves ordenadas). Sem isso, o mesmo `content` (objeto) produz sha diferente por ordem de chave → quebra AC5. **Registre** a regra de canonicalização.
4. **Idempotência byte-estável (AC5).** O **manifesto** não carrega timestamp (byte-estável entre re-commits). O **timestamp** vive só na **provenance** (append-only); idempotência lá = não reinsere linha `(sha, agent)` idêntica. [Porque: 1.1 endureceu idempotência byte-estável; carregar timestamp no manifesto quebraria isso.]
5. **Content-addressed = dedupe natural.** Artefato = `_process-ai_output/<type>/<sha>.<ext>`; manifesto = `.process-ai/manifests/<sha>.json`. Mesmo conteúdo → mesmo path → overwrite de bytes idênticos → idempotente sem lógica extra. (Alinha ao ethos "determinístico" + ao Reversa.)
6. **Test runner `node:test`, zero deps de runtime.** (Decisão 1.1 — mantida.) Suíte atual: 23 testes; esta story adiciona `commit.test.ts` e atualiza 1 teste do `adapter.test.ts`.

### Enforcement de escopo — o análogo ao guardrail AD-3 da 1.1

AC3 ("escrita fora aborta") é o **guardrail mais importante** desta história — é ele que materializa "não-destrutivo". Estratégia (espelhar a filosofia defense-in-depth da 1.1):
- **Sanitizar `artifactType`** (kebab-case restrito; rejeitar `..`, `/`, `\`, `:`) antes de usá-lo em path.
- **Containment check** (`assertWithinScope`): `path.resolve` + `startsWith(dir + path.sep)` no path absoluto do artefato E do manifesto, **antes** de qualquer `writeFile`.
- **Atomicidade por-arquivo** (temp + rename) para não deixar arquivo corrompido se a escrita falhar mid-way.
- (Opcional, registre se aplicar) **lstat-walk** recusando symlink no caminho — igual ao `adapter.ts:65-82` da 1.1.

### Padrões de teste estabelecidos (espelhar — não reinventar)

- `node:test` + `node:assert/strict`; tmpdir via `fs.mkdtemp(os.tmpdir())`; `finally { fs.rm(...) }`.
- Snapshot recursivo para idempotência/escopo (ver `bootstrap.test.ts:27-43` — inclui `mode`).
- E2E via `spawnSync(process.execPath, [BOOTSTRAP, ...])` quando pertinente.
- Atomic write validado por asserção de **conteúdo** (não só `isFile()`) — lição da 1.1.
- **Skip explícito** em testes de symlink no Windows sem Developer Mode (`t.skip(...)`, não `return` vazio — lição CR R2#3 da 1.1).

### Convenções (do spine, herdadas da 1.1)

- Naming `kebab-case`; IDs globais estáveis (FR-n, AD-n) — nunca renumerados.
- Node 24 LTS (spine vence PRD §10 — confirmado `v24.18.1` na 1.1); TS + ESM; imports `.ts` com extensão explícita (type-stripping nativo).
- Sem deps de runtime no core (AD-3 allowlist: só `node:` + relativos).

### Project Structure Notes

- **Greenfield incremental:** a 1.1 criou o scaffold + porta + adapter + bootstrap. Esta 1.2 adiciona o **primeiro módulo de escrita** (`commit.ts`) e **ativa** o canal propose/commit (antes inerte). Sem risco de regressão além dos pontos marcados UPDATE acima.
- **Alvo ≠ framework:** o commit escreve no **root da sessão** (cwd do usuário = projeto-alvo), jamais nas pastas do framework. Testes injetam tmpdir como root. [Source: `1-1-...md` Project Structure Notes]
- **`.gitignore` da 1.1 já cobre** `_process-ai_output/` e `.process-ai/` — mas testes ainda usam tmpdir (não poluir o repo).
- **Layout resultante** (delta em negrito):
  ```text
  toolkit/
    src/
      engine-adapter.ts   # UPDATE: ProposePayload cristaliza + CommitResult
      commit.ts           # NEW (esta story): SHA-256 + manifesto + provenance + escopo + validação
    adapters/claude-code/
      adapter.ts          # UPDATE: propose() delega ao commit (pass-through)
  tests/
    commit.test.ts        # NEW
    adapter.test.ts       # UPDATE: AC4 reescrito (CommitResult + cwd=tmp)
    import-boundary.test.ts  # sem mudança; cobre commit.ts automaticamente
  # No root da sessão (gerado pelo toolkit):
  _process-ai_output/<artifactType>/<sha>.<ext>   # artefato
  .process-ai/manifests/<sha>.json                # manifesto SHA-256
  .process-ai/provenance.jsonl                    # provenance append-only
  ```

### References

- [Source: ARCHITECTURE-SPINE.md#AD-1] — propose/commit, toolkit único escritor, manifesto SHA-256 + provenance
- [Source: ARCHITECTURE-SPINE.md#AD-3] — núcleo hexagonal (commit.ts: só `node:` + relativos)
- [Source: ARCHITECTURE-SPINE.md#AD-4] — checkpoint atômico/WAL (→ **Story 1.3**: não implementar aqui)
- [Source: ARCHITECTURE-SPINE.md#AD-5] — confiança por fonte verificável + ledger (→ **Story 1.4**)
- [Source: ARCHITECTURE-SPINE.md#Consistency Conventions] — manifesto SHA-256; configs TOML+YAML (machine → JSON zero-dep)
- [Source: SPEC.md#CAP-9] — não-destrutivo & multi-engine (manifestos SHA-256; só pastas protegidas)
- [Source: prd.md §4.9/FR-20] — garantia não-destrutiva; escrita fora aborta com erro
- [Source: prd.md §5/NFR-5] — observabilidade: log de provenance por etapa
- [Source: glossary.md "Propose/Commit" · "Garantia não-destrutiva" · "`.process-ai/`"] — vocabulário canônico
- [Source: epics.md#Story 1.2] — ACs e user story originais (FR-20, AD-1)
- [Source: 1-1-scaffold-engineadapter-claudecodeadapter.md] — inteligência da story anterior: padrões de atomic write (T3/adapter.ts:101-111), idempotência (bootstrap.test), defense-in-depth symlink, allowlist AD-3 (import-boundary.test), decisão stack (node:test/zero-dep/TS-direto/Node 24), e o item deferred "validação runtime do payload → pertence à 1.2"
- [External: Node.js 24 — `node:crypto` `createHash('sha256')`] — SHA-256 built-in, zero deps
- [External: Node.js 24 — `fs.rename` atomicidade] — atômico em POSIX, near-atômico em NTFS (mesmo FS)

## Dev Agent Record

### Agent Model Used

glm-5.2 via Claude Code harness; skill bmad-dev-story.

### Debug Log References

### Completion Notes List

- **Decisões de implementação registradas (T1–T6):**
  1. **Root via adapter (T6):** `ClaudeCodeAdapter({ cwd, agent })` guarda o root como estado de instância (default `process.cwd()`); `propose()` passa `this.cwd` ao `commit()`. Mantém a porta `propose(payload)` limpa e é testável (injetar `cwd = tmpdir`). `agent` default `'claude-code'`; `commit()` defaulta `agent` a `'unknown'` quando chamado diretamente.
  2. **Formato manifesto + provenance (zero deps):** manifesto = JSON em `.process-ai/manifests/<sha>.json`; provenance = JSONL append em `.process-ai/provenance.jsonl`. Node 24 não tem parser YAML/TOML built-in e o allowlist AD-3 proíbe package npm no core.
  3. **Canonicalização (T1):** `canonicalize(content)` devolve a própria string se `string`; senão JSON com chaves recursivamente ordenadas (sort asc), arrays preservam ordem, `undefined`→`null`, não-finitos→`null`. Hash sobre bytes UTF-8 da forma canônica — os MESMOS bytes são escritos como artefato, logo sha do manifesto == sha do artefato (AC2).
  4. **Idempotência byte-estável (AC5):** manifesto SEM timestamp (estável entre re-commits); `committedAt` vive só na provenance. Dedupe de provenance por par `(sha256, agent)` — o timestamp NÃO participa da chave de dedupe.
  5. **Content-addressed:** artefato em `_process-ai_output/<type>/<sha>.<ext>` e manifesto em `.process-ai/manifests/<sha>.json` → mesmo conteúdo = mesmo path = dedupe natural.
  6. **Extensão:** default `.md` por artifactType (mapa `EXT_BY_TYPE` vazio em 1.2; mapeamento por tipo amadurece em 3.1/AD-2).
- **Defense-in-depth symlink (subtask opcional T2 — APLICADA):** `assertNoSymlinkComponent` faz lstat-walk dos componentes das pastas protegidas e recusa symlink (espelha `adapter.ts:65-82` da 1.1). Torna AC1 estanque mesmo se `_process-ai_output/` ou `.process-ai/` forem symlinks apontando para fora do root. Teste com `t.skip` no Windows sem Developer Mode (padrão CR R2#3 da 1.1).
- **Abort-before-write (AC3/AC6):** ordenação validar → canonicalizar/hash → sanitizar artifactType → escopo (puro, `assertWithinScope`) → symlink-walk (read-only) → só então escrever. Falha em qualquer pré-passo = zero escrita (validado por testes "ZERO escrita" em sanitize e em validação de payload).
- **Erros errno-agnostic:** `CommitError` traduz falhas de validação/escopo em mensagens acionáveis com contexto (aprendizado 1.1: traduzir, não relançar cru).
- **Atomicidade por-arquivo (NÃO é o WAL do AD-4):** `atomicWriteFile` = temp + `fs.rename` + cleanup do temp em falha (espelha `adapter.ts:101-111`). Transação atômica commit+checkpoint/WAL/quarentena de órfão é a Story 1.3 — NÃO implementada aqui.
- **Stack mantida:** Node 24.18.1 LTS, TS + ESM, imports `.ts` com extensão, `node:test` + `node:assert/strict`, zero deps de runtime no core (AD-3 allowlist: só `node:*` + relativos).
- **Resultado dos gates (T8):** `node --test` → 46 testes, 100% verdes, zero regressões; `npm run typecheck` (`tsc --noEmit`) limpo; `tests/import-boundary.test.ts` verde cobrindo `commit.ts` (AD-3 estendido). `commit.test.ts` adiciona 18 testes; `adapter.test.ts` reescreve o AC4.
- **Code review patches (2026-08-01 — 16 itens resolvidos):** D1 (manifest prefixo artifactType), P1 (provenance leaf-symlink check), P2 (WeakSet detecção de ciclo em stableStringify), P3 (artifactType na chave de dedupe), P4 (cache em memória no appendProvenance — O(1)), P5 (cleanup de temp em writeFile), P6 (tempCounter no installSkills), P7 (resolveRoot async valida isDirectory), P8 (case-insensitive no Windows em assertWithinScope), P9 (validação cwd/agent vazios no adapter), P10 (Windows reserved names blocklist), P11 (isDirectory check em assertNoSymlinkComponent), P12 (CommitResult paths normalizados com `/`), P13 (JSDoc footgun --target vs cwd), P14 (fs.stat antes de readFile da skill-fonte), P15 (validação de extensão contra allowlist), P16 (test gaps: +15 testes). Gates: 60 testes 100% verdes, `tsc --noEmit` limpo, AD-3 verde.

### File List

- `toolkit/src/commit.ts` — NEW (SHA-256 + serialização canônica + manifesto + provenance + enforcement de escopo + sanitização do artifactType + validação de payload + atomicidade por-arquivo + defense-in-depth symlink)
- `toolkit/src/engine-adapter.ts` — MODIFIED (adiciona interface `CommitResult`; `propose()` passa a retornar `Promise<CommitResult>`; atualiza comentário de versão)
- `toolkit/adapters/claude-code/adapter.ts` — MODIFIED (ctor `ClaudeCodeAdapterOptions { cwd, agent }`; `propose()` delega ao `commit()` e devolve `CommitResult`, sem mutar payload)
- `tests/commit.test.ts` — NEW (18 testes cobrindo AC1–AC6 + determinismo/idempotência + atomicidade + symlink)
- `tests/adapter.test.ts` — MODIFIED (AC4 reescrito: usa `new ClaudeCodeAdapter({ cwd: tmp })`, asserciona `CommitResult.sha256`, não-mutação do payload e conteúdo commitado deep-equal a `payload.content`)

## Change Log

- **2026-08-01** — Story 1.2 implementada: paradigma propose/commit não-destrutivo (AD-1/FR-20). `commit.ts` é o único escritor das pastas protegidas — artefato content-addressed em `_process-ai_output/<type>/<sha>.<ext>`, manifesto SHA-256 byte-estável em `.process-ai/manifests/<sha>.json`, provenance JSONL idempotente em `.process-ai/provenance.jsonl` — com enforcement de escopo (`assertWithinScope` + trailing-sep), sanitização do `artifactType` (kebab restrito), validação runtime do payload (item deferred da 1.1), atomicidade por-arquivo (temp+rename) e defense-in-depth symlink. Porta `EngineAdapter` cristalizada com `CommitResult`; `ClaudeCodeAdapter.propose()` delega ao commit (pass-through, sem mutar payload). Gates: 46 testes 100% verdes, `tsc --noEmit` limpo, AD-3 verde cobrindo `commit.ts`.
- **2026-08-01 (code review fixes)** — 16 patches de code review resolvidos: D1 (manifest com prefixo artifactType), P1–P16 (robustez de borda, segurança, performance e qualidade de erro). Manifesto agora usa chave `<artifactType>-<sha>.json`; provenance com dedupe O(1) em memória por `(sha256, agent, artifactType)`; detecção de ciclo em `stableStringify`; validação de root, extensão, nomes reservados Windows, cwd/agent vazios; case-insensitive scope no Windows; leaf-symlink check no provenance; cleanup de temp em falha de writeFile; tempCounter no adapter; CommitResult paths normalizados com `/`; JSDoc footgun documentado; verificação de existência da skill-fonte. Testes expandidos: de 46 para 60 (28 commit + 11 adapter + 4 import-boundary + 14 bootstrap + 3 scaffold).
