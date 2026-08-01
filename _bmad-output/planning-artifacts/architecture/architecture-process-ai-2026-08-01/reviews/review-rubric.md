# Review — ARCHITECTURE-SPINE.md (process-ai) × good-spine checklist

**Data:** 2026-08-01 · **Altitude revisada:** feature spine (substrato de implementação) · **Idioma:** pt-BR

## Veredito geral

O spine é forte onde precisa ser determinístico — AD-1/4/5 codificam propose/commit, checkpoint atômico e confiança-por-fonte de forma *enforceable*, e o Capability Map cobre as 21 FRs sem lacunas. Mas quatro pontos permitem divergência real entre unidades de implementação: o **contrato do canal de *propose*** (a interface load-bearing agente↔toolkit) está apenas implícito; **AD-2 invoca um mecanismo de rejeição cujo schema validador está deferido**; a **envoltória operacional (distribuição/install, concorrência de sessão, migração de estado)** é uma dimensão silenciosa; e a **NFR de Privacidade do PRD (§5) não aparece no spine**. Tech nomeado (Node 24 LTS "Krypton") verifica como *current*; 24.18.0 é LTS real (24.18.1 já é *latest* — drift irrelevante).

---

## Findings

### [high] Contrato do canal de *propose* só está implícito (AD-1 + AD-5)
**Note.** O paradigma central é "agentes propõem, toolkit commita". O lado *commit* é bem especificado (manifesto SHA-256, provenance, validação do marcador, índice, avanço atômico). O lado *propose* — a interface que separa a unidade "skill do agente" da unidade "toolkit Node" — está apenas implícito: AD-1 diz "propõe conteúdo via canal estruturado" e AD-5 acrescenta "o agente propõe nível + fonte". O *payload mínimo* (conteúdo + nível de confiança proposto + citação de fonte + alvo/artefato + etapa) é deduzível, mas o spine não fixa nem o conjunto de campos nem quem define o formato do envelope (deferido como "envelope de erro canônico a definir pelo toolkit"). Como skill-author e toolkit-author são duas unidades de implementação, cada um pode escolher um formato diferente — exatamente o tipo de divergência que o spine existe para impedir.
**Fix.** Promover o *payload mínimo do propose* a seção própria no spine (não ao código): declarar os campos obrigatórios que toda mensagem propose carrega — `target_artifact`, `stage`, `content`, `proposed_confidence`, `source_ref` — e deixar apenas a sintaxe (TOML/JSON/estrutura do tool-call) ao código. Isso torna AD-1 auto-contido e *enforceable* sem ambiguidade de fronteira.

### [high] AD-2 referencia um mecanismo de rejeição cujo schema está deferido (AD-2 + Deferred)
**Note.** A Rule de AD-2 afirma: "Pack que tenta mudar a pipeline é **rejeitado**". Mas a validação que materializa essa rejeição depende do *schema do method-pack*, que está em **Deferred** ("campos exatos do schema do method-pack — *code owns*"). Não é possível rejeitar o que não se pode validar; logo a Rule, como escrita, não é *enforceable* hoje — dois implementadores podem interpretar "content-only" com fronteiras diferentes (um aceita campos de prompt livre, outro rejeita; um aceita metadados de stage, outro não). Isso viola diretamente o critério "Every AD's Rule is enforceable".
**Fix.** Decidir no spine a **fronteira** do schema (não os campos exatos): enumerar as *categorias* de campo que um pack pode carregar (ex.: `prompts/`, `schemas/`, `notation`, `glossary`) e declarar explicitamente que **nenhum campo do pack nomeia stages, agentes, gates ou a ordem da pipeline**. Campos exatos continuam no código; a *fronteira de rejeição* sobe para o spine, tornando AD-2 *enforceable*.

