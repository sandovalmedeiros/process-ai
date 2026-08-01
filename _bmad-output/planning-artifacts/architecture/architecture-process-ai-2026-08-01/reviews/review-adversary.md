---
review: adversary
target: ARCHITECTURE-SPINE.md (process-ai v1, 2026-08-01)
reviewer: arquiteto adversário
verdict: REPROVADO — spine tem base sólida, mas 5 pares incompatíveis sobrevivem a todos os ADs
date: 2026-08-01
language: pt-BR
---

# Review Adversário — process-ai v1 Spine

## Veredito: REPROVADO (com base aproveitada)

A coluna é enxuta e os cinco ADs são coerentes *entre si* no nível do paradigma. O ataque abaixo não os quebra internamente — ele constrói **duas unidades uma camada abaixo** (dois method-packs, dois adapters, duas leituras de resume, dois skills) que **cada uma obedece a todos os ADs à risca** e ainda assim **constróem de forma incompatível**. Cada par revela um **furo** na coluna: um contrato não-pinhado, uma entidade com dois donos, uma contradição literal. Cinco pares foram construídos; **todos os cinco sobrevivem**. Quatro são HIGH+ e exigem AD novo ou apertado antes de qualquer implementação.

Método: para cada AD, procurar (a) entidade com dono ambíguo entre ADs, (b) contrato nomeado mas não-pinhado, (c) palavra que admite duas leituras que ambos os lados podem alegar como "obediência", (d) interação com `Deferred` que reabre uma decisão.

---

## Par 1 — [CRÍTICO] Dois donos do canal de *propose* (adapter vs toolkit)

**O par:** `ClaudeCodeAdapter` (v1) vs um hipotético `OpenCodeAdapter` (v1.1) — ou, equivalentemente, dois skills que consomem o canal.

- **Como cada um obedece aos ADs:**
  - AD-3 diz que o adapter "expõe o canal de *propose*" (o contrato da porta é: *instalar skills, registrar slash-commands, expor o canal de propose*). Logo, o adapter é **donos legítimo** do formato do canal.
  - AD-1 diz que "agentes só propõem conteúdo via canal estruturado **ao toolkit**" e o toolkit é o único escritor. Logo, o toolkit é **donos legítimo** do canal.
  - Ambos corretos. Nenhum AD desambigua.
- **Como ainda divergem:** O `ClaudeCodeAdapter` implementa o canal como *callback* de slash-command com payload `{stage, artifactJson, level, sourceRef, agentId}`. O `OpenCodeAdapter` implementa como *file-watch* em `.process-ai/propose-queue/*.json` com `{stage, artifactPath, level, citation, provenance}`. Os dois adapters **implementam a porta fielmente** (AD-3 ✓: nenhum referencia API de engine no core), mas a porta nunca pinou o *shape* do canal — só que ele "existe". Resultado: um skill de agente escrito para um adapter quebra no outro; e pior, o adapter que "expõe" o canal pode, sob a leitura literal de AD-3, **mutar** a proposta (preencher `level`, descartar campos) antes de relançar ao toolkit — AD-3 não proíbe mutação no canal que ele próprio expõe. Isso neutraliza silenciosamente a "validação mecanicista" do toolkit (AD-5), porque o adapter pode injetar a fonte que faltava.
- **AD a fechar:** **Apertar AD-3 + novo sub-AD de contrato de canal.** O canal de *propose* é **propriedade do toolkit**, não do adapter. A porta `EngineAdapter` reduz-se a três operações *surdas*: (i) instalar skills, (ii) registrar slash-commands, (iii) **repassar** a proposta do agente ao toolkit **sem inspeção nem mutação** (pass-through byte-a-byte ou envelope assinado). O *shape* do payload do canal é definido pelo toolkit e é o **mesmo para todo engine**. Um adapter que tocar no conteúdo da proposta viola AD-3.

---

## Par 2 — [ALTO] Dois method-packs com schemas de artefato incompatíveis (sem núcleo canônico)

**O par:** `method-packs/bpmn-sipoc-vendas` vs `method-packs/bpmn-sipoc-saude` — ambos declarados válidos por AD-2.

