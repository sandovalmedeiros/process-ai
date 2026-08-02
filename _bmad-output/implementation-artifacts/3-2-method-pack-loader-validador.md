---
baseline_commit: 181eaff
---

# Story 3.2: Method-pack system — loader + validador

Status: review

## Story

As a **dev**,
I want **um loader de method-packs que lê `method-packs/<pack>/` (com `pack.toml`, schemas aditivos, prompts e glossary), valida que o pack não redefine o schema-núcleo nem a pipeline (AD-2), ativa o pack via `.process-ai/config` e registra `pack_id`+versão no checkpoint por artefato**,
so that **terceiros possam criar packs sem tocar o core, e o framework prove que é method-agnostic — implementando FR-17 (carregar method-packs), AD-2 (extensão aditiva + rejeição de redefinição) e a metade restante do schema-núcleo (3.1)**.

## Acceptance Criteria

1. **[AC1] Estrutura de pack — `pack.toml` + schemas + prompts + glossary (FR-17)** — **Given** um diretório `method-packs/<pack>/`, **When** o loader o lê, **Then**:
   - `pack.toml` é obrigatório com: `[pack] name`, `version` (semver), `description`, `artifact_types` (lista de artifactTypes que o pack estende).
   - `schemas/` (opcional): JSON Schemas que **estendem aditivamente** o schema-núcleo (via `allOf: [{ "$ref": "schema-núcleo" }, { properties: {...} }]`). Se presente, cada schema deve referenciar exatamente 1 artifactType do vocabulário (nome do arquivo = artifactType).
   - `prompts/` (opcional): arquivos `.md` com conteúdo de prompt por especialista (ex.: `bento.md`, `miguel.md`).
   - `glossary.md` (opcional): glossário method-specific.
   - Pack inválido (sem `pack.toml`, `version` malformada, `artifact_types` vazio) → erro acionável no load.
   - O pack **NÃO pode** declarar `pipeline`, `roles`, `gates`, `stages` ou `engine` — esses são **toolkit-owned**. Pack que declara → rejeitado (AD-2).

2. **[AC2] Validador de extensão — pack não redefine schema-núcleo (AD-2)** — **Given** um pack com schemas aditivos, **When** o loader valida, **Then**:
   - Cada schema de pack referencia exatamente 1 schema-núcleo (via `allOf[0].$ref` apontando para `https://process-ai/schemas/<type>/v1`).
   - O schema de pack **só adiciona** `properties` (nunca remove, nunca redefine `required`, nunca altera `type`).
   - O merge (núcleo + pack) é validado: schema resultante é um JSON Schema válido.
   - Pack que tenta redefinir campo do núcleo (ex.: declarar `body` com tipo diferente de `string`) → rejeitado com erro acionável listando o campo conflitante.
   - Pack que referencia artifactType fora do vocabulário → rejeitado.

3. **[AC3] Ativação de pack via `.process-ai/config` (FR-17)** — **Given** um pack válido, **When** o usuário ativa, **Then**:
   - O pack é declarado em `.process-ai/config` (TOML ou JSON) com `active_pack = "<pack-name>"` e `pack_version = "<semver>"`.
   - O `resume` lê `.process-ai/config` e valida que o pack ativo é compatível com os artefatos existentes (mesmo `pack_id` e versão compatível).
   - Trocar de pack no meio da sessão → `resume` alerta mas não bloqueia (v1: warn; v2: bloqueio).
   - `.process-ai/config` é criado pelo bootstrap ou pelo primeiro `process-ai` run se não existir.

4. **[AC4] Checkpoint registra `pack_id` + versão por artefato (AD-2)** — **Given** um commit com pack ativo, **When** o toolkit commita, **Then**:
   - O manifesto do artefato inclui `pack_id` (string) e `pack_version` (string semver) — campos NOVOS no schema do manifesto.
   - O checkpoint **NÃO** duplica essa informação (já está no manifesto). Mas a lista `artifacts[]` no checkpoint pode opcionalmente incluir `pack_id` para consulta rápida.
   - Backward-compat: manifestos existentes (1.2–3.1) **sem** `pack_id` são tolerados (leitores tratam `pack_id` ausente como `"core"` ou `undefined`).
   - `resume` valida que artefatos commitados com pack X são compatíveis com o pack ativo atual.

5. **[AC5] AD-3 + regressão — 224 testes herdados intactos** — **Given** as mudanças em 3.2, **Then**:
   - `node --test tests/*.test.ts` → 100% pass.
   - `npm run typecheck` limpo.
   - AD-3 verde.
   - E2E pipeline (2.7) passando — fixtures sem pack (comportamento padrão: `pack_id = undefined`).

> **Critério implícito:** a story implementa FR-17 (carregar method-packs) e a metade restante de AD-2 (extensão aditiva + rejeição de redefinição). O pack padrão BPMN+SIPOC (3.3) usará este loader. A story NÃO extrai o conteúdo method-specific do core (isso é 3.3).

## Tasks / Subtasks

