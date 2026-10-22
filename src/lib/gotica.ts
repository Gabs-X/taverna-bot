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

export const barra = (v: number) => {
  const cheios = Math.round(v / 10);
  return '▰'.repeat(cheios) + '▱'.repeat(10 - cheios);
};
