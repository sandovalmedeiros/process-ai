# Glossário — pack bpmn-sipoc v1.0.0

## Termos method-specific

- **BPMN 2.0 XML canônico:** Formato on-disk toolkit-owned para modelagem de processos (AD-6). XML conforme `http://www.omg.org/spec/BPMN/20100524/MODEL`.
- **SIPOC:** Ferramenta de descoberta. Suppliers, Inputs, Process, Outputs, Customers.
- **Cadeia de Valor (Porter):** Representação estratégica dos macroprocessos que geram valor.
- **Hierarquia 5 níveis:** Macroprocesso → End-to-End → Subprocesso → Atividade → Tarefa.
- **IDs estáveis:** Formato `M<num>.E<num>.S<num>.A<num>.T<num>` para rastreabilidade entre artefatos.
- **Gargalo:** Ponto do fluxo onde há espera, retrabalho ou perda de eficiência — sempre com evidência.
- **POP:** Procedimento Operacional Padrão — documento de padronização referenciando atividades da hierarquia.
- **Diagnóstico consolidado:** Relatório de Zanoni (FR-13) com gargalos, gaps e recomendações.

## Termos do schema-núcleo (referência)

Ver `toolkit/src/schema-core.ts` para definições canônicas dos 7 artifactTypes.
