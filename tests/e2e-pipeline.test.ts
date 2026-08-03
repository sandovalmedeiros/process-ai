/**
 * tests/e2e-pipeline.test.ts — E2E da pipeline COM especialistas profundos (1.6–2.7).
 *
 * Diferente do `e2e-conductor.test.ts` (loop do condutor SEM especialistas → ledger vazio
 * → zeros honestos, regressão da 1.5), este teste exercita a pipeline **com produção de
 * artefatos + claims**, provando:
 *  - cada especialista commita seu artefato via `propose` com `claims`;
 *  - **provenance cruzada (AD-5, mecanismo 1.4):** Miguel alcança 🟢 sourcing a `value-chain`
 *    de Bento (manifesto resolve); um claim com sha **inexistente** é **degradado a 🟡**
 *    (unresolved-source) — não aborta o commit;
 *  - o ledger `.process-ai/confidence-ledger.jsonl` é **não-vazio** e o relatório de confiança
 *    deixa de ter a nota de "zeros honestos";
 *  - 7 artefatos commitados (discovery-interview, sipoc, value-chain, hierarchy, flow, pop,
 *    summary-report);
 *  - resume subsequente não duplica estado nem cria órfãos.
 *
 * **2.7 (Wedge Vendas/PME):** cenário realista de Vendas (lead→fechamento) com dados de PME,
 *   calibração de 🟢 (≥85% excerpt-verified), contador de turnos (≤30), e fixture Vendas.
 *
 * Drive via `dispatch(parseArgs(...), adapter, root)` — determinístico, sem LLM.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, dispatch } from '../bin/process-ai.ts';
import { ClaudeCodeAdapter } from '../toolkit/adapters/claude-code/adapter.ts';

/** sha256 hex64 que NÃO corresponde a nenhum manifesto → claim 🟢 degrada a 🟡. */
const NONEXISTENT_SHA = 'a'.repeat(64);

interface CommitResult {
  sha256: string;
  artifactPath: string;
  manifestPath: string;
}

interface CheckpointArtifact {
  sha256: string;
  artifactType: string;
  path: string;
}

interface CheckpointState {
  stage: string;
  artifacts: CheckpointArtifact[];
  gates: Array<{ gateId: string; decision: string; decidedAt: string }>;
  lastCheckpointAt: string;
  walCursor: number;
}

function checkpointPath(root: string): string {
  return path.join(root, '.process-ai', 'checkpoint.json');
}
async function readCheckpoint(root: string): Promise<CheckpointState> {
  return JSON.parse(await fs.readFile(checkpointPath(root), 'utf8')) as CheckpointState;
}
function ledgerPath(root: string): string {
  return path.join(root, '.process-ai', 'confidence-ledger.jsonl');
}

/** Drive um comando JSON-retornador via dispatcher e devolve o objeto parseado. */
async function runJson(argv: string[], adapter: ClaudeCodeAdapter, root: string): Promise<unknown> {
  return JSON.parse((await dispatch(parseArgs(argv), adapter, root)).output);
}

let _payloadCounter = 0;

/** Escreve um ProposePayload num temp, propõe via dispatcher, devolve o CommitResult. */
async function propose(
  adapter: ClaudeCodeAdapter,
  root: string,
  payload: object,
): Promise<CommitResult> {
  const p = path.join(os.tmpdir(), `pa-e2e-payload-${process.pid}-${_payloadCounter++}.json`);
  await fs.writeFile(p, JSON.stringify(payload), 'utf8');
  try {
    const res = await dispatch(parseArgs(['propose', '--payload', p]), adapter, root);
    return JSON.parse(res.output) as CommitResult;
  } finally {
    await fs.rm(p, { force: true });
  }
}

// ---- 2.7: Fixture Vendas/PME — conteúdos realistas ----

