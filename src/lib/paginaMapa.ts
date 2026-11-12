// Monta a página do mapa a partir das partes: o esqueleto (src/mapa/pagina.html), o estilo (estilo.css) e o código
// (src/mapa/js/*.js, na ordem do número no nome). O navegador recebe uma página só, com um <script> só: assim as
// funções de um arquivo continuam valendo nos outros, como quando era tudo um arquivo.
import { readdirSync, readFileSync } from 'node:fs';

const PASTA = new URL('../mapa/', import.meta.url);

/** Os arquivos de código da página, na ordem em que entram. */
export const arquivosDaPagina = () => readdirSync(new URL('js/', PASTA)).filter((n) => /^\d\d-[\w-]+\.js$/.test(n)).sort();

/** Só o código, junto (para os testes conferirem). */
export const codigoDaPagina = () =>
  arquivosDaPagina().map((n) => `// ===== ${n} =====\n${readFileSync(new URL(`js/${n}`, PASTA), 'utf8')}`).join('\n');

export function montarPagina() {
  const html = readFileSync(new URL('pagina.html', PASTA), 'utf8');
  const css = readFileSync(new URL('estilo.css', PASTA), 'utf8');
  if (!html.includes('/*__ESTILO__*/') || !html.includes('//__SCRIPT__')) throw new Error('pagina.html sem os marcadores do estilo e do script');
  // Funções no replace: o código tem "$" que não pode virar padrão de substituição.
  return html.replace('/*__ESTILO__*/', () => css).replace('//__SCRIPT__', () => codigoDaPagina());
}
