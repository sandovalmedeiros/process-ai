---
title: "PRD — process-ai"
status: final
created: 2026-08-01
updated: 2026-08-01
language: pt-BR
source_brief: ../../briefs/brief-process-ai-2026-08-01/brief.md
---

# PRD: process-ai
*Construído sobre o Product Brief aprovado (2026-08-01). Validado por Reviewer Gate (rubric + adversarial) em 2026-08-01.*

## 0. Propósito do Documento

Este PRD é para o **autor-desenvolvedor (Sandoval)** e para os fluxos downstream (**Arquitetura**, **Épicas/Stories**). Ele transforma o *Product Brief* aprovado em **requisitos testáveis** — não duplica o brief, detalha-o. Estrutura-se sobre um **Glossário** (vocabulário fixo), **Features agrupadas com FRs aninhadas** (IDs globais FR-1..N), **NFRs transversais**, e **premissas marcadas inline** (`[ASSUMPTION]`). Herda do brief: framework OSS, equipe de agentes (Déa/Bento/Miguel/Júlia/Zanoni), rigores do Reversa, modo de conduzir do BMad, *method-agnostic*, wedge Vendas/PME, tese *open-core*.

## 1. Visão

O **process-ai** é um framework open-source que dá a uma pessoa comum — sem formação em processos — uma equipe de agentes de IA (Déa, Bento, Miguel, Júlia, Zanoni) que a conduz, por perguntas e respostas, até documentar a arquitetura completa dos processos da empresa: da cadeia de valor aos diagramas BPMN e aos POPs. **O usuário não precisa saber metodologia; os agentes sabem — e conduzem.**

Isso resolve um problema caro: nas PMEs, os processos críticos vivem só na cabeça das pessoas; quando alguém sai, o conhecimento vai junto. A operação fica frágil, não escala e reprova em auditorias. Hoje, sair disso exige consultoria de meses ou ferramenta que pede especialista. O process-ai herda o **rigor de especificação do Reversa** (confiança 🟢🟡🔴, rastreabilidade, não-destrutivo) e o **modo de conduzir do BMad** — aplicados ao domínio de processos.

O **v1 foca num *wedge* concreto: PMEs mapeando o processo de Vendas** (do *lead* ao fechamento). É onde provamos valor — e, depois, *willingness-to-pay* — rumo a um ecossistema *method-agnostic* e ao modelo *open-core*.

## 2. Usuário-Alvo

### 2.1 Jobs To Be Done

- **Funcional:** documentar os processos da empresa (cadeia de valor, BPMN, POP) **sem contratar especialista nem aprender metodologia do zero**.
- **Emocional:** dormir tranquilo sabendo que a operação não depende só da cabeça de uma pessoa-chave.
- **Social:** mostrar a sócio/equipe/auditor que a casa está arrumada — **com rastreabilidade**.

### 2.2 Não-Usuários (v1)

- Grandes empresas que precisam de **integração com ERP**, **multi-tenant** ou **interface web** (pós-v1).
- Quem busca **execução/migração** de processos (o process-ai *descobre e documenta*; não *executa*).

### 2.3 Jornadas do Usuário (UJ)

- **UJ-1. Marcos mapeia o processo de Vendas do zero, guiado pela Déa.**
  - **Persona + contexto:** Marcos, dono de uma distribuidora com 12 pessoas. O processo de vendas vive na cabeça dele e do vendedor antigo — risco se alguém sai.
  - **Entry state:** no Claude Code (engine v1), executa `/process-ai`.
  - **Path:**
    1. Déa pergunta *"Qual processo vamos mapear?"* → Marcos: *"Vendas"*.
    2. **[Gate 0]** Déa confirma o escopo (*lead → fechamento*) antes de iniciar.
    3. **Bento** entrevista e monta o **SIPOC** + a **Cadeia de Valor** → **[Gate 1]** Marcos valida; resolve os itens 🟡/🔴.
    4. **Miguel** estrutura a **hierarquia** (Macroprocesso → … → Tarefa) → **[Gate 2]** valida a estrutura.
    5. **Júlia** modela o **BPMN** + identifica gargalos → **[Gate 3]** valida o fluxo.
    6. **Zanoni** gera os **POPs** → **[Gate 4]** aprova o entregável final.
  - **Climax:** Déa entrega o **resumo + relatório de confiança** — Marcos vê o processo documentado e sabe exatamente o que é sólido (🟢) vs. inferido (🟡) vs. gap (🔴).
  - **Resolution:** em `_process-ai_output/`: cadeia de valor + hierarquia + BPMN + POP(s) + relatório de confiança + rastreabilidade. Déa sugere o próximo passo (ex.: *"validar os 2 gaps com o time de vendas"*).

