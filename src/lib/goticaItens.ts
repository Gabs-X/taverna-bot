// Desenho dos itens da loja da gótica. Usa os gradientes e filtros definidos em goticaArte.ts
// (vol, volP, proj, projP, d1, d3, d6, cabelo, ouro, rosa, halo, vinheta).
import type { IdItem } from './loja.ts';

const ESPELHO = 'matrix(-1 0 0 1 512 0)';
const vol = (conteudo: string, f = 'vol', p = 'proj') => `<g filter="url(#${p})"><g filter="url(#${f})">${conteudo}</g></g>`;
const estrelas = (cor = '#fff') =>
  [[48, 64, 1.6], [112, 36, 1.2], [196, 30, 1.6], [84, 150, 1.1], [470, 210, 1.3], [490, 40, 1], [330, 26, 1.2], [440, 110, 1.4]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${cor}" opacity=".8"/>`).join('');
const MORCEGO = 'M0 0 Q-8 -10 -22 -8 Q-16 -2 -18 6 Q-10 2 -6 8 Q-3 2 0 6 Q3 2 6 8 Q10 2 18 6 Q16 -2 22 -8 Q8 -10 0 0 Z';

// ---------- Fundos ----------

function fundoCemiterio() {
  const lapide = (x: number, y: number, w: number, h: number, cruz: boolean) =>
    `<path d="M${x} ${y + h} L${x} ${y + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2} L${x + w} ${y + h} Z" fill="#141a26"/>` +
    (cruz ? `<path d="M${x + w / 2} ${y + 10} v${h * 0.45} M${x + w / 2 - 9} ${y + 22} h18" stroke="#2c3648" stroke-width="4"/>` : '');
  return `<defs><linearGradient id="ceuCemiterio" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2b40"/><stop offset=".6" stop-color="#151b2b"/><stop offset="1" stop-color="#090b12"/></linearGradient>
      <radialGradient id="nevoaCemiterio"><stop offset="0" stop-color="#a9b8d6" stop-opacity=".35"/><stop offset="1" stop-color="#a9b8d6" stop-opacity="0"/></radialGradient></defs>
    <rect width="512" height="512" fill="url(#ceuCemiterio)"/>
    ${estrelas('#dfe8ff')}
    <circle cx="96" cy="96" r="80" fill="#e9eefc" opacity=".12" filter="url(#d12)"/>
    <circle cx="96" cy="96" r="40" fill="#eef2fb"/><circle cx="84" cy="86" r="7" fill="#c9d1e3" opacity=".7"/><circle cx="108" cy="110" r="9" fill="#c9d1e3" opacity=".6"/>
    <g filter="url(#d1)" stroke="#0b0e16" stroke-linecap="round" fill="none">
      <path d="M470 512 C466 420 478 330 452 250" stroke-width="16"/>
      <path d="M456 300 C430 270 410 262 384 266 M462 270 C480 230 500 214 512 210 M452 250 C440 210 446 180 430 150 M436 180 C416 170 400 150 398 128" stroke-width="7"/>
    </g>
    <g filter="url(#d1)">${lapide(14, 360, 50, 120, true)}${lapide(70, 392, 40, 90, false)}${lapide(410, 380, 46, 110, true)}${lapide(30, 440, 36, 70, false)}</g>
    <ellipse cx="80" cy="470" rx="180" ry="40" fill="url(#nevoaCemiterio)"/>
    <ellipse cx="440" cy="480" rx="170" ry="40" fill="url(#nevoaCemiterio)"/>
    <circle cx="256" cy="250" r="230" fill="url(#halo)" opacity=".7"/>`;
}

function fundoLuaSangue() {
  const morcegos = [[70, 70, 0.9], [120, 110, 0.6], [430, 60, 0.8], [470, 120, 0.5], [60, 200, 0.5]]
    .map(([x, y, s]) => `<path transform="translate(${x} ${y}) scale(${s * 1.6})" d="${MORCEGO}" fill="#140205"/>`).join('');
  const brasas = [[40, 320, 10], [470, 300, 14], [90, 440, 18], [430, 440, 12], [20, 220, 8], [490, 200, 9]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ff5a3c" opacity=".35" filter="url(#d3)"/>`).join('');
  return `<defs><radialGradient id="ceuSangue" cx=".5" cy=".3" r=".9"><stop offset="0" stop-color="#5e0b18"/><stop offset=".5" stop-color="#2a050c"/><stop offset="1" stop-color="#090103"/></radialGradient>
      <radialGradient id="luaSangue" cx=".4" cy=".35"><stop offset="0" stop-color="#ff8a6a"/><stop offset=".6" stop-color="#c0261f"/><stop offset="1" stop-color="#6e0a0f"/></radialGradient></defs>
    <rect width="512" height="512" fill="url(#ceuSangue)"/>
    ${estrelas('#ffd3c4')}
    <circle cx="256" cy="200" r="210" fill="#ff3b2f" opacity=".25" filter="url(#d12)"/>
    <circle cx="256" cy="200" r="168" fill="url(#luaSangue)"/>
    <circle cx="200" cy="140" r="22" fill="#8e1414" opacity=".4"/><circle cx="320" cy="250" r="30" fill="#8e1414" opacity=".35"/><circle cx="330" cy="120" r="12" fill="#8e1414" opacity=".4"/>
    ${morcegos}${brasas}`;
}

function fundoRosas() {
  const flores = [[40, 80, 26], [100, 30, 18], [470, 70, 28], [420, 20, 16], [20, 260, 22], [490, 250, 24], [60, 420, 30], [460, 430, 30], [150, 470, 20], [370, 480, 22]]
    .map(([x, y, r]) => `<g filter="url(#d3)"><circle cx="${x}" cy="${y}" r="${r}" fill="url(#rosa)"/><path d="M${x - r * 0.5} ${y} A${r * 0.5} ${r * 0.5} 0 1 1 ${x + r * 0.2} ${y + r * 0.4}" stroke="#3f0310" stroke-width="2" fill="none"/></g>`).join('');
  return `<defs><radialGradient id="ceuRosas" cx=".5" cy=".4" r=".85"><stop offset="0" stop-color="#3a0a24"/><stop offset=".55" stop-color="#1a0612"/><stop offset="1" stop-color="#060206"/></radialGradient></defs>
    <rect width="512" height="512" fill="url(#ceuRosas)"/>
    <g stroke="#1d3a26" stroke-width="5" fill="none" opacity=".8" filter="url(#d1)">
      <path d="M0 140 C60 160 90 120 120 60 S170 0 200 0 M512 160 C450 170 420 120 400 60 S350 0 320 0 M0 380 C50 360 80 400 110 470 M512 360 C460 380 430 420 410 512"/>
    </g>
    ${flores}
    <circle cx="256" cy="250" r="230" fill="url(#halo)" opacity=".8"/>`;
}

// ---------- Cabeça ----------

function chapeuBruxa() {
  return `${vol(`
      <path d="M160 124 C176 74 206 38 256 22 C298 8 340 2 376 14 C346 20 318 38 302 64 C328 84 346 104 350 124 Z" fill="#26183a"/>
      <ellipse cx="256" cy="124" rx="180" ry="34" fill="#1a1027"/>`)}
    <path d="M166 110 C220 96 296 96 346 110 L350 124 C296 112 220 112 162 124 Z" fill="#6b2d8f"/>
    ${vol(`<rect x="242" y="100" width="28" height="20" rx="3" fill="none" stroke="url(#ouro)" stroke-width="5"/>`, 'volP', 'projP')}
    <path d="M196 70 C230 50 270 40 300 44" stroke="#fff" stroke-opacity=".18" stroke-width="6" fill="none" stroke-linecap="round"/>
    <circle cx="360" cy="18" r="5" fill="#f5b544"/><path d="M360 6 l2 9 9 3 -9 3 -2 9 -2 -9 -9 -3 9 -3 Z" fill="#ffe8a8" opacity=".9"/>`;
}

function veu() {
  const pontos = Array.from({ length: 12 }, (_, k) => {
    const t = k / 11;
    return `<circle cx="${(76 + t * 56).toFixed(1)}" cy="${(470 - Math.sin(t * Math.PI) * 6).toFixed(1)}" r="4"/>`;
  }).join('');
  return `<defs><pattern id="padraoVeu" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="7" cy="7" r="3.2" fill="none" stroke="#3b2a4c" stroke-width="1.2"/><path d="M0 0 L14 14 M14 0 L0 14" stroke="#2a1f36" stroke-width=".7"/></pattern></defs>
    <g opacity=".72">
      <path id="tecidoVeu" d="M118 150 C108 88 180 56 256 56 C332 56 404 88 394 150 C412 260 432 380 440 470 L380 470 C370 380 360 260 342 162 C310 122 202 122 170 162 C152 260 142 380 132 470 L72 470 C80 380 100 260 118 150 Z" fill="#0c0812"/>
      <path d="M118 150 C108 88 180 56 256 56 C332 56 404 88 394 150 C412 260 432 380 440 470 L380 470 C370 380 360 260 342 162 C310 122 202 122 170 162 C152 260 142 380 132 470 L72 470 C80 380 100 260 118 150 Z" fill="url(#padraoVeu)"/>
    </g>
    <g fill="#2a1f36">${pontos}<g transform="${ESPELHO}">${pontos}</g></g>
    ${vol(`<circle cx="196" cy="96" r="18" fill="url(#rosa)"/><circle cx="222" cy="84" r="12" fill="url(#rosa)"/>`, 'volP', 'projP')}
    <path d="M186 96 A10 10 0 1 1 200 104" stroke="#3f0310" stroke-width="2" fill="none"/>`;
}

function orelhasGato() {
  const orelha = `<path d="M146 146 L160 50 L228 104 Z" fill="url(#cabelo)" stroke="url(#cabelo)" stroke-width="10" stroke-linejoin="round"/>`;
  const dentro = `<path d="M162 124 L170 76 L206 104 Z" fill="#f08cad" stroke="#f08cad" stroke-width="5" stroke-linejoin="round" opacity=".85"/>`;
  return `${vol(`${orelha}<g transform="${ESPELHO}">${orelha}</g>`)}${dentro}<g transform="${ESPELHO}">${dentro}</g>`;
}

// ---------- Rosto ----------

function oculosCoracao() {
  const coracao = (cx: number) => `<path transform="translate(${cx} 300) scale(1.25)" d="M0 14 C-30 -6 -40 -30 -22 -40 C-10 -46 0 -36 0 -28 C0 -36 10 -46 22 -40 C40 -30 30 -6 0 14 Z"/>`;
  return `<g fill="#ff4f8b" fill-opacity=".38" stroke="#2a0f1f" stroke-width="4" stroke-linejoin="round">${coracao(198)}${coracao(314)}</g>
    <path d="M236 262 Q256 252 276 262" stroke="#2a0f1f" stroke-width="4" fill="none"/>
    <path d="M172 262 L134 252 M340 262 L378 252" stroke="#2a0f1f" stroke-width="4"/>
    <path d="M178 262 Q186 254 196 256 M294 262 Q302 254 312 256" stroke="#fff" stroke-width="3" opacity=".8" fill="none" stroke-linecap="round"/>`;
}

function estrelinhas() {
  const estrela = (x: number, y: number, r: number) =>
    `<path d="M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z"/>`;
  return `<g fill="#2a1036">${estrela(150, 324, 9)}${estrela(140, 300, 5)}${estrela(362, 324, 9)}${estrela(372, 300, 5)}</g>
    <g fill="#fff" opacity=".7"><circle cx="148" cy="321" r="1.6"/><circle cx="360" cy="321" r="1.6"/></g>`;
}

// ---------- Companheiros (ombro esquerdo) ----------

function gatoPreto() {
  return `<defs><radialGradient id="peloGato" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#4a3f58"/><stop offset=".6" stop-color="#1c1724"/><stop offset="1" stop-color="#08060c"/></radialGradient></defs>
    <g transform="translate(108 392)">
      <path d="M22 40 C66 44 70 4 50 -10" stroke="#120e18" stroke-width="11" fill="none" stroke-linecap="round" filter="url(#projP)"/>
      ${vol(`<ellipse cx="0" cy="32" rx="30" ry="26" fill="url(#peloGato)"/>
        <circle cx="0" cy="-6" r="27" fill="url(#peloGato)"/>
        <path d="M-24 -16 L-20 -48 L-4 -30 Z M24 -16 L20 -48 L4 -30 Z" fill="url(#peloGato)"/>`)}
      <path d="M-18 -22 L-17 -40 L-8 -28 Z M18 -22 L17 -40 L8 -28 Z" fill="#e88aa8" opacity=".6"/>
      <ellipse cx="-10" cy="-8" rx="7" ry="8" fill="#f5c542"/><ellipse cx="10" cy="-8" rx="7" ry="8" fill="#f5c542"/>
      <ellipse cx="-10" cy="-8" rx="1.8" ry="6.5" fill="#0a0610"/><ellipse cx="10" cy="-8" rx="1.8" ry="6.5" fill="#0a0610"/>
      <circle cx="-12" cy="-11" r="1.8" fill="#fff"/><circle cx="8" cy="-11" r="1.8" fill="#fff"/>
      <path d="M-3 3 L3 3 L0 6 Z" fill="#f08cad"/>
      <path d="M0 6 Q-4 10 -7 8 M0 6 Q4 10 7 8" stroke="#f08cad" stroke-width="1.5" fill="none"/>
      <path d="M-8 4 L-26 0 M-8 7 L-26 8 M8 4 L26 0 M8 7 L26 8" stroke="#cfc6dc" stroke-width="1" opacity=".7"/>
    </g>`;
}

function corvo() {
  return `<defs><linearGradient id="penas" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b3a5c"/><stop offset=".5" stop-color="#14121f"/><stop offset="1" stop-color="#050409"/></linearGradient></defs>
    <g transform="translate(112 396)">
      ${vol(`<path d="M-30 30 L-58 56 L-40 58 L-50 70 L-24 50 Z" fill="url(#penas)"/>
        <ellipse cx="-2" cy="22" rx="32" ry="24" fill="url(#penas)" transform="rotate(-18 -2 22)"/>
        <circle cx="20" cy="-6" r="19" fill="url(#penas)"/>`)}
      <path d="M-24 14 C-8 4 14 10 22 26 C4 26 -12 28 -24 14 Z" fill="#0a0812" opacity=".8"/>
      ${vol(`<path d="M34 -10 L58 -2 L34 4 Z" fill="#8e8a9e"/>`, 'volP', 'projP')}
      <circle cx="24" cy="-10" r="5" fill="#fff"/><circle cx="25" cy="-10" r="3.2" fill="#c0262d"/><circle cx="23.5" cy="-11.5" r="1.2" fill="#fff"/>
      <path d="M6 -16 Q14 -24 24 -22" stroke="#6a6890" stroke-width="2" fill="none" opacity=".6"/>
      <path d="M-4 44 L-4 54 M8 44 L8 54" stroke="#3a3540" stroke-width="3" stroke-linecap="round"/>
    </g>`;
}

const DESENHOS: Record<IdItem, () => string> = {
  'chapeu-bruxa': chapeuBruxa,
  veu,
  'orelhas-gato': orelhasGato,
  'oculos-coracao': oculosCoracao,
  estrelas: estrelinhas,
  'gato-preto': gatoPreto,
  corvo,
  'fundo-cemiterio': fundoCemiterio,
  'fundo-lua-sangue': fundoLuaSangue,
  'fundo-rosas': fundoRosas,
};

export const desenharItem = (id: IdItem | undefined) => (id ? DESENHOS[id]() : '');
