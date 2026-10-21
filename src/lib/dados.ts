// Rolagem de dados: "1d20+5", "2d20kh1", "4d6kh3", "3d8-1+1d4", "d20".
// kh = mantém os maiores · kl = mantém os menores.

export type Termo =
  | { tipo: 'dado'; sinal: 1 | -1; qtd: number; faces: number; manter?: { modo: 'kh' | 'kl'; qtd: number } }
  | { tipo: 'fixo'; sinal: 1 | -1; valor: number };

export type ResultadoTermo = { termo: Termo; rolagens: number[]; mantidos: number[]; subtotal: number };

export type Resultado = {
  expressao: string;
  total: number;
  termos: ResultadoTermo[];
  // Preenchido quando a rolagem tem exatamente um d20 mantido (crítico e falha crítica).
  d20?: number;
};

export const MAX_DADOS = 100;
export const MAX_FACES = 1000;

const TERMO = /^(\d*)d(\d+)(?:(kh|kl)(\d+))?$|^(\d+)$/;

export function interpretar(expressao: string): Termo[] {
  const limpa = expressao.toLowerCase().replace(/\s+/g, '');
  if (!limpa) throw new Error('Expressão vazia.');

  const partes = limpa.match(/[+-]?[^+-]+/g);
  if (!partes || partes.join('') !== limpa) throw new Error(`Não entendi "${expressao}".`);

  return partes.map((parte) => {
    const sinal = parte.startsWith('-') ? -1 : 1;
    const corpo = parte.replace(/^[+-]/, '');
    const m = TERMO.exec(corpo);
    if (!m) throw new Error(`Não entendi "${corpo}". Use algo como 1d20+5 ou 4d6kh3.`);

    if (m[5] !== undefined) return { tipo: 'fixo', sinal, valor: Number(m[5]) };

    const qtd = m[1] ? Number(m[1]) : 1;
    const faces = Number(m[2]);
    if (qtd < 1 || qtd > MAX_DADOS) throw new Error(`Role entre 1 e ${MAX_DADOS} dados por vez.`);
    if (faces < 2 || faces > MAX_FACES) throw new Error(`O dado precisa ter entre 2 e ${MAX_FACES} faces.`);

    const termo: Termo = { tipo: 'dado', sinal, qtd, faces };
    if (m[3]) {
      const manter = Number(m[4]);
      if (manter < 1 || manter > qtd) throw new Error(`Não dá para manter ${manter} de ${qtd} dados.`);
      termo.manter = { modo: m[3] as 'kh' | 'kl', qtd: manter };
    }
    return termo;
  });
}

export type Aleatorio = (faces: number) => number;
const aleatorio: Aleatorio = (faces) => Math.floor(Math.random() * faces) + 1;

export function rolar(expressao: string, rng: Aleatorio = aleatorio): Resultado {
  const termos = interpretar(expressao).map((termo): ResultadoTermo => {
    if (termo.tipo === 'fixo') return { termo, rolagens: [], mantidos: [], subtotal: termo.sinal * termo.valor };

    const rolagens = Array.from({ length: termo.qtd }, () => rng(termo.faces));
    let mantidos = rolagens;
    if (termo.manter) {
      const ordenados = [...rolagens].sort((a, b) => (termo.manter!.modo === 'kh' ? b - a : a - b));
      mantidos = ordenados.slice(0, termo.manter.qtd);
    }
    const soma = mantidos.reduce((a, b) => a + b, 0);
    return { termo, rolagens, mantidos, subtotal: termo.sinal * soma };
  });

  const d20s = termos.filter((t) => t.termo.tipo === 'dado' && t.termo.faces === 20);
  const d20 = d20s.length === 1 && d20s[0].mantidos.length === 1 ? d20s[0].mantidos[0] : undefined;

  return { expressao, total: termos.reduce((a, t) => a + t.subtotal, 0), termos, d20 };
}

export function formatar(r: Resultado): string {
  const partes = r.termos.map((t, i) => {
    const sinal = i === 0 ? (t.termo.sinal < 0 ? '-' : '') : t.termo.sinal < 0 ? ' - ' : ' + ';
    if (t.termo.tipo === 'fixo') return `${sinal}${t.termo.valor}`;

    const restantes = [...t.mantidos];
    const dados = t.rolagens.map((v) => {
      const idx = restantes.indexOf(v);
      if (idx >= 0) {
        restantes.splice(idx, 1);
        return t.termo.tipo === 'dado' && (v === t.termo.faces || v === 1) ? `**${v}**` : `${v}`;
      }
      return `~~${v}~~`;
    });
    return `${sinal}[${dados.join(', ')}]`;
  });
  return partes.join('');
}

export const comSinal = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
