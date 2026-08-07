# Story 4.4: Documentação — drift zero (código ↔ docs)

baseline_commit: 80c5387864b61670f128eee287fa24676e4db8cc
Status: review

## Story

As a contribuidor,
I want docs que reflitam o código real (paths, imports, contagens),
so that um novo contribuidor siga as instruções e chegue a resultado funcional.

## Contexto

A retro do Épico 3 identificou dois drifts documentados:

1. **`docs/method-packs.md`**: instruía `require('./toolkit/src/pack-loader.ts')` — quebrado em projeto ESM (`require` indisponível) e path `.ts` não resolve fora do repo. A doc já foi parcialmente corrigida (usa `import()` em vez de `require()`), mas o path `./toolkit/src/pack-loader.ts` ainda referencia fonte TypeScript — consumidores não têm `tsx`/`ts-node` garantido e o arquivo `.ts` não existe em projetos que instalaram via npm.

2. **`docs/toolkit.md`**: linha 59 diz "Vocabulário fechado em **7 tipos** no v1", mas `SCHEMAS` em `toolkit/src/schema-core.ts` define **9 artifactTypes** canônicos (discovery-interview, sipoc, value-chain, hierarchy, flow, pop, summary-report, process-report, reference-material).

**Fonte:** [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-08-03.md §3 (Story 3.5), §5, §9 (AI-5)]

## Acceptance Criteria

1. **Given** o código atual (ESM, 9 artifact types), **when** `docs/method-packs.md` é conferida, **then** a doc não instrui `require()` nem referencia paths `.ts` que não existem fora do repo — usa `import()` com caminho relativo ao pacote instalado ou `npx process-ai`.
2. **Given** `SCHEMAS` com 9 artifactTypes, **when** `docs/toolkit.md` é conferida, **then** a contagem de tipos de artefato está correta (9, não 7).
3. **Given** docs atualizadas, **when** um teste leve automatizado roda, **then** confere que: (a) contagem de artifactTypes na doc bate com `VALID_ARTIFACT_TYPES.length` real; (b) docs não contêm `require(` (projeto ESM).
4. **Given** headers/JSDoc de schema-core, **when** a doc é conferida, **then** claims de doc não afirmam enforcement que o código não cumpre (ex.: se `additionalProperties: true` no v1, a doc não diz `additionalProperties: false`).

## Tasks / Subtasks

- [x] Task 1: Corrigir `docs/method-packs.md` (AC: 1)
  - [x] 1.1 Substituir o comando de validação com path `.ts` por instrução usando `npx process-ai` ou path relativo ao pacote npm
  - [x] 1.2 Verificar que não há outras referências a paths `.ts` ou `require()` no arquivo

- [x] Task 2: Corrigir `docs/toolkit.md` (AC: 2)
  - [x] 2.1 Atualizar "7 tipos" → "9 tipos" na linha 59
  - [x] 2.2 Atualizar a lista de artifactTypes para refletir os 9 tipos reais

- [x] Task 3: Criar teste automatizado de drift (AC: 3)
  - [x] 3.1 Adicionar teste em `tests/docs.test.ts` que lê `VALID_ARTIFACT_TYPES.length` do toolkit e confere contra a contagem declarada em `docs/toolkit.md`
  - [x] 3.2 Adicionar check de que docs não contêm `require(` (projeto é ESM)
  - [x] 3.3 Integrar à suíte principal (`npm test`)

- [x] Task 4: Verificar claims de schema-core contra docs (AC: 4)
  - [x] 4.1 Auditar `docs/toolkit.md` e `docs/method-packs.md` por claims de enforcement que não batem com o código atual
  - [x] 4.2 Corrigir ou remover discrepâncias encontradas

## Dev Notes

### Arquivos a Tocar

| Arquivo | Ação | Cuidado |
|---------|------|---------|
| `docs/method-packs.md` | **UPDATE** — corrigir path `.ts`, garantir ESM-only | Preservar estrutura e conteúdo correto |
| `docs/toolkit.md` | **UPDATE** — corrigir contagem 7→9, atualizar lista de tipos | Preservar seções de invariantes e módulos |
| `tests/docs.test.ts` | **NEW** — teste automatizado de drift | Seguir padrão dos testes existentes (node:test, sem dependências externas) |

### O que NÃO fazer

- **NÃO** modificar `toolkit/src/**` — esta story é só documentação + teste
- **NÃO** reescrever docs do zero — são correções pontuais
- **NÃO** adicionar dependências novas ao projeto (AD-3)

### Referências

- [Source: toolkit/src/schema-core.ts:215-225 — SCHEMAS com 9 artifactTypes]
- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-08-03.md §3 (Story 3.5), §9 (AI-5)]
- [Source: docs/method-packs.md:78-84 — comando de validação]
- [Source: docs/toolkit.md:59 — "Vocabulário fechado em 7 tipos"]

## Dev Agent Record

### Agent Model Used
deepseek-v4-pro (2026-08-07)

### Debug Log References
- Baseline commit: 80c5387

### Completion Notes List
- AC1: ✅ method-packs.md — path `.ts` substituído por `dist/pack-loader.js`; nota sobre validação automática adicionada
- AC2: ✅ toolkit.md — "7 tipos" → "9 tipos"; lista completa com os 9 artifactTypes
- AC3: ✅ tests/docs.test.ts — 4 testes novos (contagem, lista, require() em 2 docs)
- AC4: ✅ docs auditadas — sem claims falsas de enforcement encontradas

### File List
- docs/method-packs.md (UPDATE — corrigir path .ts e comando de validação)
- docs/toolkit.md (UPDATE — 7→9 tipos, lista completa)
- tests/docs.test.ts (NEW — 4 testes de drift de documentação)
