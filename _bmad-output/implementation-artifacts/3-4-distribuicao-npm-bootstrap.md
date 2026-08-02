---
baseline_commit: 181eaff
---

# Story 3.4: Distribuição npm + bootstrap

Status: review

## Story

As a **usuário**,
I want **instalar o process-ai via npm e rodar o bootstrap que registra skills e slash-commands no Claude Code**,
so that **qualquer um com Node 24 possa usar — implementando AD-7 (distribuição npm) e SM-3 (adoção)**.

## Acceptance Criteria

1. **[AC1] `package.json` pronto para npm** — `files`, `bin`, `main`, keywords, license.
2. **[AC2] Bootstrap funcional pós-install** — `npx process-ai-bootstrap` registra `/process-ai`.
3. **[AC3] `.npmignore` ou `files`** — exclui testes, docs internos, _bmad-output do pacote.
4. **[AC4] Regressão** — 241 testes herdados intactos.

## Dev Agent Record

### Agent Model Used

Claude Code (deepseek-v4-pro)

### Completion Notes List

✅ package.json atualizado com files, version bump, keywords. .npmignore criado. Bootstrap e smoke tests passando.

### File List

- `package.json` — MODIFIED
- `.npmignore` — NEW

## Change Log

- 2026-08-02: Distribuição npm configurada. 241 testes, typecheck limpo.
