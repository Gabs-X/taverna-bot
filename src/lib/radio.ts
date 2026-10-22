// Regras do /radio que não dependem do Discord: identificar música repetida e descartar o que não é música.

type Sorteio = () => number;
export type Candidata = { title: string; author: string; durationMS: number };

export const TAMANHO_HISTORICO = 30;

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * "Numb (Official Video) [4K] – Linkin Park", "Linkin Park - Numb" e "NUMB (Lyrics)" viram a mesma chave: "numb".
 * O nome do artista sai da chave quando aparece no título.
 */
export function chaveMusica(titulo: string, autor = ''): string {
  const limpo = normalizar(titulo)
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ') // tudo entre parênteses/colchetes
    .replace(/\b(official|oficial|music|video|clipe|lyrics?|letra|legendado|audio|hd|4k|remaster(ed)?|visualizer|single album version|album version)\b/g, ' ')
    .replace(/\b(ft\.?|feat\.?)\s.*$/g, ' ');
  // Canal "EvanescenceVEVO" ou "Linkin Park - Topic" → "evanescence", "linkinpark" (comparado sem espaços).
  const artista = normalizar(autor).replace(/\s*-\s*topic$/, '').replace(/vevo$/, '').replace(/[^a-z0-9]/g, '');
  const soLetras = (s: string) => s.replace(/[^a-z0-9]/g, '');
  // "Artista - Música" ou "Música - Artista": tira o pedaço que é o artista.
  let partes = limpo.split(/\s[-–—|]\s/).map((p) => p.trim()).filter(Boolean);
  if (partes.length > 1 && artista) {
    const semArtista = partes.filter((p) => !(soLetras(p).includes(artista) || (soLetras(p).length >= 4 && artista.includes(soLetras(p)))));
    if (semArtista.length) partes = semArtista;
  }
  // Ainda sobrou "Artista - Música" com artista diferente do canal (ex.: parceria): fica com o último pedaço.
  const chave = (partes.length > 1 ? partes[partes.length - 1] : partes[0] ?? '').replace(/[^a-z0-9]+/g, ' ').trim();
  return chave || normalizar(titulo).replace(/[^a-z0-9]+/g, ' ').trim();
}

const PALAVRAS_RUINS = /\b(full album|album completo|react|reagindo|podcast|entrevista|interview|1 hour|10 hours|1 hora|10 horas|compilation|compilado|playlist|tutorial)\b/i;

/** Descarta vídeos curtos demais (shorts), longos demais (álbum, live inteira) e com cara de não ser música. */
export const pareceMusica = (c: Candidata) => c.durationMS >= 60_000 && c.durationMS <= 10 * 60_000 && !PALAVRAS_RUINS.test(c.title);

/** A próxima do rádio: entre as 5 primeiras candidatas boas e inéditas, uma sorteada (para variar). */
export function escolherProxima<T extends Candidata>(candidatas: readonly T[], historico: readonly string[], r: Sorteio = Math.random): T | undefined {
  const tocadas = new Set(historico);
  const vistas = new Set<string>();
  const boas = candidatas.filter((c) => {
    const k = chaveMusica(c.title, c.author);
    if (!k || tocadas.has(k) || vistas.has(k) || !pareceMusica(c)) return false;
    vistas.add(k);
    return true;
  });
  const topo = boas.slice(0, 5);
  return topo[Math.floor(r() * topo.length)];
}

export function lembrar(historico: readonly string[], titulo: string, autor = '') {
  const k = chaveMusica(titulo, autor);
  return [...historico.filter((h) => h !== k), k].slice(-TAMANHO_HISTORICO);
}
