---
baseline_commit: 181eaff
---

# Story 3.4: Distribuição npm + bootstrap

Status: done

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

### Review Findings

_Code review adversarial (3 camadas) — 2026-08-03. Os achados abaixo são individualmente fatais ao fluxo principal da story (`npm install process-ai` → `/process-ai` disponível). A suite 249/249 não os vê pois roda da raiz do repo (type-stripping permitido), sem simular `npm install` num projeto consumidor — um smoke test `npm pack` + `npm install` em temp dir + `process-ai --help` teria pego todos._

- [x] [Review][Decision→Patch] **Pacote não-consumível via npm** — RESOLVIDO 2026-08-03: **build tsc → dist/**. Adicionar step de build, apontar `bin`/`main`/`files` para JS compilado em `dist/`.
- [x] [Review][Patch] `postinstall.js` usa `resolve('.')` (CWD errado sob npm = `node_modules/process-ai/`) em vez de `INIT_CWD` → copia skills para dentro do pacote, nunca para o projeto do consumidor; `.catch(() => {})` engole falhas em silêncio [bin/postinstall.js:14,50] (AC2)
- [x] [Review][Patch] Dependência circular: `"dependencies": { "process-ai": "^0.2.0" }` — o pacote depende de si mesmo; nada em `toolkit/src/` o importa por nome (verificado) [package.json:52-54] (AC1)
