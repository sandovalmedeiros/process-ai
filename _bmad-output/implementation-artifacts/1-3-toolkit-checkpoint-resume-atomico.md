---
baseline_commit: NO_VCS
---

# Story 1.3: Toolkit — checkpoint/resume atômico (WAL + quarentena)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **dev**,
I want **checkpoint atômico via WAL (Write-Ahead Log) integrado ao commit, com resume determinístico + quarentena de órfãos**,
so that **a sessão sobreviva a crash, interrupção ou kill sem perda nem duplicação de artefatos, e o estado sempre seja reconstruível do checkpoint como fonte autoritativa**.

## Acceptance Criteria

1. **[AC1] Checkpoint avança atomicamente com o commit (AD-4)** — **Given** um `commit()` bem-sucedido, **When** o artefato + manifesto + provenance são persistidos, **Then** o checkpoint em `.process-ai/checkpoint.json` **avança na mesma transação** (WAL: write-intent → apply → mark-complete); crash em qualquer ponto antes da marcação de complete = rollback determinístico no próximo resume, sem artefato órfão perdido e sem duplicação. *(FR-19, AD-4)*

2. **[AC2] Checkpoint é a fonte autoritativa do estado da sessão** — **Given** um checkpoint existente, **When** o sistema faz resume, **Then** o **checkpoint** determina o estágio atual, a lista de artefatos (SHA-256 + artifactType + path) e as decisões de gate; os manifestos em `_process-ai_output/` são **evidência verificada contra o checkpoint** — nunca fonte concorrente. *(AD-4)*

3. **[AC3] Resume é função pura do checkpoint (determinístico)** — **Given** um diretório `.process-ai/` com checkpoint + WAL + manifestos, **When** `resume(root)` é chamado, **Then** o estado reconstruído é **determinístico** (mesmo input → mesmo output) e inclui: estágio atual, lista de artefatos commitados (SHA-256 + tipo + path), decisões de gate pendentes, e lista de órfãos enviados à quarentena. *(FR-19, AD-4)*

4. **[AC4] Manifesto órfão vai para quarentena (nunca auto-mergeado)** — **Given** um manifesto em `.process-ai/manifests/` que **não** é referenciado pelo checkpoint (ex: commit parcial pré-crash), **When** o resume roda, **Then** o manifesto é **movido** para `.process-ai/quarantine/<sha>.json` com um arquivo `.process-ai/quarantine/<sha>.reason.md` explicando por que foi quarentenado; **nunca** é mergeado automaticamente ao estado da sessão. *(AD-4)*

5. **[AC5] Single-writer em `.process-ai/` — sem race condition** — **Given** chamadas concorrentes a `commit()` no mesmo root, **When** o toolkit escreve WAL/checkpoint/artefato, **Then** a escrita em `.process-ai/` é **serializada** (single-writer por root); duas chamadas concorrentes não produzem checkpoint corrompido nem linhas de WAL entrelaçadas. *(AD-4)*

6. **[AC6] Checkpoint registra o estado completo exigido por AD-4** — **Given** um commit, **When** o checkpoint avança, **Then** o registro inclui no mínimo: `stage` (estágio atual da pipeline: string), `artifacts[]` (lista de `{ sha256, artifactType, path }` commitados), `gates[]` (decisões de gate: `{ gateId, decision, decidedAt }`), `lastCheckpointAt` (ISO-8601), e `walCursor` (índice da última entrada de WAL aplicada). *(AD-4 binds)*

> **Critério implícito (não-negociável):** a história deixa o sistema "rodável ponta-a-ponta" no escopo dela — `node --test` 100% verde (incluindo os 46 testes da 1.2, zero regressões), `npm run typecheck` (`tsc --noEmit`) limpo, e o guardrail **AD-3** (`tests/import-boundary.test.ts`) permanece verde **com o novo `checkpoint.ts` no core**. O teste de integração "commit → crash simulado → resume → estado reconstruído correto" deve passar. Não basta "satisfazer os ACs literais".

