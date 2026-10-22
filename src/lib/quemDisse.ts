// "Quem disse?": a citação salva e as alternativas de quem falou. Puro, para dar para testar.
import { embaralhar } from './quiz.ts';

type Sorteio = () => number;

/** Quem disse + até 3 erradas: primeiro outros autores de citações (mais difícil), depois membros quaisquer. */
export function opcoesQuemDisse(certo: string, outrosAutores: readonly string[], membros: readonly string[], r: Sorteio = Math.random): string[] {
  const erradas = embaralhar(outrosAutores.filter((a) => a !== certo), r).slice(0, 3);
  for (const m of embaralhar(membros, r)) {
    if (erradas.length >= 3) break;
    if (m !== certo && !erradas.includes(m)) erradas.push(m);
  }
  return embaralhar([certo, ...erradas], r);
}
