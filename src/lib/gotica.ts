// Gótica de estimação: aparência, desenho em SVG, status que caem com o tempo e ações que dão XP.
// Tudo aqui é puro (sem Discord nem banco) para dar para testar.

type Sorteio = () => number;
const sortear = <T>(lista: readonly T[], r: Sorteio) => lista[Math.floor(r() * lista.length)];

// ---------- Aparência ----------

export const PELES = ['#f6e3d8', '#efd2c0', '#e2b89c', '#c99174', '#9c6648', '#6e4430'] as const;
export const CABELOS = ['#121016', '#2a1036', '#5b0e2d', '#e8e4ee', '#0f4c4a', '#3a2a5c'] as const;
export const OLHOS = ['#7a1f3d', '#4b2a7b', '#2f6f5e', '#9a8f9e', '#b5302f', '#3d5a99'] as const;
export const BATONS = ['#1a0a12', '#4a0f2c', '#6b1d5c', '#8b0a1e', '#2d1a4a'] as const;
export const PENTEADOS = ['liso', 'franja', 'maria-chiquinha', 'coque'] as const;

export type Aparencia = {
  pele: string;
  cabelo: string;
  olhos: string;
  batom: string;
  penteado: (typeof PENTEADOS)[number];
};

export const sortearAparencia = (r: Sorteio = Math.random): Aparencia => ({
  pele: sortear(PELES, r),
  cabelo: sortear(CABELOS, r),
  olhos: sortear(OLHOS, r),
  batom: sortear(BATONS, r),
  penteado: sortear(PENTEADOS, r),
});

export const PERSONALIDADES = [
  { nome: 'dramática', gosto: 'poesia triste e chuva na janela' },
  { nome: 'sarcástica', gosto: 'revirar os olhos e café sem açúcar' },
  { nome: 'mística', gosto: 'tarô, velas e lua cheia' },
  { nome: 'tímida', gosto: 'livros de terror e gatos pretos' },
  { nome: 'roqueira', gosto: 'The Cure, Siouxsie e show no porão' },
  { nome: 'fofa', gosto: 'morceguinhos de pelúcia e bolo de cereja' },
] as const;

export const sortearPersonalidade = (r: Sorteio = Math.random) => sortear(PERSONALIDADES, r).nome;
export const gostoDe = (personalidade: string) => PERSONALIDADES.find((p) => p.nome === personalidade)?.gosto ?? 'coisas sombrias';

// ---------- Níveis e desbloqueios ----------

export const xpParaProximo = (nivel: number) => 50 * nivel;

export const DESBLOQUEIOS = [
  { nivel: 2, item: 'choker', texto: 'um choker de veludo' },
  { nivel: 3, item: 'cruz', texto: 'um pingente de cruz' },
  { nivel: 4, item: 'piercing', texto: 'um piercing no lábio' },
  { nivel: 5, item: 'morcego', texto: 'um morceguinho de estimação' },
  { nivel: 7, item: 'rosas', texto: 'uma tiara de rosas' },
  { nivel: 10, item: 'asas', texto: 'asas de morcego' },
] as const;

export type Item = (typeof DESBLOQUEIOS)[number]['item'];
export const temItem = (nivel: number, item: Item) => nivel >= DESBLOQUEIOS.find((d) => d.item === item)!.nivel;

// ---------- Status ----------

export type Status = { barriga: number; humor: number; energia: number };
export type Estado = Status & {
  nivel: number;
  xp: number;
  atualizadoEm: number; // ms
  ultimas: Record<string, number>; // última vez de cada ação (ms)
};

const HORA = 3_600_000;
const QUEDA_POR_HORA: Status = { barriga: 4, humor: 3, energia: 2 };
const limitar = (v: number) => Math.max(0, Math.min(100, v));

/** Status depois do tempo passado: ela fica com fome, triste e cansada se ninguém cuidar. */
export function statusAgora(e: Estado, agora: number): Status {
  const horas = Math.max(0, agora - e.atualizadoEm) / HORA;
  return {
    barriga: limitar(e.barriga - QUEDA_POR_HORA.barriga * horas),
    humor: limitar(e.humor - QUEDA_POR_HORA.humor * horas),
    energia: limitar(e.energia - QUEDA_POR_HORA.energia * horas),
  };
}

