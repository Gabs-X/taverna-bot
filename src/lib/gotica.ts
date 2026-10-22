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

const escurecer = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
};

const MORCEGO = 'M0 0 Q-8 -10 -22 -8 Q-16 -2 -18 6 Q-10 2 -6 8 Q-3 2 0 6 Q3 2 6 8 Q10 2 18 6 Q16 -2 22 -8 Q8 -10 0 0 Z';

function cabeloAtras(a: Aparencia) {
  const c = a.cabelo;
  switch (a.penteado) {
    case 'liso':
    case 'franja':
      return `<path d="M140 240 Q130 120 256 112 Q382 120 372 240 L392 470 Q256 500 120 470 Z" fill="${escurecer(c, 0.8)}"/>`;
    case 'maria-chiquinha':
      return `<ellipse cx="112" cy="330" rx="46" ry="110" fill="${escurecer(c, 0.85)}"/>
        <ellipse cx="400" cy="330" rx="46" ry="110" fill="${escurecer(c, 0.85)}"/>
        <circle cx="140" cy="215" r="14" fill="#6b1d5c"/><circle cx="372" cy="215" r="14" fill="#6b1d5c"/>`;
    case 'coque':
      return `<circle cx="256" cy="118" r="62" fill="${escurecer(c, 0.9)}"/>
        <path d="M232 70 L280 166 M280 70 L232 166" stroke="#c9b27a" stroke-width="5"/>`;
  }
}

function cabeloFrente(a: Aparencia) {
  const c = a.cabelo;
  const laterais = a.penteado === 'coque'
    ? ''
    : `<path d="M146 230 Q128 330 150 420 L182 408 Q160 330 172 238 Z" fill="${c}"/>
       <path d="M366 230 Q384 330 362 420 L330 408 Q352 330 340 238 Z" fill="${c}"/>`;
  const franja = a.penteado === 'franja'
    ? `<path d="M144 244 Q144 122 256 120 Q368 122 368 244 L350 206 L330 228 L310 202 L290 226 L268 202 L246 226 L224 202 L202 228 L182 206 L162 232 Z" fill="${c}"/>`
    : `<path d="M144 250 Q138 126 256 122 Q374 126 368 250 Q352 188 318 182 Q296 214 256 198 Q214 214 194 182 Q160 188 144 250 Z" fill="${c}"/>`;
  return laterais + franja + `<path d="M200 150 Q240 132 286 140" stroke="#ffffff" stroke-opacity=".18" stroke-width="8" fill="none" stroke-linecap="round"/>`;
}

