// Ajudantes puros do quiz de campeões (testáveis sem Discord nem internet).

type Sorteio = () => number;

/** Descrições do Data Dragon vêm com tags (<br>, <magicDamage>...): fica só o texto. */
export const limparHtml = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Troca o nome do campeão (e partes dele, como "Miss" de "Miss Fortune") por ???. */
export function esconderNome(texto: string, nome: string) {
  const partes = [nome, ...nome.split(/[\s']+/).filter((p) => p.length >= 4)];
  return partes.reduce((t, p) => t.replace(new RegExp(`\\b${escaparRegex(p)}\\b`, 'gi'), '???'), texto);
}

export function embaralhar<T>(lista: readonly T[], r: Sorteio = Math.random): T[] {
  const copia = [...lista];
  for (let k = copia.length - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    [copia[k], copia[j]] = [copia[j], copia[k]];
  }
  return copia;
}

/** A resposta certa mais 3 erradas, em ordem aleatória. */
export function alternativas<T extends { id: string }>(todos: readonly T[], certa: T, r: Sorteio = Math.random): T[] {
  const erradas = embaralhar(todos.filter((c) => c.id !== certa.id), r).slice(0, 3);
  return embaralhar([certa, ...erradas], r);
}

/** Recorte da splash (1215×717) com zoom, num ponto aleatório perto do centro (onde costuma estar o campeão). */
export function recorte(r: Sorteio = Math.random, zoom = 2) {
  const L = 1215;
  const A = 717;
  const lado = 512 / zoom; // pedaço da imagem original que aparece
  const cx = L * (0.3 + r() * 0.4);
  const cy = A * (0.25 + r() * 0.4);
  const x = Math.max(0, Math.min(L - lado, cx - lado / 2));
  const y = Math.max(0, Math.min(A - lado, cy - lado / 2));
  return { x: -x * zoom, y: -y * zoom, largura: L * zoom, altura: A * zoom };
}

export function svgRecorte(dataUri: string, r: Sorteio = Math.random) {
  const c = recorte(r);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <image href="${dataUri}" x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="${c.largura.toFixed(1)}" height="${c.altura.toFixed(1)}" preserveAspectRatio="none"/>
  <rect x="2" y="2" width="508" height="508" fill="none" stroke="#f5b544" stroke-width="4" rx="10"/>
</svg>`;
}
