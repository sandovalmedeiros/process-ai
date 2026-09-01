# Story 5.4: Engines persistidas + checkbox com wrap e validação visível

Status: done

> Revisão de código concluída (3 camadas: Blind Hunter + Edge Case Hunter + Acceptance Auditor).
> Todos os achados resolvidos — fixes aplicados no working tree (ainda não commitado).
> 475 testes passam, typecheck limpo.

## Story

As a usuário,
I want todas as engines como escolhas iguais (sem gating "(em breve)") com Claude Code como padrão, e um checkbox que navega com wrap e mostra validação no enter vazio,
So that eu escolha livremente quais engines registrar, com paridade com o inquirer do Reversa.

## Contexto

Refinamento da UX interativa para paridade total com o inquirer do Reversa:
- as engines deixam de ter o rótulo "(em breve)" — todas são marcáveis como escolhas iguais, com **Claude Code pré-marcado** como padrão (única com adapter hoje);
- o checkbox navega por TODOS os itens com **wrap** (inquirer loop); engines sem adapter são marcáveis, e a nota pós-checkbox deixa claro que ficam "no config.user" até o adapter chegar (honestidade);
- engines marcadas são persistidas em `config.user` como CSV (novo campo `engines` no `InstallPrefs`);
- enter com zero marcadas exibe **validação visível** ("⚠ Selecione ao menos uma") em vez de silêncio.

**Fonte:** [Source: toolkit/src/installer/interact.ts — navegação com wrap + validação]
[Source: toolkit/src/install.ts — InstallPrefs.engines (array → CSV)]
[Source: toolkit/src/installer/prompts.ts — labels sem "(em breve)", Claude Code padrão]
[Source: tests/installer-interact.test.ts — wrap/validação]

## Acceptance Criteria

1. **Given** o checkbox de engines, **when** navego e seleciono, **then** a navegação percorre TODOS os itens com wrap (inquirer loop); todas as engines são marcáveis, sem gating "(em breve)".
2. **Given** a seleção, **then** `engines` é persistido em `config.user` como CSV (todas as selecionadas); Claude Code é a padrão (pré-marcada).
3. **Given** enter com zero marcadas, **then** exibe validação visível em vez de silêncio. *(AD-3, FR-21)*

## Dev Agent Record

### Completion Notes List
- AC1: ✅ navegação com wrap implementada (interact.ts); todas as engines marcáveis, sem "(em breve)"
- AC2: ✅ `engines` em `InstallPrefs` (array → CSV) + `mergeConfigUser` + `bin/process-ai.ts` (answers.engines)
- AC3: ✅ validação visível no enter vazio

### File List (diff não commitado)
- toolkit/src/installer/interact.ts (UPDATE — wrap + validação)
- toolkit/src/install.ts (UPDATE — InstallPrefs.engines array→CSV)
- toolkit/src/installer/orchestrator.ts (UPDATE — engines)
- toolkit/src/installer/prompts.ts (UPDATE — labels sem "(em breve)", Claude Code padrão)
- toolkit/src/installer/engines.ts (UPDATE — header sem "(em breve)")
- toolkit/src/pack-loader.ts (UPDATE)
- bin/process-ai.ts (UPDATE — answers.engines)
- tests/installer-interact.test.ts (UPDATE — wrap/validação)
- tests/installer-prefs.test.ts (UPDATE — 6 chaves + engines CSV)
- tests/installer-prompts.test.ts (UPDATE — "(em breve)" marcável)

## Review Findings

> Revisão adversarial (3 camadas: Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 2026-09-01.
> **Todos resolvidos** — fixes aplicados (round-trip do `engines`, resumo honesto, guards do checkbox).

### Decision-needed

- [x] [Review][Decision] Escopo do toggle-all (`a`/`i`) — **DECISÃO (Project Lead)**: remover "(em breve)" de todas as engines; todas marcáveis como escolhas iguais, Claude Code padrão (pré-marcada). `a`/`i` afetam todas. `[toolkit/src/installer/interact.ts:231-244, toolkit/src/installer/prompts.ts:79-87]`

### Patch

- [x] [Review][Patch] Round-trip quebrado: `parseConfigLines` mantém o marcador `# definido pelo install` no valor — `enginesPref` lê `"claude-code,codex" # definido pelo install` (aspas+comentário embutidos), não `claude-code,codex`. `[toolkit/src/pack-loader.ts:470]`
- [x] [Review][Patch] Resumo/nota afirmam "(registrada)" a partir da seleção em memória, mas `mergeConfigUser` pode pular silenciosamente (linha manual sem marcador) — claim falsa. `[toolkit/src/installer/orchestrator.ts:337-349]`
- [x] [Review][Patch] `enginesSummaryLine` fallback reporta "Claude Code (instalada)" mesmo quando o usuário desmarcou a única engine suportada. `[toolkit/src/installer/orchestrator.ts:343]`
- [x] [Review][Patch] Checkbox todo-desabilitado não falha mais rápido — loop de validação irrecuperável (só Ctrl+C/EOF); guard `enabledIdx.length === 0` removido. `[toolkit/src/installer/interact.ts:174]`
- [x] [Review][Patch] Comentário de doc stale em `CheckboxChoice.disabled` — ainda diz "pulada pela navegação", oposto do novo wrap. `[toolkit/src/installer/interact.ts:51-52]`
- [x] [Review][Patch] Mensagem de validação hardcoda "engine" num widget genérico. `[toolkit/src/installer/interact.ts:250]`
- [x] [Review][Patch] Nota pós-checkbox: concordância plural ("Codex registradas") + info duplicada no resumo + `theme()` re-instanciado. `[toolkit/src/installer/prompts.ts:94-102]`
- [x] [Review][Patch] Validação não limpa em keypress que não repinta (estado limpo, tela não). `[toolkit/src/installer/interact.ts:212,262]`
- [x] [Review][Patch] Contradição interna no story file: Contexto diz "(em breve)" "não alternáveis" vs Story/AC2 "marcáveis". `[_bmad-output/implementation-artifacts/5-4-engines-persistidas-checkbox-wrap-validacao.md]`
