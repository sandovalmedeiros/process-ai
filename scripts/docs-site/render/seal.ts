/**
 * scripts/docs-site/render/seal.ts — selo gerativo (SVG inline) determinístico.
 *
 * Pure function, zero deps. PRNG mulberry32 alimentado pelo hash do seed →
 * anéis concêntricos de pontos. Mesmo seed ⇒ mesmo selo (rastreabilidade).
 * INVARIANTE AD-3: vive em scripts/.
 */

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** SVG inline do selo (120×120). Determinístico por seed. */
export function renderSeal(seed: string, seedPrefix: string): string {
  const rnd = mulberry32(hash32(seed));
  const cx = 60;
  const cy = 60;
  const rings = [
    { r: 52, n: 20 },
    { r: 40, n: 15 },
    { r: 28, n: 10 },
  ];
  let dots = '';
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const ang = (i / ring.n) * Math.PI * 2;
      const on = rnd() > 0.45;
      const x = cx + Math.cos(ang) * ring.r;
      const y = cy + Math.sin(ang) * ring.r;
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 2.3 : 1.0}" fill="${on ? '#58a6ff' : '#30363d'}"/>`;
    }
  }
  // Bezel: 24 ticks radiais "coin-edge" logo fora do círculo externo (r 56.5→59).
  // Puramente geométrico (ângulo fixo por índice) — não consome PRNG, então não
  // altera o padrão dos anéis de pontos. Additivo, determinístico.
  let bezel = '';
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    const x1 = cx + Math.cos(ang) * 56.5;
    const y1 = cy + Math.sin(ang) * 56.5;
    const x2 = cx + Math.cos(ang) * 59;
    const y2 = cy + Math.sin(ang) * 59;
    bezel += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#30363d" stroke-width="1"/>`;
  }
  return `<svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Selo gerativo do mapeamento (seed ${escapeXml(seedPrefix)})">
  <title>Selo determinístico — rastreabilidade SHA-256 dos artefatos (seed ${escapeXml(seedPrefix)})</title>
  <circle cx="${cx}" cy="${cy}" r="56" fill="none" stroke="#30363d" stroke-width="1"/>
  <circle cx="${cx}" cy="${cy}" r="34" fill="none" stroke="#30363d" stroke-width="1"/>
  ${bezel}
  ${dots}
  <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" fill="#8b949e">${escapeXml(seedPrefix)}</text>
</svg>`;
}
