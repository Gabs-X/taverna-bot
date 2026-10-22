// Semana do resumo (segunda a domingo, no horário de Brasília) e quando o resumo sai (domingo, a partir das 20h).

const FUSO = 'America/Sao_Paulo';

/** Data e hora "de parede" em Brasília. */
function emBrasilia(ms: number) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return { ano: Number(partes.year), mes: Number(partes.month), dia: Number(partes.day), hora: Number(partes.hour), diaSemana: partes.weekday as string };
}

/** Semana ISO ("2026-W43"): começa na segunda. */
export function semanaDe(ms: number) {
  const { ano, mes, dia } = emBrasilia(ms);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  const diaIso = d.getUTCDay() || 7; // domingo = 7
  d.setUTCDate(d.getUTCDate() + 4 - diaIso); // quinta da mesma semana decide o ano
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const numero = Math.ceil(((d.getTime() - inicioAno.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(numero).padStart(2, '0')}`;
}

/** Domingo, a partir das 20h de Brasília. */
export const horaDoResumo = (ms: number) => {
  const b = emBrasilia(ms);
  return b.diaSemana === 'Sun' && b.hora >= 20;
};

export type Linha = { user_id: string; valor: number };
/** Top N de um contador, sem zeros. */
export const topo = (linhas: readonly Linha[], n = 3) => [...linhas].filter((l) => l.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, n);
