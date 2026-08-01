---
baseline_commit: e7b99f5
---

# Story 1.6: Pipeline mínima — especialistas produzem rascunhos

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **leigo**,
I want **Bento→Miguel→Júlia→Zanoni produzindo rascunhos mínimos (SIPOC + cadeia de valor → hierarquia → fluxo → POP), cada um commitado via `propose` com marcadores de confiança**,
so that **eu veja a documentação do processo se materializar ponta-a-ponta — e a cadeia de provenance (afirmação 🟢 → artefato-fonte commitado) seja exercitada de ponta a ponta, populando o ledger de confiança que a 1.5 deixou vazio**.

## Acceptance Criteria

1. **[AC1] Especialistas são skills separadas, instaladas junto com o condutor (FR-3, AD-3, AD-7)** — **Given** o fonte do framework com `skills/process-ai-{bento,miguel,julia,zanoni}/SKILL.md` (4 skills de especialista, BMad-style), **When** o `bootstrap`/`installSkills` roda num projeto-alvo, **Then** **todas as 5 skills** (condutor `process-ai` + 4 especialistas) são copiadas **byte-a-byte** para `<alvo>/.claude/skills/<name>/SKILL.md`. O condutor permanece a **única entrada voltada ao usuário** (`/process-ai`, FR-1); os especialistas são **orquestrados pela Déa** (handoff em ordem fixa), **não** invocados diretamente pelo leigo. *(FR-3; materializa o Structural Seed do ARCHITECTURE-SPINE + a convenção de naming `process-ai-*`)*

2. **[AC2] Bento produz SIPOC-rascunho + cadeia de valor simples com claims (FR-6, FR-7, FR-8 mínimo, AD-1, AD-5)** — **Given** Gate 1 aprovado + estágio `discovery`, **When** Bento conduz uma entrevista mínima (roteiro **inline** na skill — method-pack é Epic 3) e propõe, **Then** um rascunho **`sipoc`** e um rascunho **`value-chain`** são **commitados via `process-ai propose`** (cada um com `claims: Claim[]` — `statement`+`level`+`reasoning`). Por serem o **primeiro** estágio (a entrevista do usuário não é um artefato commitado), os claims de Bento são honestamente **🟡 (inferido)** ou **🔴 (gap)** — nenhum 🟢 ainda. *(FR-6,7,8 mínimo)*

3. **[AC3] Miguel propõe hierarquia-rascunho com provenance cruzada → primeiro 🟢 do sistema (FR-9 mínimo, AD-5)** — **Given** a `value-chain` de Bento commitada (sha256 conhecido), **When** Miguel propõe a `hierarchy` (rascunho Macro→…→Tarefa), **Then** pelo menos **um claim 🟢** tem `source: { artifactType: 'value-chain', sha256: <sha de Bento> }` e o toolkit (`validateClaims`, 1.4) **resolve a manifesto existente** → o ledger registra **🟢 validado**. Um claim com source **malformada/inexistente** é **degradado a 🟡** (não aborta o commit). **Primeira demonstração de rastreabilidade cross-artefato ponta-a-ponta.** *(FR-9 mínimo; exerce o mecanismo AD-5 já implementado em 1.4)*

4. **[AC4] Júlia propõe um fluxo simples (NÃO BPMN 2.0 XML) (FR-10 mínimo)** — **Given** a `hierarchy` de Miguel commitada, **When** Júlia propõe um **`flow`** (rascunho de fluxo simples em markdown — **não** BPMN 2.0 XML), **Then** é commitado com claims sourcing a hierarchy (🟢 onde resolvido). **BPMN 2.0 XML canônico (AD-6) NÃO é produzido aqui** → **2.3**. `artifactType: 'flow'` (reservar `'bpmn'` para o artefato canônico da 2.3). *(FR-10 mínimo; fronteira AD-6 → Epic 2)*

5. **[AC5] Zanoni propõe um POP-rascunho (FR-12 mínimo)** — **Given** o `flow` de Júlia commitado, **When** Zanoni propõe um **`pop`** (Procedimento Operacional Padrão-rascunho, referenciando atividades/tarefas), **Then** é commitado com claims sourcing o flow/hierarchy (🟢 onde resolvido). **Diagnóstico (FR-13) e gargalos (FR-11) ficam de fora** → **2.3/2.4**. *(FR-12 mínimo)*

6. **[AC6] Pipeline ponta-a-ponta popula o ledger; o relatório de confiança deixa de ter zeros honestos (FR-14, FR-5 mínimo, AD-5, NFR-1, SM-C1)** — **Given** a pipeline completa (Bento→Miguel→Júlia→Zanoni, cada um após seu gate `gate-1..gate-4`), **When** a Déa gera o relatório no encerramento (`process-ai report`), **Then** o ledger `.process-ai/confidence-ledger.jsonl` é **não-vazio** e o relatório mostra **contagens 🟢/🟡/🔴 não-zeros** (mix honesto — sem inflar 🟢, SM-C1). A cadeia de provenance é exercitada de ponta a ponta (Bento → … → Zanoni); `resume` subsequente **não duplica** artefatos/gates/claims.

> **Critério implícito (não-negociável):** a história deixa o sistema "rodável ponta-a-ponta" no escopo dela — `node --test tests/*.test.ts` 100% verde (**161 testes herdados da 1.1–1.5 + novos, zero regressões**), `npm run typecheck` (`tsc --noEmit`) limpo, e o guardrail **AD-3** (`tests/import-boundary.test.ts`) permanece verde (esta story **não adiciona arquivos ao core** `toolkit/src/**` — especialistas são skills markdown; a única mudança TS é no adapter, **fora** do core). Um **E2E simulado** deve passar: bootstrap em tmpdir → 5 skills instaladas → condução via CLI (Gate 0 → gate-1..gate-4 + discovery/mapping/modeling/standardization) → **especialistas propõem rascunhos com claims** (incl. provenance cruzada 🟢 + caso de degradação 🟡) → ledger não-vazio → `report` com contagens não-zeros → `propose summary-report` → resume sem duplicação. Não basta "satisfazer os ACs literais".

## Tasks / Subtasks

