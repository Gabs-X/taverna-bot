// Regressão da página do mapa: erros que só apareceriam no navegador (e travariam a página de todo mundo).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Script } from 'node:vm';
import { arquivosDaPagina, codigoDaPagina, montarPagina } from './paginaMapa.ts';

const pagina = montarPagina();
const codigo = codigoDaPagina();
const html = pagina.slice(0, pagina.indexOf('<script>'));

test('a página monta com o estilo e todos os arquivos de código, na ordem', () => {
  assert.ok(arquivosDaPagina().length >= 10);
  assert.ok(!pagina.includes('/*__ESTILO__*/') && !pagina.includes('//__SCRIPT__'));
  for (const n of arquivosDaPagina()) assert.ok(pagina.includes(`// ===== ${n} =====`), n);
});

test('o código da página não tem erro de sintaxe', () => {
  assert.doesNotThrow(() => new Script(codigo, { filename: 'mapa.js' }));
});

test('nenhum nome declarado duas vezes (trava a página inteira, como já aconteceu com o centroDaTela)', () => {
  const vistos = new Map<string, number>();
  for (const m of codigo.matchAll(/^(?:const|let|var|function|async function|class) ([A-Za-z_$][\w$]*)/gm)) vistos.set(m[1], (vistos.get(m[1]) ?? 0) + 1);
  assert.deepEqual([...vistos].filter(([, n]) => n > 1), []);
});

test("todo $('id') do código existe no HTML (ou é criado pelo próprio código)", () => {
  const noHtml = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
  const criados = new Set([...codigo.matchAll(/\.id = '([\w-]+)'/g)].map((m) => m[1]));
  const usados = new Set([...codigo.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]));
  const faltam = [...usados].filter((id) => !noHtml.has(id) && !criados.has(id));
  assert.deepEqual(faltam, []);
});

test('cada ícone da barra aponta para gavetas que existem, e cada ✕ fecha uma janela que existe', () => {
  const noHtml = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
  const dock = codigo.slice(codigo.indexOf('const DOCK = ['), codigo.indexOf('];', codigo.indexOf('const DOCK = [')));
  const secoes = [...dock.matchAll(/'(painel-[\w-]+)'/g)].map((m) => m[1]);
  assert.ok(secoes.length >= 10);
  assert.deepEqual(secoes.filter((id) => !noHtml.has(id)), []);
  const fecha = [...html.matchAll(/data-fecha="([\w-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(fecha.filter((id) => !noHtml.has(id)), []);
});
