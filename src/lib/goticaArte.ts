// Retrato da gótica em SVG, estilo bonequinho 3D (vinil/Nendoroid).
// O volume vem de filtros: sombra interna (embaixo e à direita), luz (em cima e à esquerda),
// luz de recorte lilás na borda direita e sombra projetada entre as camadas.
import { temItem, type Aparencia, type Humor } from './gotica.ts';
import { desenharItem } from './goticaItens.ts';
import type { Equipados } from './loja.ts';

// ---------- Cores ----------

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const misturar = (a: string, b: string, f: number) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const c = (x: number, y: number) => Math.round(x * (1 - f) + y * f).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
};
const clarear = (hex: string, f: number) => misturar(hex, '#ffffff', f);
// Sombras puxam para o roxo em vez do preto: fica mais "render" e menos sujo.
const sombrear = (hex: string, f: number) => misturar(hex, '#1a0630', f);

// ---------- Formas base ----------

const ROSTO = 'M134 262 C132 168 186 128 256 128 C326 128 380 168 378 262 C376 332 330 382 256 390 C182 382 136 332 134 262 Z';
const CALOTA = 'M112 270 C102 144 172 82 256 82 C340 82 410 144 400 270 C390 232 372 206 344 192 C300 176 212 176 168 192 C140 206 122 232 112 270 Z';
const ESPELHO = 'matrix(-1 0 0 1 512 0)';

/** Mecha de cabelo em forma de pétala, do topo (x0, y0) até a ponta (xt, yt). */
const mecha = (x0: number, y0: number, xt: number, yt: number, w: number) => {
  const h = yt - y0;
  return `M${x0 - w} ${y0} C${x0 - w} ${y0 + h * 0.55} ${xt - w * 0.35} ${yt - h * 0.3} ${xt} ${yt} C${xt + w * 0.35} ${yt - h * 0.35} ${x0 + w} ${y0 + h * 0.5} ${x0 + w} ${y0} Z`;
};
const fioDaMecha = (x0: number, y0: number, xt: number, yt: number) =>
  `M${x0} ${y0 + 14} Q${(x0 + xt) / 2 + (xt - x0) * 0.15} ${(y0 + yt) / 2} ${xt} ${yt - 14}`;

type Mecha = [x0: number, y0: number, xt: number, yt: number, w: number];

// ---------- Defs ----------

function filtroVolume(id: string, s: number, sombra: string, opSombra: number, borda: string, opBorda: number) {
  return `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feComponentTransfer in="SourceAlpha" result="fora"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>
    <feOffset in="fora" dx="${-8 * s}" dy="${-10 * s}" result="fs"/><feGaussianBlur in="fs" stdDeviation="${9 * s}" result="fsb"/>
    <feFlood flood-color="${sombra}" flood-opacity="${opSombra}"/><feComposite in2="fsb" operator="in" result="sombra"/>
    <feOffset in="fora" dx="${5 * s}" dy="${7 * s}" result="fl"/><feGaussianBlur in="fl" stdDeviation="${4 * s}" result="flb"/>
    <feFlood flood-color="#ffffff" flood-opacity=".32"/><feComposite in2="flb" operator="in" result="luz"/>
    <feOffset in="fora" dx="${-3 * s}" dy="${-1 * s}" result="fb"/><feGaussianBlur in="fb" stdDeviation="${1.4 * s}" result="fbb"/>
    <feFlood flood-color="${borda}" flood-opacity="${opBorda}"/><feComposite in2="fbb" operator="in" result="borda"/>
    <feMerge result="m"><feMergeNode in="SourceGraphic"/><feMergeNode in="sombra"/><feMergeNode in="luz"/><feMergeNode in="borda"/></feMerge>
    <feComposite in="m" in2="SourceAlpha" operator="in"/>
  </filter>`;
}