## 3. Glossário

- **Cadeia de Valor** — representação estratégica dos macroprocessos que geram valor; topo da hierarquia.
- **Macroprocesso / Processo End-to-End / Subprocesso / Atividade / Tarefa** — níveis da hierarquia de processos, do macro ao micro.
- **SIPOC** — ferramenta de descoberta: Fornecedores, Entradas, Processo, Saídas, Clientes.
- **BPMN** — *Business Process Model and Notation*; notação de modelagem de processos.
- **POP** — Procedimento Operacional Padrão; documento de padronização.
- **Marcador de confiança** — classificação obrigatória de cada achado em exatamente um nível: 🟢 **confirmado** (afirmado com **fonte citada e verificável** — entrevista registrada ou documento fornecido); 🟡 **inferido** (concluído pelo agente a partir de indícios, **sem fonte direta** — sempre acompanhado da inferência e do que falta confirmar); 🔴 **gap** (desconhecido / não determinado). Regra de atribuição: 🟢 exige fonte; sem fonte → no máximo 🟡; nenhum achado sem marcador.
- **Resumo de encerramento** — síntese final da Déa (FR-5): o que foi documentado, contagem 🟢/🟡/🔴, próximos passos.
- **Relatório de diagnóstico** — análise do processo por Zanoni (FR-13): gargalos, gaps, recomendações (rastreadas).
- **Relatório de confiança** — consolidação da confiança de toda a documentação (FR-16): contagem e itens por nível 🟢/🟡/🔴.
- **Rastreabilidade** — ligação bidirecional entre cada afirmação do artefato e sua fonte (entrevista, documento, inferência).
- **Method-pack** — pacote instalável que codifica uma metodologia de mercado (ex.: BPMN+SIPOC) como *Skills* dos agentes. O framework é *method-agnostic* (arquitetado-para; plenamente validado quando há ≥2 packs).
- **Checkpoint / Resume** — estado salvo após cada etapa; permite retomar a sessão de onde parou.
- **Garantia não-destrutiva** — agentes escrevem **só** em `_process-ai_output/` e `.process-ai/`; nada existente é modificado ou apagado (manifestos SHA-256).
- **Engine** — runtime de agente onde o framework roda. **v1: somente Claude Code.** *Arquitetado-para* múltiplos (Codex, Cursor, Gemini CLI) via adaptadores, entregues pós-v1.
- **`_process-ai_output/`** — pasta de artefatos (cadeia, hierarquia, BPMN, POP, relatórios).
- **`.process-ai/`** — pasta de estado interno (checkpoint, config, manifestos SHA-256, log de provenance).
- **Gate (porta de aprovação humana)** — ponto entre handoffs onde o humano valida o artefato — focando nos marcadores 🟡/🔴 — antes de o próximo agente prosseguir.

## 4. Features

### 4.1 Condução Guiada (Déa)
**Description:** Déa é a porta de entrada e orquestradora. Inicia a sessão via `/process-ai`, confirma o escopo, encadeia os handoffs entre Bento→Miguel→Júlia→Zanoni, abre as portas de aprovação humana entre etapas e, ao final, entrega o resumo + relatório de confiança. Realiza UJ-1.

**Functional Requirements:**

#### FR-1: Iniciar sessão
O usuário pode iniciar o process-ai via slash-command `/process-ai` no engine (v1: Claude Code). Realiza UJ-1.
**Consequences (testable):**
- O comando `/process-ai` está disponível após a instalação; ao executá-lo, Déa assume a condução em `pt-BR` (v1).

#### FR-2: Definir e confirmar escopo (Gate 0)
Déa pergunta o nome do processo e confirma o escopo antes de qualquer descoberta.
**Consequences:**
- Nenhum agente de descoberta (Bento) executa antes de o escopo ser confirmado pelo usuário.

#### FR-3: Orquestrar handoffs
Déa encadeia Bento→Miguel→Júlia→Zanoni na ordem, passando o estado entre eles.
**Consequences:**
- A ordem dos agentes é fixa no v1; um agente só inicia após o anterior concluir + gate aprovado.

#### FR-4: Abrir portas de aprovação humana (Gates 1–4)
Após cada agente, Déa apresenta o artefato para validação, destacando os marcadores 🟡/🔴 que precisam de atenção.
**Consequences:**
- Cada gate bloqueia a próxima etapa até aprovação; o gate exibe a contagem e a lista de itens 🟡/🔴 a resolver.

