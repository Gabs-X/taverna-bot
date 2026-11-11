// Névoa de guerra: uma casa da grade por bit (1 = revelada), guardada em base64. Um mapa de 1500 × 1000 com casas
// de 50 px dá 600 casas = 75 bytes, então o estado da página continua leve mesmo atualizando a cada poucos segundos.

export const MAX_CASAS_NEVOA = 250_000;

export const dimensoesNevoa = (largura: number, altura: number, grade: number) => ({
  cols: Math.max(1, Math.ceil(largura / grade)),
  rows: Math.max(1, Math.ceil(altura / grade)),
});

/** Lê a névoa salva. Se o tamanho não bate (mapa ou grade mudaram), começa tudo coberto. */
export function lerNevoa(texto: string | null | undefined, cols: number, rows: number) {
  const bytes = Math.ceil((cols * rows) / 8);
  const salvo = texto ? Buffer.from(texto, 'base64') : null;
  return salvo && salvo.length === bytes ? new Uint8Array(salvo) : new Uint8Array(bytes);
}

export const gravarNevoa = (bits: Uint8Array) => Buffer.from(bits).toString('base64');

export const casaRevelada = (bits: Uint8Array, cols: number, col: number, row: number) => {
  const i = row * cols + col;
  return ((bits[i >> 3] ?? 0) & (1 << (i & 7))) !== 0;
};

/** Revela ou cobre um retângulo de casas (as pontas podem vir em qualquer ordem e fora do mapa). */
export function pintarNevoa(bits: Uint8Array, cols: number, rows: number, a: [number, number], b: [number, number], revelar: boolean) {
  const lim = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.floor(v)));
  const [c0, c1] = [lim(Math.min(a[0], b[0]), cols), lim(Math.max(a[0], b[0]), cols)];
  const [r0, r1] = [lim(Math.min(a[1], b[1]), rows), lim(Math.max(a[1], b[1]), rows)];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * cols + c;
      if (revelar) bits[i >> 3] |= 1 << (i & 7);
      else bits[i >> 3] &= ~(1 << (i & 7));
    }
  }
  return bits;
}

/** Todas as casas reveladas (ou todas cobertas). */
export function nevoaToda(cols: number, rows: number, revelar: boolean) {
  const bits = new Uint8Array(Math.ceil((cols * rows) / 8));
  return revelar ? pintarNevoa(bits, cols, rows, [0, 0], [cols - 1, rows - 1], true) : bits;
}

/** A peça está debaixo da névoa? (vale a casa do centro dela) */
export function pecaNaNevoa(bits: Uint8Array, cols: number, rows: number, grade: number, x: number, y: number) {
  const col = Math.max(0, Math.min(cols - 1, Math.floor(x / grade)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor(y / grade)));
  return !casaRevelada(bits, cols, col, row);
}

/** Revela as casas num raio (em casas) em volta de uma casa: a visão do personagem andando com a névoa ligada. */
export function revelarRaio(bits: Uint8Array, cols: number, rows: number, col: number, row: number, raio: number) {
  let mudou = false;
  const r = Math.ceil(raio);
  for (let dr = -r; dr <= r; dr++) {
    for (let dc = -r; dc <= r; dc++) {
      const c = col + dc, l = row + dr;
      if (c < 0 || l < 0 || c >= cols || l >= rows || Math.hypot(dc, dr) > raio + 0.35) continue;
      const i = l * cols + c;
      if (!(bits[i >> 3] & (1 << (i & 7)))) { bits[i >> 3] |= 1 << (i & 7); mudou = true; }
    }
  }
  return mudou;
}
