---
baseline_commit: 181eaff
---

# Story 2.6: Gates completos + resumo final rico (Déa)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **leigo**,
I want **gates informativos que mostram contagem+lista de 🟡/🔴 antes de cada handoff (bloqueando o próximo especialista até eu aprovar) + um resumo final da Déa que cita o que foi documentado, a contagem 🟢/🟡/🔴 por etapa e os próximos passos concretos**,
so that **eu valide cada etapa com visibilidade total do que é sólido vs. inferido vs. gap — e saia da sessão com um encerramento acionável, não só um dump de arquivos (FR-4 full, FR-5 full)**.

## Acceptance Criteria

1. **[AC1] Gate informativo com contagem+lista de 🟡/🔴 (FR-4 full)** — **Given** um especialista concluiu e commitou seus artefatos (com claims), **When** a Déa vai abrir o gate (antes de `process-ai gate --decision approved`), **Then** ela **primeiro** executa `process-ai report` (via Bash), extrai do markdown a **contagem e a lista de itens 🟡 e 🔴** (breakdown por artifactType + itemsByLevel), e **apresenta ao usuário** em linguagem simples:
   - *"Antes de prosseguir para o [próximo especialista], aqui está o que temos:"*
   - Lista os 🟢 (confirmados) com 1-liner de cada
   - Destaca 🟡 (inferidos — "atenção") com a fundamentação
   - Destaca 🔴 (gaps — "precisam de decisão") com o statement
   - Pergunta: *"Podemos prosseguir ou quer ajustar algo?"*
   - **Bloqueia** o próximo especialista até o usuário aprovar (`--decision approved`).
   - Se `changes-requested`: volta ao especialista atual para ajustar.
   - Se `rejected`: encerra o fluxo (não avança estágio).
   - O relatório de confiança (2.5) já fornece **todos os dados** (itemsByLevel, breakdown, excerpt-status); a Déa só **lê e formata** para o usuário — **zero mudança no toolkit**.

2. **[AC2] Resumo final rico e acionável (FR-5 full)** — **Given** a pipeline concluída (Gate 4 aprovado), **When** a Déa gera o encerramento, **Then** o resumo final (entregue como artifactType `summary-report`) contém:
   - **Cabeçalho narrativo:** o que foi mapeado (escopo confirmado no Gate 0), quais especialistas rodaram e o que cada um produziu (artefatos + artifactTypes).
   - **Relatório de confiança consolidado** (embutido verbatim do `process-ai report` — contrato duro preservado desde 1.5; o relatório de 2.5 já é rico com breakdown + items + reverse-index + excerpt-status + órfãos).
   - **Próximos passos acionáveis:** a Déa lê os 🔴 do relatório e sugere **ações concretas** para resolvê-los (ex.: *"Validar o SLA de entrega com o time de logística"* para um gap 🔴 sobre prazo). Se não houver 🔴, sugere *"Validar o modelo com um segundo par de olhos (spot-check de especialista)"*.
   - **Resumo narrativo por etapa:** 1 parágrafo por estágio (`discovery` → `mapping` → `modeling` → `standardization`) citando o que foi produzido e quantos 🟢/🟡/🔴.
   - O fluxo de encerramento existente (§4 do SKILL.md) é **preservado e enriquecido** — o `process-ai report` continua sendo o payload; o delta é a **narrativa** que a Déa escreve **ao redor** dele.
   > **Fronteira (anti-colisão com 2.5):** 2.5 produziu o **payload do relatório** (dados); 2.6 produz a **apresentação narrativa** (skill layer). A Déa lê o report, não o reconstrói. O `summary-report` commitado já contém ambos (narrativa + report embutido).

