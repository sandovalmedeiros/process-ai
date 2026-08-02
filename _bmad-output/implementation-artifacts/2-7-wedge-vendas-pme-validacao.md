---
baseline_commit: 181eaff
---

# Story 2.7: Wedge Vendas/PME — validar a pipeline ponta-a-ponta

Status: review

## Story

As a **dev**,
I want **rodar e validar a pipeline completa no cenário realista de Vendas (lead→fechamento), medindo a completude dos artefatos (SM-1), a precisão das 🟢 via spot-check (SM-2 ≥85%) e o envelope de tempo (NFR-7 ≤30 turnos)**,
so that **eu prove que o wedge entrega valor real — um leigo completa o ciclo zero→cadeia→BPMN→POP sozinho, com artefatos usáveis e confiança honesta — e tenha dados de calibração para guiar o Epic 3**.

## Acceptance Criteria

1. **[AC1] Pipeline ponta-a-ponta completa no cenário Vendas (SM-1)** — **Given** um cenário realista de Vendas (lead→fechamento) injetado via E2E determinístico (sem LLM — o teste simula o que cada especialista produziria), **When** a pipeline roda Gate 0 → Bento → Miguel → Júlia → Zanoni → encerramento, **Then**:
   - **7 artefatos commitados** (`discovery-interview`, `sipoc`, `value-chain`, `hierarchy`, `flow`, `pop`, `summary-report`) — consistente com o critério implícito da 1.6/2.1–2.6.
   - **5 gates registrados** (gate-0 a gate-4) com decisão `approved`.
   - **Resume sem duplicação** (mesmo estado após re-run do resume — artefatos e gates idênticos).
   - **0 órfãos** em quarentena após resume.
   - O E2E existente (`tests/e2e-pipeline.test.ts`) **já cobre** o fluxo com 7 artefatos + claims + resume. 2.7 **estende** o cenário para usar dados com **perfil realista de Vendas/PME** (nomes de etapas, fornecedores, clientes, gargalos típicos de vendas) em vez de dados genéricos.

2. **[AC2] Calibração de 🟢 — spot-check ≥85% (SM-2)** — **Given** os claims 🟢 commitados no cenário Vendas, **When** um revisor (humano ou script de validação) faz spot-check, **Then**:
   - **≥85% dos 🟢 são confirmados** como corretamente atribuídos (a fonte realmente sustenta a afirmação; o excerpt, quando presente, confere com a fonte).
   - **0 falsos 🟢** (claim marcado 🟢 cuja fonte NÃO sustenta a afirmação) — o toolkit não pode garantir isso sozinho (AD-5 é mecânico, não semântico), mas o spot-check **mede** a taxa real.
   - O teste de calibração é **automatizado**: script lê o ledger → para cada 🟢 com `source.excerpt`, verifica que o excerpt casa com o artefato-fonte (substring match — o toolkit 2.5 já faz isso na validação; o spot-check é uma **segunda verificação independente** no conteúdo commitado).
   > **Decisão:** o spot-check automatizado verifica **consistência interna** (excerpt→fonte bate; fonte→manifesto existe; claim→source é rastreável), não **verdade semântica** (se a afirmação é factualmente correta). A verdade semântica requer julgamento humano. O teste mede o que é mensurável deterministicamente; o ≥85% é sobre o **subconjunto verificável mecanicamente**.

3. **[AC3] Envelope de tempo (NFR-7 provisório)** — **Given** o cenário Vendas, **When** a pipeline roda, **Then**:
   - O número de **turnos simulados** (1 comando CLI = 1 turno) é ≤30 (provisório — calibração real virá do uso com LLM).
   - O tempo de execução do teste E2E determinístico é **sub-segundo** (não é o mesmo que 60–90min com LLM — o teste mede o **overhead determinístico**, não a latência do modelo).
   > **Nota:** NFR-7 real (≈60–90 min com LLM) só é mensurável em sessão real com Claude Code. O teste cobre o **contador de turnos** (≤30 comandos CLI) como proxy estrutural. A medição real será feita no piloto (fora do escopo de teste automatizado).

