/**
 * scripts/docs-site/extract.ts — parsers puros dos artefatos do mapeamento.
 *
 * Lê o body markdown (ou envelope legado {"body":"..."}) e extrai estruturas
 * tipadas para as páginas do minisite. Tudo pure function, defensivo (nunca
 * lança — entrada malforme vira string vazia / lista vazia).
 *
 * INVARIANTE AD-3: este módulo vive em scripts/ (fora do core toolkit/src/).
 * Sem dependências npm — apenas lógica pura + tipos.
 */

/** Body resolvido: aceita markdown cru ou envelope legado {"body":"..."}. */
export function resolveBody(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Envelope legado {"body":"..."} (formato pré-fix 676def0) ou conteúdo JSON.
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as unknown;
      if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
        const o = obj as Record<string, unknown>;
        if (typeof o.body === 'string') return o.body;
      }
    } catch {
      // Não é JSON válido → devolve o raw como body.
    }
  }
  return raw;
}

/** Título: primeiro heading "# " ou primeira linha não-vazia utilizável (truncado). */
export function extractTitle(body: string): string {
  const lines = body.split(/\r?\n/);
  for (const ln of lines) {
    const m = /^#\s+(.+)$/.exec(ln.trim());
    if (m) return m[1].trim().slice(0, 120);
  }
  for (const ln of lines) {
    const t = ln.trim();
    if (t && !t.startsWith('|') && !t.startsWith('---') && !t.startsWith('>')) {
      return t.replace(/^[#>\-\*\s]+/, '').trim().slice(0, 120);
    }
  }
  return '';
}

export interface GlossaryTerm {
  term: string;
  definition: string;
  source: string;
}

const BOLD_TERM = /\*\*([^*]{2,80})\*\*\s*[:：—–-]\s*([^\n]{2,300})/g;
const HEADING_TERM = /^#{2,3}\s+([^#\n]{2,80})$/;

function pushTerm(
  out: GlossaryTerm[],
  seen: Set<string>,
  term: string,
  definition: string,
  source: string,
): void {
  const t = term.trim();
  const key = t.toLowerCase();
  if (!t || t.length < 3 || seen.has(key)) return;
  // Filtra "ruído" de headings genéricos.
  if (/^(gloss[áa]rio|introdu[cç][ãa]o|resumo|observa[cç][õo]es|anexo)s?$/i.test(t)) return;
  seen.add(key);
  out.push({ term: t, definition: definition.replace(/\*\*/g, '').trim(), source });
}

/** Extrai termos de glossário de bodies markdown (padrões **Termo**: def e ##/### Termo). */
export function extractGlossaryTerms(
  items: ReadonlyArray<{ body: string; source: string }>,
): GlossaryTerm[] {
  const seen = new Set<string>();
  const out: GlossaryTerm[] = [];
  for (const it of items) {
    const body = it.body;
    if (!body) continue;
    const lines = body.split(/\r?\n/);
    // ## Termo  → termo = heading; definição = próxima linha de conteúdo.
    for (let i = 0; i < lines.length; i++) {
      const hm = HEADING_TERM.exec(lines[i].trim());
      if (!hm) continue;
      const term = hm[1].trim();
      let def = '';
      for (let j = i + 1; j < lines.length; j++) {
        const lineT = lines[j].trim();
        if (lineT && !lineT.startsWith('#')) {
          def = lineT;
          break;
        }
      }
      if (def) pushTerm(out, seen, term, def, it.source);
    }
    // **Termo**: definição (qualquer lugar do body).
    BOLD_TERM.lastIndex = 0;
    let m: RegExpExecArray | null = BOLD_TERM.exec(body);
    while (m !== null) {
      pushTerm(out, seen, m[1], m[2], it.source);
      m = BOLD_TERM.exec(body);
    }
  }
  return out.sort((a, b) => a.term.localeCompare(b.term, 'pt-BR'));
}

/** Contagem de artefatos por tipo (resumo p/ index). */
export function countByType(types: ReadonlyArray<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of types) counts[t] = (counts[t] ?? 0) + 1;
  return counts;
}

// ---- Provenance + gates (cronograma) ----

/** Entrada do ledger `.process-ai/provenance.jsonl` (uma por commit). */
export interface ProvenanceEntry {
  sha256: string;
  artifactType: string;
  agent: string;
  committedAt: string; // ISO-8601, pode ser '' se ausente
}

/**
 * Parseia o JSONL de provenance. Defensivo: pula linhas vazias/malformadas,
 * nunca lança. Shape canônico por commit.ts:313-326 = {sha256,artifactType,agent,committedAt}.
 */
export function parseProvenance(jsonl: string): ProvenanceEntry[] {
  const out: ProvenanceEntry[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t) as unknown;
      if (o !== null && typeof o === 'object' && !Array.isArray(o)) {
        const e = o as Record<string, unknown>;
        if (typeof e.sha256 === 'string' && typeof e.artifactType === 'string') {
          out.push({
            sha256: e.sha256,
            artifactType: e.artifactType,
            agent: typeof e.agent === 'string' ? e.agent : '',
            committedAt: typeof e.committedAt === 'string' ? e.committedAt : '',
          });
        }
      }
    } catch {
      // linha malformada — pula.
    }
  }
  return out;
}

