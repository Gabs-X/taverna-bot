import { pvPorDano } from './daggerheart.ts';
import type { ResultadoChat } from './mapa.ts';

// Combate no mapa: iniciativa (D&D) ou holofote (Daggerheart), condições das peças, vida mostrada aos jogadores
// e o ataque clicando no alvo (rola, compara com a defesa e desconta o dano).

export const CONDICOES = {
  caido: '🛌 Caído',
  envenenado: '🤢 Envenenado',
  atordoado: '💫 Atordoado',
  amedrontado: '😱 Amedrontado',
  contido: '⛓️ Contido',
  vulneravel: '🎯 Vulnerável',
  escondido: '🫥 Escondido',
  sangrando: '🩸 Sangrando',
  inspirado: '✨ Inspirado',
  concentrado: '🧠 Concentrado',
} as const;
export type Condicao = keyof typeof CONDICOES;
export const ehCondicao = (c: unknown): c is Condicao => typeof c === 'string' && Object.hasOwn(CONDICOES, c);

/** Liga ou desliga uma condição na lista guardada ("caido,envenenado"), sem repetir e na ordem da tabela. */
export function alternarCondicao(lista: string, condicao: Condicao, ligar: boolean) {
  const atuais = new Set(lista.split(',').filter(ehCondicao));
  if (ligar) atuais.add(condicao);
  else atuais.delete(condicao);
  return (Object.keys(CONDICOES) as Condicao[]).filter((c) => atuais.has(c)).join(',');
}

// ---------- Iniciativa ----------

export type NaOrdem = { id: number; iniciativa: number | null; nome: string };

/** Maior iniciativa primeiro; empate pelo nome. Quem ainda não tem iniciativa vai para o fim. */
export const ordenarIniciativa = <T extends NaOrdem>(pecas: T[]) =>
  [...pecas].sort((a, b) => (b.iniciativa ?? -Infinity) - (a.iniciativa ?? -Infinity) || a.nome.localeCompare(b.nome, 'pt-BR'));

/** Próximo da ordem; depois do último volta ao primeiro e começa outra rodada. */
export function proximoTurno(ordem: number[], vez: number | null, rodada: number) {
  if (!ordem.length) return { vez: null, rodada };
  const i = vez === null ? -1 : ordem.indexOf(vez);
  if (i === -1) return { vez: ordem[0], rodada: Math.max(1, rodada) };
  if (i + 1 >= ordem.length) return { vez: ordem[0], rodada: rodada + 1 };
  return { vez: ordem[i + 1], rodada };
}

// ---------- Vida ----------

/** O que os jogadores sabem da vida de um inimigo quando o mestre não mostra o número. */
export function estadoDaVida(restante: number, maximo: number) {
  if (restante <= 0) return 'Caído';
  const f = restante / maximo;
  if (f >= 1) return 'Ileso';
  if (f > 0.5) return 'Ferido';
  if (f > 0.25) return 'Muito ferido';
  return 'Quase morto';
}

// ---------- Ataque ----------

/** O d20 natural da rolagem (o mantido, se rolou com vantagem). */
export function d20Natural(r: ResultadoChat) {
  if (r.tipo !== 'dados') return null;
  const d = r.pedacos.find((p) => p.t === 'dado' && p.faces === 20 && p.mantido);
  return d && d.t === 'dado' ? d.v : null;
}

/**
 * Acertou? D&D: 20 natural sempre acerta (crítico), 1 natural sempre erra, senão total ≥ CA.
 * Daggerheart: sucesso crítico (dados iguais) sempre acerta, senão total ≥ Dificuldade/Evasão.
 * Sem defesa conhecida não dá para decidir: devolve null.
 */
export function resolverAtaque(r: ResultadoChat, defesa: number | null) {
  if (r.tipo === 'dualidade') {
    if (r.resultado === 'critico') return { acertou: true, critico: true };
    return defesa === null ? null : { acertou: r.total >= defesa, critico: false };
  }
  const nat = d20Natural(r);
  if (nat === 20) return { acertou: true, critico: true };
  if (nat === 1) return { acertou: false, critico: false };
  return defesa === null ? null : { acertou: r.total >= defesa, critico: false };
}

/**
 * Quanto o dano tira. D&D: os pontos de dano. Daggerheart: os espaços de PV pelos limiares
 * (sem limiares conhecidos, todo dano marca 1).
 */
export function perdaDeVida(sistema: 'dh' | 'dnd', dano: number, limiares?: { maior: number | null; grave: number | null }) {
  if (dano <= 0) return 0;
  if (sistema === 'dnd') return dano;
  if (limiares?.maior && limiares.grave) return pvPorDano(dano, limiares.maior, limiares.grave);
  return 1;
}
