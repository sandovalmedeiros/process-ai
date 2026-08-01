---
name: process-ai
type: architecture-spine
purpose: build-substrate
altitude: feature
paradigm: 'Pipeline de agentes orquestrada com propose/commit e núcleo hexagonal'
scope: 'process-ai v1 — framework OSS de agentes para levantamento de processos (wedge: Vendas/PME)'
status: final
created: 2026-08-01
updated: 2026-08-01
binds:
  - FR-1..FR-21 (PRD)
  - NFRs (Honestidade, Não-destrutividade, Resumabilidade, Portabilidade, Privacidade)
sources:
  - ../../prds/prd-process-ai-2026-08-01/prd.md
  - ../../briefs/brief-process-ai-2026-08-01/brief.md
  - ../../briefs/brief-process-ai-2026-08-01/addendum.md
companions:
  - SOLUTION-DESIGN.md
---

# Architecture Spine — process-ai

## Design Paradigm

**Pipeline de Agentes Orquestrada com *Propose/Commit* e Núcleo Hexagonal.**

- Um *skill condutor* nativo do engine (Déa) orquestra uma **pipeline fixa** de especialistas (Bento→Miguel→Júlia→Zanoni), conduzindo o usuário por Q&A.
- **Agentes só propõem**; um **toolkit Node é o único escritor** (propose/commit) — onde moram as garantias determinísticas.
- O **núcleo é engine-agnostic** (hexagonal / ports-and-adapters); **method-packs são plugins de conteúdo**.
- Herda os padrões do **Reversa** (rigor de especificação) e o modo de conduzir do **BMad** (skills adotadas em sessão).

**Direção de dependência (é uma regra):**

```mermaid
flowchart TD
  subgraph Core["Core — engine-agnostic"]
    SK["Skills: condutor + especialistas (markdown)"]
    TK["Toolkit Node — único escritor"]
    PORT["«port» EngineAdapter"]
  end
  MP["Method-pack — conteúdo plugável"]
  ADP["ClaudeCodeAdapter (v1)"]
  ENG["Engine: Claude Code"]
  OUT[("_process-ai_output/")]
  ST[".process-ai/ estado")]

  SK -->|"propõe via canal (shape toolkit-owned)"| TK
  TK -->|"commit com garantias"| OUT
  TK --> ST
  TK -->|"depende só da porta"| PORT
  ADP -.->|"implementa · pass-through"| PORT
  ENG -.->|"hospeda"| ADP
  MP -.->|"estende conteúdo aditivo"| SK
  TK -.->|"valida contra schema-núcleo"| MP
```

> O Core depende **só da porta** `EngineAdapter`; adapters implementam a porta por engine em modo **pass-through** (nunca mutam a proposta); method-packs são **dados** (linha tracejada) que *estendem* o schema-núcleo.

## Inherited Invariants

Padrões do **Reversa** (arquitetura de referência, do Prof. Sandeco) adotados como *binding* e codificados nos AD-1/3/4/5/6 + convenções:

| Padrão Reversa | Codificado em | Binds aqui |
| --- | --- | --- |
| Garantia não-destrutiva (manifestos SHA-256) | AD-1, AD-4 | FR-20, todo commit |
| Confiança em 3 níveis (🟢🟡🔴) | AD-5 | FR-14/15/16 |
| Rastreabilidade bidirecional | AD-1, AD-5 | FR-15 |
| Checkpoint/resume por etapa | AD-4 | FR-19 |
| Modularidade via slash-commands | AD-3, AD-7 | FR-1 |
| Multi-engine por adaptadores | AD-3 | FR-21 |

**Constraint adicional herdada do PRD (§5):** **Privacidade** — postura "transparência + local opcional" (dados passam pelo provedor do modelo do engine; suporta modelo local quando o engine permite). É binding na escolha de engine/modelo e no design do adapter.

## Invariants & Rules

### AD-1 — Propose/Commit: o toolkit é o único escritor
- **Binds:** todos os agentes; FR-2/4/5/6/9/10/12/13/14/15/16/19/20.
- **Prevents:** agentes divergindo em formato/confiança/rastreabilidade; escrita destrutiva; artefato sem marcador; dois donos do canal de proposta.
- **Rule:** agentes só **propõem** via um **canal estruturado cujo *shape* é definido pelo toolkit** (o toolkit é dono do contrato do canal). O **toolkit Node é o único escritor** de `_process-ai_output/` e `.process-ai/`. **Enforcement estrutural:** as skills são autoradas **sem** acesso de escrita às pastas protegidas — o canal de *propose* é a única rota; o adapter é **pass-through** (roteia o canal ao toolkit **sem mutar** o payload). Em todo commit o toolkit aplica: manifesto **SHA-256**, **provenance**, **validação do marcador de confiança**, **índice de rastreabilidade**, **avanço atômico do checkpoint (AD-4)**. Gates humanos ocorrem sobre o *stage* (antes do commit final).

