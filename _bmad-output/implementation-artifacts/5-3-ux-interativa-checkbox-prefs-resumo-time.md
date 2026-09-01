# Story 5.3: UX interativa completa — checkbox raw-mode, prefs em config.user, resumo por time

Status: done

> Implementado em `38dde37` (feat(installer): UX interativa completa paridade Reversa — checkbox raw-mode, prefs em config.user, resumo por time).

## Story

As a usuário,
I want a UX interativa completa (checkbox raw-mode de engines, preferências gravadas em `config.user`, resumo por time),
So that eu configure a instalação inteira numa única passada guiada.

## Contexto

Fecha o arco da UX interativa: o checkbox de seleção de engines roda em raw-mode (sem dependência de `inquirer`), as preferências coletadas (nome do projeto, como te chamar, idiomas, estratégia git) são persistidas em `config.user` no topo do install (antes do early-return "already-current"), e um resumo por time é exibido ao final. Tudo alinhado a AD-3 (hexagonal, via porta `IdeSetup`) e FR-21 (multi-engine).

**Fonte:** [Source: toolkit/src/installer/interact.ts — checkbox raw-mode]
[Source: toolkit/src/install.ts — mergeConfigUser (prefs → config.user)]
[Source: toolkit/src/installer/orchestrator.ts — prefs + resumo por time]

## Acceptance Criteria

1. **Given** o install interativo, **when** completo as perguntas, **then** o checkbox raw-mode permite selecionar engines sem dependência de `inquirer`.
2. **Given** as respostas, **then** as preferências (nome, como chamar, idiomas, git) são persistidas em `config.user` no topo do install. *(AD-3)*
3. **Given** o fim do install, **then** um resumo por time é exibido. *(FR-21)*

## Dev Agent Record

### Completion Notes List
- AC1: ✅ checkbox raw-mode zero-dep (interact.ts) — paridade inquirer sem dependência
- AC2: ✅ prefs persistidas em `config.user` (mergeConfigUser) no topo do install
- AC3: ✅ resumo por time ao final

### File List
- toolkit/src/installer/interact.ts (NEW — checkbox raw-mode zero-dep)
- toolkit/src/install.ts (UPDATE — InstallPrefs + mergeConfigUser)
- toolkit/src/installer/orchestrator.ts (UPDATE — prefs + resumo por time)
- bin/process-ai.ts (UPDATE — runInteractive coleta prefs)
- tests/installer-interact.test.ts (NEW)
- tests/installer-prefs.test.ts (NEW)
- tests/installer-prompts.test.ts (UPDATE)