/** Entrevista de descoberta — cenário Vendas PME (lead→fechamento). */
const INTERVIEW_CONTENT =
  '# Entrevista de Descoberta — Processo de Vendas (Distribuidora B2B)\n' +
  '\n' +
  '## Pergunta 1: Como chegam os leads?\n' +
  '**Resposta:** "Principalmente por indicação de clientes atuais e pelo site. O time de marketing ' +
  'também roda campanhas no Google Ads e LinkedIn. Recebemos em média 40 leads/mês."\n' +
  '\n' +
  '## Pergunta 2: Como funciona a qualificação?\n' +
  '**Resposta:** "O vendedor Júnior faz o primeiro contato em até 24h. Ele avalia: precisa do ' +
  'produto agora? Tem orçamento? É o tomador de decisão? Se passar, agenda uma call de ' +
  'aprofundamento com o vendedor Sênior."\n' +
  '\n' +
  '## Pergunta 3: Como é a proposta?\n' +
  '**Resposta:** "O Sênior faz uma call de 30min para entender a necessidade, monta a proposta ' +
  'comercial em até 2 dias e envia por e-mail. Não temos template padrão — cada vendedor faz ' +
  'do seu jeito."\n' +
  '\n' +
  '## Pergunta 4: E a negociação?\n' +
  '**Resposta:** "O cliente recebe a proposta e geralmente pede desconto ou ajuste de prazo. ' +
  'O Sênior tem autonomia para dar até 10% de desconto. Acima disso, precisa aprovar com o ' +
  'diretor comercial. Isso leva de 2 a 5 dias."\n' +
  '\n' +
  '## Pergunta 5: Como fecha?\n' +
  '**Resposta:** "Com a proposta aprovada, a administração envia o contrato por e-mail ' +
  '(DocuSign). O cliente assina em 2-3 dias. Depois disso, o onboarding é feito pelo time ' +
  'de CS em até 5 dias úteis."\n' +
  '\n' +
  '## Pergunta 6: Quanto tempo leva do lead ao fechamento?\n' +
  '**Resposta:** "Em média 3 semanas, mas já tivemos casos de 2 dias e casos de 3 meses. ' +
  'Não temos SLA formal para nenhuma etapa."\n' +
  '\n' +
  '## Pergunta 7: Onde travam?\n' +
  '**Resposta:** "Na proposta. O Sênior é sobrecarregado — são 20 propostas/mês para 1 pessoa. ' +
  'O follow-up pós-proposta também é fraco: não temos processo de follow-up, cada um faz ' +
  'quando lembra."\n';

/** SIPOC realista — Vendas PME. */
const SIPOC_CONTENT =
  '# SIPOC — Processo de Vendas\n' +
  '\n' +
  '| | Descrição |\n' +
  '|---|---|\n' +
  '| **S**uppliers | Marketing (Google Ads, LinkedIn, site), Clientes atuais (indicação), CRM (HubSpot) |\n' +
  '| **I**nputs | Leads (40/mês), MQLs qualificados, Briefing de necessidade |\n' +
  '| **P**rocess | Prospecção → Qualificação → Proposta → Negociação → Fechamento → Onboarding |\n' +
  '| **O**utputs | Proposta comercial, Contrato assinado (DocuSign), Cliente onboarded |\n' +
  '| **C**ustomers | PMEs B2B (20-200 funcionários), setores: serviços, indústria leve, tecnologia |\n';

/** Cadeia de valor — Vendas PME. */
const VALUE_CHAIN_CONTENT =
  '# Cadeia de Valor — Vendas\n' +
  '\n' +
  '1. **Prospecção** — Captação de leads via marketing digital, indicações e site.\n' +
  '2. **Qualificação** — Avaliação de fit (orçamento, necessidade, autoridade) pelo vendedor Júnior.\n' +
  '3. **Proposta** — Call de aprofundamento + proposta comercial personalizada (2 dias).\n' +
  '4. **Negociação** — Ajuste de preço/prazo (autonomia de 10%; acima → diretor).\n' +
  '5. **Fechamento** — Contrato via DocuSign + onboarding pelo time de CS (5 dias úteis).\n' +
  '\n' +
  '**Nota:** O elo de Pós-venda (onboarding + CS) é parte do ciclo de vida do cliente, ' +
  'mas o foco do wedge é lead→fechamento.\n';