4. **[AC4] Cenário Vendas realista (não genérico)** — **Given** o fixture de teste Vendas, **Then**:
   - **Entrevista (discovery-interview):** perguntas e respostas sobre processo de Vendas (prospecção → qualificação → proposta → negociação → fechamento).
   - **SIPOC:** fornecedores reais (ex.: time de marketing, CRM), entradas (leads), saídas (propostas, contratos), clientes (PMEs).
   - **Cadeia de valor:** elos típicos de Vendas (prospecção, qualificação, negociação, fechamento, pós-venda).
   - **Hierarquia:** Macro (Vendas) → E2E (Lead-to-Cash) → Subprocessos (Prospecção, Qualificação, Negociação, Fechamento) → Atividades → Tarefas.
   - **BPMN:** fluxo com gateways (cliente aceita/recusa proposta), lanes (vendedor, cliente), eventos.
   - **POPs:** procedimento de qualificação de lead, procedimento de follow-up pós-proposta.
   - **Gargalos:** exemplos reais (ex.: tempo médio de follow-up > 48h; taxa de conversão de proposta < 30%).
   - **Claims 🟢:** sourceiam artefatos upstream (entrevista → SIPOC, value-chain → hierarchy, hierarchy → flow, flow → pop) com **excerpts verificáveis** que casam com o conteúdo canônico.

5. **[AC5] Regressão zero — 208 testes herdados intactos** — **Given** as mudanças em 2.7 (fixtures de teste + cenário estendido), **Then**:
   - `node --test tests/*.test.ts` → 100% pass (208 herdados + novos de calibração).
   - `npm run typecheck` limpo.
   - AD-3 verde.
   - Nenhum arquivo em `toolkit/src/` ou `bin/` modificado (test-fixture only).

> **Critério implícito (não-negociável):** a história encerra o Épico 2 com o sistema validado ponta-a-ponta no wedge Vendas. O E2E pipeline test é o **mesmo** teste que já roda desde 1.6 — 2.7 o **estende com dados realistas e verificações de calibração**, sem reescrever o fluxo. O teste permanece **determinístico e sem LLM** (acionável em CI). O Épico 2 fecha com 7 artefatos, 5 gates, confiança honesta (🟢🟡🔴), rastreabilidade bidirecional, relatório consolidado rico, gates informativos, resumo final acionável — **tudo validado no cenário Vendas/PME**.

## Tasks / Subtasks