### [high] AD-1 "único escritor" tem enforcement ambíguo (AD-1)
**Note.** AD-1 previne "escrita destrutiva; artefato sem marcador; alucinação de processo passando por confirmado" via "toolkit é o único escritor". Mas em Claude Code (engine v1) um agente/skill tem ferramentas de escrita disponíveis por padrão. O spine não diz *como* o status de "único escritor" é garantido: (a) o `ClaudeCodeAdapter` remove/restringe permissões de escrita das skills dos agentes, ou (b) o texto da skill é o contrato e o agente é confiado para só chamar o canal de propose? As duas leituras conduzem a implementações divergentes — uma com gate de permissão mecânico, outra com soft-compliance — e só uma delas materializa de fato a prevenção declarada.
**Fix.** AD-1 deve declarar o *mecanismo de enforcement*: indicar se o `EngineAdapter` (AD-3) é responsável por confinar a escrita das skills ao canal de propose (e.g., não expõe Write direto ao agente), ou se o invariant repousa na instrução da skill. Sem isso, "único escritor" é asserção, não invariant *enforceable*.

### [high] Dimensão operacional silenciosa: distribuição / instalação (Stack + Structural Seed)
**Note.** O checklist pede para explicitar a *envoltória operacional/environmental* (deployment, infra, operações). Para um framework OSS cuja métrica de sucesso SM-3 é *installs/stars*, o **modelo de distribuição e instalação é o deployment** — e está ausente. O spine mostra `bin/` (CLI/bootstrap) e `adapters/claude-code/`, mas não declara: o usuário instala via `npm install -g`? `npx`? clone + symlink? Como o slash-command `/process-ai` é **registrado** no engine-alvo (Claude Code descobre skills em `.claude/skills/` — é lá que o adapter instala, ou aponta para outro path)? Sem isso, dois implementadores (bootstrap/CLI vs. adapter) podem construir caminhos de install inconsistentes, e o usuário leigo (UJ-1) fica sem caminho garantido.
**Fix.** Adicionar uma linha de decisão na seção Stack ou Structural Seed: canal de distribuição (npm), superfície de instalação (onde o adapter deposita skills/slash-commands no projeto-alvo) e pré-requisitos (Node 24, Claude Code v1). Isso é *deployment envelope*, não detalhe de código.

### [medium] Concorrência / locking sobre `.process-ai/` não tratada (AD-4)
**Note.** AD-4 declara o checkpoint "única fonte de verdade" e o avanço "atômico", mas não diz o que acontece se duas sessões do process-ai rodarem no mesmo projeto-alvo (mesmo `.process-ai/` e `_process-ai_output/`). Sem invariant de "uma sessão viva por projeto" ou de locking, duas sessões podem corromper o checkpoint atomicamente avançado — divergência real num cenário plausível (usuário reabre o terminal, esquece da sessão anterior).
**Fix.** Declarar o invariant: v1 = **uma sessão ativa por projeto-alvo** (registra um *lockfile* em `.process-ai/` no início, remove no encerramento); segunda invocação aborta com erro canônico. Locking real é código; a política de single-session é spine.

### [medium] NFR de Privacidade do PRD não refletida no spine (PRD §5 × Invariants)
**Note.** O PRD carrega uma NFR de privacidade com postura explícita ("transparência + local opcional": dados passam pelo provedor do modelo do engine, *e* suporta modelo local via engine quando permitido; nenhum dado a terceiros além do engine/modelo do usuário). Nenhum AD ou convenção do spine reflete isso. A postura é *quase* coberta por AD-1 (escrita só em duas pastas locais) — mas "sem envio a terceiros" e "local opcional via engine" não decorrem de AD-1; dependem de o core nunca chamar serviços de terceiros e de o `EngineAdapter` expor a capacidade de modelo local. Se duas unidades (toolkit e adapter) não virem essa exigência no spine, podem introduzir telemetria ou assumir que local é default.
**Fix.** Adicionar uma convenção curta em *State & cross-cutting* ou uma nota em AD-3: "o core não faz chamadas de rede exceto via engine/modelo configurado pelo usuário; suporte a modelo local é exposto como capacidade do adapter (não do core)".

### [medium] Migração de estado entre versões ausente (Consistency Conventions — versionamento)
**Note.** A convenção declara "versionamento semântico (framework + method-packs)" e a política detalhada de quebra está *Deferred*. Mas não há regra sobre como o **estado persistido** (`.process-ai/` checkpoint, manifestos, ledger) sobrevive a um *bump* de versão do framework ou do pack. Para um OSS que itera, uma quebra de schema no checkpoint quebra o *resume* (AD-4) — exatamente o invariant que o spine protege. Sem regra de compatibilidade/migration, duas versões podem divergir sobre o formato do checkpoint.
**Fix.** Uma linha no spine: "o formato do checkpoint é estável dentro do major; mudanças breaking exigem rotina de migration explícita nomeada no CHANGELOG". Mecânica de migration é código; o compromisso de estabilidade é spine.

