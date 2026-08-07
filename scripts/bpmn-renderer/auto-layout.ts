/**
 * scripts/bpmn-renderer/auto-layout.ts — Auto-layout simples para BPMN sem BPMNDiagram.
 *
 * Gera coordenadas básicas (x, y) para cada elemento BPMN com base na ordem
 * das sequenceFlows. Suficiente para que o bpmn-js viewer renderize o diagrama.
 * A qualidade do layout é funcional (elementos não sobrepostos), não estética.
 */

interface BpmnElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const TASK_W = 100;
const TASK_H = 60;
const EVENT_R = 18;
const GATEWAY_R = 25;
const LANE_W = 800;
const LANE_H = 120;
const LANE_HEADER = 30;
const H_GAP = 80;
const V_GAP = 40;

export function autoLayout(xml: string): string {
  // Extrai elementos do XML
  const taskIds = extractIds(xml, /<bpmn:task\s+id="([^"]+)"/g);
  const startIds = extractIds(xml, /<bpmn:startEvent\s+id="([^"]+)"/g);
  const endIds = extractIds(xml, /<bpmn:endEvent\s+id="([^"]+)"/g);
  const gatewayIds = extractIds(xml, /<bpmn:exclusiveGateway\s+id="([^"]+)"/g);
  const flowMatches = [...xml.matchAll(/<bpmn:sequenceFlow\s+id="([^"]+)"\s+sourceRef="([^"]+)"\s+targetRef="([^"]+)"/g)];

  // Ordena elementos por fluxo (topological sort aproximado)
  const elements = new Map<string, BpmnElement>();
  let y = 100;

  // Start events
  for (const id of startIds) {
    elements.set(id, { id, x: 80, y, width: EVENT_R * 2, height: EVENT_R * 2 });
  }

  // Segue os fluxos para posicionar tarefas
  const visited = new Set<string>(startIds);
  const queue = [...startIds];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currEl = elements.get(current);
    if (!currEl) continue;

    // Encontra fluxos saindo deste elemento
    let xOffset = currEl.x + (currEl.width || TASK_W) + H_GAP;
    let nextY = currEl.y;

    for (const [, , source, target] of flowMatches) {
      if (source === current && !visited.has(target)) {
        visited.add(target);
        queue.push(target);

        // Determina o tipo e tamanho do alvo
        if (taskIds.includes(target)) {
          elements.set(target, { id: target, x: xOffset, y: nextY, width: TASK_W, height: TASK_H });
          xOffset += TASK_W + H_GAP;
        } else if (gatewayIds.includes(target)) {
          elements.set(target, { id: target, x: xOffset, y: nextY, width: GATEWAY_R * 2, height: GATEWAY_R * 2 });
          xOffset += GATEWAY_R * 2 + H_GAP;
        } else if (endIds.includes(target)) {
          elements.set(target, { id: target, x: xOffset, y: nextY, width: EVENT_R * 2, height: EVENT_R * 2 });
        }
      }
    }
    y += Math.max(TASK_H, EVENT_R * 2) + V_GAP;
  }

  // Posiciona elementos não alcançados
  let freeY = y;
  for (const id of [...taskIds, ...gatewayIds, ...endIds]) {
    if (!elements.has(id)) {
      const isTask = taskIds.includes(id);
      elements.set(id, { id, x: 80, y: freeY, width: isTask ? TASK_W : EVENT_R * 2, height: isTask ? TASK_H : EVENT_R * 2 });
      freeY += (isTask ? TASK_H : EVENT_R * 2) + V_GAP;
    }
  }

  // Gera a seção BPMNDiagram
  const diElements: string[] = [];
  const processIdMatch = xml.match(/<bpmn:process\s+id="([^"]+)"/);
  const processId = processIdMatch ? processIdMatch[1] : 'Process';

  let planeElements = '';

  for (const [, el] of elements) {
    const x = el.x;
    const y = el.y;
    const w = el.width;
    const h = el.height;
    if (taskIds.includes(el.id)) {
      planeElements += `      <bpmndi:BPMNShape id="shape_${el.id}" bpmnElement="${el.id}">\n`;
      planeElements += `        <dc:Bounds x="${x}" y="${y}" width="${w}" height="${h}"/>\n`;
      planeElements += `      </bpmndi:BPMNShape>\n`;
    } else {
      planeElements += `      <bpmndi:BPMNShape id="shape_${el.id}" bpmnElement="${el.id}">\n`;
      planeElements += `        <dc:Bounds x="${x}" y="${y}" width="${w}" height="${h}"/>\n`;
      planeElements += `      </bpmndi:BPMNShape>\n`;
    }
  }

  // Adiciona edges para os sequenceFlows
  for (const [, flowId, source, target] of flowMatches) {
    const src = elements.get(source);
    const tgt = elements.get(target);
    if (src && tgt) {
      const sx = src.x + src.width / 2;
      const sy = src.y + src.height / 2;
      const tx = tgt.x + tgt.width / 2;
      const ty = tgt.y + tgt.height / 2;
      planeElements += `      <bpmndi:BPMNEdge id="edge_${flowId}" bpmnElement="${flowId}">\n`;
      planeElements += `        <di:waypoint x="${sx}" y="${sy}"/>\n`;
      planeElements += `        <di:waypoint x="${tx}" y="${ty}"/>\n`;
      planeElements += `      </bpmndi:BPMNEdge>\n`;
    }
  }

  const diSection = `
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">
${planeElements}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`;

  // Insere DI section antes do fechamento de definitions
  if (/<bpmndi:BPMNDiagram/i.test(xml)) return xml; // já tem DI
  return xml.replace('</bpmn:definitions>', diSection + '\n</bpmn:definitions>');
}

function extractIds(xml: string, regex: RegExp): string[] {
  const ids: string[] = [];
  for (const m of xml.matchAll(regex)) {
    ids.push(m[1]);
  }
  return ids;
}