### AD-2 — Method-pack é plugin de conteúdo que *estende* um schema-núcleo
- **Binds:** FR-17/18; todos os skills dos agentes.
- **Prevents:** dois packs com schemas incompatíveis; um plugin divergindo a pipeline/papéis/garantias; resume revalidando artefato contra o pack errado.
- **Rule:** existe um **schema-núcleo toolkit-owned e versionado** para cada tipo de artefato (SIPOC, hierarquia, BPMN, POP). Method-packs **só estendem aditivamente** (campos/conteúdo method-specific; nunca redefinem o *shape* central). O pack ativo é declarado em `.process-ai/config`. Pack que tenta mudar a pipeline ou o schema-núcleo é **rejeitado** pelo validador (que existe no toolkit, **não deferido**). O **checkpoint registra `pack_id` + versão por artefato**, para o resume validar contra o pack correto. v1 = estrito.

### AD-3 — Núcleo hexagonal (ports-and-adapters no engine)
- **Binds:** FR-1/21; todo código que toca engine.
- **Prevents:** core acoplado a um engine; reescrever o core ao trocar de engine; adapter mutando propostas e neutralizando o gate do toolkit.
- **Rule:** o core (skills + toolkit) é **engine-agnostic**, dependendo só da porta `EngineAdapter` (contrato: instalar skills, registrar slash-commands, expor o canal de *propose* em modo **pass-through**). Cada engine = um adapter. **v1: `ClaudeCodeAdapter`.** O core **nunca** referencia APIs/especificidades de engine; o adapter **nunca** interpreta/muta o conteúdo da proposta.

### AD-4 — Checkpoint = fonte autoritativa; commit+checkpoint atômicos
- **Binds:** FR-19; todos os estágios/gates.
- **Prevents:** estado implícito no contexto (perdido no resume); órfão pós-crash; duplicação/inconsistência no resume; condição de corrida sobre `.process-ai/`.
- **Rule:** todo estado de sessão vive em `.process-ai/checkpoint` (estágio atual, artefatos commitados, decisões dos gates). O **checkpoint é a fonte autoritativa**; os manifestos em `_process-ai_output/` são **evidência verificada contra o checkpoint** (não fonte concorrente). **Commit (escrever artefato) + avançar checkpoint são uma transação atômica** (WAL: grava-se a intenção antes de aplicar). `resume` é função **pura** do checkpoint: qualquer manifesto **não referenciado** pelo checkpoint é posto em **quarentena** (nunca auto-mergeado). Escrita em `.process-ai/` é **single-writer** (o toolkit serializa).

### AD-5 — Confiança atribuída por fonte *verificável* (mecânico)
- **Binds:** FR-14/15/16.
- **Prevents:** o LLM marcando 🟢 em afirmação sem fonte; ref fantasma/forjada/forward-ref passando por 🟢.
- **Rule:** o toolkit atribui o nível por regra: **🟢 exige uma fonte cuja referência RESOLVE a um artefato já commitado** (entrevista persistida ou documento em `.process-ai/`/`_process-ai_output/`, com seu próprio SHA-256) — opcionalmente com checagem de trecho. **Sem fonte verificável → 🟡** no máximo; processo não-determinado → **🔴**. Referências fantasmas, forward-refs (fonte ainda não commitada) ou trechos não-verificáveis **falham e degradam a 🟡**. O agente *propõe* nível + fonte; o toolkit **valida** e grava no ledger com a fonte linkada (rastreabilidade).

### AD-6 — Formato on-disk do BPMN é canônico e toolkit-owned
- **Binds:** FR-10; consumidores downstream do BPMN.
- **Prevents:** dois packs emitindo BPMN em formatos incompatíveis (XML vs Mermaid vs outro); dois donos do formato.
- **Rule:** o formato **on-disk canônico** do BPMN é **BPMN 2.0 XML**, **toolkit-owned** (não definido pelo pack). O pack especifica **convenções de notação** (estilos, nomenclatura), mas **não** o formato do arquivo. Qualquer *render* visual (Mermaid, SVG, diagrama) é uma **derivação** a partir do XML canônico — nunca a fonte. (Biblioteca específica de render permanece *Deferred*.)

### AD-7 — Distribuição via npm; instalação por bootstrap via adapter
- **Binds:** FR-1; SM-3 (adoção); envoltória operacional (distribuição/install do OSS).
- **Prevents:** ambiguidade sobre como o framework chega ao usuário; processo de install acoplado a um engine.
- **Rule:** o framework é distribuído como **pacote npm**. A instalação é um **comando de bootstrap** que usa o `EngineAdapter` (v1: `ClaudeCodeAdapter`) para **registrar os skills e slash-commands** no engine-alvo — sem acoplar o core ao mecanismo de install de nenhum engine.

## Consistency Conventions

