---
title: "Sprint Change Proposal — process-ai v1.1 Hardening"
status: approved
created: 2026-08-07
project: process-ai
trigger: conclusão dos 3 épicos do MVP + action items da retro do Épico 3
scope_classification: Minor
recommendation: Opção 1 — Ajuste Direto (novo Épico 4)
---

# Sprint Change Proposal: process-ai v1.1 Hardening

## 1. Issue Summary

**Problema:** O plano original do process-ai (3 épicos, MVP definido no PRD) foi concluído com sucesso — 259/259 testes, typecheck limpo, instalável via `npx process-ai`. Porém, a conclusão revela arestas que precisam ser fechadas antes de declarar o produto "robusto e auditável":

- **6 action items** da retro do Épico 3 continuam abertos, cobrindo: schema enforcement (decisão D1), smoke test de distribuição, self-check gate de processo, drift de documentação, claims validadas contra consumo, e triagem de dívida técnica
- **~50 itens [Low]** acumulados em `deferred-work.md` de 11 code reviews adversariais — reais, governados, mas não-endereçados
- **3 dimensões de readiness pendentes**: deploy/npm (publicação), aceitação de stakeholders (wedge Vendas/PME real), estabilidade (gut check)
- **AD-2 (schema enforcement) permanece deferido** — o validador é leniente enquanto a spec exige enforcement real

**Contexto:** A retro do Épico 3 (2026-08-03) formalizou a decisão de abrir um **Épico 4 (v1.1 hardening)** como próximo ciclo. Este documento ratifica essa decisão contra o PRD e a Arquitetura, e produz as stories para execução.

**Evidência:** `sprint-status.yaml` (3/3 épicos done, 6 action items open), `epic-3-retro-2026-08-03.md` (§8, §9, §12), `deferred-work.md` (~50 itens).

## 2. Impact Analysis

### 2.1 Epic Impact

| Épico | Impacto |
|-------|---------|
| Epic 1 (Walking Skeleton) | Nenhum — concluído, estável |
| Epic 2 (Documentação Completa) | Nenhum — concluído, estável |
| Epic 3 (Method-Agnostic + OSS) | Nenhum — concluído, estável |
| **Novo Epic 4 (Hardening v1.1)** | **Adicionado** — 7 stories de contenção e reforço |

Nenhum épico existente é modificado, reordenado ou removido.

### 2.2 Artifact Conflicts

| Artefato | Conflito? | Ação |
|----------|-----------|------|
| **PRD** | Não | O MVP (3 épicos, 9 features, FR-1..21) está satisfeito. O hardening é pós-MVP aditivo — reforça FR-14, FR-17, FR-20, NFR-1, NFR-5. |
| **Arquitetura (AD-1..7)** | Não | Nenhum AD é violado. A story 4.1 **fecha** AD-2 (schema enforcement que estava deferido). As demais stories reforçam AD-1 (propose/commit), AD-5 (confiança verificável), AD-7 (distribuição). |
| **SPEC** | Não | Sem alterações necessárias. |
| **UX** | N/A | v1 é CLI/agent-driven. |

### 2.3 Technical Impact

- **Toolkit (`toolkit/src/schema-core.ts`, `confidence.ts`, `report.ts`)**: schema enforcement (4.1) + claims validation (4.6) + deferred-work fixes (4.7)
- **Testes**: novo smoke de consumer-install (4.3) — CI job adicional
- **Docs (`docs/method-packs.md`, `docs/toolkit.md`)**: correção de drift (4.5)
- **Processo de dev**: self-check gate (4.2) — template/helper, não código do produto
- **CI**: smoke test integrado ao pipeline (4.3)
- **Bin/postinstall**: possível sweep de `.tmp-*` do deferred-work (4.7)

## 3. Recommended Approach

**Opção selecionada: Opção 1 — Ajuste Direto (criação de novo Épico 4).**