/** Traduz a decisão canônica do gate para pt-BR (display no cronograma). */
export function gateDecisionPt(decision: string): string {
  switch (decision) {
    case 'approved':
      return 'aprovado';
    case 'rejected':
      return 'rejeitado';
    case 'changes-requested':
      return 'ajustes solicitados';
    default:
      return decision;
  }
}

/** Extrai o número do gate ("gate-3.5" → "3.5"; fallback p/ o id cru). */
export function gateNumber(gateId: string): string {
  const m = /gate-(\d+(?:\.\d+)?)/i.exec(gateId);
  return m ? m[1] : gateId;
}

// ---- POP splitting (páginas processos/<id>.html) ----

/**
 * Heading de POP. Aceita os 3 estilos do codebase:
 *   "## POP — Qualificação de lead (ref: A1.1.1.1)"   (skill canônica)
 *   "# POP-001 — Qualificação de Lead (ref: A1.1.2.1)" (fixture e2e)
 *   "# POP — Envio de proposta (A1.1.2.1)"             (fixture zanoni-pop, sem ref:)
 * Grupo 2 = título (com prefixo POP, limpo depois), grupo 3 = ID da hierarquia.
 */
const POP_HEADING = /^(#{1,4})\s+(.*?)\s*\((?:ref:\s*)?([AT]\d+(?:\.\d+){3,4})\)\s*$/;
const DIAG_HEADING = /^#{1,4}\s+Diagn[óo]stico\b/i;
const POP_PREFIX = /^POP[-\s]*\d*\s*[—–:\-]\s*/i;

export interface PopEntry {
  /** ID da hierarquia (ex.: "A1.1.2.1", "T1.1.1.1.1"). */
  id: string;
  /** Título limpo (sem prefixo "POP"/"POP-NNN"). */
  title: string;
  /** Markdown do procedimento, sem a linha de heading (a página já titula). */
  body: string;
}

export interface ParsedPop {
  entries: PopEntry[];
  /** Markdown da seção de diagnóstico consolidado (ou ''). */
  diagnostic: string;
}

function cleanPopTitle(raw: string): string {
  return raw.replace(POP_PREFIX, '').trim() || raw.trim();
}

/**
 * Divide o body de um artefato `pop` em procedimentos individuais (keyed por ID
 * da hierarquia) + a seção de diagnóstico consolidado (FR-13). Defensivo: se não
 * houver headings de POP reconhecíveis, retorna entries=[]. O diagnóstico é
 * capturado a partir do primeiro heading "## Diagnóstico…".
 */
export function parsePop(body: string): ParsedPop {
  const lines = body.split(/\r?\n/);
  const entries: PopEntry[] = [];
  let diagnostic = '';
  let curStart = -1;
  let curId = '';
  let curTitle = '';
  let inDiag = false;
  let diagStart = -1;

  const closeCurrent = (endIdx: number): void => {
    if (curStart >= 0 && curId) {
      const seg = lines.slice(curStart + 1, endIdx).join('\n').replace(/^\s+/, '');
      entries.push({ id: curId, title: curTitle, body: seg });
    }
    curStart = -1;
    curId = '';
    curTitle = '';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inDiag) {
      if (DIAG_HEADING.test(line)) {
        closeCurrent(i);
        inDiag = true;
        diagStart = i;
        continue;
      }
      const pm = POP_HEADING.exec(line);
      if (pm) {
        closeCurrent(i);
        curStart = i;
        curId = pm[3];
        curTitle = cleanPopTitle(pm[2]);
      }
    }
  }
  if (inDiag) {
    diagnostic = lines.slice(diagStart).join('\n');
  } else {
    closeCurrent(lines.length);
  }
  return { entries, diagnostic };
}