- [x] **T1 — 4 skills de especialista `skills/process-ai-{bento,miguel,julia,zanoni}/SKILL.md` (AC: #2, #3, #4, #5)**
  - [x] **NEW** — uma skill markdown por especialista, **fonte única de verdade** (o adapter as copia byte-a-byte). Frontmatter obrigatório: `name: process-ai-<specialist>` + `description` (uma linha, em pt-BR).
  - [x] **Estrutura de cada skill (markdown que o agente segue):**
    - **Persona/tom** consistente com a Déa (conduz o leigo; honestidade 🟡/🔴; pt-BR). Inventar tom próprio, consistente — o PRD/brief **não definem** tom dos especialistas (só `role label`: Bento=Descobridor, Miguel=Mapeador, Júlia=Modeladora, Zanoni=Padronizador; isomorfismo BMad no `addendum §3`).
    - **Roteiro/template MÍNIMO inline** (entrevista do Bento, shape do SIPOC, níveis da hierarquia, etc.). **Não** carregar de `method-packs/` nem de `.process-ai/config` — o sistema de method-packs é **Epic 3** (FR-17/18, AD-2). Esta é uma exceção v1 **documentada** (extração → 3.3).
    - **Produção do rascunho via `propose` com `claims`** — a skill instrui o agente a: (a) montar o `ProposePayload` com `artifactType` + `content` + `claims[]`; (b) escrever o payload num arquivo temp com a **ferramenta de escrita (Write), NÃO heredoc Bash** (evita escaping JSON/markdown — padrão da 1.5 §4); (c) `process-ai propose --payload <arquivo.json>`; (d) **capturar o `sha256` do `CommitResult`** (impresso pelo CLI) para o próximo especialista usar como `source`; (e) **remover o arquivo temp** após o commit.
    - **Marcadores em toda afirmação (NFR-1/FR-14):** cada claim tem `level` ∈ {🟢,🟡,🔴} + `reasoning`. 🟢 exige `source: { artifactType, sha256 }` de um artefato **upstream já commitado**; sem fonte → 🟡; não-determinado → 🔴.
    - **AD-1 estrutural:** a skill **declara** que NÃO escreve direto nas pastas protegidas — toda escrita via CLI `process-ai`.
  - [x] **`artifactType`s canônicos (decisão da story — não contractualizados até 3.1):** `sipoc`, `value-chain` (Bento); `hierarchy` (Miguel); `flow` (Júlia — **não** `bpmn`, reservado p/ 2.3); `pop` (Zanoni). Todos `.md` (`EXT_BY_TYPE` vazio em `commit.ts:61`).
  - [x] **Cadeia de provenance (o coração da story):** cada especialista instrui a referenciar o artefato do especialista anterior. Bento (1º) → claims 🟡/🔴 (sem upstream). Miguel → 🟢 sourcing `value-chain`. Júlia → 🟢 sourcing `hierarchy`. Zanoni → 🟢 sourcing `flow`/`hierarchy`.

- [x] **T2 — Generalizar `installSkills` p/ instalar todas as skills `process-ai*` (AC: #1, AD-3, AD-7)**
  - [x] **MODIFY `toolkit/adapters/claude-code/adapter.ts`** — hoje `installSkills` copia **um único** skill hardcoded (`SOURCE_SKILL_MD = skills/process-ai/SKILL.md`, `adapter.ts:26`). Generalizar: descobrir **todos** os dirs `skills/process-ai-*/` + o condutor `skills/process-ai/`, e copiar cada `<dir>/SKILL.md` byte-a-byte para `<alvo>/.claude/skills/<name>/SKILL.md` (usando as **mesmas defesas já existentes**: validação do alvo, symlink-walk por componente, leaf-symlink check, escrita atômica temp+rename).
  - [x] **Preservar comportamento existente:** o condutor continua instalado byte-a-byte em `.claude/skills/process-ai/SKILL.md` (regressão da 1.1/1.5 — `tests/skill.test.ts` e `tests/bootstrap.test.ts` devem permanecer verdes). A descoberta é **aditiva** (instala o condutor + os especialistas).
  - [x] **Robustez:** se `skills/process-ai-<x>/` existir mas faltar `SKILL.md`, ignorar com aviso (não abortar o bootstrap inteiro por um especialista faltante); se `skills/` não tiver nenhum `process-ai*`, manter o erro acionável existente. Erros em pt-BR (padrão 1.1).
  - [x] **AD-3 preservado:** o adapter **continua sendo o único** que conhece a engine; a mudança é puramente "quantas skills copiar" — o core (`toolkit/src/**`) **não é tocado**, logo `tests/import-boundary.test.ts` fica verde. O adapter é **pass-through** quanto ao propose (sem mudança).

- [x] **T3 — Atualizar o condutor `skills/process-ai/SKILL.md` (AC: #1, #2, #3, #4, #5, #6)**
  - [x] **MODIFY §3 (Pipeline):** substituir a nota de fronteira "1.5↔1.6" (especialistas agora **existem**) por instruções reais de handoff:
    - Para cada estágio, após abrir o gate + avançar o estágio, **conduzir o handoff ao especialista**: o agente **adota a persona** do especialista seguindo a skill `process-ai-<specialist>` (instalada em `.claude/skills/process-ai-<specialist>/SKILL.md` — handoff em nível markdown, engine-agnostic, AD-3).
    - **Threading de provenance:** capturar o `sha256` do `CommitResult` de cada especialista e **passá-lo ao próximo** (na instrução de handoff) para que ele possa propor claims 🟢 com `source` correto.
    - **Tom da Déa nos gates:** continua destacando 🟡/🔴 (honestidade, NFR-1).
  - [x] **Preservar (não-regressão 1.1/1.5):** frontmatter `name: process-ai` (slash-invocável); abertura *"Qual processo vamos mapear?"*; `process-ai resume` no início; Gate 0; tabela de gates/estágios; encerramento com `process-ai report` + `propose summary-report`; AD-1 (sem escrita direta).
  - [x] **`tests/skill.test.ts`** atualmente valida essa skill-fonte — confirmar que as asserções (Gate 0, gate-1..4, slots Bento/Miguel/Júlia/Zanoni, comandos CLI, summary-report, no-write) **continuam passando** após a edição.

- [x] **T4 — Testes (AC: #1–#6 + AD-1/AD-3/AD-5 + regressão 1.1–1.5)**
  - [x] **`tests/specialists.test.ts` (NEW):** (a) os 4 arquivos `skills/process-ai-*/SKILL.md` existem com frontmatter `name`/`description` + persona + instrução de propose-com-claims + AD-1 (no-write); (b) após `installSkills(tmp)`, **todas as 5 skills** estão em `<tmp>/.claude/skills/<name>/SKILL.md` e cada uma é **byte-a-byte** igual à fonte; (c) os `artifactType`s canônicos aparecem nas skills (`sipoc`/`value-chain`/`hierarchy`/`flow`/`pop`).
  - [x] **`tests/adapter.test.ts` (MODIFY/EXTEND):** `installSkills` instala o condutor **e** os 4 especialistas (regressão: condutor ainda instalado byte-a-byte). Cobrir o caso "especialista sem SKILL.md é ignorado sem abortar".
  - [x] **`tests/e2e-pipeline.test.ts` (NEW — critério implícito):** num tmpdir, conduzir via dispatcher a pipeline **com produção de rascunhos**:
    - Gate 0 → `gate-1`+`discovery` → Bento propõe `sipoc` (claims 🟡/🔴) + `value-chain` → **captura shas**;
    - `gate-2`+`mapping` → Miguel propõe `hierarchy` com claim 🟢 sourcing `value-chain` (sha real) → **asserir ledger 🟢 validado**; + um claim com sha **inexistente** → **degradado a 🟡** (não aborta);
    - `gate-3`+`modeling` → Júlia propõe `flow` (🟢 sourcing `hierarchy`);
    - `gate-4`+`standardization` → Zanoni propõe `pop` (🟢 sourcing `flow`);
    - `summary` → `report` → asserir **contagens não-zeros** (≥1 🟢 e ≥1 🟡); `propose summary-report`;
    - asserir: 6 artefatos commitados (`sipoc`,`value-chain`,`hierarchy`,`flow`,`pop`,`summary-report`) em `_process-ai_output/`, checkpoint com gate-0..gate-4 + estágios, **resume não duplica**.
  - [x] **Regressão intocada e verde:** `tests/{scaffold,bootstrap,commit,checkpoint,confidence,report,cli,import-boundary,skill,e2e-conductor}.test.ts` — **161 testes da 1.1–1.5 inalterados**. Em especial: `tests/e2e-conductor.test.ts` (loop do condutor **sem** especialistas → zeros honestos) permanece válido como regressão da 1.5; `tests/skill.test.ts` permanece verde; `tests/import-boundary.test.ts` verde (**sem novo arquivo no core**).

- [x] **T5 — Critério implícito (não-negociável)**
  - [x] `node --test tests/*.test.ts` → 100% pass (161 prévios + novos), 0 fail.
  - [x] `npm run typecheck` (`tsc --noEmit`) limpo.
  - [x] AD-3 verde (`toolkit/src/**` intocado — só `node:*` + relativos; **nenhum** arquivo novo no core).
  - [x] E2E simulado ponta-a-ponta da pipeline **com rascunhos + claims + provenance cruzada** passando.

### Review Findings

_Code review em escopo 1-6 (commit-base `e7b99f5`, 3 camadas paralelas: Blind Hunter + Edge Case Hunter + Acceptance Auditor). **Acceptance Auditor: PASS** — AC1–AC6 + AD-1/AD-3/AD-5/AD-6 + fronteiras (sem scope creep p/ 2.1/2.3/2.4/2.5/2.6/Epic 3) satisfeitos. Achados abaixo são de robustez/teste, não violações de AC._

**Patch (correção inequívoca):**
- [x] [Review][Patch] Loop multi-skill sem resiliência — falha no N-ésimo `installOneSkill` deixa o alvo parcialmente instalado (skills 1..N−1 instaladas, N..fim ausentes) sem aviso; regressão de atomicidade vs 1.1 (single-skill) [toolkit/adapters/claude-code/adapter.ts:117] — médio
- [x] [Review][Patch] `discoverSourceSkills` aborta o bootstrap em entrada arquivo (ENOTDIR, não ENOENT) — contradiz o contrato "não aborta o bootstrap"; segue symlink do source (`stat`, não `lstat`) — defense-in-depth gap no source (o target tem defesas, o source não); e o teste "ghost" dá falsa confiança (nunca cria um dir sem SKILL.md → passa mesmo se o skip for removido) [toolkit/adapters/claude-code/adapter.ts discoverSourceSkills/installOneSkill + tests/specialists.test.ts] — baixo
- [x] [Review][Patch] `deferred-work.md` não atualizado com o defer do `--agent` por-especialista (decisão #6 diz "registrar em deferred-work.md") [doc] — baixo

**Defer (real, pré-existente — detalhes em `deferred-work.md`):**
- [x] [Review][Defer] `checkpoint.artifacts[]` sem dedup por sha256 em re-propose do usuário (resume NÃO dobra — só replay de cursor>walCursor; apenas um propose novo repetido cresce a lista) [toolkit/src/checkpoint.ts:354] — pré-existente 1.3, não exercitado pelo fluxo single-propose da 1.6

**Dismissed (8):** asserções de substring nas skills (smoke tests por design — o E2E + estrutura dão a garantia real); E2E não exercita as skills markdown (LLM→skill é não-determinístico, inherentemente não testável de forma determinística); `deepEqual` "exatamente 5 skills" (asserção intencional de conjunto exato — atualizar ao adicionar especialistas é esperado); ordenação de `readdir` (sem consequência hoje — cada skill em seu dir, testes ordenam); colisão de case `process-ai-Foo`/`foo` (o framework é dono do naming); `ENAMETOOLONG` por nome longo (nomes do v1 são curtos); TOCTOU discover→install stat (absorvido pelo patch do loop resiliente); `tests/adapter.test.ts` não modificado (cobertura de instalação presente em `specialists.test.ts`).

## Dev Notes

### O que esta história É (e o que NÃO é) — leia antes de codar

Esta é a **story 1.6 de 6 do Epic 1** (Walking Skeleton) — a **última do Epic 1**. As stories 1.1–1.4 construíram a fundação determinística (porta/adapter, commit SHA-256, checkpoint atômico, confiança+ledger) e a **1.5 construiu a máquina de condução** (Déa: Gate 0 → gates → resume → resumo+relatório, com os especialistas como **slots declarados** e o ledger **vazio**). A **1.6 preenche os slots**: cria as **4 skills de especialista** que produzem **rascunhos mínimos** e os commitam **via `propose` com claims** — o que finalmente **popula o ledger** e exercita a **cadeia de provenance cross-artefato** (o mecanismo AD-5 já implementado em 1.4, mas nunca antes exercitado com claims reais de agentes).

**Não construa aqui (scope creep — cada item pertence a outra story):**

| Pertence a 1.6 (esta) | Pertence a histórias futuras — NÃO faça |
|---|---|
| 4 skills de especialista (rascunhos mínimos) + instalação | Method-packs / schema-núcleo / loader → **Epic 3 (3.1/3.2/3.3)** |
| Rascunhos `sipoc`/`value-chain`/`hierarchy`/`flow`/`pop` em markdown | **BPMN 2.0 XML canônico** (AD-6) → **2.3** (`flow` ≠ `bpmn`) |
| Entrevista básica (roteiro inline na skill) | Entrevista **guiada pelo method-pack** (FR-6 full) → **2.1** |
| Claims com `source` → provenance cross-artefato (🟢 resolve manifesto) | Verificação de **trecho (excerpt)** + rastreabilidade **bidirecional navegável** → **2.5** |
| Relatório de confiança **mínimo** (contagens — já existe da 1.5) | Relatório **consolidado navegável** → **2.5** |
| Gates básicos (decisão no checkpoint — já existe da 1.5) | Gates **ricos** (contagem+lista 🟡/🔴 bloqueando) → **2.6** |
| POP-rascunho (referencia atividades) | **Diagnóstico** (FR-13) + **gargalos** (FR-11) → **2.3/2.4** |
| Generalizar `installSkills` (instalar 5 skills) | Per-specialist `agent` no provenance (`--agent` no CLI) → *Defer* (NFR-5 básico já satisfeito: provenance por commit/artifactType) |

> **Fronteira 1.6 ↔ 2.x/Epic 3 (não-negociável):** a 1.6 prova que a **pipeline produz artefatos honestos e rastreáveis ponta-a-ponta** no nível rascunho. **Profundidade** (SIPOC completo, hierarquia rastreável, BPMN XML, diagnóstico, gates ricos, relatório consolidado, method-packs) é **Epic 2/3**. Em 1.6, rascunhos são majoritariamente **🟡 (inferido)** com 🟢 **apenas onde um especialista sourceia um artefato upstream commitado** — isso é honesto e esperado (espelha a 1.5: "zeros honestos"; aqui: "rascunhos honestamente inferidos + provenance onde existe").

> **Fronteira confiança (precisa — leia):** o mecanismo AD-5 de **resolução de 🟢 a manifesto commitado JÁ ESTÁ IMPLEMENTADO** em 1.4 (`validateClaims`, `confidence.ts:206-231`: 🟢 + `source` bem-formado → verifica manifesto via `lstat`+`isFile()` → 🟢 ou degrada a 🟡). A 1.6 **não** reimplementa isso — ela **exercita** pela 1ª vez com claims reais encadeados. O que **não** está em 1.6 (e sim em **2.5**): verificação de **trecho/excerpt**, **rastreabilidade bidirecional navegável** (afirmação↔fonte nos dois sentidos) e **relatório consolidado**. Não confunda "defer AD-5" com "1.6 não valida source" — **1.6 valida sim** (via 1.4); só não faz excerpt/nav.

### O uso de IA generativa e a responsabilidade do dev

As 5 skills são **markdown — instruções que um LLM segue**, não código determinístico. O determinístico (commit, checkpoint, confiança, gates) mora no **toolkit** e **não muda nesta story**. Cada skill de especialista orquestra **chamando o CLI** (`process-ai propose ...`); o agente **nunca** escreve nas pastas protegidas diretamente. A **cadeia de provenance** (capturar o `sha256` de um especialista e passá-lo ao próximo) é **instrução de skill** — o agente a segue; o toolkit valida mecanicamente. Se um comportamento for necessário para a pipeline funcionar ponta-a-ponta, **é requisito desta story** tenha ou não AC literal (mesmo princípio das stories anteriores).

### Paradigma e invariantes binding (não quebre)

- **AD-1 — Propose/Commit:** toda escrita de artefato passa por `adapter.propose()` → `commit()`; a skill e o CLI **não tocam** `_process-ai_output/`/`.process-ai/` diretamente. Os especialistas propõem rascunhos via `process-ai propose --payload <file.json>`. [Source: ARCHITECTURE-SPINE#AD-1]
- **AD-3 — Núcleo hexagonal:** o core (`toolkit/src/**`) **não é modificado** nesta story. A **única** mudança TS é no **adapter** (`toolkit/adapters/claude-code/adapter.ts`), que é **fora do core** → `tests/import-boundary.test.ts` permanece verde. O adapter continua **pass-through** no propose. [Source: ARCHITECTURE-SPINE#AD-3]
- **AD-5 — Confiança verificável (mecanismo 1.4, exercitado em 1.6):** especialistas **propõem** nível+fonte+razão; o toolkit **valida** e grava no ledger. 🟢 exige `source` cujo manifesto existe; sem fonte → 🟡; não-determinado → 🔴. Excerpt/bidirecional/consolidado → 2.5. [Source: ARCHITECTURE-SPINE#AD-5; código `confidence.ts:177-242`]
- **AD-6 — BPMN canônico (NÃO nesta story):** o formato on-disk canônico de BPMN é **BPMN 2.0 XML toolkit-owned** → **2.3**. Em 1.6 Júlia emite um **`flow`** (rascunho markdown), **não** BPMN XML. `artifactType: 'flow'` (reservar `'bpmn'` p/ 2.3). [Source: ARCHITECTURE-SPINE#AD-6; epics "AD-5/6 → Epic 2"]
- **AD-7 — Distribuição/bootstrap:** o adapter registra skills no alvo. A 1.6 generaliza `installSkills` para registrar **todas** as skills `process-ai*` (condutor + 4 especialistas). [Source: ARCHITECTURE-SPINE#AD-7]
- **FR-3 — Ordem fixa:** Bento→Miguel→Júlia→Zanoni (estágios `discovery`→`mapping`→`modeling`→`standardization`, gates `gate-1..gate-4`). O resume depende dessa ordem — **não renumerar**. [Source: SPEC#CAP-1, prd §4.1, SKILL.md 1.5]
- **NFR-1 — Honestidade:** rascunhos majoritariamente 🟡/🔴; 🟢 só com source resolvida; relatório reflete o ledger honestamente (sem inflar 🟢 — SM-C1). [Source: prd §5/NFR-1, SM-C1]

### O código que esta história MODIFICA/CRIA — leia antes de tocar

_(Não-negociável: ler o estado atual antes de mudar. Fontes: `skills/process-ai/SKILL.md`, `toolkit/adapters/claude-code/adapter.ts`, `bin/process-ai.ts`, `toolkit/src/{commit,confidence,engine-adapter,report}.ts`, testes da 1.1–1.5.)_

**`skills/process-ai-bento/SKILL.md` · `…-miguel/…` · `…-julia/…` · `…-zanoni/…` (NEW — T1):**
- 4 novas skills-fonte. Cada uma: frontmatter (`name: process-ai-<x>` + `description`), persona/tom, roteiro/template **inline** (mínimo), instrução de produzir-rascunho-via-`propose`-com-`claims` ( captura sha256 → threading de provenance ), AD-1 declarado estruturalmente, pt-BR.
- **Atenção:** são a **fonte única de verdade** — o adapter as copia byte-a-byte (T2). Conteúdo = conteúdo instalado.

**`toolkit/adapters/claude-code/adapter.ts` (MODIFY — T2):**
- **Estado atual:** `installSkills` copia **um** skill hardcoded (`SOURCE_SKILL_MD`, `adapter.ts:26`), com defesas robustas (validação alvo, symlink-walk, leaf-symlink, temp+rename atômico).
- **O que muda:** descobrir todos `skills/process-ai*/SKILL.md` (via `fs.readdir('skills/')` filtrando `process-ai*` + o próprio `process-ai/`) e copiar cada um, **reaproveitando as defesas existentes** (fatorar o bloco de cópora numa helper per-skill, sem enfraquecer symlink/scope checks). Comportamento **aditivo**.
- **Preservar:** `propose()` (pass-through) **intacto**; `registerSlashCommands()` (no-op) **intacto**; composition root do `bootstrap.ts` **intacto**. Se achar que precisa mudar o propose ou o core — **pare**, é scope creep.
- **Testes impactados:** `tests/adapter.test.ts` (estender), `tests/skill.test.ts` e `tests/bootstrap.test.ts` (devem permanecer verdes — condutor ainda instalado byte-a-byte).

**`skills/process-ai/SKILL.md` (MODIFY — T3):**
- **Estado atual:** condutor completo da 1.5. §3 declara os 4 slots como "handoffs declarados" + nota de fronteira 1.5↔1.6.
- **O que muda:** §3 substitui a nota de fronteira por **handoff real** (adotar persona do especialista + threading de sha256 para provenance). Demais seções (abertura, resume, Gate 0, encerramento, tom) **preservadas**.
- **Atenção:** frontmatter `name: process-ai` **intacto** (é o que faz `/process-ai` existir — não-regressão 1.1).

**`bin/process-ai.ts` · `toolkit/src/{commit,confidence,engine-adapter,checkpoint,report}.ts` (NO CHANGE esperada):**
- A 1.6 **consome** essas APIs, não as reescreve. Nenhuma mudança no dispatcher nem no core é esperada. Assinaturas relevantes (já estáveis):
  - `commit(payload, { root, agent }): Promise<CommitResult>` — `commit.ts:410`. `claims?` validados via `validateClaims`; ledger atualizado.
  - `ProposePayload { artifactType: string; content: unknown; claims?: Claim[] }`, `CommitResult { sha256, artifactPath, manifestPath }` — `engine-adapter.ts:27,45`.
  - `Claim { claimId?, statement, level: '🟢'|'🟡'|'🔴', source?: { artifactType, sha256, excerpt? }, reasoning }` — `confidence.ts:57`; `ClaimSource` `confidence.ts:40`.
  - `validateClaims(claims, root)` resolve 🟢 a manifesto — `confidence.ts:177`. Degradar NÃO aborta commit; nível inválido aborta.
  - CLI: `process-ai propose --payload <file.json>` → imprime `CommitResult` JSON (com `sha256`). `gate`/`stage`/`resume`/`report`/`status` — `bin/process-ai.ts`.

**Layout resultante (delta em negrito):**
```text
skills/process-ai/SKILL.md               # MODIFY: §3 handoff real + threading de sha256 (T3)
skills/process-ai-bento/SKILL.md         # NEW: Descobridor → sipoc + value-chain (T1)
skills/process-ai-miguel/SKILL.md        # NEW: Mapeador → hierarchy (T1)
skills/process-ai-julia/SKILL.md         # NEW: Modeladora → flow (T1)
skills/process-ai-zanoni/SKILL.md        # NEW: Padronizador → pop (T1)
toolkit/adapters/claude-code/adapter.ts  # MODIFY: installSkills instala todas as process-ai* (T2)
tests/specialists.test.ts                # NEW: 4 skills + install 5 byte-a-byte (T4)
tests/e2e-pipeline.test.ts               # NEW: pipeline c/ rascunhos + claims + provenance (T4)
tests/adapter.test.ts                    # MODIFY/EXTEND: instala condutor + especialistas (T4)
# NENHUM arquivo novo em toolkit/src/**  (AD-3 verde; import-boundary verde)
# No root da sessão (gerado pelo toolkit — sem mudança de layout):
_process-ai_output/{sipoc,value-chain,hierarchy,flow,pop,summary-report}/<sha>.md
.process-ai/confidence-ledger.jsonl      # agora NÃO-VAZIO (🟢/🟡/🔴 dos especialistas)
```

## Decisões de implementação (registre as escolhas na Completion Notes)

1. **Especialistas = skills separadas (não seções do condutor).** O ARCHITECTURE-SPINE *Structural Seed*, o SOLUTION-DESIGN (layout `skills/`: `process-ai/` + `process-ai-<especialista>/`) e a convenção de naming `process-ai-*` **mandam** skills separadas; a 1.5 fala em "Skills dos especialistas" (plural). Isso **exige** generalizar `installSkills` (T2) — preço de entrada contido e fora do core (AD-3). **Alternativa considerada e rejeitada:** especialistas como seções da única `skills/process-ai/SKILL.md` (sem mudar o adapter) — rejeitada porque **contradiz a estrutura documentada** e o dev precisaria refatorar depois. [Source: ARCHITECTURE-SPINE Structural Seed + Consistency Conventions; SOLUTION-DESIGN §"A ideia central"]

2. **`artifactType`s: `sipoc`, `value-chain`, `hierarchy`, `flow`, `pop` (kebab), todos `.md`.** Não contractualizados até o schema-núcleo (3.1, AD-2). **`flow` (não `bpmn`)**: o artefato da Júlia em 1.6 é um rascunho, **não** BPMN 2.0 XML; reservar `bpmn` para o artefato canônico da 2.3 (AD-6). `EXT_BY_TYPE` vazio → default `.md`. [Source: commit.ts:61; glossary; epics "AD-6 → Epic 2"]

3. **Provenance via threading de sha256 na skill.** O condutor instrui: cada especialista propõe → captura o `sha256` do `CommitResult` → passa ao próximo, que o usa como `source.sha256` num claim 🟢. O toolkit (1.4) valida a resolução. **Nenhuma mudança no core** — a cadeia é orquestrada na camada de skill; o toolkit só valida mecanicamente. Isso **exercita** o AD-5 de 1.4 pela 1ª vez.

4. **Bento = primeiro estágio → só 🟡/🔴.** A entrevista do usuário não é um artefato commitado, então Bento não tem upstream p/ 🟢. Isso é **honesto** (NFR-1/SM-C1) e **esperado** — o primeiro 🟢 surge no Miguel (sourcing a `value-chain`). Não force 🟢 artificial em Bento.

5. **Roteiros/templates inline nas skills (exceção v1 documentada).** O PRD FR-6 diz que o roteiro vem do method-pack — mas method-packs são Epic 3. Em 1.6, o roteiro/template mínimo vai **inline** na skill do especialista. **Extração → 3.3** (`method-packs/bpmn-sipoc/` com `prompts/`). Documentar como exceção.

6. **Não adicionar `--agent` ao CLI (Defer).** Provenance por etapa (NFR-5 básico) **já** é satisfeita: `.process-ai/provenance.jsonl` loga cada commit (sha256, artifactType, agent, committedAt). Identidade por-especialista (`--agent bento`) é uma **melhoria observabilidade** fora dos ACs → **Defer** (registrar em `deferred-work.md`). O `artifactType` já distingue quem produbió quê.

7. **E2E da 1.5 preservado como regressão.** `tests/e2e-conductor.test.ts` (loop **sem** especialistas → zeros honestos) permanece **intocado e verde** — é um teste de regressão válido (run sem produção de especialistas). A pipeline **com** rascunhos vai num **novo** `tests/e2e-pipeline.test.ts`. Não sobrescrever a 1.5.

## Padrões de teste estabelecidos (espelhar — não reinventar)

Herdados da 1.1–1.5:
- `node:test` + `node:assert/strict`; tmpdir via `fs.mkdtemp(os.tmpdir())`; `finally { fs.rm(...) }`.
- Skill-fonte é única fonte de verdade: asserções de **conteúdo** + cópia **byte-a-byte** via `installSkills` (padrão `tests/skill.test.ts`).
- E2E via `dispatch(parseArgs([...]), adapter, root)` com `new ClaudeCodeAdapter({ cwd: tmp })` — drive determinístico, sem LLM (padrão `tests/e2e-conductor.test.ts`).
- Para "simular especialista": o teste **escreve o `ProposePayload`** num temp (com `claims`), chama `propose`, **lê o `sha256`** do `CommitResult`, reusa no próximo claim. Asserir ledger via `report` (contagens) e/ou leitura direta de `confidence-ledger.jsonl`.
- AD-3 guardrail: `tests/import-boundary.test.ts` varre `toolkit/src/**` — esta story **não adiciona** arquivo lá, fica verde automaticamente.

## Convenções (do spine, herdadas da 1.1–1.5)

- Naming `kebab-case`; skills prefixadas `process-ai-*`; IDs globais estáveis (FR-n, AD-n, CAP-n) — nunca renumerados.
- Node 24 LTS (v24.18.1); TS + ESM; imports `.ts` com extensão explícita (type-stripping nativo).
- Sem deps de runtime no core (AD-3 allowlist: só `node:` + relativos); o adapter pode usar `node:*`.
- Erros acionáveis em pt-BR. Pastas protegidas: escrita só em `_process-ai_output/` + `.process-ai/` (via toolkit).

## Project Structure Notes

- **Incremental sobre a fundação 1.1–1.5:** nenhuma camada determinística é reescrita. A 1.6 **acrescenta** 4 skills (especialistas) + generaliza a instalação (adapter) + atualiza o handoff do condutor. Cada peça consome APIs estáveis do toolkit.
- **Alvo ≠ framework:** skills são instaladas no projeto-alvo (`.claude/skills/`); artefatos commitados no `cwd` do projeto-alvo. Testes injetam tmpdir.
- **`.gitignore` da 1.1 já cobre** `_process-ai_output/` e `.process-ai/`.
- **Baseline:** HEAD `e7b99f5` (pós code-review 1-5); suite **161 pass / 0 fail**. A 1.6 builda sobre esse estado; confirmar a baseline verde antes de codar (`node --test tests/*.test.ts` → 161 pass).
- **Epic 1 fecha aqui:** com a 1.6 `done`, o Epic 1 (Walking Skeleton) está completo — pipeline produz documentação mínima ponta-a-ponta, com não-destrutivo, checkpoint/resume, porta/adapter e (agora) especialistas + provenance. Considerar rodar a **retrospective do Epic 1** (`epic-1-retrospective`) após o code-review da 1.6.

## References

- [Source: SPEC.md#CAP-2/3/4/5] — descoberta (Bento: SIPOC+cadeia), mapeamento (Miguel: hierarquia), modelagem (Júlia: BPMN+gargalos), padronização (Zanoni: POPs+diagnóstico)
- [Source: SPEC.md#CAP-1] — condução orquestrada por Déa (ordem fixa Bento→Miguel→Júlia→Zanoni)
- [Source: ARCHITECTURE-SPINE.md#AD-1] — propose/commit; toolkit único escritor; skill sem escrita direta
- [Source: ARCHITECTURE-SPINE.md#AD-3] — núcleo hexagonal; core engine-agnostic; adapter pass-through (1.6 não toca o core)
- [Source: ARCHITECTURE-SPINE.md#AD-5] — confiança por fonte verificável; 🟢 resolve a artefato commitado (mecanismo 1.4, exercitado em 1.6)
- [Source: ARCHITECTURE-SPINE.md#AD-6] — BPMN canônico on-disk = BPMN 2.0 XML toolkit-owned → **2.3** (1.6 emite `flow`, não BPMN XML)
- [Source: ARCHITECTURE-SPINE.md#AD-7] — distribuição: adapter registra skills no alvo (1.6 generaliza p/ 5 skills)
- [Source: ARCHITECTURE-SPINE.md Structural Seed + Consistency Conventions] — layout `skills/process-ai*/SKILL.md`; naming `process-ai-*`; pipeline mermaid (Gate 0 → Bento → |Gate 1| Miguel → |Gate 2| Júlia → |Gate 3| Zanoni → |Gate 4| Déa)
- [Source: SOLUTION-DESIGN.md §"A ideia central"] — skills markdown: `process-ai/` (Déa) + `process-ai-<especialista>/`
- [Source: glossary.md "SIPOC" · "Cadeia de Valor" · "Macroprocesso/…/Tarefa" · "BPMN" · "POP" · "Marcador de confiança" · "Propose/Commit" · "Gate"] — vocabulário canônico
- [Source: prd.md §4.2/4.3/4.4/4.5] — Bento/Miguel/Júlia/Zanoni (deliverables FR-6..13)
- [Source: prd.md §4.1/FR-3] — ordem fixa; agente só inicia após anterior + gate aprovado
- [Source: prd.md §5/NFR-1 · §9/SM-C1] — honestidade; não inflar 🟢
- [Source: prd.md §7/§8.2] — non-goals v1 (sem method lock-in, sem web UI, só Claude Code)
- [Source: brief.md §A · addendum.md §3] — role labels (Descobridor/Mapeador/Modelador/Padronizador) + isomorfismo BMad (tom a definir, consistente com Déa)
- [Source: epics.md#Story 1.6 + FR Coverage Map + "AD-5/6 → Epic 2; AD-2/7 → Epic 3"] — ACs originais (FR-6,7,8,9,10,12 mínimo); fronteiras
- [Source: 1-5-dea-skill-condutora.md] — CLI `process-ai propose|gate|stage|resume|report`, stage/gate IDs canônicos, `report.ts`, fronteira 1.5↔1.6 ("1.6 popula os claims"), padrão de propose-por-arquivo + Write-não-heredoc
- [Source: 1-4-toolkit-confianca-mecanica-ledger.md] — `Claim`/`ClaimSource`/`validateClaims`/ledger; `validateClaims` resolve 🟢 a manifesto (confidence.ts:206-231)
- [Source: 1-2-toolkit-propose-commit-sha256.md] — `commit()`, `ProposePayload`, `CommitResult`, `sanitizeArtifactType` (kebab), `EXT_BY_TYPE` vazio
- [Source: 1-1-scaffold-engineadapter-claudecodeadapter.md] — scaffold, porta `EngineAdapter`, `ClaudeCodeAdapter.installSkills` (cópia byte-a-byte), AD-3 guardrail
- [Source: code] — `adapter.ts:26,75-167` (installSkills); `commit.ts:61,410` (EXT_BY_TYPE vazio, commit); `confidence.ts:40,57,177-242` (Claim/validateClaims); `engine-adapter.ts:27,45,62-74` (ProposePayload/EngineAdapter); `bin/process-ai.ts` (propose path); `report.ts` (relatório lê ledger)
- [External: https://code.claude.com/docs/en/skills.md] — skill `name` = slash-invocável; skills de projeto exigem workspace trust

## Dev Agent Record

### Agent Model Used

glm-5.1 (skill `bmad-dev-story`)

### Debug Log References

- Baseline confirmada antes de codar: `node --test tests/*.test.ts` → **161 pass / 0 fail** (1.1–1.5); `npm run typecheck` (`tsc --noEmit`) limpo.
- RED→GREEN por fase: `tests/specialists.test.ts` 11 fail (skills ausentes + install não generalizado) → 11 pass após T1+T2; `tests/e2e-pipeline.test.ts` GREEN na 1ª execução (provenance cruzada resolveu 🟢, degradação 🟡 confirmada).
- Final: `node --test tests/*.test.ts` → **173 pass / 0 fail**; `tsc --noEmit` limpo; `tests/import-boundary.test.ts` (AD-3) 4/4 verde; `git status toolkit/src/` limpo (nenhum arquivo novo no core).

### Completion Notes List

- **Ordem de implementação (decisão):** T1 (skills) + T2 (adapter) foram feitas **juntas** — são interdependentes via `tests/specialists.test.ts` (os testes de instalação exigem as skills existirem E o `installSkills` generalizado). T1 isoladamente deixaria 2 testes de instalação RED; fazer T1+T2 num só ciclo deixou o arquivo `specialists.test.ts` 100% verde. T3 (condutor) e T4 (E2E) vieram depois, T5 por último (validação final). Todas as tasks T1–T5 cobertas.
- **T1 — 4 skills de especialista** (`skills/process-ai-{bento,miguel,julia,zanoni}/SKILL.md`): cada uma com frontmatter `name: process-ai-<x>` + `description`, persona/tom própria (consistente com a Déa — PRD/brief não definem tom), roteiro/template **inline** (exceção v1 documentada — method-pack é Epic 3), produção do rascunho via `propose` com `claims` (Write-não-heredoc, captura de `sha256`, remoção do temp), AD-1 declarado estruturalmente. `artifactType`s canônicos: `sipoc`+`value-chain` (Bento), `hierarchy` (Miguel), `flow` (Júlia — **não** `bpmn`, reservado p/ 2.3), `pop` (Zanoni). **Threading de provenance:** Bento entrega seus `sha256` ao Miguel; este à Júlia; esta ao Zanoni.
- **T2 — `installSkills` generalizado** (`toolkit/adapters/claude-code/adapter.ts`): antes copiava 1 skill hardcoded (`SOURCE_SKILL_MD`); agora descobre em `skills/` todos os dirs `process-ai(-.+)?` com `SKILL.md` (via `discoverSourceSkills`) e instala cada um byte-a-byte (via `installOneSkill`), **reaproveitando todas as defesas da 1.1** (validação do alvo, symlink-walk por componente, leaf-symlink check, escrita atômica temp+rename). Dir `process-ai*` sem `SKILL.md` é ignorado (não aborta); nenhum match → erro acionável. **Nenhuma mudança no core** (`toolkit/src/**` intocado) — o adapter é fora do core → AD-3 (`import-boundary`) verde. `propose()`/`registerSlashCommands()` inalterados (pass-through preservado).
- **T3 — condutor `skills/process-ai/SKILL.md` §3:** substituída a nota de fronteira "1.5↔1.6" por **handoff real** — tabela com `artifactType`s, instrução de adotar a persona do especialista (`process-ai-<x>`), e **threading de `sha256`** para claims 🟢 (provenance cruzada). Preservado: frontmatter `name: process-ai`, abertura "Qual processo vamos mapear?", `resume`, Gate 0, gates `gate-1..gate-4`, `process-ai report`+`propose summary-report`, AD-1 (`tests/skill.test.ts` 8/8 verde).
- **T4 — testes:** `tests/specialists.test.ts` (NEW, 11 testes: conteúdo das 4 skills + instalação byte-a-byte das 5 + ignore de dir sem SKILL.md); `tests/e2e-pipeline.test.ts` (NEW, 1 E2E ponta-a-ponta). `tests/adapter.test.ts` permanece 11/11 (regressão — `installSkills` generalizado preserva todas as defesas). O E2E prova a **cadeia de provenance**: Miguel alcança 🟢 sourcing a `value-chain` de Bento (manifesto resolve); um claim 🟢 com sha **inexistente** é **degradado a 🟡** (`unresolved-source`) sem abortar o commit; ledger não-vazio (🟢/🟡/🔴 todos presentes); relatório sem a nota de "zeros honestos"; 6 artefatos (`sipoc`,`value-chain`,`hierarchy`,`flow`,`pop`,`summary-report`); `resume` sem duplicação nem órfãos.
- **T5 — critério implícito:** suite **173 pass / 0 fail** (161 regressão 1.1–1.5 + 12 novos: 11 `specialists` + 1 `e2e-pipeline`); `npm run typecheck` (`tsc --noEmit`) limpo; `tests/import-boundary.test.ts` (AD-3) 4/4 verde; `git status toolkit/src/` limpo (nenhum arquivo novo no core); `tests/e2e-conductor.test.ts` (regressão 1.5 — loop sem especialistas → zeros honestos) 2/2 verde. E2E real da pipeline via dispatcher passando.
- **Decisões realizadas (registradas):** (1) Especialistas como **skills separadas** + `installSkills` generalizado (alternativa "seções do condutor" rejeitada — contradiz o Structural Seed); (2) `flow` ≠ `bpmn` (AD-6 → 2.3); (3) Bento só 🟡/🔴 (entrevista não é artefato commitado — primeiro 🟢 é do Miguel); (4) roteiro inline (method-pack → Epic 3); (5) `--agent` por especialista **deferido** (NFR-5 básico já satisfeito: provenance por commit/artifactType).
- **Fronteiras respeitadas (zero scope creep):** BPMN 2.0 XML/gargalos → 2.3; diagnóstico → 2.4; entrevista via method-pack/SIPOC completo → 2.1; excerpt + rastreabilidade bidirecional + relatório consolidado → 2.5; gates ricos → 2.6; method-packs/schema-núcleo → Epic 3.

### File List

- `skills/process-ai-bento/SKILL.md` — **NEW** (T1): Descobridor → `sipoc` + `value-chain` (claims 🟡/🔴).
- `skills/process-ai-miguel/SKILL.md` — **NEW** (T1): Mapeador → `hierarchy` (🟢 sourcing `value-chain`).
- `skills/process-ai-julia/SKILL.md` — **NEW** (T1): Modeladora → `flow` (🟢 sourcing `hierarchy`; não BPMN XML).
- `skills/process-ai-zanoni/SKILL.md` — **NEW** (T1): Padronizador → `pop` (🟢 sourcing `flow`).
- `skills/process-ai/SKILL.md` — **MODIFIED** (T3): §3 handoff real + threading de `sha256` para provenance; tabela com `artifactType`s. Frontmatter/Gate0/gates/CLI/summary-report/AD-1 preservados.
- `toolkit/adapters/claude-code/adapter.ts` — **MODIFIED** (T2): `installSkills` generalizado para instalar todas as skills `process-ai*` byte-a-byte; fatorado em `discoverSourceSkills` + `installOneSkill` (defesas 1.1 preservadas). Fora do core (AD-3 verde).
- `tests/specialists.test.ts` — **NEW** (T4): 11 testes (conteúdo das 4 skills + instalação byte-a-byte das 5 + ignore de dir sem SKILL.md).
- `tests/e2e-pipeline.test.ts` — **NEW** (T4): 1 E2E da pipeline com rascunhos + claims + provenance cruzada + degradação + resume sem duplicação.

## Change Log

- **2026-08-01** — Story 1.6 criada (create-story): 4 skills de especialista (Bento→Miguel→Júlia→Zanoni) produzem rascunhos mínimos (`sipoc`/`value-chain`/`hierarchy`/`flow`/`pop`) via `propose` com claims, populando o ledger de confiança e exercitando a cadeia de provenance cross-artefato (mecanismo AD-5 da 1.4, 1ª vez com claims reais). Habilitantes: (1) generalizar `installSkills` p/ instalar as 5 skills `process-ai*` (condutor + especialistas — único change no adapter, fora do core); (2) atualizar o handoff do condutor com threading de sha256. Fronteiras: BPMN 2.0 XML → 2.3 (AD-6); entrevista via method-pack / SIPOC completo → 2.1; excerpt + rastreabilidade bidirecional + relatório consolidado → 2.5; gates ricos → 2.6; diagnóstico/gargalos → 2.3/2.4; method-packs/schema-núcleo → Epic 3. Builda sobre 1.1–1.5 sem reescrever o toolkit; zero regressões esperadas (161 testes + novos). **Fecha o Epic 1** (Walking Skeleton).
- **2026-08-01** — Story 1.6 implementada (status → review). Entregues: 4 skills de especialista (`skills/process-ai-{bento,miguel,julia,zanoni}/SKILL.md` — T1); `installSkills` generalizado no `toolkit/adapters/claude-code/adapter.ts` p/ instalar as 5 skills `process-ai*` byte-a-byte (T2, fora do core); condutor `skills/process-ai/SKILL.md` §3 com handoff real + threading de `sha256` (T3); `tests/specialists.test.ts` (11) + `tests/e2e-pipeline.test.ts` (1 E2E) (T4). **Suite: 173 pass / 0 fail** (161 regressão 1.1–1.5 + 12 novos); `tsc --noEmit` limpo; AD-3 `import-boundary` verde; `toolkit/src/` intocado (nenhum arquivo novo no core). E2E real da pipeline via dispatcher passando: cadeia de provenance ponta-a-ponta (Bento🟡/🔴 → Miguel🟢 sourcing value-chain → Júlia🟢 → Zanoni🟢), degradação 🟡 (unresolved-source) confirmada, ledger não-vazio, resume sem duplicação. Zero arquivos de regressão modificados por esta story.
- **2026-08-01** — Code review (glm-5.2, 3 camadas: Blind Hunter + Edge Case Hunter + Acceptance Auditor). **Acceptance Auditor PASS** (AC1–AC6 + AD-1/AD-3/AD-5/AD-6, sem scope creep). 3 patches aplicados: (1) loop multi-skill resiliente — condutor fail-fast + especialistas best-effort (sem estado parcial silencioso); (2) `discoverSourceSkills` exportada e testável — pula entrada arquivo (ENOTDIR), rejeita source symlink (lstat), + teste real com fixture (ghost/arquivo/symlink/não-matching); (3) `deferred-work.md` com o defer do `--agent`. 1 item defer (pré-existente 1.3: `checkpoint.artifacts[]` sem dedup em re-propose) + 8 dismissed. **Suite pós-patches: 174 pass / 0 fail**; `tsc --noEmit` limpo; AD-3 verde. Status → done.
