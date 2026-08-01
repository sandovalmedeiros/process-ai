---
baseline_commit: NO_VCS
---

# Story 1.1: Scaffold + porta EngineAdapter + ClaudeCodeAdapter

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **dev**,
I want **um scaffold Node 24 LTS com a estrutura de pastas e a porta `EngineAdapter` + `ClaudeCodeAdapter` mínima**,
so that **o framework rode no Claude Code em dev**.

## Acceptance Criteria

1. **[AC1] Scaffold executável em Node 24 LTS** — **Given** Node.js 24 LTS instalado, **When** executo o bootstrap de dev, **Then** a estrutura de pastas (`skills/`, `toolkit/` com `src/` + `adapters/claude-code/`, `method-packs/`, `bin/`, `templates/`) existe e o `package.json` declara `engines.node` compatível com 24 LTS.

2. **[AC2] `/process-ai` registrável no Claude Code via adapter** — **Given** um diretório-alvo, **When** o bootstrap roda o `ClaudeCodeAdapter`, **Then** o arquivo `.claude/skills/process-ai/SKILL.md` é criado **no projeto-alvo** (não no repositório do framework) e o comando `/process-ai` fica disponível após o diálogo de *workspace trust*. *(FR-1, AD-7)*

3. **[AC3] O core referencia só a porta `EngineAdapter`** — **Given** o código sob `toolkit/src/**` (o core), **When** analisadas as importações, **Then** nenhuma linha referencia APIs ou especificidades do Claude Code (nem qualquer engine); o core depende apenas da porta `EngineAdapter` definida em `toolkit/src/engine-adapter.ts`. *(FR-21, AD-3)*

4. **[AC4] Adapter é pass-through e não muta propostas** — **Given** um payload de *propose* qualquer, **When** passa pelo `ClaudeCodeAdapter.propose()`, **Then** o payload chega ao toolkit byte-a-byte (sem mutação); o adapter apenas roteia. *(AD-1, AD-3)*

5. **[AC5] Idempotente e não-destrutivo** — **Given** o bootstrap já executado, **When** rodo de novo, **Then** não duplica nem corrompe o registro (idempotente); e nada é escrito fora de `.claude/` no alvo.

> **Critério implícito (não-negociável):** a história deixa o sistema em estado "rodável ponta-a-ponta" no escopo dela — ou seja, `node bin/… --target <tmpdir>` registra `/process-ai` com sucesso e os testes passam. Não basta "satisfazer os ACs literais".

## Tasks / Subtasks

