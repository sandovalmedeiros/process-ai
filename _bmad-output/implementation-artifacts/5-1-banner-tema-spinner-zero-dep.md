# Story 5.1: Banner ciano + tema + spinner (zero-dep)

Status: done

> Implementado em `d4eb0e3` (feat(installer): banner ciano + tema + spinner — paridade Reversa, zero-dep).

## Story

As a usuário,
I want um banner ciano + tema de cores + spinner de progresso no instalador,
So that a primeira impressão do `npx process-ai` seja polida e acolhedora.

## Contexto

O instalador antes apresentava saída funcional mas sem identidade visual. Para atingir paridade de UX com o Reversa, a fundação visual é um banner ciano com tema de cores consistente e um spinner de progresso nas etapas longas (instalação de deps, cópia de skills/base-conhecimento). Tudo construído em zero-dep (`node:*`), respeitando AD-3 (core isolado do engine) e NFR-6 (portabilidade) — sem `chalk`/`ora`/`inquirer`.

**Fonte:** [Source: toolkit/src/installer/banner.ts — tema + helpers de cor]
[Source: docs/2605.18684v1_Reversa-pt-BR.md — framework de referência (CLI Node + skills multi-engine)]

## Acceptance Criteria

1. **Given** a execução do install interativo, **when** o instalador inicia, **then** um banner ciano é renderizado com tema de cores consistente.
2. **Given** etapas longas (deps, cópia), **when** executam, **then** um spinner indica progresso.
3. **Given** o módulo de banner/tema, **then** é zero-dep (`node:*`), sem dependências npm externas. *(AD-3, NFR-6)*

## Dev Agent Record

### Completion Notes List
- AC1: ✅ banner ciano + tema de cores (cyan/gray/etc.) centralizados em `banner.ts`
- AC2: ✅ spinner de progresso para etapas de instalação
- AC3: ✅ zero-dep — só `node:*`; nenhuma dependência npm adicionada

### File List
- toolkit/src/installer/banner.ts (NEW — tema + banner + spinner)
- toolkit/src/installer/orchestrator.ts (UPDATE — usa theme/banner)
