# Review Adversarial — PRD process-ai (2026-08-01)

**Veredicto geral:** O PRD herda a clareza estrutural do brief, mas empacota promessas de rigor (method-agnostic, multi-engine, rastreabilidade bidirecional, SHA-256, checkpoint/resume) que um solo-dev não valida nem entrega em v1 — e o diferencial central (marcadores de confiança) é operacionalmente indefinido. Precisa de corte cirúrgico de escopo antes de ir para Arquitetura.

---

## Achados

[critical] Marcador de confiança é LLM auto-avaliando LLM, sem definição operacional nem anti-gaming (§3, FR-14, FR-15, SM-2, SM-C1) — O 🟢/🟡/🔴 é o coração da promessa de rigor (e do diferencial vs. competidores, §"O que nos diferencia"), mas o PRD nunca define operacionalmente o que faz um achado ser "confirmado" vs. "inferido": é o usuário ter dito na entrevista? Existir documento? Quem decide? O próprio agente (LLM) marca a si mesmo — não há segunda fonte, juiz, nem checagem cruzada. SM-2 ("marcadores refletem a realidade") mede precisão sem definir ground-truth nem método de medição; SM-C1 reconhece o risco de gaming ("não inflar 🟢") mas não propõe mitigação. Isso torna a métrica primária de honestidade (SM-2) não-testável e o FR-14 não-construível de forma verificável.
*Fix:* Definir regra mecânica de marcação: 🟢 = afirmado pelo usuário em entrevista transcrita OU presente em documento importado (com `source_ref`); 🟡 = inferido pelo agente a partir de outras afirmativas 🟢; 🔴 = não-respondido. Adicionar FR de "fonte obrigatória" (todo 🟢 carrega `source_id`). Definir método de ground-truth do SM-2 (amostra manual de N afirmações por um auditor humano piloto) e alvo numérico (ex.: precision ≥ 0.9 do 🟢).

[critical] "Method-agnostic" é estruturalmente não-validável em v1 com N=1 pack (§1, §4.7, FR-17, FR-18, §8.1) — O PRD (e o brief) afirma que "1 method-pack prova o method-agnostic com um pack concreto" — isso é falácia lógica. Com um único pack (BPMN+SIPOC) você prova que o framework roda com um pack; não prova que trocar/desativar o pack não altera os agentes (FR-17 consequence), porque nunca há um segundo pack para testar a troca. A consequência do FR-17 é literalmente não-testável no escopo v1. Mais grave: FR-3 fixa a ordem dos agentes (Déa→Bento→Miguel→Júlia→Zanoni), mas metodologias diferentes podem exigir ordens diferentes (nem toda metodologia começa com SIPOC) — a ordem fixa contradiz o claim method-agnostic.
*Fix:* Retirar o claim "method-agnostic" do v1 (mover para visão pós-v1); renomear para "method-pack architecture (1 pack no v1, plugabilidade como tese a validar em v2)". Validar FR-17 só quando existirem ≥2 packs. Ou, se manter o claim, shipar um segundo pack mínimo (ex.: apenas-Cadeia-de-Valor) para exercitar a troca.

[critical] Multi-engine no v1 é promessa não-testável + contradição brief↔PRD↔§8 (§4.9 FR-21, §5 NFR Portabilidade, §8.2, brief linha 62/70) — FR-21 ("adicionar um engine não reescreve o core") é listado como feature v1, mas §8.2 explicitamente põe "engines além do Claude Code" fora do escopo. Logo a consequência do FR-21 não pode ser exercitada em v1 — é uma promessa arquitetural, não um requisito de produto. Pior: o brief (linha 70) lista "multi-engine (Claude Code primeiro)" em v1 IN e (linha 62) "roda em mais de um engine" como critério de sucesso técnico — o PRD silenciosamente rebaixou isso a "a Arquitetura prepara o terreno" sem reconciliar com o brief aprovado. Adaptador de engine com único engine é also YAGNI prematuro.
*Fix:* Tirar FR-21 e "Portabilidade" do escopo v1 (mover para §12 ou visão). Deixar explícito no §0 que o PRD diverge do brief neste ponto e por quê (solo-dev, custo). Reduzir v1 a "claude-code-only, core escrito sem acoplamento *extraído por bom senso*, não por teste de segundo engine". Atualizar o brief ou registrar a divergência.