- **Como cada um obedece aos ADs:**
  - AD-2: cada pack é *content-only* — só parametriza "schemas, prompts, notação, glossário". Nenhum altera pipeline, papéis, propose/commit ou garantias. Nenhum "tenta mudar a pipeline" (logo, nenhum é rejeitado). Ambos ✓.
  - AD-1: o toolkit "valida contra MP" (linha tracejada do diagrama). Cada commit é validado contra o pack **ativo**. Ambos os packs definem um schema SIPOC válido.
- **Como ainda divergem:** O pack-vendas define SIPOC como `{fornecedores, entradas, processo, saidas, clientes}` (campos em pt-BR, `processo` como string livre). O pack-saude define como `{supplier, input, processStep, output, customer}` (EN, `processStep` como objeto com `id`/`nome`/`ciclo`). Ambos *content-only*, ambos legais. Mas:
  1. **Artefatos de um não validam contra o schema do outro** — uma sessão que troca de pack (ou um contribuidor que importa um artefato de outro pack) tem SIPOC rejeitado ou silenciosamente renomeado.
  2. **O checkpoint (AD-4) registra "estágio atual, artefatos commitados, decisões dos gates" — mas não registra a versão do pack nem do schema sob a qual cada artefato foi commitado.** Logo, após troca de pack mid-sessão, o `resume` revalida artefatos antigos contra o schema **novo** e os invalida (ou o toolkit os aceita porque AD-1 valida só o marcador de confiança, criando artefatos órfãos de schema). As duas leituras são igualmente compatíveis com os ADs atuais.
  3. AD-2 diz que o pack "parametriza schemas" — o verbo sugere que o pack **define** o schema. Mas o Deferred lista "campos exatos do schema do method-pack" como *code owns*. **Há colisão de propriedade**: AD-2 dá o schema ao pack; o Deferred dá ao code. Não há schema *núcleo* canônico pertencente ao toolkit.
- **AD a fechar:** **Apertar AD-2 + novo AD de Schema de Artefato.** (a) Existe um **schema-núcleo de artefato pertencente ao toolkit** (campos obrigatórios e tipos, estáveis, versionados pelo framework). Method-packs só **estendem** (campos adicionais, aditivos, nunca renomeiam/removem campos do núcleo). (b) Cada artefato commitado registra no checkpoint o **`pack_id` + `schema_version`** sob o qual foi validado; o `resume` revalida contra **essa** versão, não contra o pack corrente. (c) Resolver a colisão: o Deferred "campos exatos do schema do method-pack" passa a significar "campos de **extensão** do pack"; o núcleo é toolkit-owned.

---

## Par 3 — [ALTO] Checkpoint vs manifesto órfão após crash (contradição literal em AD-4)

**O par:** `resume-checkpoint-first` vs `resume-manifests-inclusive` — duas implementações legítimas do `resume`, ambas conformes a AD-4.

- **Como cada um obedece aos ADs:**
  - AD-1: o commit aplica manifesto SHA-256 → **depois** "avanço atômico do checkpoint". Ou seja, artefato+manifesto são escritos **antes** do checkpoint avançar; a atomicidade é do checkpoint, não do par (commit+checkpoint).
  - AD-4: "checkpoint = única fonte de verdade da sessão" **e**, na mesma frase, "`resume` é função pura do checkpoint **+ manifestos** em `_process-ai_output/`". Duas frases, duas fontes.
- **Como ainda divergem:** Crash entre a escrita do manifesto e o avanço do checkpoint → existe um **manifesto órfão** (artefato+SHA-256 no output, checkpoint ainda no estágio N-1).
  - **Unidade A** (`resume-checkpoint-first`) lê "única fonte de verdade" literalmente: checkpoint diz N-1, então o estágio N não aconteceu; ela **reexecuta** o estágio N e produz um **novo** artefato. Agora há **dois artefatos** para o mesmo estágio com SHA-256 diferentes no output — viola não-destrutividade/traceabilidade (AD-1/AD-4), mas a própria unidade A não violou nada; a **coluna** permitiu o órfão.
  - **Unidade B** (`resume-manifests-inclusive`) lê "checkpoint + manifestos" literalmente: vê o órfão, considera o commit válido, retoma do estágio N (pula a reexecução). Também conforme.
  - Ambas obedecem a AD-4 — porque AD-4 se contradiz. "Única fonte de verdade" (uma fonte) **vs** "checkpoint + manifestos" (duas fontes) não podem coexistir sem regra de precedência.
