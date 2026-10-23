// Regras do cassino da Taverna. Todos os jogos devolvem um pouco menos do que recebem em média
// (como cassino de verdade), para as moedas não inflacionarem.

type Sorteio = () => number;

export const APOSTA_MINIMA = 10;
export const LIMITE_DIARIO = 2000; // quanto cada pessoa pode apostar por dia, somando tudo

// ---------- Cara ou coroa ----------

export type Lado = 'cara' | 'coroa';
export const PAGA_MOEDA = 1.9;
export function jogarMoeda(escolha: Lado, r: Sorteio = Math.random) {
  const saiu: Lado = r() < 0.5 ? 'cara' : 'coroa';
  return { saiu, ganhou: saiu === escolha, multiplicador: saiu === escolha ? PAGA_MOEDA : 0 };
}

// ---------- Caça-níquel ----------

// Símbolos com o emoji da Taverna (nome) e o comum de reserva; peso = chance de cair em cada rolo.
// paga2/paga3: multiplicador da aposta com dois ou três iguais. Cada símbolo paga diferente; a caveira é o azar
// (dois devolvem só um quarto, três levam tudo). Com esses valores a casa fica com uns 7% (retornoMedioSlots).
export const SIMBOLOS = [
  { id: 'cerveja', nome: 'Cerveja', emoji: 'taverna_cerveja', reserva: '🍺', peso: 30, paga2: 1.1, paga3: 4 },
  { id: 'd20', nome: 'D20', emoji: 'd20', reserva: '🎲', peso: 25, paga2: 1.3, paga3: 8 },
  { id: 'coracao', nome: 'Coração gótico', emoji: 'coracao_gotico', reserva: '🖤', peso: 18, paga2: 1.6, paga3: 12 },
  { id: 'caveira', nome: 'Caveira', emoji: 'caveira', reserva: '💀', peso: 15, paga2: 0.25, paga3: 0 },
  { id: 'gotica', nome: 'Gótica', emoji: 'gotica_feliz', reserva: '🦇', peso: 8, paga2: 3, paga3: 30 },
  { id: 'moeda', nome: 'Moeda da Taverna', emoji: 'moeda_taverna', reserva: '🪙', peso: 4, paga2: 5, paga3: 100 },
] as const;
export type Simbolo = (typeof SIMBOLOS)[number];
const PESO_TOTAL = SIMBOLOS.reduce((s, x) => s + x.peso, 0);

/** Chance (0 a 1) de sair exatamente dois iguais e de sair três iguais de um símbolo. */
export function chancesSlots(s: Simbolo) {
  const p = s.peso / PESO_TOTAL;
  return { dois: 3 * p ** 2 * (1 - p), tres: p ** 3 };
}

function rolo(r: Sorteio): Simbolo {
  let n = r() * PESO_TOTAL;
  for (const s of SIMBOLOS) {
    if ((n -= s.peso) < 0) return s;
  }
  return SIMBOLOS[0];
}

/** Um símbolo qualquer (para a animação dos rolos girando). */
export const simboloAleatorio = (r: Sorteio = Math.random) => rolo(r);

export function girarSlots(r: Sorteio = Math.random) {
  const rolos = [rolo(r), rolo(r), rolo(r)] as const;
  const [a, b, c] = rolos;
  if (a.id === b.id && b.id === c.id) return { rolos, combinacao: 'tres' as const, simbolo: a as Simbolo, multiplicador: a.paga3, jackpot: a.id === 'moeda' };
  const par = a.id === b.id ? a : b.id === c.id ? b : a.id === c.id ? a : undefined;
  if (par) return { rolos, combinacao: 'dois' as const, simbolo: par as Simbolo, multiplicador: par.paga2, jackpot: false };
  return { rolos, combinacao: 'nada' as const, simbolo: undefined, multiplicador: 0, jackpot: false };
}

/** Retorno médio do caça-níquel (para os testes garantirem que a casa ganha um pouco). */
export function retornoMedioSlots() {
  let ev = 0;
  for (const s of SIMBOLOS) {
    const c = chancesSlots(s);
    ev += c.tres * s.paga3 + c.dois * s.paga2;
  }
  return ev;
}

// ---------- Roleta (europeia: 0 a 36) ----------

export type ApostaRoleta = 'vermelho' | 'preto' | 'verde' | 'numero';
const VERMELHOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const corDoNumero = (n: number) => (n === 0 ? 'verde' : VERMELHOS.has(n) ? 'vermelho' : 'preto');

export function girarRoleta(aposta: ApostaRoleta, numero: number | null, r: Sorteio = Math.random) {
  const saiu = Math.floor(r() * 37);
  const cor = corDoNumero(saiu);
  let multiplicador = 0;
  if (aposta === 'numero') multiplicador = saiu === numero ? 36 : 0;
  else if (aposta === 'verde') multiplicador = cor === 'verde' ? 14 : 0;
  else multiplicador = cor === aposta ? 2 : 0;
  return { saiu, cor, multiplicador };
}

export const premio = (aposta: number, multiplicador: number) => Math.floor(aposta * multiplicador);