[critical] O "wedge Vendas/PME" não reduz escopo de build — só reduz escopo de validação (§1, §8.1, UJ-1) — Um wedge real (cf. strategia de produto) limita o que você *constrói*, não só onde você *testa*. Aqui todos os 21 FRs são genéricos (cadeia de valor, hierarquia, BPMN, POP, confiança, rastreabilidade, checkpoint, multi-engine, method-pack) — nenhum é específico de Vendas. Resultado: o solo-dev continua construindo o framework completo e genérico, e só depois o valida num recorte. O "wedge" é uma declaração de GTM, não um corte de escopo; o esforço real de v1 é o framework inteiro, e o PRD não admite isso. SM-3 (adoção) e SM-4 (willingness-to-pay) dependem do framework completo pronto, não do wedge.
*Fix:* Ou cortar features v1 para as que o wedge de Vendas efetivamente exige (ex.: não shipar Cadeia de Valor multi-macroprocesso — só o processo de Vendas; não shipar method-pack API pública; etc.), ou parar de chamar de "wedge" e admitir que v1 = framework genérico validado em Vendas. Decidir e registrar.

[high] SM-1 (métrica PRIMÁRIA) não tem alvo, amostra, nem definição de "completa" (§9) — "Leigo completa o ciclo... taxa de sucesso num estudo/piloto." Qual taxa? 50%? 80%? Sobre amostra de quantos usuários? O que é "completa" — chegar ao Gate 4? Aprovar todos os gates? Ter ≥N% de 🟢? Sem isso, a métrica primária de sucesso é não-mensurável e o projeto não tem critério objetivo de "v1 pronto".
*Fix:* SM-1 = "≥X% (sugestão: 70%) de Y usuários-leigo (sugestão: 5–8) completam Gate 0→Gate 4 sem intervenção humana externa, num estudo controlado, produzindo artefatos com ≥Z% de afirmativas não-🔴." Definir X, Y, Z antes do piloto.

[high] NFR de Performance sem bound quantificável (§5) — "conclui-se numa interação sentada" não é mensurável (30 min? 4 h? 8 h?). O [ASSUMPTION] empurra o número para a Arquitetura, mas a viabilidade do produto para leigo-PME depende criticamente disso — um pipeline de 5 agentes sequenciais com gates, cada um fazendo entrevistas + geração de artefato, pode facilmente escalar para horas e custos de token proibitivos para um dono de PME. É também um driver de arquitetura (checkpoint granular, cache de contexto, escolha de modelo) que não pode esperar a fase de Arquitetura para ter ordem de grandeza.
*Fix:* Definir range ordinal já no PRD (ex.: "meta v1: 30–90 min por processo de Vendas típico, custo de token < R$ X"). Mesmo um range grosseiro obriga a Arquitetura a validar viabilidade em vez de descobrir tarde.

[high] Checkpoint/Resume (FR-19) sem modelo de execução definido; Q4 adia o que é decidível (§4.8, §11 Q4) — Sessões Claude Code são efêmeras; "retomar reinicia no último gate/etapa concluída; nada é perdido nem duplicado" é uma promessa forte sem mecanismo (onde o estado vive? como o `/process-ai` detecta sessão em curso? como lida com state file corrompido?). Q4 ("Como o resume é invocado em cada engine") é listado como questão em aberto — mas v1 é mono-engine, então a pergunta é decidível agora. Adiá-la esconde custo real.
*Fix:* Especificar mecanismo v1: estado persistido em `.process-ai/session.json` após cada gate; `/process-ai` detecta sessão existente e pergunta (resume vs. nova); definir idempotência do checkpoint (hash do estado) e comportamento em estado corrompido (abortar com mensagem, não silenciar).

[high] Garantia não-destrutiva (FR-20) sem arquitetura de enforcement (§4.9, §6) — "Uma escrita fora das pastas aborta a etapa com erro" — como? Claude Code não tem sandbox rígido por padrão; agentes podem chamar ferramentas de escrita em qualquer path. O manifesto SHA-256 é *registro*, não *prevenção*. Não há descrição de hook, wrapper, allowlist de paths, ou validador pré-escrita. A promessa de "não-destrutivo" — outro diferencial herdado do Reversa — fica sem teeth.
*Fix:* Especificar enforcement v1: hook PreToolUse no Claude Code que bloqueia `Write`/`Edit` fora de `_process-ai_output/`∪`.process-ai/`; manifesto *pré*-escrita (não só pós); comportamento em violação (abortar agente, logar, não continuar).

