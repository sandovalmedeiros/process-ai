---
title: "Product Brief — process-ai"
status: approved
created: 2026-08-01
updated: 2026-08-01
language: pt-BR
---

# Product Brief: process-ai

> **Aprovado pelo autor (2026-08-01).** Estrutura adaptada ao produto; o detalhe das decisões está em `addendum.md`.

## Sumário Executivo

O **process-ai** é um framework open-source de agentes de IA que conduz uma pessoa comum — sem treinamento formal em gestão de processos — por um diálogo de perguntas e respostas até construir, de forma progressiva e rastreável, a arquitetura completa de processos de uma empresa: da cadeia de valor aos diagramas BPMN e aos Procedimentos Operacionais Padrão (POPs).

Ele nasce da mesma engenharia do **Reversa** (do Prof. Sandeco) — orquestração multi-agente com times especializados, marcação de confiança em três níveis (🟢 confirmado / 🟡 inferido / 🔴 gap), rastreabilidade bidirecional, garantia não-destrutiva, retomada por *checkpoint* e portas de aprovação humana — e do mesmo modo de conduzir do **BMad Method**, em que agentes guiados entregam artefatos passo a passo. A diferença é o domínio: em vez de software, **processos de negócio**; em vez de meses de consultoria, horas.

A equipe — **Déa** (orquestração), **Bento** (descoberta), **Miguel** (mapeamento), **Júlia** (modelagem) e **Zanoni** (padronização) — codifica metodologias de mercado padrão (SIPOC, BPMN, cadeia de valor, APQC) como *Skills*, mantendo o framework **method-agnostic** (qualquer metodologia vira um *method-pack* instalável). É um projeto **open-source**, construído por um desenvolvedor (aluno do Prof. Sandeco), com o objetivo de entregar ao mercado uma solução gratuita e de qualidade para o levantamento de processos.

## O Problema

Na maioria das empresas — sobretudo PMEs — os processos críticos **existem apenas na cabeça das pessoas**. Quando um colaborador-chave sai, leva junto conhecimento operacional inteiro: quem faz o quê, em que ordem, com quais critérios. Não há cadeia de valor documentada, não há fluxos, não há POPs. A operação fica frágil: depende de "heróis", não escala, reprova em auditorias e trava qualquer tentativa de aplicar IA ou automação *com cirurgia* — porque não há arquitetura de processos por baixo.

Quem tenta resolver isso sozinho esbarra num muro: as metodologias (BPMN, SIPOC, APQC) são de difícil acesso para um leigo; as ferramentas tradicionais exigem especialista; e contratar consultoria custa meses e um preço que poucos pagam. O resultado é que a maioria desiste e segue no achismo.

É uma dor **independente de setor ou porte** — e é justamente por ser universal que um framework capaz de conduzir *qualquer* processo encontra aí seu gancho.

## A Solução

O process-ai conduz o usuário por um fluxo guiado de perguntas e respostas, em que cada agente assume uma etapa e entrega um artefato rastreável. Um leigo conversa com **Déa**, que o encaminha pelos especialistas; a arquitetura de processos vai se materializando, peça por peça, com marcadores de confiança mostrando o que está confirmado, inferido ou em gap.

1. **Bento (Descobridor)** — entrevista o usuário, caça os processos que vivem "na cabeça das pessoas", monta o **SIPOC** e levanta a **Cadeia de Valor**.
2. **Miguel (Mapeador)** — estrutura a **hierarquia**: Macroprocesso → Processo End-to-End → Subprocesso → Atividade → Tarefa.
3. **Júlia (Modelador)** — desce ao detalhe: modela **BPMN**, identifica gargalos e *handoffs*.
4. **Zanoni (Padronizador)** — documenta e padroniza em **POPs** e relatórios de diagnóstico.
5. **Déa (Orquestradora)** — conduz a sequência, marca a **confiança** de cada achado (🟢🟡🔴), faz *checkpoint* entre etapas e abre **portas de aprovação humana** antes de avançar.

Tudo herda do **Reversa**: rastreabilidade bidirecional, garantia não-destrutiva (manifestos SHA-256), modularidade via *slash-commands* e suporte multi-engine (Claude Code, Codex, Cursor, Gemini CLI). As metodologias (SIPOC, BPMN, APQC…) são ***Skills* plugáveis** — o framework é **method-agnostic**.

## O que nos diferencia