3. **[AC3] Contrato markdown + CLI preservados (AD-1, backward-compat)** — **Given** o fluxo de encerramento existente, **When** a Déa executa o novo encerramento, **Then**:
   - `process-ai report` continua sendo executado **exatamente como antes** (arg-less, exit 0, markdown pt-BR).
   - O `summary-report` é commitado via `process-ai propose --payload summary-report.json` (mesmo fluxo, mesmo artifactType).
   - O `stage --to summary` ocorre **após** o commit (ordem preservada).
   - A seção `## Relatório de Confiança` dentro do `summary-report` é o markdown **verbatim** do `process-ai report` (contrato duro — a Déa não reescreve, só embute).
   - Nenhum novo comando CLI, nenhum novo artifactType, nenhuma mudança em `bin/process-ai.ts`, `toolkit/src/**`, ou `tests/`.

4. **[AC4] Gates bloqueantes — enforcement (FR-4 full)** — **Given** o gate N aberto, **When** o usuário ainda não aprovou, **Then**:
   - A Déa **não avança** o estágio (`process-ai stage --to <next>`) nem inicia o próximo especialista.
   - A decisão do gate é **persistida** no checkpoint (comportamento existente do `process-ai gate`).
   - O resume **(1.3/1.5)** restaura o estado do gate corretamente (gates são intents no WAL — AD-4; comportamento existente, zero mudança).
   - Se o usuário pedir `changes-requested`, a Déa **reabre o especialista atual** (não avança) para ajustar o artefato; após o re-commit, o gate é reaberto.
   > **Nota:** o comportamento de "bloqueio" é **skill-layer** (a Déa decide não prosseguir), não um lock no toolkit. O checkpoint registra decisões de gate (existente); a novidade em 2.6 é que a Déa **age** sobre elas de forma mais rigorosa.

5. **[AC5] Tom e honestidade (NFR-1, pt-BR)** — **Given** qualquer interação de gate ou encerramento, **Then**:
   - A Déa **nunca esconde** 🟡/🔴 — ela os destaca proativamente.
   - A Déa **nunca infla** 🟢 — se não há claims, diz "zero afirmações verificadas" (zero honesto).
   - Toda comunicação é em **pt-BR**, em tom de **condutora** (explica antes de executar, evita jargão).
   - O resumo final sugere próximos passos **concretos e acionáveis** (não genéricos como "revise o processo").

> **Critério implícito (não-negociável):** a história deixa o sistema "rodável ponta-a-ponta" — `node --test tests/*.test.ts` 100% verde (**todos os 201 testes herdados da 1.1–2.5, zero regressões**), `npm run typecheck` (`tsc --noEmit`) limpo, e o guardrail **AD-3** (`tests/import-boundary.test.ts`) verde. O E2E (`tests/e2e-conductor.test.ts`) continua passando (o fluxo de encerramento markdown é preservado). O teste `tests/skill.test.ts` (que valida o shape do SKILL.md) continua passando. **Nenhum arquivo em `toolkit/src/` ou `bin/` é modificado** (skill-layer only). Não basta "satisfazer os ACs literais".

## Tasks / Subtasks