export type Humor = 'feliz' | 'neutra' | 'triste';
export const humorDe = (s: Status): Humor => {
  const menor = Math.min(s.barriga, s.humor, s.energia);
  if (menor < 20 || s.humor < 30) return 'triste';
  return s.humor >= 60 ? 'feliz' : 'neutra';
};

// ---------- Ações ----------

export const ACOES = {
  alimentar: {
    rotulo: 'Alimentar', emoji: '🍰', xp: 10, efeito: { barriga: 35, humor: 5, energia: 0 },
    falas: ['dividiu um bolo de cereja com você', 'tomou um café preto num cálice', 'comeu um pão de alho "pra espantar vampiro"'],
  },
  conversar: {
    rotulo: 'Conversar', emoji: '💬', xp: 12, efeito: { barriga: 0, humor: 25, energia: -5 },
    falas: ['leu um poema que escreveu às 3h da manhã', 'tirou uma carta de tarô pra você (deu A Morte, "mas é coisa boa")', 'contou uma fofoca do cemitério'],
  },
  musica: {
    rotulo: 'Ouvir música', emoji: '🎧', xp: 12, efeito: { barriga: 0, humor: 20, energia: 5 },
    falas: ['colocou The Cure e ficou olhando a chuva', 'cantou Siouxsie de olhos fechados', 'te mostrou uma banda de darkwave que "ninguém conhece"'],
  },
  passear: {
    rotulo: 'Passear', emoji: '🦇', xp: 20, efeito: { barriga: -10, humor: 30, energia: -25 },
    falas: ['foi com você ao cemitério ver a lua', 'garimpou um sobretudo no brechó', 'caçou corvos no parque (só pra olhar)'],
  },
  dormir: {
    rotulo: 'Dormir', emoji: '⚰️', xp: 5, efeito: { barriga: 0, humor: 5, energia: 50 },
    falas: ['tirou um cochilo no caixão', 'dormiu abraçada no morcego de pelúcia', 'apagou de rímel e tudo'],
  },
} as const;

export type Acao = keyof typeof ACOES;
export const ESPERA_ACAO = 20 * 60_000;

export type Resultado =
  | { ok: false; motivo: string; liberaEm?: number }
  | { ok: true; estado: Estado; fala: string; xpGanho: number; subiu: number[] };

export function aplicarAcao(e: Estado, acao: Acao, agora: number, r: Sorteio = Math.random): Resultado {
  const a = ACOES[acao];
  const ultima = e.ultimas[acao];
  if (ultima !== undefined && agora - ultima < ESPERA_ACAO) return { ok: false, motivo: 'ainda não', liberaEm: ultima + ESPERA_ACAO };

  const s = statusAgora(e, agora);
  if (acao === 'passear' && s.energia < 25) return { ok: false, motivo: 'Ela está cansada demais pra sair. Deixe ela dormir antes.' };
  if (acao === 'alimentar' && s.barriga >= 95) return { ok: false, motivo: 'Ela está cheia, não quer mais nada agora.' };

  // Triste, ela aproveita menos: metade do XP até você cuidar dela.
  const xpGanho = humorDe(s) === 'triste' ? Math.ceil(a.xp / 2) : a.xp;
  let { nivel, xp } = e;
  xp += xpGanho;
  const subiu: number[] = [];
  while (xp >= xpParaProximo(nivel)) {
    xp -= xpParaProximo(nivel);
    nivel++;
    subiu.push(nivel);
  }

  return {
    ok: true,
    xpGanho,
    subiu,
    fala: sortear(a.falas, r),
    estado: {
      nivel,
      xp,
      barriga: limitar(s.barriga + a.efeito.barriga),
      humor: limitar(s.humor + a.efeito.humor),
      energia: limitar(s.energia + a.efeito.energia),
      atualizadoEm: agora,
      ultimas: { ...e.ultimas, [acao]: agora },
    },
  };
}