/**
 * Trunca markdown para um trecho legível em slide/deck, cortando num limite de
 * linha (não no meio de uma palavra/linha). Anexa nota de trecho.
 */
export function truncateMd(md: string, maxChars = 600): string {
  if (!md || md.length <= maxChars) return md;
  const cut = md.slice(0, maxChars);
  const lastBreak = cut.lastIndexOf('\n');
  const head = lastBreak > maxChars * 0.5 ? cut.slice(0, lastBreak) : cut;
  return `${head.trimRight()}\n\n*(trecho — ver artefato completo no mapeamento)*`;
}

// ---- Grafo fornecedores↔clientes (fornecedores-clientes.html, D3) ----

/**
 * Divide uma string em vírgulas de profundidade 0 — ignora vírgulas dentro de
 * parênteses/colchetes. Assim "Marketing (Ads, LinkedIn), CRM (HubSpot)" vira
 * ["Marketing (Ads, LinkedIn)", "CRM (HubSpot)"] (2 fornecedores, não 4).
 */
function splitTopLevelCommas(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter((x) => x.length > 0);
}

/** Rótulo curto de nó = texto antes do primeiro "(", truncado (detalhe fica no tooltip). */
function shortLabel(full: string): string {
  const head = full.split('(')[0].trim();
  return (head || full.trim()).slice(0, 42);
}

const SIPOC_KEY_MAP: Record<string, 'suppliers' | 'inputs' | 'process' | 'outputs' | 'customers'> = {
  suppliers: 'suppliers',
  inputs: 'inputs',
  process: 'process',
  outputs: 'outputs',
  customers: 'customers',
  // variantes pt-BR
  fornecedores: 'suppliers',
  entradas: 'inputs',
  processo: 'process',
  saidas: 'outputs',
  saidões: 'outputs',
  clientes: 'customers',
};
const SIPOC_LETTER_KEY: Record<string, 'suppliers' | 'inputs' | 'process' | 'outputs' | 'customers'> = {
  s: 'suppliers',
  i: 'inputs',
  p: 'process',
  o: 'outputs',
  c: 'customers',
};

export interface SipocRows {
  suppliers: string[];
  inputs: string[];
  /** Etapas do processo (split em →), vindas da linha **P**rocess do SIPOC. */
  process: string[];
  outputs: string[];
  customers: string[];
}

const EMPTY_SIPOC: SipocRows = { suppliers: [], inputs: [], process: [], outputs: [], customers: [] };

/**
 * Extrai as 5 linhas do SIPOC da tabela markdown. Cada linha "| **S**uppliers | … |"
 * é casada pela primeira célula (limpa de `*`, lowercased) contra o mapa canônico
 * (EN) + variantes pt-BR. O conteúdo (2ª célula) é splitado em vírgulas de nível 0,
 * EXCETO a linha Process (split em → — é a cadeia de etapas). Defensivo: body sem
 * tabela → EMPTY_SIPOC.
 */