/** Hierarquia — Vendas PME (Miguel, 2.2). */
const HIERARCHY_CONTENT =
  '# Hierarquia — Processo de Vendas (Lead-to-Cash)\n' +
  '\n' +
  '## M1. Vendas (Macroprocesso) — pai: Cadeia de Valor\n' +
  'Gerir o ciclo comercial do lead ao fechamento, garantindo previsibilidade e conversão.\n' +
  '\n' +
  '### E1.1. Lead-to-Cash (Processo End-to-End) — pai: M1\n' +
  'Ciclo completo do lead até o contrato assinado + onboarding inicial.\n' +
  '\n' +
  '#### S1.1.1. Prospecção (Subprocesso) — pai: E1.1\n' +
  'Captar e registrar leads de múltiplos canais.\n' +
  '- A1.1.1.1. Captar leads (Atividade) — pai: S1.1.1\n' +
  '  - T1.1.1.1.1. Receber leads do site — pai: A1.1.1.1\n' +
  '  - T1.1.1.1.2. Importar campanhas do Google Ads — pai: A1.1.1.1\n' +
  '- A1.1.1.2. Registrar no CRM (Atividade) — pai: S1.1.1\n' +
  '  - T1.1.1.2.1. Criar contato no HubSpot — pai: A1.1.1.2\n' +
  '\n' +
  '#### S1.1.2. Qualificação (Subprocesso) — pai: E1.1\n' +
  'Avaliar fit do lead antes de investir tempo em proposta.\n' +
  '- A1.1.2.1. Contato inicial (Atividade) — pai: S1.1.2\n' +
  '  - T1.1.2.1.1. Ligar/email em até 24h — pai: A1.1.2.1\n' +
  '  - T1.1.2.1.2. Checar orçamento/necessidade/autoridade — pai: A1.1.2.1\n' +
  '- A1.1.2.2. Agendar call de aprofundamento (Atividade) — pai: S1.1.2\n' +
  '  - T1.1.2.2.1. Enviar convite de calendário — pai: A1.1.2.2\n' +
  '\n' +
  '#### S1.1.3. Proposta (Subprocesso) — pai: E1.1\n' +
  'Entender necessidade e propor solução comercial.\n' +
  '- A1.1.3.1. Call de aprofundamento (Atividade) — pai: S1.1.3\n' +
  '  - T1.1.3.1.1. Entender necessidade (30min) — pai: A1.1.3.1\n' +
  '- A1.1.3.2. Montar proposta (Atividade) — pai: S1.1.3\n' +
  '  - T1.1.3.2.1. Customizar template — pai: A1.1.3.2\n' +
  '  - T1.1.3.2.2. Enviar por e-mail — pai: A1.1.3.2\n' +
  '\n' +
  '#### S1.1.4. Negociação (Subprocesso) — pai: E1.1\n' +
  'Ajustar condições comerciais e aprovar desconto.\n' +
  '- A1.1.4.1. Negociar preço/prazo (Atividade) — pai: S1.1.4\n' +
  '  - T1.1.4.1.1. Aplicar desconto ≤10% — pai: A1.1.4.1\n' +
  '  - T1.1.4.1.2. Escalar desconto >10% ao diretor — pai: A1.1.4.1\n' +
  '\n' +
  '#### S1.1.5. Fechamento (Subprocesso) — pai: E1.1\n' +
  'Formalizar contrato e iniciar onboarding.\n' +
  '- A1.1.5.1. Enviar contrato (Atividade) — pai: S1.1.5\n' +
  '  - T1.1.5.1.1. Gerar DocuSign — pai: A1.1.5.1\n' +
  '- A1.1.5.2. Onboarding (Atividade) — pai: S1.1.5\n' +
  '  - T1.1.5.2.1. Time de CS agenda kickoff em até 5 dias — pai: A1.1.5.2\n';