// ---------- Desenho ----------

const misturar = (hex: string, alvo: number, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * (1 - f) + alvo * f).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
};
const escurecer = (hex: string, f: number) => misturar(hex, 0, 1 - f);
const clarear = (hex: string, f: number) => misturar(hex, 255, f);

/** Gradientes e filtros que dependem das cores dela. */
function defs(a: Aparencia) {
  const { pele, cabelo, olhos } = a;
  return `<defs>
    <radialGradient id="ceu" cx=".78" cy=".2" r=".95">
      <stop offset="0" stop-color="#4a2563"/><stop offset=".45" stop-color="#22112f"/><stop offset="1" stop-color="#0a0510"/>
    </radialGradient>
    <radialGradient id="brilhoLua"><stop offset="0" stop-color="#f6e7c1" stop-opacity=".55"/><stop offset="1" stop-color="#f6e7c1" stop-opacity="0"/></radialGradient>
    <linearGradient id="lua" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e6"/><stop offset="1" stop-color="#e3cf9f"/></linearGradient>
    <linearGradient id="nevoa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d5a96" stop-opacity="0"/><stop offset="1" stop-color="#7d5a96" stop-opacity=".35"/></linearGradient>
    <radialGradient id="vinheta" cx=".5" cy=".5" r=".72"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>

    <radialGradient id="pele" cx=".42" cy=".38" r=".7">
      <stop offset="0" stop-color="${clarear(pele, 0.12)}"/><stop offset=".7" stop-color="${pele}"/><stop offset="1" stop-color="${escurecer(pele, 0.88)}"/>
    </radialGradient>
    <linearGradient id="pescoco" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${escurecer(pele, 0.72)}"/><stop offset=".45" stop-color="${escurecer(pele, 0.9)}"/><stop offset="1" stop-color="${pele}"/>
    </linearGradient>
    <radialGradient id="rubor"><stop offset="0" stop-color="#e05a7c" stop-opacity=".45"/><stop offset="1" stop-color="#e05a7c" stop-opacity="0"/></radialGradient>

    <linearGradient id="cabelo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${clarear(cabelo, 0.22)}"/><stop offset=".45" stop-color="${cabelo}"/><stop offset="1" stop-color="${escurecer(cabelo, 0.6)}"/>
    </linearGradient>
    <linearGradient id="cabeloAtras" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${escurecer(cabelo, 0.8)}"/><stop offset="1" stop-color="${escurecer(cabelo, 0.45)}"/>
    </linearGradient>

    <linearGradient id="iris" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${escurecer(olhos, 0.45)}"/><stop offset=".55" stop-color="${olhos}"/><stop offset="1" stop-color="${clarear(olhos, 0.45)}"/>
    </linearGradient>

    <linearGradient id="vestido" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1f33"/><stop offset="1" stop-color="#0c0810"/></linearGradient>
    <linearGradient id="renda" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3046"/><stop offset="1" stop-color="#1c1524"/></linearGradient>
    <linearGradient id="ouro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e3a3"/><stop offset=".5" stop-color="#c9a24e"/><stop offset="1" stop-color="#7d5c22"/></linearGradient>
    <linearGradient id="prata" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#8d8a99"/></linearGradient>
    <radialGradient id="gema" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ff7a9a"/><stop offset=".5" stop-color="#9b1030"/><stop offset="1" stop-color="#3d0412"/></radialGradient>
    <radialGradient id="rosa" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#d4314f"/><stop offset=".7" stop-color="#8b0a1e"/><stop offset="1" stop-color="#4a0310"/></radialGradient>
    <linearGradient id="asa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1d4a"/><stop offset="1" stop-color="#120a18"/></linearGradient>

    <filter id="desfoque" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="desfoqueLeve" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5"/></filter>
    <clipPath id="rosto"><path d="${ROSTO_D}"/></clipPath>
  </defs>`;
}

const ROSTO_D = 'M150 236 Q148 124 256 120 Q364 124 362 236 Q362 312 312 352 Q284 374 256 374 Q228 374 200 352 Q150 312 150 236 Z';

