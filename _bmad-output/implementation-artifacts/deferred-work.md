# Deferred Work — process-ai

Triagem pós-Epic 4 (2026-08-07). Itens reais, porém fora do escopo prioritário do momento. Reavaliar ao tocar os arquivos/stories correspondentes.

## Itens fechados (pós-triagem Epic 4)

Resolvidos pelas stories do Épico 4 (4.1, 4.4, 4.5) ou já fechados em stories anteriores (2.5).

- ✅ **Enforcement estrito do schema-núcleo (D1, [Med])** — Story 4.1. 9 schemas com `required: ['body']` + `additionalProperties: false`.
- ✅ **Docs drift (require→import ESM; contagem stale 7→9)** — Story 4.4. `docs/method-packs.md`, `docs/toolkit.md` corrigidos + `tests/docs.test.ts`.
- ✅ **Claims de doc/contract falsas (headers/JSDoc vs código)** — Story 4.5. `tests/claims.test.ts` (6 assertions `doesNotMatch`).
- ✅ **Narrativa genérica de handoff "rascunho"** — `skills/process-ai/SKILL.md:108` corrigido (especialistas são profundos desde 2.1).
- ✅ **`formatConfidenceReport` interpola `stage` sem escape** — FIXED 2.5 (F3).
- ✅ **Variation selector emoji no ledger** — FIXED 2.5 (deferred-work.md:71).
- ✅ **`reasoning`/`statement` não persistidos no ledger** — FIXED 2.5 (AC4).
- ✅ **Smoke test de consumer-install** — `tests/consumer-install.smoke.test.ts` (AI-2 da retro).
- ✅ **Bootstrap hardening (CR items 1,2,4,4b,d,a/c,a,b,c,e)** — Resolvidos em 1.1/1.2.
- ✅ **Pipeline 1.6 scope items** — Pertencem a stories concluídas.
- ✅ **Propose payload validation (1.2)** — Resolvido na story 1.2.

---

## Decisões pendentes

### D2: Instalação automática do Chromium (Guilherme)

**Contexto:** O renderizador BPMN (Guilherme) usa Playwright + Chromium headless. O Playwright é instalado como dev dependency do npm, mas o navegador Chromium (~190 MB) precisa ser baixado separadamente via `npx playwright install chromium`. Em máquina nova, isso falha com "Executable doesn't exist".

**Opções avaliadas (2026-08-08):**

| Opção | Prós | Contras |
|-------|------|---------|
| **A: Bootstrap** — instala no `process-ai` install | Zero atrito | 190 MB, lento, exige rede |
| **B: Lazy** — Guilherme detecta falta e instala | Só baixa quando usar | Falha na 1ª vez |
| **C: Híbrida** — Bootstrap pergunta antes | Usuário decide | Mais um prompt |
| **D: Manual** (atual) — documentado | Leve, rápido | Usuário esquece |

**Recomendação preliminar:** Opção B (lazy). Custo: ~1 story.

**Decisão:** Pendente. Reavaliar no próximo ciclo de features.

---

## Mantidos em aberto — agrupados por arquivo-gatilho

Cada grupo lista o arquivo que dispara a reavaliação. Itens mantidos como [Low] — custo/benefício não justifica ação agora.

### `toolkit/src/commit.ts`

- **[Low] W1: Falha parcial deixa artefato órfão sem manifesto/provenance** — Se manifest ou provenance falham após artefato escrito, `_process-ai_output/<type>/<sha>.md` existe sem manifesto. Pertence à fronteira 1.3 (WAL/quarentena). `[commit.ts:329-343]`
- **[Low] W2: TOCTOU symlink race entre walk e write** — Não fechável sem `O_NOFOLLOW` (não-portátil no Windows). `[commit.ts:323-325]`
- **[Low] W3: Prototype pollution bypassa validação de payload** — `validatePayload` usa `p.artifactType`/`p.content` sem `Object.hasOwn`. Cenário extremamente improvável (conteúdo vem de agentes, não input externo). `[commit.ts:193-203]`
- **[Low] W4: Sem `fsync` em `atomicWriteFile` (durabilidade)** — Durabilidade não é claim da 1.2. `[commit.ts:215-225]`
- **[Low] W5: Extensão `.md` para conteúdo objeto/JSON é frágil** — Acoplamento que quebra quando extensões mudarem. `[commit.ts:40, 315-316]`