/** BPMN 2.0 XML — Vendas PME (Júlia, 2.3). */
const FLOW_CONTENT =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
  'id="Definitions_vendas" targetNamespace="http://process-ai/flow/vendas">\n' +
  '  <bpmn:process id="Process_vendas" isExecutable="false">\n' +
  '    <bpmn:laneSet id="LaneSet_vendas">\n' +
  '      <bpmn:lane id="Lane_vendedor" name="Vendedor">\n' +
  '        <bpmn:flowNodeRef>Start_captacao_lead</bpmn:flowNodeRef>\n' +
  '        <bpmn:flowNodeRef>A1.1.1.2</bpmn:flowNodeRef>\n' +
  '        <bpmn:flowNodeRef>A1.1.2.1</bpmn:flowNodeRef>\n' +
  '        <bpmn:flowNodeRef>Gateway_qualificado</bpmn:flowNodeRef>\n' +
  '        <bpmn:flowNodeRef>A1.1.3.1</bpmn:flowNodeRef>\n' +
  '        <bpmn:flowNodeRef>A1.1.3.2</bpmn:flowNodeRef>\n' +
  '        <bpmn:flowNodeRef>A1.1.4.1</bpmn:flowNodeRef>\n' +
  '        <bpmn:flowNodeRef>Gateway_aprovado</bpmn:flowNodeRef>\n' +
  '        <bpmn:flowNodeRef>A1.1.5.1</bpmn:flowNodeRef>\n' +
  '        <bpmn:flowNodeRef>A1.1.5.2</bpmn:flowNodeRef>\n' +
  '      </bpmn:lane>\n' +
  '      <bpmn:lane id="Lane_cliente" name="Cliente">\n' +
  '        <bpmn:flowNodeRef>End_cliente_fechado</bpmn:flowNodeRef>\n' +
  '        <bpmn:flowNodeRef>End_lead_descartado</bpmn:flowNodeRef>\n' +
  '        <bpmn:flowNodeRef>End_proposta_recusada</bpmn:flowNodeRef>\n' +
  '      </bpmn:lane>\n' +
  '    </bpmn:laneSet>\n' +
  '    <bpmn:startEvent id="Start_captacao_lead" name="Lead captado"/>\n' +
  '    <bpmn:task id="A1.1.1.2" name="Registrar no CRM (HubSpot)"/>\n' +
  '    <bpmn:task id="A1.1.2.1" name="Contato inicial (até 24h)"/>\n' +
  '    <bpmn:exclusiveGateway id="Gateway_qualificado" name="Lead qualificado?"/>\n' +
  '    <bpmn:task id="A1.1.3.1" name="Call de aprofundamento (30min)"/>\n' +
  '    <bpmn:task id="A1.1.3.2" name="Montar e enviar proposta (2 dias)"/>\n' +
  '    <bpmn:task id="A1.1.4.1" name="Negociar (desconto ≤10% autônomo)"/>\n' +
  '    <bpmn:exclusiveGateway id="Gateway_aprovado" name="Proposta aprovada?"/>\n' +
  '    <bpmn:task id="A1.1.5.1" name="Enviar contrato (DocuSign)"/>\n' +
  '    <bpmn:task id="A1.1.5.2" name="Onboarding (CS, 5 dias)"/>\n' +
  '    <bpmn:endEvent id="End_cliente_fechado" name="Cliente fechado"/>\n' +
  '    <bpmn:endEvent id="End_lead_descartado" name="Lead descartado"/>\n' +
  '    <bpmn:endEvent id="End_proposta_recusada" name="Proposta recusada"/>\n' +
  '    <bpmn:sequenceFlow id="Flow_s1" sourceRef="Start_captacao_lead" targetRef="A1.1.1.2"/>\n' +
  '    <bpmn:sequenceFlow id="Flow_s2" sourceRef="A1.1.1.2" targetRef="A1.1.2.1"/>\n' +
  '    <bpmn:sequenceFlow id="Flow_s3" sourceRef="A1.1.2.1" targetRef="Gateway_qualificado"/>\n' +
  '    <bpmn:sequenceFlow id="Flow_s4" sourceRef="Gateway_qualificado" targetRef="A1.1.3.1">\n' +
  '      <bpmn:conditionExpression>Lead qualificado</bpmn:conditionExpression>\n' +
  '    </bpmn:sequenceFlow>\n' +
  '    <bpmn:sequenceFlow id="Flow_s4n" sourceRef="Gateway_qualificado" targetRef="End_lead_descartado">\n' +
  '      <bpmn:conditionExpression>Não qualificado</bpmn:conditionExpression>\n' +
  '    </bpmn:sequenceFlow>\n' +
  '    <bpmn:sequenceFlow id="Flow_s5" sourceRef="A1.1.3.1" targetRef="A1.1.3.2"/>\n' +
  '    <bpmn:sequenceFlow id="Flow_s6" sourceRef="A1.1.3.2" targetRef="A1.1.4.1"/>\n' +
  '    <bpmn:sequenceFlow id="Flow_s7" sourceRef="A1.1.4.1" targetRef="Gateway_aprovado"/>\n' +
  '    <bpmn:sequenceFlow id="Flow_s8" sourceRef="Gateway_aprovado" targetRef="A1.1.5.1">\n' +
  '      <bpmn:conditionExpression>Proposta aprovada</bpmn:conditionExpression>\n' +
  '    </bpmn:sequenceFlow>\n' +
  '    <bpmn:sequenceFlow id="Flow_s8n" sourceRef="Gateway_aprovado" targetRef="End_proposta_recusada">\n' +
  '      <bpmn:conditionExpression>Proposta recusada</bpmn:conditionExpression>\n' +
  '    </bpmn:sequenceFlow>\n' +
  '    <bpmn:sequenceFlow id="Flow_s9" sourceRef="A1.1.5.1" targetRef="A1.1.5.2"/>\n' +
  '    <bpmn:sequenceFlow id="Flow_s10" sourceRef="A1.1.5.2" targetRef="End_cliente_fechado"/>\n' +
  '  </bpmn:process>\n' +
  '</bpmn:definitions>';