- [x] **T1 — Scaffold de pastas + `package.json` (AC: #1)**
  - [x] Criar pastas: `skills/`, `toolkit/src/`, `toolkit/adapters/claude-code/`, `method-packs/`, `bin/`, `templates/`
  - [x] `package.json`: `name: "process-ai"`, `"type": "module"`, `engines.node: ">=24"`, `bin` apontando para o bootstrap, scripts (`dev`, `test`, `build` se emitir JS)
  - [x] `tsconfig.json` (ESM, `moduleResolution: bundler`/`nodenext`, `strict: true`)
  - [x] `.gitignore`: `node_modules/`, `dist/`, `_process-ai_output/`, `.process-ai/`
  - [x] Confirmar `node -v` ≥ 24 (rodar `node --version` antes de seguir)

- [x] **T2 — Porta `EngineAdapter` (AC: #3, #4)**
  - [x] `toolkit/src/engine-adapter.ts`: definir a interface `EngineAdapter` com as 3 capacidades do contrato (ver Dev Notes → "Contrato da porta")
  - [x] Definir tipos do *propose payload* (shape toolkit-owned) — versão mínima; campos completos amadurecem em 1.2/1.4
  - [x] **Zero imports** de engines. Validar com teste de fronteira (T6).

- [x] **T3 — `ClaudeCodeAdapter` mínimo (AC: #2, #4, #5)**
  - [x] `toolkit/adapters/claude-code/adapter.ts`: `implements EngineAdapter`
  - [x] `installSkills(targetDir)`: escreve `.claude/skills/process-ai/SKILL.md` no **alvo** (conteúdo vem de `skills/process-ai/SKILL.md` do framework — T5)
  - [x] `registerSlashCommands(targetDir)`: registra `/process-ai` — ver Dev Notes → "Skill vs command" para a decisão; em Claude Code a skill já é slash-invocável, então isto pode ser um no-op ou um `.claude/commands/process-ai.md` fino
  - [x] `propose(payload)`: pass-through puro (roteia ao toolkit sem mutar) — stub: encaminha/ecoia; commit real é **1.2**
  - [x] Operações de escrita **idempotentes** (`mkdir recursive`, sobrescreve SKILL.md deterministicamente)

- [x] **T4 — Bootstrap CLI em `bin/` (AC: #1, #2, #5)**
  - [x] `bin/bootstrap.ts`: aceita `--target <dir>` (default: `cwd`) e flag `--dev`
  - [x] Instancia `ClaudeCodeAdapter` e chama `installSkills` + `registerSlashCommands`
  - [x] Cria `.claude/` no alvo se não existir; imprime o aviso de *workspace trust*
  - [x] Saída de log clara (o que foi registrado, onde)

- [x] **T5 — Skill stub da Déa (AC: #2)**
  - [x] `skills/process-ai/SKILL.md`: frontmatter `name: process-ai` + `description`; corpo **mínimo**: Déa pergunta *"Qual processo vamos mapear?"* — a versão completa (Gate 0, orquestração, gates, resumo) é a **story 1.5**

- [x] **T6 — Testes (AC: #1, #2, #3, #4, #5)**
  - [x] **Import-boundary (AD-3):** teste que falha se qualquer arquivo em `toolkit/src/**` importar de `toolkit/adapters/**` ou de um caminho de engine
  - [x] **Adapter:** após `installSkills(tmp)`, assertions de que `.claude/skills/process-ai/SKILL.md` existe com frontmatter `name` válido
  - [x] **Bootstrap:** rodar contra `os.tmpdir()` e validar o registro de `/process-ai`
  - [x] **Pass-through:** `propose(payload)` retorna/encaminha payload estruturalmente igual ao de entrada (deep-equal)
  - [x] **Idempotência:** rodar bootstrap 2× no mesmo tmp dir → estado final idêntico
  - [x] 100% dos testes passando antes de marcar pronto para review

### Review Findings

_Code review cruzado (glm-5.1 revisor ≠ glm-5.2 autor) — 3 camadas adversariais em paralelo (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Triage em 2026-08-01. AC1–AC5 e AD-1/3/7 = MET no código; itens abaixo são de robustez/hardening._

**Patch (corrigir):**

- [x] [Review][Patch] **[Med] Guardrail de AD-3 não é robusto** — falsos-negativos: *side-effect imports* (`import 'pkg'`, sem `from`) não casam (confirmado empiricamente pelo Blind Hunter); falsos-positivos: imports dentro de comentários/JSDoc disparam violação; e *denylist* fechada de nomes de engine (5 substrings) deixa escapar SDKs futuros → usar **allowlist** (só `node:*` + caminhos relativos). `[tests/import-boundary.test.ts:33-54]` *(consenso triplo: blind+edge+auditor)*
- [x] [Review][Patch] **[Med] Entry guard do bootstrap é frágil** — igualdade estrita de URL (`import.meta.url === pathToFileURL(process.argv[1]).href`) → **no-op silencioso** em invocação por symlink / caixa da letra de drive no Windows / UNC (`main()` não roda, exit 0, nada instalado); e `process.argv[1] ?? ''` → `pathToFileURL('')` lança `ERR_INVALID_ARG_TYPE` se `argv[1]` undefined. *Nota: o Blind Hunter verificou empiricamente que o uso comum (`node bin/bootstrap.ts`, absoluto, 8.3) funciona — não está quebrado, é desnecessariamente frágil.* Fix: comparar `fs.realpathSync` dos dois lados + guardar `argv[1]` definido. `[bin/bootstrap.ts:80]`
- [x] [Review][Patch] **[Low] `installSkills` escrita não-atômica + teste só valida `isFile()`** — falha mid-write (disco cheio/EIO/SIGINT) deixa `SKILL.md` 0-byte/"torn"; o `bootstrap.test` assevera só `isFile()`, então **passa num arquivo corrompido**. Fix: temp-file + `rename` atômico + asserção de conteúdo (não-vazio / byte-equal) no teste. `[toolkit/adapters/claude-code/adapter.ts:44-45, tests/bootstrap.test.ts:47]`
- [x] [Review][Patch] **[Low] `--target ''` (vazio) cai silenciosamente para cwd** — footgun: usuário acha que definiu um alvo. Fix: rejeitar valor vazio no `parseArgs`. `[bin/bootstrap.ts:40-43]`

**Defer (adiado — ver `deferred-work.md`):**

- [x] [Review][Defer] **[Low] Validação de `--target` ausente** (typo cria árvore dispersa; alvo é arquivo → `ENOTDIR` opaco) — defer p/ maturação do CLI. `[adapter.ts:38, bin/bootstrap.ts:57-61]`
- [x] [Review][Defer] **[Low] Symlink no destino escapa do `.claude/`** (AC5 defense-in-depth; exige symlink pré-existente no caminho exato) — defer até amadurecer o threat model. `[adapter.ts:45]`
- [x] [Review][Defer] **[Low] Ergonomia do CLI** — `--target=` form, `--target` duplicado, dirs começando com `--`, `--help`+`--target`, separador POSIX `--`. Defer. `[bin/bootstrap.ts:36-55]`
- [x] [Review][Defer] **[Low] Hardening misc** — MAX_PATH Win; self-install no repo; validação runtime de payload (→ 1.2); idempotência ignora mode/mtime; scope-test não detecta escrita fora do alvo; bootstrap tipa adapter como concreto. Defer. `[adapter.ts, bootstrap.ts, tests/*]`

**Dismissed (ruído/falso-positivo/por-spec):** (2) AC4 byte-level / `propose` mesma referência — a spec defere verificação byte-a-byte/commit p/ a **story 1.2**; o teste `deepEqual`+snapshot é correto p/ 1.1 (verificado). (2) Bypass por *dynamic-import* com concatenação de string — limitação aceitável de qualquer abordagem regex.

### Review Findings (Round 2 — pós-hardening, 2026-08-01)

_Code review adversarial round 2 (glm-5.2, 3 camadas em paralelo: Blind Hunter + Edge Case Hunter + Acceptance Auditor) sobre o estado PÓS-aplicação dos defer items do round 1. **Acceptance Auditor: AC1–AC5 + critério implícito = MET** (verificado empiricamente: 23/23 testes, `tsc` limpo, E2E exit 0 idempotente); a hardening introduziu **zero regressões** e fortaleceu a fronteira AD-3. Achados abaixo = gaps de robustez da própria hardening + confirmações._

**Patch (corrigir) — novos do round 2:**

- [x] [Review][Patch] **[High] Parent-symlink escapa do escopo `.claude/`** — a hardening do round 1 (item "symlink no destino") só faz `lstat` do **leaf** `SKILL.md`; se um componente **pai** (`.claude`, `.claude/skills`, `.claude/skills/process-ai`) for symlink, `mkdir`/`writeFile` seguem o link e gravam **fora** do alvo (escape de escopo AC5/AD-7). **Confirmado empiricamente** pelo Blind Hunter ("SCOPE ESCAPE CONFIRMED"). *Probabilidade de ocorrência natural é baixa, mas a hardening atual vende uma garantia que não cumpre.* Fix: `lstat`-walk em cada componente de `target → targetSkillDir`, recusando symlink. `[toolkit/adapters/claude-code/adapter.ts:60-82]` *(blind+edge)*
- [x] [Review][Patch] **[Med] Self-install guard burlado por case de drive-letter ou symlink/junction (Windows)** — o guard `target === REPO_ROOT` é comparação byte-a-byte; `path.resolve` **não** normaliza case de drive (`D:` vs `d:`) nem resolve junctions, então o guard falha (falso-negativo) e o framework instala `.claude/` no próprio repo. **Confirmado empiricamente.** Fix: `fs.realpathSync` nos dois lados. `[bin/bootstrap.ts:138]` *(blind+edge)*
- [x] [Review][Patch] **[Med] Teste de recusa-de-symlink passa sem nenhuma asserção no Windows sem Dev Mode** — `fs.symlink` lança EPERM sem privilégio; o `catch` faz `return`, e `node:test` marca o teste como **pass** sem rodar asserção nenhuma — falsa cobertura na plataforma-alvo. Fix: usar o contexto `t` do `node:test` e chamar `t.skip(...)`. `[tests/adapter.test.ts:122-129]` *(blind)*
- [x] [Review][Patch] **[Low] Form `--target=<dir>` (deliverable da hardening) sem teste E2E** — só exercitado por chamadas unitárias de `parseArgs()`; o caminho real de subprocesso (quoting, `=`-stripping) não é coberto. Fix: teste E2E com `[BOOTSTRAP, '--target='+target]`. `[tests/bootstrap.test.ts:18-20]` *(blind)*

**Defer (adiado — novos do round 2, ver `deferred-work.md`):**

- [x] [Review][Defer] **[Low] TOCTOU entre `lstat` e `writeFile`** *(reclassificado de Med: requer atacante ativo + janela de ms num CLI de dev v1 → consequência real baixa)* — janela de corrida derrota a defesa de symlink; fix correto (`O_NOFOLLOW`) não é portátil no Windows → risco residual aceito. `[toolkit/adapters/claude-code/adapter.ts:71→82]` *(blind+edge)*
- [x] [Review][Defer] **[Low] Erros raw não-traduzidos** — source skill ausente (ENOENT), `.claude` já existindo como arquivo (ENOTDIR opaco), EACCES/EPERM/ELOOP relançados como errno cru (só ENOENT do target é traduzido). `[toolkit/adapters/claude-code/adapter.ts:43,63,65,82]` *(edge)*
- [x] [Review][Defer] **[Low] `--dev=<value>` rejeitado enquanto `--dev` funciona** — o branch `=` só aceita `--target=`. `[bin/bootstrap.ts:85-97]` *(blind+edge)*
- [x] [Review][Defer] **[Low] Snapshot de idempotência não captura dirs nem mode de dir** — `snapshotTree` registra só arquivos (teórico: o bootstrap não cria/muda dirs entre runs). `[tests/bootstrap.test.ts:27-43]` *(blind+edge)*
- [x] [Review][Defer] **[Low] HELP mostrado inconsistentemente entre erros de parsing** — alguns erros anexam `${HELP}`, outros não. `[bin/bootstrap.ts:90-127]` *(blind)*
- [x] [Review][Defer] **[Low] Cleanup de teste pode flakear com EBUSY no Windows** — `rmSync({force:true})` não suprime EBUSY (antivirus/indexer); passou na execução, latente. `[tests/bootstrap.test.ts]` *(blind)*
- [x] [Review][Defer] **[Low] `parseArgs` tem nome enganador (chama `process.exit` no help)** — importer/teste pode ter processo morto; já mitigado testando `hasHelpFlag` separadamente. `[bin/bootstrap.ts:58-63]` *(blind)*

**Round 1 — patches ainda pendentes (confirmados pelo round 2, não duplicados):**

- [x] [Review][Patch] *(round 1)* **[Med] Guardrail AD-3 → allowlist** — round 2 reforça: side-effect imports sem `from` não casam; denylist fechada deixa escapar SDKs futuros. `[tests/import-boundary.test.ts:33-54]`
- [x] [Review][Patch] *(round 1)* **[Med] Entry guard do bootstrap frágil** — round 2 reforça: case de `argv[1]` + `argv[1]` undefined. `[bin/bootstrap.ts:169]`
- [x] [Review][Patch] *(round 1)* **[Low] `installSkills` escrita não-atômica** `[toolkit/adapters/claude-code/adapter.ts:82]`
- [x] [Review][Patch] *(round 1)* **[Low] `--target ''` cai para cwd** `[bin/bootstrap.ts]`

**Dismissed (round 2):** `hasHelpFlag` não distingue posição flag vs valor (`--target -h` mostra help) — comportamento aceitável (help-precedence é feature intencional), caso patológico. `[Info]` deferred-work.md stale — já atualizado nesta sessão. `propose()` mesma referência — já dismissed no round 1 (AC4 → 1.2).

## Dev Notes

### O que esta história É (e o que NÃO é) — leia antes de codar

Esta é a **story 1.1 de 6 do Epic 1** (Walking Skeleton). Ela prova **uma coisa só**: o paradigma *hexagonal* — o core depende só da porta `EngineAdapter`, e o `ClaudeCodeAdapter` registra `/process-ai` no engine v1. **Não construa** aqui:

| Pertence a 1.1 (esta) | Pertence a histórias futuras — NÃO faça |
|---|---|
| Porta `EngineAdapter` (interface TS) | `commit.ts` / SHA-256 / manifestos → **1.2** |
| `ClaudeCodeAdapter` (install skills + registra `/process-ai` + propose stub) | `checkpoint.ts` / WAL / resume → **1.3** |
| Bootstrap CLI (`bin/`) | `confidence.ts` / ledger → **1.4** |
| Skill stub da Déa (1 pergunta) | Déa completa (Gate 0, handoffs, gates, resumo) → **1.5** |
| Scaffold de pastas + `package.json` | Bento/Miguel/Júlia/Zanoni produzindo rascunhos → **1.6** |
| Testes de fronteira + adapter + bootstrap | `schema-core.ts`, `traceability.ts`, `bpmn.ts` → 1.2–1.6 |

A `propose()` aqui é **stub pass-through** (prova AD-1/AD-3 sem implementar commit). O commit real com SHA-256 é a story 1.2 — implementar isso aqui é *scope creep*.

### Paradigma e invariantes binding (não quebre)

- **AD-3 — Núcleo hexagonal (o coração desta história):** o core (`skills/` + `toolkit/src/`) é **engine-agnostic**, dependendo **só** da porta `EngineAdapter`. Cada engine = um adapter. v1: `ClaudeCodeAdapter`. O core **nunca** referencia APIs de engine; o adapter **nunca** interpreta/muta o conteúdo da proposta. [Source: ARCHITECTURE-SPINE.md#AD-3]
- **AD-7 — Distribuição npm + bootstrap:** a instalação é um comando de bootstrap que **usa o `EngineAdapter`** para registrar skills + slash-commands no engine-alvo — sem acoplar o core ao mecanismo de install. [Source: ARCHITECTURE-SPINE.md#AD-7]
- **AD-1 — Propose/Commit (shape toolkit-owned):** o canal de *propose* tem um *shape* **definido pelo toolkit**; o adapter é **pass-through** (roteia sem mutar). Aqui só definimos o *shape* do payload e o roteamento; o commit é 1.2. [Source: ARCHITECTURE-SPINE.md#AD-1]
- **FR-21 — Multi-engine arquitetado-para:** v1 entrega só Claude Code, mas o core já deve estar isolado pela porta para que um 2º engine (pós-v1) não reescreva o core. [Source: PRD §4.9, ARCHITECTURE-SPINE.md#AD-3]

### Contrato da porta `EngineAdapter` (definir em `toolkit/src/engine-adapter.ts`)

O contrato tem **3 capacidades**, direto do spine (AD-3/AD-7): *instalar skills*, *registrar slash-commands*, *expor o canal de propose em modo pass-through*. Assinatura sugerida (TS, ESM):

```ts
// toolkit/src/engine-adapter.ts  — ESTE ARQUIVO NÃO IMPORTA NADA DE ENGINE
export interface ProposePayload {
  // shape toolkit-owned — mínimimo em 1.1; amadurece em 1.2 (commit/SHA-256) e 1.4 (confiança)
  artifactType: string;        // ex.: "sipoc" | "hierarchy" | "bpmn" | "pop" (string p/ 1.1)
  content: unknown;            // corpo proposto pelo agente
  claims?: unknown[];          // afirmações + marcador/fonte propostos (cristaliza em 1.4)
  // NÃO incluir aqui lógica de engine
}

export interface EngineAdapter {
  /** Instala as skills (markdown) do framework no projeto-alvo. */
  installSkills(targetProjectDir: string): Promise<void>;
  /** Registra o(s) slash-command(s) públicos (ex.: /process-ai) no projeto-alvo. */
  registerSlashCommands(targetProjectDir: string): Promise<void>;
  /** Canal de propose em modo PASS-THROUGH: roteia ao toolkit sem mutar o payload. */
  propose(payload: ProposePayload): Promise<unknown>;   // retorno real (commit) é 1.2; aqui é stub
}
```

> O `propose()` é o ponto onde **1.2** vai plugar `commit.ts`. Em 1.1 ele só prova o roteamento sem mutação — pode encaminhar a um logger/echo ou lançar `Error('propose commit not implemented — see story 1.2')` **desde que** o teste de pass-through (T6) valide a não-mutação. Escolha a opção que deixar o teste verde e o sistema "rodável".

### `ClaudeCodeAdapter` — especificidades do engine (pesquisa de docs, 2026)

Mecanismo atual do Claude Code para registrar `/process-ai` **programaticamente** (Node CLI escrevendo arquivos):

- **Skill = slash command:** escrever `.claude/skills/process-ai/SKILL.md` **no projeto-alvo** torna `/process-ai` disponível (skills são invocáveis pelo nome como slash command). **Não exige** plugin manifest.
- **Frontmatter obrigatório da skill:** `name` + `description`. Opcionais úteis: `disable-model-invocation`, `allowed-tools`, `model`, `context`.
- **Escopos:** projeto = `<alvo>/.claude/...`; usuário = `~/.claude/...`. Para o bootstrap v1, use **escopo de projeto** (alvo).
- **Gotcha — workspace trust:** skills no nível de projeto exigem o usuário aceitar o diálogo de *workspace trust* antes de carregar. O bootstrap deve **imprimir esse aviso** (não é falha — é instrução).
- **Sem passo de "enable":** skills carregam automaticamente; `SKILL.md` tem live-reload.
- **Skill vs command (decisão do dev — registre a escolha no Completion Notes):** a porta declara `registerSlashCommands` como capacidade distinta (outro engine pode separar os conceitos). No `ClaudeCodeAdapter`, a skill já entrega `/process-ai`; `registerSlashCommands` pode ser (a) **no-op** documentado, ou (b) escrever um `.claude/commands/process-ai.md` fino que carrega a skill. Escolha **uma** e padronize — a própria BMad installada neste projeto usa o padrão `.claude/skills/`. [Source: docs https://code.claude.com/docs/en/skills.md , https://code.claude.com/docs/en/plugins-reference.md]

### Estrutura alvo (structural seed) — criar estas pastas

```text
process-ai/
  skills/                          # CORE — skills markdown
    process-ai/SKILL.md            # Déa stub (T5)
  toolkit/                         # CORE — Node, ÚNICO escritor
    src/
      engine-adapter.ts            # A PORTA (T2)
    adapters/claude-code/          # ClaudeCodeAdapter v1 (T3)
      adapter.ts
  method-packs/                    # só a pasta em 1.1 (pack é Epic 3)
  bin/
    bootstrap.ts                   # CLI / bootstrap (T4)
  templates/
  package.json  tsconfig.json  .gitignore
```

> Os arquivos `commit.ts checkpoint.ts confidence.ts traceability.ts bpmn.ts schema-core.ts` citados no seed **NÃO são desta história** — pertencem a 1.2–1.6. Não crie stubs além do necessário; a pasta `toolkit/src/` em 1.1 contém só `engine-adapter.ts`. [Source: ARCHITECTURE-SPINE.md#Structural Seed]

### Decisões de stack (registre as escolhas no Completion Notes)

1. **Node.js 24 LTS** (não 18+). O PRD §10 diz "Node.js 18+ (herdado do Reversa)", mas o spine, o solution-design e os epics dizem **24 LTS** — **o Architecture vence** (o item do PRD era `[ASSUMPTION]`). **Use 24 LTS.** [Source: discrepância PRD §10 vs ARCHITECTURE-SPINE.md#Stack — spine vence]
2. **TypeScript** — o seed mostra `engine-adapter.ts` (`.ts`), então TS é a decisão. Node 24 roda TS direto via *type-stripping* (sem build), mas para distribuir via npm convém emitir JS. **Decida:** rodar TS direto em dev (`node bootstrap.ts`) + emitir JS no build (`tsc`/`tsup`), **ou** TS-direto everywhere. Recomendado: build para distribuição.
3. **ESM** (`"type": "module"`) — Node 24 nativo.
4. **Test runner — decisão do dev:** `node:test` (zero deps, alinha ao ethos "determinístico" do toolkit) **ou** `vitest`. Recomendado: `node:test`.

### Enforcement de AD-3 (o teste que impede o desastre)

O teste de fronteira de importação (T6) é **o guardrail mais importante** desta história — é ele que materializa "o core nunca toca engine". Estratégia: varrer o código-fonte sob `toolkit/src/` (ex.: com `node:fs` + regex de `import`/`require` em arquivos `.ts`) e falhar se algum import referenciar:
- `toolkit/adapters/**` (o core não pode depender de um adapter concreto)
- caminhos/APIs típicos de engine (`@anthropic-ai/...`, `claude`, MCP server SDKs, etc.)

Isso garante que um 2º engine (pós-v1) possa ser adicionado **sem reescrever o core** — que é exatamente o teste de aceitação de FR-21/AD-3.

### Convenções (do spine)

- Naming: pastas/arquivos em `kebab-case`; skills prefixadas `process-ai*`; IDs globais estáveis (FR-n, AD-n) — nunca renumerados.
- Configs em **TOML + YAML** (não JSON para config humana); manifestos **SHA-256** (não nesta história).
- Semântico: o framework e os method-packs usam **versionamento semântico**.

### Project Structure Notes

- **Greenfield:** o repositório hoje contém só `_bmad/`, `_bmad-output/`, `docs/` (vazio). Não há código prévio, nem git, nem story anterior — esta é a **primeira escrita de código**. Sem risco de regressão; o risco aqui é **scope creep** (fazer 1.2–1.6 aqui) e **acoplamento core→engine** (violando AD-3).
- **Alvo ≠ framework:** o `ClaudeCodeAdapter` escreve no **diretório-alvo** (`--target`), jamais nas próprias pastas do framework. Manter essa distinção é crítico para o teste de bootstrap.
- **Alinhamento com o seed:** a estrutura acima é fiel ao `ARCHITECTURE-SPINE.md#Structural Seed`, escopada para 1.1. Sem conflitos.

### References

- [Source: ARCHITECTURE-SPINE.md#AD-3] — núcleo hexagonal / porta `EngineAdapter`
- [Source: ARCHITECTURE-SPINE.md#AD-7] — distribuição npm + bootstrap via adapter
- [Source: ARCHITECTURE-SPINE.md#AD-1] — propose/commit, shape toolkit-owned, adapter pass-through
- [Source: ARCHITECTURE-SPINE.md#Stack] — Node 24 LTS · npm · TOML+YAML · Claude Code
- [Source: ARCHITECTURE-SPINE.md#Structural Seed] — layout de pastas
- [Source: SOLUTION-DESIGN.md#Layout de pastas / Stack] — companion (spine vence em conflito)
- [Source: prd.md §4.9 / FR-21] — multi-engine arquitetado-para (v1 só Claude Code)
- [Source: prd.md §10] — "Node 18+" `[ASSUMPTION]` → **overruled pelo spine (24 LTS)**
- [Source: epics.md#Story 1.1] — ACs e user story originais
- [External: https://code.claude.com/docs/en/skills.md] — skills no Claude Code
- [External: https://code.claude.com/docs/en/plugins-reference.md] — manifest de plugin (opcional em 1.1)

## Dev Agent Record

### Agent Model Used

glm-5.2 (via Claude Code harness; skill `bmad-dev-story`).

### Debug Log References

- **Gate Node ≥ 24 (T1):** a primeira checagem encontrou Node `v22.17.0`. HALT acionado conforme o gate explícito da história ("Confirmar `node -v` ≥ 24 antes de seguir") + decisão de stack do spine. Usuário instalou o Node 24 LTS (Opção A — instalador oficial, upgrade in-place em `C:\Program Files\nodejs\`). Re-chequeado: **`v24.18.1`** ✓.
- **`SyntaxError [ERR_INVALID_TYPESCRIPT_SYNTAX]` em `tests/import-boundary.test.ts`:** o comentário de cabeçalho continha o literal `toolkit/src/**/*.ts`; a subsequência `**/` fecha o bloco de comentário prematuramente, e o restante virava código. Corrigido reescrevendo o comentário para evitar a subsequência `*/`. (Nenhum arquivo de produção afetado — bug confinado ao teste.)

### Completion Notes List

**Status dos ACs — todos satisfeitos:**
- **AC1 (Node 24 LTS + scaffold):** `engines.node: ">=24"` declarado em `package.json`; estrutura de pastas criada; `type: module`; `bin.process-ai` apontando para o bootstrap. Verificado em runtime **Node v24.18.1** (não 22). Testes `tests/scaffold.test.ts`.
- **AC2 (`/process-ai` registrável):** `ClaudeCodeAdapter.installSkills` grava `.claude/skills/process-ai/SKILL.md` **no alvo** com frontmatter `name`+`description` válidos. E2E via `node bin/bootstrap.ts --target <tmp>` → exit 0. Testes `tests/adapter.test.ts` + `tests/bootstrap.test.ts`.
- **AC3 (core referencia só a porta):** `toolkit/src/**` depende apenas de `EngineAdapter`. Guardrail `tests/import-boundary.test.ts` falha se algum `.ts` sob `toolkit/src/` importar adapter concreto (`toolkit/adapters/**`) ou API de engine (`@anthropic-ai/`, `@modelcontextprotocol/`, `claude-code`, …).
- **AC4 (adapter pass-through, não muta):** `ClaudeCodeAdapter.propose()` faz echo do payload sem mutação; teste deep-equal + snapshot em `tests/adapter.test.ts`.
- **AC5 (idempotente, não-destrutivo, escopo `.claude/`):** 2× bootstrap → estado idêntico; único artefato criado no alvo é `.claude/`. Testes em `tests/bootstrap.test.ts`.

**Decisões de stack registradas:**
1. **Node 24 LTS** — spine vence PRD §10 (que dizia "18+", marcado `[ASSUMPTION]`). Confirmado `v24.18.1`.
2. **TypeScript + ESM** (`"type": "module"`); `tsconfig.json` com `module/moduleResolution: nodenext`, `strict: true`, `noEmit: true`, `allowImportingTsExtensions: true`.
3. **TS-direto via type-stripping nativo do Node 24** em dev + testes (sem passo de build em 1.1). Imports entre `.ts` usam extensão `.ts` explícita (exigido pelo runtime). Emissão de JS para distribuição npm é **Epic 3**.
4. **Test runner `node:test`** (zero deps de runtime; alinha ao ethos "determinístico"). Suíte: 10 testes, 100% passando; `tsc --noEmit` limpo.
5. **`registerSlashCommands` = no-op documentado** (opção *a* de "Skill vs command"): no Claude Code a skill já é slash-invocável pelo `name`, logo `/process-ai` fica disponível após `installSkills()`. A porta mantém a capacidade distinta porque outra engine pode separar skill≠command.
6. **`propose()` = pass-through echo** (opção recomendada no Dev Notes para manter o sistema "rodável"): roteia sem mutar; commit real com manifesto SHA-256 é a **story 1.2**.
7. **`installSkills` lê a skill-fonte do framework** (`skills/process-ai/SKILL.md`) e a grava no alvo — fonte única de verdade (byte-a-byte). Repositório-raiz localizado via `import.meta.url` a partir de `adapter.ts`.
8. **Dev-deps `typescript` + `@types/node`** — a própria toolchain da stack "TypeScript" decidida na história (sem dependências de runtime; zero risco arquitetural).

**Resultado dos testes:** `node --test` → 10 pass / 0 fail; `npm run typecheck` (tsc --noEmit) → sem erros.

### File List

Arquivos criados (relativos à raiz do repo `process-ai/`):
- `package.json`
- `package-lock.json` (gerado por `npm install`)
- `tsconfig.json`
- `.gitignore`
- `skills/process-ai/SKILL.md`
- `toolkit/src/engine-adapter.ts`
- `toolkit/adapters/claude-code/adapter.ts`
- `bin/bootstrap.ts`
- `tests/import-boundary.test.ts`
- `tests/adapter.test.ts`
- `tests/bootstrap.test.ts`
- `tests/scaffold.test.ts`
- `method-packs/.gitkeep`
- `templates/.gitkeep`

## Change Log

- **2026-08-01** — Implementação completa da Story 1.1 (scaffold + porta `EngineAdapter` + `ClaudeCodeAdapter` + bootstrap CLI + skill stub da Déa + suíte de testes). Walking skeleton rodável ponta-a-ponta: `node bin/bootstrap.ts --target <dir>` registra `/process-ai` no Claude Code via adapter, core isolado pela porta (AD-3 enforceado por teste de fronteira). 10/10 testes passando, typecheck limpo. Status → review.