[high] "Privacidade local opcional" provavelmente vácuo em v1 (§5, §7) — v1 engine = Claude Code. Claude Code nativamente roda modelos Anthropic; Ollama não é backend padrão do Claude Code. Dizer "suporta modelo local quando o engine permite" é tecnicamente verdadeiro mas praticamente vazio se o único engine v1 não permite. Isso parece promessa dePrivacy que não se cumpre no produto entregue.
*Fix:* Verificar e statement honesto: "v1 envia dados à Anthropic via Claude Code; local via Ollama é objetivo para v2 (engine alternativo) — não disponível em v1." Mover "local opcional" para Non-Goal v1 ou para Visão.

[medium] Rastreabilidade bidirecional assume transferência de padrão de code-spec para processo sem justificativa (§3, FR-15, addendum) — No Reversa (code-spec), rastreabilidade bidirecional ancora-se em símbolos/AST do código. Em artefatos de processo (BPMN XML, POP em markdown, SIPOC em tabela), qual é o âncora? "Navegável nos dois sentidos; remover uma fonte rebaixa as dependentes a 🟡/🔴" exige um grafo de dependências que nenhum FR descreve como construir. O PRD trata a herança como transposição direta; não é.
*Fix:* Adicionar FR ou consequência que defina o grafo de proveniência: cada afirmativa carrega `source_ids[]`; cada fonte carrega `dependents[]`; mudança de fonte dispara rebaixamento em cascata via esse grafo. Definir formato (JSON sidecar em `.process-ai/provenance.json`).

[medium] Contradição latente FR-3 (ordem fixa) vs. FR-17 (method-agnostic) (§4.1, §4.7) — Ordem fixa Déa→Bento→Miguel→Júlia→Zanoni assume uma sequência metodológica específica (descoberta→hierarquia→modelo→padrão). Method-packs alternativos poderiam exigir ordem diferente. Ou a ordem é parte do pack (e então o "core" não é method-agnostic de verdade), ou é parte do core (e então o framework impõe uma metodologia). O PRD não escolhe.
*Fix:* Declarar explicitamente: "v1: ordem hard-coded no core; plugabilidade de ordem é pós-v1." E aceitar que isso enfraquece o claim method-agnostic — ver finding critical acima.

[medium] Non-Goal "não substitui consultor em casos regulados/complexos" sem detecção (§7) — O framework não detecta domínios regulados (saúde, financeiro, dados sensíveis). Logo o non-goal é uma isenção de responsabilidade sem mitigação ativa: o leigo não tem como saber que caiu num caso regulado, e o framework não avisa. Risco de uso indevido.
*Fix:* Adicionar gate de disclaimer inicial (Gate 0 estendido): perguntar se o processo envolve dados pessoais LGPD/hipaa, transações financeiras reguladas, segurança/proteção à vida; marcar 🔴 e exibir aviso se sim; registrar no relatório de confiança.

[medium] API pública de method-pack (§10) com escopo ambíguo vs. §8.1 (§10, §8.1, §8.2) — §10 lista "Method-pack API — contrato público de extensibilidade" como superfície pública Adapt-In; §8.1 inclui só "1 method-pack" (não a API); §8.2 exclui só o "marketplace", não a API. Para um OSS cuja tese inclui ecossistema de packs, shipar sem API estável mina a proposta — mas travar API em v1 com N=1 pack é prematuro. Tensão não endereçada.
*Fix:* Decidir e registrar: ou API é internal-only em v1 (terceiros não são target), ou é pública mas marcada experimental (semver 0.x). Reflete a decisão em §8.1 e §8.2 explicitamente.

[medium] FRs com afirmações absolutas ("nunca") sem metodologia de teste negativo (FR-6, FR-20) — FR-6: "Bento nunca afirma conhecimento não fornecido sem marcar 🟡/🔴" — testar "nunca" requer varredura adversarial de entradas (red-tempering); sem isso, o "nunca" é aspiração. FR-20 idem.
*Fix:* Reformular para probabilístico-testável: "≥X% das respostas em suite de testes adversariais (N≥Y casos) não contêm afirmativas não-marcadas." Adicionar suite de testes adversariais ao plano.

