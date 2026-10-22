// Regras dos subgrupos que não dependem do Discord (validação de nome, emoji e nome de canal).

export const MAX_GRUPOS_POR_DONO = 2;
export const TAMANHO_NOME = { min: 2, max: 32 };
export const EMOJI_PADRAO = '👥';

/** Devolve o motivo do problema, ou undefined se o nome serve. */
export function problemaNoNome(nome: string): string | undefined {
  const n = nome.trim();
  if (n.length < TAMANHO_NOME.min || n.length > TAMANHO_NOME.max) return `O nome precisa ter de ${TAMANHO_NOME.min} a ${TAMANHO_NOME.max} caracteres.`;
  if (/discord\.(gg|com\/invite)|https?:\/\//i.test(n)) return 'Nada de links no nome.';
  if (/[@#`*_~|<>]/.test(n)) return 'Use só letras, números, espaços e emojis (sem @, #, *, _, ~, |, < ou >).';
  return undefined;
}

/** Aceita só um emoji (com variações de pele, bandeiras etc.); qualquer outra coisa vira o padrão. */
export function emojiValido(texto: string | null | undefined): string {
  const t = (texto ?? '').trim();
  if (!t) return EMOJI_PADRAO;
  const segmentos = [...new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }).segment(t)];
  if (segmentos.length !== 1) return EMOJI_PADRAO;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(t) ? t : EMOJI_PADRAO;
}

/** Nome de canal de texto: minúsculas, sem acento, com hífens (como o Discord exige). */
export function slugCanal(nome: string): string {
  const s = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || 'grupo';
}

export const nomeCargoGrupo = (emoji: string, nome: string) => `${emoji} ${nome}`;
export const nomeCategoriaGrupo = (emoji: string, nome: string) => `${emoji} ${nome}`.toUpperCase();
export const nomeTextoGrupo = (nome: string) => `💬・${slugCanal(nome)}`;
export const nomeVozGrupo = (emoji: string, nome: string) => `${emoji} ${nome}`;