| Concern | Convention |
| --- | --- |
| Naming | arquivos/pastas em `kebab-case`; skills prefixados `process-ai-*`; agentes como personas (Déa/Bento/Miguel/Júlia/Zanoni); IDs globais estáveis (FR-n, AD-n, UJ-n) — nunca renumerados. |
| Data & formats | artefatos em **markdown** + schemas **TOML/JSON**; **BPMN 2.0 XML** on-disk (AD-6); manifestos **SHA-256**; configs **TOML** (`pack.toml`, config) + **YAML**; envelope de erro canônico a definir pelo toolkit (*Deferred*). |
| State & cross-cutting | checkpoint atômico + single-writer (AD-4); `resume` idempotente com quarentena de órfãos; logs de provenance em `.process-ai/`; **versionamento semântico** (framework + method-packs). |

## Stack

| Name | Version |
| --- | --- |
| Node.js | 24 LTS |
| Package manager | npm |
| Configs | TOML + YAML |
| Engine v1 | Claude Code (skills em markdown) |

## Structural Seed

```text
process-ai/
  skills/                 # CORE — skills em markdown (condutor + especialistas)
    process-ai/SKILL.md        # Déa — entrypoint /process-ai, orquestra pipeline
    process-ai-bento/SKILL.md  # ...especialistas (adotados em sessão, BMad-style)
  toolkit/                # CORE — Node, ÚNICO escritor (propose/commit + garantias)
    src/
      engine-adapter.ts        # «porta» EngineAdapter (pass-through)
      commit.ts checkpoint.ts confidence.ts traceability.ts bpmn.ts schema-core.ts
    adapters/claude-code/      # ClaudeCodeAdapter (v1)
  method-packs/           # PLUGINS DE CONTEÚDO — estendem o schema-núcleo (aditivo)
    bpmn-sipoc/                # pack.toml, schemas/ (extensões), prompts/, glossary.md
  bin/                    # CLI / bootstrap (instala via adapter)
  templates/

# No projeto-alvo (gerado pelo toolkit):
_process-ai_output/       # artefatos: cadeia de valor, hierarquia, BPMN 2.0 XML, POP, relatórios
.process-ai/              # estado: checkpoint, config, manifestos SHA-256, ledger confiança, provenance, wal
```

**Pipeline orquestrada (cada especialista *propõe* → toolkit *commita*; gates sobre o stage):**

```mermaid
flowchart LR
  U([Usuário leigo]) -->|/process-ai| D1["Déa — escopo · Gate 0"]
  D1 --> B["Bento — descoberta"]
  B -->|Gate 1| M["Miguel — mapeamento"]
  M -->|Gate 2| J["Júlia — modelagem"]
  J -->|Gate 3| Z["Zanoni — padronização"]
  Z -->|Gate 4| D2["Déa — resumo + confiança"]
```

## Capability → Architecture Map

| Capability / FR | Lives in | Governed by |
| --- | --- | --- |
| FR-1 `/process-ai` inicia | `skills/process-ai/SKILL.md` + `ClaudeCodeAdapter` + bootstrap | AD-3, AD-7 |
| FR-2 escopo / Gate 0 | skill condutor (Déa) | AD-1 |
| FR-3 orquestra handoffs | skill condutor | AD-4 |
| FR-4 Gates 1–4 | skill condutor + toolkit (stage) | AD-1, AD-4 |
| FR-5 resumo + relatório confiança | toolkit (do ledger) | AD-1, AD-5 |
| FR-6 entrevista (Bento) | `skills/process-ai-bento` + pack prompts | AD-2 |
| FR-7 SIPOC · FR-8 cadeia de valor | skill Bento + schema-núcleo + pack | AD-1, AD-2 |
| FR-9 hierarquia (Miguel) | skill Miguel + schema-núcleo + pack | AD-1, AD-2 |
| FR-10 BPMN · FR-11 gargalos (Júlia) | skill Júlia + pack + toolkit (BPMN XML) | AD-1, AD-2, AD-5, AD-6 |
| FR-12 POP · FR-13 diagnóstico (Zanoni) | skill Zanoni + schema-núcleo + pack | AD-1 |
| FR-14 confiança · FR-15 rastreabilidade · FR-16 relatório | toolkit (atribuição + índice + ledger) | AD-1, AD-5 |
| FR-17 carregar packs · FR-18 pack padrão | toolkit (validador) + `method-packs/bpmn-sipoc` | AD-2 |
| FR-19 checkpoint/resume | toolkit (checkpoint atômico + quarentena) | AD-4 |
| FR-20 não-destrutivo | toolkit (SHA-256, único escritor, enforcement estrutural) | AD-1 |
| FR-21 multi-engine | porta `EngineAdapter` (pass-through) | AD-3 |

## Deferred

- **Biblioteca de render BPMN** (Mermaid/SVG a partir do XML canônico AD-6) — *code owns*.
- **Envelope de erro canônico** — a definir pelo toolkit na implementação.
- **Política de versionamento detalhada** — SemVer é o princípio (Convenções); cadência/breaking-change → depois.
- **Performance budgets** — PRD tem provisório (60–90 min / ≤30 turnos); calibrar no piloto.
- **UX do resume por engine** + **campos exatos das extensões de schema do method-pack** — *code owns*.