1. **Rigor de especificação herdado do Reversa** — confiança em três níveis, rastreabilidade, não-destrutivo, *checkpoint*. A maioria das ferramentas de processo *gera* diagramas; poucas **marcam o quê é confirmado vs. inferido vs. gap** e mantêm rastreabilidade até a fonte.
2. **Modo de conduzir herdado do BMad** — o leigo é **guiado**, não abandonado numa tela em branco. É um "consultor orquestrado por agentes", não uma ferramenta de desenho.
3. **Method-agnostic** — metodologias de mercado como *Skills* plugáveis. Competidores amarram a uma metodologia; o process-ai deixa plugar qualquer *method-pack*.
4. **Orientação de quem construiu a referência** — o autor é aluno do **Prof. Sandeco**, criador do Reversa: tem mentoria direta de quem provou a arquitetura que serve de base ao projeto.

> **Honesto:** é um projeto **open-source** — não há "moat" defensivo por IP; o que conta é **execução, qualidade e timing** (chegar cedo com uma boa solução de agentes guiados para processos). O rigor (Reversa) e a condução (BMad) são *foundations* adotáveis por outros; a borda pessoal hoje é a mentoria do Prof. Sandeco + capacidade de execução como desenvolvedor. Sem base de clientes ou canal de distribuição ainda.

## Quem Serve

**Usuário primário — o leigo auto-mapeando:** dono, operador ou colaborador de uma PME, sem formação em gestão de processos, que precisa documentar a operação da própria empresa e não tem (ou não quer pagar) um especialista. O sucesso dele: sair de zero, sozinho e guiado, com uma arquitetura de processos usável.

**Usuário secundário (futuro, comercial):** empresas que pagariam por uma versão gerenciada (*hosting*, suporte, recursos *enterprise*) em vez de rodar o OSS sozinhos; e consultores que adotariam o framework como ferramenta de entrega.

## Critérios de Sucesso

- **Funciona pro leigo:** um não-especialista completa, sozinho e guiado, o ciclo *zero → cadeia de valor → BPMN → POP* de um processo real, sem precisar de especialista.
- **Rigor honesto:** os marcadores de confiança 🟢🟡🔴 refletem a realidade (o que é inferido aparece como inferido); rastreabilidade até a fonte funciona; nada é destruído (SHA-256).
- **Adoção OSS:** *installs*/stars, contribuidores externos e o primeiro *method-pack* de terceiros — sinal de que vira ecossistema, não só projeto.
- **Sinal comercial:** ao menos um usuário/empresa demonstra *willingness-to-pay* por uma camada comercial (gerenciado/*hosted*/suporte) — valida a tese de comercialização futura.
- **Qualidade técnica:** roda em mais de um *engine* (Claude Code primeiro), *checkpoint/resume* sólido, *slash-commands* no molde Reversa.

## Escopo

**v1 IN**
- Time mínimo guiado (**Déa, Bento, Miguel, Júlia, Zanoni**) conduzindo o fluxo completo até entregar: cadeia de valor + BPMN de um processo + POP.
- 1 *method-pack* inicial (BPMN + SIPOC, padrão de mercado) — prova o *method-agnostic* com um pack concreto.
- Confiança 🟢🟡🔴, rastreabilidade, *checkpoint/resume*, garantia não-destrutiva.
- CLI + *slash-commands*, multi-engine (Claude Code primeiro).
- **Wedge:** provar primeiro num recorte estreito — **PME, processo de Vendas** (mapear o funil do *lead* ao fechamento). É a praia de areia inicial para validar valor e, depois, *willingness-to-pay*.

**v1 OUT (explícito)**
- *Marketplace* de *method-packs* (1 pack no v1).
- Interface web/gráfica (v1 é CLI / *agent-driven*).
- Camada comercial: *hosting*, multi-tenant, *billing*, SSO/*enterprise* (pós-v1, ligado à visão *open-core*).
- *Forward-engineering*/migração (o Reversa tem; o process-ai não, no v1).
- Integrações com ERPs/sistemas.

## Visão

Em 2–3 anos, o **process-ai** se torna o framework aberto canônico para descoberta de processos guiada por agentes — o "Reversa dos processos de negócio". Um ecossistema de *method-packs* (BPMN, Lean, APQC, setoriais) mantido pela comunidade. Modelo *open-core*: núcleo gratuito e comunitário, com uma versão gerenciada/*hosted* e recursos *enterprise* para quem quer *turnkey*. O norte: toda PME poder ter uma arquitetura de processos real, sem consultor — e o conhecimento operacional parar de morrer com quem sai.