#### FR-5: Encerrar com resumo + relatório de confiança
Ao final, Déa entrega o resumo de encerramento (o que foi documentado, contagem 🟢/🟡/🔴, próximos passos).
**Consequences:**
- A sessão não termina sem o relatório de confiança; o resumo cita os gaps (🔴) e sugere follow-up.

### 4.2 Descoberta (Bento)
**Description:** Bento extrai o processo "da cabeça das pessoas" via entrevista guiada e produz o SIPOC e a Cadeia de Valor. Realiza UJ-1.

#### FR-6: Entrevista guiada
Bento conduz perguntas estruturadas para elicitar o processo do usuário.
**Consequences:**
- Bento nunca afirma conhecimento não fornecido sem marcar 🟡/🔴; as perguntas seguem o roteiro do method-pack ativo (definido no pack, não improvisado pelo agente).

#### FR-7: Gerar SIPOC
Bento produz um SIPOC (Fornecedores, Entradas, Processo, Saídas, Clientes) do processo.
**Consequences:**
- SIPOC persistido em `_process-ai_output/`; cada campo sem fonte confirmada é marcado 🟡/🔴.

#### FR-8: Levantar Cadeia de Valor
Bento posiciona o processo na cadeia de valor da empresa.
**Consequences:**
- A cadeia de valor é escrita antes do Gate 1; itens inferidos aparecem marcados.

### 4.3 Mapeamento (Miguel)
**Description:** Miguel estrutura a hierarquia do processo (Macroprocesso → Processo E2E → Subprocesso → Atividade → Tarefa). Realiza UJ-1.

#### FR-9: Estruturar hierarquia
Miguel decompõe o processo nos níveis da hierarquia.
**Consequences:**
- Cada nível tem relação pai/filho rastreável; níveis incompletos são marcados 🟡/🔴; persistido em `_process-ai_output/`.

### 4.4 Modelagem (Júlia)
**Description:** Júlia modela o processo em BPMN e identifica gargalos/handoffs. Realiza UJ-1.

#### FR-10: Modelar BPMN
Júlia gera o diagrama BPMN do processo.
**Consequences:**
- BPMN emitido em formato editável (BPMN 2.0 XML + render) em `_process-ai_output/`; elementos sem fonte marcados 🟡/🔴.

#### FR-11: Identificar gargalos
Júlia aponta gargalos e handoffs problemáticos no fluxo.
**Consequences:**
- Gargalos listados com a evidência que os fundamenta (rastreabilidade).

### 4.5 Padronização (Zanoni)
**Description:** Zanoni converte o modelo em POPs e relatório de diagnóstico. Realiza UJ-1.

#### FR-12: Gerar POP(s)
Zanoni produz Procedimentos Operacionais Padrão a partir do modelo.
**Consequences:**
- Cada POP referencia as atividades/tarefas da hierarquia (rastreabilidade); POP emitido em `_process-ai_output/`.

#### FR-13: Relatório de diagnóstico
Zanoni consolida um relatório de diagnóstico do processo (gargalos, gaps, recomendações).
**Consequences:**
- O relatório cita a contagem 🟢/🟡/🔴 e rastreia cada recomendação a uma evidência.

### 4.6 Confiança & Rastreabilidade *(transversal)*
**Description:** Capacidade transversal a todos os agentes: cada achado recebe um marcador de confiança e é rastreável à sua fonte. É o coração da promessa de rigor herdada do Reversa.

#### FR-14: Marcar confiança
Todo achado em qualquer artefato recebe exatamente um marcador 🟢 (confirmado), 🟡 (inferido) ou 🔴 (gap).
**Consequences:**
- Nenhum artefato é emitido com afirmações sem marcador; 🟢 exige fonte citada, sem fonte → no mínimo 🟡, 🔴 onde o processo não pôde ser determinado (critérios operacionais no Glossário → *Marcador de confiança*).

#### FR-15: Rastreabilidade bidirecional
Cada afirmação de um artefato liga-se à sua fonte (entrevista, documento, inferência) e vice-versa.
**Consequences:**
- A ligação é navegável nos dois sentidos; remover uma fonte rebaixa as afirmações dependentes a 🟡/🔴.

#### FR-16: Relatório de confiança consolidado
O sistema produz um relatório de confiança que agrega a confiança de toda a documentação do processo.
**Consequences:**
- O relatório lista contagem e itens por nível 🟢/🟡/🔴; entregue no encerramento (FR-5).

