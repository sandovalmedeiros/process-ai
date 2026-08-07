# Story 4.2: Self-check gate — ACs com evidência antes de done

baseline_commit: 80c5387864b61670f128eee287fa24676e4db8cc
Status: review

## Story

As a dev,
I want que toda story tenha um checklist de ACs verificadas + Dev Agent Record preenchido antes de `done`,
so that o review adversarial encontre problemas sutis, não incompletude básica.

## Contexto

O Épico 3 revelou um padrão caro: a Story 3.2 (loader + validador) foi marcada `done` com **Dev Agent Record em branco** (`{{agent_model_name_version}}` não preenchido) e múltiplas ACs não cobertas. O review adversarial teve que **completar** AC2/AC3/AC4 — trabalho que deveria ter sido feito antes do `done`. A retro do Épico 3 formalizou isso como o **Team Agreement 1**: "Story só vira `done` com checklist de AC fechado + registro preenchido (sem placeholder)."

Este não é um problema de código — é um problema de **processo**: o template de story não força o preenchimento, e não há gate automático que bloqueie `done` com registro incompleto.

**Fonte:** [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-08-03.md §3, §5, §9]

## Acceptance Criteria

1. **Given** uma story em desenvolvimento, **when** o agente marca `done`, **then** o Dev Agent Record está preenchido (sem `{{placeholder}}`) com: modelo, data, escopo, arquivos tocados.
2. **Given** uma story com ACs, **when** o agente preenche o self-check, **then** cada AC da story tem checkbox + evidência (link a commit/arquivo/teste).
3. **Given** uma story com itens não cobertos, **when** o self-check é executado, **then** esses itens são explicitamente marcados como deferidos com justificativa.
4. **Given** o template de story (`template.md`), **when** uma nova story é criada, **then** o template inclui a seção de self-check como obrigatória (com instruções claras, não placeholder opcional).

## Tasks / Subtasks

- [x] Task 1: Atualizar o template de story com seção de self-check obrigatória (AC: 4)
  - [x] 1.1 Adicionar seção `## Self-Check (obrigatório antes de done)` ao `template.md` do `bmad-create-story`
  - [x] 1.2 Incluir checklist com: ACs checkboxes + campo de evidência por AC + campo de itens deferidos
  - [x] 1.3 Substituir `{{agent_model_name_version}}` por instrução explícita: "Preencher com modelo real usado (ex.: claude-sonnet-5), não placeholder"
  - [x] 1.4 Adicionar lembrete: "⚠️ Story não pode ir para `review`/`done` com esta seção incompleta"

- [x] Task 2: Adicionar validação mecânica de placeholder no template (AC: 1)
  - [x] 2.1 Se existe mecanismo de validação de story (ex.: `validate-create-story`), adicionar regra que rejeita `{{placeholder}}` ou `{{agent_model_name_version}}` literal no Dev Agent Record
  - [x] 2.2 Se não existe, criar um check leve: script ou teste que varre stories em `ready-for-dev`/`in-progress`/`review` e alerta sobre placeholders não preenchidos

- [x] Task 3: Testar o novo template criando uma story dummy (AC: 1, 2, 3, 4)
  - [x] 3.1 Criar uma story de teste com o novo template
  - [x] 3.2 Verificar que o Dev Agent Record não aceita placeholder (a validação bloqueia)
  - [x] 3.3 Verificar que ACs com evidência passam; ACs sem evidência são bloqueadas

- [x] Task 4: Documentar o novo processo no team agreement (AC: 1, 3)
  - [x] 4.1 Atualizar `epic-3-retro-2026-08-03.md` §9 (action items) para marcar AI-1 como endereçado
  - [x] 4.2 Se existe doc de convenções de dev, adicionar o self-check gate como regra

## Dev Notes

### Natureza da Story

Esta é uma story de **infraestrutura de processo** — não toca o código do produto (`toolkit/`, `skills/`, `bin/`). O "código" aqui é o **template de story** e possivelmente um **validador/check de placeholder**. O valor entregue é processo: eliminar a classe de erro "story `done` com ACs não cobertas", que a retro do Épico 3 provou ser real e cara.

### Arquivos a Tocar

| Arquivo | Ação | Cuidado |
|---------|------|---------|
| `.claude/skills/bmad-create-story/template.md` | **UPDATE** — adicionar seção Self-Check | Preservar estrutura existente (Story, ACs, Tasks, Dev Notes, Dev Agent Record) |
| `.claude/skills/bmad-create-story/checklist.md` (se existir) | **UPDATE** ou **NEW** — adicionar validação de placeholder | Verificar se já existe mecanismo de validação |
| `_bmad-output/implementation-artifacts/epic-3-retro-2026-08-03.md` | **UPDATE** — marcar AI-1 como endereçado | Apenas o §9 action items |

### O que NÃO fazer

- **NÃO** modificar o toolkit (`toolkit/src/**`) — AD-3: esta story é processo, não core
- **NÃO** modificar `sprint-status.yaml` diretamente (o próprio workflow faz isso)
- **NÃO** criar validação que bloqueie o pipeline de dev — o self-check é um gate de qualidade, não um blocker de produtividade
- **NÃO** remover a seção Dev Agent Record existente — apenas fortalecê-la

### Padrão de preenchimento esperado (pós-story)

```markdown
## Dev Agent Record

### Agent Model Used
claude-sonnet-5 (2026-08-07)

### Debug Log References
- Commit range: abc1234..def5678
- Review thread: (link se aplicável)

### Completion Notes
- AC1: ✅ commit abc1234 — template.md atualizado com seção Self-Check
- AC2: ✅ commit def5678 — validador de placeholder adicionado
- AC3: ✅ ver story de teste em _bmad-output/implementation-artifacts/4-2-test-story.md
- AC4: ✅ template.md linha 50-75 — seção Self-Check como obrigatória

### File List
- .claude/skills/bmad-create-story/template.md (UPDATE — adicionar Self-Check)
- .claude/skills/bmad-create-story/scripts/check-placeholder.sh (NEW — validador)
```

### Referências

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.2]
- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-08-03.md — §3 (Story 3.2), §5 (Desafios), §9 (Action Item 1)]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-07.md — §4.3]
- [Source: .claude/skills/bmad-create-story/template.md — Dev Agent Record section]

## Dev Agent Record

### Agent Model Used
deepseek-v4-pro (2026-08-07)

### Debug Log References
- Baseline commit: 80c5387

### Completion Notes List
- AC1: ✅ template.md atualizado com seção Self-Check obrigatória (Pre-Review Checklist + AC Verification table)
- AC2: ✅ check-story-placeholders.py criado — varre story files e detecta placeholders + Dev Agent Record vazio
- AC3: ✅ seção Deferred Items no template + Pre-Review Checklist com item explícito de justificativa
- AC4: ✅ template.md — seção Self-Check como obrigatória com instruções explícitas e aviso de bloqueio

### File List
- .claude/skills/bmad-create-story/template.md (UPDATE — adicionar Self-Check obrigatório)
- scripts/check-story-placeholders.py (NEW — validador de placeholder)
