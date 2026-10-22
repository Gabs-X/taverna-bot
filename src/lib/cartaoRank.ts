// Cartão do /rank em SVG (934×282). O texto usa as fontes do sistema; emojis do nome são removidos
// porque o renderizador não desenha emoji colorido.

export type DadosRank = {
  nome: string;
  avatar?: string; // data URI
  nivel: number;
  xp: number;
  xpProximo: number;
  posicao: number;
  moedas: number;
  cor: string;
};

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const semEmoji = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/\s+/g, ' ').trim();

export function desenharCartaoRank(d: DadosRank) {
  const nome = escapar(semEmoji(d.nome).slice(0, 22) || 'Maluco');
  const fracao = Math.max(0, Math.min(1, d.xp / d.xpProximo));
  const larguraBarra = 560;
  const fonte = `font-family="Segoe UI, Inter, DejaVu Sans, Arial, sans-serif"`;
  const foto = d.avatar
    ? `<image href="${d.avatar}" x="48" y="51" width="180" height="180" clip-path="url(#circulo)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="138" cy="141" r="90" fill="#2a1f33"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 934 282" width="934" height="282">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d1029"/><stop offset="1" stop-color="#0b0612"/></linearGradient>
    <linearGradient id="barra" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${d.cor}"/><stop offset="1" stop-color="#f5b544"/></linearGradient>
    <radialGradient id="brilho" cx=".15" cy=".5" r=".6"><stop offset="0" stop-color="${d.cor}" stop-opacity=".35"/><stop offset="1" stop-color="${d.cor}" stop-opacity="0"/></radialGradient>
    <clipPath id="circulo"><circle cx="138" cy="141" r="90"/></clipPath>
  </defs>
  <rect width="934" height="282" rx="24" fill="url(#fundo)"/>
  <rect width="934" height="282" rx="24" fill="url(#brilho)"/>
  <rect x="1.5" y="1.5" width="931" height="279" rx="23" fill="none" stroke="${d.cor}" stroke-opacity=".5" stroke-width="3"/>
  <circle cx="138" cy="141" r="97" fill="none" stroke="url(#barra)" stroke-width="6"/>
  ${foto}

  <text x="270" y="118" ${fonte} font-size="40" font-weight="700" fill="#ffffff">${nome}</text>
  <text x="890" y="70" ${fonte} font-size="22" fill="#b8a9c9" text-anchor="end">RANK <tspan font-size="46" font-weight="700" fill="#ffffff">#${d.posicao}</tspan>   NÍVEL <tspan font-size="46" font-weight="700" fill="${d.cor}">${d.nivel}</tspan></text>

  <rect x="270" y="150" width="${larguraBarra}" height="34" rx="17" fill="#2a1f33"/>
  <rect x="270" y="150" width="${Math.max(34, larguraBarra * fracao).toFixed(1)}" height="34" rx="17" fill="url(#barra)"/>
  <text x="270" y="226" ${fonte} font-size="22" fill="#b8a9c9">${d.xp.toLocaleString('pt-BR')} / ${d.xpProximo.toLocaleString('pt-BR')} XP</text>
  <text x="830" y="226" ${fonte} font-size="22" fill="#f5b544" text-anchor="end">${d.moedas.toLocaleString('pt-BR')} moedas</text>
</svg>`;
}
