---
baseline_commit: 8166135
---

# Story 1.5: Déa — skill condutor (/process-ai · Gate 0 · orquestra · gates · resumo)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **leigo**,
I want **iniciar com `/process-ai` e ser conduzido pela Déa (Gate 0 → handoffs → gates → resumo + relatório de confiança)**,
so that **eu saiba o que fazer em cada etapa e veja o processo se documentando ponta-a-ponta, com sessão resumível e entregável final commitado**.

## Acceptance Criteria

1. **[AC1] `/process-ai` inicia a Déa (FR-1, AD-7)** — **Given** Claude Code com a skill instalada (via `ClaudeCodeAdapter.installSkills` no bootstrap), **When** o usuário digita `/process-ai`, **Then** a Déa assume a condução em `pt-BR` e pergunta *"Qual processo vamos mapear?"*. A skill-fonte continua sendo `skills/process-ai/SKILL.md` (única fonte de verdade, copiada byte-a-byte pelo adapter). *(FR-1)*

2. **[AC2] Gate 0 confirma o escopo antes de qualquer descoberta (FR-2, FR-3, AD-1, AD-4)** — **Given** o usuário responde o nome do processo, **When** a Déa confirma o escopo (ex.: *lead*→fechamento) no **Gate 0**, **Then** nenhum estágio de especialista inicia antes da aprovação do Gate 0; a decisão do gate é **registrada no checkpoint** (`.process-ai/checkpoint.json`, `gate-0` + `decision`) via toolkit — nunca escrita direta pela skill. *(FR-2, FR-3)*

3. **[AC3] Pipeline orquestrada com gate básico antes de cada especialista (FR-3, FR-4 básico, AD-4)** — **Given** Gate 0 aprovado, **When** a Déa avança pela pipeline (Bento→Miguel→Júlia→Zanoni), **Then** cada especialista é precedido por um gate básico (Gate 1–4) cuja decisão é registrada no checkpoint; um estágio só inicia após o gate anterior aprovado. A ordem dos agentes é **fixa** no v1. *(FR-3, FR-4 básico)*

4. **[AC4] Canal propose runtime exposto ao engine (AD-1, AD-3, FR-20)** — **Given** a skill markdown da Déa (que só pode agir via Bash/slash no engine), **When** ela precisa commitar um artefato / registrar um gate / resumir / gerar relatório, **Then** existe um **CLI runtime** (`process-ai propose|gate|resume|report [stage]`) cuja **composition root** instancia o `ClaudeCodeAdapter` como `EngineAdapter` e roteia ao toolkit (único escritor); o CLI e a skill **não mutam** o payload e **não escrevem** fora das pastas protegidas — o adapter segue pass-through e continua sendo o **único** ponto que conhece o engine. *(AD-1, AD-3, FR-20; materializa "expor o canal de propose" do AD-3)*

5. **[AC5] Resume ao reiniciar (FR-19, AD-4)** — **Given** uma sessão interrompida com checkpoint em `.process-ai/`, **When** o usuário reinicia com `/process-ai`, **Then** a Déa chama `resume` (função pura do checkpoint) e **reinicia no último gate/estágio concluído**, sem perda nem duplicação; manifestos órfãos vão para `.process-ai/quarantine/` (nunca auto-mergeados). *(FR-19, AD-4)*

6. **[AC6] Resumo mínimo + relatório de confiança entregue em `_process-ai_output/` (FR-5 mínimo, AD-5)** — **Given** o fim da pipeline, **When** a Déa encerra, **Then** um **resumo de encerramento** + **relatório de confiança mínimo** (contagem 🟢/🟡/🔴 agregada do ledger `.process-ai/confidence-ledger.jsonl`) é **proposto e commitado** em `_process-ai_output/` (via `propose`); a sessão não termina sem esse entregável. Versão **mínima** em 1.5 (relatório consolidado completo → 2.5). *(FR-5 mínimo)*

> **Critério implícito (não-negociável):** a história deixa o sistema "rodável ponta-a-ponta" no escopo dela — `node --test tests/*.test.ts` 100% verde (incluindo os 104 testes da 1.1–1.4, **zero regressões**), `npm run typecheck` (`tsc --noEmit`) limpo, e o guardrail **AD-3** (`tests/import-boundary.test.ts`) permanece verde **com qualquer novo arquivo do core** (ex.: `toolkit/src/report.ts`). Um **E2E simulado** deve passar: bootstrap em tmpdir → conducão da Déa via CLI (Gate 0 → gates → resume → resumo+relatório) → artefato(s) commitado(s) em `_process-ai_output/`, gates registrados no checkpoint, resume sem duplicação. Não basta "satisfazer os ACs literais".

## Tasks / Subtasks

