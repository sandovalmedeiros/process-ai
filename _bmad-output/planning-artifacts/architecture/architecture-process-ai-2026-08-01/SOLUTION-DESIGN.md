# process-ai — Guia de Arquitetura para Contribuidores

> Companion do `ARCHITECTURE-SPINE.md` (o contrato de invariantes). Este documento *explica* o framework a quem vai contribuir; o spine *binda*. Em caso de conflito, o spine vence.

## O que é o process-ai

O **process-ai** é um framework open-source de agentes de IA que conduz uma pessoa comum — sem formação em processos — por um diálogo de perguntas e respostas até documentar a arquitetura completa dos processos de uma empresa: da cadeia de valor aos diagramas BPMN e aos POPs. Em uma frase: **é o "Reversa dos processos de negócio"** — herda a engenharia do Reversa (rigor de especificação) e o modo de conduzir do BMad (agentes que guiaram um usuário em sessão).

## A ideia central (leia antes de mexer)

Três decisões carregam o modelo inteiro:

1. **Agentes conduzem o leigo; agentes *propõem*, o *toolkit* commita.** Os agentes (skills de IA) conversam com o usuário e rascunham artefatos, mas **nunca escrevem nos arquivos de saída**. Um toolkit Node é o **único escritor** — é lá que mora o rigor (confiança 🟢🟡🔴, rastreabilidade, não-destrutivo, checkpoint).
2. **O núcleo é *engine-agnostic*.** Hoje roda no Claude Code; amanhã pode rodar noutro engine trocando só um *adapter*. O core nunca fala com um engine diretamente.
3. **É *method-agnostic*.** Metodologias (BPMN+SIPOC na v1) são **method-packs** plugáveis — pacotes de *conteúdo*, não de código. Você pode adicionar um método sem tocar no core.

## Os 7 invariantes (o que você não pode quebrar)

Estas regras são **binding** (detalhes e IDs estáveis no spine):

- **AD-1 — Propose/Commit:** agentes só *propõem* por um canal cujo formato o toolkit define; o toolkit é o **único escritor** de `_process-ai_output/` e `.process-ai/`. As skills **não têm** acesso de escrita a essas pastas — o canal de *propose* é a única rota. O adapter apenas **repassa** a proposta, sem mutar.
- **AD-2 — Method-pack é conteúdo que *estende*:** existe um **schema-núcleo** toolkit-owned por tipo de artefato; um pack só **adiciona** campos/conteúdo, nunca redefine o *shape* central. Pack que tenta mudar a pipeline é **rejeitado**.
- **AD-3 — Núcleo hexagonal:** o core depende só da porta `EngineAdapter`. Cada engine = um adapter (v1: `ClaudeCodeAdapter`). Adapter é *pass-through*, nunca interpreta/muta a proposta.
- **AD-4 — Checkpoint autoritativo e atômico:** todo estado vive em `.process-ai/checkpoint`. **Commit + avançar checkpoint são uma transação atômica** (WAL). No `resume`, o checkpoint manda; qualquer manifesto órfão (não referenciado) vai pra **quarentena**, nunca se auto-mergeia.
- **AD-5 — Confiança por fonte *verificável*:** 🟢 exige fonte cuja referência **resolve a um artefato já commitado** (com SHA-256). Fonte fantasma, *forward-ref* ou trecho não-verificável → degrada pra 🟡. O toolkit decide; o agente só propõe.
- **AD-6 — BPMN canônico on-disk:** o arquivo de processo é **BPMN 2.0 XML**, toolkit-owned. Render visual (Mermaid/SVG) é **derivação**, não fonte.
- **AD-7 — Distribuição npm + bootstrap:** instalação é um comando que usa o adapter pra registrar skills/slash-commands no engine — sem acoplar o core ao install de engine.

## Como uma sessão roda

```mermaid
flowchart LR
  U([Usuário leigo]) -->|/process-ai| D1["Déa — escopo · Gate 0"]
  D1 --> B["Bento — descoberta"]
  B -->|Gate 1| M["Miguel — mapeamento"]
  M -->|Gate 2| J["Júlia — modelagem"]
  J -->|Gate 3| Z["Zanoni — padronização"]
  Z -->|Gate 4| D2["Déa — resumo + confiança"]
```

Cada especialista **propõe** seu artefato (com fontes) → o toolkit faz o *stage* (valida marcadores, indexa rastreabilidade) → o **Gate** humano valida (focando nos 🟡/🔴) → na aprovação, o toolkit **commita** (SHA-256 + provenance + ledger de confiança + checkpoint). Ao final, Déa entrega o **resumo + relatório de confiança** em `_process-ai_output/`.

## Como contribuir

**Adicionar um method-pack** (sem tocar no core):
1. Crie `method-packs/<seu-pack>/` com `pack.toml` (nome, versão, notação) + `schemas/` (**extensões** aditivas ao schema-núcleo) + `prompts/` (fragmentos por agente) + `glossary.md`.
2. O pack **só pode estender**; não pode alterar a pipeline, os papéis, o propose/commit nem o schema-núcleo. Se tentar, o validador do toolkit rejeita.
3. Declare o pack ativo em `.process-ai/config`.

**Adicionar um engine adapter** (portar pra outro engine):
1. Implemente a porta `EngineAdapter` (instalar skills, registrar slash-commands, expor o canal de *propose* em **pass-through**).
2. **Nunca** mute o payload da proposta nem referencie APIs de engine no core.

**Trabalhar no toolkit** (o único escritor):
- Qualquer garantia (confiança, rastreabilidade, SHA-256, checkpoint) mora aqui. Mudanças no toolkit afetam **todos** os engines e packs — trate como o ponto mais sensível.

## Layout de pastas

```text
process-ai/
  skills/                 # skills em markdown: process-ai/ (Déa) + process-ai-<especialista>/
  toolkit/                # Node — único escritor (commit, checkpoint, confidence, traceability, bpmn, schema-core)
    adapters/claude-code/ # ClaudeCodeAdapter (v1)
  method-packs/bpmn-sipoc/# pack de conteúdo (pack.toml, schemas/, prompts/, glossary.md)
  bin/                    # CLI / bootstrap (instala via adapter)
# No projeto-alvo:
_process-ai_output/       # artefatos (cadeia, hierarquia, BPMN 2.0 XML, POP, relatórios)
.process-ai/              # estado (checkpoint, config, manifestos SHA-256, ledger, provenance, wal)
```

## Stack

**Node.js 24 LTS** · **npm** · configs **TOML + YAML** · engine v1 **Claude Code** (skills em markdown). BPMN on-disk: **BPMN 2.0 XML**.

## Por onde começar a contribuir

1. Rode uma sessão ponta-a-ponta no wedge (Vendas/PME) pra sentir o fluxo Déa→…→Zanoni.
2. Leia o `ARCHITECTURE-SPINE.md` — os ADs são o que você não pode quebrar.
3. Escolha uma trilha: **method-pack** (baixa barreira, só conteúdo) ou **adapter** (porta outro engine) ou **toolkit** (alto impacto, alta responsabilidade).

---

*Companion de `ARCHITECTURE-SPINE.md` · Derivado do PRD final + brief · v1 (wedge Vendas/PME) · pt-BR.*
