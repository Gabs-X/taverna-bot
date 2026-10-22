// Gera os emojis do servidor em assets/emojis/*.png (128×128, fundo transparente).
// Rodar: node scripts/gerar-emojis.ts   (o /setup sobe para o Discord os que faltarem)
// Arte própria em SVG; o texto (20, GG, RIP, F) usa as fontes do sistema na hora de gerar.
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { desenharCabecaGotica } from '../src/lib/goticaArte.ts';

const PASTA = 'assets/emojis';
const FONTE = `font-family="Segoe UI Black, Arial Black, Segoe UI, Arial, sans-serif" font-weight="900"`;
const svg = (corpo: string, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><defs>${defs}</defs>${corpo}</svg>`;
const brilho = (x: number, y: number, r = 6, cor = '#fff') =>
  `<path d="M${x} ${y - r} L${x + r * 0.28} ${y - r * 0.28} L${x + r} ${y} L${x + r * 0.28} ${y + r * 0.28} L${x} ${y + r} L${x - r * 0.28} ${y + r * 0.28} L${x - r} ${y} L${x - r * 0.28} ${y - r * 0.28} Z" fill="${cor}"/>`;

// Rosto amarelo 3D usado pelas reações.
const rostoDefs = `<radialGradient id="pele" cx=".38" cy=".3" r=".75"><stop offset="0" stop-color="#fff2a8"/><stop offset=".55" stop-color="#ffd23f"/><stop offset="1" stop-color="#e89a0c"/></radialGradient>
  <radialGradient id="rubor"><stop offset="0" stop-color="#ff6f8f" stop-opacity=".6"/><stop offset="1" stop-color="#ff6f8f" stop-opacity="0"/></radialGradient>`;
const rosto = (extra: string) =>
  `<circle cx="64" cy="66" r="56" fill="url(#pele)" stroke="#8a5300" stroke-width="3"/>
   <ellipse cx="46" cy="34" rx="18" ry="9" fill="#fff" opacity=".45" transform="rotate(-25 46 34)"/>${extra}`;

// d20 (icosaedro visto de frente) com as cores e o número.
function d20(claro: string, medio: string, escuro: string, linha: string, numero: string, corNumero: string, extra = '') {
  const hex = [0, 1, 2, 3, 4, 5].map((k) => {
    const a = (-90 + k * 60) * (Math.PI / 180);
    return [64 + 56 * Math.cos(a), 66 + 56 * Math.sin(a)];
  });
  const [t1, t2, t3] = [[64, 30], [96, 86], [32, 86]];
  const p = (pts: number[][]) => pts.map((q) => q.map((v) => v.toFixed(1)).join(' ')).join(' L');
  return svg(
    `${extra}
     <path d="M${p(hex)} Z" fill="url(#lado)" stroke="${linha}" stroke-width="3" stroke-linejoin="round"/>
     <path d="M${p([hex[0], t1, hex[1]])} M${p([hex[1], t2, hex[2]])} M${p([hex[3], t2, t3, hex[4]])} M${p([hex[5], t3, t1])}" fill="none" stroke="${linha}" stroke-width="2" stroke-linejoin="round" opacity=".8"/>
     <path d="M${p([hex[0], t1, hex[5]])} Z" fill="${claro}" opacity=".55"/>
     <path d="M${p([t1, t2, t3])} Z" fill="url(#frente)" stroke="${linha}" stroke-width="2.5" stroke-linejoin="round"/>
     <text x="64" y="${numero.length > 1 ? 79 : 81}" text-anchor="middle" ${FONTE} font-size="${numero.length > 1 ? 27 : 32}" fill="${corNumero}" stroke="${linha}" stroke-width="1.5">${numero}</text>`,
    `<linearGradient id="lado" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${medio}"/><stop offset="1" stop-color="${escuro}"/></linearGradient>
     <linearGradient id="frente" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${claro}"/><stop offset="1" stop-color="${medio}"/></linearGradient>
     <radialGradient id="aura"><stop offset="0" stop-color="#ffe066" stop-opacity=".9"/><stop offset="1" stop-color="#ffe066" stop-opacity="0"/></radialGradient>`,
  );
}

const EMOJIS: Record<string, string> = {
  // ---------- Taverna e RPG ----------
  taverna_cerveja: svg(
    `<path d="M86 50 h8 a16 16 0 0 1 16 16 v12 a16 16 0 0 1 -16 16 h-8" fill="none" stroke="#8a5a1c" stroke-width="13"/>
     <path d="M86 50 h8 a16 16 0 0 1 16 16 v12 a16 16 0 0 1 -16 16 h-8" fill="none" stroke="#e8b95a" stroke-width="7"/>
     <rect x="20" y="40" width="70" height="78" rx="11" fill="url(#cerveja)" stroke="#5c3510" stroke-width="3.5"/>
     <rect x="29" y="50" width="9" height="58" rx="4.5" fill="#fff" opacity=".5"/>
     <rect x="72" y="50" width="5" height="58" rx="2.5" fill="#fff" opacity=".25"/>
     ${[[50, 96, 3], [60, 80, 2.4], [46, 72, 2], [64, 104, 2.6], [56, 62, 1.8]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff6c8" opacity=".75"/>`).join('')}
     <path d="M14 46 C8 32 24 22 34 28 C38 14 58 12 64 24 C72 12 92 16 92 30 C104 30 106 46 94 50 C92 58 80 58 78 52 L76 64 C76 72 66 72 66 64 L66 52 C56 56 26 58 14 46 Z" fill="url(#espuma)" stroke="#c9b48a" stroke-width="2.5"/>
     <circle cx="40" cy="32" r="6" fill="#fff" opacity=".9"/><circle cx="66" cy="27" r="4" fill="#fff" opacity=".8"/>`,
    `<linearGradient id="cerveja" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffcf5a"/><stop offset=".55" stop-color="#f39c12"/><stop offset="1" stop-color="#b85d00"/></linearGradient>
     <linearGradient id="espuma" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#efe3c4"/></linearGradient>`,
  ),
  d20: d20('#c58df0', '#8e44ad', '#4a1a6b', '#22082f', '20', '#ffffff'),
  d20_critico: d20('#fff1b8', '#f2c14e', '#a8701c', '#5a3a08', '20', '#5a3a08',
    `<circle cx="64" cy="66" r="62" fill="url(#aura)"/>${brilho(16, 18, 9, '#fff6c0')}${brilho(112, 24, 7, '#fff6c0')}${brilho(110, 108, 8, '#fff6c0')}`),
  d20_falha: d20('#b7b7c4', '#6d6d7a', '#2e2e38', '#16161c', '1', '#ff4d4d',
    '').replace('</svg>', '<path d="M50 34 L58 52 L48 60 L60 76 L52 92" fill="none" stroke="#111" stroke-width="3" stroke-linejoin="round"/></svg>'),
  moeda_taverna: svg(
    `<circle cx="64" cy="66" r="56" fill="#8a5a10"/>
     <circle cx="64" cy="62" r="56" fill="url(#ouro)" stroke="#7a4d08" stroke-width="3"/>
     <circle cx="64" cy="62" r="44" fill="none" stroke="#b98316" stroke-width="3" stroke-dasharray="4 5"/>
     <g fill="#b98316"><rect x="46" y="44" width="28" height="36" rx="5"/><path d="M74 50 h5 a8 8 0 0 1 8 8 v6 a8 8 0 0 1 -8 8 h-5 v-6 h4 a3 3 0 0 0 3 -3 v-4 a3 3 0 0 0 -3 -3 h-4 Z"/><path d="M42 46 C40 38 50 34 54 38 C58 32 68 32 70 38 C76 36 80 44 76 48 Z"/></g>
     <path d="M26 44 A42 42 0 0 1 60 18" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".6"/>
     ${brilho(100, 28, 8)}`,
    `<radialGradient id="ouro" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#f5c542"/><stop offset="1" stop-color="#c88a12"/></radialGradient>`,
  ),
  level_up: svg(
    `<path d="M64 6 L80 44 L120 46 L89 72 L100 112 L64 89 L28 112 L39 72 L8 46 L48 44 Z" fill="url(#estrela)" stroke="#8a5a00" stroke-width="4" stroke-linejoin="round"/>
     <path d="M64 34 L84 58 H72 V82 H56 V58 H44 Z" fill="#2ecc71" stroke="#0e5c2f" stroke-width="3.5" stroke-linejoin="round"/>
     <path d="M60 40 L48 54" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
     ${brilho(18, 16, 6)}${brilho(112, 100, 6)}`,
    `<linearGradient id="estrela" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".5" stop-color="#ffcf33"/><stop offset="1" stop-color="#f08c00"/></linearGradient>`,
  ),
  rip: svg(
    `<ellipse cx="64" cy="118" rx="54" ry="8" fill="#1d3a26"/>
     <path d="M26 118 V54 A38 38 0 0 1 102 54 V118 Z" fill="url(#pedra)" stroke="#2e2e38" stroke-width="3.5"/>
     <path d="M34 112 V56 A30 30 0 0 1 64 26" fill="none" stroke="#fff" stroke-width="4" opacity=".35" stroke-linecap="round"/>
     <text x="64" y="76" text-anchor="middle" ${FONTE} font-size="28" fill="#3f3f4a" stroke="#d9d9e2" stroke-width=".8">RIP</text>
     <path d="M80 36 L74 50 L82 58 L76 70" fill="none" stroke="#3f3f4a" stroke-width="2.5"/>
     <g fill="#3fa55f">${[16, 28, 40, 88, 100, 112].map((x) => `<path d="M${x} 120 Q${x - 4} 104 ${x - 6} 98 Q${x + 2} 108 ${x + 4} 120 Z"/>`).join('')}</g>`,
    `<linearGradient id="pedra" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9c9d4"/><stop offset="1" stop-color="#6f6f7c"/></linearGradient>`,
  ),
  flechada: svg(
    `<g stroke-linecap="round">
       <path d="M14 114 L96 32" stroke="#2a6f96" stroke-width="9"/>
       <path d="M14 114 L96 32" stroke="#bfefff" stroke-width="4"/>
       <path d="M10 98 L24 104 L30 118 M4 106 L18 110 L22 124" stroke="#8fe0ff" stroke-width="5" fill="none"/>
       <path d="M20 70 L40 62 M30 92 L52 80 M60 116 L76 100" stroke="#bfefff" stroke-width="3" opacity=".7"/>
     </g>
     <path d="M88 24 L122 6 L104 40 L96 36 Z" fill="url(#gelo)" stroke="#1f5f86" stroke-width="3" stroke-linejoin="round"/>
     <path d="M100 22 L114 14" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
     ${brilho(64, 26, 7, '#e8fbff')}${brilho(110, 70, 6, '#e8fbff')}${brilho(36, 46, 5, '#e8fbff')}`,
    `<linearGradient id="gelo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#8fe0ff"/><stop offset="1" stop-color="#2a8fc9"/></linearGradient>`,
  ),
  cafe: svg(
    `<ellipse cx="60" cy="112" rx="50" ry="10" fill="#c9c2d6" stroke="#6b6380" stroke-width="3"/>
     <path d="M90 66 h6 a14 14 0 0 1 0 28 h-8" fill="none" stroke="#6b6380" stroke-width="10"/>
     <path d="M90 66 h6 a14 14 0 0 1 0 28 h-8" fill="none" stroke="#f4f0fa" stroke-width="5"/>
     <path d="M20 58 H96 V84 A32 26 0 0 1 64 110 H52 A32 26 0 0 1 20 84 Z" fill="url(#xicara)" stroke="#6b6380" stroke-width="3.5"/>
     <ellipse cx="58" cy="58" rx="38" ry="9" fill="#5a3218" stroke="#6b6380" stroke-width="3"/>
     <path d="M58 54 C52 50 46 56 52 60 L58 64 L64 60 C70 56 64 50 58 54 Z" fill="#e8c9a0"/>
     <g fill="none" stroke="#b9b2c9" stroke-width="5" stroke-linecap="round" opacity=".85">
       <path d="M42 42 C34 34 48 28 40 18"/><path d="M60 40 C52 30 68 24 58 10"/><path d="M78 42 C70 34 84 28 76 18"/>
     </g>
     <rect x="28" y="66" width="6" height="26" rx="3" fill="#fff" opacity=".7"/>`,
    `<linearGradient id="xicara" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d6cfe4"/></linearGradient>`,
  ),
  call: svg(
    `<path d="M24 74 V60 A40 40 0 0 1 104 60 V74" fill="none" stroke="#2a1f36" stroke-width="12" stroke-linecap="round"/>
     <path d="M24 74 V60 A40 40 0 0 1 104 60 V74" fill="none" stroke="#6b4a8a" stroke-width="5" stroke-linecap="round"/>
     <rect x="10" y="62" width="30" height="42" rx="13" fill="url(#concha)" stroke="#1a1024" stroke-width="3.5"/>
     <rect x="88" y="62" width="30" height="42" rx="13" fill="url(#concha)" stroke="#1a1024" stroke-width="3.5"/>
     <path d="M30 100 C34 116 54 120 68 116" fill="none" stroke="#1a1024" stroke-width="5" stroke-linecap="round"/>
     <circle cx="72" cy="115" r="7" fill="#2ecc71" stroke="#0e5c2f" stroke-width="3"/>
     <rect x="16" y="68" width="6" height="22" rx="3" fill="#fff" opacity=".45"/><rect x="94" y="68" width="6" height="22" rx="3" fill="#fff" opacity=".45"/>`,
    `<linearGradient id="concha" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b07ad8"/><stop offset="1" stop-color="#4a2266"/></linearGradient>`,
  ),
  gg: svg(
    `<rect x="6" y="26" width="116" height="76" rx="22" fill="#2a0f3d"/>
     <rect x="6" y="22" width="116" height="76" rx="22" fill="url(#gg)" stroke="#2a0f3d" stroke-width="3.5"/>
     <rect x="18" y="30" width="60" height="10" rx="5" fill="#fff" opacity=".35"/>
     <text x="64" y="80" text-anchor="middle" ${FONTE} font-size="48" fill="#fff" stroke="#2a0f3d" stroke-width="2.5" letter-spacing="2">GG</text>
     ${brilho(114, 18, 8, '#fff6c0')}${brilho(14, 104, 6, '#fff6c0')}`,
    `<linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b44dff"/><stop offset="1" stop-color="#ff4fa3"/></linearGradient>`,
  ),
  f_respeito: svg(
    `<rect x="12" y="20" width="104" height="100" rx="18" fill="#3a3346"/>
     <rect x="12" y="12" width="104" height="100" rx="18" fill="url(#tecla)" stroke="#1d1824" stroke-width="3.5"/>
     <rect x="24" y="20" width="80" height="76" rx="12" fill="url(#topo)"/>
     <text x="64" y="82" text-anchor="middle" ${FONTE} font-size="62" fill="#2a2433">F</text>`,
    `<linearGradient id="tecla" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d3e6"/><stop offset="1" stop-color="#8f86a3"/></linearGradient>
     <linearGradient id="topo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e2dcee"/></linearGradient>`,
  ),
  hype: svg(
    `<path d="M64 6 C70 30 98 40 100 74 C102 104 82 122 64 122 C42 122 24 104 26 78 C28 56 42 50 44 34 C54 44 54 54 52 62 C62 52 66 30 64 6 Z" fill="url(#fogo1)" stroke="#8a1c00" stroke-width="3.5" stroke-linejoin="round"/>
     <path d="M64 48 C70 64 84 72 82 92 C80 110 70 116 64 116 C52 116 44 106 46 92 C48 80 58 76 58 64 C64 70 66 58 64 48 Z" fill="url(#fogo2)"/>
     <path d="M64 80 C68 90 74 94 72 104 C70 112 66 114 64 114 C58 114 56 108 56 102 C56 94 62 92 64 80 Z" fill="#fff6c0"/>`,
    `<linearGradient id="fogo1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a1a"/><stop offset="1" stop-color="#e01e1e"/></linearGradient>
     <linearGradient id="fogo2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff8c1a"/></linearGradient>`,
  ),

  // ---------- Reações ----------
  maluco: svg(
    rosto(`<g fill="none" stroke="#3b2200" stroke-width="3.5" stroke-linecap="round">
        <path d="M44 52 m0 0 a3 3 0 1 1 3 3 a6 6 0 1 1 -6 -6 a9 9 0 1 1 9 9 a12 12 0 1 1 -12 -12"/>
        <path d="M84 52 m0 0 a3 3 0 1 0 -3 3 a6 6 0 1 0 6 -6 a9 9 0 1 0 -9 9 a12 12 0 1 0 12 -12"/>
        <path d="M30 34 L50 30 M78 26 L98 34"/>
      </g>
      <path d="M36 80 Q64 108 94 76 Q64 92 36 80 Z" fill="#3b0a10" stroke="#3b2200" stroke-width="3" stroke-linejoin="round"/>
      <path d="M62 90 Q74 112 86 98 Q88 88 80 86 Z" fill="#ff6f8f" stroke="#3b2200" stroke-width="2.5"/>
      <ellipse cx="28" cy="78" rx="10" ry="6" fill="url(#rubor)"/><ellipse cx="100" cy="76" rx="10" ry="6" fill="url(#rubor)"/>`),
    rostoDefs,
  ),
  chocado: svg(
    rosto(`<path d="M30 30 Q42 18 54 28 M74 28 Q86 18 98 30" fill="none" stroke="#3b2200" stroke-width="4" stroke-linecap="round"/>
      <circle cx="44" cy="54" r="15" fill="#fff" stroke="#3b2200" stroke-width="3"/><circle cx="84" cy="54" r="15" fill="#fff" stroke="#3b2200" stroke-width="3"/>
      <circle cx="44" cy="56" r="5" fill="#2a1600"/><circle cx="84" cy="56" r="5" fill="#2a1600"/>
      <ellipse cx="64" cy="92" rx="12" ry="16" fill="#3b0a10" stroke="#3b2200" stroke-width="3"/>
      <path d="M104 20 C98 30 96 36 102 40 C108 36 106 30 104 20 Z" fill="#7fd0ff" stroke="#2a6f96" stroke-width="2"/>`),
    rostoDefs,
  ),
  rindo: svg(
    `<g transform="rotate(-14 64 66)">${rosto(`<path d="M30 52 Q42 38 54 52 M74 52 Q86 38 98 52" fill="none" stroke="#3b2200" stroke-width="5" stroke-linecap="round"/>
      <path d="M28 66 Q64 70 100 66 Q96 108 64 112 Q32 108 28 66 Z" fill="#3b0a10" stroke="#3b2200" stroke-width="3" stroke-linejoin="round"/>
      <path d="M32 68 Q64 72 96 68 L94 78 Q64 82 34 78 Z" fill="#fff"/>
      <path d="M46 100 Q64 92 82 100 Q64 112 46 100 Z" fill="#ff6f8f"/>`)}</g>
     <path d="M14 56 C2 66 0 80 10 82 C18 80 20 68 14 56 Z" fill="#7fd0ff" stroke="#2a6f96" stroke-width="2"/>
     <path d="M112 42 C126 50 128 64 118 68 C110 66 108 54 112 42 Z" fill="#7fd0ff" stroke="#2a6f96" stroke-width="2"/>`,
    rostoDefs,
  ),
  caveira: svg(
    `<path d="M64 8 C34 8 14 28 14 56 C14 74 24 86 34 92 V110 Q34 120 44 120 H84 Q94 120 94 110 V92 C104 86 114 74 114 56 C114 28 94 8 64 8 Z" fill="url(#osso)" stroke="#3a3346" stroke-width="3.5"/>
     <ellipse cx="44" cy="60" rx="15" ry="17" fill="#2a1f36"/><ellipse cx="84" cy="60" rx="15" ry="17" fill="#2a1f36"/>
     <circle cx="48" cy="56" r="5" fill="#ff7aa2"/><circle cx="88" cy="56" r="5" fill="#ff7aa2"/>
     <circle cx="46" cy="54" r="2" fill="#fff"/><circle cx="86" cy="54" r="2" fill="#fff"/>
     <path d="M64 76 L58 88 H70 Z" fill="#2a1f36"/>
     <path d="M46 100 V118 M58 100 V120 M70 100 V120 M82 100 V118 M40 100 H88" stroke="#3a3346" stroke-width="3" fill="none"/>
     <ellipse cx="42" cy="26" rx="14" ry="7" fill="#fff" opacity=".7" transform="rotate(-25 42 26)"/>`,
    `<radialGradient id="osso" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e8e2f0"/><stop offset="1" stop-color="#a99fbc"/></radialGradient>`,
  ),
  coracao_gotico: svg(
    `<g fill="url(#asaC)" stroke="#12061c" stroke-width="3" stroke-linejoin="round">
       <path d="M30 50 C16 34 4 36 2 40 C10 44 10 52 6 58 C14 56 18 62 16 68 C22 64 28 66 30 70 Z"/>
       <path d="M98 50 C112 34 124 36 126 40 C118 44 118 52 122 58 C114 56 110 62 112 68 C106 64 100 66 98 70 Z"/>
     </g>
     <path d="M64 116 C30 92 18 72 20 52 C22 32 44 24 56 36 L64 44 L72 36 C84 24 106 32 108 52 C110 72 98 92 64 116 Z" fill="url(#coracao)" stroke="#12061c" stroke-width="4" stroke-linejoin="round"/>
     <path d="M36 50 C38 40 46 36 52 40" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".55"/>
     <path d="M64 58 V92 M54 68 H74" stroke="url(#prataC)" stroke-width="6" stroke-linecap="round"/>`,
    `<linearGradient id="coracao" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b2d8f"/><stop offset=".55" stop-color="#2a0f3d"/><stop offset="1" stop-color="#0b0612"/></linearGradient>
     <linearGradient id="asaC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2b7a"/><stop offset="1" stop-color="#1a0a24"/></linearGradient>
     <linearGradient id="prataC" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b8b4c8"/></linearGradient>`,
  ),
  morcego_fofo: svg(
    `<g fill="url(#asaM)" stroke="#2a1036" stroke-width="3" stroke-linejoin="round">
       <path d="M46 64 C34 30 8 22 2 34 C12 40 10 52 4 60 C16 58 22 66 20 76 C30 70 40 74 42 82 Z"/>
       <path d="M82 64 C94 30 120 22 126 34 C116 40 118 52 124 60 C112 58 106 66 108 76 C98 70 88 74 86 82 Z"/>
     </g>
     <path d="M42 50 L40 18 L58 40 Z M86 50 L88 18 L70 40 Z" fill="url(#pelo)" stroke="#2a1036" stroke-width="3" stroke-linejoin="round"/>
     <ellipse cx="64" cy="72" rx="34" ry="32" fill="url(#pelo)" stroke="#2a1036" stroke-width="3.5"/>
     <ellipse cx="51" cy="66" rx="10" ry="11" fill="#fff"/><ellipse cx="77" cy="66" rx="10" ry="11" fill="#fff"/>
     <ellipse cx="52" cy="68" rx="7" ry="8" fill="#d1243f"/><ellipse cx="78" cy="68" rx="7" ry="8" fill="#d1243f"/>
     <circle cx="49" cy="64" r="3" fill="#fff"/><circle cx="75" cy="64" r="3" fill="#fff"/>
     <ellipse cx="40" cy="84" rx="7" ry="4" fill="#ff7aa2" opacity=".6"/><ellipse cx="88" cy="84" rx="7" ry="4" fill="#ff7aa2" opacity=".6"/>
     <path d="M56 86 Q64 92 72 86" stroke="#12061c" stroke-width="3" fill="none" stroke-linecap="round"/>
     <path d="M66 88 L68 96 L70 88 Z" fill="#fff"/>`,
    `<radialGradient id="pelo" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#b394d6"/><stop offset=".6" stop-color="#6a4a8c"/><stop offset="1" stop-color="#3a2252"/></radialGradient>
     <linearGradient id="asaM" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4aa0"/><stop offset="1" stop-color="#2a1036"/></linearGradient>`,
  ),
};

// ---------- Góticas (a mesma arte do /gotica, só a cabeça) ----------
const GOTICAS = {
  gotica_feliz: desenharCabecaGotica({ pele: '#f6e3d8', cabelo: '#121016', olhos: '#7a1f3d', batom: '#4a0f2c', penteado: 'franja', vestido: '#3a2850' }, 'feliz'),
  gotica_triste: desenharCabecaGotica({ pele: '#9c6648', cabelo: '#e8e4ee', olhos: '#2f6f5e', batom: '#6b1d5c', penteado: 'coque', vestido: '#3a2850' }, 'triste'),
  gotica_apaixonada: desenharCabecaGotica({ pele: '#efd2c0', cabelo: '#5b0e2d', olhos: '#4b2a7b', batom: '#8b0a1e', penteado: 'maria-chiquinha', vestido: '#3a2850' }, 'feliz', { rosto: 'oculos-coracao' }),
  gotica_bruxa: desenharCabecaGotica({ pele: '#e2b89c', cabelo: '#3a2a5c', olhos: '#b5302f', batom: '#1a0a12', penteado: 'liso', vestido: '#3a2850' }, 'neutra', { cabeca: 'chapeu-bruxa' }),
};

mkdirSync(PASTA, { recursive: true });
for (const [nome, desenho] of Object.entries({ ...EMOJIS, ...GOTICAS })) {
  const png = new Resvg(desenho, { fitTo: { mode: 'width', value: 128 }, font: { loadSystemFonts: true } }).render().asPng();
  writeFileSync(`${PASTA}/${nome}.png`, png);
  console.log(`${nome}.png · ${(png.length / 1024).toFixed(1)} KB`);
}