function defs(a: Aparencia) {
  const { pele, cabelo, olhos, batom, vestido } = a;
  return `<defs>
    ${filtroVolume('vol', 1, '#1b0828', 0.6, '#d9b3ff', 0.55)}
    ${filtroVolume('volP', 0.4, '#1b0828', 0.55, '#e6ccff', 0.6)}
    ${filtroVolume('volPele', 1.1, '#8a2f5a', 0.32, '#ffd2e6', 0.5)}
    <filter id="proj" x="-15%" y="-15%" width="130%" height="140%"><feDropShadow dx="0" dy="9" stdDeviation="8" flood-color="#12041c" flood-opacity=".6"/></filter>
    <filter id="projP" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="1" dy="4" stdDeviation="3" flood-color="#12041c" flood-opacity=".55"/></filter>
    <filter id="d1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2"/></filter>
    <filter id="d3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="d6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="d12" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>

    <radialGradient id="fundo" cx=".5" cy=".38" r=".8"><stop offset="0" stop-color="#43215e"/><stop offset=".5" stop-color="#1c0b29"/><stop offset="1" stop-color="#07030c"/></radialGradient>
    <linearGradient id="vitral" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4fa8"/><stop offset=".55" stop-color="#5a2d8f"/><stop offset="1" stop-color="#2a0f3d"/></linearGradient>
    <radialGradient id="halo"><stop offset="0" stop-color="#b072ff" stop-opacity=".55"/><stop offset=".5" stop-color="#7a3cc0" stop-opacity=".2"/><stop offset="1" stop-color="#7a3cc0" stop-opacity="0"/></radialGradient>
    <radialGradient id="vinheta" cx=".5" cy=".46" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".65"/></radialGradient>
    <linearGradient id="raio" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9d8ff" stop-opacity=".22"/><stop offset="1" stop-color="#e9d8ff" stop-opacity="0"/></linearGradient>

    <radialGradient id="pele" cx=".4" cy=".36" r=".75">
      <stop offset="0" stop-color="${clarear(pele, 0.2)}"/><stop offset=".55" stop-color="${pele}"/><stop offset="1" stop-color="${misturar(pele, '#a0406a', 0.28)}"/>
    </radialGradient>
    <linearGradient id="pescoco" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${misturar(pele, '#5a1e48', 0.45)}"/><stop offset=".6" stop-color="${misturar(pele, '#a0406a', 0.15)}"/><stop offset="1" stop-color="${pele}"/>
    </linearGradient>
    <radialGradient id="rubor"><stop offset="0" stop-color="#ff5c8d" stop-opacity=".5"/><stop offset="1" stop-color="#ff5c8d" stop-opacity="0"/></radialGradient>

    <linearGradient id="cabelo" gradientUnits="userSpaceOnUse" x1="200" y1="70" x2="300" y2="470">
      <stop offset="0" stop-color="${clarear(misturar(cabelo, '#b48cff', 0.2), 0.25)}"/><stop offset=".4" stop-color="${cabelo}"/><stop offset="1" stop-color="${sombrear(cabelo, 0.45)}"/>
    </linearGradient>
    <linearGradient id="cabeloAtras" gradientUnits="userSpaceOnUse" x1="0" y1="70" x2="0" y2="500">
      <stop offset="0" stop-color="${sombrear(cabelo, 0.3)}"/><stop offset="1" stop-color="${sombrear(cabelo, 0.7)}"/>
    </linearGradient>

    <linearGradient id="iris" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${sombrear(olhos, 0.65)}"/><stop offset=".45" stop-color="${olhos}"/><stop offset="1" stop-color="${clarear(olhos, 0.55)}"/>
    </linearGradient>
    <radialGradient id="pupila" cx=".5" cy=".4"><stop offset="0" stop-color="${sombrear(olhos, 0.85)}"/><stop offset="1" stop-color="${sombrear(olhos, 0.6)}"/></radialGradient>
    <linearGradient id="esclera" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c7b6dc"/><stop offset=".35" stop-color="#f6f1fb"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
    <linearGradient id="delineado" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1a0f24"/><stop offset="1" stop-color="#05020a"/></linearGradient>
    <linearGradient id="batom" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${clarear(batom, 0.15)}"/><stop offset="1" stop-color="${sombrear(batom, 0.3)}"/></linearGradient>
    <radialGradient id="lagrima" cx=".35" cy=".35"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#bfe6ff"/><stop offset="1" stop-color="#6fb6f0"/></radialGradient>

    <linearGradient id="vestido" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${vestido}"/><stop offset="1" stop-color="${sombrear(vestido, 0.8)}"/></linearGradient>
    <radialGradient id="manga" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="${clarear(vestido, 0.14)}"/><stop offset="1" stop-color="${sombrear(vestido, 0.7)}"/></radialGradient>
    <linearGradient id="renda" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e7aa6"/><stop offset="1" stop-color="#3b2e4c"/></linearGradient>
    <linearGradient id="ouro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".45" stop-color="#d6ac52"/><stop offset="1" stop-color="#6e4c16"/></linearGradient>
    <linearGradient id="prata" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#bdbccb"/><stop offset="1" stop-color="#5d5a6e"/></linearGradient>
    <radialGradient id="gema" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ff9cb4"/><stop offset=".45" stop-color="#b3123a"/><stop offset="1" stop-color="#3d0412"/></radialGradient>
    <radialGradient id="rosa" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ff5a78"/><stop offset=".55" stop-color="#a50c2a"/><stop offset="1" stop-color="#3f0310"/></radialGradient>
    <linearGradient id="folha" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5f9e6e"/><stop offset="1" stop-color="#1d4a2c"/></linearGradient>
    <linearGradient id="asa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2b7a"/><stop offset="1" stop-color="#140a1e"/></linearGradient>
    <radialGradient id="pelucia" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#9a7cbf"/><stop offset=".6" stop-color="#5a3f7a"/><stop offset="1" stop-color="#2a1838"/></radialGradient>
    <linearGradient id="laco" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1f4a"/><stop offset="1" stop-color="#0f0716"/></linearGradient>

    <clipPath id="clipRosto"><path d="${ROSTO}"/></clipPath>
  </defs>`;
}