### 4.7 Method-pack System
**Description:** O framework é *method-agnostic*: metodologias de mercado são codificadas como Skills plugáveis (method-packs). O v1 shipa um pack concreto.

#### FR-17: Carregar method-packs
O framework carrega metodologias como Skills plugáveis, sem mudar o core.
**Consequences:**
- Trocar/desativar um method-pack não altera os agentes Déa/Miguel/…; o método ativo é declarado em `.process-ai/`. **Nota:** o v1 prova o *mecanismo* com 1 pack (FR-18); o *method-agnostic* pleno é validado quando existir um 2º pack (pós-v1).

#### FR-18: Pack padrão do v1
O v1 shipa 1 method-pack (BPMN + SIPOC).
**Consequences:**
- A sessão do wedge (Vendas/PME) roda ponta-a-ponta usando somente este pack.

**Feature-specific NFR:** a interface de method-pack é um contrato público de extensibilidade (ver §10) — [ASSUMPTION: o contrato exato fica na Arquitetura].

### 4.8 Sessão Resiliente
**Description:** Checkpoint/resume — o estado é salvo após cada etapa; a sessão pode ser retomada.

#### FR-19: Checkpoint + resume
O sistema salva o estado após cada agente/gate e permite retomar de onde parou.
**Consequences:**
- Após uma interrupção, retomar reinicia no último gate/etapa concluída; nada é perdido nem duplicado.

### 4.9 Não-Destrutivo & Multi-Engine *(transversal)*
**Description:** Garantia não-destrutiva (herdada do Reversa) e *arquitetura preparada para* multi-engine.

#### FR-20: Garantia não-destrutiva
Os agentes escrevem somente em `_process-ai_output/` e `.process-ai/`; nenhum arquivo existente no projeto é modificado ou apagado.
**Consequences:**
- Manifestos SHA-256 registrados em `.process-ai/` para todo output; uma escrita fora das pastas aborta a etapa com erro.

#### FR-21: Multi-engine (arquitetado-para)
O framework é **arquitetado para múltiplos engines** (core isolado via camada de adaptadores), mas o **v1 entrega somente Claude Code**. Um 2º engine é pós-v1.
**Consequences:**
- v1: apenas Claude Code é suportado e testado; o core não depende de especificidades de engine; adicionar um engine (pós-v1) não reescreve o core.

## 5. NFRs Transversais (Cross-Cutting)

- **Honestidade da IA** — nenhum artefato é emitido com afirmações sem marcador de confiança 🟢🟡🔴; inferência nunca é apresentada como fato confirmado. Valida FR-14/15/16.
- **Privacidade & Dados (postura: transparência + local opcional)** — o v1 declara abertamente que os dados de processo passam pelo provedor do modelo do engine, **e** suporta modelo local (ex.: Ollama) quando o engine permite, de modo que privacidade total é possível, mas não garantida por padrão. Nenhum dado é enviado a serviços de terceiros além do engine/modelo configurado pelo usuário.
- **Não-destrutividade local** — escrita restrita a `_process-ai_output/` e `.process-ai/`; nada no projeto do usuário é alterado (FR-20).
- **Resumabilidade** — checkpoint após cada etapa; retomada sem perda nem duplicação (FR-19).
- **Observabilidade** — log de provenance de cada agente persistido em `.process-ai/`: um registro por etapa (agente, ação executada, fonte usada, marcador atribuído), para auditoria.
- **Portabilidade** — core isolado do engine por adaptadores; multi-engine sem reescrever o core (FR-21).
- **Performance** — uma sessão do wedge (Vendas) conclui-se numa interação sentada, em ≈60–90 min de interação total e ≤30 turnos de agente. *[ASSUMPTION: limites provisórios, calibrar na Arquitetura/piloto.]*

## 6. Constraints & Guardrails

- **Segurança (não-destrutivo):** manifestos SHA-256 para todo output; escrita fora das pastas do process-ai aborta a etapa com erro.
- **Privacidade:** postura "transparência + local opcional" (§5); nenhum dado a terceiros além do engine/modelo do usuário.
- **Honestidade:** marcadores de confiança são obrigatórios e não-infláveis (ver SM-C1).

## 7. Non-Goals (Explícitos)

