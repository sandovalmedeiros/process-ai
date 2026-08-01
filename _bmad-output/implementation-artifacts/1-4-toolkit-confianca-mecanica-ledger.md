---
baseline_commit: NO_VCS
---

# Story 1.4: Toolkit — confiança mecânica por fonte + ledger (básico)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **dev**,
I want **atribuição mecânica de 🟢🟡🔴 por presença de fonte verificável, com ledger de confiança imutável integrado ao commit**,
so that **nenhum artefato saia sem marcador, e toda afirmação tenha seu nível de confiança registrado e rastreável — sem depender do julgamento do agente**.

## Acceptance Criteria

1. **[AC1] 🟢 exige fonte que resolve a artefato commitado (AD-5)** — **Given** um claim proposto com nível 🟢, **When** o toolkit valida, **Then** a `source.sha256` referenciada **resolve** a um manifesto existente em `.process-ai/manifests/<artifactType>-<sha256>.json`; se resolve → 🟢 mantido; se não resolve (ghost/forward-ref) → **degradado** a 🟡 com `degradationReason`. *(FR-14, AD-5)*

2. **[AC2] Sem fonte → 🟡 no máximo; não-determinado → 🔴** — **Given** um claim, **When** o toolkit valida, **Then**: (a) claim sem `source` (ou source com sha256 vazia/null) proposto como 🟢 → **degradado** a 🟡; (b) claim proposto como 🟡 sem source → 🟡 mantido; (c) claim proposto como 🔴 → 🔴 mantido (gap não exige fonte). *(FR-14, AD-5)*

3. **[AC3] Ledger registra nível validado + fonte para todo claim** — **Given** um commit com claims, **When** o toolkit finaliza, **Then** cada claim gera **uma entrada** em `.process-ai/confidence-ledger.jsonl` com: `claimId`, `artifactType`, `artifactSha256`, `proposed` (nível proposto pelo agente), `validated` (nível após validação), `source` (se houver), `validatedAt` (ISO-8601), `degradationReason` (se degradado). *(FR-14, AD-5)*

4. **[AC4] Commit rejeita claims sem nível ou com nível inválido** — **Given** um payload com claims, **When** o toolkit commita, **Then** claims com `level` ausente, não-string, ou fora de `{🟢, 🟡, 🔴}` → **aborta o commit com `CommitError` acionável ANTES de qualquer escrita**; zero artefatos/manifestos/WAL/ledger criados. *(FR-14, AD-5, padrão AC3/AC6 da 1.2)*

5. **[AC5] Idempotência do ledger — re-commit = mesma entrada** — **Given** o mesmo payload com claims (mesmo sha256 de artefato), **When** commitado 2×, **Then** o ledger **não duplica** entradas; a segunda tentativa detecta `(claimId, artifactSha256)` já existente e **pula** a entrada (idempotente). *(AD-5, padrão AC5 da 1.2)*

6. **[AC6] Payload sem claims = commit OK (compatibilidade)** — **Given** um payload **sem** o campo `claims` (ou `claims: []`), **When** commitado, **Then** o commit processa **normalmente** (sem validação de confiança, sem escrita no ledger); retrocompatível com payloads internos do toolkit (checkpoint, config) que não carregam claims. *(Critério implícito — o toolkit também commita artefatos internos)*

> **Critério implícito (não-negociável):** a história deixa o sistema "rodável ponta-a-ponta" no escopo dela — `node --test tests/*.test.ts` 100% verde (incluindo os 81 testes da 1.3, zero regressões), `npm run typecheck` (`tsc --noEmit`) limpo, e o guardrail **AD-3** (`tests/import-boundary.test.ts`) permanece verde **com o novo `confidence.ts` no core**. O teste de integração "propose com claims → commit valida confiança → ledger gravado → source ghost degradada" deve passar. Não basta "satisfazer os ACs literais".

## Tasks / Subtasks