/** POP + Diagnóstico — Vendas PME (Zanoni, 2.4). */
const POP_CONTENT =
  '# POP-001 — Qualificação de Lead (ref: A1.1.2.1)\n' +
  '\n' +
  '**Objetivo:** Garantir que todo lead receba o primeiro contato em até 24h e seja ' +
  'avaliado nos critérios de fit.\n' +
  '\n' +
  '**Passos:**\n' +
  '1. Receber lead do CRM (HubSpot) — gatilho: novo contato criado.\n' +
  '2. Ligar ou enviar e-mail em até 24h (T1.1.2.1.1).\n' +
  '3. Aplicar checklist BANT: Budget (orçamento), Authority (tomador de decisão), ' +
  'Need (necessidade real), Timeline (urgência) — T1.1.2.1.2.\n' +
  '4. Se BANT positivo → agendar call de aprofundamento (A1.1.2.2). Se negativo → ' +
  'arquivar lead com motivo.\n' +
  '\n' +
  '# POP-002 — Follow-up Pós-Proposta (ref: A1.1.3.2)\n' +
  '\n' +
  '**Objetivo:** Garantir follow-up estruturado após envio de proposta, reduzindo ' +
  'o tempo de fechamento.\n' +
  '\n' +
  '**Passos:**\n' +
  '1. Após enviar proposta (A1.1.3.2), agendar follow-up no CRM para 2 dias úteis.\n' +
  '2. Follow-up 1 (dia +2): e-mail de check-in — "Ficou alguma dúvida?"\n' +
  '3. Follow-up 2 (dia +5): ligação de reforço.\n' +
  '4. Follow-up 3 (dia +10): e-mail de fechamento — "Vamos seguir?"\n' +
  '5. Se sem resposta após 3 follow-ups → arquivar lead e reportar ao diretor.\n' +
  '\n' +
  '# Diagnóstico Consolidado — Processo de Vendas\n' +
  '\n' +
  '## Gargalos identificados\n' +
  '- **Gargalo 1 — Propostas (S1.1.3):** O vendedor Sênior é sobrecarregado (20 ' +
  'propostas/mês para 1 pessoa). O tempo médio de proposta (2 dias) frequentemente ' +
  'estoura para 5 dias quando há acúmulo.\n' +
  '- **Gargalo 2 — Negociação (S1.1.4):** Descontos >10% escalados ao diretor ' +
  'comercial levam 2-5 dias para aprovação — sem SLA.\n' +
  '\n' +
  '## Gaps\n' +
  '- **SLA de follow-up pós-proposta:** Não há processo formal de follow-up — cada ' +
  'vendedor faz quando lembra (🔴 gap de padronização).\n' +
  '- **Template de proposta:** Cada vendedor usa seu próprio formato — sem ' +
  'padronização (🔴 gap de consistência).\n' +
  '\n' +
  '## Recomendações\n' +
  '- **Curto prazo:** Implementar o POP-002 (follow-up pós-proposta) imediatamente — ' +
  'baixo esforço, alto impacto na conversão.\n' +
  '- **Médio prazo:** Contratar 2º vendedor Sênior ou dividir carteira por setor ' +
  'para reduzir sobrecarga.\n' +
  '- **Médio prazo:** Criar template padrão de proposta no HubSpot (reduz ' +
  'variabilidade e acelera montagem).\n';

// ---- Teste principal ----