### `toolkit/src/confidence.ts`

- **[Low] Linhas corrompidas do ledger dropadas no scan de dedupe → append duplicado possível** — Corrupção não ocorre via atomic-write path. `[confidence.ts:238-246]`
- **[Low] `appendConfidenceLedger` lê o ledger 2×, O(n)/commit, sem cache** — Perf, não corretude; ledger v1 é pequeno. `[confidence.ts:234-272]`
- **[Low] `buildLedgerEntries` assume `claims.length === validated.length`** — Unreachable via fluxo normal. Candidato a `assert` de 1 linha. `[confidence.ts:298-299]`
- **[Low] deferred-work `:44` write-path corrupt-line dedupe window não fechado** — O fix "barato" não é óbvio; read-path dedupe compensa. `[confidence.ts:408-419]`
- **[Low] `update-on-change` ignora deltas em `statement`/`reasoning`** — Inalcançável via fluxo single-propose-por-artefato. `[confidence.ts:431-435]`
- **[Low] Zero-width chars passam `isNonEmptyString` mas falham `includes`** — Hardening: normalizar/strip antes do non-empty-check. `[confidence.ts:151-153, 361]`
- **[Low] BOM strip é read-path only** — Write-path lê sem strip de BOM; read-path F4 + dedupe-on-read compensam. `[confidence.ts:404-423, report.ts:238-240]`

### `toolkit/src/report.ts`

- **[Low] Reverse-index `split('::')` trunca sha256** — Se `artifactType` contém `::` (só via ledger editado). Fix: re-join tail. `[report.ts:591]`
- **[Low] Summary "Tipos" interpola `artifactType` sem escape** — Reachabilidade baixa: kebab-validado no commit. `[report.ts:567-572]`

### `bin/process-ai.ts` + `toolkit/src/checkpoint.ts`

- **[Low] `resume()` sem lock** — Fora do modelo single-session do produto. `[checkpoint.ts:392-459, bin/process-ai.ts:334-337]`
- **[Low] Sem cap de tamanho na leitura do payload** — Payload multi-GB → OOM cru. Size guard barato. `[bin/process-ai.ts:251]`
- **[Low] `status`/`report`/`resume` em cwd errado "sucedem"; `gate`/`stage` fazem `mkdir -p` silencioso** — Sem `resolveRoot` no dispatcher. `[bin/process-ai.ts:299-345]`
- **[Low] Sem validação canônica de gate IDs / stage** — CLI é pass-through por design (AD-3). `[bin/process-ai.ts:212-225]`
- **[Low] Leitores do report sem leaf-symlink check** — Assimetria de defense-in-depth; ameaça requer atacante. `[report.ts:88,122]`
- **[Low] `aggregateLedger` sem dedupe na leitura** — Inflação só com ledger editado manualmente. `[report.ts:95-108]`
- **[Low] `process.stdout.write` em pipe fechado lança fora do path de erro** — Adicionar handler EPIPE. `[bin/process-ai.ts:368]`
- **[Low] `process.cwd()` pode lançar ENOENT cru** — Comum no Windows com shell rm do dir pai. `[bin/process-ai.ts:363]`
- **[Low] `dispatch` sem guard `assertNever`** — Variante futura de `ParsedCommand` não-tratada → `undefined` → crash. `[bin/process-ai.ts:288-348]`
- **[Low] Valores whitespace-only passam no parser** — Só checa `=== ''`. `[bin/process-ai.ts:145,157]`
- **[Low] Valores com traço único aceitos na forma espaço** — Só bloqueia prefixo `--`. `[bin/process-ai.ts:160]`
- **[Low] `aggregateLedger` materializa o ledger inteiro na memória** — Escala é 2.5. `[report.ts:95]`
- **[Low] `aggregateLedger`/`report` leem sem lock → snapshot inconsistente** — Mesmo escopo single-session. `[report.ts:146-149]`

### `toolkit/adapters/claude-code/adapter.ts` + `bin/bootstrap.ts`

