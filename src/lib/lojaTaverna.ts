// Catálogo da loja da Taverna (coisas para você no servidor, não para a gótica).

export const CORES = [
  { id: 'cor-vermelho', nome: 'Vermelho Sangue', emoji: '🔴', cor: 0xe74c3c },
  { id: 'cor-azul', nome: 'Azul Noite', emoji: '🔵', cor: 0x3b82f6 },
  { id: 'cor-verde', nome: 'Verde Veneno', emoji: '🟢', cor: 0x2ecc71 },
  { id: 'cor-roxo', nome: 'Roxo Gótico', emoji: '🟣', cor: 0x9b59b6 },
  { id: 'cor-rosa', nome: 'Rosa Choque', emoji: '🩷', cor: 0xff5fa2 },
  { id: 'cor-dourado', nome: 'Dourado', emoji: '🟡', cor: 0xf5c542 },
  { id: 'cor-ciano', nome: 'Ciano Elétrico', emoji: '🩵', cor: 0x22d3ee },
] as const;

export const PRECO_COR = 500;
export const PRECO_XP_DOBRO = 400;
export const DURACAO_XP_DOBRO = 24 * 3_600_000;

export type IdCor = (typeof CORES)[number]['id'];
export const corPorId = (id: string) => CORES.find((c) => c.id === id);
/** Nome do cargo de cor no Discord (o bot cria quando alguém compra a primeira vez). */
export const nomeCargoCor = (c: (typeof CORES)[number]) => `🎨 ${c.nome}`;

export const ITENS_TAVERNA = [
  ...CORES.map((c) => ({ id: c.id as string, nome: `Cor ${c.nome}`, emoji: c.emoji, preco: PRECO_COR })),
  { id: 'xp-dobro', nome: 'XP em dobro por 24 h', emoji: '⚡', preco: PRECO_XP_DOBRO },
];

/** XP com o bônus aplicado (se o dobro estiver valendo agora). */
export const xpComBonus = (xp: number, dobroAte: number, agora: number) => (dobroAte > agora ? xp * 2 : xp);

/** Comprar o dobro com ele ainda valendo soma mais 24 h ao fim atual (não desperdiça o que sobrou). */
export const novoFimDoDobro = (dobroAte: number, agora: number) => Math.max(dobroAte, agora) + DURACAO_XP_DOBRO;