function fundo() {
  const estrelas = [[48, 64, 1.6], [112, 36, 1.2], [196, 58, 1.8], [84, 150, 1.1], [30, 230, 1.4], [150, 104, 1], [470, 210, 1.3], [490, 40, 1], [330, 30, 1.2]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".8"/>`).join('');
  // Estrelas maiores com brilho em cruz.
  const cintilantes = [[70, 100], [462, 150], [240, 26]]
    .map(([x, y]) => `<path d="M${x} ${y - 7} L${x + 1.4} ${y - 1.4} L${x + 7} ${y} L${x + 1.4} ${y + 1.4} L${x} ${y + 7} L${x - 1.4} ${y + 1.4} L${x - 7} ${y} L${x - 1.4} ${y - 1.4} Z" fill="#fff6dd"/>`).join('');
  const morceguinhos = [[90, 60, 0.5], [130, 82, 0.35], [60, 190, 0.3]]
    .map(([x, y, s]) => `<path transform="translate(${x} ${y}) scale(${s})" d="${MORCEGO}" fill="#0a0510" opacity=".75"/>`).join('');
  return `<rect width="512" height="512" fill="url(#ceu)"/>
    ${estrelas}${cintilantes}
    <circle cx="410" cy="100" r="90" fill="url(#brilhoLua)"/>
    <circle cx="410" cy="100" r="44" fill="url(#lua)"/>
    <circle cx="396" cy="88" r="7" fill="#d9c18a" opacity=".55"/><circle cx="424" cy="118" r="10" fill="#d9c18a" opacity=".45"/><circle cx="420" cy="80" r="4" fill="#d9c18a" opacity=".5"/>
    <path d="M330 150 Q360 132 392 146 Q420 128 452 144 Q482 140 500 156 L330 158 Z" fill="#2c1838" opacity=".8"/>
    ${morceguinhos}
    <rect y="380" width="512" height="132" fill="url(#nevoa)"/>`;
}

const MORCEGO = 'M0 0 Q-8 -10 -22 -8 Q-16 -2 -18 6 Q-10 2 -6 8 Q-3 2 0 6 Q3 2 6 8 Q10 2 18 6 Q16 -2 22 -8 Q8 -10 0 0 Z';

function asas() {
  const asa = (s: 1 | -1) => {
    const x = (v: number) => 256 + s * v;
    return `<g>
      <path d="M${x(70)} 430 Q${x(150)} 300 ${x(236)} 290 Q${x(222)} 330 ${x(240)} 362 Q${x(200)} 360 ${x(206)} 398 Q${x(170)} 388 ${x(166)} 430 Q${x(130)} 412 ${x(110)} 456 Z" fill="url(#asa)" stroke="#6b3a85" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M${x(80)} 428 L${x(236)} 290 M${x(90)} 432 L${x(206)} 398 M${x(96)} 440 L${x(166)} 430" stroke="#6b3a85" stroke-width="2" opacity=".7"/>
    </g>`;
  };
  return asa(-1) + asa(1);
}

function cabeloAtras(a: Aparencia) {
  switch (a.penteado) {
    case 'liso':
    case 'franja':
      return `<path d="M138 246 Q120 116 256 104 Q392 116 374 246 L392 400 Q404 452 380 486 Q366 462 350 476 Q336 448 318 470 L194 470 Q176 448 162 476 Q146 462 132 486 Q108 452 120 400 Z" fill="url(#cabeloAtras)"/>`;
    case 'maria-chiquinha': {
      const rabo = (s: 1 | -1) => {
        const x = (v: number) => 256 + s * v;
        return `<path d="M${x(108)} 206 Q${x(196)} 230 ${x(186)} 330 Q${x(180)} 420 ${x(150)} 482 Q${x(148)} 440 ${x(136)} 420 Q${x(128)} 452 ${x(112)} 470 Q${x(124)} 380 ${x(116)} 300 Q${x(112)} 250 ${x(96)} 222 Z" fill="url(#cabelo)"/>
          <path d="M${x(150)} 240 Q${x(168)} 320 ${x(156)} 420" stroke="${escurecer(a.cabelo, 0.55)}" stroke-width="3" fill="none" opacity=".6"/>`;
      };
      return `<path d="M146 240 Q134 124 256 112 Q378 124 366 240 L360 300 L152 300 Z" fill="url(#cabeloAtras)"/>${rabo(-1)}${rabo(1)}`;
    }
    case 'coque':
      return `<circle cx="256" cy="110" r="58" fill="url(#cabelo)"/>
        <path d="M216 96 Q256 64 296 96 M222 124 Q256 96 292 124" stroke="${escurecer(a.cabelo, 0.6)}" stroke-width="3" fill="none" opacity=".6"/>
        <path d="M226 82 Q250 66 276 72" stroke="#fff" stroke-opacity=".3" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path d="M212 58 L262 120 M300 58 L250 120" stroke="url(#ouro)" stroke-width="6" stroke-linecap="round"/>
        <circle cx="212" cy="58" r="7" fill="url(#gema)"/><circle cx="300" cy="58" r="7" fill="url(#gema)"/>`;
  }
}

function franjaD(a: Aparencia) {
  switch (a.penteado) {
    case 'franja':
      return 'M142 250 Q138 116 256 112 Q374 116 370 250 L356 214 L340 236 L324 204 L306 232 L288 202 L268 230 L250 200 L232 230 L214 202 L196 234 L180 204 L162 238 Z';
    case 'liso':
      // Repartido no meio, caindo em cortina.
      return 'M142 256 Q134 116 256 110 Q378 116 370 256 Q356 186 316 160 Q288 150 266 168 Q262 140 256 122 Q250 140 246 168 Q224 150 196 160 Q156 186 142 256 Z';
    default:
      return 'M142 250 Q138 118 256 114 Q374 118 370 250 Q356 186 320 176 Q300 212 262 196 Q256 216 250 196 Q212 212 192 176 Q156 186 142 250 Z';
  }
}

function cabeloFrente(a: Aparencia) {
  const escuro = escurecer(a.cabelo, 0.55);
  const lateral = (s: 1 | -1) => {
    const x = (v: number) => 256 + s * v;
    return a.penteado === 'coque'
      ? `<path d="M${x(108)} 220 Q${x(122)} 280 ${x(100)} 330 Q${x(96)} 290 ${x(90)} 250 Z" fill="url(#cabelo)"/>`
      : `<path d="M${x(112)} 214 Q${x(132)} 320 ${x(104)} 430 Q${x(92)} 420 ${x(86)} 436 Q${x(96)} 330 ${x(84)} 228 Z" fill="url(#cabelo)"/>
         <path d="M${x(100)} 250 Q${x(106)} 330 ${x(96)} 410" stroke="${escuro}" stroke-width="2.5" fill="none" opacity=".55"/>`;
  };
  const fios = {
    franja: 'M196 140 L190 220 M232 132 L232 220 M276 132 L270 220 M316 140 L324 222',
    liso: 'M226 140 Q186 170 166 236 M246 130 Q214 160 196 196 M286 140 Q326 170 346 236 M266 130 Q298 160 316 196',
    'maria-chiquinha': 'M200 150 Q186 190 178 230 M236 132 Q226 160 220 196 M276 132 Q286 160 292 196 M312 150 Q326 190 334 230',
    coque: 'M200 150 Q186 190 178 230 M236 132 Q226 160 220 196 M276 132 Q286 160 292 196 M312 150 Q326 190 334 230',
  }[a.penteado];
  const laco = (s: 1 | -1) => {
    const x = (v: number) => 256 + s * v;
    return `<path d="M${x(112)} 206 L${x(84)} 186 Q${x(74)} 210 ${x(86)} 228 Z M${x(112)} 206 L${x(140)} 182 Q${x(152)} 206 ${x(138)} 226 Z" fill="#1d1424" stroke="#6b1d5c" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M${x(106)} 212 L${x(98)} 244 M${x(118)} 212 L${x(124)} 242" stroke="#1d1424" stroke-width="5" stroke-linecap="round"/>
      <circle cx="${x(112)}" cy="206" r="7" fill="url(#gema)"/>`;
  };
  return `${lateral(-1)}${lateral(1)}
    <path d="${franjaD(a)}" fill="url(#cabelo)"/>
    <path d="${fios}" stroke="${escuro}" stroke-width="2.5" fill="none" opacity=".5" stroke-linecap="round"/>
    <g stroke="#fff" stroke-opacity=".3" stroke-width="7" fill="none" stroke-linecap="round" filter="url(#desfoqueLeve)"><path d="M184 166 Q206 146 234 138"/><path d="M278 138 Q306 146 328 166"/></g>
    <g stroke="#fff" stroke-opacity=".5" stroke-width="2.5" fill="none" stroke-linecap="round"><path d="M196 156 Q212 144 230 140"/><path d="M282 140 Q300 144 316 156"/></g>
    ${a.penteado === 'maria-chiquinha' ? laco(-1) + laco(1) : ''}`;
}

function olho(a: Aparencia, x: number, lado: 1 | -1, humor: Humor) {
  const interno = x - 27 * lado;
  const externo = x + 27 * lado;
  const topo = humor === 'feliz' ? 244 : humor === 'triste' ? 246 : 240;
  const branco = `M${interno} 270 Q${x - 6 * lado} ${topo} ${externo} 262 Q${x + 18 * lado} 296 ${x} 298 Q${x - 18 * lado} 296 ${interno} 270 Z`;
  const id = `olho${lado}`;
  return `
    <ellipse cx="${x + 4 * lado}" cy="252" rx="38" ry="20" fill="#3a1650" opacity=".45" filter="url(#desfoque)"/>
    <clipPath id="${id}"><path d="${branco}"/></clipPath>
    <path d="${branco}" fill="#fbf7fb"/>
    <g clip-path="url(#${id})">
      <path d="M${interno} 262 Q${x} ${topo - 6} ${externo} 256 L${externo} 276 L${interno} 276 Z" fill="#c9b8d6" opacity=".55"/>
      <ellipse cx="${x}" cy="273" rx="17.5" ry="21" fill="url(#iris)" stroke="${escurecer(a.olhos, 0.4)}" stroke-width="2"/>
      <ellipse cx="${x}" cy="274" rx="8" ry="11" fill="#0b0710"/>
      <path d="M${x - 12} 284 Q${x} 294 ${x + 12} 284" stroke="${clarear(a.olhos, 0.6)}" stroke-width="2" fill="none" opacity=".7"/>
      <ellipse cx="${x - 6}" cy="264" rx="${humor === 'triste' ? 7 : 6}" ry="${humor === 'triste' ? 8 : 7}" fill="#fff"/>
      <circle cx="${x + 7}" cy="283" r="2.8" fill="#fff" opacity=".85"/>
      ${humor === 'triste' ? `<path d="M${interno} 292 Q${x} 300 ${externo} 288 L${externo} 300 L${interno} 300 Z" fill="#9fd3ff" opacity=".35"/>` : ''}
    </g>
    <path d="M${interno - 2 * lado} 268 Q${x - 6 * lado} ${topo - 4} ${externo} 260" stroke="#0b0710" stroke-width="6.5" fill="none" stroke-linecap="round"/>
    <path d="M${externo - 6 * lado} 256 L${externo + 20 * lado} 244 L${externo + 2 * lado} 268 Z" fill="#0b0710"/>
    <path d="M${externo - 2 * lado} 258 l${9 * lado} -12 M${x + 12 * lado} 248 l${5 * lado} -11" stroke="#0b0710" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M${interno + 6 * lado} 290 Q${x} 302 ${externo - 4 * lado} 282" stroke="#2a1630" stroke-width="2" fill="none" opacity=".55"/>`;
}

function rosto(a: Aparencia, humor: Humor) {
  const corSobrancelha = escurecer(a.cabelo === '#e8e4ee' ? '#8a7f95' : a.cabelo, 0.7);
  const sobrancelha = humor === 'triste'
    ? 'M184 232 Q206 214 230 224 M328 232 Q306 214 282 224'
    : humor === 'feliz'
      ? 'M184 222 Q208 206 232 214 M328 222 Q304 206 280 214'
      : 'M184 226 Q208 214 232 220 M328 226 Q304 214 280 220';
  const labios = {
    feliz: `<path d="M232 322 Q256 346 280 322 Q256 330 232 322 Z" fill="${a.batom}"/>
      <path d="M262 327 L266 336 L270 327 Z" fill="#fff"/>`,
    neutra: `<path d="M236 326 Q246 320 256 324 Q266 320 276 326 Q256 338 236 326 Z" fill="${a.batom}"/>`,
    triste: `<path d="M236 334 Q256 318 276 334 Q256 328 236 334 Z" fill="${a.batom}"/>`,
  }[humor];
  // Triste: rímel escorrendo, bem drama gótico.
  const rimel = humor === 'triste'
    ? `<path d="M196 296 Q192 318 198 344 Q200 352 196 358" stroke="#1a1020" stroke-width="3" fill="none" opacity=".75" stroke-linecap="round"/>
       <path d="M318 294 Q322 312 318 330" stroke="#1a1020" stroke-width="2.5" fill="none" opacity=".6" stroke-linecap="round"/>`
    : '';
  return `
    <g clip-path="url(#rosto)"><path d="${franjaD(a)}" transform="translate(0 12)" fill="${escurecer(a.pele, 0.78)}" opacity=".45"/></g>
    ${olho(a, 210, -1, humor)}${olho(a, 302, 1, humor)}
    <path d="${sobrancelha}" stroke="${corSobrancelha}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="184" cy="310" rx="${humor === 'feliz' ? 24 : 18}" ry="11" fill="url(#rubor)"/>
    <ellipse cx="328" cy="310" rx="${humor === 'feliz' ? 24 : 18}" ry="11" fill="url(#rubor)"/>
    <path d="M254 300 Q259 307 252 310" stroke="${escurecer(a.pele, 0.72)}" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${labios}
    <ellipse cx="250" cy="330" rx="6" ry="2" fill="#fff" opacity=".3"/>
    ${rimel}`;
}

function roupa() {
  const recortes = Array.from({ length: 13 }, (_, k) => {
    const t = k / 12;
    const x = 150 + t * 212;
    const y = 432 + Math.sin(t * Math.PI) * 22;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="url(#renda)"/><circle cx="${x.toFixed(1)}" cy="${(y + 2).toFixed(1)}" r="2.5" fill="#0c0810"/>`;
  }).join('');
  return `<path d="M70 512 Q78 420 196 400 L316 400 Q434 420 442 512 Z" fill="url(#vestido)"/>
    <path d="M150 430 Q160 398 220 396 L292 396 Q352 398 362 430 Q256 470 150 430 Z" fill="url(#renda)"/>
    ${recortes}
    <path d="M220 396 Q256 420 292 396" stroke="#4b3d58" stroke-width="2" fill="none"/>
    <path d="M256 456 L256 512" stroke="#3a2d46" stroke-width="2"/>
    ${[470, 490].map((y) => `<circle cx="256" cy="${y}" r="3.5" fill="url(#prata)"/>`).join('')}`;
}

function acessorios(nivel: number, fase: 'pescoco' | 'rosto' | 'cabeca' | 'frente') {
  const p: string[] = [];
  if (fase === 'pescoco') {
    if (temItem(nivel, 'choker')) {
      p.push(`<rect x="222" y="372" width="68" height="13" rx="6" fill="#120a18"/>
        <rect x="222" y="373" width="68" height="4" rx="2" fill="#fff" opacity=".12"/>`);
    }
    if (temItem(nivel, 'cruz')) {
      p.push(`<circle cx="256" cy="388" r="3" fill="none" stroke="url(#ouro)" stroke-width="2"/>
        <path d="M252 392 h8 v8 h8 v7 h-8 v18 h-8 v-18 h-8 v-7 h8 Z" fill="url(#ouro)" stroke="#5c4115" stroke-width="1"/>
        <circle cx="256" cy="403" r="2.6" fill="url(#gema)"/>`);
    } else {
      p.push(`<circle cx="256" cy="414" r="9" fill="url(#ouro)"/><circle cx="256" cy="414" r="6" fill="url(#gema)"/>`);
    }
  }
  if (fase === 'rosto' && temItem(nivel, 'piercing')) {
    p.push(`<circle cx="270" cy="336" r="4.5" fill="none" stroke="url(#prata)" stroke-width="2.5"/>`);
  }
  if (fase === 'cabeca' && temItem(nivel, 'rosas')) {
    const rosa = (x: number, y: number, r: number) => `
      <path d="M${x - r - 8} ${y + 4} Q${x - r - 2} ${y - 8} ${x - r + 4} ${y + 2} Z" fill="#2f5a3a"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#rosa)"/>
      <path d="M${x - r * 0.55} ${y} A${r * 0.55} ${r * 0.55} 0 1 1 ${x + r * 0.2} ${y + r * 0.45} M${x - r * 0.15} ${y - r * 0.05} A${r * 0.22} ${r * 0.22} 0 1 0 ${x + r * 0.25} ${y}" stroke="#4a0310" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    p.push(`<path d="M168 168 Q256 120 344 168" stroke="#1d1424" stroke-width="5" fill="none"/>
      ${rosa(176, 166, 13)}${rosa(214, 146, 15)}${rosa(256, 136, 18)}${rosa(298, 146, 15)}${rosa(336, 166, 13)}`);
  }
  if (fase === 'frente' && temItem(nivel, 'morcego')) {
    p.push(`<g transform="translate(420 300) rotate(-8)">
      <ellipse cx="0" cy="44" rx="30" ry="6" fill="#000" opacity=".25" filter="url(#desfoqueLeve)"/>
      <path d="M0 6 Q-18 -22 -52 -14 Q-40 -2 -44 14 Q-30 6 -22 18 Q-14 6 -6 16 Z M0 6 Q18 -22 52 -14 Q40 -2 44 14 Q30 6 22 18 Q14 6 6 16 Z" fill="url(#asa)" stroke="#6b3a85" stroke-width="1.5"/>
      <ellipse cx="0" cy="8" rx="15" ry="17" fill="#1a1022"/>
      <path d="M-11 -4 L-8 -18 L-3 -7 Z M11 -4 L8 -18 L3 -7 Z" fill="#1a1022"/>
      <circle cx="-5.5" cy="4" r="3.6" fill="#ff5d73"/><circle cx="5.5" cy="4" r="3.6" fill="#ff5d73"/>
      <circle cx="-4.5" cy="3" r="1.2" fill="#fff"/><circle cx="6.5" cy="3" r="1.2" fill="#fff"/>
      <path d="M-4 12 Q0 15 4 12" stroke="#fff" stroke-width="1.4" fill="none"/>
      <path d="M-2.5 12.6 L-1.5 15.5 L-0.5 12.9 Z" fill="#fff"/>
    </g>`);
  }
  return p.join('');
}

/** Retrato da gótica em SVG 512×512 (busto, estilo chibi). Os acessórios dependem do nível. */
export function desenharGotica(a: Aparencia, nivel: number, humor: Humor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${defs(a)}
  ${fundo()}
  ${temItem(nivel, 'asas') ? asas() : ''}
  ${cabeloAtras(a)}
  <path d="M224 320 L288 320 L292 404 Q256 418 220 404 Z" fill="url(#pescoco)"/>
  ${roupa()}
  ${acessorios(nivel, 'pescoco')}
  <path d="${ROSTO_D}" fill="url(#pele)"/>
  ${rosto(a, humor)}
  ${acessorios(nivel, 'rosto')}
  ${cabeloFrente(a)}
  ${acessorios(nivel, 'cabeca')}
  ${acessorios(nivel, 'frente')}
  <rect width="512" height="512" fill="url(#vinheta)"/>
</svg>`;
}

export const barra = (v: number) => {
  const cheios = Math.round(v / 10);
  return '▰'.repeat(cheios) + '▱'.repeat(10 - cheios);
};