[medium] Render do BPMN indecidido (Q5) mas FR-10 trata como resolvido (§4.4 FR-10, §11 Q5) — FR-10 consequence: "BPMN emitido em formato editável (BPMN 2.0 XML + render)". Q5: "Formato de render do BPMN (BPMN 2.0 XML + qual visualização)" está em aberto. A consequência do FR não pode ser testada até Q5 ser decidido. Para um wedge de Vendas em que o usuário *vê* o fluxo, o render é parte do valor — não é detalhe.
*Fix:* Decidir render v1 já no PRD (sugestão: BPMN 2.0 XML + SVG estático via bpmn-to-svg; sem editor gráfico). Mover Q5 para "decidido" ou explicar por que genuinamente precisa da Arquitetura.

[medium] SM-3 (adoção OSS) e SM-4 (willingness-to-pay) são métricas pós-lançamento, não requisitos de v1 (§9) — Installs/stars, contribuidores externos, method-pack de terceiro, willingness-to-pay dependem de marketing, distribuição, timing — nenhum dos quais é entregue pelo build v1. Como métricas de sucesso do PRD elas são categoria-erro: avaliam go-to-market, não o produto. Misturá-las com SM-1/SM-2 (que são de produto) dilui o critério de "v1 pronto".
*Fix:* Separar "Métricas de produto v1" (SM-1, SM-2) de "Sinais pós-lançamento" (SM-3, SM-4). Só os primeiros são acceptance criteria do v1.

[low] Open Questions misturam "genuinamente aberto" com "decidível agora" (§11) — Q1 (nome da metodologia) é genuíno; Q4 (UX do resume) e Q5 (render BPMN) são decidíveis agora dado escopo mono-engine/POC — adiá-los infla incerteza e esconde decisões que a Arquitetura vai tomar por inércia.
*Fix:* Resolver Q4 e Q5 no PRD; deixar só Q1, Q2 (alvo quantitativo — ver finding high), Q3 (contrato method-pack) como abertos, com data de decisão.

[low] FR-11 ("identificar gargalos") sem definição de gargalo (§4.4) — "Gargalos listados com a evidência" — mas o que conta como gargalo? Tempo? Recurso? Handoff? Sem definição, cada execução do agente pode listar coisas diferentes; não é reproduzível.
*Fix:* Definir heurística v1 (ex.: atividade com ≥N handoffs, ou atividade marcada pelo usuário como "lenta", ou paralelismo ausente onde esperado). Mesmo uma heurística fraca é melhor que "o agente decide".

[low] Ausência total de FRs de tratamento de erro/conflito (§4 inteiro) — Não há FR para: usuário dá informação contraditória entre gates; usuário quer revisar gate anterior depois que gates下游 já construíram em cima; agente hallucina e marca alucinação como 🟢 (o caso que invalida SM-2 por dentro); estado de sessão corrompido. Cada um é plausível no mundo real de uma PME.
*Fix:* Adicionar FR de "invalidação em cascata" (revisar gate N rebaixa dependentes), FR de "detecção de contradição" (agente sinaliza contradição com gate anterior), FR de "recuperação de estado corrompido".

[low] "Node.js 18+ (herdado do Reversa)" sem justificativa (§10) — Herdar runtime é decisão técnica que pertence à Arquitetura; aparece como asserção no PRD sem motivação de produto. Se o solo-dev é mais fluente em Python, a herança pode ser custo, não benefício.
*Fix:* Mover a escolha de runtime para Arquitetura; no PRD manter só a constraint "runtime amplamente adotado e com boa história de segurança."

---

## Contagem por severidade
- Critical: 4
- High: 5
- Medium: 6
- Low: 4
- **Total: 19**

## Observação final
O PRD é bem-escrito e honesto em vários pontos (Non-Goals de privacidade e SaaS, [ASSUMPTION]s inline). O problema não é redação — é escopo. Um solo-dev está prometendo, em v1: framework genérico + 5 agentes + method-agnostic + multi-engine-ready + confiança 3-níveis com rastreabilidade bidirecional + SHA-256 non-destructive + checkpoint/resume + gates + relatório consolidado + API pública de extensibilidade. O corte para algo que uma pessoa entrega em tempo hábil ainda não foi feito. Recomendação: resolver os 4 criticals antes de mandar para Arquitetura — senão a Arquitetura vai "preparar terreno" para promessas que o v1 não deveria fazer.