- **AD a fechar:** **Apertar AD-4.** (a) Declarar precedência explícita: **checkpoint é autoritativo para progresso/estágio; manifestos são autoritativos para integridade de artefato**. Em conflito (manifesto sem entrada no checkpoint), o órfão é **garbage** e uma varredura de recuperação o **quarentena** (move para `.process-ai/orphans/`), nunca o aceita nem o apaga. (b) Tornar commit+checkpoint **uma transação atômica** via *write-ahead log* em `.process-ai/wal/`: o toolkit grava a intenção de commit, escreve artefato+manifesto, e só então avança o checkpoint + apaga a intenção. Crash → a recuperação aplica ou descarta a intência de forma determinística. (c) Remover a contradição: trocar "checkpoint + manifestos" por "checkpoint (que referencia os manifestos)".

---

## Par 4 — [ALTO] 🟢 com fonte "registrada" porém não-verificável (referência pendente ou balizada)

**O par:** skill `process-ai-bento` (propõe) vs leitor do ledger de confiança (consome) — ambos conformes a AD-5.

- **Como cada um obedece aos ADs:**
  - AD-5: 🟢 exige "fonte citada **e registrada** (entrevista persistida ou documento) no commit"; o toolkit "valida (rejeita 🟢 sem fonte) e grava no ledger com a fonte linkada". A regra é **mecânica, por presença**.
  - Bento propõe `{level: 🟢, source: {ref: "entrevista-2026-08-01.md", excerpt: "..."}}`. O toolkit valida **presença**: campo `source` não-vazio, `ref` não-vazio → aceita 🟢 e grava no ledger. Conforme AD-5 ✓.
- **Como ainda divergem:** AD-5 não exige que (a) o `ref` aponte para um artefato **efetivamente commitado pelo toolkit**, nem (b) que o `excerpt` **realmente exista** no arquivo citado, nem (c) que a fonte esteja commitada **antes** da afirmação que a cita. Logo, três falhas sobrevivem ao gate "mecânico por presença":
  1. **Fonte fantasma:** `ref` aponta para caminho que existe no disco mas nunca passou pelo propose/commit (arquivo solto) — "registrada" no sentido fraco, não no sentido "persistida pelo toolkit".
  2. **Trecho forjado:** o arquivo existe e foi commitado, mas o `excerpt` é paráfrase/fabricação — o gate de presença não verifica conteúdo, então 🟢 passa com citação inventada.
  3. **Referência cruzada forward:** a fonte está sendo commitada **no mesmo lote** da afirmação — no momento da validação, a fonte ainda não está no output; AD-5 não define ordenação, então o toolkit ou aceita a forward-ref (fonte não-persistida ao validar) ou a rejeita, e ambos são "validar" sob a letra do AD.
  - Um consumidor downstream (relatório de confiança FR-16, ou auditoria) que tentar **back-resolver** o link do ledger para o trecho real descobre que 🟢 foi emitido sobre uma fonte não-verificável — exatamente o "alucinação de processo passando por confirmado" que AD-1 diz *Prevent*.
- **AD a fechar:** **Apertar AD-5.** "Registrada" passa a significar **mecanicamente verificável**: (a) `source.ref` **deve resolver** para um artefato já commitado pelo toolkit em commit **anterior** (proibida referência forward e proibida referência a arquivo fora do output); (b) o commit registra o **SHA-256 do artefato-fonte** junto ao link (não só o path) — back-pointer verificável, não string livre; (c) o `excerpt`, se presente, é **hashado** e o hash é checado contra uma janela do arquivo-fonte (verificação de presença de conteúdo, não só de arquivo); falha → degrada para 🟡 automaticamente e registra a degradação no ledger. (d) Explicitar que AD-5 valida **provenance da fonte**, não só presença de campo.

---

## Par 5 — [MÉDIO] Formato do artefato BPMN divergente (Deferred reabre AD-2)