// ---------- Cenário ----------

function cenario() {
  // Bokeh de velas e de luz roxa, desfocado como fundo de foto.
  const bokeh = [
    [58, 330, 22, '#ffb36b', 0.35], [96, 250, 12, '#ffcf8a', 0.45], [40, 140, 16, '#c08bff', 0.3], [468, 300, 24, '#ffb36b', 0.3],
    [430, 210, 10, '#ffd9a0', 0.5], [482, 120, 18, '#c08bff', 0.3], [140, 60, 9, '#ffe2b0', 0.4], [390, 40, 12, '#c08bff', 0.35],
    [24, 440, 30, '#ff9f5a', 0.25], [492, 430, 28, '#9b6bff', 0.25],
  ].map(([x, y, r, c, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="${o}" filter="url(#d3)"/>`).join('');
  const vitralLinhas = 'M256 70 L256 330 M176 170 L336 170 M176 250 L336 250 M206 110 Q256 140 306 110';
  return `<rect width="512" height="512" fill="url(#fundo)"/>
    <g filter="url(#d3)" opacity=".9">
      <path d="M168 340 L168 150 A88 88 0 0 1 344 150 L344 340 Z" fill="#12081c"/>
      <path d="M178 340 L178 152 A78 78 0 0 1 334 152 L334 340 Z" fill="url(#vitral)"/>
      <circle cx="296" cy="120" r="30" fill="#f6ecd2"/><circle cx="296" cy="120" r="46" fill="#f6ecd2" opacity=".18"/>
      <path d="${vitralLinhas}" stroke="#12081c" stroke-width="7" fill="none"/>
    </g>
    <path d="M190 120 L120 512 L250 512 Z M300 120 L330 512 L430 512 Z" fill="url(#raio)" filter="url(#d6)"/>
    ${bokeh}
    <circle cx="256" cy="250" r="230" fill="url(#halo)"/>`;
}

function poeira() {
  return [[70, 200, 2.5], [118, 380, 2], [430, 360, 3], [452, 160, 2], [380, 470, 2.5], [160, 120, 1.8], [340, 92, 2]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffe9c9" opacity=".8" filter="url(#d1)"/>`).join('');
}

// ---------- Corpo e roupa ----------

function asas() {
  const asa = `<path d="M232 380 C200 300 120 250 30 270 C52 290 58 312 50 336 C74 330 92 344 92 366 C112 356 132 368 136 392 C156 384 178 394 184 420 Z" fill="url(#asa)"/>
    <path d="M226 378 L40 274 M200 384 L60 334 M190 396 L98 364 M186 410 L140 392" stroke="#b07ad8" stroke-width="2.2" opacity=".55" fill="none"/>`;
  return `<g filter="url(#proj)"><g filter="url(#vol)">${asa}<g transform="${ESPELHO}">${asa}</g></g></g>`;
}

function corpo() {
  const n = 12;
  const babados = Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n;
    const x = 168 + t * 176;
    const y = 440 + Math.sin(t * Math.PI) * 30;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11"/>`;
  }).join('');
  const cadarco = [480, 496, 512].map((y) => `M244 ${y - 12} L268 ${y} M268 ${y - 12} L244 ${y}`).join(' ');
  return `<g filter="url(#vol)">
      <path d="M92 512 C96 452 146 422 198 414 L314 414 C366 422 416 452 420 512 Z" fill="url(#vestido)"/>
      <ellipse cx="136" cy="470" rx="58" ry="50" fill="url(#manga)"/>
      <ellipse cx="376" cy="470" rx="58" ry="50" fill="url(#manga)"/>
    </g>
    <path d="M110 452 Q136 440 168 456 M344 456 Q376 440 402 452" stroke="#6e5590" stroke-width="2" fill="none" opacity=".6"/>
    <path d="${cadarco}" stroke="url(#prata)" stroke-width="2.5" stroke-linecap="round"/>
    <g filter="url(#proj)"><g filter="url(#vol)" fill="url(#renda)">
      <path d="M194 404 C204 446 308 446 318 404 L346 432 C330 486 182 486 166 432 Z"/>
      ${babados}
    </g></g>
    <g filter="url(#projP)"><g filter="url(#volP)">
      <circle cx="256" cy="462" r="15" fill="url(#ouro)"/>
      <ellipse cx="256" cy="462" rx="10" ry="11" fill="url(#gema)"/>
    </g></g>
    <ellipse cx="252" cy="457" rx="3.5" ry="2.5" fill="#fff" opacity=".85"/>`;
}

