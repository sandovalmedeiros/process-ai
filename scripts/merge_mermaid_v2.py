"""
Merge Mermaid diagrams into converted .md files, replacing <!-- [IMAGE] --> markers.
V2: Handles multiple images per page by tracking occurrence count.
"""
import os, re

# === PDF 1: Process Mapping Basics (11 extracted images) ===
# Order matters: images are listed in the order they appear in the PDF
PDF1_MERMAIDS = [
    # (page_hint, description, type, mermaid_code_or_none)
    # Page 1
    ("Capa do livro: Fundamentos do mapeamento de processos", "cover", None),
    # Page 4
    ("Workshop de mapeamento de processos com post-its", "photo", None),
    # Page 7 - Figura 1
    ("Figura 1: Exemplos de nomes de tarefas do processo de integracao", "diagram",
     """flowchart LR
    subgraph "Tarefas do Processo de Integracao"
        A["Preparar mesa para novo contratado"]
        B["Configurar laptop para novo contratado"]
        C["Apresentar novo contratado a equipe"]
        D["Mostrar o escritorio ao novo contratado"]
        E["Almocar com o novo contratado"]
    end"""),
    # Page 8 - Figura 2: BPMN onboarding process
    ("Figura 2: Fluxo BPMN de integracao de novo contratado - Onboarding", "diagram",
     """flowchart LR
    S((Inicio)) --> A["Order laptop"]
    A --> C["Create email account"]
    C --> D["Allocate desk"]
    A --> B["Configure laptop"]
    B --> E["Tour office"]
    E --> F["Eat lunch with team"]
    D --> F
    F --> En((Fim))"""),
    # Page 10 - Figura 3: Exemplo de cartoes coloridos (Evento-Tarefa-Evento)
    ("Figura 3: Exemplo pratico de evento-tarefa-evento com cartoes coloridos (Signavio)", "diagram",
     """flowchart LR
    A["Employee<br/>name<br/>recorded"]
    B["Create<br/>email<br/>account"]
    C["Email<br/>account<br/>Created"]
    A --> B
    B --> C
    style A fill:#d5e85c,stroke:#6b6b00,color:#1a1a1a
    style B fill:#ffffff,stroke:#2940a0,color:#1a1a1a
    style C fill:#f5f399,stroke:#6b6b00,color:#1a1a1a"""),
    # Page 11 - Figura 4
    ("Figura 4: Exemplos de nomes de eventos para o processo de integracao", "diagram",
     """flowchart TD
    subgraph "Eventos do Processo de Integracao"
        direction LR
        EV1["contrato assinado"]
        EV2["laptop entregue"]
        EV3["laptop pronto"]
        EV4["mesa pronta"]
        EV5["novo contratado chegou ao escritorio"]
        EV6["novo contratado familiarizado com o escritorio"]
        EV7["novo contratado apresentado a equipe"]
    end"""),
    # Page 12 - Figura 5
    ("Figura 5: Fluxograma com swimlanes das funcoes envolvidas", "diagram",
     """flowchart TD
    subgraph "Papel: RH"
        RH1["Preparar contrato"] --> RH2["Enviar para assinatura"]
    end
    subgraph "Papel: TI"
        TI1["Separar equipamentos"] --> TI2["Configurar laptop"]
    end
    subgraph "Papel: Gestor"
        G1["Preparar mesa"] --> G2["Planejar integracao"]
    end
    RH2 --> TI1
    TI2 --> G2"""),
    # Page 15 - Figura 6
    ("Figura 6: Matriz de dificuldade versus valor das atividades", "diagram",
     """quadrantChart
    title Dificuldade vs Valor
    x-axis "Baixo Valor" --> "Alto Valor"
    y-axis "Baixa Dificuldade" --> "Alta Dificuldade"
    quadrant-1 "Foco Prioritario"
    quadrant-2 "Quick Wins"
    quadrant-3 "Evitar / Terceirizar"
    quadrant-4 "Planejar com Cuidado"
    "Tarefa A": [0.7, 0.3]
    "Tarefa B": [0.6, 0.6]
    "Tarefa C": [0.3, 0.7]
    "Tarefa D": [0.7, 0.7]
    "Tarefa E": [0.4, 0.4]"""),
    # Page 16 - Figura 7
    ("Figura 7: Fluxograma do processo AS-IS com gargalos", "diagram",
     """flowchart TD
    A([Inicio]) --> B[Receber solicitacao]
    B --> C[Verificar documentacao]
    C --> D{Documentacao<br/>completa?}
    D -- Nao --> E[Solicitar docs faltantes]
    E --> C
    D -- Sim --> F[Aprovar solicitacao]
    F --> G[Executar atividade]
    G --> H[Registrar conclusao]
    H --> I([Fim])"""),
    # Page 17 - Figura 8
    ("Figura 8: Diagrama de escopo do processo SIPOC", "diagram",
     """flowchart LR
    subgraph Suppliers["FORNECEDORES"]
        S1["RH"]
        S2["TI"]
        S3["Gestor"]
    end
    subgraph Inputs["ENTRADAS"]
        I1["Contrato assinado"]
        I2["Equipamentos"]
        I3["Lista de tarefas"]
    end
    subgraph Process["PROCESSO"]
        P1["Integracao de<br/>novo contratado"]
    end
    subgraph Outputs["SAIDAS"]
        O1["Colaborador integrado"]
        O2["Acessos liberados"]
        O3["Equipe informada"]
    end
    subgraph Customers["CLIENTES"]
        C1["Novo contratado"]
        C2["Equipe"]
        C3["Empresa"]
    end
    Suppliers --> Inputs --> Process --> Outputs --> Customers"""),
    # Page 18 - Figura 9
    ("Figura 9: Ciclo de melhoria continua do mapeamento de processos", "diagram",
     """flowchart LR
    A["Mapear<br/>(AS-IS)"] --> B["Analisar<br/>(Gargalos)"]
    B --> C["Redesenhar<br/>(TO-BE)"]
    C --> D["Implementar<br/>(Melhorias)"]
    D --> E["Monitorar<br/>(Metricas)"]
    E --> A"""),
    # Page 21 - 3 small images (icons, end-of-document)
    ("Icones e elementos graficos de fechamento do documento", "ignore", None),
]