- **[Low] TOCTOU entre `lstat` e `writeFile`** — Janela de corrida derrota defesa de symlink; `O_NOFOLLOW` não-portátil no Windows. `[adapter.ts:71→82]`
- **[Low] Erros raw não-traduzidos** — ENOENT cru, ENOTDIR opaco, EACCES/EPERM/ELOOP relançados como errno. `[adapter.ts:43,63,65,82]`
- **[Low] `--dev=<value>` rejeitado enquanto `--dev` funciona** — Branch `=` só aceita `--target=`. `[bootstrap.ts:85-97]`
- **[Low] Snapshot de idempotência não captura diretórios nem mode de dir** — Teórico (bootstrap não cria/muda dirs entre runs). `[tests/bootstrap.test.ts:27-43]`
- **[Low] HELP inconsistente entre erros de parsing** — Alguns erros anexam HELP, outros não. `[bootstrap.ts:90-127]`
- **[Low] Cleanup de teste pode flakear com EBUSY no Windows** — Latente em CI. `[tests/bootstrap.test.ts]`
- **[Low] `parseArgs` nome enganador (chama `process.exit(0)` no help)** — Refactor (`parseArgsPure` + `dispatch`). `[bootstrap.ts:58-63]`

### `tests/` — infra de teste

- **[Low] Cleanup Windows `fs.rm` não tolera EPERM/EBUSY** — Antivirus/Search Indexer. `[e2e-pipeline.test.ts:588-590]`
- **[Low] Convenção de path de manifesto duplicada** — Replicada em `commit.ts`, `confidence.ts`, `report.ts`, `e2e-pipeline.test.ts`. `[tests/e2e-pipeline.test.ts:536-537]`

### `skills/process-ai-miguel/SKILL.md`

- **[Low] Scheme de IDs: contadores não-padded quebram ordenação lexical** — Nenhum consumer ordena IDs lexicalmente hoje. `[SKILL.md:89-91]`
- **[Low] "E1.1" é prefixo de string de "E1.10"** — Sem delimitador/âncora. Nenhum consumer resolve pai por substring. `[SKILL.md:100-107]`
- **[Low] Contrato de ancoragem downstream sub-especificado** — Agente poderia emitir UUIDs que quebram parse. `[SKILL.md:87-91]`
- **[Low] Content opaco: referência de pai órfão e divergência bidirecional** — Validação estrutural exige schema ou índice. `[SKILL.md:93,100-107]`
- **[Low] Marcadores de confiança desacoplados dos nós da árvore** — Marcação por-nó é enhancement de 2.5. `[SKILL.md:97-108,129-148]`

### `toolkit/src/install.ts` + `toolkit/src/installer/`

- **[Low] `atomicWrite` vaza temp file em terminação brusca** — Sweep de `.tmp-*` no início do install seria o fix. `[install.ts:97-105]`
- **[Low] postinstall fail-soft `exit(0)` mascara pacote quebrado** — Smoke não exerce o postinstall (environment-blocked). `[postinstall.js:33-45, consumer-install.smoke.test.ts:52-56]`
- **[Low] TOCTOU no `config.user` sob installs concorrentes** — Fora do modelo single-writer. `[install.ts:75-80]`
- **[Low] `atomicWrite` sem retry no Windows EPERM/EBUSY/EACCES** — Recuperável via re-run. `[install.ts:99-103]`
- **[Low] `scaffoldConfig` não valida `targetDir`** — Chamador direto passando arquivo-como-targetDir recebe ENOTDIR/EEXIST cru. `[install.ts:58-61]`

---

## Resumo pós-triagem

| Status | Count |
|--------|-------|
| **Fechados** (já resolvidos) | ~20 |
| **Mantidos [Low]** | 35 |
| **Agrupados por arquivo** | 7 grupos (commit, confidence, report, bin+checkpoint, adapter+bootstrap, tests, skills-miguel, installer) |

**Regra de reavaliação:** ao tocar qualquer arquivo listado acima, reavaliar os itens do grupo correspondente. Itens sem alteração no arquivo-gatilho permanecem diferidos.

*Triagem concluída em 2026-08-07 (Story 4.6).*
