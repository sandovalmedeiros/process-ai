# Story 5.2: Perguntas no formato Reversa + contagem real (12 agentes)

Status: done

> Implementado em `9c168fd` (fix(installer): perguntas no formato Reversa + contagem real (12 agentes)).

## Story

As a usuário,
I want que o instalador faça perguntas no formato do Reversa com a contagem real de agentes,
So that as escolhas reflitam exatamente o time instalado, sem números genéricos.

## Contexto

As perguntas do install interativo precisavam seguir o formato do Reversa (nome do projeto, como te chamar, idiomas de chat/doc, estratégia git, seleção de engines) e a contagem de agentes exibida ao usuário precisava ser a real (12 agentes — o time Déa + especialistas + Laura), não um placeholder genérico. Isso dá honestidade ao onboarding: o número mostrado corresponde ao time que será efetivamente instalado.

**Fonte:** [Source: toolkit/src/installer/prompts.ts — roteiro de perguntas]
[Source: docs/2605.18684v1_Reversa-pt-BR.md — formato do roteiro interativo]

## Acceptance Criteria

1. **Given** o install interativo, **when** as perguntas são apresentadas, **then** seguem o formato do Reversa (nome do projeto, como te chamar, idiomas, estratégia git, engines).
2. **Given** a exibição do time, **then** a contagem de agentes é real (12 agentes), não um placeholder. *(FR-21)*

## Dev Agent Record

### Completion Notes List
- AC1: ✅ perguntas seguem o formato Reversa (projeto, como chamar, idiomas, git, engines)
- AC2: ✅ contagem real de 12 agentes exibida

### File List
- toolkit/src/installer/prompts.ts (UPDATE — roteiro no formato Reversa + contagem real)
- tests/installer-prompts.test.ts (UPDATE — testes do roteiro)