- [x] **T1 — Fixture de cenário Vendas/PME realista (AC: #4)**
  - [x] **CREATE `tests/fixtures/vendas-wedge.ts`** (ou embutir no próprio `e2e-pipeline.test.ts`): fixture de dados com:
    - **Entrevista Q&A** (5-8 perguntas realistas sobre Vendas PME com respostas simuladas).
    - **SIPOC completo** (fornecedores reais: marketing/CRM, entradas: leads/MQLs, processo: prospectar→qualificar→propor→negociar→fechar, saídas: propostas/contratos, clientes: PMEs B2B).
    - **Cadeia de valor** (5 elos: Prospecção, Qualificação, Negociação, Fechamento, Pós-venda).
    - **Hierarquia** (Macro→E2E→Subprocesso×4→Atividade×3 cada→Tarefa×2 cada, com IDs estáveis `M1.E1.S1.A1.T1`).
    - **BPMN 2.0 XML** (fluxo com start→tasks→gateways→end, lanes vendedor+cliente).
    - **POPs** (2 procedimentos: qualificação de lead, follow-up pós-proposta — cada um referenciando IDs da hierarquia).
    - **Diagnóstico** (2-3 gargalos com evidência, 1-2 gaps, recomendações).
    - **Claims por artefato** com 🟢🟡🔴 + `source` cross-artifact (entrevista → SIPOC, value-chain → hierarchy, hierarchy → flow, flow → pop) com **excerpts reais** que casam com o conteúdo.
  - [x] **Garantir:** os excerpts nos 🟢 são substrings reais do conteúdo dos artefatos-fonte (para que a verificação de excerpt do 2.5 passe — AC1 excerpt-mismatch não dispara nos 🟢 legítimos).
  - [x] **Garantir:** pelo menos 1 🟡 (inferido, sem fonte) e 1 🔴 (gap) por estágio para testar o gate informativo (2.6) e o relatório rico (2.5).

- [x] **T2 — Estender E2E pipeline test com cenário Vendas (AC: #1)**
  - [x] **UPDATE `tests/e2e-pipeline.test.ts`:** refatorar o teste existente para usar o fixture Vendas em vez dos dados genéricos atuais. O fluxo (resume→Gate 0→Bento→Miguel→Júlia→Zanoni→report→summary-report→resume) é o **mesmo**; o que muda é o **conteúdo** dos payloads (agora realista).
  - [x] **Verificar:** após o commit de cada artefato, o ledger contém as entradas esperadas com `statement`, `reasoning`, `source` (AC4 da 2.5).
  - [x] **Verificar:** `process-ai report` gera markdown rico com breakdown por artifactType, itemsByLevel, reverse-index, excerpt-status, órfãos (AC1-3 da 2.5).
  - [x] **Verificar:** contagem total = soma dos claims do fixture; 🟢 com excerpt verificável têm `excerptStatus: verified` no relatório; 🟡 têm degradationReason; 🔴 sem source.
  - [x] **Preservar:** o teste de resume-sem-duplicação (última parte do E2E existente — artefatos e gates idênticos após re-run).

- [x] **T3 — Script de calibração automatizado (AC: #2)**
  - [x] **CREATE `tests/calibration.test.ts`** (ou adicionar ao `e2e-pipeline.test.ts`): após rodar a pipeline Vendas:
    - Lê o ledger (`confidence-ledger.jsonl`) e para cada 🟢:
      - Verifica que `source` referencia manifesto existente.
      - Se `source.excerpt` presente: lê o artefato-fonte (manifesto → artifactPath → fs.readFile) e confirma substring match (segunda verificação independente do `verifyExcerpt` do confidence.ts).
      - Contabiliza: total 🟢, 🟢 com excerpt verificado, 🟢 sem excerpt (no-excerpt), 🟢 com fonte faltante (source-missing).
    - **Assert:** `verified / (verified + mismatched) ≥ 0.85` (≥85% dos 🟢 com excerpt são confirmados na segunda verificação).
    - **Assert:** 0 `mismatched` (se o teste roda sobre dados recém-commitados, o `verifyExcerpt` do commit já garantiu — a segunda verificação deve ser 100% concordante).
  - [x] **Nota:** a calibração real (SM-2) requer julgamento humano de verdade semântica. Este teste cobre a **consistência mecânica** (excerpt→fonte, fonte→manifesto). O ≥85% é um **piso estrutural** — se <85% dos 🟢 passam na verificação mecânica, há bug no toolkit. O spot-check humano (fora do escopo de teste) mede a **precisão semântica**.

- [x] **T4 — Contador de turnos (AC: #3, NFR-7)**
  - [x] **ADD ao `e2e-pipeline.test.ts`:** contador de comandos CLI executados durante a pipeline (1 comando = 1 linha do dispatcher). Assert: ≤30 turnos.
  - [x] **Documentar** que o contador de turnos é um **proxy estrutural** — a medição real (≈60–90 min com LLM) depende de latência do modelo e interação humana, não cobertas por teste determinístico.

- [x] **T5 — Regressão total (AC: #5)**
  - [x] `node --test tests/*.test.ts` → 100% pass (208 herdados + novos de calibração).
  - [x] `npm run typecheck` limpo.
  - [x] AD-3 verde (nenhum core/bin modificado — fixtures e testes apenas).
  - [x] Testes de calibração passam com o fixture Vendas (≥85% 🟢 verificados).

## Dev Notes

### O que esta história É (e o que NÃO é)

Esta é a **story de fechamento do Épico 2** — ela **valida** o que foi construído, **não constrói** coisas novas. O sistema já está completo (2.1–2.6). 2.7 **prova** que funciona no cenário-alvo (Vendas/PME).

**O que 2.7 USA (não reconstrói):**
- Pipeline E2E determinística (`tests/e2e-pipeline.test.ts` — desde 1.6)
- Relatório de confiança consolidado (`report.ts` — 2.5)
- Gates informativos (`SKILL.md` §3 — 2.6)
- Resumo final rico (`SKILL.md` §4 — 2.6)
- Excerpt verification (`confidence.ts` `verifyExcerpt` — 2.5)
- Reverse-index / rastreabilidade (`report.ts` `scanLedger` — 2.5)

### Escopo — tabela anti-scope-creep

| Pertence a esta story (2.7) | NÃO pertence — NÃO faça |
|---|---|
| Fixture Vendas/PME realista (dados de teste) | **Nova feature** no toolkit, CLI, ou skills |
| Estender E2E pipeline test com dados realistas | **Teste com LLM real** (fora do escopo de CI) |
| Script de calibração mecânica (consistência interna) | **Avaliação semântica** automatizada (requer LLM) |
| Contador de turnos (proxy estrutural) | **Medição real de tempo** (≈60–90 min) |
| Documentar resultados de calibração | **Novo artifactType** para relatório de calibração |

### Paradigma e invariantes (zero mudança)

- **AD-1:** fixture de teste usa `dispatch(parseArgs(...), adapter, root)` — mesmo canal do runtime real, sem bypass.
- **AD-3:** zero mudanças em `toolkit/src/` ou `bin/` — fixtures e testes apenas.
- **AD-5:** calibração verifica consistência mecânica (excerpt→fonte), não verdade semântica.
- **NFR-1:** fixture inclui 🟡 e 🔴 intencionais (honestidade testada).
- **SM-C1:** 🟢 nunca inflado — o contador de calibração só conta o que o ledger registra.

### O teste que esta história modifica

- **`tests/e2e-pipeline.test.ts`** — Estado atual (1.6–2.4, ~350 linhas): pipeline completa com dados genéricos (suppliers: ['A', 'B'], steps genéricos). 7 artefatos + claims + resume. **Delta 2.7:** substituir dados genéricos pelo fixture Vendas realista; adicionar verificações de calibração; adicionar contador de turnos. **Preservar:** fluxo de teste (resume→Gate 0→especialistas→report→summary-report→resume), 7 artifactTypes, 5 gates, zero órfãos.

### Aprendizados das stories anteriores

- **2.5 (Confiança):** excerpt verification já garante consistência mecânica no commit — o spot-check de calibração é uma **segunda verificação independente** (leitura do ledger pós-commit).
- **2.6 (Gates):** o E2E test não exercita a skill layer (sem LLM) — os gates são testados via `dispatch` direto. A calibração do gate informativo (2.6 AC1) é validada pelo shape do SKILL.md (`tests/skill.test.ts`), não pelo E2E.
- **1.6 (Pipeline mínima):** o padrão de teste E2E determinístico (adapter real, tmpdir, dispatch) está consolidado desde 1.6 e é reusado intacto.

### Decisões de implementação

1. **Fixture no próprio arquivo de teste** (não em JSON separado). O fixture Vendas é código TypeScript — objetos `ProposePayload` — mantendo type-safety e evitando indireção de arquivo.
2. **Calibração mecânica (não semântica).** O teste de calibração verifica o que é deterministicamente verificável: excerpt→fonte bate, fonte→manifesto existe, claim→source é rastreável. A verdade semântica ("a afirmação é factualmente correta?") requer julgamento humano — fora do escopo de teste automatizado.
3. **Proxy de turnos (não tempo real).** O contador de comandos CLI é um proxy estrutural para NFR-7. A medição real (≈60–90 min com LLM) será feita no piloto com usuário real.
4. **Zero mudanças no core.** A story 2.7 é puramente testes + fixtures. AD-3 é preservado por definição.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.7] — AC literal ("completa o ciclo zero→cadeia→BPMN→POP sozinho"; "spot-check confirma ≥85% das 🟢"; "sessão dentro do envelope ≈60–90min/≤30 turnos").
- [Source: _bmad-output/planning-artifacts/prds/prd-process-ai-2026-08-01/prd.md#SM-1, SM-2, NFR-7] — SM-1 (wedge Vendas/PME, ciclo completo, artefatos usáveis); SM-2 (spot-check ≥85% 🟢); NFR-7 (≈60–90 min / ≤30 turnos).
- [Source: tests/e2e-pipeline.test.ts] — E2E pipeline existente (1.6, estendido até 2.4). Padrão, fluxo, e artifactTypes a preservar.
- [Source: tests/e2e-conductor.test.ts] — E2E condutor (1.5). Padrão de teste determinístico com dispatch.
- [Source: _bmad-output/implementation-artifacts/2-6-gates-completos-resumo-final.md] — Story 2.6 (predecessora imediata; última story de build antes da validação).
- [Source: toolkit/src/confidence.ts#verifyExcerpt] — Excerpt verification (2.5) — referência para o script de calibração (segunda verificação independente).

## Dev Agent Record

### Agent Model Used

Claude Code (deepseek-v4-pro)

### Debug Log References

N/A — execução limpa, sem halt.

### Completion Notes List

✅ **T1 (Fixture Vendas/PME):** Criado fixture completo de Vendas/PME embutido no `e2e-pipeline.test.ts`. Dados realistas de distribuidora B2B: entrevista com 7 perguntas, SIPOC com 5 suppliers/inputs/outputs/customers, cadeia de valor com 5 elos, hierarquia M1→E1.1→S1.1.1..S1.1.5 com 5 níveis + IDs estáveis, BPMN 2.0 XML com 12 elementos + 2 gateways, POP com 2 procedimentos + diagnóstico (2 gargalos, 2 gaps, 3 recomendações). Todos os 🟢 com excerpts reais que casam com o conteúdo das fontes. 1 🟡 + 1 🔴 por estágio.

✅ **T2 (E2E pipeline Vendas):** Teste `e2e-pipeline.test.ts` reescrito com cenário Vendas/PME. Fluxo preservado (resume→Gate 0→Bento→Miguel→Júlia→Zanoni→report→summary-report→resume). 7 artefatos, 5 gates, 0 órfãos. Verificações: ledger entries com statement/reasoning (2.5), provenance cruzada (interview→sipoc, value-chain→hierarchy, hierarchy→flow, flow→pop), degradação unresolved-source, report markdown rico.

✅ **T3 (Calibração automatizada):** Script de calibração inline no E2E: lê o ledger, para cada 🟢 com excerpt verifica independentemente que o excerpt é substring do artefato-fonte (segunda verificação pós-commit). Resultado: 100% excerpts verificados (0 mismatches). Assert: ≥85% (meta SM-2 batida com folga).

✅ **T4 (Contador de turnos):** Contador inline: 21 comandos CLI (≤30, NFR-7 proxy). 1 comando = 1 turno simulado.

✅ **T5 (Regressão total):** 208/208 testes passando, `tsc --noEmit` limpo, AD-3 verde. Nenhum arquivo `toolkit/src/` ou `bin/` modificado.

### File List

- `tests/e2e-pipeline.test.ts` — MODIFIED (reescrito com fixture Vendas/PME realista + calibração 🟢 ≥85% + contador de turnos ≤30; fluxo preservado)

## Change Log

- 2026-08-02: Implementação completa da story 2.7 — validação do wedge Vendas/PME ponta-a-ponta com fixture realista, calibração automatizada de 🟢 (100% verified, meta ≥85%), contador de turnos (21/30). Épico 2 fechado. 208/208 testes, typecheck limpo, AD-3 verde.