**O par:** method-pack que emite BPMN como **BPMN 2.0 XML** vs method-pack que emite como **Mermaid `flowchart`** — ambos "content-only".

- **Como cada um obedece aos ADs:**
  - AD-2: "notação" é lista explícita do que o pack parametriza. Um pack escolhe notação BPMN-XML; outro, Mermaid. Ambos *content-only* ✓.
  - AD-1: o toolkit valida marcador de confiança, manifesto, provenance, rastreabilidade — **não valida formato do artefato** (formato é `Deferred`: "formato exato... *code owns*").
  - Deferred explicitamente deixa o formato em aberto; logo, emitir qualquer um dos dois é conforme.
- **Como ainda divergem:** O consumidor downstream de "o artefato BPMN" (POP do Zanoni em FR-12, diagnóstico FR-13, relatório FR-16) recebe **representações semanticamente incompatíveis**: XML BPMN 2.0 é *machine-parseável* com semântica de eventos/gateways; Mermaid `flowchart` é *apresentação* sem semântica BPMN. O toolkit não tem como validar formato (é Deferred), então commita ambos. FR-10 diz "BPMN" sem definir o que é um artefato BPMN **válido**. AD-2, ao listar "notação" como conteúdo do pack, **aparentemente** entrega o formato ao pack — colidindo com o Deferred que diz "formato é *code owns*". **Dois donos do formato.**
- **AD a fechar:** **Apertar AD-2 + resolver o Deferred de propriedade.** (a) **Formato on-disk do artefato é toolkit-owned** (parte do schema-núcleo do Par 2), não propriedade do pack. Para v1, fixar **um** formato canônico (recomendado: BPMN 2.0 XML, por ser o padrão do domínio e interoperável) como o único que o toolkit commita para o tipo `bpmn`. (b) Method-packs fornecem **glossário de notação e convenções de nomeação**, não o tipo de arquivo. (c) Renderização/visualização continua *Deferred* (pode ser mermaid no relatório), mas o **artefato-fonte** commitado tem tipo fixo — render é derivação, não artefato primário.

---

## Contagem de achados por severidade

| Severidade | Quantidade | Pares |
| --- | --- | --- |
| CRÍTICO | 1 | Par 1 (dois donos do canal de propose) |
| ALTO | 3 | Par 2 (schema canônico), Par 3 (checkpoint vs órfão), Par 4 (🟢 não-verificável) |
| MÉDIO | 1 | Par 5 (formato BPMN divergente) |
| BAIXO | 0 | — |
| **Total** | **5** | todos sobrevivem aos ADs atuais |

## Fechamentos recomendados (consolidado)

1. **AD-3 apertado + sub-AD de canal:** canal de *propose* é toolkit-owned; adapter é *pass-through* sem mutação; shape do payload é único para todo engine.
2. **AD-2 apertado + novo AD de Schema de Artefato:** schema-núcleo toolkit-owned e versionado; packs só estendem (aditivo); checkpoint registra `pack_id`+`schema_version` por artefato; `resume` revalida contra a versão de origem.
3. **AD-4 apertado:** precedência explícita (checkpoint=progresso, manifesto=integridade); órfão=quarentena; commit+checkpoint = transação atômica via WAL; remover a contradição "única fonte + manifestos".
4. **AD-5 apertado:** "registrada" = verificável (ref resolve a commit anterior + SHA-256 da fonte + checagem de trecho); sem forward-ref; falha degrada para 🟡.
5. **AD-2 apertado + Deferred resolvido:** formato on-disk do artefato é toolkit-owned; fixar BPMN 2.0 XML canônico em v1; packs dão glossário, não tipo de arquivo; render continua Deferred como derivação.

## Nota de limite

Nenhum dos cinco pares exige reabrir o paradigma (propose/commit, hexagonal, checkpoint). Todos se resolvem com **ADs apertados ou um novo AD de Schema/Canal** — ou seja, a coluna está perto, não quebrada. O risco de não fechar agora é alto: os pares 1, 3 e 4 são falhas de **integridade/honestidade** (exatamente os NFRs de Honestidade e Não-destrutividade que a coluna diz *bind*), e tendem a se manifestar só em crash/troca-de-engine/auditoria — quando o custo de correção é máximo.
