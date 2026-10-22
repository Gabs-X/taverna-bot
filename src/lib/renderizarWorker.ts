// Processo à parte que transforma SVG em PNG (usado por renderizar.ts), para não travar o bot.
import { Resvg } from '@resvg/resvg-js';
import { parentPort } from 'node:worker_threads';

type Pedido = { id: number; svg: string; fontes: boolean };

parentPort!.on('message', ({ id, svg, fontes }: Pedido) => {
  try {
    const opcoes = fontes ? { font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' } } : undefined;
    const png = new Resvg(svg, opcoes).render().asPng();
    parentPort!.postMessage({ id, png });
  } catch (erro) {
    parentPort!.postMessage({ id, erro: (erro as Error).message });
  }
});