export function parseSipocRows(body: string): SipocRows {
  const out: SipocRows = { suppliers: [], inputs: [], process: [], outputs: [], customers: [] };
  if (!body) return out;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 2) continue;
    const cleaned = cells[0].replace(/\*+/g, '').trim().toLowerCase();
    let key: 'suppliers' | 'inputs' | 'process' | 'outputs' | 'customers' | undefined = SIPOC_KEY_MAP[cleaned];
    if (!key) {
      // Fallback pela letra SIPOC (bold-letter convention: **S**uppliers, **C**customers, …).
      // Guarda de comprimento evita casar células longas que só começam com s/i/p/o/c.
      const letter = cleaned.charAt(0);
      if (letter && cleaned.length <= 12) {
        key = SIPOC_LETTER_KEY[letter];
      }
    }
    if (!key) continue;
    const content = cells.slice(1).join(' | ');
    if (key === 'process') {
      // split em → (ou ->) — é a cadeia de etapas, não uma lista por vírgulas.
      out.process = content
        .split(/\s*(?:→|->)\s*/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else {
      out[key] = splitTopLevelCommas(content);
    }
  }
  return out;
}

const VC_LINE = /^\s*(\d+)\.\s+(.+?)\s*$/;

/** Extrai o nome de um elo "1. **Prospecção** — desc" → "Prospecção". */
function extractLinkName(rest: string): string {
  const bold = /^\*\*([^*]+)\*\*/.exec(rest);
  if (bold) return bold[1].trim();
  // Sem bold: pega até o travessão em/en (separator canônico).
  const byDash = rest.split(/\s+[—–]\s+/)[0];
  return byDash.trim();
}

/**
 * Extrai os elos ordenados da cadeia de valor (lista `N. **Name** — desc`).
 * Defensivo: body sem lista numerada → []. Dedupe preservando ordem.
 */
export function parseValueChainLinks(body: string): string[] {
  if (!body) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of body.split(/\r?\n/)) {
    const m = VC_LINE.exec(raw);
    if (!m) continue;
    const name = extractLinkName(m[2]);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export type GraphGroup = 'supplier' | 'process' | 'customer';

export interface GraphNode {
  id: string;
  label: string;
  group: GraphGroup;
  detail?: string;
}
export interface GraphLink {
  source: string;
  target: string;
}
export interface ForceGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Atribui um id único por prefixo+label (dedupe com sufixo #2, #3, …). */
function uniqueId(prefix: string, label: string, used: Set<string>): string {
  let base = `${prefix}:${label}`;
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}#${n++}`;
  }
  used.add(id);
  return id;
}

/**
 * Monta o grafo força-dirigida de fornecedores↔clientes a partir dos bodies de
 * SIPOC (+ value-chain opcional). Modelo honesto:
 *   suppliers (esq.) → chain[0] → chain[1] → … → chain[last] → customers (dir.)
 * A cadeia vem dos elos da value-chain (prioridade) ou, na falta dela, da linha
 * **P**rocess do SIPOC (split em →). Sem cadeia, usa um nó "Processo" central.
 * Defensivo: sem suppliers E sem customers E sem cadeia → grafo vazio.
 */
export function buildSupplierCustomerGraph(sipocBody: string, vcBody?: string): ForceGraph {
  const sipoc = parseSipocRows(sipocBody);
  const chain =
    parseValueChainLinks(vcBody ?? '').length > 0
      ? parseValueChainLinks(vcBody ?? '')
      : sipoc.process;
  const used = new Set<string>();
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  const supNodes = sipoc.suppliers.map((s) => ({
    id: uniqueId('sup', shortLabel(s), used),
    label: shortLabel(s),
    group: 'supplier' as const,
    detail: s,
  }));
  // Nó "Processo" central SÓ faz sentido se houver endpoints p/ conectar; se não há
  // suppliers, customers E cadeia, o grafo é honestamente vazio.
  const hasEndpoints = sipoc.suppliers.length > 0 || sipoc.customers.length > 0;
  const procNodes =
    chain.length > 0
      ? chain.map((c) => ({
          id: uniqueId('proc', shortLabel(c), used),
          label: shortLabel(c),
          group: 'process' as const,
          detail: c,
        }))
      : hasEndpoints
        ? [{ id: uniqueId('proc', 'Processo', used), label: 'Processo', group: 'process' as const }]
        : [];
  const custNodes = sipoc.customers.map((c) => ({
    id: uniqueId('cust', shortLabel(c), used),
    label: shortLabel(c),
    group: 'customer' as const,
    detail: c,
  }));

  nodes.push(...supNodes, ...procNodes, ...custNodes);

  // Arestas: suppliers → chain[0]; chain[i] → chain[i+1]; chain[last] → customers.
  if (procNodes.length > 0) {
    const first = procNodes[0];
    const last = procNodes[procNodes.length - 1];
    for (const s of supNodes) links.push({ source: s.id, target: first.id });
    for (let i = 0; i + 1 < procNodes.length; i++) {
      links.push({ source: procNodes[i].id, target: procNodes[i + 1].id });
    }
    for (const c of custNodes) links.push({ source: last.id, target: c.id });
  }
  return { nodes, links };
}

