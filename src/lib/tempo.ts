// Datas e durações no horário de Brasília (sem horário de verão desde 2019, então UTC-3 fixo).
const OFFSET_MS = 3 * 3_600_000;

const UNIDADES = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

// "30m", "2h", "1h30m", "1d 12h" → milissegundos. Formato inválido → null.
export function interpretarDuracao(texto: string): number | null {
  const limpo = texto.toLowerCase().replace(/\s+/g, '');
  if (!/^(\d+[mhd])+$/.test(limpo)) return null;
  let total = 0;
  for (const [, n, u] of limpo.matchAll(/(\d+)([mhd])/g)) total += Number(n) * UNIDADES[u as keyof typeof UNIDADES];
  return total || null;
}

export function partesBrasilia(d: Date) {
  const b = new Date(d.getTime() - OFFSET_MS);
  return { dia: b.getUTCDate(), mes: b.getUTCMonth() + 1, ano: b.getUTCFullYear(), hora: b.getUTCHours() };
}

export const ehBissexto = (ano: number) => (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;

// Dia/mês existe? (29/02 vale, porque existe em ano bissexto.)
export function dataValida(dia: number, mes: number, ano = 2024) {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

// data "25/10" ou "25/10/2026", hora "20", "20h", "20:30" ou "20h30" → Date em Brasília.
// Sem ano, usa a próxima ocorrência a partir de agora.
export function interpretarDataHora(data: string, hora: string, agora = new Date()): Date | null {
  const d = data.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  const h = hora.trim().match(/^(\d{1,2})(?:[:h](\d{2})?)?$/i);
  if (!d || !h) return null;

  const [dia, mes] = [Number(d[1]), Number(d[2])];
  const [hh, mm] = [Number(h[1]), Number(h[2] ?? 0)];
  if (hh > 23 || mm > 59) return null;

  const montar = (ano: number) =>
    dataValida(dia, mes, ano) ? new Date(Date.UTC(ano, mes - 1, dia, hh, mm) + OFFSET_MS) : null;

  if (d[3]) return montar(d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3]));
  const ano = partesBrasilia(agora).ano;
  const esteAno = montar(ano);
  return esteAno && esteAno > agora ? esteAno : montar(ano + 1);
}

// Formatos de data que o próprio Discord mostra no fuso de quem lê.
export const tsRelativo = (ms: number) => `<t:${Math.floor(ms / 1000)}:R>`;
export const tsCompleto = (ms: number) => `<t:${Math.floor(ms / 1000)}:F>`;