function pescoco() {
  return `<path d="M232 356 L280 356 L284 422 Q256 432 228 422 Z" fill="url(#pescoco)"/>
    <ellipse cx="256" cy="386" rx="44" ry="14" fill="#3b0f2e" opacity=".45" filter="url(#d6)"/>`;
}

// ---------- Cabelo ----------

type Estilo = { atras: string; frente: Mecha[]; laterais: Mecha[]; extra?: string; extraFrente?: string };

function estilo(a: Aparencia): Estilo {
  const atrasLongo = 'M104 262 C94 136 172 76 256 76 C340 76 418 136 408 262 C414 340 426 420 414 498 Q398 478 384 500 Q368 474 352 494 L160 494 Q144 474 128 500 Q114 478 98 498 C86 420 98 340 104 262 Z';
  const laterais: Mecha[] = [[140, 196, 116, 440, 26], [158, 214, 150, 404, 14]];
  switch (a.penteado) {
    case 'franja':
      return {
        atras: atrasLongo,
        laterais,
        frente: [
          [164, 140, 152, 250, 25], [202, 132, 194, 244, 25], [238, 128, 236, 238, 25],
          [274, 128, 276, 238, 25], [310, 132, 318, 244, 25], [348, 140, 360, 250, 25],
        ],
      };
    case 'liso':
      return {
        atras: atrasLongo,
        laterais,
        frente: [[200, 136, 144, 252, 30], [230, 116, 150, 300, 52], [312, 136, 368, 252, 30], [282, 116, 362, 300, 52]],
      };
    case 'maria-chiquinha': {
      const rabo = `<path d="M128 186 C40 214 26 330 50 472 C64 432 80 404 88 366 C96 414 106 452 130 490 C124 400 150 300 150 216 Z" fill="url(#cabelo)"/>
        <path d="M96 240 C70 300 66 380 80 440 M128 250 C112 320 112 400 124 460" stroke="${sombrear(a.cabelo, 0.5)}" stroke-width="3" fill="none" opacity=".45"/>`;
      return {
        atras: `<g filter="url(#proj)"><g filter="url(#vol)">${rabo}<g transform="${ESPELHO}">${rabo}</g></g></g>
          <path d="M108 262 C98 140 172 84 256 84 C340 84 414 140 404 262 C404 300 396 330 380 340 Q256 380 132 340 C116 330 108 300 108 262 Z" fill="url(#cabeloAtras)"/>`,
        laterais: [[146, 206, 136, 336, 18], [366, 206, 376, 336, 18]],
        frente: [
          [166, 140, 150, 242, 25], [204, 132, 198, 256, 24], [240, 128, 240, 230, 24],
          [276, 128, 274, 254, 24], [312, 132, 322, 238, 24], [348, 140, 362, 250, 25],
        ],
        extraFrente: lacos(),
      };
    }
    case 'coque':
      return {
        atras: `<g filter="url(#proj)"><g filter="url(#vol)"><circle cx="256" cy="80" r="56" fill="url(#cabelo)"/></g></g>
          <path d="M214 70 Q256 40 298 70 M220 98 Q256 70 292 98" stroke="${sombrear(a.cabelo, 0.5)}" stroke-width="3" fill="none" opacity=".45"/>
          <g filter="url(#projP)"><g filter="url(#volP)">
            <path d="M196 30 L284 118 L278 124 L190 36 Z M316 30 L228 118 L234 124 L322 36 Z" fill="url(#ouro)"/>
            <circle cx="193" cy="33" r="9" fill="url(#gema)"/><circle cx="319" cy="33" r="9" fill="url(#gema)"/>
          </g></g>`,
        laterais: [[142, 206, 128, 340, 20], [370, 206, 384, 340, 20]],
        // Franja varrida para o lado.
        frente: [
          [170, 140, 144, 236, 26], [206, 130, 168, 246, 27], [244, 126, 200, 244, 27],
          [282, 128, 238, 238, 26], [318, 134, 290, 226, 25], [350, 146, 350, 238, 22],
        ],
      };
  }
}

