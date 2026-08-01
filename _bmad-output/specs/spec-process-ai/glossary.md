# Glossário — process-ai

> Companion spec-authored do `SPEC.md`. Termos de domínio usados no SPEC, no PRD e no spine — definidos uma vez; sem sinônimos no resto do contrato.

- **Cadeia de Valor** — representação estratégica dos macroprocessos que geram valor; topo da hierarquia de processos.
- **Macroprocesso / Processo End-to-End / Subprocesso / Atividade / Tarefa** — níveis da hierarquia de processos, do macro ao micro.
- **SIPOC** — ferramenta de descoberta: Fornecedores, Entradas, Processo, Saídas, Clientes.
- **BPMN** — *Business Process Model and Notation*. On-disk canônico: **BPMN 2.0 XML** (AD-6).
- **POP** — Procedimento Operacional Padrão; documento de padronização.
- **Marcador de confiança** — classificação obrigatória de cada achado em exatamente um nível: 🟢 **confirmado** (fonte citada e **verificável** — resolve a artefato commitado com SHA-256); 🟡 **inferido** (sem fonte direta); 🔴 **gap** (não determinado). Atribuição **mecânica** pelo toolkit (AD-5).
- **Resumo de encerramento** — síntese final da Déa (FR-5): documentado, contagem 🟢/🟡/🔴, próximos passos.
- **Relatório de diagnóstico** — análise do processo por Zanoni (FR-13): gargalos, gaps, recomendações rastreadas.
- **Relatório de confiança** — consolidação da confiança de toda a documentação (FR-16).
- **Rastreabilidade** — ligação bidirecional entre cada afirmação e sua fonte (entrevista, documento, inferência).
- **Method-pack** — pacote instalável de **conteúdo** que codifica uma metodologia de mercado (ex.: BPMN+SIPOC) e **estende aditivamente** o schema-núcleo. O framework é *method-agnostic* (AD-2).
- **Schema-núcleo** — formato canônico toolkit-owned e versionado de cada tipo de artefato; method-packs só o estendem (AD-2).
- **Propose/Commit** — agentes só *propõem* via canal toolkit-owned; o toolkit Node é o **único escritor** das pastas de saída/estado, aplicando as garantias (AD-1).
- **Checkpoint / Resume** — estado autoritativo da sessão em `.process-ai/checkpoint`; `resume` é função pura do checkpoint; commit+checkpoint atômicos (WAL); órfãos em quarentena (AD-4).
- **Garantia não-destrutiva** — escrita restrita a `_process-ai_output/` e `.process-ai/`; manifestos SHA-256; nada existente é alterado (AD-1).
- **Engine** — runtime de agente. **v1: somente Claude Code.** *Arquitetado-para* múltiplos via adaptadores (AD-3).
- **EngineAdapter** — porta (interface) que isola o core de especificidades de engine; v1: `ClaudeCodeAdapter`; modo **pass-through** (AD-3).
- **`_process-ai_output/`** — pasta de artefatos (cadeia, hierarquia, BPMN 2.0 XML, POP, relatórios).
- **`.process-ai/`** — pasta de estado (checkpoint, config, manifestos SHA-256, ledger de confiança, provenance, WAL).
- **Gate (porta de aprovação humana)** — ponto entre handoffs onde o humano valida o artefato (focando nos 🟡/🔴) antes de o próximo agente prosseguir.