- [x] **T1 — Estrutura de pack: `pack.toml` schema + loader (AC: #1)**
  - [x] **CREATE `toolkit/src/pack-loader.ts`:**
    - `validatePackToml(raw: string): PackManifest` — parse e validação de `pack.toml`.
    - `loadPack(packDir: string): MethodPack` — lê diretório do pack, valida estrutura, retorna objeto `MethodPack`.
    - Tipos exportados: `PackManifest { name, version, description, artifactTypes[] }`, `MethodPack { manifest, schemas, prompts, glossary }`.
  - [x] **Validação de `pack.toml`:**
    - `[pack]` section obrigatória.
    - `name`: string kebab-case.
    - `version`: semver (major.minor.patch).
    - `artifact_types`: array não-vazio de strings (cada uma deve estar no vocabulário de 7 tipos).
    - Rejeitar campos proibidos: `pipeline`, `roles`, `gates`, `stages`, `engine`.
  - [x] **Leitura de diretório:** `schemas/` (opcional, arquivos `<type>.schema.json`), `prompts/` (opcional, `.md`), `glossary.md` (opcional).

- [x] **T2 — Validador de extensão aditiva (AC: #2)**
  - [x] **ADD `validatePackSchemas(pack: MethodPack): ValidationResult`:**
    - Para cada schema no pack, verificar que `allOf[0].$ref` aponta para schema-núcleo válido (`https://process-ai/schemas/<type>/v1`).
    - Verificar que o pack **só adiciona** `properties` — nunca redefine campo existente no núcleo.
    - Merge núcleo + pack → validar que o schema resultante é um JSON Schema estruturalmente válido.
    - Rejeitar se pack declara `required` que conflita, `additionalProperties: false` que conflita, ou `type` diferente.
  - [x] **Integrar com `validateContent()` do 3.1:** quando um pack está ativo, `validateContent` usa o schema mergeado (núcleo + pack), não só o núcleo.

- [x] **T3 — Ativação via `.process-ai/config` (AC: #3, #4)**
  - [x] **CREATE/MODIFY `.process-ai/config` schema:**
    - Formato TOML: `active_pack = "bpmn-sipoc"`, `pack_version = "1.0.0"`.
    - Fallback: se `.process-ai/config` não existe → sem pack ativo (comportamento atual).
  - [x] **MODIFY `toolkit/src/commit.ts`:**
    - Ler `.process-ai/config` (se existir) para obter `pack_id` e `pack_version` ativos.
    - Incluir `pack_id` e `pack_version` no manifesto do artefato.
  - [x] **MODIFY `toolkit/src/checkpoint.ts`:**
    - `checkpointRead` retorna `activePack?: { id: string, version: string }`.
    - `resume` valida compatibilidade pack ativo vs artefatos existentes (warn no v1).

- [x] **T4 — Testes (AC: #1–#5)**
  - [x] **CREATE `tests/pack-loader.test.ts`:**
    - (a) `pack.toml` válido → parse OK.
    - (b) `pack.toml` sem `[pack]` → erro.
    - (c) `pack.toml` com campos proibidos (`pipeline`) → rejeitado.
    - (d) `version` inválida (não-semver) → erro.
    - (e) `artifact_types` vazio → erro.
    - (f) Load de pack completo (toml + schemas + prompts + glossary).
    - (g) Schema de pack que redefine campo do núcleo → rejeitado.
    - (h) Schema de pack com `allOf` válido (aditivo) → aceito.
    - (i) Commit com pack ativo → manifesto inclui `pack_id`+`pack_version`.
    - (j) Commit sem pack → manifesto sem `pack_id` (backward-compat).
    - (k) Resume com pack → valida compatibilidade.
  - [x] **Regressão total:** `node --test tests/*.test.ts` → 100% pass (224 herdados + ~12 novos).

- [x] **T5 — Critério implícito**
  - [x] 224 herdados + novos testes → 0 fail.
  - [x] `npm run typecheck` limpo.
  - [x] AD-3 verde.
  - [x] E2E pipeline (2.7) passando (sem pack ativo = default).

## Dev Notes

### O que esta história É

3.2 implementa o **loader de method-packs** — a infraestrutura que lê, valida e ativa packs. É a segunda metade de AD-2 (a primeira metade, schema-núcleo, é 3.1). Juntas, 3.1+3.2 provam que o framework é method-agnostic.

### Arquivos

| Arquivo | Ação |
|---------|------|
| `toolkit/src/pack-loader.ts` | NEW — loader + validador de packs |
| `toolkit/src/schema-core.ts` | MODIFY — integrar merge núcleo+pack |
| `toolkit/src/commit.ts` | MODIFY — ler config, incluir pack_id no manifesto |
| `toolkit/src/checkpoint.ts` | MODIFY — expor activePack, validar no resume |
| `tests/pack-loader.test.ts` | NEW — testes de pack |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2]
- [Source: ARCHITECTURE-SPINE.md#AD-2]
- [Source: toolkit/src/schema-core.ts] — 3.1 (schemas + validateContent)
- [Source: _bmad-output/implementation-artifacts/3-1-schema-nucleo-toolkit-owned.md]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log