function lacos() {
  const laco = `<path d="M124 200 L84 172 C68 186 70 222 88 232 Z M124 200 L160 168 C176 182 176 218 158 228 Z" fill="url(#laco)"/>
    <path d="M118 206 L100 252 L112 248 L116 260 L126 210 Z M130 206 L144 254 L132 250 L128 262 L122 210 Z" fill="url(#laco)"/>
    <circle cx="124" cy="202" r="10" fill="url(#gema)"/>`;
  return `<g filter="url(#projP)"><g filter="url(#volP)">${laco}<g transform="${ESPELHO}">${laco}</g></g></g>`;
}

function cabeloAtras(a: Aparencia) {
  const e = estilo(a);
  return e.atras.startsWith('M')
    ? `<g filter="url(#vol)"><path d="${e.atras}" fill="url(#cabeloAtras)"/></g>`
    : e.atras;
}

function cabeloFrente(a: Aparencia) {
  const e = estilo(a);
  const lat = e.laterais.map(([x0, y0, xt, yt, w]) => {
    const p = mecha(x0, y0, xt, yt, w);
    // Laterais dos estilos simétricos são espelhadas; a maria-chiquinha e o coque já trazem os dois lados.
    return a.penteado === 'liso' || a.penteado === 'franja' ? `<path d="${p}"/><path d="${p}" transform="${ESPELHO}"/>` : `<path d="${p}"/>`;
  }).join('');
  const franja = e.frente.map(([x0, y0, xt, yt, w]) => `<path d="${mecha(x0, y0, xt, yt, w)}"/>`).join('');
  const fios = e.frente.map(([x0, y0, xt, yt]) => fioDaMecha(x0, y0, xt, yt)).join(' ');
  const clipId = 'clipCabelo';
  return `<clipPath id="${clipId}"><path d="${CALOTA}"/>${franja}</clipPath>
    <g filter="url(#proj)">
      <g filter="url(#vol)" fill="url(#cabelo)">${lat}</g>
      <g filter="url(#vol)" fill="url(#cabelo)"><path d="${CALOTA}"/>${franja}</g>
    </g>
    <path d="${fios}" stroke="${sombrear(a.cabelo, 0.55)}" stroke-width="2.4" fill="none" opacity=".4" stroke-linecap="round"/>
    <g clip-path="url(#${clipId})">
      <path d="M140 178 Q256 104 372 178" stroke="#ffffff" stroke-opacity=".45" stroke-width="13" fill="none" filter="url(#d3)"/>
      <path d="M170 160 Q200 140 228 132 M284 132 Q312 140 342 160" stroke="#ffffff" stroke-opacity=".75" stroke-width="3" fill="none" stroke-linecap="round"/>
    </g>
    ${e.extraFrente ?? ''}`;
}