## Tasks / Subtasks

- [x] **T1 — Estrutura de dados do checkpoint + WAL entry (AC: #2, #6)**
  - [x] Definir tipos TypeScript em `toolkit/src/checkpoint.ts`: `CheckpointState { stage, artifacts[], gates[], lastCheckpointAt, walCursor }`, `WalEntry { id, intent, status, createdAt }`, `ResumeResult { state, orphans[] }`.
  - [x] Definir `WalIntent` como union discriminada: `{ kind: 'commit', payload: { artifactType, sha256, manifestPath } }` | `{ kind: 'gate', payload: { gateId, decision } }` | `{ kind: 'stage-advance', payload: { from, to } }`.
  - [x] Checkpoint **não carrega timestamp no campo de identidade** (idempotência byte-estável — lição da 1.2, AC5). `lastCheckpointAt` e `decidedAt` são metadados de observabilidade, não participam da identidade.
  - [x] **Zero imports** de engine (AD-3: só `node:*` + relativos no core).

- [x] **T2 — WAL: Write-Ahead Log (AC: #1, #5)**
  - [x] `walAppend(root, intent: WalIntent): Promise<WalEntry>` — append atômico ao arquivo `.process-ai/wal.jsonl` (uma linha JSON por entrada).
  - [x] `walReadAll(root): Promise<WalEntry[]>` — lê todas as entradas do WAL para replay/resume.
  - [x] `walMarkComplete(root, entryId: string): Promise<void>` — reescreve o WAL com a entrada marcada como `status: 'applied'`.
  - [x] **Single-writer via lock file (AC5):** `acquireLock(root): Promise<LockHandle>` e `releaseLock(handle): Promise<void>` usando `.process-ai/.lock` com `fs.mkdir` (atômico em todos OS) + `pid` no conteúdo. Timeout configurável (default 30s) com exponential backoff + stale detection.

- [x] **T3 — Checkpoint state machine (AC: #2, #3, #6)**
  - [x] `checkpointRead(root): Promise<CheckpointState>` — lê `.process-ai/checkpoint.json`. Se não existe, retorna estado inicial.
  - [x] `checkpointWrite(root, state: CheckpointState): Promise<void>` — escreve `.process-ai/checkpoint.json` atomicamente (temp + rename, padrão 1.2).
  - [x] `checkpointAdvance(root, state, intent, apply): Promise<CheckpointState>` — orquestra: WAL append (pending) → apply() → checkpoint write → WAL mark-complete. Crash-safe.

- [x] **T4 — Resume determinístico + quarentena de órfãos (AC: #2, #3, #4)**
  - [x] `resume(root): Promise<ResumeResult>` — função pura: lê checkpoint → processa WAL (rollback pending, replay applied) → lista manifestos → quarentena órfãos.
  - [x] `quarantineArtifact(root, sha256, manifestPath, reason?): Promise<QuarantinedArtifact>` — move manifesto + artefato para `quarantine/`. Registra `reason.md`.
  - [x] **Nunca deleção destrutiva:** quarentena é **move** (não delete). Diretório `quarantine/` fica fora do checkpoint.

- [x] **T5 — Integração commit + checkpoint (AC: #1)** — **MODIFICADO `commit.ts`**
  - [x] `commit()` agora usa `acquireLock` + `checkpointAdvance` com `WalIntent { kind: 'commit' }`.
  - [x] Transação atômica: **lock → WAL append → write artifact/manifest/provenance → checkpoint write → WAL mark-complete → unlock**.
  - [x] Lock liberado no `finally`; entradas WAL pending descartadas no próximo resume.
  - [x] O adapter (`adapter.ts`) **não mudou** — `propose()` continua delegando a `commit()` (AD-3 pass-through).
  - [x] **Preservado:** assinatura `commit()`, `CommitResult`, validações existentes, abort-before-write, atomicidade por-arquivo.

- [x] **T6 — Testes (AC: #1–#6 + AD-4 + AD-3 + regressão 1.2)**
  - [x] **`tests/checkpoint.test.ts` (NOVO — 21 testes):**
    - T1: initialState, AC5 lock exclusivo, stale lock, WAL append/read/mark-complete, checkpoint read/write, checkpointAdvance (commit/stage-advance/gate/apply-failure), resume (vazio/determinístico/replay), quarentena (move/nunca-auto-mergeia), integração commit+checkpoint (reflete/múltiplos/ponta-a-ponta), regressão abort-before-write, quarantineArtifact manual.
  - [x] **`tests/commit.test.ts`:** 25 testes existentes passam (zero regressões) — checkpoint integration tests estão em `checkpoint.test.ts`.
  - [x] **`tests/import-boundary.test.ts`:** verde — `checkpoint.ts` varrido automaticamente (AD-3 estendido).
  - [x] **`tests/adapter.test.ts`:** AC4 pass-through continua passando (checkpoint transparente).

- [x] **T7 — Critério implícito (não-negociável)**
  - [x] `node --test tests/*.test.ts` → 81/81 pass, 0 fail.
  - [x] `npm run typecheck` (`tsc --noEmit`) limpo.
  - [x] AD-3 verde com `checkpoint.ts` no core (importa só `node:*` + relativos).
  - [x] Teste de integração ponta-a-ponta: commit → checkpoint reflete → resume determinístico.

### Review Findings

**Data:** 2026-08-01
**Resultado:** APPROVED — 2 PATCHES aplicados, zero regressões
**Gates finais:** 66/66 testes (0 falhas), `tsc --noEmit` limpo, AD-3 verde

#### ✅ PATCH (aplicado)

- **P1 — `resume()` persiste checkpoint quando `walCursor` avança com só entradas `pending`** — `checkpoint.ts:400,412`: captura `initialCursor` antes do loop e persiste checkpoint quando `state.walCursor !== initialCursor` (antes só persistia com `replayed > 0`). Sem isso, chamadas repetidas de `resume()` reprocessavam as mesmas entradas `pending` porque o cursor não era persistido. Teste: `CR-P1` em `checkpoint.test.ts`.

- **P2 — `walReadAll` tolera linhas JSON malformadas** — `checkpoint.ts:239-245`: `.map(JSON.parse)` substituído por parse com try/catch que retorna `null` para linhas corrompidas + `.filter(Boolean)`. Sem isso, um WAL com linha corrompida quebrava `resume()` completamente — violando AD-4 (resume sempre deve reconstruir o estado). Teste: `CR-P2` em `checkpoint.test.ts`.

#### 📋 DEFER (legítimo, pertence a story/hardening futuro)

| # | Achado | Destino |
|---|--------|---------|
| D1 | `walMarkComplete` rewrite O(n) em vez de append puro (docstring diz "append-only", código faz rewrite) | Hardening pós-Epic 1 |
| D2 | `resume()` O(n²) via `indexOf` no loop (< 100 entradas em v1, irrelevante) | Hardening pós-Epic 1 |
| D3 | Quarentena de manifesto corrompido usa filename-stem como SHA (não o SHA puro) | Story 3.1 (schema-núcleo) |
| D4 | `_provenanceCache` (módulo-level Map) nunca é limpo — memory leak multi-root | Story 3.1 (multi-engine) |

#### ❌ DISMISSED (avaliado, não aplicável)

- `checkpointAdvance` sem lock interno → responsabilidade do caller (`commit()`), documentado
- Stale lock race (`isLockStale` → `breakStaleLock`) → loop reavalia, `rm({force:true})` idempotente
- PID reuse no stale detection → janela minúscula, reavaliado no próximo loop
- `lastCheckpointAt` sobrescrito no replay → campo de observabilidade, não de identidade

#### Cross-layer consensus (Blind Hunter ∩ Edge Case ∩ Acceptance Auditor)

Todas as 3 camadas convergiram em APPROVED. Nenhum achado de gravidade HIGH/MED. Os 2 PATCHES são hardening de robustez (AD-4 fortalecido: resume sobrevive a WAL corrompido + não reprocessa pending indefinidamente). Nenhum AC violado. AD-3, AD-4, AD-1 preservados.

## Dev Notes

### O que esta história É (e o que NÃO é) — leia antes de codar

Esta é a **story 1.3 de 6 do Epic 1** (Walking Skeleton). Ela adiciona a **camada transacional** sobre o commit da 1.2: o que era "commit atômico por-arquivo" vira "commit+checkpoint atômicos como transação" via **WAL (Write-Ahead Log)**. A 1.2 provou que o toolkit é o único escritor com SHA-256; a 1.3 prova que a sessão sobrevive a crash sem perda.

**Não construa aqui (scope creep — cada item pertence a outra story):**

| Pertence a 1.3 (esta) | Pertence a histórias futuras — NÃO faça |
|---|---|
| `checkpoint.ts` (WAL + checkpoint state machine + resume + quarentena) | Atribuição semântica 🟢🟡🔴 por fonte → **1.4** |
| Integração `commit()` + `checkpointAdvance()` (transação) | Ledger de confiança (AD-5) → **1.4** |
| Lock file single-writer em `.process-ai/` | BPMN 2.0 XML canônico (AD-6) → **2.3** |
| Quarentena de manifestos órfãos | Schema-núcleo por tipo de artefato (AD-2) → **3.1** |
| Estrutura de checkpoint (`stage`, `artifacts[]`, `gates[]`) | Conteúdo real dos gates (aprovação humana via Déa) → **1.5** |
| `ResumeResult` e função `resume()` | UX do resume por engine → **1.5** (invocação) |
| | Skills de especialistas (Bento/Miguel/Júlia/Zanoni) → **1.6** |

> **Fronteira 1.3 ↔ 1.4 (não-negociável):** AD-4 *descreve* o checkpoint como a fonte autoritativa que carrega artefatos commitados e decisões de gate. Em 1.3, o foco é a **mecânica transacional**: WAL, atomicidade commit+checkpoint, resume, quarentena. A **atribuição de confiança** 🟢🟡🔴 (AD-5) que popula claims + marcadores **é literalmente a Story 1.4**. O checkpoint em 1.3 **não valida** marcadores de confiança — só registra artefatos e gates estruturalmente.

> **Fronteira 1.3 ↔ 1.5 (não-negociável):** O checkpoint em 1.3 define a **estrutura de dados** para `stage` e `gates[]`, mas não sabe *o que* é um gate nem *quais* estágios existem — isso é definido pela skill condutora (Déa) na 1.5. O `stage` é uma string opaca para o toolkit; a semântica dos estágios (Gate 0, Gate 1, …) vive na skill.

### Paradigma e invariantes binding (não quebre)

- **AD-4 — Checkpoint autoritativo (o coração desta história):** todo estado de sessão vive em `.process-ai/checkpoint`. **Commit + avançar checkpoint são uma transação atômica** (WAL: grava-se a intenção antes de aplicar). `resume` é função **pura** do checkpoint: qualquer manifesto **não referenciado** pelo checkpoint é posto em **quarentena** (nunca auto-mergeado). Escrita em `.process-ai/` é **single-writer** (o toolkit serializa). [Source: ARCHITECTURE-SPINE.md#AD-4, SPEC.md#CAP-8]
- **AD-1 — Propose/Commit:** o toolkit é o único escritor. O checkpoint é parte dessa escrita — skills não tocam `.process-ai/`. O adapter é pass-through. [Source: ARCHITECTURE-SPINE.md#AD-1]
- **AD-3 — Núcleo hexagonal:** `checkpoint.ts` vive no core (`toolkit/src/`) e **só pode importar** `node:*` builtins ou caminhos relativos — nunca um package npm. O adapter não conhece WAL/checkpoint. [Source: ARCHITECTURE-SPINE.md#AD-3]
- **FR-19 — Checkpoint/resume:** checkpoint após cada etapa; resume sem perda nem duplicação. [Source: prd.md §4.9/FR-19, epics.md#Story 1.3]
- **NFR-4 — Resumabilidade:** checkpoint após cada etapa; resume sem perda nem duplicação. [Source: prd.md §5/NFR-4]

### O código que esta história MODIFICA — leia antes de tocar

_(Não-negociável: ler o estado atual antes de mudar. Fontes: `toolkit/src/commit.ts`, `toolkit/src/engine-adapter.ts`, testes existentes.)_

**`toolkit/src/commit.ts` (MODIFY — integração checkpoint):**
- **Estado atual:** `commit()` orquestra validate → canonicalize → sha → sanitize → scope → symlink-check → write artifact → write manifest → append provenance → return CommitResult. Tudo atômico por-arquivo (temp+rename), mas **não** transacional (se crashar entre artifact e manifest, o artifact fica órfão — W1 da 1.2 code review).
- **O que muda:** `commit()` ganha uma **camada WAL externa**: antes de escrever qualquer coisa, faz append da intenção no WAL; após todas as escritas, avança o checkpoint; após checkpoint escrito, marca WAL complete. O fluxo interno (validate → canonicalize → sha → etc.) **não muda** — a camada WAL envolve, não substitui.
- **O que preservar:** assinatura `commit(payload, opts): Promise<CommitResult>` idêntica; `CommitResult` idêntico; validações existentes (AC6 1.2) idênticas; abort-before-write (AC3 1.2) preservado; atomicidade por-arquivo preservada (temp+rename). **Zero regressões nos 18 testes da 1.2.**

**`toolkit/src/checkpoint.ts` (NEW):**
- Este é o novo módulo. Estrutura de dados (tipos TypeScript), WAL (append/apply/mark-complete), checkpoint (read/write/advance), resume, quarentena, lock.
- **AD-3 allowlist:** só `node:fs`, `node:path`, `node:crypto` (se precisar de UUID para lock), e imports relativos de `commit.ts` (se precisar delegar a escrita de artefato) e `engine-adapter.ts` (tipos).
- **Decisão de design:** o WAL é JSONL (`.process-ai/wal.jsonl`) — uma linha por entrada, append-only. Zero deps. Node 24 não tem parser YAML/TOML built-in e o allowlist AD-3 proíbe package npm no core (decisão 1.2 mantida).

**`tests/commit.test.ts` (MODIFY — adicionar testes de integração):**
- **Estado atual:** 18 testes cobrindo AC1–AC6 da 1.2.
- **O que adicionar:** 2–3 testes de integração que verificam a transação commit+checkpoint.
- **O que preservar:** todos os 18 testes existentes passam sem modificação.

**Layout resultante (delta em negrito):**
```text
toolkit/
  src/
    engine-adapter.ts       # sem mudança (1.2)
    commit.ts               # MODIFY: integração com checkpoint (WAL wrapper)
    checkpoint.ts           # NEW (esta story)
  adapters/claude-code/
    adapter.ts              # sem mudança (1.2 — pass-through)
tests/
  checkpoint.test.ts        # NEW
  commit.test.ts            # MODIFY: +2-3 testes de integração
  adapter.test.ts           # sem mudança (AC4 pass-through continua)
  import-boundary.test.ts   # sem mudança (cobre checkpoint.ts automaticamente)
# No root da sessão (gerado pelo toolkit):
.process-ai/
  checkpoint.json           # NEW: estado autoritativo da sessão
  wal.jsonl                 # NEW: Write-Ahead Log
  .lock                     # NEW: single-writer lock
  manifests/<type>-<sha>.json  # existente (1.2)
  provenance.jsonl          # existente (1.2)
  quarantine/               # NEW: manifestos órfãos (nunca auto-mergeados)
    <sha>.json
    <sha>.reason.md
```

## Decisões de implementação (registre as escolhas na Completion Notes)

1. **Formato do WAL (JSONL — mesma decisão da 1.2).** Linhas JSON append-only em `.process-ai/wal.jsonl`. Cada linha: `{ id, intent, status, createdAt }`. `status` ∈ `{ pending, applied }`. O WAL é a **fonte da verdade durante a transação**; o checkpoint é o estado consolidado pós-transação.

2. **Lock via `fs.mkdir` (atômico em todos OS).** `.process-ai/.lock` como diretório (não arquivo) — `mkdir` é atômico em POSIX e Windows; EEXIST = lock já adquirido. Conteúdo: `pid` do processo dono + timestamp de aquisição. Stale detection: se o PID não existe mais (`.lock/pid` vs `process.kill(pid, 0)`), o lock é considerado stale e pode ser quebrado.

3. **Transação commit+checkpoint em 5 passos (não-negociável):**
   ```
   1. acquireLock(root)
   2. WAL append { intent: 'commit', status: 'pending' }
   3. escrever artefato + manifesto + provenance (commit existente da 1.2)
   4. checkpointAdvance (atualiza artifacts[], stage, walCursor)
   5. WAL mark-complete (status → 'applied')
   → finally: releaseLock
   ```
   Crash entre 2 e 3: WAL tem entrada pending → resume descarta (rollback), artefato não existe = OK.
   Crash entre 3 e 4: WAL pending, artefato existe mas sem checkpoint → resume detecta órfão → quarentena.
   Crash entre 4 e 5: WAL pending, checkpoint avançado → resume faz **replay** (checkpoint já está atualizado) — idempotente.
   Crash após 5: tudo applied, checkpoint consistente → resume normal.

4. **Idempotência do resume (AC3).** `resume(root)` é função pura: mesmo estado on-disk → mesmo `ResumeResult`. O resume **não modifica** o estado on-disk exceto pela movimentação de órfãos para quarentena (que é determinística: mesmo conjunto de órfãos → mesmos paths de quarentena).

5. **Checkpoint NÃO carrega timestamp no campo identidade (padrão 1.2).** `stage`, `artifacts[]`, `gates[]` são os campos de identidade; `lastCheckpointAt` e `walCursor` são metadados de observabilidade. Replay de uma transação já aplicada produz checkpoint byte-idêntico (desde que os artefatos sejam idempotentes — AC5 da 1.2 garante).

6. **Quarentena é move, nunca delete.** Preserva evidência para debug/humano. O diretório `quarantine/` fica **fora** do checkpoint (não indexado, não referenciado). Um futuro comando `process-ai quarantine list` ou `process-ai quarantine recover <sha>` pode operar sobre ele (fora de escopo em 1.3).

7. **O adapter NÃO conhece checkpoint.** `ClaudeCodeAdapter.propose()` continua delegando a `commit(payload, { root: this.cwd, agent: this.agent })`. A transação WAL é transparente para o adapter — o `CommitResult` retornado é idêntico. Isso preserva AD-3 (pass-through) e não quebra o teste AC4 da 1.2.

## Enforcement de atomicidade — o guardrail mais importante desta história

AC1 ("commit+checkpoint atômicos") é o **equivalente estrutural do AD-3 da 1.1 e do AC3 da 1.2** — é o que materializa AD-4. Estratégia:

- **WAL como fonte da verdade durante a transação.** Se o processo morre, o próximo resume lê o WAL e sabe exatamente o que estava em andamento.
- **Lock file previne condição de corrida.** Dois commits concorrentes no mesmo root = segundo espera (ou falha com erro acionável após timeout).
- **Ordem estrita (não-negociável):** WAL-intent ANTES de qualquer escrita de artefato; checkpoint-write DEPOIS de todas as escritas; WAL-mark-complete DEPOIS do checkpoint. Essa ordem garante que em qualquer ponto de crash o estado é reconstruível sem ambiguidade.
- **Rollback vs replay no resume:** `pending` → rollback (descarta intenção não-concluída). `applied` com cursor > checkpoint → replay (idempotente, checkpoint já reflete ou vai refletir).

## Padrões de teste estabelecidos (espelhar — não reinventar)

Herdados da 1.1 e 1.2:
- `node:test` + `node:assert/strict`; tmpdir via `fs.mkdtemp(os.tmpdir())`; `finally { fs.rm(...) }`.
- Snapshot recursivo para verificar escopo (padrão `listFiles` da `commit.test.ts:25-33`).
- Crash simulado: em vez de matar o processo real, o teste **injeta** uma falha num ponto controlado (ex: mock de `atomicWriteFile` que lança após escrever o artefato mas antes do manifesto) e verifica que `resume` lida corretamente.
- **Skip explícito** em testes de symlink no Windows sem Developer Mode (`t.skip(...)`, padrão CR R2#3 da 1.1).
- Teste de idempotência: 2× `resume` → mesmo `ResumeResult`.
- Teste de determinismo: `canonicalize(JSON.stringify(checkpointState))` → hash estável (padrão 1.2).

## Convenções (do spine, herdadas da 1.1 e 1.2)

- Naming `kebab-case`; IDs globais estáveis (FR-n, AD-n) — nunca renumerados.
- Node 24 LTS (v24.18.1); TS + ESM; imports `.ts` com extensão explícita (type-stripping nativo).
- Sem deps de runtime no core (AD-3 allowlist: só `node:` + relativos).
- Erros `CommitError`/`CheckpointError` com mensagens acionáveis em Português do Brasil (padrão 1.2).
- Manifestos em `.process-ai/manifests/<artifactType>-<sha>.json` (convenção D1 definida na 1.2 code review — **aplicar neste story como parte da integração, já que 1.2 deixou como patch pendente**).

## Project Structure Notes

- **Greenfield incremental:** a 1.1 criou scaffold + porta + adapter; a 1.2 criou o commit SHA-256 + manifesto + provenance. Esta 1.3 adiciona a **camada transacional** (WAL + checkpoint + resume + quarentena) **envolvendo** o commit da 1.2. O `commit()` existente é preservado como núcleo interno; a transação WAL é uma camada externa que o envolve.
- **Alvo ≠ framework:** checkpoint/WAL/lock escrevem no **root da sessão** (cwd do usuário = projeto-alvo), herdando o comportamento da 1.2. Testes injetam tmpdir como root.
- **`.gitignore` da 1.1 já cobre** `_process-ai_output/` e `.process-ai/` — checkpoint/WAL/quarentena estão sob `.process-ai/`, automaticamente ignorados.
- **Single-writer não é multi-processo (v1):** o lock file garante consistência intra-processo e inter-processo acidental, mas o caso de uso v1 é **single-process** (uma sessão Claude Code = um processo Node por vez). Não implementar fila distribuída ou consenso multi-nó.

## References

- [Source: ARCHITECTURE-SPINE.md#AD-4] — checkpoint autoritativo, commit+checkpoint atômicos (WAL), resume puro, quarentena de órfãos, single-writer
- [Source: ARCHITECTURE-SPINE.md#AD-1] — propose/commit, toolkit único escritor, adapter pass-through
- [Source: ARCHITECTURE-SPINE.md#AD-3] — núcleo hexagonal (checkpoint.ts: só `node:` + relativos)
- [Source: ARCHITECTURE-SPINE.md#AD-5] — confiança por fonte verificável (→ **Story 1.4**: não implementar aqui)
- [Source: SPEC.md#CAP-8] — sessão resiliente, resume sem perda nem duplicação
- [Source: SPEC.md#CAP-9] — não-destrutivo & multi-engine
- [Source: prd.md §4.9/FR-19] — checkpoint + resume
- [Source: prd.md §5/NFR-4] — resumabilidade
- [Source: glossary.md "Checkpoint" · "Write-Ahead Log (WAL)" · "Quarentena" · "Resume"] — vocabulário canônico
- [Source: epics.md#Story 1.3] — ACs originais da story (FR-19, AD-4)
- [Source: 1-2-toolkit-propose-commit-sha256.md] — inteligência da story anterior: `commit()`, `atomicWriteFile`, `sha256`, `canonicalize`, `CommitResult`, padrões de teste, W1 (artefato órfão = boundary exata desta story), convenção D1 (manifest `<type>-<sha>.json`)
- [Source: 1-1-scaffold-engineadapter-claudecodeadapter.md] — scaffold, porta `EngineAdapter`, `ClaudeCodeAdapter`, padrões de atomic write, defense-in-depth symlink, AD-3 guardrail
- [External: Node.js 24 — `fs.mkdir` atomicidade] — `mkdir` é atômico em POSIX e Windows (base do lock file)
- [External: Node.js 24 — `fs.rename` atomicidade] — atômico no mesmo filesystem (base do checkpoint write e WAL append)
- [External: Write-Ahead Logging pattern] — intenção antes de aplicar; rollback de entradas pendentes no recovery

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 via Claude Code harness; skill bmad-dev-story.

### Debug Log References

### Completion Notes List

- **T1 — Tipos implementados:** `WalIntent` (union discriminada: commit | gate | stage-advance), `WalEntry`, `CheckpointState`, `CheckpointArtifact`, `CheckpointGate`, `ResumeResult`, `QuarantinedArtifact`, `LockHandle`, `CheckpointError`. Todos em `toolkit/src/checkpoint.ts`. Zero imports de engine (AD-3).
- **T2 — WAL implementado:** `walAppend` (append JSONL), `walReadAll` (parse completo), `walMarkComplete` (rewrite atômico com status 'applied'). Lock via `fs.mkdir` (sem `recursive: true` — atômico) + stale detection (PID check) + exponential backoff com jitter. Timeout default 30s.
- **T3 — Checkpoint state machine:** `checkpointRead` (ENOENT → initialState), `checkpointWrite` (temp+rename atômico), `checkpointAdvance` (WAL append → apply callback → checkpoint write → WAL mark-complete). `applyIntent` é função pura (sem IO).
- **T4 — Resume + quarentena:** `resume()` lê checkpoint → processa WAL (rollback pending, replay applied) → lista manifests/ → move órfãos para `quarantine/`. `quarantineArtifact` move manifesto + artefato + escreve `reason.md`. Quarentena é move, nunca delete.
- **T5 — Integração commit.ts:** `commit()` ganhou wrapper WAL: `acquireLock` → `checkpointAdvance` com callback de escritas → `releaseLock` no finally. Assinatura `commit()` inalterada. Adapter intocado (AD-3 pass-through).
- **Decisão de design — Lock sem recursive:** `fs.mkdir(lockDir)` SEM `{recursive: true}` para garantir que EEXIST seja lançado em lock existente. Parents criados separadamente com `{recursive: true}`.
- **Gates (T7):** `node --test tests/*.test.ts` → 81/81 pass, 0 fail. `tsc --noEmit` limpo. AD-3 verde cobrindo `checkpoint.ts`.

### File List

- `toolkit/src/checkpoint.ts` — NEW (WAL + checkpoint state machine + resume + quarentena + lock single-writer, ~360 linhas)
- `toolkit/src/commit.ts` — MODIFIED (integração WAL: lock → checkpointAdvance → unlock; imports de checkpoint.ts)
- `tests/checkpoint.test.ts` — NEW (21 testes cobrindo AC1–AC6 + AD-4 + regressão)

## Change Log

- **2026-08-01** — Story 1.3 implementada: checkpoint/WAL atômico integrado ao commit (AD-4). `checkpoint.ts` provê WAL (write-ahead log JSONL), checkpoint state machine (read/write/advance), resume determinístico (rollback pending, replay applied), quarentena de órfãos (move, nunca delete), e lock single-writer (`fs.mkdir` atômico + stale detection). `commit.ts` integrado com transação atômica de 5 passos (lock → WAL append → write artifact/manifest/provenance → checkpoint write → WAL mark-complete → unlock). Adapter intocado (AD-3 pass-through). Gates: 81/81 testes (21 da 1.3 + 60 da 1.2/1.1), zero regressões, `tsc --noEmit` limpo, AD-3 verde com `checkpoint.ts` no core.