- [x] **T1 — Gates ricos na Déa: `skills/process-ai/SKILL.md` §3 (AC: #1, #4, #5)**
  - [x] **UPDATE §3 "Pipeline — especialistas + gates" (bloco de handoff, `:98-120`):** reescrever o passo-a-passo de cada especialista para incluir o **gate informativo** ANTES do `process-ai gate --decision`:
    1. Especialista conclui e commita artefatos → captura os `sha256`.
    2. **Antes de abrir o gate:** executar `process-ai report` (via Bash), capturar a saída markdown.
    3. **Parsear o relatório** (a Déa lê o markdown — o relatório 2.5 já tem seções `### 🟡 Confiança Média` e `### 🔴 Gaps Declarados` com `claimId`, `statement`, `reasoning`, `degradationReason`, `excerptStatus`).
    4. **Apresentar ao usuário** em linguagem simples:
       - *"O [especialista] concluiu. Antes de prosseguir:"*
       - Listar 🟢 com 1-liner (ex.: *"✅ Fornecedores confirmados na entrevista"*)
       - Listar 🟡 com ressalva (ex.: *"⚠️ Cliente típico é PME — inferido do contexto, sem fonte direta"*)
       - Listar 🔴 com ação sugerida (ex.: *"🔴 Não sabemos o SLA da entrega — precisamos perguntar ao time"*)
    5. **Perguntar:** *"Podemos prosseguir para [próximo], quer ajustar algo, ou prefere parar?"*
    6. **Registrar decisão:** `process-ai gate --id gate-<N> --decision <approved|changes-requested|rejected>`.
    7. Se `approved`: avançar estágio + handoff ao próximo especialista.
    8. Se `changes-requested`: **reabrir o especialista atual** para ajustar o artefato; após re-commit, repetir o gate.
    9. Se `rejected`: encerrar o fluxo (não avançar estágio, informar o usuário).
  - [x] **Preservar:** a ordem canônica dos especialistas (Bento→Miguel→Júlia→Zanoni), o fluxo de `sha256` entre handoffs, a tabela de artifactTypes, e o invariante AD-1 (Déa nunca escreve direto — sempre usa CLI).
  - [x] **Tom e honestidade (AC5):** nunca esconder 🟡/🔴; destacar proativamente; pt-BR; tom de condutora.

- [x] **T2 — Resumo final rico: `skills/process-ai/SKILL.md` §4 (AC: #2, #3, #5)**
  - [x] **UPDATE §4 "Encerramento — resumo + relatório de confiança" (`:124-141`):** enriquecer o fluxo de encerramento:
    1. Executar `process-ai report` (via Bash) — capturar markdown (já feito, preservar).
    2. Executar `process-ai status` (via Bash) — capturar JSON com `artifacts[]` e `stage` para referência.
    3. **Redigir o resumo narrativo** (a Déa escreve, em markdown pt-BR) com:
       - **Cabeçalho:** *"Processo mapeado: [escopo do Gate 0]. Documentação gerada em [data] pelo process-ai."*
       - **Por etapa (1 parágrafo cada):** o que foi produzido, quantos 🟢/🟡/🔴, principal fonte.
         - *"**Descoberta (Bento):** entrevista registrada + SIPOC com X fornecedores + cadeia de valor com Y elos. Z afirmações (A 🟢, B 🟡, C 🔴)."*
         - *"**Mapeamento (Miguel):** hierarquia Macro→Tarefa com N níveis. …"*
         - *"**Modelagem (Júlia):** fluxo BPMN 2.0 XML com M elementos. Gargalos identificados: …"*
         - *"**Padronização (Zanoni):** K POPs + relatório de diagnóstico. …"*
       - **Próximos passos acionáveis:** ler os 🔴 do relatório e sugerir ações concretas. Se zero 🔴: sugerir validação cruzada (spot-check de especialista). Nunca genérico ("revise o processo") — sempre específico ("Validar o SLA de entrega com o time de logística").
    4. **Embutir o relatório de confiança:** incluir a saída verbatim de `process-ai report` sob o título `## Relatório de Confiança` (contrato duro — preservado).
    5. **Commitar como `summary-report`:** mesmo fluxo existente (Write tool → JSON → `process-ai propose --payload summary-report.json` → remover temp).
    6. **Finalizar:** `process-ai stage --to summary`.
  - [x] **Preservar:** o contrato markdown (report verbatim), o fluxo propose→commit, a remoção do JSON temporário, e o avanço de estágio.

- [x] **T3 — Testes (AC: #1–#5 + regressão)**
  - [x] **`tests/skill.test.ts` (UPDATE/MODIFY — AC1/AC2):** O teste existente valida que `skills/process-ai/SKILL.md` existe e tem seções esperadas. Estender para verificar:
    - Que §3 menciona `process-ai report` antes de `process-ai gate` (gate informativo).
    - Que §3 menciona os 3 caminhos de decisão (`approved` → avançar, `changes-requested` → reabrir especialista, `rejected` → encerrar).
    - Que §4 menciona resumo narrativo por etapa + próximos passos acionáveis.
    - Que §4 ainda referencia `process-ai report` e `summary-report` (contrato preservado).
    - **Zero dependência de execução de agente** (teste de shape/lint do markdown, não de comportamento LLM).
  - [x] **`tests/e2e-conductor.test.ts` (REVIEW — não modificar):** Confirmar que o E2E existente **continua passando** (o fluxo de encerramento markdown é preservado; o teste usa `dispatch` direto, sem LLM — a skill layer não é exercitada).
  - [x] **Regressão total:** `node --test tests/*.test.ts` → **201/201 passando** (zero novos testes de unidade no toolkit — esta story não mexe no core). `npm run typecheck` limpo. AD-3 verde.

- [x] **T4 — Critério implícito (não-negociável)**
  - [x] `node --test tests/*.test.ts` → 100% pass (201 testes herdados), 0 fail.
  - [x] `npm run typecheck` (`tsc --noEmit`) limpo.
  - [x] AD-3 verde (`tests/import-boundary.test.ts`).
  - [x] `tests/skill.test.ts` verde (novas asserções de shape).
  - [x] `tests/e2e-conductor.test.ts` verde (fluxo markdown preservado).
  - [x] **Nenhum arquivo em `toolkit/src/` ou `bin/` modificado** (skill-layer only).

## Dev Notes

### O que esta história É (e o que NÃO é) — leia antes de codar

Esta é a **story 2.6 — primeira story puramente skill-layer** (todas as 1.1–2.5 tocaram `toolkit/src/**` e/ou `bin/`). O toolkit e o CLI **não mudam** — o relatório de confiança consolidado (2.5) já fornece **todos os dados** que a Déa precisa. Esta história ensina a Déa a **usar** esses dados para conduzir gates informativos e produzir um encerramento narrativo rico.

**O que já existe e esta história USA (não reconstrói):**
- `process-ai report` → markdown rico com `itemsByLevel['🟡']` e `itemsByLevel['🔴']` (claimId, statement, reasoning, degradationReason, excerptStatus) + `breakdown[]` + `reverseIndex` — **tudo desde 2.5**.
- `process-ai gate --id X --decision Y` → persiste decisão no checkpoint (desde 1.5).
- `process-ai stage --to X` → avança estágio (desde 1.5).
- `process-ai status` → JSON com `artifacts[]` e `stage` (desde 1.3).
- `process-ai propose --payload X.json` → commit determinístico (desde 1.2).

### Escopo — tabela anti-scope-creep

| Pertence a esta story (2.6) | Pertence a histórias futuras — NÃO faça |
|---|---|
| Déa lê `process-ai report` e **apresenta** 🟡/🔴 ao usuário | **Novo comando CLI** `process-ai gate --show` ou similar — zero mudanças no bin |
| Déa **bloqueia** próximo especialista até gate approved (skill-layer) | **Lock no toolkit** para bloqueio de gate — o checkpoint já registra; o enforcement é a Déa |
| Déa escreve **resumo narrativo** por etapa + próximos passos | **Geração automática** de resumo pelo toolkit — a narrativa é skill-layer |
| Déa sugere próximos passos **concretos** lendo os 🔴 do relatório | **Schema-núcleo** para `summary-report` (→ Epic 3) ou `gate` artifactType |
| Teste de shape/lint do SKILL.md (`tests/skill.test.ts`) | **Teste de comportamento LLM** (fora do escopo de teste determinístico) |
| Preservar fluxo de encerramento existente (markdown contract) | **Reformatação** do relatório de confiança (→ 2.5, já feito) |

### Paradigma e invariantes binding (cada um limita esta story)

- **AD-1 (Propose/Commit — toolkit é o único escritor):** a Déa **nunca escreve direto** nas pastas protegidas. Todo gate, stage-advance e propose passa pelo CLI. Esta story **não adiciona** novos paths de escrita — só ensina a Déa a **ler** melhor.
- **AD-3 (Núcleo hexagonal / import-boundary):** `toolkit/src/**` só importa `node:*` + relativos. Esta story **não toca** em `toolkit/src/` nem `bin/` — é **puramente skill-layer** (`skills/process-ai/SKILL.md`). AD-3 é preservado por definição.
- **AD-4 (Checkpoint autoritativo):** gates já são intents no WAL (comportamento existente). O resume restaura gates corretamente. Nada muda.
- **AD-5 (Confiança por fonte verificável):** o relatório (2.5) já provê os dados de confiança. A Déa **lê e apresenta** — não reatribui níveis.
- **NFR-1 / SM-C1 (Honestidade não-inflável):** a Déa **nunca esconde** 🟡/🔴 e **nunca infla** 🟢. O relatório é a fonte da verdade.

### O código que esta história MODIFICA — leia antes de tocar

- **`skills/process-ai/SKILL.md`** — **ÚNICO arquivo modificado.** Estado atual (1.5, ~154 linhas):
  - §1 "Início" (`:35-49`) — resume + stage `scope`. **NÃO mexer** (fora do escopo).
  - §2 "Escopo — Gate 0" (`:54-69`) — confirmação de escopo. **NÃO mexer** (fora do escopo — o Gate 0 é pré-pipeline, sem especialista).
  - §3 "Pipeline — especialistas + gates" (`:72-120`) — **ALVO do T1.** O passo 1 atual é "Abra o gate" (`process-ai gate --id gate-<N> --decision approved`) — **sem** exibir 🟡/🔴 antes. Esta story insere o passo **0 (gate informativo)** antes do passo 1: executar `process-ai report`, parsear 🟡/🔴, apresentar ao usuário, bloquear até decisão.
  - §4 "Encerramento" (`:124-141`) — **ALVO do T2.** O fluxo atual gera o relatório, redige um resumo e commita. Esta story enriquece o resumo com: cabeçalho narrativo, parágrafo por etapa, próximos passos acionáveis. O contrato markdown (report verbatim) é preservado.
  - §5 "Tom da Déa" (`:145-153`) — **NÃO mexer** (já cobre honestidade e pt-BR).
  - **Stale "rascunho"** em `:108` (`deferred-work.md:96`): "produz o rascunho e o commita" → one-word fix oportunístico para "produz o **artefato** e o commita" (todos os 4 especialistas são profundos desde 2.1–2.4). Aproveitar o toque no arquivo.

### Aprendizados das revisões anteriores — aplicáveis a esta story

- **[2.4, `deferred-work.md:96`] Stale "rascunho" em `:108`:** "produz o rascunho" → "produz o artefato" (one-word fix). Aproveitar que §3 será reescrita.
- **[1.5, `deferred-work.md:65`] Escape markdown no `stage`:** o `report.ts` 2.5 já escapa campos. A Déa deve garantir que o `summary-report` também escape conteúdo vindo do usuário (nome do processo, escopo) ao escrever o JSON.
- **[Padrão das stories 2.2/2.3/2.4] Prevenção codificada:** cada story do Epic 2 incluiu seções de prevenção (🟢 não inflado, resiliência, backward-compat, AD-3 auto-coberto). 2.6 é skill-layer — a "prevenção" relevante é o teste de shape/lint (`tests/skill.test.ts`).

### Decisões de implementação

1. **Gate informativo = skill-layer (zero toolkit).** O relatório 2.5 já tem `itemsByLevel['🟡']` e `itemsByLevel['🔴']` com todos os campos. A Déa executa `process-ai report`, lê o markdown, e extrai as seções relevantes para apresentar ao usuário. Sem parsing estruturado — a Déa é um LLM lendo markdown, o que é adequado para a camada de apresentação.
2. **Bloqueio = decisão da Déa (não lock).** O checkpoint registra gates (existente); a Déa decide não prosseguir até `approved`. Isso é consistente com o modelo de confiança: o humano sempre tem a palavra final.
3. **Resumo narrativo = a Déa escreve (não o toolkit).** O `summary-report` é um artifactType como qualquer outro — a Déa propõe o conteúdo, o toolkit commita. A narrativa é responsabilidade da skill layer.
4. **Nenhum novo comando CLI, artifactType, ou estado.** Tudo o que a Déa precisa já existe no toolkit 2.5. Esta story é puramente sobre **como** a Déa usa o que já tem.

### Prevenção codificada (MUST — espelha 2.2/2.3/2.4/2.5)

- **🟢 não inflado (SM-C1):** a Déa lê o relatório (fonte da verdade) e nunca adiciona 🟢 que não existam no ledger.
- **🔴 nunca escondido (NFR-1):** os gates destacam proativamente 🔴; o resumo lista todos os gaps com ações sugeridas.
- **Contrato markdown preservado:** `process-ai report` → saída verbatim dentro do `summary-report`. A Déa escreve **ao redor** do relatório, não **dentro** dele.
- **Zero regressão no core:** 201 testes herdados continuam passando (nenhum arquivo `toolkit/src/` ou `bin/` é alterado).
- **AD-3 auto-coberto:** `tests/import-boundary.test.ts` varre `toolkit/src/**` — como 2.6 não toca o core, o guardrail permanece verde por definição.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.6] — AC literal ("mostra contagem+lista de 🟡/🔴 e bloqueia o próximo até aprovação"; "resumo final cita o documentado, contagem 🟢/🟡/🔴 e próximos passos").
- [Source: _bmad-output/planning-artifacts/prds/prd-process-ai-2026-08-01/prd.md#FR-4, FR-5] — FR-4 (gate bloqueia próxima etapa; exibe contagem+lista 🟡/🔴); FR-5 (resumo cita documentado, contagem, próximos passos; sessão não termina sem relatório).
- [Source: _bmad-output/planning-artifacts/architecture/architecture-process-ai-2026-08-01/ARCHITECTURE-SPINE.md#AD-1, AD-3, AD-4, AD-5] — AD-1 (toolkit único escritor, skills sem acesso de escrita); AD-3 (núcleo hexagonal); AD-4 (checkpoint autoritativo, gates como intents WAL); AD-5 (confiança mecânica, fonte verificável).
- [Source: skills/process-ai/SKILL.md#72-120, 124-141] — §3 pipeline atual (gate sem informativo); §4 encerramento atual (resumo mínimo). Blocos-alvo da modificação.
- [Source: toolkit/src/report.ts#formatConfidenceReport] — Relatório 2.5 rico (itemsByLevel, breakdown, reverse-index, excerpt-status, órfãos listados) — a fonte de dados que a Déa consome.
- [Source: _bmad-output/implementation-artifacts/2-5-confianca-verificavel-rastreabilidade-relatorio.md] — Story 2.5 (predecessora imediata; produziu o relatório rico que 2.6 consome).
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#96] — Stale "rascunho" em SKILL.md:108 (one-word fix oportunístico).

## Dev Agent Record

### Agent Model Used

Claude Code (deepseek-v4-pro)

### Debug Log References

N/A — execução limpa, sem halt.

### Completion Notes List

✅ **T1 (Gates ricos — §3):** Reestruturado o fluxo da pipeline em `skills/process-ai/SKILL.md` §3. O handoff agora segue: especialista conclui → commita artefatos → captura sha256 → gate informativo (`process-ai report` → apresentar 🟡/🔴 ao usuário) → decisão (approved/changes-requested/rejected) → se approved, avança estágio + próximo especialista. 3 caminhos de decisão com comportamentos documentados. Fix oportunístico: "rascunho" → "artefato" (deferred-work.md:96).

✅ **T2 (Resumo final rico — §4):** Enriquecido o encerramento em §4. O resumo narrativo agora inclui: cabeçalho com escopo+data, 1 parágrafo por etapa (discovery→mapping→modeling→standardization) citando artefatos e contagens 🟢/🟡/🔴, próximos passos acionáveis derivados dos 🔴 do relatório (nunca genéricos), resumo das decisões dos gates. Relatório de confiança verbatim preservado como contrato duro. Fluxo propose→commit→stage summary preservado.

✅ **T3 (Testes):** 7 novos testes em `tests/skill.test.ts` (15 total): gate informativo com `process-ai report`, 3 caminhos de decisão, destaque 🟡/🔴, resumo por etapa, próximos passos acionáveis, proibição de genérico, contrato markdown verbatim, e remoção de "rascunho".

✅ **T4 (Critério implícito):** 249/249 testes passando (número corrigido na code review 2026-08-03), `tsc --noEmit` limpo, AD-3 verde, E2E conductor + pipeline verdes. **Nenhum arquivo em `toolkit/src/` ou `bin/` modificado** (skill-layer only).

### File List

- `skills/process-ai/SKILL.md` — MODIFIED (§3 reestruturado com gate informativo + 3 caminhos de decisão; §4 enriquecido com resumo narrativo por etapa + próximos passos acionáveis; fix "rascunho"→"artefato")
- `tests/skill.test.ts` — MODIFIED (+7 testes 2.6: gate informativo, decisão, destaques, resumo narrativo, ações concretas, contrato markdown, deferred-work.md:96)

## Change Log

- 2026-08-02: Implementação completa da story 2.6 — gates informativos com contagem+lista 🟡/🔴 (FR-4 full) + resumo final narrativo rico com próximos passos acionáveis (FR-5 full). Primeira story puramente skill-layer (zero mudanças no toolkit/core). Suite verde, typecheck limpo, AD-3 verde.
- 2026-08-03: Code review adversarial (3 camadas: Blind + Edge + Auditor). 1 decision-needed resolvido + 13 patches aplicados em `skills/process-ai/SKILL.md` e `tests/skill.test.ts`. 2 High (escaping JSON quebrava o commit do summary-report; testes de aceitação falso-positivos sem escopo de seção), 2 Medium (modelo de avanço de estágio pós-reordenação; gate informativo sem breakdown por artifactType/contagem/níveis vazios), 7 Low (AD-1 path do temp, error-handling, loop changes-requested, gate-0 no resumo, leak em falha, resume após rejected, gaps de teste AC4/AC5). Suite 249/249, typecheck limpo, AD-3 verde. Story → done.

## Review Findings (code review 2026-08-03)

Revisão adversarial em 3 camadas (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Suite verde (244/244, typecheck limpo, AD-3 verde, E2E verde); claim "skill-layer only / sem mudança em toolkit/bin" **verificado verdadeiro** para o escopo da 2.6. Achados abaixo.

### Patch

- [x] [Review][Patch] **(MED — resolvido via opção 1)** Modelo de avanço de estágio — adicionar `stage --to discovery` ao **entrar na §3** (antes do Bento); o passo 5 já avança ao estágio do próximo especialista após cada gate aprovado. Ajustar a tabela §3 para "gate de saída". Resolve: Bento trabalhando em `scope`, estágio stale no gate, e `discovery` pulado. [skills/process-ai/SKILL.md:82-87, 98-150]
- [x] [Review][Patch] **(HIGH)** Escaping JSON incompleto quebra o commit do `summary-report` — `escapeMd` (toolkit/src/report.ts:162) insere backslashes literais (`\*`, `\(`, `\|`, `\#`…) em todo campo; §4 passo 4 manda escapar só `"`→`\"` e `\n`, **não** `\`→`\\` → JSON inválido → `readPayload` (bin/process-ai.ts:264) lança "Payload inválido (JSON malformado)" → `propose` aborta → entregável final (AC6) não commita. Trigger quase certo (qualquer claim com `(`/`*`/`|`). Fix mínimo: adicionar "backslashes como `\\`" à instrução de escaping. [skills/process-ai/SKILL.md:205-208]
- [x] [Review][Patch] **(HIGH)** Testes de aceitação 2.6 são falso-positivos (regex sem escopo de seção) — toda asserção roda `.test(content)` sobre o **arquivo inteiro**; os nomes alegam "§3" e "antes de", mas nada escopia à seção nem checa ordem → passam no conteúdo pré-diff (substrings já existiam em §2/§4/lista de comandos); AC1 fica sem cobertura real. Fix: extrair o span §3 (entre `## 3.` e `## 4.`) e asserir dentro dele; para o teste de ordem, `content.indexOf('process-ai report') < content.indexOf('process-ai gate')`. [tests/skill.test.ts:102-124, 166-173]
- [x] [Review][Patch] **(MED)** Gate informativo não apresenta o **breakdown por artifactType** nem a **contagem** explícita — AC1 pede literalmente "a contagem e a lista de itens 🟡 e 🔴 (breakdown por artifactType + itemsByLevel)", mas §3 passo 3 só lista itens. O dado existe no relatório (`### Breakdown por Artefato`, report.ts:577-588). Fix: instruir a abrir com a contagem ("3 🟢, 2 🟡, 1 🔴") e citar o breakdown por artifactType. [skills/process-ai/SKILL.md:122-134]
- [x] [Review][Patch] **(MED)** §3 assume que as 3 seções de nível sempre existem e cita headers incorretos — `report.ts:594` omite níveis vazios (`if (items.length === 0) continue`); os headers reais são `### 🟢 Confiança Alta (verificada) (N)` (report.ts:600), não os "limpos" citados. Só o caso total-zero é tratado (parcial-vazio, o mais comum, não é). Fix: hedge "se uma seção de nível estiver ausente, há zero itens daquele nível — diga-o"; corrigir os headers citados (ou dizer "começando com `### 🟢`/`### 🟡`/`### 🔴`"). [skills/process-ai/SKILL.md:122-126, 185-186; toolkit/src/report.ts:592-600]
- [x] [Review][Patch] **(LOW)** Caminho do `summary-report.json` não fixado → risco de violar AD-1 (Write dentro de `_process-ai_output/`). Fix: pinar "escreva em `./summary-report.json` (raiz do projeto-alvo), **nunca** em `_process-ai_output/` ou `.process-ai/`". [skills/process-ai/SKILL.md:202-211]
- [x] [Review][Patch] **(LOW)** Sem branch de erro quando `process-ai report`/`status` saem non-zero ou emitem stderr. Fix: "se o comando falhar, informe o erro ao usuário e não prossiga com a narrativa (não invente dados)". [skills/process-ai/SKILL.md:122-123, 158-164]
- [x] [Review][Patch] **(LOW)** Loop `changes-requested` sem guarda de terminação; `applyIntent` é last-write-wins (checkpoint.ts) — a decisão anterior do gate é sobrescrita, perdendo histórico. Fix: documentar o comportamento last-write-wins + nota "após vários ajustes sem convergir, considere `rejected`/encerrar". [skills/process-ai/SKILL.md:139-141]
- [x] [Review][Patch] **(LOW)** §4 "resumo das decisões dos gates" exclui o gate-0 (escopo) — diz "gate-1 a gate-4". Fix: incluir gate-0. [skills/process-ai/SKILL.md:194-195]
- [x] [Review][Patch] **(LOW)** `summary-report.json` temporário vaza se `propose` falhar; falha de `stage --to summary` deixa estado inconsistente (artefato commitado, estágio não). Fix: "remova o temp **mesmo se** propose falhar"; nota de recuperação para o stage final. [skills/process-ai/SKILL.md:209-214]
- [x] [Review][Patch] **(LOW)** `rejected`→`resume` sem regra de recuperação documentada (§1 resume não reconhece que o último gate foi `rejected`). Fix: adicionar regra de resume — "se o gate mais recente do estágio for `rejected`, perguntar se reabre o especialista ou mantém a sessão parada". [skills/process-ai/SKILL.md:40-43 vs 142-144]
- [x] [Review][Patch] **(LOW)** Gaps de teste: AC4 (linguagem de bloqueio do gate) e AC5 (zero-honesto / nunca-inflar 🟢) corretos no texto mas sem asserção. Fix: adicionar asserts (com escopo de seção, ver finding HIGH dos testes). [tests/skill.test.ts]
- [x] [Review][Patch] **(LOW)** Contagem de testes incorreta nas Completion Notes/Change Log — relata 208/208; real é 244/244 (sem regressão). Fix: atualizar o número. [2-6-gates-completos-resumo-final.md:206, 215]
