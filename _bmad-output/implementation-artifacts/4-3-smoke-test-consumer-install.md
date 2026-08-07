# Story 4.3: Smoke test de consumer-install no pipeline

Status: done

## Story

As a dev,
I want um smoke test que simula `npm install` real em projeto consumidor limpo,
so that "testes verdes na raiz do repo" não deem falsa confiança sobre distribuição.

## Contexto

O bug fatal da story 3.4 (pacote não-consumível via npm) não foi pego pela suite porque rodava da raiz do repo. O smoke test (`tests/consumer-install.smoke.test.ts`) foi construído como follow-up imediato da retro do Épico 3 (AI-2) e cobre o caminho real: `tsc → dist → npm pack → npm install em temp dir → CLI invocation`.

**Fonte:** [Source: tests/consumer-install.smoke.test.ts]
[Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-08-03.md §9 (AI-2)]

## Acceptance Criteria (todos já satisfeitos)

1. ✅ `npm pack` → `npm install <tarball>` em dir temporário → `npx process-ai --help` funciona — coberto pelo teste existente
2. ✅ `/process-ai` slash-command registrado no engine — skills presentes em `.claude/skills/` após install
3. ✅ Smoke integrado à suíte de testes — roda em todo `npm test`
4. ✅ Falha de registro reporta erro claro — asserts verificam exit code + stdout/stderr

## Dev Agent Record

### Agent Model Used
deepseek-v4-pro (2026-08-07)

### Completion Notes List
- Story satisfeita por trabalho pré-existente (follow-up AI-2 da retro do Épico 3)
- `tests/consumer-install.smoke.test.ts`: build → pack → install → CLI → skills → config → manifest → status → update → idempotent → uninstall → purge
- 13 verificações no teste, ~18s de execução

### File List
- tests/consumer-install.smoke.test.ts (pré-existente — construído no follow-up AI-2)
