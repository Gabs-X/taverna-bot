// Palavra do dia (estilo Wordle): 5 letras, 6 tentativas, a mesma palavra para todo mundo no dia.

export const TENTATIVAS = 6;
export const TAMANHO = 5;

// Palavras de 5 letras comuns em português (sem acento no jogo; o acento é ignorado nos chutes).
export const PALAVRAS = [
  'amigo', 'abrir', 'acaso', 'achar', 'agora', 'aguia', 'alado', 'algoz', 'altar', 'amora', 'anjos', 'antes', 'apito', 'arena', 'arroz',
  'astro', 'atlas', 'aviao', 'banco', 'barco', 'beijo', 'bicho', 'bolsa', 'bruxa', 'cabra', 'caixa', 'calma',
  'campo', 'canto', 'carne', 'carta', 'casco', 'causa', 'cerca', 'chave', 'chuva', 'cinto', 'circo', 'cisne', 'cobra', 'coisa', 'corpo',
  'corvo', 'couro', 'crime', 'cruel', 'dados', 'dente', 'disco', 'doces', 'drama', 'duelo', 'elfos', 'feira', 'festa', 'filme', 'firme',
  'fogao', 'folha', 'fruta', 'fumar', 'gaita', 'garfo', 'gelos', 'gente', 'golpe', 'gordo', 'grama', 'grito', 'grupo', 'guiar', 'hotel',
  'idade', 'ideia', 'jogar', 'jovem', 'juizo', 'lapis', 'largo', 'leite', 'lenda', 'lento', 'limao', 'linha', 'livro', 'lobos', 'longe',
  'lugar', 'magia', 'manha', 'mapas', 'marca', 'massa', 'medos', 'melao', 'mesas', 'metal', 'milho', 'mitos', 'moeda', 'monge', 'morte',
  'mundo', 'museu', 'nadar', 'navio', 'noite', 'nuvem', 'olhar', 'ordem', 'ossos', 'ouvir', 'padre', 'palco', 'papel', 'pardo', 'parte',
  'pedra', 'peixe', 'perto', 'piano', 'pilha', 'plano', 'poder', 'ponte', 'porta', 'pouco', 'praia', 'prato',
  'prova', 'pulga', 'quero', 'radio', 'raiva', 'reino', 'risco', 'rocha', 'roupa', 'sabao', 'salto', 'santo', 'selva', 'sinal', 'sonho',
  'sorte', 'susto', 'tarde', 'tempo', 'tenda', 'terra', 'tigre', 'times', 'torre', 'trigo', 'troca', 'trono', 'turma', 'vapor', 'velha',
  'vento', 'verde', 'vidro', 'vinho', 'viola', 'visao', 'zebra',
].filter((p) => p.length === TAMANHO);

export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/** Dia no fuso de Brasília (a palavra troca à meia-noite daqui). */
export const diaDe = (ms: number) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/** Mesma palavra para o mesmo dia, sorteada de forma fixa pela data. */
export function palavraDoDia(dia: string) {
  let h = 0;
  for (const ch of `taverna:${dia}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALAVRAS[h % PALAVRAS.length];
}

export type Cor = 'certo' | 'lugar' | 'errado';
/** Avalia o chute como no Wordle (letras repetidas contam só quantas vezes existem na palavra). */
export function avaliar(chute: string, alvo: string): Cor[] {
  const cores: Cor[] = Array(TAMANHO).fill('errado');
  const sobra = new Map<string, number>();
  for (let k = 0; k < TAMANHO; k++) {
    if (chute[k] === alvo[k]) cores[k] = 'certo';
    else sobra.set(alvo[k], (sobra.get(alvo[k]) ?? 0) + 1);
  }
  for (let k = 0; k < TAMANHO; k++) {
    if (cores[k] === 'certo') continue;
    const n = sobra.get(chute[k]) ?? 0;
    if (n > 0) {
      cores[k] = 'lugar';
      sobra.set(chute[k], n - 1);
    }
  }
  return cores;
}

const QUADRADO: Record<Cor, string> = { certo: '🟩', lugar: '🟨', errado: '⬛' };
export const quadrados = (cores: Cor[]) => cores.map((c) => QUADRADO[c]).join('');

/** Moedas por acertar: mais cedo, mais moedas. */
export const premioPalavra = (tentativas: number) => Math.max(30, 180 - 30 * (tentativas - 1));
