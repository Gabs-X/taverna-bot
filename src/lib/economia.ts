// Moedas da Taverna e níveis por atividade. Puro (sem Discord nem banco) para dar para testar.

type Sorteio = () => number;
const entre = (min: number, max: number, r: Sorteio) => min + Math.floor(r() * (max - min + 1));

// ---------- Níveis ----------

/** XP para ir do nível n ao n+1 (curva parecida com a dos bots de nível mais conhecidos). */
export const xpDoNivel = (n: number) => 5 * n * n + 50 * n + 100;

export function somarXp(nivel: number, xp: number, ganho: number) {
  xp += ganho;
  const subiu: number[] = [];
  while (xp >= xpDoNivel(nivel)) {
    xp -= xpDoNivel(nivel);
    nivel++;
    subiu.push(nivel);
  }
  return { nivel, xp, subiu };
}

// ---------- Ganhos por atividade ----------

export const ESPERA_MENSAGEM = 60_000; // só a primeira mensagem de cada minuto conta (anti-spam)
export const ganhoMensagem = (r: Sorteio = Math.random) => ({ xp: entre(15, 25, r), moedas: 2 });
export const GANHO_MINUTO_CALL = { xp: 8, moedas: 1 } as const;

// ---------- /daily ----------

const HORA = 3_600_000;
export const ESPERA_DAILY = 20 * HORA;
export const PERDE_SEQUENCIA = 48 * HORA;

export type Daily =
  | { ok: false; liberaEm: number }
  | { ok: true; moedas: number; sequencia: number; perdeuSequencia: boolean };

/** Base 100 + 10 por dia seguido (até +100). Fica mais de 48 h sem pegar, a sequência volta a 1. */
export function calcularDaily(ultimo: number, sequencia: number, agora: number): Daily {
  if (ultimo && agora - ultimo < ESPERA_DAILY) return { ok: false, liberaEm: ultimo + ESPERA_DAILY };
  const perdeuSequencia = !!ultimo && agora - ultimo > PERDE_SEQUENCIA;
  const nova = perdeuSequencia || !ultimo ? 1 : sequencia + 1;
  return { ok: true, moedas: 100 + Math.min(nova - 1, 10) * 10, sequencia: nova, perdeuSequencia: perdeuSequencia && sequencia > 1 };
}

// ---------- /trabalhar ----------

export const ESPERA_TRABALHO = HORA;

export const TRABALHOS = [
  { texto: 'lavou as canecas da taverna', min: 30, max: 60 },
  { texto: 'expulsou um bardo desafinado', min: 40, max: 70 },
  { texto: 'carregou o carry do time no Valorant', min: 50, max: 90 },
  { texto: 'fez de suporte pro ADC que não agradeceu', min: 35, max: 75 },
  { texto: 'vendeu poção de mana falsificada', min: 20, max: 110 },
  { texto: 'serviu de NPC na mesa de RPG', min: 45, max: 80 },
  { texto: 'consertou o servidor de Minecraft às 3h', min: 60, max: 95 },
  { texto: 'contou as moedas do taverneiro (e ficou com algumas)', min: 25, max: 100 },
  { texto: 'cuidou da gótica de um amigo que viajou', min: 40, max: 85 },
] as const;

export function trabalhar(ultimo: number, agora: number, r: Sorteio = Math.random) {
  if (ultimo && agora - ultimo < ESPERA_TRABALHO) return { ok: false as const, liberaEm: ultimo + ESPERA_TRABALHO };
  const t = TRABALHOS[Math.floor(r() * TRABALHOS.length)];
  return { ok: true as const, texto: t.texto, moedas: entre(t.min, t.max, r) };
}

export const formatarMoedas = (n: number) => `🪙 ${n.toLocaleString('pt-BR')}`;