test('E2E (2.7): pipeline Vendas/PME com fixture realista + calibração + contador de turnos', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-e2e-pipe-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });
    let turnCount = 0;

    /** Incrementa o contador de turnos (1 comando CLI = 1 turno). */
    function turn(): void { turnCount++; }

    // ---- Início + Gate 0 ----
    turn(); await runJson(['resume'], adapter, tmp);
    turn(); await runJson(['stage', '--to', 'scope'], adapter, tmp);
    turn(); await runJson(['gate', '--id', 'gate-0', '--decision', 'approved'], adapter, tmp);

    // ---- Bento (discovery): entrevista + sipoc + value-chain ----
    turn(); await runJson(['gate', '--id', 'gate-1', '--decision', 'approved'], adapter, tmp);
    turn(); await runJson(['stage', '--to', 'discovery'], adapter, tmp);

    // Entrevista persistida (discovery-interview) — fonte primária do Bento.
    turn(); const interview = await propose(adapter, tmp, {
      artifactType: 'discovery-interview',
      content: INTERVIEW_CONTENT,
    });

    // SIPOC realista com claims sourceando a entrevista.
    turn(); const sipoc = await propose(adapter, tmp, {
      artifactType: 'sipoc',
      content: SIPOC_CONTENT,
      claims: [
        {
          statement: 'O Marketing é o principal fornecedor de leads (Google Ads, LinkedIn, site)',
          level: '🟢',
          source: { artifactType: 'discovery-interview', sha256: interview.sha256, excerpt: 'Principalmente por indicação de clientes atuais e pelo site. O time de marketing também roda campanhas no Google Ads e LinkedIn' },
          reasoning: 'Confirmado pelo leigo na entrevista — fornecedores listados nominalmente',
        },
        {
          statement: 'Recebemos em média 40 leads por mês',
          level: '🟢',
          source: { artifactType: 'discovery-interview', sha256: interview.sha256, excerpt: 'Recebemos em média 40 leads/mês' },
          reasoning: 'Métrica confirmada na entrevista',
        },
        {
          statement: 'Os clientes-alvo são PMEs B2B de 20-200 funcionários',
          level: '🟡',
          reasoning: 'Inferido do perfil dos clientes atuais — não confirmado explicitamente na entrevista',
        },
        { statement: 'Taxa de conversão lead→cliente', level: '🔴', reasoning: 'Leigo não soube informar — gap declarado' },
      ],
    });

    // Cadeia de valor com claims.
    turn(); const valueChain = await propose(adapter, tmp, {
      artifactType: 'value-chain',
      content: VALUE_CHAIN_CONTENT,
      claims: [
        {
          statement: 'O processo de Vendas tem 5 macroprocessos: Prospecção, Qualificação, Proposta, Negociação, Fechamento',
          level: '🟢',
          source: { artifactType: 'discovery-interview', sha256: interview.sha256, excerpt: 'call de aprofundamento com o vendedor Sênior' },
          reasoning: 'Macroprocessos derivados das etapas descritas na entrevista',
        },
        {
          statement: 'O ciclo médio é de 3 semanas (lead→fechamento)',
          level: '🟢',
          source: { artifactType: 'discovery-interview', sha256: interview.sha256, excerpt: 'Em média 3 semanas' },
          reasoning: 'Métrica confirmada na entrevista',
        },
      ],
    });

    // ---- Miguel (mapping): hierarquia completa + claims ----
    turn(); await runJson(['gate', '--id', 'gate-2', '--decision', 'approved'], adapter, tmp);
    turn(); await runJson(['stage', '--to', 'mapping'], adapter, tmp);

    turn(); const hierarchy = await propose(adapter, tmp, {
      artifactType: 'hierarchy',
      content: HIERARCHY_CONTENT,
      claims: [
        {
          statement: 'M1 (Vendas) é o macroprocesso raiz, derivado da Cadeia de Valor',
          level: '🟢',
          source: { artifactType: 'value-chain', sha256: valueChain.sha256, excerpt: '**Prospecção** — Captação de leads' },
          reasoning: 'M1 corresponde nominalmente ao primeiro elo da value-chain',
        },
        {
          statement: 'A hierarquia tem 5 níveis: M1 → E1.1 → S1.1.1..S1.1.5 → A1.1.x.y → T1.1.x.y.z',
          level: '🟢',
          source: { artifactType: 'value-chain', sha256: valueChain.sha256, excerpt: 'Prospecção' },
          reasoning: 'Decomposição confirmada pela estrutura da value-chain',
        },
        {
          statement: 'A atividade A1.1.3.2 (Montar proposta) é a principal restrição do fluxo',
          level: '🟡',
          reasoning: 'Inferido do relato de sobrecarga do Sênior — não confirmado com métrica exata de lead time',
        },
        {
          statement: 'Claim com fonte inexistente (deve degradar)',
          level: '🟢',
          source: { artifactType: 'value-chain', sha256: NONEXISTENT_SHA, excerpt: 'irrelevante' },
          reasoning: 'sha256 não resolve a manifesto → degrada a 🟡 (unresolved-source)',
        },
        { statement: 'O lead time de cada tarefa é indeterminado', level: '🔴', reasoning: 'Nenhuma medição de tempo por tarefa — gap estrutural' },
      ],
    });

    // ---- Júlia (modeling): BPMN 2.0 XML + claims ----
    turn(); await runJson(['gate', '--id', 'gate-3', '--decision', 'approved'], adapter, tmp);
    turn(); await runJson(['stage', '--to', 'modeling'], adapter, tmp);

    turn(); const flow = await propose(adapter, tmp, {
      artifactType: 'flow',
      content: FLOW_CONTENT,
      claims: [
        {
          statement: 'A tarefa A1.1.2.1 (Contato inicial até 24h) deriva da hierarchy de Miguel',
          level: '🟢',
          source: { artifactType: 'hierarchy', sha256: hierarchy.sha256, excerpt: 'A1.1.2.1. Contato inicial (Atividade)' },
          reasoning: 'Deriva nominalmente da atividade A1.1.2.1 na hierarchy',
        },
        {
          statement: 'O gateway exclusivo Gateway_qualificado (decisão de qualificação) é inferido do processo',
          level: '🟡',
          reasoning: 'Ponto de decisão inferido — não explícito como gateway na hierarchy',
        },
        {
          statement: 'O tempo entre proposta (A1.1.3.2) e negociação (A1.1.4.1) é indeterminado',
          level: '🔴',
          reasoning: 'Sem SLA documentado entre essas etapas — gap de medição',
        },
        {
          statement: 'Gargalo: handoff manual entre A1.1.3.2 (Proposta) e A1.1.4.1 (Negociação) sem sistema integrador',
          level: '🟡',
          reasoning: 'Evidência: a sequenceFlow Flow_s6 é manual (e-mail) — inferido como ponto de espera; tempo médio 2-5 dias segundo entrevista',
        },
      ],
    });

    // ---- Zanoni (standardization): POPs + diagnóstico ----
    turn(); await runJson(['gate', '--id', 'gate-4', '--decision', 'approved'], adapter, tmp);
    turn(); await runJson(['stage', '--to', 'standardization'], adapter, tmp);

    turn(); const pop = await propose(adapter, tmp, {
      artifactType: 'pop',
      content: POP_CONTENT,
      claims: [
        {
          statement: 'O POP-001 (Qualificação de Lead) referencia a atividade A1.1.2.1 da hierarchy',
          level: '🟢',
          source: { artifactType: 'flow', sha256: flow.sha256, excerpt: 'A1.1.2.1' },
          reasoning: 'Deriva da tarefa A1.1.2.1 confirmada no flow BPMN de Júlia',
        },
        {
          statement: 'Gargalo 1: vendedor Sênior sobrecarregado (20 propostas/mês) — reduzir com 2º Sênior',
          level: '🟡',
          reasoning: 'Recomendação inferida a partir do gargalo — a solução (contratar) é inferencial, não confirmada por viabilidade financeira',
        },
        {
          statement: 'O SLA de follow-up pós-proposta é gap (não existe processo formal)',
          level: '🔴',
          reasoning: 'Gap declarado — sem processo de follow-up documentado; citado na entrevista',
        },
      ],
    });

    // ---- Encerramento: summary + relatório ----
    turn(); await runJson(['stage', '--to', 'summary'], adapter, tmp);

    turn(); const reportRes = await dispatch(parseArgs(['report']), adapter, tmp);
    assert.match(reportRes.output, /Relatório de Confiança/);
    assert.doesNotMatch(
      reportRes.output,
      /Nenhuma afirmação registrada/,
      'ledger não-vazio → relatório sem a nota de zeros honestos',
    );

    // Entregável final (resumo + relatório embutido).
    turn(); const summary = await propose(adapter, tmp, {
      artifactType: 'summary-report',
      content: '# Resumo de Encerramento — Processo de Vendas (Distribuidora B2B)\n' +
        'Pipeline completa com 7 artefatos produzidos.\n\n' +
        reportRes.output,
    });

    // ---- Asserções de estado ----
    const cp = await readCheckpoint(tmp);

    const types = cp.artifacts.map((a) => a.artifactType).sort();
    assert.deepEqual(
      types,
      ['discovery-interview', 'flow', 'hierarchy', 'pop', 'sipoc', 'summary-report', 'value-chain'],
      '7 artefatos commitados pela pipeline',
    );
    assert.equal(cp.artifacts.length, 7);

    const gateIds = cp.gates.map((g) => g.gateId).sort();
    assert.deepEqual(gateIds, ['gate-0', 'gate-1', 'gate-2', 'gate-3', 'gate-4']);
    assert.ok(cp.gates.every((g) => g.decision === 'approved'), 'todos os 5 gates com decision=approved (AC1)');
    assert.equal(cp.stage, 'summary');

    // ---- Ledger: não-vazio, 🟢🟡🔴, provenance cruzada, degradação ----
    // Leitura do ledger espelhando o scanLedger do toolkit (report.ts): strip de BOM UTF-8
    // líder + tolerância a linhas corrompidas (skip em vez de crashar o teste inteiro).
    let ledgerRaw = await fs.readFile(ledgerPath(tmp), 'utf8');
    if (ledgerRaw.charCodeAt(0) === 0xfeff) ledgerRaw = ledgerRaw.slice(1);
    type LedgerEntry = {
      validated: string; degradationReason?: string;
      source?: { sha256: string; artifactType?: string; excerpt?: string };
      statement?: string; reasoning?: string;
    };
    const entries: LedgerEntry[] = [];
    for (const line of ledgerRaw.split('\n')) {
      if (line.length === 0) continue;
      try {
        entries.push(JSON.parse(line) as LedgerEntry);
      } catch {
        // linha corrompida — skip (parity com scanLedger do toolkit).
      }
    }
    const validated = entries.map((e) => e.validated);
    assert.ok(validated.length > 0, 'ledger não-vazio');
    assert.ok(validated.includes('🟢'), 'ao menos um 🟢 validado');
    assert.ok(validated.includes('🟡'), 'ao menos um 🟡');
    assert.ok(validated.includes('🔴'), 'ao menos um 🔴');

    // Provenance cruzada: 🟢 sourceando a entrevista (Bento), value-chain (Miguel), hierarchy (Júlia), flow (Zanoni).
    const interviewSourced = entries.find(
      (e) => e.validated === '🟢' && e.source?.sha256 === interview.sha256,
    );
    assert.ok(interviewSourced, 'ao menos um 🟢 sourceando a discovery-interview (Bento 2.1)');

    // O claim com sha inexistente foi degradado a 🟡 (unresolved-source).
    const degraded = entries.find((e) => e.degradationReason === 'unresolved-source');
    assert.ok(degraded, 'claim com fonte inexistente degradado a 🟡 (unresolved-source)');
    assert.equal(degraded!.validated, '🟡');

    // AC4 (2.5): statement/reasoning persistidos no ledger.
    const withStatement = entries.filter((e) => typeof e.statement === 'string' && e.statement.length > 0);
    assert.ok(withStatement.length > 0, 'entries do ledger devem conter statement (2.5 AC4)');
    const withReasoning = entries.filter((e) => typeof e.reasoning === 'string' && e.reasoning.length > 0);
    assert.ok(withReasoning.length > 0, 'entries do ledger devem conter reasoning (2.5 AC4)');

    // ---- 2.7: Calibração de 🟢 (SM-2 — ≥85% excerpt-verified) ----
    const greenEntries = entries.filter((e) => e.validated === '🟢');
    assert.ok(greenEntries.length > 0, 'deve haver 🟢 para calibrar');

    let excerptVerified = 0;
    let excerptMismatch = 0;
    let excerptNoExcerpt = 0;
    let excerptSourceMissing = 0;

    for (const e of greenEntries) {
      if (!e.source) { excerptSourceMissing++; continue; }
      if (!e.source.excerpt || e.source.excerpt.trim().length === 0) { excerptNoExcerpt++; continue; }

      // Segunda verificação independente do excerpt (calibração — espelha verifyExcerpt,
      // incluindo a canon CRLF→LF de confidence.ts F6 / report.ts F6).
      const canon = (s: string) => s.replace(/\r\n?/g, '\n');
      const manifestPath = path.join(tmp, '.process-ai', 'manifests',
        `${e.source.artifactType ?? 'unknown'}-${e.source.sha256}.json`);
      try {
        const manifestRaw = await fs.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestRaw) as { artifactPath?: string };
        if (typeof manifest.artifactPath !== 'string' || manifest.artifactPath.length === 0) {
          excerptSourceMissing++; continue;
        }
        const artifactAbs = path.join(tmp, manifest.artifactPath);
        const content = await fs.readFile(artifactAbs, 'utf8');
        if (canon(content).includes(canon(e.source.excerpt))) {
          excerptVerified++;
        } else {
          excerptMismatch++;
        }
      } catch {
        excerptSourceMissing++;
      }
    }

    const totalWithExcerpt = excerptVerified + excerptMismatch;
    // Fecha a janela vacuosa: antes, se todos os source-lookups falhassem (totalWithExcerpt===0)
    // o ratio era pulado e o teste passava sem verificar nenhum excerpt.
    assert.ok(totalWithExcerpt > 0,
      `Calibração deve verificar ao menos 1 excerpt (${excerptVerified} verified, ${excerptMismatch} mismatch, ${excerptNoExcerpt} no-excerpt, ${excerptSourceMissing} source-missing)`);
    const ratio = excerptVerified / totalWithExcerpt;
    assert.ok(
      ratio >= 0.85,
      `Calibração 🟢: ${excerptVerified}/${totalWithExcerpt} excerpts verificados = ${(ratio * 100).toFixed(0)}% (meta ≥85%)`,
    );
    // Regression guard: 0 source-missing esperado no happy path (manifestos resolvem).
    assert.equal(excerptSourceMissing, 0,
      `0 source-missing na calibração — lookup de manifesto quebrou? (${excerptVerified} verified, ${excerptNoExcerpt} no-excerpt, ${excerptSourceMissing} source-missing)`);
    // Sanity: 0 mismatches esperados (verifyExcerpt do commit já garantiu; segunda verificação confirma).
    assert.equal(excerptMismatch, 0,
      `0 excerpt-mismatch na calibração (${excerptVerified} verified, ${excerptNoExcerpt} no-excerpt, ${excerptSourceMissing} source-missing)`);

    // ---- 2.7: Contador de turnos (NFR-7 proxy — ≤30 comandos CLI) ----
    assert.ok(turnCount <= 30, `turnos: ${turnCount} ≤ 30 (NFR-7 proxy estrutural)`);

    // ---- Resume subsequente NÃO duplica estado nem cria órfãos ----
    const walCursorBefore = cp.walCursor;
    turn(); // 1 comando = 1 turno (re-resume também conta — consistência com o resume inicial).
    const reResume = (await runJson(['resume'], adapter, tmp)) as {
      state: CheckpointState;
      orphans: unknown[];
    };
    assert.equal(reResume.state.artifacts.length, 7, 'artefatos não duplicados em re-resume');
    assert.equal(reResume.state.gates.length, 5, 'gates não duplicados em re-resume');
    assert.equal(reResume.state.walCursor, walCursorBefore, 'walCursor não deve regredir/avançar');
    assert.deepEqual(reResume.orphans, [], 'todos os manifestos referenciados → sem órfãos');

    // Sanity: o summary-report está em _process-ai_output/summary-report/.
    const norm = (p: string) => p.replace(/\\/g, '/');
    assert.ok(
      norm(summary.artifactPath).includes('_process-ai_output/summary-report/'),
      'entregável final em _process-ai_output/summary-report/',
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
