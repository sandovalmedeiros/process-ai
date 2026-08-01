# PRD Quality Review — process-ai

## Overall verdict

PRD v1 forte e utilizável: tese coerente (framework *method-agnostic*, *wedge* Vendas/PME), FRs com consequências testáveis (exemplar para downstream), e SMs alinhadas à tese com *counter-metric* bem escolhida (SM-C1). Os riscos são três: concentração de *deferral* para a Arquitetura (3 de 3 `[ASSUMPTION]` + 2 de 5 Open Questions roteiam para lá), um NFR de Performance sem *bound* operacionalizável, e SM-1 sem denominador/limiar. Nenhum é bloqueador para o handoff, mas todos ganham se corrigidos antes da Arquitetura começar.

## Decision-readiness — adequate

As decisões estão ditas como decisões, não enterradas como considerações: *wedge* Vendas/PME (§1, §8.1), engine v1 = Claude Code (§8.1), 1 *method-pack* no MVP (§4.7, §8.1), idioma pt-BR (§8.1). Os Non-Goals (§7) são honestos e fazem trabalho real — destaque para "Não promete (v1) privacidade total por padrão" e "Não substitui consultor humano", que são posicionamentos reais, não enfeite. As Open Questions (§11) são genuinamente abertas (nome da metodologia, UX do resume, formato de render do BPMN), não retóricas.

O que segura o veredito em *adequate* em vez de *strong*: a NFR de Performance (§5) é a única decisão que foi aplainada para neutro — "uma interação sentada" não é um número, e a Arquitetura não consegue dimensionar checkpoint/estado sem ele. Há também zero callouts `[NOTE FOR PM]` no documento; para um projeto solo-dev isso pesa menos (o autor é o PM), mas a postura de privacidade "transparência + local opcional" (§5) é um trade-off de posicionamento que mereceria marcação inline.

### Findings
- **medium** NFR de Performance sem *bound* (§5) — "uma sessão de mapeamento do *wedge* (Vendas) conclui-se numa interação sentada" é não-operacionalizável; SM-1 depende de a duração ser tolerável, e a Arquitetura precisa desse número para modelar estado/checkpoint. *Fix:* emitir um *range* provisório de produto (ex.: "30–90 min para o *wedge* Vendas") como meta de dono, mesmo que a Arquitetura o refine.

## Substance over theater — strong

Visão (§1) é específica — não troca dentro da categoria: "nas PMEs, os processos críticos vivem só na cabeça das pessoas" + herança Reversa/BMad + *wedge* Vendas. Os agentes (Déa/Bento/Miguel/Júlia/Zanoni) são papéis funcionais com responsabilidades claras mapeadas a FRs, não *persona theater*. A diferenciação é herdada do brief e é *load-bearing*: os marcadores 🟢🟡🔴 e a rastreabilidade aparecem como FR-14/15/16 e SM-2, não como adjetivos. NFRs (§5) são em sua maioria específicas de produto (Honestidade da IA, Não-destrutividade local, Resumabilidade) — não *boilerplate* "escalável/seguro/confiável".

### Findings
- **low** NFR de Observabilidade apenas esboçada (§5) — "log de provenance de cada agente (o que fez, de qual fonte)" sem formato, granularidade ou retenção mínima. *Fix:* uma linha declarando o mínimo auditável por etapa (agente, artefato emitido, fonte citada, marcador atribuído).

## Strategic coherence — strong

A tese é explícita e as features a servem: provar valor num *wedge* estreito (Vendas/PME), depois *willingness-to-pay*, rumo a *open-core* e ecossistema *method-agnostic*. As 9 features encadeiam-se numa única jornada (UJ-1) — não é um *backlog* com cabeçalhos. SM-1 valida o valor do *wedge*, SM-2 valida a tese de rigor, SM-3 valida ecossistema, SM-4 valida *open-core*: cada SM valida um pedaço da tese, não mede atividade. O *counter-metric* SM-C1 ("não inflar 🟢 para inflar completude") é exatamente a tensão certa entre SM-1 e SM-2 — nomeado explicitamente, não implícito.

### Findings
- **medium** SM-1 sem denominador nem limiar (§9) — "taxa de sucesso num estudo/piloto" não define tamanho da amostra, nem o que conta como "completa" sem intervenção, nem o limiar de aprovação. Sem isso, o sucesso da tese principal não é mensurável. *Fix:* formular como "≥N de M leigos completam o ciclo *zero*→POP sem intervenção humana externa" e fixar N/M provisórios.

## Done-ness clarity — strong

Esta é a dimensão mais sólida do PRD. Cada uma das 21 FRs carrega pelo menos uma consequência testável — frequentemente várias, com *bounds* concretos de pasta, formato ou comportamento. Exemplos: FR-4 ("o gate exibe a contagem e a lista de itens 🟡/🔴 a resolver"), FR-10 ("BPMN emitido em formato editável (BPMN 2.0 XML + *render*) em `_process-ai_output/`"), FR-15 ("remover uma fonte rebaixa as afirmações dependentes a 🟡/🔴"), FR-20 ("uma escrita fora das pastas aborta a etapa com erro"). Para um v1 solo-dev alimentando Arquitetura/Stories, isto é exemplar — o downstream consegue extrair critérios de aceitação sem adivinhação.

