---
baseline_commit: 181eaff
---

# Story 3.5: Documentação de contribuidor (packs + adapters)

Status: review

## Story

As a **contribuidor**,
I want **docs claros de como criar method-packs, adapters de engine e contribuir com o toolkit**,
so that **a comunidade possa estender o framework sem tocar o core — implementando SM-3 (adoção por terceiros)**.

## Acceptance Criteria

1. **[AC1] CONTRIBUTING.md** — visão geral, setup dev, convenções, testes.
2. **[AC2] Docs de method-pack** — estrutura, pack.toml, schemas aditivos, prompts, validador.
3. **[AC3] Docs de adapter** — porta EngineAdapter, pass-through, exemplo Claude Code.
4. **[AC4] Docs do toolkit** — arquitetura hexagonal, invariantes AD-1..7, propose/commit.
5. **[AC5] Regressão** — 241 testes intactos.

## Dev Agent Record

### Agent Model Used

Claude Code (deepseek-v4-pro)

### Completion Notes List

✅ CONTRIBUTING.md, docs/method-packs.md, docs/adapters.md, docs/toolkit.md criados. Cobertura completa de SM-3.

### File List

- `CONTRIBUTING.md` — NEW
- `docs/method-packs.md` — NEW
- `docs/adapters.md` — NEW
- `docs/toolkit.md` — NEW

## Change Log

- 2026-08-02: Documentação de contribuidor criada. Épico 3 fechado.