function rosto(a: Aparencia, humor: Humor) {
  const olho = (x: number, lado: 1 | -1) => `
    <ellipse cx="${x}" cy="268" rx="22" ry="${humor === 'feliz' ? 24 : 26}" fill="#fbf7fb"/>
    <circle cx="${x}" cy="272" r="15" fill="${a.olhos}"/>
    <circle cx="${x}" cy="272" r="7" fill="#0b0710"/>
    <circle cx="${x - 5}" cy="265" r="4.5" fill="#fff"/>
    <path d="M${x - 26 * lado} 262 Q${x} 236 ${x + 24 * lado} 254 L${x + 38 * lado} 244" stroke="#0b0710" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  const sobrancelha = humor === 'triste'
    ? `<path d="M186 226 Q208 214 230 222" /><path d="M326 226 Q304 214 282 222" />`
    : `<path d="M186 222 Q208 210 232 216" /><path d="M326 222 Q304 210 280 216" />`;
  const boca = {
    feliz: `<path d="M230 318 Q256 344 282 318 Q256 328 230 318 Z" fill="${a.batom}"/>`,
    neutra: `<path d="M236 324 Q256 330 276 324 Q256 336 236 324 Z" fill="${a.batom}"/>`,
    triste: `<path d="M236 332 Q256 316 276 332 Q256 326 236 332 Z" fill="${a.batom}"/>`,
  }[humor];
  // Triste: rímel escorrendo, bem drama gótico.
  const lagrima = humor === 'triste' ? `<path d="M200 292 Q196 316 202 336" stroke="#1a1020" stroke-width="3" fill="none" opacity=".7"/>` : '';
  return `${olho(210, -1)}${olho(302, 1)}
    <g stroke="${escurecer(a.cabelo, 0.7)}" stroke-width="5" fill="none" stroke-linecap="round">${sobrancelha}</g>
    <ellipse cx="180" cy="306" rx="16" ry="8" fill="#c24a6a" opacity=".18"/>
    <ellipse cx="332" cy="306" rx="16" ry="8" fill="#c24a6a" opacity=".18"/>
    ${boca}${lagrima}`;
}

/** Retrato da gótica em SVG 512×512 (busto, estilo chibi). Os acessórios dependem do nível. */
export function desenharGotica(a: Aparencia, nivel: number, humor: Humor) {
  const pele = a.pele;
  const sombra = escurecer(pele, 0.86);
  const estrelas = [[60, 70], [120, 40], [200, 60], [90, 150], [440, 180], [470, 60], [30, 220]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#fff" opacity=".7"/>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140a1f"/><stop offset="1" stop-color="#3b1d4a"/></linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#ceu)"/>
  ${estrelas}
  <circle cx="420" cy="96" r="42" fill="#f3ead2"/><circle cx="438" cy="84" r="38" fill="#1b0e28"/>
  ${temItem(nivel, 'asas') ? `<g fill="#1d0f26" stroke="#5b2a6e" stroke-width="3">
    <path d="M190 420 Q60 300 20 380 Q50 380 40 420 Q70 405 80 450 Q110 420 130 470 Z"/>
    <path d="M322 420 Q452 300 492 380 Q462 380 472 420 Q442 405 432 450 Q402 420 382 470 Z"/></g>` : ''}
  ${cabeloAtras(a)}
  <path d="M86 512 Q100 404 256 392 Q412 404 426 512 Z" fill="#141018"/>
  <path d="M190 400 Q256 440 322 400 L314 392 Q256 420 198 392 Z" fill="#2a2030"/>
  ${[200, 222, 244, 268, 290, 312].map((x) => `<circle cx="${x}" cy="${404 + Math.abs(256 - x) / 6}" r="6" fill="#e9e1ec" opacity=".85"/>`).join('')}
  <rect x="226" y="326" width="60" height="74" rx="20" fill="${sombra}"/>
  ${temItem(nivel, 'choker') ? `<rect x="224" y="374" width="64" height="12" rx="6" fill="#0b0710"/>` : ''}
  ${temItem(nivel, 'cruz') ? `<path d="M256 384 v26 M247 393 h18" stroke="#c9b27a" stroke-width="5" stroke-linecap="round"/>` : ''}
  <ellipse cx="256" cy="252" rx="112" ry="122" fill="${pele}"/>
  ${rosto(a, humor)}
  ${temItem(nivel, 'piercing') ? `<circle cx="270" cy="338" r="4" fill="none" stroke="#c0c0c8" stroke-width="2.5"/>` : ''}
  ${cabeloFrente(a)}
  ${temItem(nivel, 'rosas') ? [176, 216, 256, 296, 336].map((x, k) => `<circle cx="${x}" cy="${150 - (k % 2 ? 8 : 0) - (x === 256 ? 10 : 0)}" r="14" fill="#8b0a1e"/><circle cx="${x}" cy="${150 - (k % 2 ? 8 : 0) - (x === 256 ? 10 : 0)}" r="6" fill="#5c0614"/>`).join('') : ''}
  ${temItem(nivel, 'morcego') ? `<g transform="translate(410 250) scale(1.8)" fill="#0b0710"><path d="${MORCEGO}"/><circle cx="-2.5" cy="1" r="1" fill="#e74c3c"/><circle cx="2.5" cy="1" r="1" fill="#e74c3c"/></g>` : ''}
</svg>`;
}

export const barra = (v: number) => {
  const cheios = Math.round(v / 10);
  return '▰'.repeat(cheios) + '▱'.repeat(10 - cheios);
};