- [x] **T1 — CLI runtime dispatcher `bin/process-ai.ts` (AC: #4, #2, #3, #5, #6)**
  - [x] Novo entrypoint `bin/process-ai.ts` (deixar `bin/bootstrap.ts` **intacto** — ele é o comando de *install*; o dispatcher é o canal de *runtime*). Subcomandos: `propose`, `gate`, `resume`, `report`, e leitura de estado (`checkpoint`/`status`).
  - [x] **Composition root AD-3:** `const adapter: EngineAdapter = new ClaudeCodeAdapter({ cwd: process.cwd() })` — o CLI depende da **porta**, não do adapter concreto (espelhar `bootstrap.ts:166`). `cwd` = projeto-alvo (onde `_process-ai_output/`+`.process-ai/` vivem).
  - [x] `propose --payload <path.json>`: lê um arquivo JSON no **shape `ProposePayload`** (`{ artifactType, content, claims? }`) e chama `adapter.propose(payload)` → imprime `CommitResult` (JSON: `sha256`, `artifactPath`, `manifestPath`). **Por que path e não inline:** evitar escaping/limite de linha de comando do shell com JSON/markdown grande — o agente escreve o payload em arquivo e passa o path.
  - [x] `gate --id <gateId> --decision <approved|rejected|changes-requested>`: lê checkpoint (`checkpointRead`), chama `checkpointAdvance(root, state, { kind:'gate', payload:{ gateId, decision } }, async () => {})` → imprime o `CheckpointState`. **Apply no-op** (gate não escreve artefato); a atomicidade WAL é preservada.
  - [x] `stage --to <stageId>` (ou flag `--advance-to` em `gate`): `checkpointAdvance(root, state, { kind:'stage-advance', payload:{ from: state.stage, to } }, async () => {})`.
  - [x] `resume`: chama `resume(root)` → imprime `ResumeResult` (`{ state, orphans }`). A Déa usa no **início** de `/process-ai` para descobrir se há sessão em andamento (AC5).
  - [x] `report`: chama `reportConfidence(root)` (T4) → imprime o relatório; a Déa o embute no entregável final e o commita via `propose`.
  - [x] **Nenhuma escrita direta** em `_process-ai_output/` ou `.process-ai/` pelo CLI — toda mutação via `adapter.propose()` (commit) ou `checkpointAdvance` (gate/stage). Escrita fora do escopo aborta (já enforceado por `commit.ts:assertWithinScope`).
  - [x] Erros traduzidos em pt-BR, acionáveis (padrão 1.2/1.4: `CommitError`/`CheckpointError`/`ConfidenceError` já trazem contexto). Entry-guard por `realpath` (padrão 1.1 R2) para ser robusto a symlink/case de drive no Windows.

- [x] **T2 — Skill condutora `skills/process-ai/SKILL.md` (AC: #1, #2, #3, #5, #6)**
  - [x] Substituir o **stub da 1.1** pela condução completa, **mantendo** o frontmatter `name: process-ai` + `description` (o `name` é o que torna `/process-ai` slash-invocável — não mudar).
  - [x] **Estrutura da skill (markdown que o agente segue):**
    - **Abertura:** pergunta *"Qual processo vamos mapear?"* (AC1).
    - **Entry/resume (AC5):** antes de iniciar, rodar `process-ai resume`; se houver checkpoint com estágio != inicial, retomar dali; senão, sessão nova.
    - **Gate 0 (AC2):** após a resposta, confirmar o escopo e só prosseguir após aprovação → registrar via `process-ai gate --id gate-0 --decision approved`.
    - **Pipeline + gates (AC3):** avançar estágios `discovery` (Bento, Gate 1) → `mapping` (Miguel, Gate 2) → `modeling` (Júlia, Gate 3) → `standardization` (Zanoni, Gate 4), cada um precedido por seu gate. **Em 1.5 os especialistas são *slots declarados*** — ver Fronteira 1.5↔1.6 abaixo.
    - **Encerramento (AC6):** gerar resumo (narrativo, pela Déa) + relatório de confiança (`process-ai report`) → commitar via `process-ai propose --payload ...` (artifactType ex.: `summary-report`).
  - [x] **Toda escrita pelo canal:** a skill **instrui o agente a usar o CLI** (`process-ai ...`); a skill em si **não escreve** nas pastas protegidas (AD-1 enforcement estrutural).
  - [x] Idioma `pt-BR`. Tom da Déa: conduz o leigo, explica cada etapa, destaca 🟡/🔴 nos gates.

- [x] **T3 — Registro de gates + avanço de estágio via checkpoint (AC: #2, #3)**
  - [x] Confirmar que `checkpoint.ts` já suporta intents `gate` e `stage-advance` (suporta — `WalIntent` em `checkpoint.ts:26-29`, `applyIntent:360-372`). **Nenhuma mudança no toolkit** esperada; se necessário, expor um helper thin.
  - [x] Validar que `gate`/`stage` no dispatcher (T1) gravam atomicamente (WAL) e que o checkpoint resultante reflete gates + stage corretos.

- [x] **T4 — Relatório de confiança mínimo em `toolkit/src/report.ts` (AC: #6, AD-5)**
  - [x] **NOVO módulo do core:** `reportConfidence(root): Promise<ConfidenceReport>` — agrega `.process-ai/confidence-ledger.jsonl` (contagem por nível 🟢/🟡/🔴, lista de `artifactType`s commitados via `checkpointRead`) e retorna um objeto/strings canônicas. **AD-3:** só `node:*` + imports relativos (`./checkpoint.ts`, `./confidence.ts`). Import-boundary (`tests/import-boundary.test.ts`) cobre automaticamente.
  - [x] **Versão MÍNIMA:** contagens + lista de artefatos + nota de gaps/orphans. **NÃO fazer aqui:** rastreabilidade bidirecional por claim, verificação de trecho (excerpt), relatório consolidado navegável → **2.5** (fronteira explícita da 1.4).
  - [x] Robusto a ledger ausente/vazio (sessão sem claims — caso de uma run 1.5-only sem especialistas): retorna contagens zeradas, não lança.

- [x] **T5 — Testes (AC: #1–#6 + AD-1/AD-3/AD-4 + regressão 1.1–1.4)**
  - [x] **`tests/cli.test.ts` (NOVO):** `propose` lê payload de arquivo → `CommitResult` com sha256/path; `gate` registra `gate-0` no checkpoint (ler `.process-ai/checkpoint.json`, asserir `gates[]`); `stage` avança estágio; `resume` retorna estado + orphans (simular crash: ledger/provenance órfão → quarantine); `report` agrega ledger (casos: vazio → zeros; com claims → contagens). Adapter mockável injetando `cwd=tmpdir`.
  - [x] **`tests/skill.test.ts` (NOVO) ou extensão de `adapter.test.ts`:** após `installSkills(tmp)`, o `<tmp>/.claude/skills/process-ai/SKILL.md` instalado **contém** as seções do condutor (Gate 0, pipeline, gates, resume, encerramento) e o frontmatter `name: process-ai` (não-regressão da 1.1). Fonte única de verdade: `assert installado === skills/process-ai/SKILL.md` byte-a-byte.
  - [x] **`tests/report.test.ts` (NOVO):** `reportConfidence` sobre ledger vazio → zeros; sobre ledger com N claims → contagens corretas; AD-3 verde.
  - [x] **E2E simulado (NOVO, `tests/e2e-conductor.test.ts`):** num tmpdir — conduzir via dispatcher: `resume` (vazio) → `gate --id gate-0 --decision approved` → `stage --to discovery` → (slots de especialista sem artefatos em 1.5) → `gate --id gate-4 ...` → `report` + `propose --payload summary-report.json` → asserir: artefato em `_process-ai_output/`, checkpoint com `gate-0..gate-4` + stage final, `resume` depois não duplica. *(Critério implícito.)*
  - [x] **Regressão:** `tests/{scaffold,adapter,bootstrap,commit,checkpoint,confidence,import-boundary}.test.ts` **inalterados e verdes** (104 testes da 1.1–1.4). `import-boundary` verde com `report.ts` no core.

- [x] **T6 — Critério implícito (não-negociável)**
  - [x] `node --test tests/*.test.ts` → 100% pass (115 prévios + 46 novos = 161), 0 fail.
  - [x] `npm run typecheck` (`tsc --noEmit`) limpo.
  - [x] AD-3 verde com `report.ts` no core (`toolkit/src/**` só `node:*` + relativos).
  - [x] E2E simulado ponta-a-ponta do condutor passando.

### Review Findings

_Code review em `570cd4c` (escopo 1-5), 3 camadas paralelas: Blind Hunter + Edge Case Hunter + Acceptance Auditor. **Acceptance Auditor: PASS** — AC1–AC6 + AD-1/AD-3/AD-4/AD-5 + critério implícito satisfeitos (161 testes verde, typecheck limpo). Achados abaixo são gaps de robustez, não violações de AC. Itens Defer detalhados em `deferred-work.md`._

**Patch (correção inequívoca):**
- [x] [Review][Patch] `readPayload` relança erros não-ENOENT crus (EISDIR/EACCES/ENOTDIR) em vez de pt-BR acionável [bin/process-ai.ts:248-256] — médio
- [x] [Review][Patch] `reportConfidence` lança em `checkpoint.json` corrompido/shape inválido (contradiz a robustez do report) [toolkit/src/report.ts:148,154 · checkpoint.ts:288-290] — médio
- [x] [Review][Patch] Skill §4 pede ao agente escrever `summary-report.json` com markdown embutido sem guia de escaping JSON (risco ao entregável AC6) [skills/process-ai/SKILL.md:114-116] — médio
- [x] [Review][Patch] `resume` rotulada "função pura" mas muta checkpoint + quarentena [checkpoint.ts:380 · bin/process-ai.ts:94] — baixo
- [x] [Review][Patch] `countOrphans` relança erros não-ENOENT em `quarantine/` [toolkit/src/report.ts:124-125] — baixo
- [x] [Review][Patch] BOM UTF-8 no payload vira "JSON malformado" (Node não descasca `﻿`) [bin/process-ai.ts:259] — baixo
- [x] [Review][Patch] Import duplicado de `node:fs` [bin/process-ai.ts:35-36] — nit

**Defer (real, baixa prioridade / fora de escopo — detalhes em `deferred-work.md`):**
- [x] [Review][Defer] `resume()` sem lock (corrupção só sob sessões concorrentes) [checkpoint.ts:392-459]
- [x] [Review][Defer] Sem cap de tamanho na leitura do payload → OOM multi-GB [bin/process-ai.ts:251]
- [x] [Review][Defer] Comandos read/gate/stage sem `resolveRoot` (cwd errado cria estado silencioso) [bin/process-ai.ts:299-345]
- [x] [Review][Defer] Sem validação canônica de gate IDs/stage (CLI pass-through; gating rico → 2.6) [bin/process-ai.ts:212-225]
- [x] [Review][Defer] Leitores do report sem leaf-symlink check (assimetria vs escritores) [toolkit/src/report.ts:88,122]
- [x] [Review][Defer] `aggregateLedger` sem dedupe na leitura (inflação só c/ ledger editado) [toolkit/src/report.ts:95-108]
- [x] [Review][Defer] `formatConfidenceReport` interpola `stage` sem escape markdown [toolkit/src/report.ts:187]
- [x] [Review][Defer] `process.stdout.write` em pipe fechado lança fora do path de erro [bin/process-ai.ts:368]
- [x] [Review][Defer] `process.cwd()` pode lançar ENOENT cru se cwd deletado [bin/process-ai.ts:363]
- [x] [Review][Defer] `dispatch` sem guard `assertNever` (variante futura → crash) [bin/process-ai.ts:288-348]
- [x] [Review][Defer] Valores whitespace-only passam no parser [bin/process-ai.ts:145,157]
- [x] [Review][Defer] Valores com traço único aceitos na forma espaço [bin/process-ai.ts:160]
- [x] [Review][Defer] Variation selector `️` descarta entrada do emoji da contagem [toolkit/src/report.ts:104]
- [x] [Review][Defer] `aggregateLedger` materializa ledger inteiro na memória (sem streaming) [toolkit/src/report.ts:95]
- [x] [Review][Defer] `report` lê sem lock → snapshot pontual inconsistente [toolkit/src/report.ts:146-149]

**Dismissed (2):** `readPayload` arbitrary-file-read (modelo trusted-agent; parte não-ENOENT já em Patch); `countOrphans` over-count `.json` (manifestos são `.json` por design; negligenciável).

## Dev Notes

### O que esta história É (e o que NÃO é) — leia antes de codar

Esta é a **story 1.5 de 6 do Epic 1** (Walking Skeleton). As stories 1.1–1.4 construíram a **fundação determinística** (porta/adapter, commit SHA-256, checkpoint atômico, confiança+ledger). A **1.5 é o primeiro *skill*** — a Déa, condutora — que **usa** essa fundação para conduzir o usuário. É também onde o **canal de propose runtime** (AD-3 capacidade #3, "expor o canal de propose") é finalmente exposto ao engine: até aqui ele só existia como método Node (`adapter.propose()`) exercitado em testes.

**Não construa aqui (scope creep — cada item pertence a outra story):**

| Pertence a 1.5 (esta) | Pertence a histórias futuras — NÃO faça |
|---|---|
| Skill condutora Déa (entry/Gate 0/pipeline+gates/resumo) | Skills dos **especialistas** (Bento/Miguel/Júlia/Zanoni) + seus rascunhos → **1.6** |
| CLI runtime `process-ai propose\|gate\|resume\|report` | Conteúdo real dos claims (especialistas proporem) → **1.6** |
| Gates básicos (registro da decisão no checkpoint) | Gates **ricos** (contagem+lista 🟡/🔴 bloqueando) → **2.6** |
| Relatório de confiança **mínimo** (contagens do ledger) | Relatório **consolidado** (rastreabilidade bidirecional, excerpt) → **2.5** |
| Resume (chama `resume` no entry da Déa) | UX de resume por engine + invocação de resume fora de `/process-ai` → *Deferred* |
| `report.ts` no core (agregação do ledger) | Method-packs, schema-núcleo, BPMN XML → **Epic 3 / 2.3** |

> **Fronteira 1.5 ↔ 1.6 (não-negociável):** a 1.5 constrói a **máquina de condução** completa — state machine de estágios, gates, resume, encerramento — mas os **especialistas que produzem artefatos reais** (SIPOC, hierarquia, BPMN, POP) são a **1.6**. Em 1.5, os 4 slots de especialista (Bento/Miguel/Júlia/Zanoni) são **pontos de handoff declarados** na pipeline: a Déa sabe a ordem e abre os gates, mas nenhuma skill de especialista existe ainda. Uma run **1.5-only** exerce o **loop do condutor** (Gate 0 → gates → resume → resumo/relatório) com **artefatos de especialista ausentes** — o relatório de confiança mostrará 0 claims (ledger vazio), o que é **esperado** e prova o mecanismo; a 1.6 popula os claims. **Não** crie skills/rascunhos fake de especialistas aqui.

> **Fronteira 1.5 ↔ 2.5/2.6:** "FR-5 mínimo" = resumo + contagens. O relatório **consolidado navegável** (2.5) e os gates **ricos** com bloqueio por 🟡/🔴 (2.6) são profundidades de Epic 2. A 1.5 prova a **estrutura**; a Epic 2 a **preenche**.

### O uso de IA generativa e a responsabilidade do dev

A Déa é uma skill markdown — **instruções que um LLM segue**, não código determinístico. O determinístico (commit, checkpoint, confiança, gates) mora no **toolkit**. A skill orquestra **chamando o CLI** (`process-ai ...`); o agente **nunca** escreve nas pastas protegidas diretamente. Se um comportamento for necessário para o condutor funcionar ponta-a-ponta, **é requisito desta story** tenha ou não AC literal (mesmo princípio das stories anteriores).

### Paradigma e invariantes binding (não quebre)

- **AD-3 — Núcleo hexagonal (o coração desta história):** o CLI runtime depende **só da porta** `EngineAdapter`; a composition root (`bin/process-ai.ts`) é o único ponto (além do `bootstrap.ts`) que instancia `ClaudeCodeAdapter`. `report.ts` no core importa só `node:*` + relativos. O adapter segue **pass-through**. [Source: ARCHITECTURE-SPINE.md#AD-3]
- **AD-1 — Propose/Commit:** toda escrita de artefato passa por `adapter.propose()` → `commit()`; gates/estágios passam por `checkpointAdvance()`. A skill e o CLI **não tocam** `_process-ai_output/`/`.process-ai/` diretamente. [Source: ARCHITECTURE-SPINE.md#AD-1]
- **AD-4 — Checkpoint autoritativo:** gates e estágios são estado de sessão → vivem no checkpoint; `resume` é função pura do checkpoint; órfãos em quarentena. O CLI `gate`/`stage` usa `checkpointAdvance` (atômico, WAL). [Source: ARCHITECTURE-SPINE.md#AD-4]
- **AD-5 — Confiança verificável:** o relatório de confiança (T4) **lê** o ledger (evidência); não reatribui níveis. [Source: ARCHITECTURE-SPINE.md#AD-5]
- **FR-1..5 — Condução:** iniciar, Gate 0, orquestrar, gates, encerrar com resumo+relatório. [Source: SPEC.md#CAP-1, prd.md §4.1, epics.md#Story 1.5]
- **FR-19 — Resume:** retomar sem perda/duplicação. [Source: SPEC.md#CAP-8]
- **NFR-1 — Honestidade:** o relatório reflete o ledger honestamente; zeros quando vazio (não inflar). [Source: prd.md §5/NFR-1, SM-C1]

### O código que esta história MODIFICA/CRIA — leia antes de tocar

_(Não-negociável: ler o estado atual antes de mudar. Fontes: `skills/process-ai/SKILL.md`, `bin/bootstrap.ts`, `toolkit/adapters/claude-code/adapter.ts`, `toolkit/src/{commit,checkpoint,confidence,engine-adapter}.ts`, testes da 1.1–1.4.)_

**`skills/process-ai/SKILL.md` (MODIFY — substitui o stub 1.1):**
- **Estado atual:** stub de 1.1 — só a pergunta inicial + nota "versão completa chega na 1.5". Frontmatter `name: process-ai` + `description`.
- **O que muda:** corpo completo do condutor (T2). **Preservar:** frontmatter `name: process-ai` (é o que faz `/process-ai` existir — o adapter copia este arquivo byte-a-byte para `<alvo>/.claude/skills/process-ai/SKILL.md`).
- **Atenção:** o `ClaudeCodeAdapter.installSkills` lê este arquivo e o grava no alvo — mudar o conteúdo aqui **é** mudar a skill instalada (fonte única de verdade).

**`bin/process-ai.ts` (NEW — dispatcher runtime):**
- O novo entrypoint. Espelha a disciplina do `bootstrap.ts` (composition root tipada como `EngineAdapter`, entry-guard por `realpath`, erros em pt-BR), mas roteia subcomandos ao adapter/toolkit em vez de instalar.
- **`package.json` `bin`:** hoje `"process-ai": "bin/bootstrap.ts"`. Decisão (registre na Completion Notes): mapear `"process-ai": "bin/process-ai.ts"` (runtime — o que o agente chama na sessão) **e** manter o bootstrap alcançável (ex.: `"process-ai-bootstrap": "bin/bootstrap.ts"` **ou** `bootstrap` como subcomando). **Constraint:** os testes `tests/bootstrap.test.ts` (1.1) invocam `bin/bootstrap.ts` como subprocesso — **devem continuar verdes**; não quebre `npm run dev` sem registrar a mudança.

**`toolkit/src/report.ts` (NEW — agregação do ledger):**
- `reportConfidence(root)` lê `.process-ai/confidence-ledger.jsonl` + `checkpointRead(root)` → `ConfidenceReport`. AD-3: só `node:*` + `./checkpoint.ts`/`./confidence.ts`.
- Mínimo: `{ counts: { '🟢': n, '🟡': n, '🔴': n }, artifacts: [...], generatedAt }`.

**`toolkit/adapters/claude-code/adapter.ts` (NO CHANGE esperada):**
- `propose()` já delega a `commit()`; `installSkills` já copia a skill-fonte. A 1.5 **não** deve mudar o adapter (AD-3 pass-through preservado). Se achar que precisa, **pare** — provavelmente é scope creep.

**`bin/bootstrap.ts` / `toolkit/src/{commit,checkpoint,confidence,engine-adapter}.ts` (NO CHANGE):**
- A 1.5 **consome** essas APIs, não as reescreve. Assinaturas relevantes (já estáveis):
  - `commit(payload, { root, agent }): Promise<CommitResult>` — `commit.ts:405`.
  - `ProposePayload { artifactType: string; content: unknown; claims?: Claim[] }`, `CommitResult { sha256, artifactPath, manifestPath }` — `engine-adapter.ts:27,45`.
  - `checkpointRead(root): Promise<CheckpointState>`, `checkpointAdvance(root, state, intent, apply): Promise<CheckpointState>`, `resume(root): Promise<ResumeResult>` — `checkpoint.ts:283,315,392`.
  - `WalIntent` `{kind:'gate',payload:{gateId,decision}}` | `{kind:'stage-advance',payload:{from,to}}` | `{kind:'commit',...}` — `checkpoint.ts:26`.
  - `Claim { statement, level: '🟢'|'🟡'|'🔴', source?, reasoning }` — `confidence.ts:48`.

**Layout resultante (delta em negrito):**
```text
skills/process-ai/SKILL.md        # MODIFY: stub 1.1 → condutor completo (T2)
bin/process-ai.ts                 # NEW: dispatcher runtime propose|gate|resume|report (T1)
toolkit/src/report.ts             # NEW: reportConfidence — agregação mínima do ledger (T4)
tests/cli.test.ts                 # NEW: dispatcher
tests/skill.test.ts               # NEW: conteúdo da skill instalada (ou extensão de adapter.test.ts)
tests/report.test.ts              # NEW: reportConfidence
tests/e2e-conductor.test.ts       # NEW: loop do condutor ponta-a-ponta (critério implícito)
# package.json: bin remapeado (bootstrap preservado, testes 1.1 verdes)
# No root da sessão (gerado pelo toolkit — sem mudança de layout):
.process-ai/checkpoint.json       # agora registra gates gate-0..gate-4 + estágios
_process-ai_output/summary-report-<sha>.md  # entregável do encerramento (AC6)
```

## Decisões de implementação (registre as escolhas na Completion Notes)

1. **Canal propose = CLI runtime dispatcher.** A skill é markdown; o agente só age via Bash no Claude Code. Logo, "expor o canal de propose" (AD-3) = um CLI que a agente invoca. Dispatcher (não MCP/slash por operação) alinha-se ao ethos "toolkit Node determinístico, zero deps" e é portável entre engines (qualquer engine com shell). O adapter continua sendo o único que conhece o engine; o CLI depende da porta. [Source: ARCHITECTURE-SPINE.md#AD-3 capacidade #3]

2. **Payload por arquivo (`--payload <path.json>`), não inline.** JSON/markdown grande na linha de comando quebra (escaping, limite do shell, Windows). O agente escreve o `ProposePayload` num arquivo temporário e passa o path; o CLI lê, valida e repassa. Isso mantém o CLI como pass-through puro ao adapter.

3. **`gate`/`stage` via `checkpointAdvance` com `apply` no-op.** Gates e avanço de estágio são **estado puro** (sem artefato) — o `apply` (que em `commit()` escreve artefato/manifesto) aqui é `async () => {}`. A atomicidade WAL e o single-writer são preservados. Nenhuma escrita fora do `checkpointAdvance`.

4. **Relatório de confiança no core (`report.ts`), não na skill.** O spine mapeia FR-5/FR-16 ao toolkit ("do ledger"). A agregação é **determinística** → mora no core (AD-3, testável); a narrativa do resumo é da Déa. Versão mínima em 1.5 (contagens); a consolidada é 2.5.

5. **Run 1.5-only = ledger vazio = relatório com zeros.** Esperado e honesto (NFR-1/SM-C1): não inflar. Prova o mecanismo; a 1.6 popula os claims.

6. **Stage/gate IDs canônicos:** estágios `scope`→`discovery`→`mapping`→`modeling`→`standardization`→`summary`; gates `gate-0`..`gate-4`. Estáveis (não renumerar) — o resume depende deles.

7. **`bootstrap.ts` intocado; `bin` remapeado com cuidado.** O bootstrap é o comando de *install* (1.1, testado). O dispatcher é o canal de *runtime*. Mapear `process-ai → bin/process-ai.ts` e manter o bootstrap alcançável **sem quebrar** `tests/bootstrap.test.ts` nem `npm run dev`.

## Padrões de teste estabelecidos (espelhar — não reinventar)

Herdados da 1.1–1.4:
- `node:test` + `node:assert/strict`; tmpdir via `fs.mkdtemp(os.tmpdir())`; `finally { fs.rm(...) }`.
- Snapshot recursivo para escopo (padrão `listFiles` da `commit.test.ts`).
- Entry-guard por `realpath` (1.1 R2); erros em pt-BR acionáveis.
- Import-boundary AD-3 varre `toolkit/src/**` — cobre `report.ts` automaticamente.
- Para o E2E: injetar `cwd=tmpdir` no adapter; conduzir via dispatcher; asserir artefato + checkpoint + resume-sem-duplicação.

## Convenções (do spine, herdadas da 1.1–1.4)

- Naming `kebab-case`; IDs globais estáveis (FR-n, AD-n) — nunca renumerados.
- Node 24 LTS (v24.18.1); TS + ESM; imports `.ts` com extensão explícita (type-stripping nativo).
- Sem deps de runtime no core (AD-3 allowlist: só `node:` + relativos).
- Erros acionáveis em pt-BR.
- Pastas protegidas: escrita só em `_process-ai_output/` + `.process-ai/` (via toolkit).

## Project Structure Notes

- **Incremental sobre a fundação 1.1–1.4:** nenhuma camada determinística é reescrita. A 1.5 **acrescenta** o condutor (skill) + o canal runtime (CLI) + a agregação de relatório (core). Cada peça consome APIs estáveis do toolkit.
- **Alvo ≠ framework:** o CLI runtime opera no `cwd` (projeto-alvo), herdando o comportamento da 1.2/1.4. Testes injetam tmpdir.
- **`.gitignore` da 1.1 já cobre** `_process-ai_output/` e `.process-ai/`.
- **Baseline:** HEAD `8166135`; alterações da 1.4 (`confidence.ts`, `commit.ts`, `engine-adapter.ts`, `tests/confidence.test.ts`, `tests/adapter.test.ts`) estão **em árvore (story 1.4 em review)** — a 1.5 builda sobre esse estado; confirmar que a 1.4 foi integrada (ou considerar a 1.5 bloqueada até 1.4 `done`) antes de codar.

## References

- [Source: SPEC.md#CAP-1] — condução guiada (Déa): `/process-ai` → escopo → gates → resumo final (FR-1…5)
- [Source: SPEC.md#CAP-8] — sessão resiliente: resume sem perda/duplicação (FR-19)
- [Source: ARCHITECTURE-SPINE.md#AD-3] — núcleo hexagonal; "expor o canal de propose em modo pass-through" (= CLI runtime nesta story)
- [Source: ARCHITECTURE-SPINE.md#AD-1] — propose/commit, toolkit único escritor, skill sem escrita direta
- [Source: ARCHITECTURE-SPINE.md#AD-4] — checkpoint autoritativo; gates/estágios no checkpoint; resume função pura; órfãos em quarentena
- [Source: ARCHITECTURE-SPINE.md#AD-5] — confiança do ledger (relatório lê evidência)
- [Source: ARCHITECTURE-SPINE.md#Capability → Architecture Map] — FR-1/2/3/4/5 → skill condutor + toolkit
- [Source: prd.md §4.1/FR-1..5] — condução guiada (Déa)
- [Source: prd.md §5/NFR-1] — honestidade (relatório honesto; zeros quando vazio)
- [Source: glossary.md "Gate" · "Resumo de encerramento" · "Relatório de confiança" · "Checkpoint/Resume"] — vocabulário canônico
- [Source: epics.md#Story 1.5] — ACs originais (FR-1,2,3,4 básico,5 mínimo)
- [Source: 1-4-toolkit-confianca-mecanica-ledger.md] — `Claim`, ledger, `validateClaims`; fronteira "relatório consolidado → 2.5"
- [Source: 1-3-toolkit-checkpoint-resume-atomico.md] — `checkpointAdvance`, `resume`, `WalIntent` (gate/stage-advance/commit), quarentena
- [Source: 1-2-toolkit-propose-commit-sha256.md] — `commit()`, `ProposePayload`, `CommitResult`, padrões de teste
- [Source: 1-1-scaffold-engineadapter-claudecodeadapter.md] — scaffold, porta `EngineAdapter`, `ClaudeCodeAdapter.installSkills` (copia `skills/process-ai/SKILL.md`), `bootstrap.ts` composition root, AD-3 guardrail
- [External: https://code.claude.com/docs/en/skills.md] — skill `name` = slash-invocável; skill-fonte copiada para `<alvo>/.claude/skills/`

## Dev Agent Record

### Agent Model Used

glm-5.2[1m] (skill `bmad-dev-story`)

### Debug Log References

- Baseline confirmada antes de codar: `node --test tests/*.test.ts` → 104 pass / 0 fail (fundação 1.1–1.4, com as mudanças da 1.4 em árvore). typecheck limpo.

### Completion Notes List

- **Ordem de implementação (decisão):** implementei **T4 (`report.ts`) antes de T1 (CLI)** porque o subcomando `report` do dispatcher chama `reportConfidence` — T4 é folha sem dependências e T1 depende dele. Manter o código sempre compilável/verde tem precedência sobre a ordem literal dos checkboxes; todas as tasks T1–T6 são cobertas. As caixas são marcadas conforme cada uma é efetivamente concluída.
- **T4 — `toolkit/src/report.ts`:** novo módulo do core. `reportConfidence(root)` agrega o ledger (`confidence-ledger.jsonl`) por nível **VALIDADO** (AD-5: lê evidência, não reatribui) + lista de artefatos do checkpoint (`checkpointRead`) + contagem de órfãos em `quarantine/`. `formatConfidenceReport(report)` renderiza markdown pt-BR com nota de gaps (🔴) e orphans. Robusto a ledger ausente/vazio/corrompido (run 1.5-only → zeros honestos, NFR-1). AD-3 respeitado: só `node:*` + `./checkpoint.ts` + type-only `./confidence.ts` (guardrail `import-boundary` verde). 11 testes novos em `tests/report.test.ts` (100% verdes).
- **T3 — confirmado sem mudança no toolkit:** `checkpoint.ts` já suporta intents `gate` e `stage-advance` (`WalIntent` em `checkpoint.ts:26-29`, `applyIntent` 360-372), exercitados pelos testes `checkpoint.test.ts` ("gate registra decisão", "stage-advance atualiza o estágio"). O CLI (T1) usa `checkpointAdvance` com `apply` no-op + `acquireLock`/`releaseLock` (single-writer WAL preservado). Nenhuma mudança no toolkit.
- **T1 — `bin/process-ai.ts`:** dispatcher runtime. Subcomandos `propose` (payload por arquivo → `adapter.propose` → `CommitResult` JSON), `gate` (`checkpointAdvance` gate intent, apply no-op, lock WAL), `stage` (stage-advance), `resume` (`resume(root)`), `report` (`reportConfidence`+`formatConfidenceReport` markdown), `status` (`checkpointRead`). Composition root tipada como `EngineAdapter` (`new ClaudeCodeAdapter({ cwd: root })`); entry-guard por `realpath` (1.1 R2). `parseArgs` puro (sem IO) + `dispatch(cmd, adapter, root)` testável (adapter injetável) + `main(argv, opts)` (composition root + impressão). Nenhuma escrita direta fora do toolkit. 25 testes em `tests/cli.test.ts` (100% verdes), incluindo smoke tests de subprocesso (`--help`, `status`, `gate`).
- **Decisão bin remap (#7):** `"process-ai" → "bin/process-ai.ts"` (runtime, o que o agente invoca na sessão) e `"process-ai-bootstrap" → "bin/bootstrap.ts"` (install, preservado alcançável). `scripts.dev` mantido (`node bin/bootstrap.ts`) — preserved, registrado. `tests/bootstrap.test.ts` (1.1) invoca `bin/bootstrap.ts` via `spawnSync` direto e importa `parseArgs`/`hasHelpFlag`, portanto permanece verde; `tests/scaffold.test.ts` só faz truthy-check em `pkg.bin['process-ai']` (ainda truthy).
- **Stage/gate IDs:** o dispatcher NÃO impõe lista fechada de estágios (apenas exige `--to` não-vazio) — o CLI é canal pass-through fino; a SKILL.md (T2) instrui a ordem canônica (`scope→discovery→mapping→modeling→standardization→summary`, gates `gate-0..gate-4`). Manter o CLI permissive evita over-engineering e mantém o adapter/toolkit como única fonte de verdade do estado.
- **T2 — `skills/process-ai/SKILL.md`:** stub 1.1 substituído pelo condutor completo (Como opera → Início/resume → Escopo/Gate 0 → Pipeline+gates → Encerramento → Tom da Déa). Frontmatter `name: process-ai` + `description` preservados (não-regressão 1.1). Toda escrita instruída via CLI `process-ai`; AD-1 declarado estruturalmente ("sem escrita direta"). 8 testes em `tests/skill.test.ts` validam conteúdo + cópia byte-a-byte via `installSkills`.
- **T5/T6 — testes + critério implícito:** `tests/{cli,report,skill,e2e-conductor}.test.ts` = 46 testes novos (25+11+8+2), todos verdes. Suite completa: **161 pass / 0 fail** (`node --test tests/*.test.ts`); `npm run typecheck` (`tsc --noEmit`) limpo; AD-3 verde com `report.ts` no core. **E2E real via subprocesso** (`node bin/process-ai.ts`) executado num tmpdir: resume(vazio) → Gate 0 → pipeline gate-1..4 + discovery/mapping/modeling/standardization → summary → `report` (zeros honestos, ledger vazio) → `propose summary-report.json` → artefato commitado em `_process-ai_output/summary-report/` → `status` reflete stage `summary` + 1 artefato. *(Nota sobre a contagem: a story citava "104 testes da 1.1–1.4"; o número real hoje é 115 — a 1.4, em review quando a story foi redigida, foi concluída e `tests/confidence.test.ts` cresceu para 32. Nenhum arquivo de regressão foi modificado por esta story — `git status` confirma.)*
- **Fronteiras respeitadas:** skills/rascunhos de especialistas (Bento/Miguel/Júlia/Zanoni) → 1.6 (slots declarados apenas). Gates ricos (bloqueio 🟡/🔴) → 2.6. Relatório consolidado navegável → 2.5. Method-packs/schema-núcleo → Epic 3. Nenhum scope creep.

### File List

- `toolkit/src/report.ts` — **NEW** (T4): `reportConfidence` + `formatConfidenceReport` + `ConfidenceReport`/`ReportError`.
- `bin/process-ai.ts` — **NEW** (T1): dispatcher runtime `propose|gate|stage|resume|report|status`; composition root na porta `EngineAdapter`; entry-guard por `realpath`.
- `tests/report.test.ts` — **NEW** (T4): 11 testes do relatório de confiança.
- `tests/cli.test.ts` — **NEW** (T1): 25 testes (parseArgs puro + dispatch integration com cwd=tmpdir + 3 smoke tests de subprocesso).
- `skills/process-ai/SKILL.md` — **MODIFIED** (T2): stub 1.1 substituído pelo condutor completo (abertura, entry/resume, Gate 0, pipeline+gates, encerramento, tom da Déa). Frontmatter `name: process-ai` + `description` preservado.
- `tests/skill.test.ts` — **NEW** (T2): 8 testes (conteúdo do condutor + frontmatter + cópia byte-a-byte via installSkills).
- `tests/e2e-conductor.test.ts` — **NEW** (T5, critério implícito): 2 testes E2E do loop do condutor ponta-a-ponta (via `dispatch`/`parseArgs`, adapter real com cwd=tmpdir) + retomada no meio da pipeline.
- `package.json` — **MODIFIED** (T1, decisão #7): `bin.process-ai` → `bin/process-ai.ts` (runtime); adicionado `bin.process-ai-bootstrap` → `bin/bootstrap.ts` (install, preservado); adicionado script `conductor`. `dev` mantido (`node bin/bootstrap.ts`); `tests/bootstrap.test.ts` e `tests/scaffold.test.ts` permanecem verdes (o primeiro invoca `bin/bootstrap.ts` via `spawnSync` direto; o segundo só faz truthy-check em `bin.process-ai`).

## Change Log

- **2026-08-01** — Story 1.5 criada: skill condutora Déa (`/process-ai` · Gate 0 · orquestra Bento→Miguel→Júlia→Zanoni · gates básicos · resume · resumo+relatório de confiança mínimo). **Dois entregáveis habilitantes:** (1) CLI runtime `bin/process-ai.ts` (`propose|gate|resume|report`) — o canal de propose do AD-3 finalmente exposto ao engine, composition root na porta `EngineAdapter`; (2) `toolkit/src/report.ts` — agregação mínima do ledger de confiança (consolidado completo → 2.5). Especialistas (Bento/Miguel/Júlia/Zanoni + rascunhos) são **slots declarados** preenchidos na **1.6**. Builda sobre a fundação 1.1–1.4 sem reescrevê-la; zero regressões esperadas (104 testes + novos).
- **2026-08-01** — Story 1.5 implementada (status → review). Entregues: `toolkit/src/report.ts` (T4, `reportConfidence`+`formatConfidenceReport`), `bin/process-ai.ts` (T1, dispatcher runtime `propose|gate|stage|resume|report|status`), `skills/process-ai/SKILL.md` (T2, condutor completo substituindo o stub 1.1), `package.json` (T1, bin remapeado com bootstrap preservado), e 4 arquivos de teste (T5: `cli`/`report`/`skill`/`e2e-conductor` = 46 testes). T3 confirmado sem mudança no toolkit. **Suite: 161 pass / 0 fail** (115 regressão 1.1–1.4 inalterados + 46 novos); `tsc --noEmit` limpo; AD-3 verde com `report.ts` no core; E2E real via subprocesso ponta-a-ponta passando. Zero arquivos de regressão modificados por esta story.