### [low] `EngineAdapter` pode ficar "Claude-Code-shaped" (AD-3)
**Note.** A porta `EngineAdapter` é definida por sua única implementação v1 (`ClaudeCodeAdapter`), e o spine lista três operações (instalar skills, registrar slash-commands, expor canal de propose). O PRD é honesto (FR-21: "validado quando houver 2º engine"), mas a lista de operações da porta pode estar incompleta — engines futuros podem exigir, p.ex., exposição de modelo/permissions/tool-registry que não aparecem aqui. Não é defeito agora (1 adapter), mas é o clássico *port shaped by its first implementation*.
**Fix.** Nota explícita de que a porta é *provisional* até o 2º engine, e que a lista de operações pode crescer (incl. capacidades de permissionamento — ligação com o finding do enforcement de AD-1).

### [low] Mecanismo de atomicidade do checkpoint não nomeado (AD-4)
**Note.** AD-4 diz "avança atomicamente" sem indicar o mecanismo (temp+rename, fsync, transação). "Atômico" como invariant está correto para o altitude do spine; o mecanismo é código. Risco baixo, mas vale registrar que *resume* em crash mid-write depende do mecanismo ser correto — flag para a implementação, não divergência entre unidades.
**Fix.** Nada a mudar no spine; garantir na implementação (write-to-temp + atomic-rename + fsync).

### [low] Semântica de loop pós-rejeição de gate não especificada (AD-1 × Pipeline)
**Note.** AD-1 afirma "Gates humanos ocorrem sobre o stage (antes do commit final)" e o fluxo da pipeline mostra Gate 1–4 entre especialistas. Mas o spine não diz o que acontece quando um gate **rejeita**: o especialista re-propõe? o usuário edita direto? o stage retrocede? É um pequeno loop que, deixado implícito, pode ser implementado de dois modos por unidades diferentes.
**Fix.** Uma cláusula em AD-1 ou na Pipeline: "rejeição no gate mantém o estágio atual; o especialista re-propõe até o gate aprovar (ou o usuário aborta)". Não há commit até aprovação.

---

## Cobertura do checklist (sumário)

| Critério | Resultado |
| --- | --- |
| Fixa os pontos de divergência reais do nível abaixo | Parcial — propose-channel e schema do pack são divergências não-fixadas (findings 1, 2) |
| Toda Rule de AD é *enforceable* e previne a divergência declarada | AD-1 (enforcement ambíguo), AD-2 (schema deferido) — findings 2, 3 |
| Nada em Deferred permite divergência entre unidades | Schema do method-pack e envelope de erro permitem — findings 1, 2 |
| Tech nomeada é *verified-current* | Sim — Node 24 LTS "Krypton" é current (24.18.0 real; 24.18.1 é latest, drift irrelevante) |
| Cobre as capacidades do PRD (FR-1..21) | Sim — todas as 21 FRs mapeadas no Capability Map; NFR de Privacidade é a lacuna (finding 7) |
| Toda dimensão do altitude decidida/deferida/open | Envoltória operacional (distribuição/install) é silenciosa — finding 4 |

## Contagem por severidade
- **Critical:** 0
- **High:** 4 (propose-channel implícito · AD-2 schema/rejeição · enforcement de AD-1 · distribuição/install)
- **Medium:** 3 (concorrência/locking · NFR privacidade · migração de estado)
- **Low:** 3 (formato da porta · atomicidade do checkpoint · loop de rejeição de gate)

## Nota positiva
AD-5 (confiança por presença de fonte, mecânica e rejeitando 🟢 sem fonte) é o AD mais bem escrito do spine — previne exatamente a divergência que nomeia ("LLM marcando 🟢 sem fonte") com um teste mecânico claro, e conecta-se ao ledger de rastreabilidade. Serve de modelo para o nível de *enforceability* que os findings 1–3 pedem para os demais ADs.