| Critério | Avaliação |
|----------|-----------|
| Esforço | **Médio** — story 4.1 (schema enforcement) é a pesada; 4.2/4.5 são rápidas; as demais são moderadas |
| Risco | **Baixo** — não mexe em features existentes; o enforcement de schema é precedido de auditoria de payloads (não quebra o que já funciona) |
| Timeline | ~3–5 ciclos de dev-story, assumindo 1 story por vez com code review adversarial |
| Momentum | Preservado — o produto continua funcionando enquanto o hardening avança |

**Justificativa:**
- O produto está funcional e instalável — não há o que reverter (Opção 2 descartada)
- O MVP do PRD está satisfeito — não há o que revisar (Opção 3 descartada)
- O hardening é o ciclo natural pós-MVP: fecha arestas antes de v2, features novas, ou publication no npm
- A retro do Épico 3 já fez o trabalho de qualificação dos itens
- Todas as mudanças são aditivas ou de reforço — nenhum FR é removido ou redefinido

## 4. Detailed Change Proposals

Todas as propostas abaixo foram revisadas e aprovadas incrementalmente (modo Incremental, 2026-08-07).

### 4.1 Epic 4: Definição (cabeçalho)

**Artefato:** `_bmad-output/planning-artifacts/epics.md`

Adicionar após a seção `## Epic 3: Method-Agnostic + Distribuição OSS`:

```markdown
## Epic 4: Hardening v1.1 — Confiabilidade e Integridade

As arestas identificadas nos 3 épicos do MVP são fechadas: documentação reflete o código, 
o schema-núcleo tem enforcement real (fecha AD-2), o pipeline de distribuição é coberto 
por smoke test, e a dívida técnica [Low] acumulada no deferred-work é triada e reduzida. 
O framework passa de "funcional e verificável" para "robusto e auditável".

**FRs cobertos:** reforça FR-14 (confiança), FR-17 (method-pack), FR-20 (não-destrutivo), 
NFR-1 (honestidade), NFR-5 (observabilidade). Fecha AD-2 (schema enforcement não-deferido).

**Dependências:** Épicos 1–3 concluídos.
```

### 4.2 Story 4.1: Schema-núcleo — enforcement estrito

**Origem:** AI-3 (Winston) + Decisão D1 da retro do Épico 3

```markdown
### Story 4.1: Schema-núcleo — enforcement estrito (fecha AD-2)

As a dev/contribuidor,
I want o schema-núcleo com validação real de shape (required, additionalProperties: false, rejeitar não-objetos),
So that method-packs sejam contidos pelo contrato e o AD-2 saia do papel.

**Acceptance Criteria:**
**Given** o validador v1 leniente (AC4 backward-compat)
**When** esta story implementa o endurecimento
**Then** (a) todos os payloads do E2E + fixtures de teste são auditados para conformidade ANTES de endurecer
**And** (b) `validateContent` rejeita não-objetos (string, número, array), ativa `required` por tipo, 
fecha `additionalProperties: false` nos 7 schemas, e rejeita objetos exóticos (Date, boxed String/Number)
**And** (c) headers/JSDoc de cada schema voltam a refletir o código (sem doc falsa)
**And** (d) 259+ testes continuam passando; typecheck limpo; AD-3 (não mexer no core além do schema-core) respeitado
```

### 4.3 Story 4.2: Self-check gate — ACs com evidência antes de done

**Origem:** AI-1 (Amelia) + Team Agreement 1

```markdown
### Story 4.2: Self-check gate — ACs com evidência antes de done

As a dev,
I want que toda story tenha um checklist de ACs verificadas + Dev Agent Record preenchido antes de `done`,
So that o review adversarial encontre problemas sutis, não incompletude básica.

**Acceptance Criteria:**
**Given** uma story em desenvolvimento
**When** o agente marca `done`
**Then** o Dev Agent Record está preenchido (sem `{{placeholder}}`) com: modelo, data, escopo, arquivos tocados
**And** cada AC da story tem checkbox + evidência (link a commit/arquivo/teste)
**And** items não cobertos são explicitamente marcados como deferidos com justificativa
**And** o template/story-helper (se existir) inclui esse checklist como seção obrigatória
```