# === PDF 2: Guia Mapeamento Processos UFSM (75 extracted images) ===
PDF2_MERMAIDS = [
    # Page 1
    ("Brasao da UFSM - Capa", "cover", None),
    ("Barra institucional UFSM", "cover", None),
    # Page 3
    ("Logo do Programa de Modernizacao Administrativa", "cover", None),
    # Page 7
    ("Icone ilustrativo da secao de Introducao", "icon", None),
    ("Barra decorativa", "icon", None),
    # Page 10 - Categorias de Processos
    ("Figura: Categorias de Processos Organizacionais", "diagram",
     """flowchart TD
    subgraph "Categorias de Processos Organizacionais"
        direction TB
        subgraph Finalisticos["PROCESSOS FINALISTICOS"]
            F1["Ensino"]
            F2["Pesquisa"]
            F3["Extensao"]
        end
        subgraph Apoio["PROCESSOS DE APOIO"]
            A1["Gestao de Pessoas"]
            A2["Tecnologia da Informacao"]
            A3["Logistica e Infraestrutura"]
            A4["Orcamento e Financas"]
        end
        subgraph Gestao["PROCESSOS DE GESTAO"]
            G1["Planejamento Estrategico"]
            G2["Avaliacao Institucional"]
            G3["Gestao da Qualidade"]
        end
    end
    Finalisticos -.-> Apoio
    Apoio -.-> Gestao
    Gestao -.-> Finalisticos"""),
    ("Barra decorativa inferior", "icon", None),
    # Page 13 - Figura 04: PMC-CANVAS
    ("Figura 04: PMC-CANVAS - Canvas de analise de processos com 9 blocos", "diagram",
     """flowchart TD
    subgraph TOPO["FAIXA SUPERIOR"]
        direction LR
        A1["ATIVIDADES-CHAVE"] ~~~ A2["PRINCIPAIS<br/>SERVICOS/PRODUTOS"] ~~~ A3["IMPACTOS<br/>GERADOS/VALORES"] ~~~ A4["CANAIS DE<br/>COMUNICACAO"] ~~~ A5["PUBLICO-ALVO<br/>Expectativas"]
    end
    subgraph BASE["FAIXA INFERIOR"]
        direction LR
        B1["PESSOAS"] ~~~ B2["RECURSOS<br/>TECNOLOGICOS"] ~~~ B3["PARCEIROS-CHAVE"] ~~~ B4["INDICADORES DE<br/>PERFORMANCE"]
    end"""),
    # Pages 21-28: BPMN notation symbols (icons)
    ("Simbolo BPMN: Evento de Inicio", "diagram",
     "flowchart LR\n    A(((\"Evento de Inicio\")))"),
    ("Simbolo BPMN: Tarefa", "diagram",
     "flowchart LR\n    A[\"Tarefa\"]"),
    ("Simbolo BPMN: Gateway Exclusivo", "diagram",
     "flowchart LR\n    A{\"Gateway Exclusivo\"}"),
    ("Simbolo BPMN: Evento de Fim", "diagram",
     "flowchart LR\n    A((\"Evento de Fim\"))"),
    ("Simbolo BPMN: Subprocesso", "diagram",
     "flowchart LR\n    A[[\"Subprocesso\"]]"),
    ("Simbolo BPMN: Evento Intermediario", "diagram",
     "flowchart LR\n    A((\"Evento Intermediario\"))"),
    ("Simbolo BPMN: Gateway Paralelo", "diagram",
     "flowchart LR\n    A{{\"Gateway Paralelo\"}}"),
    ("Simbolo BPMN: Objeto de Dados", "diagram",
     "flowchart LR\n    A[/\"Objeto de Dados\"\\]"),
    ("Simbolo BPMN: Gateway Inclusivo", "diagram",
     "flowchart LR\n    A{{\"Gateway Inclusivo\"}}"),
    # Page 23 - mais simbolos
    ("Simbolo BPMN: Evento de Mensagem (Inicio)", "icon", None),
    ("Simbolo BPMN: Tarefa de Usuario", "diagram",
     "flowchart LR\n    A[\"Tarefa de Usuario\"]"),
    ("Simbolo BPMN: Evento de Timer (Intermediario)", "icon", None),
    ("Simbolo BPMN: Tarefa de Servico", "diagram",
     "flowchart LR\n    A[\"Tarefa de Servico\"]"),
    ("Simbolo BPMN: Evento de Erro (Intermediario)", "icon", None),
    ("Simbolo BPMN: Tarefa Manual", "diagram",
     "flowchart LR\n    A[\"Tarefa Manual\"]"),
    ("Simbolo BPMN: Evento Condicional", "icon", None),
    ("Simbolo BPMN: Tarefa de Script", "diagram",
     "flowchart LR\n    A[\"Tarefa de Script\"]"),
    ("Simbolo BPMN: Evento de Escalacao", "icon", None),
    ("Simbolo BPMN: Tarefa de Envio", "diagram",
     "flowchart LR\n    A[\"Tarefa de Envio\"]"),
    # Pages 24-25: mais notacao BPMN
    ("Simbolo BPMN: Evento de Sinal", "icon", None),
    ("Simbolo BPMN: Evento Multiplo", "icon", None),
    ("Simbolo BPMN: Evento de Mensagem (Intermediario)", "icon", None),
    ("Simbolo BPMN: Evento de Timer (Inicio) com anotacao", "icon", None),
    ("Simbolo BPMN: Evento de Erro (Fim)", "icon", None),
    ("Simbolo BPMN: Evento Terminativo", "icon", None),
    ("Simbolo BPMN: Subprocesso Embutido", "icon", None),
    ("Simbolo BPMN: Subprocesso Reutilizavel", "icon", None),
    # Pages 26-28: gateways, conectores, swimlanes
    ("Simbolo BPMN: Gateway Complexo", "icon", None),
    ("Simbolo BPMN: Gateway Baseado em Eventos", "icon", None),
    ("Simbolo BPMN: Gateway Baseado em Eventos Exclusivo", "icon", None),
    ("Simbolo BPMN: Conector de Fluxo de Sequencia", "icon", None),
    ("Simbolo BPMN: Conector de Fluxo de Mensagem", "icon", None),
    ("Simbolo BPMN: Conector de Associacao", "icon", None),
    ("Simbolo BPMN: Pool (Swimlane)", "icon", None),
    ("Diagrama BPMN: Exemplo com conectores e swimlanes", "diagram",
     """flowchart TD
    subgraph "Exemplo: Processo com Swimlanes"
        direction TB
        subgraph Solicitante["Lane: Solicitante"]
            S1["Preencher formulario"] --> S2["Enviar solicitacao"]
        end
        subgraph Analista["Lane: Analista"]
            A1["Receber solicitacao"] --> A2{"Completa?"}
            A2 -- Nao --> A3["Devolver"]
            A2 -- Sim --> A4["Analisar"]
        end
        S2 --> A1
        A3 --> S1
    end"""),
    ("Simbolo BPMN: Subprocesso Ad-Hoc", "icon", None),
    ("Simbolo BPMN: Gateway Inclusivo (exemplo)", "icon", None),
    ("Simbolo BPMN: Gateway Paralelo (exemplo)", "icon", None),
    ("Simbolo BPMN: Tarefa de Recebimento", "icon", None),
    # Page 29
    ("Barra decorativa de secao", "icon", None),
    ("Figura: Mapa de Processo em Swimlane - Solicitacao de Material", "diagram",
     """flowchart TB
    subgraph L1["Servidor"]
        direction LR
        S1["Solicitar material"] --> M["Memorando"]
    end
    subgraph L2["Chefia Imediata"]
        direction LR
        A1["Analisa solicitacao"] --> D1{"Autoriza<br/>solicitacao?"}
    end
    subgraph L3["Almoxarifado"]
        direction LR
        C1["Consulta estoque"] --> D2{"Tem<br/>estoque?"}
        D2 -- Sim --> E1["Entrega material"]
        D2 -- Nao --> C2["Compra"]
        C2 --> E1
    end
    M --> A1
    D1 -- Sim --> C1
    D1 -- Nao --> S1"""),
    # Pages 30-34
    ("Figura: Tabela de partes interessadas", "icon", None),
    ("Figura: Modelagem Sequenciada Linear - fluxo com decisao bifurcada (p. 30)", "diagram",
     """flowchart LR
    INI(("Inicio"))
    T1["Tarefa 1"]
    T2["Tarefa 2"]
    DEC{"Decisao"}
    T3["Tarefa 3"]
    T4["Tarefa 4"]
    E4(("Fim"))
    T5["Tarefa 5"]
    E5(("Fim"))
    INI --> T1 --> T2 --> DEC
    DEC --> T3
    DEC --> T5
    T3 --> T4
    T4 --> E4
    T5 --> E5"""),
    ("Figura: Modelagem Sequenciada - PARALELISMO com 3 ramos simultaneos (p. 31)", "diagram",
     """flowchart LR
    Inicio(["Inicio"]) --> T1["Tarefa 1"]
    T1 --> GW{"Gateway +"}
    GW --> T2["Tarefa 2"]
    GW --> T3["Tarefa 3"]
    GW --> T4["Tarefa 4"]
    T2 --> T5["Tarefa 5"]
    T5 --> T8["Tarefa 8"]
    T8 --> T9["Tarefa 9"]
    T9 --> F1(["Fim"])
    T3 --> T6["Tarefa 6"]
    T6 --> T10["Tarefa 10"]
    T10 --> F2(["Fim"])
    T4 --> T7["Tarefa 7"]
    T7 --> F3(["Fim"])"""),
    ("Figura: Modelagem Sequenciada - PARALELISMO com convergencia (split/join) (p. 31)", "diagram",
     """flowchart TD
    IN((Inicio)) --> T1["Tarefa 1"]
    T1 --> GW{"Gateway +"}
    GW --> T2["Tarefa 2"]
    GW --> T3["Tarefa 3"]
    GW --> T4["Tarefa 4"]
    T2 --> T5["Tarefa 5"] --> T8["Tarefa 8"] --> T9["Tarefa 9"]
    T3 --> T6["Tarefa 6"] --> T10["Tarefa 10"]
    T4 --> T7["Tarefa 7"]
    T9 --> CR(("Evento"))
    T10 --> CR
    T7 --> CR
    CR --> OUT((Fim))"""),
    ("Figura: Exemplo BPMN complexo - 4 ramos paralelos com convergencia (p. 32)", "diagram",
     """flowchart TD
    IN(("Inicio")) --> T1["Tarefa 1"]
    T1 --> GW{"Gateway"}
    GW --> T2["Tarefa 2"]
    GW --> T3["Tarefa 3"]
    GW --> T4["Tarefa 4"]
    GW --> T7["Tarefa 7"]
    T2 --> T5["Tarefa 5"]
    T3 --> T6["Tarefa 6"]
    T6 --> T10["Tarefa 10"]
    T10 --> T8["Tarefa 8"]
    T5 --> CR(("Evento"))
    T8 --> CR
    T4 --> CR
    T7 --> CR
    CR --> OUT((Fim))"""),
    ("Quadro: Notacao de Tarefas BPMN - padrao, loop e multiplas instancias (p. 32)", "diagram",
     """flowchart TD
    subgraph Linha1["Tarefa padrao"]
        direction LR
        A1["Tarefa 1"] --- A2["Tarefa 2"]
    end
    subgraph Linha2["Marcador de loop"]
        direction LR
        B1["Padrao"] --- B2["Tarefa 4"]
    end
    subgraph Linha3["Multiplas instancias"]
        direction LR
        C1["Multiplas<br/>Instancias"] --- C2["Tarefa 6"]
    end"""),
    ("Figura 5: Modelo de processo ponta-a-ponta - Processo Seletivo, Formacao, Diplomacao", "diagram",
     """flowchart LR
    P1["Processo Seletivo"] --> P2["Formacao"] --> P3["Diplomacao"]"""),
    # Page 38 - Figura 6: Os 7 desperdicios do Lean
    ("Figura 6: Os 7 (sete) desperdicios de acordo com o Lean", "diagram",
     """flowchart TD
    C["**OS 7 (SETE) DESPERDICIOS**"]
    C --- T["TRANSPORTE<br/>Tempo e esforco para mover<br/>coisas dentro de um processo<br/>ou entre processos"]
    C --- E["ESPERA<br/>Tempo nao trabalhado, tempo<br/>de fila, espera por aprovacao"]
    C --- M["MOVIMENTACAO<br/>Planejamento e layout<br/>organizacional ruim"]
    C --- D["DEFEITOS<br/>Algo inaceitavel pelo cliente,<br/>retrabalho ou reparos"]
    C --- P["EXCESSO DE PRODUCAO<br/>Producao maior do que o<br/>necessario, antes do necessario"]
    C --- I["INVENTARIO/ESTOQUE<br/>Estoque excessivo de materiais<br/>nao usados na atividade corrente"]
    C --- V["PROCESSAMENTO SEM VALOR<br/>Fazer mais trabalho do que o<br/>necessario para agregar valor"]"""),
    # Page 42 - Figura 7: Estagios da cidadania corporativa
    ("Figura 7: Estagios da cidadania corporativa - Matriz 7 dimensoes x 5 estagios", "diagram",
     """flowchart TD
    TIT["**ESTAGIOS DA CIDADANIA CORPORATIVA**<br/>Credibilidade, Capacidade, Coerencia, Comprometimento"]
    subgraph EST["5 Estagios de Maturidade"]
        direction LR
        S1["Elementar"] ~~~ S2["Engajado"] ~~~ S3["Inovador"] ~~~ S4["Integrado"] ~~~ S5["Transformador"]
    end
    subgraph D1["Conceito de cidadania"]
        direction LR
        D1A["Empregos, lucros<br/>e impostos"] ~~~ D1B["Filantropia,<br/>protecao ambiental"] ~~~ D1C["Gestao de<br/>stakeholder"] ~~~ D1D["Sustentabilidade<br/>Triple Bottom Line"] ~~~ D1E["Mudar o<br/>mercado"]
    end
    subgraph D2["Intencao estrategica"]
        direction LR
        D2A["Cumprimento da<br/>legislacao"] ~~~ D2B["Licenca para<br/>operar"] ~~~ D2C["Casos de<br/>negocios"] ~~~ D2D["Proposta de<br/>valor"] ~~~ D2E["Criacao de mercado<br/>ou mudanca social"]
    end
    subgraph D3["Lideranca"]
        direction LR
        D3A["Expressao verbal,<br/>indisponivel"] ~~~ D3B["Engajado,<br/>apoiador"] ~~~ D3C["Auxilia os processos<br/>de cidadania"] ~~~ D3D["Campeao, a frente<br/>da sustentabilidade"] ~~~ D3E["Visionario, a frente<br/>do seu tempo"]
    end
    subgraph D4["Estrutura"]
        direction LR
        D4A["Marginal, direcionada<br/>a equipe"] ~~~ D4B["Propriedade<br/>funcional"] ~~~ D4C["Coordenacao entre<br/>funcoes"] ~~~ D4D["Alinhamento<br/>organizacional"] ~~~ D4E["Mainstream,<br/>direcionada ao negocio"]
    end
    subgraph D5["Gestao das questoes de stakeholders"]
        direction LR
        D5A["Defensivo"] ~~~ D5B["Reativo,<br/>politicas"] ~~~ D5C["Responsiva,<br/>programas"] ~~~ D5D["Sistemas,<br/>proativa"] ~~~ D5E["Definidora"]
    end
    subgraph D6["Relacionamento com stakeholders"]
        direction LR
        D6A["Unilateral"] ~~~ D6B["Interativo"] ~~~ D6C["Influencia<br/>mutua"] ~~~ D6D["Parceria"] ~~~ D6E["Aliancas<br/>multiorganizacionais"]
    end
    subgraph D7["Transparencia"]
        direction LR
        D7A["Protecao"] ~~~ D7B["Relacoes<br/>publicas"] ~~~ D7C["Reporte ao<br/>publico"] ~~~ D7D["Garantia"] ~~~ D7E["Transparencia<br/>total"]
    end
    TIT --- EST"""),
    # Page 44 - Quadro 06: Melhoria/Redesenho vs Reengenharia/Mudanca de Paradigma (ABPMP, 2013)
    ("Quadro 06: Melhoria e redesenho vs Reengenharia e mudanca de paradigma (ABPMP, 2013)", "diagram",
     """flowchart TB
    subgraph Melhoria["MELHORIA E REDESENHO"]
        direction TB
        M1["Nivel de mudanca:<br/>Incremental a holistica"]
        M2["Ponto inicial:<br/>Processo AS-IS"]
        M3["Frequencia de alteracao:<br/>Continua a regular"]
        M4["Risco:<br/>Baixo a moderado"]
        M5["Habilitador primario:<br/>Controle estatistico"]
    end
    subgraph Reengenharia["REENGENHARIA E MUDANCA DE PARADIGMA"]
        direction TB
        R1["Nivel de mudanca:<br/>Radical a sem precedentes"]
        R2["Ponto inicial:<br/>Quadro branco, novas ideias"]
        R3["Frequencia de alteracao:<br/>Eventual"]
        R4["Risco:<br/>Alto"]
        R5["Habilitador primario:<br/>Novos paradigmas e tecnologias"]
    end"""),
    # Page 46 - Figura 8: Atividades do plano de gerenciamento de mudanca
    ("Figura 8: Atividades do plano de gerenciamento de mudanca (ABPMP, 2013)", "diagram",
     """flowchart TD
    CORE(["**Nucleo**<br/>Pessoas<br/>Lideranca executiva<br/>Partes interessadas"])
    CORE --> V1{{"Visao"}}
    CORE --> V2{{"Transformacao<br/>de processos"}}
    CORE --> V3{{"Desenho<br/>organizacional"}}
    CORE --> V4{{"Gerenciamento<br/>de desempenho"}}
    CORE --> V5{{"Desenvolvimento<br/>organizacional"}}
    CORE --> V6{{"Suporte"}}
    CORE --> V7{{"Comunicacao"}}
    CORE --> V8{{"Alinhamento"}}"""),
    # Page 50 - Figura 9: Curva de mudanca (ABPMP, 2013)
    ("Figura 9: Da imobilizacao a internalizacao da mudanca (ABPMP, 2013)", "diagram",
     """flowchart LR
    subgraph PROC["Etapas do Processo de Mudanca"]
        direction LR
        A["Cria uma visao"] --> B["Avalia o modelo<br/>(estado atual)"]
        B --> C["Desenvolve um modelo<br/>'deveria ser'"]
        C --> D["Implementa o modelo"]
        D --> E["Mede o impacto"]
    end
    subgraph EMO["Curva Emocional da Mudanca"]
        direction LR
        E1["Sem consciencia"] --> E2["Imobilizacao"]
        E2 --> E3["Negacao"]
        E3 --> E4["Falsas esperancas"]
        E4 --> E5["Consciente"]
        E5 --> E6["Raiva"]
        E6 --> E7["Panico"]
        E7 --> E8["Barganha"]
        E8 --> E9["Depressao"]
        E9 --> E10["Aceitacao da realidade"]
        E10 --> E11["Teste"]
        E11 --> E12["Compreensao"]
        E12 --> E13["Convencimento"]
        E13 --> E14["Compromisso"]
        E14 --> E15["Internalizacao"]
        E15 --> E16["Fusao do passado<br/>com o futuro"]
    end"""),
    # Page 51 - Figura 10: Inside Out vs Outside In (ABPMP, 2013)
    ("Figura 10: Inside Out x Outside In - comparativo de visoes (ABPMP, 2013)", "diagram",
     """flowchart LR
    subgraph IO["Visao orientada ao produto/servico - INSIDE OUT"]
        direction TB
        IO1["Negocio construido<br/>'de dentro para fora'"]
        IO2["Foco no cliente"]
        IO3["Cliente interno e externo"]
        IO4["'Empurrar' o produto<br/>ou servico para o cliente"]
        IO5["Levantamento de necessidades<br/>e satisfacao de clientes"]
        IO6["Baseada em area funcional<br/>visao para dentro"]
        IO7["Meta funcional e vertical"]
        IO8["Departamentalizacao<br/>hierarquia, comando e controle<br/>(efeito silo)"]
        IO9["Cadeia de valor"]
        IO10["Enfase na eficiencia"]
        IO1 --> IO2 --> IO3 --> IO4 --> IO5 --> IO6 --> IO7 --> IO8 --> IO9 --> IO10
    end
    subgraph OI["Visao orientada ao cliente - OUTSIDE IN"]
        direction TB
        OI1["Negocio construido<br/>'de fora para dentro'"]
        OI2["Foco do cliente"]
        OI3["Cliente e aquele que se<br/>beneficia do valor criado"]
        OI4["Cliente 'puxa' o produto<br/>ou servico"]
        OI5["Fazer o papel de cliente<br/>consumir o proprio servico"]
        OI6["Baseada em processo<br/>interfuncional com visao<br/>para fora"]
        OI7["Meta compartilhada<br/>e horizontal"]
        OI8["Gerenciamento horizontal<br/>ponta a ponta com<br/>integracao funcional"]
        OI9["Percepcao de valor"]
        OI10["Enfase na eficacia"]
        OI1 --> OI2 --> OI3 --> OI4 --> OI5 --> OI6 --> OI7 --> OI8 --> OI9 --> OI10
    end"""),
    # Page 59 - Exemplo BPMN com piscinas e raias
    ("Figura: Exemplo BPMN com Piscinas (Pools) e Raias (Lanes)", "diagram",
     """flowchart LR
    subgraph PISCINA1["Pool 1"]
        direction LR
        P1_INI(("Necessidade<br/>Identificada")) --> P1_SOL[("Solicitacao<br/>recebida")]
        P1_SOL --> P1_AT["Atender<br/>solicitacao"]
        P1_AT --> P1_PC[("Prestacao de<br/>contas recebida")]
        P1_PC --> P1_AN["Analisar<br/>prestacao de contas"]
        P1_AN --> P1_AR["Arquivar<br/>processo"]
    end
    subgraph PISCINA2["Pool 2"]
        direction LR
        P2_FO["Formalizar<br/>solicitacao"] --> P2_SA(("Solicitacao<br/>atendida"))
        P2_PC["Prestar<br/>contas"] --> P2_PCE(("Prestacao de<br/>contas enviada"))
    end
    P2_FO -. "Solicitacao" .-> P1_SOL
    P2_PC -. "Prestacao de contas" .-> P1_PC"""),
    # Page 60 - contracapa
    ("Barra decorativa UFSM", "icon", None),
    ("Brasao da UFSM - Contracapa", "cover", None),
]