- **Não é ferramenta de execução/migração** — o process-ai *descobre e documenta*; não executa nem migra processos.
- **Não é SaaS/web no v1** — CLI/agent-driven; interface web é pós-v1.
- **Não substitui consultor humano** em casos complexos, regulados ou de alto risco — é ferramenta de levantamento.
- **Não promove lock-in metodológico** — *method-agnostic* por design (arquitetado-para).
- **Não entrega multi-engine no v1** — somente Claude Code; demais engines são pós-v1 (FR-21).
- **Não promete (v1) privacidade total por padrão** no provedor do modelo — ver §5 (local é opcional).

## 8. Escopo MVP

### 8.1 In Scope
- Wedge: **PME mapeando o processo de Vendas** (*lead*→fechamento). *Nota de escopo: o wedge reduz a **validação** (onde provamos valor), não o **build** — o framework genérico (9 features) é construído no v1.*
- As **9 features** (FR-1…FR-21) e seus artefatos.
- **1 method-pack** (BPMN + SIPOC).
- **Engine único em v1: Claude Code** (multi-engine é *arquitetado-para*, ver FR-21).
- Pastas `_process-ai_output/` + `.process-ai/`; idioma pt-BR.

### 8.2 Out of Scope for MVP
- *Marketplace* de method-packs (1 pack no MVP).
- Interface web/gráfica (MVP é CLI/agent-driven).
- Camada comercial: *hosting*, multi-tenant, *billing*, SSO/*enterprise* (pós-MVP, *open-core*).
- *Forward-engineering*/migração (o Reversa tem; o process-ai não).
- Integrações com ERPs/sistemas.
- Engines além do Claude Code — v1 entrega só Claude Code; multi-engine é **arquitetado-para** (core via adaptadores), entregue e provado quando um 2º engine vier (pós-v1).

## 9. Métricas de Sucesso

**Primary**
- **SM-1**: Leigo completa o ciclo *zero → cadeia de valor → BPMN → POP* sozinho, guiado — **≥70% de ≥5 pilotos** (não-especialistas) completam sem ajuda de especialista. Valida FR-1…FR-13. *[ASSUMPTION: limiar/amostra provisórios, calibrar no piloto.]*

**Secondary**
- **SM-2**: Honestidade da confiança — marcadores 🟢🟡🔴 refletem a realidade. **Medição:** spot-check por especialista humano em amostra de afirmações 🟢; alvo **≥85% de concordância** (afirmações 🟢 que um especialista também classificaria como confirmadas). Valida FR-14/15/16. *[ASSUMPTION: limiar provisório.]*
- **SM-3**: Adoção OSS — installs/stars, contribuidores externos, 1º method-pack de terceiro. Valida FR-17.
- **SM-4**: Sinal comercial — ≥1 usuário/empresa demonstra *willingness-to-pay* por camada gerenciada. Valida tese *open-core*.

**Counter-metrics (não otimizar)**
- **SM-C1**: Não inflar 🟢 para inflar a taxa de conclusão — a completude aparente (SM-1) não pode subir às custas da honestidade (SM-2). Contrabalanceia SM-1/SM-2.

## 10. Contratos Públicos & Plataforma *(Adapt-In)*

- **Method-pack API** — contrato público de extensibilidade: terceiros criam packs (Skills) sem tocar no core. *[ASSUMPTION: formato exato na Arquitetura.]*
- **Slash-commands** — `/process-ai` (iniciar) e o comando de resume (FR-19) são a superfície pública de invocação.
- **Versionamento & deprecação** — versionamento semântico do framework e dos method-packs; política de quebra documentada. *[ASSUMPTION: detalhe na Arquitetura.]*
- **Runtime / Language targets** — Node.js 18+ (herdado do Reversa); configs TOML/YAML; multi-engine por adaptadores.

## 11. Questões em Aberto

1. Nome e estrutura da **metodologia própria** (inspirada em BPM/APQC, sem usar "HAP").
2. **Calibrar** alvos quantitativos no piloto (performance §5; amostra SM-1; limiares SM-2).
3. Contrato exato do **method-pack** e política de **versionamento** (→ Arquitetura).
4. Como o **resume** é invocado em cada engine (UX do resume).
5. Formato de **render** do BPMN (BPMN 2.0 XML + qual visualização).

## 12. Índice de Assumptions

- §4.7 — o contrato exato do method-pack fica na Arquitetura.
- §5 — limites provisórios de performance (60–90 min / ≤30 turnos) a calibrar na Arquitetura/piloto.
- §9 (SM-1) — limiar/amostra provisórios (≥70% de ≥5 pilotos) a calibrar no piloto.
- §9 (SM-2) — limiar provisório de concordância (≥85%) a calibrar.
- §10 — formato do method-pack e política de versionamento a detalhar na Arquitetura.