### 4.4 Story 4.3: Smoke test de consumer-install

**Origem:** AI-2 (Amelia) + Team Agreement 2

```markdown
### Story 4.3: Smoke test de consumer-install no pipeline

As a dev,
I want um smoke test que simula `npm install` real em projeto consumidor limpo,
So that "testes verdes na raiz do repo" não deem falsa confiança sobre distribuição.

**Acceptance Criteria:**
**Given** o pacote buildado (`npm pack`)
**When** o smoke roda
**Then** `npm install <tarball>` em dir temporário limpo → `npx process-ai --help` funciona
**And** `/process-ai` slash-command é registrado no engine-alvo (Claude Code)
**And** o smoke é integrado ao CI (roda em todo commit que toca `package.json`/`bin`/`postinstall`)
**And** falha de registro ou bootstrap reporta erro claro (não `exit(0)` mascarado)
```

### 4.5 Story 4.4: Correção de drift de documentação

**Origem:** AI-5 (Paige) — item rápido da retro

```markdown
### Story 4.4: Documentação — drift zero (código ↔ docs)

As a contribuidor,
I want docs que reflitam o código real (paths, imports, contagens),
So that um novo contribuidor siga as instruções e chegue a resultado funcional.

**Acceptance Criteria:**
**Given** o código atual (ESM, 259 testes)
**When** a doc é conferida
**Then** `docs/method-packs.md` instrui `import` (não `require`) e não referencia paths `.ts` fora do repo
**And** `docs/toolkit.md` tem contagem de testes correta e atualizada
**And** um teste leve automatizado confere: contagem da doc vs contagem real (`package.json scripts` ou similar)
**And** headers/JSDoc de schema-core não afirmam enforcement que o código não cumpre (pré-4.1: remover claims falsas; pós-4.1: claims verdadeiras)
```

### 4.6 Story 4.5: Claims de contrato/doc validadas contra consumo

**Origem:** AI-6 (Winston + Paige)

```markdown
### Story 4.5: Claims de contrato/doc validadas contra consumo

As a dev/contribuidor,
I want que nenhuma header/JSDoc/claim afirme enforcement que o código não cumpre,
So that a intenção declarada e o comportamento real sejam indistinguíveis.

**Acceptance Criteria:**
**Given** o toolkit com schemas, validação e docs
**When** claims são conferidas contra consumo real
**Then** um teste no estilo `doesNotMatch(/pattern/)` (como `zanoni-pop.test.ts:257`) cobre
cada arquivo de schema-core, adapter, e doc que faça afirmação de enforcement
**And** claims falsas são removidas ou o código é corrigido para cumpri-las (nunca deixadas em desacordo)
**And** o teste é integrado à suite principal (roda em todo commit)
```

### 4.7 Story 4.6: Triagem e redução do deferred-work

**Origem:** AI-4 (Mary/Winston)

```markdown
### Story 4.6: Triagem do deferred-work — agrupar, priorizar, fechar lotes

As a dev,
I want o deferred-work triado por arquivo-gatilho e os lotes simples fechados,
So that o backlog de dívida diminua e o resto fique corretamente governado.

**Acceptance Criteria:**
**Given** os ~50 itens [Low] em `deferred-work.md`
**When** a triagem é concluída
**Then** itens são agrupados por arquivo-gatilho (ex.: 4 de `confidence.ts` = 1 lote; 3 de `report.ts` = 1 lote)
**And** lotes com custo/risco justificado são fechados (PRs com correções + testes)
**And** itens mantidos em aberto são reavaliados: severidade ainda é [Low]? gatilho ainda é válido?
**And** `deferred-work.md` é atualizado com status pós-triagem: fechados, reagrupados, reavaliados
```