def process_md_file(md_path, mermaids_list):
    """Replace <!-- [IMAGE] --> markers sequentially with Mermaid entries."""
    with open(md_path, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    new_lines = []
    mermaid_idx = 0

    for line in lines:
        stripped = line.strip()

        if stripped == "<!-- [IMAGE] -->":
            if mermaid_idx < len(mermaids_list):
                desc, img_type, mermaid_code = mermaids_list[mermaid_idx]
                mermaid_idx += 1

                if img_type == "diagram" and mermaid_code:
                    new_lines.append(f"<!-- {desc} -->")
                    new_lines.append("")
                    new_lines.append("```mermaid")
                    for ml in mermaid_code.strip().split("\n"):
                        new_lines.append(ml)
                    new_lines.append("```")
                elif img_type in ("cover", "photo"):
                    new_lines.append(f"<!-- [IMAGE: {desc}] -->")
                elif img_type == "icon":
                    # Small BPMN notation icons - keep as brief markdown comment
                    new_lines.append(f"<!-- [IMAGE: {desc}] -->")
                else:
                    new_lines.append(f"<!-- [IMAGE: {desc}] -->")
            else:
                # No more known images - keep original marker
                new_lines.append(line)
        else:
            new_lines.append(line)

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(new_lines))

    return mermaid_idx


def main():
    base = "D:/process-ai-prj/docs"

    md1 = os.path.join(base, "81848_81848_process-mapping-basics-2025_pt-BR-20260213_1.md")
    n1 = process_md_file(md1, PDF1_MERMAIDS)
    print(f"PDF 1: {n1} imagens processadas (de {len(PDF1_MERMAIDS)} mapeadas)")

    md2 = os.path.join(base, "GUIA MAPEAMENTO PROCESSOS 2.0.md")
    n2 = process_md_file(md2, PDF2_MERMAIDS)
    print(f"PDF 2: {n2} imagens processadas (de {len(PDF2_MERMAIDS)} mapeadas)")

    print("\nMerge concluido!")


if __name__ == "__main__":
    main()
