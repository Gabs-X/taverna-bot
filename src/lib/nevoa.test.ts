import assert from 'node:assert/strict';
import { test } from 'node:test';
import { casaRevelada, dimensoesNevoa, gravarNevoa, lerNevoa, nevoaToda, pecaNaNevoa, pintarNevoa } from './nevoa.ts';

test('dimensões: casas inteiras cobrindo o mapa todo', () => {
  assert.deepEqual(dimensoesNevoa(1500, 1000, 50), { cols: 30, rows: 20 });
  assert.deepEqual(dimensoesNevoa(1520, 1000, 50), { cols: 31, rows: 20 });
});

test('começa coberta, revela um retângulo e volta a cobrir parte', () => {
  const { cols, rows } = dimensoesNevoa(500, 500, 50);
  const bits = lerNevoa(null, cols, rows);
  assert.equal(casaRevelada(bits, cols, 2, 2), false);
  pintarNevoa(bits, cols, rows, [4, 3], [1, 1], true); // pontas fora de ordem
  assert.equal(casaRevelada(bits, cols, 1, 1), true);
  assert.equal(casaRevelada(bits, cols, 4, 3), true);
  assert.equal(casaRevelada(bits, cols, 5, 3), false);
  pintarNevoa(bits, cols, rows, [2, 2], [2, 2], false);
  assert.equal(casaRevelada(bits, cols, 2, 2), false);
  assert.equal(casaRevelada(bits, cols, 3, 2), true);
});

test('guarda e lê de volta; tamanho diferente recomeça coberta', () => {
  const bits = pintarNevoa(lerNevoa(null, 10, 10), 10, 10, [0, 0], [9, 0], true);
  const texto = gravarNevoa(bits);
  assert.equal(casaRevelada(lerNevoa(texto, 10, 10), 10, 9, 0), true);
  assert.equal(casaRevelada(lerNevoa(texto, 20, 10), 20, 9, 0), false);
});

test('retângulo fora do mapa é cortado na borda', () => {
  const bits = pintarNevoa(lerNevoa(null, 4, 4), 4, 4, [-5, -5], [99, 1], true);
  assert.equal(casaRevelada(bits, 4, 3, 1), true);
  assert.equal(casaRevelada(bits, 4, 0, 2), false);
});

test('tudo revelado, tudo coberto e peça na névoa', () => {
  const tudo = nevoaToda(30, 20, true);
  assert.equal(casaRevelada(tudo, 30, 29, 19), true);
  const nada = nevoaToda(30, 20, false);
  assert.equal(pecaNaNevoa(nada, 30, 20, 50, 75, 75), true);
  pintarNevoa(nada, 30, 20, [1, 1], [1, 1], true);
  assert.equal(pecaNaNevoa(nada, 30, 20, 50, 75, 75), false);
  assert.equal(pecaNaNevoa(nada, 30, 20, 50, 125, 75), true);
});