### 4.8 Story 4.7: Readiness final — dimensões pendentes da retro

**Origem:** §11 da retro do Épico 3 (Readiness Assessment)

```markdown
### Story 4.7: Readiness final — fechar dimensões pendentes da retro

As a project lead / dev,
I want as 3 dimensões pendentes de readiness resolvidas ou explicitamente deferidas,
So que o v1.1 seja declarado completo com confiança.

**Acceptance Criteria:**
**Given** as dimensões pendentes do §11 da retro do Épico 3
**When** esta story conclui
**Then** (a) **Deploy/publicação npm**: decisão documentada (publicar agora vs aguardar X)
**And** (b) **Aceitação de stakeholders**: wedge Vendas/PME validado com ≥1 pessoa externa ou 
   explicitamente deferido com justificativa
**And** (c) **Estabilidade (gut)**: o Project Lead declara o v1.1 pronto — decisão documentada
**And** retros opcionais dos Épicos 1 e 2 são consideradas (rodar ou declarar `N/A` com justificativa)
```

## 5. Implementation Handoff

### 5.1 Change Scope: **Minor**

Todas as mudanças são aditivas e de reforço. Nenhuma feature existente é alterada. O desenvolvedor (Amelia) pode implementar diretamente.

### 5.2 Handoff Recipients

| Papel | Responsabilidade |
|-------|-----------------|
| **Amelia (Developer)** | Implementar stories 4.1–4.7 na ordem definida |
| **Winston (Architect)** | Revisar 4.1 (schema enforcement) — é a story que fecha AD-2 |
| **Paige (Tech Writer)** | Revisar 4.4 (docs) e 4.5 (claims) |
| **Mary (Business Analyst)** | Triagem inicial do deferred-work (4.6) |
| **Sandoval (Project Lead)** | Decisões da 4.7 (readiness: publicar? validar wedge? retros?) |

### 5.3 Sequencing

Ordem recomendada de execução:

```
4.2 (self-check gate) → 4.4 (docs drift) → 4.1 (schema enforcement) → 4.5 (claims) → 4.3 (smoke) → 4.6 (deferred-work) → 4.7 (readiness)
```

**Raciocínio:**
- **4.2 primeiro**: estabelece o hábito de ACs com evidência antes das stories pesadas
- **4.4 rápido**: drift de docs é correção pontual; tira do caminho
- **4.1 + 4.5 em sequência**: schema enforcement (4.1) pode gerar novas claims; 4.5 as valida
- **4.3 depois de 4.1**: smoke test é mais valioso com schema estrito (pega regressão)
- **4.6 em paralelo possível**: triagem não bloqueia as outras; pode rodar em background
- **4.7 por último**: depende de todas as anteriores para declarar readiness

### 5.4 Success Criteria

- [ ] 7/7 stories `done` com ACs verificadas
- [ ] Code review adversarial em cada story (3 camadas)
- [ ] Testes ≥ 259 (sem regressão)
- [ ] Smoke de consumer-install verde no CI
- [ ] `deferred-work.md` atualizado com triagem concluída
- [ ] AD-2 fechado — validador rejeita, não adverte
- [ ] Docs sem drift (teste automatizado)

### 5.5 Next Steps

1. **Este documento** → aprovado, seguir para `bmad-create-epics-and-stories` com o conteúdo das stories 4.1–4.7
2. **`bmad-sprint-planning`** → formalizar o plano de execução do Épico 4
3. **`bmad-create-story`** → iniciar pela 4.2 (self-check gate)
4. **(Opcional)** Corrigir drift de docs (4.4) pode ser executado como quick-fix antes do planejamento formal

---

*Proposta gerada em 2026-08-07 via `bmad-correct-course`. Modo: Incremental. 7/7 propostas aprovadas.*