/** Sombra que a franja projeta na testa. */
function sombraDaFranja(a: Aparencia) {
  const e = estilo(a);
  const franja = e.frente.map(([x0, y0, xt, yt, w]) => `<path d="${mecha(x0, y0, xt, yt, w)}"/>`).join('');
  return `<g clip-path="url(#clipRosto)"><g transform="translate(4 14)" fill="${misturar(a.pele, '#4a1240', 0.55)}" opacity=".55" filter="url(#d6)"><path d="${CALOTA}"/>${franja}</g></g>`;
}

// ---------- Rosto ----------

function olho(cx: number, cy: number, lado: 1 | -1, humor: Humor) {
  const clip = `olho${lado}`;
  const branco = 'M-34 -2 C-34 -36 26 -44 36 -12 C40 20 18 40 0 40 C-22 40 -34 24 -34 -2 Z';
  const raios = Array.from({ length: 14 }, (_, k) => {
    const ang = (k / 14) * Math.PI * 2;
    return `M${(Math.cos(ang) * 9).toFixed(1)} ${(4 + Math.sin(ang) * 11).toFixed(1)} L${(Math.cos(ang) * 22).toFixed(1)} ${(4 + Math.sin(ang) * 28).toFixed(1)}`;
  }).join(' ');
  const sobrancelha = {
    feliz: 'M-30 -66 Q2 -82 34 -66',
    neutra: 'M-30 -62 Q2 -74 34 -62',
    triste: 'M-30 -76 Q0 -72 32 -58',
  }[humor];
  // A parte espelhada (formato, delineado) fica no grupo com scale; os brilhos não espelham, a luz vem sempre da esquerda.
  return `
    <ellipse cx="${cx + 6 * lado}" cy="${cy - 26}" rx="48" ry="24" fill="#5a2a7a" opacity=".5" filter="url(#d6)"/>
    <g transform="translate(${cx} ${cy}) scale(${lado} 1)">
      <clipPath id="${clip}"><path d="${branco}"/></clipPath>
      <path d="${branco}" fill="url(#esclera)"/>
      <g clip-path="url(#${clip})">
        <ellipse cx="0" cy="4" rx="25" ry="31" fill="url(#iris)"/>
        <path d="${raios}" stroke="#ffffff" stroke-opacity=".18" stroke-width="1.4"/>
        <ellipse cx="0" cy="4" rx="25" ry="31" fill="none" stroke="#12051c" stroke-opacity=".55" stroke-width="3"/>
        <ellipse cx="0" cy="3" rx="11" ry="15" fill="url(#pupila)"/>
        <path d="M-20 16 Q0 38 20 16 Q0 28 -20 16 Z" fill="#ffffff" opacity=".35" filter="url(#d1)"/>
        <rect x="-40" y="-50" width="80" height="34" fill="#2a0f3d" opacity=".35" filter="url(#d3)"/>
        ${humor === 'triste' ? '<path d="M-34 24 Q0 46 36 20 L36 44 L-34 44 Z" fill="#a8dcff" opacity=".45"/>' : ''}
      </g>
      <path d="M-38 -4 C-36 -42 28 -52 42 -16 L58 -28 C54 -12 48 -4 42 -1 C32 -34 -28 -34 -34 0 Z" fill="url(#delineado)"/>
      <path d="M38 -14 Q54 -20 60 -32 Q50 -18 42 -6 Z M26 -30 Q36 -40 38 -50 Q30 -38 18 -33 Z" fill="#05020a"/>
      <path d="M-24 30 Q0 46 26 30" stroke="#2a1036" stroke-width="2.4" fill="none" opacity=".6" stroke-linecap="round"/>
      <path d="M22 32 l6 6 M12 37 l3 6" stroke="#2a1036" stroke-width="1.8" opacity=".55" stroke-linecap="round"/>
      <path d="${sobrancelha}" stroke="#2a1630" stroke-width="4.5" fill="none" stroke-linecap="round" opacity=".85"/>
    </g>
    <ellipse cx="${cx - 9}" cy="${cy - 10}" rx="${humor === 'triste' ? 10 : 9}" ry="${humor === 'triste' ? 12 : 11}" fill="#fff"/>
    <circle cx="${cx + 10}" cy="${cy + 15}" r="4.2" fill="#fff" opacity=".9"/>
    <path d="M${cx + 12} ${cy - 20} l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6 Z" fill="#fff" opacity=".85"/>`;
}