// ---- Hierarquia 3D (hierarquia-3d.html, Three.js) ----

/**
 * Níveis canônicos da hierarquia de processos (Miguel): Macroprocesso → Processo
 * End-to-End → Subprocesso → Atividade → Tarefa. O ID de cada nó começa com a
 * letra do nível (M/E/S/A/T) seguida de dígitos pontuados — ex.: `M1`, `E1.1`,
 * `S1.1.1`, `A1.1.1.1`, `T1.1.1.1.1`.
 */
export type HierarchyLevel = 'M' | 'E' | 'S' | 'A' | 'T';

export interface HierarchyNode {
  id: string;
  level: HierarchyLevel;
  label: string;
  /** Nome do nível p/ display: "Macroprocesso", "Processo", … (do `(...)` ou default). */
  levelName: string;
  /** ID do nó-pai dentro da árvore, ou null se raiz. */
  parentId: string | null;
  /** Profundidade 0 (M) .. 4 (T). */
  depth: number;
}

export interface HierarchyTree {
  nodes: HierarchyNode[];
  /** IDs dos nós de topo (sem pai resolvido dentro da árvore). */
  rootIds: string[];
}

const LEVEL_ORDER: ReadonlyArray<HierarchyLevel> = ['M', 'E', 'S', 'A', 'T'];
const LEVEL_LETTER_BY_DEPTH: Record<number, HierarchyLevel> = { 0: 'M', 1: 'E', 2: 'S', 3: 'A', 4: 'T' };
const LEVEL_NAME_DEFAULT: Record<HierarchyLevel, string> = {
  M: 'Macroprocesso',
  E: 'Processo',
  S: 'Subprocesso',
  A: 'Atividade',
  T: 'Tarefa',
};

/** Token de ID hierárquico: letra M/E/S/A/T + dígitos pontuados. */
const HIER_ID = /([MAEST])(\d+(?:\.\d+)*)/;
/** Heading com ID hierárquico: `## M1. Nome (Macroprocesso) — pai: X`. */
const HIER_HEADING = /^\s*#{1,6}\s+[MAEST]\d+(?:\.\d+)*[\.\s]/;
/** Bullet com ID hierárquico: `- A1.1.1.1. Nome (Atividade) — pai: S1.1.1`. */
const HIER_BULLET = /^\s*[-*+]\s+[MAEST]\d+(?:\.\d+)*[\.\s]/;

/** Pai explícito `— pai: <ref>` (ref pode ser ID interno `M1` ou externo `Cadeia de Valor`). */
function extractExplicitPai(rest: string): string | null {
  const m = /\s+[—–-]\s*pai:\s*(.+?)\s*$/.exec(rest);
  return m ? m[1].trim() : null;
}

/** Nome do nível da primeira parenética `(Macroprocesso)`, ou default pela letra. */
function extractLevelName(rest: string, level: HierarchyLevel): string {
  const m = /\(([^)]{2,60})\)/.exec(rest);
  if (m) return m[1].trim();
  return LEVEL_NAME_DEFAULT[level];
}

