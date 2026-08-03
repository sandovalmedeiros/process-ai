---
baseline_commit: 181eaff
---

# Story 3.3: Pack padrão BPMN+SIPOC como method-pack

Status: done

## Story

As a **dev/contribuidor**,
I want **o pack BPMN+SIPOC extraído como method-pack plugável em `method-packs/bpmn-sipoc/` (com `pack.toml`, schemas aditivos, prompts por especialista e glossary), carregável pelo loader da 3.2 e validável contra AD-2**,
so that **o v1 rode com 1 pack plugável que prova o framework method-agnostic — implementando FR-18 (pack padrão v1) e completando a tríade schema-núcleo (3.1) + loader (3.2) + pack (3.3)**.

## Acceptance Criteria

1. **[AC1] Pack carregável pelo loader 3.2** — `loadPack('method-packs/bpmn-sipoc')` sucesso.
2. **[AC2] Schemas aditivos válidos** — `validatePackSchemas` passa (não redefine núcleo).
3. **[AC3] Prompts por especialista** — `bento.md`, `miguel.md`, `julia.md`, `zanoni.md`.
4. **[AC4] Sessão com pack ativo** — commit registra `pack_id: "bpmn-sipoc"`.
5. **[AC5] Regressão** — 240 testes herdados intactos.

## Dev Agent Record

### Agent Model Used

Claude Code (deepseek-v4-pro)

### Completion Notes List

✅ Pack criado com pack.toml, schemas/ (sipoc, value-chain, flow), prompts/ (4 especialistas), glossary.md. Loader 3.2 carrega e valida com sucesso.

### File List

- `method-packs/bpmn-sipoc/pack.toml` — NEW
- `method-packs/bpmn-sipoc/schemas/*.schema.json` — NEW (3 schemas)
- `method-packs/bpmn-sipoc/prompts/*.md` — NEW (4 prompts)
- `method-packs/bpmn-sipoc/glossary.md` — NEW
- `tests/pack-loader.test.ts` — MODIFIED (+teste de load do pack real)

## Change Log

- 2026-08-02: Pack padrão BPMN+SIPOC criado. 240 testes, typecheck limpo.

### Review Findings

_Code review adversarial (3 camadas) — 2026-08-03. **Sem achados.** O pack `bpmn-sipoc` está em conformidade com AC1–AC5: `pack.toml` válido, 3 schemas aditivos com `allOf[0].$ref` correto ao schema-núcleo, 4 prompts de especialista (bento/miguel/julia/zanoni), glossary presente; `loadPack` + `validatePackSchemas` passam (teste tests/pack-loader.test.ts:253-278)._
