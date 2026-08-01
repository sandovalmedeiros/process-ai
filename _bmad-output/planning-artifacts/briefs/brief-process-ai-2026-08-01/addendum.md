# Addendum — Product Brief: process-ai

> Contexto de decisões e profundidade que **não cabe no brief** (1–2 páginas) mas importa para downstream (PRD, Arquitetura, Solution Design). Derivado de `.memlog.md`. Não é deliverável executivo — é rascunho de referência.

## 1. Estratégia descartada: "A → B" (alavanca de consultoria → OSS)

Premissa inicial (errada): Sandoval teria uma consultoria; o process-ai começaria como alavanca interna (lado A) e evoluiria para OSS (lado B). **Corrigido:** Sandoval é desenvolvedor, sem consultoria; o projeto é **OSS-first desde o início**. A trajetória A→B foi descartada. (Registrada como *override* no `.memlog.md`.)

## 2. Decisão de metodologia: marca própria + method-agnostic

**HAP é marca registrada (INPI) da P-Excellence** — não pode ser usada num framework OSS sem licença. Opções consideradas:

1. Metodologia + marca próprias, sobre base BPM/APQC padrão ← **ESCOLHIDO**
2. Parceria/licença da HAP com a P-Excellence
3. Motor *method-agnostic* com HAP como um *method-pack*

Sandoval escolheu **(1) + (3)**: metodologia com **marca própria**, e metodologias de mercado (SIPOC, BPMN, APQC) codificadas como *Skills* plugáveis → *method-agnostic*. Isso resolve dois problemas de uma vez: evita a marca HAP **e** dispensa a dependência de um especialista/metodo proprietário (o conhecimento vem de metodologias padrão de mercado).

> **A definir:** nome e estrutura da metodologia própria.

## 3. Isomorfismo BMad (referência arquitetural)

O BMad guia um usuário por agentes especializados (Analyst/PM/Architect/Dev) entregando artefatos de **produto** (brief/PRD/arquitetura/stories). O process-ai aplica o **mesmo padrão** a **processos**:

| BMad | process-ai | Função |
|------|------------|--------|
| Mary (Analyst) | **Bento** (Descobridor) | descoberta/entrevista |
| John (PM) | **Miguel** (Mapeador) | estruturação/hierarquia |
| Winston (Architect) | **Júlia** (Modelador) | modelagem detalhada |
| Paige (Tech Writer) | **Zanoni** (Padronizador) | documentação/POPs |
| (orquestrador) | **Déa** (Orquestradora) | condução + confiança + checkpoint |

Somado aos papéis de rigor herdados do Reversa (Revisor, marcação de confiança, *checkpoint*). Útil para a fase de **Arquitetura**.

## 4. Padrões herdados do Reversa (contrato de engenharia)

Confiança em 3 níveis (🟢🟡🔴), rastreabilidade bidirecional, garantia não-destrutiva (manifestos SHA-256), *checkpoint/resume*, modularidade via *slash-commands*, suporte multi-engine (Claude Code, Codex, Cursor, Gemini CLI), portas de aprovação humana. Este é o **contrato de herança de engenharia** — o que o process-ai "importa" do Reversa.

## 5. Moat honesto

Projeto **open-source** — sem moat defensivo por IP. Diferenciação = **execução + qualidade + timing** + mentoria (Prof. Sandeco) + capacidade de execução como desenvolvedor. **Sem base de clientes ou canal de distribuição ainda**. Tese de comercialização = **open-core** (*hosting*/gerenciado, *enterprise*, suporte) pós-adoção.

## 6. Itens em aberto / próximos passos

- **Validar o wedge** (Vendas/PME) com um caso real assim que possível.
- **Definir a metodologia própria** (nome + estrutura) — inspirada em BPM/APQC, sem usar "HAP".
- **Primeiro *method-pack* concreto** (BPMN + SIPOC) como prova do *method-agnostic*.
- Decidir *engine* principal de v1 (Claude Code sugerido).