### Findings
- **low** FR-6 "perguntas adaptam-se ao *method-pack* ativo" (§4.2) — a noção de "adaptação" é difícil de verificar sem critério ou exemplo. *Fix:* um exemplo concreto da adaptação esperada (ex.: pack BPMN+SIPOC → Bento elicita SIPOC; pack Lean → Bento elicita fluxo contínuo / *waste*).

## Scope honesty — adequate

Non-Goals (§7) e Out-of-Scope MVP (§8.2) são explícitos e cobrem o que precisa cobrir: não-execução, não-SaaS/web, não-*marketplace*, não-ERP, não-engines além do Claude Code. As `[ASSUMPTION]` inline (§4.7, §5, §10) estão indexadas em §12 com *roundtrip* correto. A densidade de itens abertos (5 OQ + 3 ASSUMPTION + 0 NOTE) é proporcional às *stakes* — não é bloqueador.

Dois pontos seguram o veredito em *adequate*. Primeiro, há um padrão de *deferral*: 3 de 3 `[ASSUMPTION]` e 2 de 5 Open Questions roteiam para a Arquitetura — apropriado para o contrato do *method-pack*, mas a meta de performance e a política de versionamento têm dimensão de produto que o PRD não deveria terceirizar inteiramente. Segundo, um critério de sucesso técnico do brief aprovado ("roda em mais de um engine") foi silenciosamente estreitado: o MVP sai só Claude Code (§8.2), o que é sensato para solo-dev, mas nenhum SM mede prontidão multi-engine e o estreitamento não é sinalizado como divergência do brief.

### Findings
- **medium** Padrão de *deferral* à Arquitetura (§4.7, §5, §10, §11.2, §11.3) — três `[ASSUMPTION]` e duas Open Questions roteiam para a Arquitetura; performance e política de versionamento têm dimensão de produto. *Fix:* o PRD emite uma posição provisória de produto (*range* de sessão; política de quebra de compatibilidade mínima) e a Arquitetura refina, em vez de receber *white paper* em branco.
- **low** Critério do brief ("roda em mais de um engine") silenciosamente estreitado (§8.2 vs brief) — MVP sai só Claude Code, mas nenhum SM mede prontidão da camada de adaptadores (FR-21) e o estreitamento não é explicitado como divergência. *Fix:* ou adicionar SM para validação do contrato de adaptadores (ex.: "um segundo engine conecta-se reescrevendo só o adaptador"), ou registrar o de-scope em §7/§8.2 com remissão ao brief.

## Downstream usability — strong

Glossário (§3) cobre todos os substantivos de domínio usados nas FRs/UJs/SMs e eles são usados de forma consistente ("Cadeia de Valor", "Marcador de confiança", "Method-pack", "Gate"). IDs são contíguos e únicos: FR-1…FR-21, SM-1…SM-4 + SM-C1, UJ-1. *Cross-references* resolvem: cada feature declara "Realiza UJ-1"; cada SM declara "Valida FR-X"; FR-16 remete a FR-5. Cada seção faz sentido isolada. UJ-1 tem protagonista nomeado (Marcos, dono de distribuidora com 12 pessoas) com *entry state*, *path* em passos numerados, *climax* e *resolution* — não é flutuante.

Sem *findings* — este PRD é *source-extractable* para Arquitetura e Stories.

## Shape fit — strong

O *shape* casa com o produto. É uma ferramenta *single-operator* (o leigo conduzido) CLI/agent-driven, e o PRD tem exatamente uma UJ (UJ-1) com protagonista nomeado — densidade certa, não over-formalizada. O rigor calibra com OSS sério (não hobby, não *enterprise*): FRs testáveis, NFRs de produto, SMs com *counter-metric*. As referências ao Reversa (SHA-256, checkpoint, marcadores de confiança, garantia não-destrutiva) são precisas quanto ao brief. Como *chain-top* alimentando Arquitetura, a usabilidade downstream (dimensão acima) é o que mais pesa — e está forte.

Sem *findings*.

## Mechanical notes

- **Três artefatos de "relatório" com nomes adjacentes:** FR-5 ("resumo + relatório de confiança"), FR-13 ("Relatório de diagnóstico") e FR-16 ("Relatório de confiança consolidado"). FR-5 e FR-16 provavelmente são o mesmo entregável de encerramento, mas a relação não é explicitada — risco de confusão downstream na hora de gerar Stories. Vale uma linha no Glossário distinguindo-os.
- ***Cross-ref* mole em §4.7:** "ver §Adapt-In API/Public Surface" aponta para §10 ("Contratos Públicos & Plataforma *(Adapt-In)*") com rótulo diferente. Padronizar o rótulo da seção destino.
- **Glossário limpo:** sem *drift* detectável de caso/plural/sinônimos nos termos de domínio.
- **Continuidade de IDs:** FR-1…21 sem buracos/duplicatas; SM-1…4 + SM-C1; UJ-1. Sem *cross-refs* não-resolvidos além do §4.7 acima.
- ***Assumptions Index* roundtrip OK:** §12 cobre os 3 `[ASSUMPTION]` inline (§4.7, §5, §10); todas as entradas do índice aparecem *inline*.
- **Densidade de UJ:** 1 UJ — apropriado para ferramenta *single-operator*; não é *under-formalization*.