function rosto(a: Aparencia, humor: Humor) {
  const boca = {
    feliz: `<path d="M236 338 C240 362 272 362 276 338 C266 344 246 344 236 338 Z" fill="#3a0f1f"/>
      <ellipse cx="258" cy="354" rx="10" ry="5" fill="#e86a8a"/>
      <path d="M262 340 L266 350 L270 341 Z" fill="#fff"/>
      <path d="M236 338 C246 344 266 344 276 338" stroke="url(#batom)" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M240 349 C246 360 266 360 272 349" stroke="url(#batom)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    neutra: `<path d="M238 344 Q247 337 256 341 Q265 337 274 344 Q256 358 238 344 Z" fill="url(#batom)"/>
      <path d="M240 344 Q256 348 272 344" stroke="${sombrear(a.batom, 0.5)}" stroke-width="1.5" fill="none"/>`,
    triste: `<path d="M240 350 Q248 340 256 343 Q264 340 272 350 Q256 346 240 350 Z" fill="url(#batom)"/>`,
  }[humor];
  const tracinhos = humor === 'feliz'
    ? [168, 178, 188, 324, 334, 344].map((x) => `<path d="M${x} 336 l6 -8" stroke="#e0507c" stroke-width="2" stroke-linecap="round" opacity=".6"/>`).join('')
    : '';
  const choro = humor === 'triste'
    ? `<path d="M174 312 Q170 336 176 360 Q178 372 172 380" stroke="#1a0a24" stroke-width="3" fill="none" opacity=".7" stroke-linecap="round"/>
       <g filter="url(#projP)"><path d="M338 318 C330 334 330 344 338 348 C346 344 346 334 338 318 Z" fill="url(#lagrima)" opacity=".95"/></g>
       <circle cx="336" cy="338" r="2" fill="#fff"/>`
    : '';
  return `
    ${sombraDaFranja(a)}
    <ellipse cx="174" cy="332" rx="32" ry="17" fill="url(#rubor)"/>
    <ellipse cx="338" cy="332" rx="32" ry="17" fill="url(#rubor)"/>
    ${tracinhos}
    ${olho(198, 288, -1, humor)}${olho(314, 288, 1, humor)}
    <path d="M257 318 q5 5 -1 8" stroke="${misturar(a.pele, '#5a1e48', 0.45)}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <circle cx="252" cy="314" r="2" fill="#fff" opacity=".6"/>
    ${boca}
    <ellipse cx="250" cy="350" rx="5" ry="1.8" fill="#fff" opacity=".45"/>
    ${choro}`;
}

// ---------- Acessórios ----------

function colar(nivel: number) {
  const p: string[] = [];
  if (temItem(nivel, 'choker')) {
    p.push(`<g filter="url(#projP)"><g filter="url(#volP)"><rect x="228" y="392" width="56" height="13" rx="6.5" fill="#1a0f24"/></g></g>
      <circle cx="256" cy="405" r="5" fill="none" stroke="url(#prata)" stroke-width="2.4"/>`);
  }
  if (temItem(nivel, 'cruz')) {
    p.push(`<g filter="url(#projP)"><g filter="url(#volP)">
      <path d="M251 410 h10 v9 h9 v9 h-9 v20 h-10 v-20 h-9 v-9 h9 Z" fill="url(#ouro)"/>
    </g></g>
    <circle cx="256" cy="423" r="3.4" fill="url(#gema)"/><circle cx="255" cy="422" r="1" fill="#fff"/>`);
  }
  return p.join('');
}

function rosas() {
  const rosa = (x: number, y: number, r: number) => `
    <g filter="url(#projP)"><g filter="url(#volP)"><circle cx="${x}" cy="${y}" r="${r}" fill="url(#rosa)"/></g></g>
    <path d="M${x - r * 0.62} ${y + r * 0.1} A${r * 0.62} ${r * 0.62} 0 1 1 ${x + r * 0.3} ${y + r * 0.55}" stroke="#4a0214" stroke-width="1.8" fill="none" opacity=".75"/>
    <path d="M${x - r * 0.3} ${y} A${r * 0.3} ${r * 0.3} 0 1 1 ${x + r * 0.2} ${y + r * 0.2}" stroke="#4a0214" stroke-width="1.6" fill="none" opacity=".75"/>
    <ellipse cx="${x - r * 0.35}" cy="${y - r * 0.45}" rx="${r * 0.28}" ry="${r * 0.16}" fill="#fff" opacity=".45"/>`;
  const folha = (x: number, y: number, ang: number) =>
    `<path transform="translate(${x} ${y}) rotate(${ang})" d="M0 0 Q10 -9 22 0 Q10 9 0 0 Z" fill="url(#folha)"/>`;
  return `<g filter="url(#projP)">${folha(186, 168, -150)}${folha(226, 146, -120)}${folha(286, 146, -60)}${folha(326, 168, -30)}</g>
    ${rosa(168, 182, 15)}${rosa(206, 158, 17)}${rosa(256, 146, 21)}${rosa(306, 158, 17)}${rosa(344, 182, 15)}`;
}

function morcego() {
  return `<g transform="translate(392 396) scale(1.1)">
    <g filter="url(#proj)"><g filter="url(#vol)">
      <path d="M-14 0 C-30 -30 -62 -36 -82 -22 C-70 -14 -70 -2 -76 8 C-60 2 -48 10 -46 22 C-34 14 -22 18 -18 26 Z" fill="url(#asa)"/>
      <path d="M14 0 C30 -30 62 -36 82 -22 C70 -14 70 -2 76 8 C60 2 48 10 46 22 C34 14 22 18 18 26 Z" fill="url(#asa)"/>
      <ellipse cx="0" cy="6" rx="30" ry="28" fill="url(#pelucia)"/>
      <path d="M-22 -14 L-20 -40 L-6 -22 Z M22 -14 L20 -40 L6 -22 Z" fill="url(#pelucia)"/>
    </g></g>
    <ellipse cx="-11" cy="2" rx="8" ry="9" fill="#fff"/><ellipse cx="11" cy="2" rx="8" ry="9" fill="#fff"/>
    <ellipse cx="-10" cy="4" rx="5.5" ry="6.5" fill="#d1243f"/><ellipse cx="12" cy="4" rx="5.5" ry="6.5" fill="#d1243f"/>
    <circle cx="-12" cy="1" r="2.2" fill="#fff"/><circle cx="10" cy="1" r="2.2" fill="#fff"/>
    <ellipse cx="-20" cy="16" rx="6" ry="3.5" fill="#ff7aa2" opacity=".55"/><ellipse cx="20" cy="16" rx="6" ry="3.5" fill="#ff7aa2" opacity=".55"/>
    <path d="M-5 16 Q0 20 5 16" stroke="#0a0410" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M2 17 L3.5 22 L5 17.5 Z" fill="#fff"/>
  </g>`;
}

// ---------- Montagem ----------

/** Retrato da gótica em SVG 512×512. Os acessórios dependem do nível; os itens da loja, do que está equipado. */
export function desenharGotica(a: Aparencia, nivel: number, humor: Humor, eq: Equipados = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${defs(a)}
  ${eq.fundo ? desenharItem(eq.fundo) : cenario()}
  ${temItem(nivel, 'asas') ? asas() : ''}
  ${cabeloAtras(a)}
  ${pescoco()}
  ${corpo()}
  ${colar(nivel)}
  <g filter="url(#proj)"><g filter="url(#volPele)"><path d="${ROSTO}" fill="url(#pele)"/></g></g>
  ${rosto(a, humor)}
  ${temItem(nivel, 'piercing') ? `<circle cx="271" cy="352" r="5" fill="none" stroke="url(#prata)" stroke-width="2.6"/><circle cx="268" cy="348" r="1.2" fill="#fff"/>` : ''}
  ${desenharItem(eq.rosto)}
  ${cabeloFrente(a)}
  ${temItem(nivel, 'rosas') ? rosas() : ''}
  ${desenharItem(eq.cabeca)}
  ${temItem(nivel, 'morcego') ? morcego() : ''}
  ${desenharItem(eq.companheiro)}
  ${poeira()}
  <rect width="512" height="512" fill="url(#vinheta)"/>
</svg>`;
}
