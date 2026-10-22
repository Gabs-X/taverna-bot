// Desafios valendo moedas entre dois membros e o /assaltar. Puro (sem Discord nem banco) para dar para testar.

type Sorteio = () => number;
const entre = (min: number, max: number, r: Sorteio) => min + Math.floor(r() * (max - min + 1));

// ---------- Desafio ----------

export type JogoDesafio = 'moeda' | 'dado';

/** Quem ganha o desafio ('a' desafiou, 'b' aceitou). Moeda: 'a' é cara. Dado: d20 cada, empate rola de novo. */
export function resolverDesafio(jogo: JogoDesafio, r: Sorteio = Math.random) {
  if (jogo === 'moeda') {
    const saiu = r() < 0.5 ? 'cara' : 'coroa';
    return { venceu: saiu === 'cara' ? ('a' as const) : ('b' as const), texto: `deu **${saiu}**` };
  }
  const rolagens: [number, number][] = [];
  let a: number;
  let b: number;
  do {
    a = entre(1, 20, r);
    b = entre(1, 20, r);
    rolagens.push([a, b]);
  } while (a === b && rolagens.length < 10);
  if (a === b) a++; // dez empates seguidos: quem desafiou leva (praticamente impossível)
  return { venceu: a > b ? ('a' as const) : ('b' as const), rolagens };
}

// ---------- Assalto ----------

const HORA = 3_600_000;
export const ESPERA_ASSALTO = 2 * HORA;
export const PROTECAO_ASSALTO = HORA; // quem foi roubado fica protegido um tempo
export const CHANCE_ASSALTO = 0.4;
export const MINIMO_VITIMA = 100;
export const MINIMO_LADRAO = 50;

export type Assalto =
  | { ok: false; motivo: 'espera' | 'protegido'; ate: number }
  | { ok: false; motivo: 'vitima-pobre' | 'ladrao-pobre' }
  | { ok: true; sucesso: true; valor: number }
  | { ok: true; sucesso: false; multa: number };

export function assaltar(
  ladrao: { moedas: number; ultimoAssalto: number },
  vitima: { moedas: number; protegidoAte: number },
  agora: number,
  r: Sorteio = Math.random,
): Assalto {
  if (ladrao.ultimoAssalto && agora - ladrao.ultimoAssalto < ESPERA_ASSALTO) return { ok: false, motivo: 'espera', ate: ladrao.ultimoAssalto + ESPERA_ASSALTO };
  if (vitima.protegidoAte > agora) return { ok: false, motivo: 'protegido', ate: vitima.protegidoAte };
  if (vitima.moedas < MINIMO_VITIMA) return { ok: false, motivo: 'vitima-pobre' };
  if (ladrao.moedas < MINIMO_LADRAO) return { ok: false, motivo: 'ladrao-pobre' };
  if (r() < CHANCE_ASSALTO) {
    // Leva de 10% a 25% da carteira da vítima, no máximo 500.
    return { ok: true, sucesso: true, valor: Math.min(500, Math.floor((vitima.moedas * entre(10, 25, r)) / 100)) };
  }
  // Pego: paga multa de 20% da própria carteira (entre 30 e 300) para a vítima.
  return { ok: true, sucesso: false, multa: Math.min(ladrao.moedas, Math.max(30, Math.min(300, Math.floor(ladrao.moedas * 0.2)))) };
}

export const FRASES_ASSALTO = {
  sucesso: [
    'entrou pela janela da taverna e saiu com a bolsa de',
    'distraiu com uma conversa sobre tier list e bateu a carteira de',
    'se disfarçou de bardo e afanou as moedas de',
    'usou um pergaminho de invisibilidade e limpou o bolso de',
  ],
  falha: [
    'tropeçou no próprio manto tentando roubar',
    'foi pego pelo taverneiro com a mão no bolso de',
    'tentou roubar, mas pisou no rabo do gato de',
    'errou o teste de Furtividade (tirou 1) contra',
  ],
} as const;