/** Rótulo limpo: remove parenéticas, sufixo `pai:`, bold e espaços redundantes. */
function cleanHierarchyLabel(rest: string): string {
  return rest
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+[—–-]\s*pai:.*$/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pai implícito pela estrutura do ID: dropa o último segmento e troca a letra
 * pelo nível imediatamente acima. `T1.1.1.1.1` → `A1.1.1.1`; `E1.1` → `M1`;
 * `M1` → null (raiz). Defensivo: ID não-casável → null.
 */
function implicitParentId(id: string, level: HierarchyLevel): string | null {
  const depth = LEVEL_ORDER.indexOf(level);
  if (depth <= 0) return null;
  const m = HIER_ID.exec(id);
  if (!m) return null;
  const segs = m[2].split('.');
  if (segs.length <= 1) return null;
  segs.pop();
  return LEVEL_LETTER_BY_DEPTH[depth - 1] + segs.join('.');
}

/**
 * Parseia o body do artefato `hierarchy` numa árvore {nodes, rootIds}. Reconhece
 * IDs M/E/S/A/T em headings (`##`) e bullets (`-`); o nível vem da LETRA do ID
 * (canônica), não da profundidade do heading. O pai é resolvido assim:
 *   1. `— pai: <id>` explícito, SE o id existir na árvore;
 *   2. senão, implícito pela estrutura do ID (dropla último segmento);
 *   3. senão, null (raiz) — cobre `— pai: Cadeia de Valor` (referência externa).
 * Defensivo: linhas sem ID hierárquico são puladas; nunca lança. Body vazio →
 * árvore vazia (página renderiza o fallback textual com aviso).
 */
export function parseHierarchy(body: string): HierarchyTree {
  const out: HierarchyNode[] = [];
  const seen = new Set<string>();
  if (!body) return { nodes: out, rootIds: [] };
  for (const raw of body.split(/\r?\n/)) {
    let idLetter: HierarchyLevel;
    let num: string;
    let rest: string;
    if (HIER_HEADING.test(raw)) {
      const m = /^\s*#{1,6}\s+([MAEST])(\d+(?:\.\d+)*)\.?\s+(.+)$/.exec(raw);
      if (!m) continue;
      idLetter = m[1] as HierarchyLevel;
      num = m[2];
      rest = m[3];
    } else if (HIER_BULLET.test(raw)) {
      const m = /^\s*[-*+]\s+([MAEST])(\d+(?:\.\d+)*)\.?\s+(.+)$/.exec(raw);
      if (!m) continue;
      idLetter = m[1] as HierarchyLevel;
      num = m[2];
      rest = m[3];
    } else {
      continue;
    }
    const finalId = idLetter + num;
    if (seen.has(finalId)) continue; // dedupe pela 1ª ocorrência
    seen.add(finalId);
    const depth = LEVEL_ORDER.indexOf(idLetter);
    const label = cleanHierarchyLabel(rest);
    const levelName = extractLevelName(rest, idLetter);
    const explicitPai = extractExplicitPai(rest);
    const node: HierarchyNode & { _explicitPai?: string | null } = {
      id: finalId,
      level: idLetter,
      label: label || finalId,
      levelName,
      parentId: null, // resolvido no 2º passo
      depth: depth >= 0 ? depth : 0,
      _explicitPai: explicitPai,
    };
    out.push(node);
  }
  // 2º passo: resolve parentId (explícito-in-set → implícito-in-set → null).
  const idSet = new Set(out.map((n) => n.id));
  for (const n of out) {
    const ext = (n as HierarchyNode & { _explicitPai?: string | null })._explicitPai;
    let pid: string | null = null;
    if (ext && idSet.has(ext)) pid = ext;
    else {
      const impl = implicitParentId(n.id, n.level);
      pid = impl && idSet.has(impl) ? impl : null;
    }
    n.parentId = pid;
    delete (n as HierarchyNode & { _explicitPai?: string | null })._explicitPai;
  }
  const rootIds = out.filter((n) => n.parentId === null).map((n) => n.id);
  return { nodes: out, rootIds };
}

// ---- Métricas (metricas.html, ECharts) ----

/** Nó de treemap (ECharts): categoria com `children` aninhados OU folha com `value`. */
export interface TreemapNode {
  name: string;
  value?: number;
  children?: TreemapNode[];
}

/**
 * Monta o treemap da hierarquia: floresta de árvores aninhadas onde cada folha
 * vale 1 (uma unidade de granularidade). A estrutura espelha parentId: um nó
 * com filhos vira categoria (sem value — ECharts soma os filhos); um nó sem
 * filhos vira folha value=1. Defensivo: árvore vazia → []. Raízes órfãs
 * (pai externo não-resolvível) viram top-level — legível no treemap.
 */
export function buildHierarchyTreemap(tree: HierarchyTree): TreemapNode[] {
  if (!tree.nodes.length) return [];
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, HierarchyNode[]>();
  for (const n of tree.nodes) {
    if (n.parentId === null) continue; // raízes: top-level da floresta
    const arr = childrenOf.get(n.parentId) ?? [];
    arr.push(n);
    childrenOf.set(n.parentId, arr);
  }
  const build = (id: string): TreemapNode => {
    const node = byId.get(id);
    const kids = childrenOf.get(id) ?? [];
    const name = node ? (node.label || id) : id;
    if (kids.length) return { name, children: kids.map((k) => build(k.id)) };
    return { name, value: 1 };
  };
  return tree.rootIds.map((rid) => build(rid));
}

export interface LevelDistributionEntry {
  level: HierarchyLevel;
  levelName: string;
  count: number;
}

/**
 * Conta nós por nível (M/E/S/A/T), na ordem canônica Macro→Tarefa, omitindo
 * níveis ausentes. Defensivo: árvore vazia → [].
 */
export function buildLevelDistribution(tree: HierarchyTree): LevelDistributionEntry[] {
  const counts: Record<HierarchyLevel, number> = { M: 0, E: 0, S: 0, A: 0, T: 0 };
  for (const n of tree.nodes) counts[n.level]++;
  return (['M', 'E', 'S', 'A', 'T'] as const)
    .filter((lv) => counts[lv] > 0)
    .map((lv) => ({ level: lv, levelName: LEVEL_NAME_DEFAULT[lv], count: counts[lv] }));
}

export interface PopCoverage {
  /** Total de Atividades (nível A) na hierarquia (denominador). */
  total: number;
  /** Atividades com ≥1 POP documentado. */
  covered: number;
  /** Atividades sem POP (total − covered). */
  gap: number;
}

/**
 * Cobertura de POPs pelas Atividades da hierarquia. Um POP é keyed por ID
 * hierárquico de nível A ou T (POP_HEADING do parsePop): um POP direto numa
 * Atividade (A…) cobre essa Atividade; um POP numa Tarefa (T…) cobre a
 * Atividade-mãe implícita (T1.1.1.1.1 → A1.1.1.1, via implicitParentId). O
 * denominador é o nº de Atividades — Tarefas são granularidade abaixo do
 * padrão POP. Defensivo: sem hierarquia → total 0 (a página mostra "sem dados").
 */
export function computePopCoverage(tree: HierarchyTree, popIds: ReadonlySet<string>): PopCoverage {
  const atividades = tree.nodes.filter((n) => n.level === 'A');
  const total = atividades.length;
  if (!total) return { total: 0, covered: 0, gap: 0 };
  const coveredA = new Set<string>();
  for (const pid of popIds) {
    const m = HIER_ID.exec(pid);
    if (!m) continue;
    const letter = m[1] as HierarchyLevel;
    if (letter === 'A') {
      coveredA.add(pid);
    } else if (letter === 'T') {
      const impl = implicitParentId(pid, 'T'); // T1.1.1.1.1 → A1.1.1.1
      if (impl) coveredA.add(impl);
    }
  }
  const covered = atividades.filter((a) => coveredA.has(a.id)).length;
  return { total, covered, gap: total - covered };
}
