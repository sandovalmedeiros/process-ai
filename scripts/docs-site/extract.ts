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
