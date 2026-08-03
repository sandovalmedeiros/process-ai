# Arquitetura do Toolkit

O **toolkit** é o núcleo determinístico do process-ai — o **único escritor** (AD-1) responsável por commit, checkpoint, confiança e validação de schema.

## Invariantes (AD-1..7)

### AD-1 — Propose/Commit
O toolkit é o **único escritor** de `_process-ai_output/` e `.process-ai/`. Skills só **propõem** via CLI; o adapter é **pass-through**.

### AD-2 — Schema-núcleo + extensão aditiva
Existe um **schema-núcleo versionado** para cada artifactType. Method-packs **só estendem aditivamente** (novos campos), nunca redefinem o núcleo. Pack que tenta redefinir → rejeitado.

### AD-3 — Núcleo hexagonal
`toolkit/src/**` importa **só `node:*` + relativos** — nunca pacotes npm. O guardrail `tests/import-boundary.test.ts` valida automaticamente.

### AD-4 — Checkpoint autoritativo
Checkpoint é a **fonte da verdade**. Commit + checkpoint são **atômicos** (WAL). `resume` é função pura do checkpoint. Órfãos vão para quarentena (nunca auto-mergeados).

### AD-5 — Confiança mecânica
🟢 exige **fonte que resolve** a artefato commitado (SHA-256 + excerpt opcional). Sem fonte → 🟡. Não-determinado → 🔴. Ghost/forward-ref → 🟡.

### AD-6 — BPMN canônico
Formato on-disk do BPMN é **XML 2.0 toolkit-owned**. Render é derivação (nunca a fonte).

### AD-7 — Distribuição
Pacote **npm**. Bootstrap usa o adapter para registrar skills/slash-commands.

## Módulos

| Módulo | Responsabilidade |
|--------|-----------------|
| `commit.ts` | Propose/commit com SHA-256 + manifesto + provenance (AD-1) |
| `checkpoint.ts` | Checkpoint/resume atômico via WAL (AD-4) |
| `confidence.ts` | Confiança 🟢🟡🔴 por fonte verificável (AD-5) |
| `report.ts` | Relatório de confiança consolidado (FR-16) |
| `schema-core.ts` | Schema-núcleo + validador (AD-2) |
| `pack-loader.ts` | Loader de method-packs (FR-17) |

## Pipeline de commit

```
validatePayload → validateContent → validateClaims
→ canonicalize → SHA-256 → sanitizeArtifactType
→ readConfig (pack_id) → lock → write (artefato+manifesto+provenance+ledger)
→ checkpointAdvance → unlock
```

Toda validação ocorre **antes** do lock (abort-before-write).

## Extensão do vocabulário

Para adicionar um novo artifactType:
1. Adicione o schema em `SCHEMAS` (schema-core.ts).
2. Adicione extensão em `EXT_BY_TYPE` (commit.ts) se necessário.
3. Testes de schema em `tests/schema-core.test.ts`.

**Vocabulário fechado em 7 tipos no v1:** `discovery-interview`, `sipoc`, `value-chain`, `hierarchy`, `flow`, `pop`, `summary-report`.

## Testes

```bash
npm test                    # Roda todos os testes (node:test)
node --test tests/commit.test.ts   # Teste específico
```

Testes são determinísticos, sem LLM. Usam `dispatch(parseArgs(...), adapter, root)` para simular a CLI.