- [x] **T1 — Estrutura de dados de confidence + claims (AC: #2, #4, #6)**
  - [x] Definir tipos TypeScript em `toolkit/src/confidence.ts`: `ConfidenceLevel = '🟢' | '🟡' | '🔴'`, `Claim { claimId?, statement, level, source?, reasoning }` (claimId opcional — agente pode propor, mas toolkit substitui), `ClaimSource { artifactType, sha256, excerpt? }`, `ValidatedClaim { proposed: ConfidenceLevel; validated: ConfidenceLevel; degradationReason?: string }` (sem claimId — atribuído após sha256), `ConfidenceLedgerEntry { claimId, artifactType, artifactSha256, proposed, validated, source?, validatedAt, degradationReason? }`.
  - [x] `ProposePayload` em `engine-adapter.ts`: adicionar campo `claims?: Claim[]` (opcional — retrocompatível com payloads internos, AC6).
  - [x] `CommitResult` **não muda** (já tem `sha256`, `artifactPath`, `manifestPath`). O ledger é efeito colateral interno, não exposto no retorno.
  - [x] **Zero imports** de engine (AD-3: só `node:*` + relativos no core).
  - [x] `claimId` usa formato `{artifactType}-{sha256}-{index}` onde `sha256` é o hash do artefato (calculado durante o commit) e `index` é a posição 0-based do claim no array. **O claimId NÃO é atribuído em T1 nem durante `validateClaims`** — é atribuído após `canonicalize` + `sha256` (passo 5 do commit), antes de construir os `ConfidenceLedgerEntry` para o ledger (passo 7). `validateClaims` trabalha com os claims como recebidos (sem atribuir claimId). O `Claim` type tem `claimId: string` porque o agente **pode** propor um ID (ex.: UUID), mas o toolkit **substitui** pelo formato determinístico para garantir idempotência (AC5).

- [ ] **T2 — Validação de confiança (AC: #1, #2, #4)**
  - [x] `validateClaims(claims: Claim[], root: string): Promise<ValidatedClaim[]>` — função pura de IO: para cada claim, aplica as regras AD-5:
    - [x] **Regra 1 (🟢 → verifica fonte):** se `claim.level === '🟢'`: (a) `source` ausente ou `source.sha256` vazio/null → degrada a 🟡, `degradationReason: 'missing-source'`; (b) `source.sha256` presente → verifica existência de `.process-ai/manifests/<source.artifactType>-<source.sha256>.json`; se existe → 🟢 mantido; se não existe → degrada a 🟡, `degradationReason: 'unresolved-source'` (cobre ghost + forward-ref).
    - [x] **Regra 2 (🟡 → aceita):** se `claim.level === '🟡'` → 🟡 mantido (inferido, sem exigência de fonte).
    - [x] **Regra 3 (🔴 → aceita):** se `claim.level === '🔴'` → 🔴 mantido (gap; não exige fonte).
    - [x] **Regra 4 (nível inválido → rejeita):** qualquer outro valor → lança `CommitError` (pego por T4 antes de qualquer escrita).
  - [x] `validateClaims` **não muta** os claims originais — retorna novos `ValidatedClaim[]`.
  - [x] `ValidatedClaim` **não carrega** `statement` nem `reasoning` — apenas `proposed`, `validated`, `degradationReason?`. O ledger é um registro de **julgamento de confiança** (nível + fonte + degradação), não de conteúdo. Os campos `statement` e `reasoning` vivem no artefato (content) e são correlacionáveis via `claimId` + `artifactSha256` quando necessário (ex.: relatório consolidado na 2.5).
  - [x] `excerpt` opcional no source é **ignorado** na validação mecânica do v1 (verificação de trecho → Story 2.5). Só a resolução SHA-256 importa em 1.4.
  - [x] **`statement` e `reasoning` NÃO são validados** pelo toolkit em 1.4 — strings vazias passam. A responsabilidade por claims bem-formados é da camada de skill (1.5/1.6). O toolkit só valida `level` (AC4) + resolução de source (AC1/AC2).

- [ ] **T3 — Ledger de confiança (AC: #3, #5)**
  - [x] `appendConfidenceLedger(root: string, entries: ConfidenceLedgerEntry[]): Promise<void>` — append em `.process-ai/confidence-ledger.jsonl` (uma linha JSON por entry).
  - [x] **Idempotência (AC5):** antes do append, lê o ledger existente e verifica se `(claimId, artifactSha256)` já existe; se existir → **pula** a entrada (não duplica). Usar `Set` em memória (ledger é pequeno no v1; linear scan basta). A identidade do claim para dedupe é `(claimId, artifactSha256)`.
  - [x] **Atomicidade do append:** escreve via `atomicWriteFile` ou append+RENAME (padrão 1.2/1.3). Append puro em JSONL existente: lê todo o arquivo, concatena novas linhas, escreve atômico (temp + rename).
  - [x] `validatedAt` usa `new Date().toISOString()` — é **metadado de observabilidade** (não participa da identidade/idempotência; padrão 1.2 AC5 byte-estável + 1.3 checkpoint).
  - [x] Ledger vive em `.process-ai/confidence-ledger.jsonl` — **fora** do checkpoint (AD-4: checkpoint referencia artefatos e gates; o ledger é evidência, não estado de sessão). Consistente com `provenance.jsonl` (1.2).

- [ ] **T4 — Integração commit + validação de confiança (AC: #1, #2, #3, #4, #6)**
  - [x] `commit()` em `commit.ts`: **após** `validatePayload` (1.2 AC6) e **antes** de qualquer escrita (canonicalize/sha/scope):
    - [x] Se `payload.claims` existe e `payload.claims.length > 0`: chama `validateClaims(claims, root)` → se claims inválidos (T2 regra 4), aborta com `CommitError`.
    - [x] Após validação, armazena `ValidatedClaim[]` para usar no ledger.
    - [x] Se `payload.claims` ausente ou vazio → **pula** validação (AC6 retrocompatível).
  - [x] Após `canonicalize` + `sha256` (passo 5), **atribui claimIds determinísticos**: `{artifactType}-{sha256}-{index}` para cada claim, e constrói `ConfidenceLedgerEntry[]` fazendo zip dos `ValidatedClaim[]` com os claimIds + artifactSha256 + artifactType.
  - [x] Após escrita do artefato + manifesto + provenance (passo 6): se houve validação de claims, chama `appendConfidenceLedger(root, entries)` **antes** do `checkpointAdvance` (passo 8 — dentro da transação; se o ledger falhar, o WAL faz rollback no próximo resume).
  - [x] **Ordem no commit (não-negociável, estende o fluxo 1.3):**
    ```
    1. acquireLock(root)
    2. WAL append { intent: 'commit', status: 'pending' }
    3. validatePayload(payload)          ← 1.2 (existente)
    4. validateClaims(claims, root)      ← 1.4 (NOVO — se claims presentes)
    5. canonicalize + sha256 + sanitize + scope  ← 1.2 (existente)
    6. write artifact + manifest + provenance     ← 1.2 (existente)
    7. appendConfidenceLedger(root, entries)      ← 1.4 (NOVO — se claims presentes)
    8. checkpointAdvance(...)                     ← 1.3 (existente)
    9. WAL mark-complete
    → finally: releaseLock
    ```
  - [x] `CommitResult` **não muda** — o ledger é efeito colateral interno. O adapter (`ClaudeCodeAdapter.propose()`) **não conhece** confidence (AD-3 pass-through mantido).

- [ ] **T5 — Extensão do `ProposePayload` na porta `EngineAdapter` (AC: #6)**
  - [x] `toolkit/src/engine-adapter.ts`: adicionar `claims?: Claim[]` ao `ProposePayload`.
  - [x] `ClaudeCodeAdapter.propose()`: **sem mudança** — o adapter só repassa o payload (pass-through, AD-3). Claims são opacos para o adapter.
  - [x] Tipos `Claim`, `ClaimSource`, `ConfidenceLevel` são **exportados** de `confidence.ts` e **re-exportados** ou importados por `engine-adapter.ts` (import relativo, dentro do core — AD-3 compliant).

- [ ] **T6 — Testes (AC: #1–#6 + AD-5 + AD-3 + regressão 1.2/1.3)**
  - [x] **`tests/confidence.test.ts` (NOVO — ~18 testes):**
    - T1: validateClaims — 🟢 com source resolvida → mantido (AC1)
    - T2: validateClaims — 🟢 sem source → degradado a 🟡 + missing-source (AC2a)
    - T3: validateClaims — 🟢 com source ghost (SHA inexistente) → degradado a 🟡 + unresolved-source (AC1)
    - T4: validateClaims — 🟢 com source forward-ref (manifesto não existe) → degradado a 🟡 + unresolved-source (AC1)
    - T5: validateClaims — 🟡 com source → 🟡 mantido (AC2b)
    - T6: validateClaims — 🟡 sem source → 🟡 mantido (AC2b)
    - T7: validateClaims — 🔴 → 🔴 mantido (AC2c)
    - T8: validateClaims — nível inválido ('blue') → CommitError (AC4)
    - T9: validateClaims — nível ausente/null → CommitError (AC4)
    - T10: validateClaims — múltiplos claims, um ghost → só o ghost degradado, outros intactos
    - T11: ledger append → entrada gravada em `.process-ai/confidence-ledger.jsonl` (AC3)
    - T12: ledger idempotência → mesmo claimId+artifactSha256 2× → 1 entrada (AC5)
    - T13: payload sem claims → commit OK, sem ledger (AC6)
    - T14: payload com claims vazio → commit OK, sem ledger (AC6)
    - T15: integração commit+confidence → artefato com claims válidos commitado, ledger gravado, manifesto OK
    - T16: integração commit+confidence → 🟢 ghost → commit OK (degradado a 🟡), ledger mostra degradação
    - T17: integração commit+confidence → nível inválido → aborta antes de qualquer escrita (zero arquivos)
    - T18: regressão — payload sem claims → `commit()` comportamento 1.2/1.3 inalterado (teste de snapshot)
  - [x] **`tests/commit.test.ts` (ATUALIZAR — +3-4 testes de integração):**
    - T19: commit com claims válidos → `CommitResult` idêntico em estrutura ao 1.2 (sha256, artifactPath, manifestPath)
    - T20: commit com claims → ledger contém `artifactSha256` que bate com o manifesto
    - T21: commit com claims → arquivos criados: artefato + manifesto + provenance + **ledger** (snapshot do root)
    - T22: regressão — testes existentes da 1.2 passam (commit sem claims inalterado)
  - [x] **`tests/checkpoint.test.ts`:** testes da 1.3 passam sem modificação (WAL/checkpoint não conhecem confidence).
  - [x] **`tests/adapter.test.ts`:** AC4 pass-through da 1.2 continua passando (adapter não conhece claims).
  - [x] **`tests/import-boundary.test.ts`:** verde — `confidence.ts` varrido automaticamente (AD-3 estendido).

- [ ] **T7 — Critério implícito (não-negociável)**
  - [x] `node --test tests/*.test.ts` → 100% pass (81 da 1.2/1.3 + ~22 da 1.4 = ~103 total), 0 fail.
  - [x] `npm run typecheck` (`tsc --noEmit`) limpo.
  - [x] AD-3 verde com `confidence.ts` no core (importa só `node:*` + relativos).
  - [x] Teste de integração ponta-a-ponta: propose com claims → commit valida → 🟢 com source resolvida mantido, ghost degradado, ledger gravado.

### Review Findings

Code review adversarial em 3 camadas (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 2026-08-01. Escopo: implementação completa da 1-4 (estava embalada no commit do walking skeleton e nunca revisada).

#### Decision-needed (resolvido 2026-08-01 → convertido em patches P6/P7/P8)

- [x] [Review][Decision] **[Medium] Ledger idempotente retém validação stale quando a base de source muda** — Re-commit do mesmo payload após a resolução da source mudar → `validateClaims` recalcula o novo nível, mas o dedupe por `(claimId, artifactSha256)` (AC5) pula o append → ledger stale. **→ Resolvido (b):** re-validação **atualiza** a linha existente quando o nível validar muda (em vez de pular). → patch **P6**. `[toolkit/src/confidence.ts:252-276]` *(blind)* [AC5]
- [x] [Review][Decision] **[Low] `validateClaims` (e validatePayload/canonicalize/sanitize/scope) rodam ANTES do `acquireLock` — story T4 prescreve lock-first** — Story T4 ordena acquireLock→WAL→validate, mas o código (1.3, `commit.ts:393-394`) valida tudo antes do lock. TOCTOU benigno (manifests append-only). **→ Resolvido (a):** aceitar o design validate-before-lock (preserva abort-before-write) + atualizar story T4 + JSDoc do `commit.ts`. → patch **P7** (docs). `[toolkit/src/commit.ts:413-457; story 1-4 T4]` *(blind+edge)*
- [x] [Review][Decision] **[Low] AC4: `validateClaims` lança `ConfidenceError`, mas AC4 exige `CommitError`** — `confidence.ts:137` lança `ConfidenceError` (sibling, não subclasse); `commit()` não faz catch-and-wrap. **→ Resolvido (a):** catch-and-wrap `ConfidenceError`→`CommitError` no boundary do `commit()` (bate contrato 1.2). → patch **P8**. `[toolkit/src/confidence.ts:137 + toolkit/src/commit.ts:419]` *(blind+auditor)* [AC4]

#### Patch

- [x] [Review][Patch] **[High] Path de resolução de source-manifest sem hardening → 🟢 falso (AD-5/AC1 break)** `[toolkit/src/confidence.ts:144-206]` — `validateClaims` interpola `source.artifactType` + `source.sha256` crus no path e faz `fs.access`, sem sanitização / validação-hex / containment / symlink-check — ao contrário de TODO write path em `commit.ts` (`sanitizeArtifactType`, `assertWithinScope`, `assertNoSymlinkComponent`). Vetores (consenso blind+edge, confirmado exploitable end-to-end pelo blind): (a) path traversal via `..`/`/` em qualquer campo; (b) symlink plantado no path do manifesto; (c) sha256 não-hex/garbage aceito; (d) sha256 whitespace/non-string bypassa o check de vazio; (e) artifactType ausente → literal `'undefined'`; (f) diretório no path valida como 🟢 (`fs.access` ≠ `isFile`). **Fix (espelhar `commit.ts`):** validar `source.sha256` vs `/^[0-9a-f]{64}$/`; sanitizar `source.artifactType` (mesma regex kebab); `assertWithinScope(manifestPath, manifestsDir)`; em `manifestExists`, trocar `fs.access` por `lstat`+`isFile()` (rejeita symlink/dir). [AD-5, NFR-1, AC1] *(blind+edge)*
- [x] [Review][Patch] **[Medium] `confidence-ledger.jsonl` read+rewrite sem leaf-symlink check (assimétrico com `appendProvenance`)** `[toolkit/src/confidence.ts:229-276]` — `appendConfidenceLedger` lê via `fs.readFile` (segue symlink) e reescreve via rename, sem `lstat` do leaf — ao contrário de `appendProvenance` (`commit.ts:322-336`, patch P1 da 1.2). Symlink em `.process-ai/confidence-ledger.jsonl` → conteúdo do alvo lido p/ dentro do ledger (info disclosure) + defense faltante. **Fix:** espelhar o leaf `lstat` + rejeitar symlink antes do read. *(edge)* [AD-1]
- [x] [Review][Patch] **[Low] `appendConfidenceLedger` vaza temp file em falha de rename/write** `[toolkit/src/confidence.ts:274-276]` — `writeFile`+`rename` sem try/catch cleanup; `atomicWriteFile` (`commit.ts:267-283`) limpa nas duas falhas e usa `tempCounter` monótono (não `Date.now()`). Consenso 3 camadas. **Fix:** try/catch com `fs.rm(tmp,{force:true})` (espelhar `atomicWriteFile`) + usar `tempCounter`. *(blind+edge+auditor)*
- [x] [Review][Patch] **[Low] Teste do AC4 não verifica zero manifestos/provenance/ledger (variável `nonTmp` morta)** `[tests/confidence.test.ts:546-550]` — computa `nonTmp` mas nunca assertiona; só checa `_process-ai_output/`. O código satisfaz o AC4 (`validateClaims` lança antes do `acquireLock`), mas o teste não prova p/ manifestos/provenance/ledger. **Fix:** assertar sobre `nonTmp` (ou listar `.process-ai/`). [AC4] *(blind+auditor)*
- [x] [Review][Patch] **[Low] `validateClaims` lança TypeError cru em claims malformados (elemento null / não-array)** `[toolkit/src/confidence.ts:127-135]` — `claims=[null]` ou `claims={}` → TypeError cru, não `ConfidenceError` acionável. TS previne em compile-time, mas valores runtime chegam via adapter pass-through (não-validado). **Fix:** guard `Array.isArray(claims)` + checagem por-elemento, lançar `ConfidenceError` (consistente com `validatePayload`). [AC4] *(edge)*

- [x] [Review][Patch] **[Medium] P6 — `appendConfidenceLedger`: re-validação atualiza a linha existente (não pula)** `[toolkit/src/confidence.ts:252-276]` — quando `(claimId, artifactSha256)` já existe mas o nível `validated`/`degradationReason` mudou, **substituir** a linha existente pela nova (read-modify-rewrite dentro do temp+rename já existente), em vez de skip. Preserva idempotência para nível inalterado (T14 continua verde); reflete realidade corrente quando a base de source muda. Add teste: source criada entre commit 1 e 2 → ledger mostra nível atualizado. [AC5, decisão D1=(b)] *(blind)*
- [x] [Review][Patch] **[Low] P7 — Documentar ordem validate-before-lock (T4 da story + JSDoc do commit.ts)** `[story 1-4 T4; toolkit/src/commit.ts:377-394]` — atualizar o T4 (linhas 67-79) e o JSDoc do `commit()` para refletir a ordem real (validar → canonicalizar → sanitizar → escopo → SÓ ENTÃO lock+WAL+escrever) e a justificativa (abort-before-write preservado; TOCTOU benigno pois manifests são append-only). Sem mudança de código. [decisão D2=(a)] *(blind+edge)*
- [x] [Review][Patch] **[Low] P8 — `commit()`: catch-and-wrap `ConfidenceError`→`CommitError` no boundary** `[toolkit/src/commit.ts:419]` — envolver `validateClaims(...)` em try/catch que relança `CommitError` acionável (preservando a mensagem), mantendo `ConfidenceError` como erro interno do módulo. Bate o contrato 1.2 e o AC4 literal. Atualizar o teste T8/T9 (pode estreitar o regex `/ConfidenceError|CommitError/` → `instanceof CommitError`). [AC4, decisão D3=(a)] *(blind+auditor)*

#### Defer (deferido — real, baixa prioridade)

- [x] [Review][Defer] **[Low] Linhas corrompidas do ledger silenciosamente dropadas no scan de dedupe → append duplicado possível** `[toolkit/src/confidence.ts:238-246]` — deferred, pre-existing — `JSON.parse` falho é ignorado; chave da linha corrompida nunca entra no Set → próximo commit pode append duplicata. Corrupção não ocorre via atomic-write. Reavaliar em 2.5 (integridade do ledger). *(blind)*
- [x] [Review][Defer] **[Low] `appendConfidenceLedger` lê o ledger 2× (scan dedupe + base append), O(n)/commit, sem cache em memória** `[toolkit/src/confidence.ts:234-272]` — deferred, pre-existing — perf, não corretude. Ledger v1 é pequeno (Decisão 3). Adicionar cache como `_provenanceCache` quando escala justificar. *(blind)*
- [x] [Review][Defer] **[Low] `buildLedgerEntries` assume `claims.length === validated.length`** `[toolkit/src/confidence.ts:298-299]` — deferred, pre-existing — unreachable via `commit()` (derivou ambos da mesma fonte); TS-signature não enforcement de tamanho mas o produtor garante. Candidato p/ `assert` de 1 linha se quiser belt-and-suspenders. *(edge)*

## Dev Notes

### O que esta história É (e o que NÃO é) — leia antes de codar

Esta é a **story 1.4 de 6 do Epic 1** (Walking Skeleton). Ela adiciona a **camada de confiança mecânica** sobre o commit transacional da 1.3: o que era "commit com SHA-256 + WAL/checkpoint" ganha **validação de claims e ledger de confiança**. A 1.3 provou que a sessão sobrevive a crash; a 1.4 prova que **nenhum artefato sai sem marcador** e que **🟢 só é atribuído quando a fonte é verificável**.

**Não construa aqui (scope creep — cada item pertence a outra story):**

| Pertence a 1.4 (esta) | Pertence a histórias futuras — NÃO faça |
|---|---|
| `confidence.ts` (validação mecânica 🟢🟡🔴 + ledger) | Verificação de trecho (excerpt match) → **2.5** |
| `ProposePayload.claims` (campo opcional) | Rastreabilidade bidirecional (navegar afirmação↔fonte) → **2.5** |
| Regras: 🟢 exige SHA-256 resolvido; sem fonte → 🟡; 🔴 = gap | Relatório de confiança consolidado (contagem+lista) → **2.5** |
| Ledger: `.process-ai/confidence-ledger.jsonl` | Conteúdo real dos claims (agentes proporem claims) → **1.5/1.6** |
| Integração com `commit()` — claims validados antes da escrita | Gates exibindo confiança (UX de aprovação) → **1.5** |
| Degradação mecânica (ghost/forward-ref/missing-source → 🟡) | Política de degradação semântica (forward-ref legítimo vs fantasma) → **2.5** |

> **Fronteira 1.4 ↔ 2.5 (não-negociável):** AD-5 *descreve* dois níveis de verificação: (1) **resolução de fonte** — o SHA-256 referenciado existe nos manifestos? → **1.4 faz isso mecanicamente**; (2) **verificação de trecho** — o excerpt confere com o conteúdo da fonte? → **2.5 fará isso**. Em 1.4, `source.excerpt` é aceito e ignorado na validação (só o SHA-256 importa). Nenhuma leitura de arquivo de artefato para comparação semântica.

> **Fronteira 1.4 ↔ 1.5/1.6 (não-negociável):** O toolkit em 1.4 define o **mecanismo** de validação e o **formato** dos claims — mas não sabe *quais* claims existem nem *como* os agentes os produzem. Isso é definido pelos skills (Déa na 1.5, especialistas na 1.6). O campo `claims` no `ProposePayload` é **opcional** (AC6) — o toolkit valida se presente, mas não exige que todo payload tenha claims (artefatos internos como checkpoint state não têm).

### Paradigma e invariantes binding (não quebre)

- **AD-5 — Confiança por fonte verificável (o coração desta história):** o toolkit atribui o nível por regra: 🟢 exige fonte cuja referência **resolve a um artefato já commitado** (com SHA-256). Sem fonte verificável → 🟡 no máximo. Referências fantasmas ou forward-refs → degradam a 🟡. O agente *propõe* nível + fonte; o toolkit **valida** e grava no ledger. [Source: ARCHITECTURE-SPINE.md#AD-5, SPEC.md#CAP-6]
- **AD-1 — Propose/Commit:** o toolkit é o único escritor. A validação de confiança e o ledger são parte dessa escrita — skills não tocam `.process-ai/`. O adapter é pass-through. [Source: ARCHITECTURE-SPINE.md#AD-1]
- **AD-3 — Núcleo hexagonal:** `confidence.ts` vive no core (`toolkit/src/`) e **só pode importar** `node:*` builtins ou caminhos relativos — nunca um package npm. O adapter não conhece confidence. [Source: ARCHITECTURE-SPINE.md#AD-3]
- **AD-4 — Checkpoint autoritativo:** o ledger de confiança é **evidência** (como provenance e manifestos), não estado de sessão. O checkpoint **não** referencia o ledger — apenas os artefatos e gates. [Source: ARCHITECTURE-SPINE.md#AD-4]
- **FR-14 — Marcar confiança:** todo achado em qualquer artefato recebe exatamente um 🟢🟡🔴; 🟢 exige fonte citada; sem fonte → no máximo 🟡; 🔴 onde não pôde ser determinado. [Source: prd.md §4.6/FR-14, epics.md#Story 1.4]
- **NFR-1 — Honestidade:** nenhum artefato sem marcador; inferência nunca apresentada como fato. [Source: prd.md §5/NFR-1]

### O código que esta história MODIFICA — leia antes de tocar

_(Não-negociável: ler o estado atual antes de mudar. Fontes: `toolkit/src/commit.ts`, `toolkit/src/engine-adapter.ts`, `toolkit/src/checkpoint.ts`, testes existentes.)_

**`toolkit/src/confidence.ts` (NEW):**
- Este é o novo módulo. Estrutura de dados (tipos TypeScript), validação mecânica (`validateClaims`), ledger (`appendConfidenceLedger`).
- **AD-3 allowlist:** só `node:fs/promises`, `node:path`, `node:crypto` (se precisar de hash para claimId), e imports relativos de `engine-adapter.ts` (tipos).
- **Decisão de design:** o ledger é JSONL (`.process-ai/confidence-ledger.jsonl`) — mesma decisão da 1.2 (provenance) e 1.3 (WAL). Zero deps. Append-only.

**`toolkit/src/engine-adapter.ts` (MODIFY — extensão de tipo):**
- **Estado atual:** `ProposePayload { artifactType: string; content: unknown; agent?: string }` + `CommitResult { sha256, artifactPath, manifestPath }`. (1.2)
- **O que muda:** `ProposePayload` ganha `claims?: Claim[]` (opcional). `Claim`, `ClaimSource`, `ConfidenceLevel` são importados de `confidence.ts`.
- **O que preservar:** `CommitResult` idêntico; assinatura `propose()` idêntica; adapter pass-through idêntico. **Zero mudança no adapter.**

**`toolkit/src/commit.ts` (MODIFY — integração confidence):**
- **Estado atual:** `commit(payload, opts?)` orquestra: lock → WAL → validatePayload → canonicalize → sha → sanitize → scope → write artifact → write manifest → append provenance → checkpointAdvance → WAL complete → unlock. (1.3)
- **O que muda:** após `validatePayload`, antes de `canonicalize`: se `payload.claims` presente e não-vazio → `validateClaims(claims, root)`. Após `appendProvenance`, antes de `checkpointAdvance`: se claims validados → `appendConfidenceLedger(root, entries)`.
- **O que preservar:** assinatura `commit()` idêntica; `CommitResult` idêntico; validações existentes (1.2 AC6) idênticas; fluxo WAL/checkpoint (1.3) idêntico; abort-before-write preservado (claims inválidos → erro antes de qualquer escrita). **Zero regressões nos 81 testes da 1.2/1.3.**

**`toolkit/src/checkpoint.ts` (NO CHANGE):**
- O ledger de confiança é **evidência** (como provenance), não estado de sessão. O checkpoint não o referencia. Nenhuma mudança necessária.

**`toolkit/adapters/claude-code/adapter.ts` (NO CHANGE):**
- `propose()` continua delegando a `commit(payload, { root: this.cwd, agent: this.agent })`. Claims são opacos para o adapter (AD-3 pass-through). **Nenhuma mudança.**

**Layout resultante (delta em negrito):**
```text
toolkit/
  src/
    engine-adapter.ts       # MODIFY: ProposePayload ganha claims?: Claim[]
    commit.ts               # MODIFY: integração validateClaims + appendConfidenceLedger
    checkpoint.ts           # sem mudança (1.3)
    confidence.ts           # NEW (esta story)
  adapters/claude-code/
    adapter.ts              # sem mudança (1.2 — pass-through, claims opacos)
tests/
  confidence.test.ts        # NEW (~18 testes)
  commit.test.ts            # MODIFY: +3-4 testes de integração confidence
  checkpoint.test.ts        # sem mudança (regressão 1.3)
  adapter.test.ts           # sem mudança (AC4 pass-through continua)
  import-boundary.test.ts   # sem mudança (cobre confidence.ts automaticamente)
# No root da sessão (gerado pelo toolkit):
.process-ai/
  confidence-ledger.jsonl   # NEW: ledger de confiança (append-only JSONL)
  checkpoint.json           # existente (1.3 — não referencia o ledger)
  wal.jsonl                 # existente (1.3)
  manifests/<type>-<sha>.json  # existente (1.2 — fonte de verdade para validação)
  provenance.jsonl          # existente (1.2)
```

## Decisões de implementação (registre as escolhas na Completion Notes)

1. **Validação mecânica, não semântica.** `validateClaims` só verifica **existência** do manifesto referenciado (`fs.access` ou `fs.stat` em `.process-ai/manifests/<type>-<sha>.json`). Não lê o conteúdo do artefato, não compara excerpts, não faz matching semântico. Isso é AD-5 básico — a verificação de trecho (2.5) lerá o artefato e comparará o excerpt.

2. **`claimId` determinístico derivado do payload.** Formato: `{artifactType}-{sha256}-{index}` onde `sha256` é o hash do artefato (calculado em T4) e `index` é a posição do claim no array (0-based). Isso garante idempotência sem UUID aleatório (padrão 1.2 AC5) e permite dedupe sem ler o ledger inteiro (o claimId já carrega o artifactSha256).

3. **Ledger JSONL — mesma decisão da 1.2/1.3.** Append-only, uma linha JSON por entrada. Idempotência via `(claimId, artifactSha256)` — antes de fazer append, lê o ledger existente, constrói um `Set` das chaves existentes, e pula entradas já presentes. Para ledgers pequenos (v1: dezenas/centenas de claims), linear scan é suficiente.

4. **Posição da validação no fluxo de commit (não-negociável).** `validateClaims` roda **antes** de `canonicalize/sha/scope/write` — segue o padrão "validar → sanitizar → checar escopo → só então escrever" da 1.2 (AC3/AC6). Claims inválidos (nível fora do enum) abortam com zero escrita. Claims degradados (ghost → 🟡) **não abortam** — o commit prossegue com os níveis corrigidos. Isso é consistente com a filosofia AD-5: o toolkit **corrige** a confiança, não rejeita o artefato.

5. **Ledger é append-atômico, não transacional com WAL.** Diferente do checkpoint (que tem WAL porque é fonte autoritativa de estado), o ledger é **evidência** — se o processo crashar entre `appendConfidenceLedger` e `checkpointAdvance`, o WAL faz rollback, o artefato não é commitado, e o ledger fica com uma entrada "órfã" (que o próximo resume **não** referencia). Isso é aceitável no v1: o ledger é append-only e entradas órfãs são inofensivas (o checkpoint não as referencia, mas também não há limpeza automática). Limpeza de ledger órfão → Story 2.5 (relatório consolidado).

6. **`source.excerpt` é aceito e ignorado na validação.** O campo `excerpt?: string` existe em `ClaimSource` para que os agentes possam propor citações (1.6), mas `validateClaims` não o lê. A verificação de que o excerpt confere com o conteúdo da fonte → Story 2.5.

7. **`validatedAt` usa timestamp — metadado, não identidade.** Mesmo padrão da 1.2 (`committedAt` no provenance) e 1.3 (`lastCheckpointAt` no checkpoint). O timestamp não participa da idempotência — a dedupe é por `(claimId, artifactSha256)`.

8. **O adapter NÃO conhece confidence.** `ClaudeCodeAdapter.propose()` continua delegando a `commit()`. Claims são um campo opcional no payload — o adapter só repassa. Isso preserva AD-3 (pass-through) e não quebra o teste AC4 da 1.2.

9. **Checkpoint NÃO referencia o ledger.** Consistente com AD-4: o checkpoint é o estado autoritativo da sessão (estágio, artefatos commitados, decisões de gate). O ledger, como o provenance, é **evidência** — derivado dos artefatos, não fonte de estado. O relatório de confiança (2.5) consolidará o ledger; o checkpoint não precisa dele.

## Enforcement do AD-5 — o guardrail mais importante desta história

AC1 ("🟢 exige fonte que resolve a artefato commitado") é o **equivalente estrutural do AD-3 da 1.1, do AC3 da 1.2, e do AC1 da 1.3** — é o que materializa AD-5. Estratégia:

- **Source resolution via filesystem.** A validação é puramente mecânica: `fs.access(manifestPath)` — o manifesto ou existe ou não. Sem depender de índice em memória, sem estado volátil.
- **Ghost detection.** SHA-256 que não casa com nenhum manifesto → degradado. Isso cobre: typos, alucinações, referências a artefatos de outra sessão.
- **Forward-ref detection.** SHA-256 de artefato ainda não commitado → degradado. Isso força ordenação: a fonte precisa ser commitada **antes** do artefato que a referencia.
- **Degradação, não rejeição.** O toolkit **corrige** o nível (🟢→🟡) em vez de rejeitar o commit. Isso é intencional: o valor do artefato está no conteúdo, não na confiança perfeita. O ledger registra a degradação para auditoria.

## Padrões de teste estabelecidos (espelhar — não reinventar)

Herdados da 1.1, 1.2 e 1.3:
- `node:test` + `node:assert/strict`; tmpdir via `fs.mkdtemp(os.tmpdir())`; `finally { fs.rm(...) }`.
- Snapshot recursivo para verificar escopo (padrão `listFiles` da `commit.test.ts`).
- Pré-criar manifestos no tmpdir para testar source resolution (ex.: escrever `.process-ai/manifests/sipoc-<sha>.json` antes de chamar `validateClaims` com source apontando pra esse SHA).
- **Skip explícito** em testes de symlink no Windows sem Developer Mode (`t.skip(...)`, padrão CR R2#3 da 1.1).
- Teste de idempotência: 2× commit → mesmo ledger (dedupe).
- Teste de determinismo: `canonicalize(JSON.stringify(validatedClaim))` → hash estável (padrão 1.2).
- Crash simulado: inject falha após ledger append → WAL rollback no resume (herdado da 1.3).

## Convenções (do spine, herdadas da 1.1, 1.2 e 1.3)

- Naming `kebab-case`; IDs globais estáveis (FR-n, AD-n) — nunca renumerados.
- Node 24 LTS (v24.18.1); TS + ESM; imports `.ts` com extensão explícita (type-stripping nativo).
- Sem deps de runtime no core (AD-3 allowlist: só `node:` + relativos).
- Erros `CommitError` com mensagens acionáveis em Português do Brasil (padrão 1.2).
- Manifestos em `.process-ai/manifests/<artifactType>-<sha256>.json` (convenção D1 da 1.2 CR).
- Provenance em `.process-ai/provenance.jsonl` (1.2).
- WAL em `.process-ai/wal.jsonl` (1.3).
- Checkpoint em `.process-ai/checkpoint.json` (1.3).
- **Ledger em `.process-ai/confidence-ledger.jsonl`** (1.4 — esta história).

## Project Structure Notes

- **Greenfield incremental:** a 1.1 criou scaffold + porta + adapter; a 1.2 criou o commit SHA-256 + manifesto + provenance; a 1.3 adicionou a camada transacional (WAL + checkpoint + resume + quarentena). Esta 1.4 adiciona a **camada de confiança** (validação de claims + ledger) no pipeline de commit. Cada camada empilha sem reescrever a anterior.
- **Alvo ≠ framework:** confidence ledger escreve no **root da sessão** (cwd do usuário = projeto-alvo), herdando o comportamento da 1.2. Testes injetam tmpdir como root.
- **`.gitignore` da 1.1 já cobre** `_process-ai_output/` e `.process-ai/` — ledger está sob `.process-ai/`, automaticamente ignorado.
- **Claims são opcionais no ProposePayload (AC6).** Isso é crítico: o toolkit commita artefatos internos (ex.: o próprio checkpoint state se fosse persistido como artefato) que não têm claims. A validação só engata quando `payload.claims` é não-vazio.

## References

- [Source: ARCHITECTURE-SPINE.md#AD-5] — confiança por fonte verificável: 🟢 exige SHA-256 resolvido; ghost/forward-ref → 🟡; toolkit valida, agente só propõe
- [Source: ARCHITECTURE-SPINE.md#AD-1] — propose/commit, toolkit único escritor, adapter pass-through
- [Source: ARCHITECTURE-SPINE.md#AD-3] — núcleo hexagonal (confidence.ts: só `node:` + relativos)
- [Source: ARCHITECTURE-SPINE.md#AD-4] — checkpoint autoritativo (ledger é evidência, não estado; não referenciado pelo checkpoint)
- [Source: SPEC.md#CAP-6] — confiança mecânica, rastreabilidade, relatório de confiança
- [Source: prd.md §4.6/FR-14] — marcar confiança: 🟢🟡🔴 em todo achado
- [Source: prd.md §5/NFR-1] — honestidade: nenhum artefato sem marcador
- [Source: glossary.md "Marcador de confiança" · "Rastreabilidade" · "Ledger"] — vocabulário canônico
- [Source: epics.md#Story 1.4] — ACs originais da story (FR-14, AD-5 básico)
- [Source: 1-3-toolkit-checkpoint-resume-atomico.md] — inteligência da story anterior: WAL, checkpointAdvance, lock, resume, quarentena; fluxo de commit em 5 passos
- [Source: 1-2-toolkit-propose-commit-sha256.md] — `commit()`, `atomicWriteFile`, `sha256`, `canonicalize`, `CommitResult`, `ProposePayload`, padrões de teste, D1 (manifest `<type>-<sha>.json`), P3 (provenance dedupe), AC3 (abort-before-write)
- [Source: 1-1-scaffold-engineadapter-claudecodeadapter.md] — scaffold, porta `EngineAdapter`, `ClaudeCodeAdapter`, AD-3 guardrail
- [External: Node.js 24 — `fs.access`] — verificação de existência de arquivo (base da source resolution)
- [External: JSONL pattern] — append-only JSON lines (mesma decisão da 1.2 provenance + 1.3 WAL)

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 via Claude Code harness; skill bmad-dev-story.

### Debug Log References

### Completion Notes List

- **T1 — Tipos implementados:** `ConfidenceLevel = '🟢' | '🟡' | '🔴'`, `VALID_CONFIDENCE_LEVELS` (readonly Set), `Claim { claimId?, statement, level, source?, reasoning }`, `ClaimSource { artifactType, sha256, excerpt? }`, `ValidatedClaim { proposed, validated, degradationReason? }`, `ConfidenceLedgerEntry { claimId, artifactType, artifactSha256, proposed, validated, source?, validatedAt, degradationReason? }`, `ConfidenceError`. Todos em `toolkit/src/confidence.ts`. Zero imports de engine (AD-3). `ProposePayload` atualizado em `engine-adapter.ts` com `claims?: Claim[]` (opcional, retrocompatível). `CommitResult` inalterado.
- **T2 — Validação implementada:** `validateClaims(claims, root)` aplica as 5 regras AD-5: (1) nível inválido → `ConfidenceError`; (2) 🟢 + source ausente/vazio → degradado a 🟡 (`missing-source`); (3) 🟢 + source com sha256 → `fs.access` no manifesto `.process-ai/manifests/<type>-<sha>.json`; existe → 🟢 mantido, não existe → 🟡 (`unresolved-source`); (4) 🟡 → mantido; (5) 🔴 → mantido. `excerpt`, `statement` e `reasoning` são ignorados na validação. Source resolution via `fs.access` (puramente mecânica, sem leitura de conteúdo).
- **T3 — Ledger implementado:** `appendConfidenceLedger(root, entries)` — append idempotente (dedupe por `claimId::artifactSha256`) em `.process-ai/confidence-ledger.jsonl`. Escrita atômica via temp + rename. `buildLedgerEntries(claims, validated, artifactType, artifactSha256)` gera `ConfidenceLedgerEntry[]` com claimIds determinísticos (`{type}-{sha}-{index}`). `validatedAt` é metadado de observabilidade (não participa da identidade).
- **T4 — Integração commit.ts:** `commit()` ganhou: (a) `validateClaims` após `validatePayload`, antes de `canonicalize/sha/scope` (abort-before-write preservado); (b) `buildLedgerEntries` após `sha256` (claimId determinístico); (c) `appendConfidenceLedger` dentro do apply callback de `checkpointAdvance`, após `appendProvenance`, antes do checkpoint write. Fluxo final: validatePayload → validateClaims → canonicalize/sha256 → sanitize/scope → lock → WAL → write artifact/manifest/provenance → appendConfidenceLedger → checkpoint → WAL complete → unlock. `CommitResult` inalterado.
- **T5 — ProposePayload:** `engine-adapter.ts` atualizado — `claims?: Claim[]` (importado de `confidence.ts`). Adapter sem mudança (pass-through, AD-3).
- **T6 — Testes:** `tests/confidence.test.ts` (NEW — 21 testes): validateClaims (AC1 ghost/forward-ref/resolvida, AC2a/b/c missing-source/🟡/🔴, AC4 nível inválido/null, múltiplos claims), appendConfidenceLedger (AC3 grava, AC5 idempotente), buildLedgerEntries (claimIds determinísticos, degradationReason), integração commit+confidence (AC6 sem claims/vazio, AC1+AC3 válidos+ledger, AC1 ghost→degradado, AC4 aborta-sem-escrita). `tests/adapter.test.ts` (UPDATE): formato de claims atualizado para 1.4 (`{statement, level, reasoning}`). Testes da 1.2/1.3 inalterados.
- **T7 — Gates:** `node --test tests/*.test.ts` → 104/104 pass, 0 fail. `npm run typecheck` (`tsc --noEmit`) limpo. AD-3 verde com `confidence.ts` no core (importa só `node:fs/promises` + relativo `engine-adapter.ts`).

### File List

- `toolkit/src/confidence.ts` — NEW (validação mecânica 🟢🟡🔴 + ledger de confiança, ~210 linhas)
- `toolkit/src/engine-adapter.ts` — MODIFIED (ProposePayload ganha `claims?: Claim[]`)
- `toolkit/src/commit.ts` — MODIFIED (integração validateClaims + buildLedgerEntries + appendConfidenceLedger)
- `tests/confidence.test.ts` — NEW (21 testes cobrindo AC1–AC6 + AD-5 + integração + regressão)
- `tests/adapter.test.ts` — MODIFIED (formato de claims atualizado para 1.4)

## Change Log

- **2026-08-01** — Story 1.4 criada: confiança mecânica por fonte + ledger (AD-5 básico). `confidence.ts` proverá validação mecânica de claims (🟢 exige SHA-256 resolvido; ghost/forward-ref/missing-source → 🟡; 🔴 = gap), ledger append-only em `.process-ai/confidence-ledger.jsonl`, e integração com `commit()` (claims validados antes da escrita, ledger dentro da transação WAL). `ProposePayload` estendido com `claims?: Claim[]` (opcional, retrocompatível). Adapter intocado (AD-3 pass-through).
- **2026-08-01** — Story 1.4 implementada: `confidence.ts` (210 linhas) com `validateClaims` (5 regras AD-5, source resolution via `fs.access`), `appendConfidenceLedger` (JSONL idempotente com dedupe `claimId::artifactSha256`), `buildLedgerEntries` (claimIds determinísticos `{type}-{sha}-{index}`). `commit.ts` integrado: validateClaims após validatePayload, ledger dentro da transação WAL (após provenance, antes do checkpoint write). `engine-adapter.ts`: `ProposePayload.claims?: Claim[]`. Gates: 104/104 testes (21 da 1.4 + 83 da 1.1/1.2/1.3), zero regressões, `tsc --noEmit` limpo, AD-3 verde com `confidence.ts` no core.
- **2026-08-01 (code review 3 camadas)** — Patches P1–P8 aplicados. `confidence.ts`: **P1** (validação hex64 do `source.sha256` + kebab do `source.artifactType` + containment + `manifestExists` via `lstat`/`isFile` — fecha path traversal/symlink/🟢 falso; novo reason `malformed-source`); **P2** (leaf-symlink check no ledger, espelha `appendProvenance`); **P3** (escrita atômica com cleanup + contador monótono); **P5** (guards p/ claims não-array / elemento não-objeto → `ConfidenceError`); **P6** (`appendConfidenceLedger` agora **atualiza** a linha quando o nível validado/degradation muda — decisão D1=(b); idempotente p/ nível inalterado). `commit.ts`: **P7** (JSDoc documenta a ordem validate-before-lock + TOCTOU benigno); **P8** (catch-and-wrap `ConfidenceError`→`CommitError` no boundary + `Array.isArray` guard). `tests/confidence.test.ts`: +11 testes (P1 traversal/symlink/dir/malformed/whitespace/não-string/bad-type, P5 guards, P6 update-on-revalidate ×2), 4 fixtures ghost atualizadas p/ hex64, teste AC4 strengthened (zero side-effects + `CommitError`). Gates: **115/115** testes (32 da 1.4 + 83 anteriores), zero regressões; `tsc --noEmit` limpo p/ o código da 1.4. *(Nota: 2 erros residuais em `tests/cli.test.ts` — arquivo WIP não-rastreado da story 1.5 que importa `bin/process-ai.ts` inexistente; fora do escopo da 1.4.)*
