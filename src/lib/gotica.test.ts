import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aplicarAcao, desenharGotica, ESPERA_ACAO, humorDe, sortearAparencia, statusAgora, xpParaProximo, type Estado } from './gotica.ts';

const HORA = 3_600_000;
const base = (extra: Partial<Estado> = {}): Estado => ({ nivel: 1, xp: 0, barriga: 70, humor: 70, energia: 80, atualizadoEm: 0, ultimas: {}, ...extra });

test('status caem com o tempo e nunca ficam negativos', () => {
  assert.deepEqual(statusAgora(base(), 10 * HORA), { barriga: 30, humor: 40, energia: 60 });
  assert.deepEqual(statusAgora(base(), 100 * HORA), { barriga: 0, humor: 0, energia: 0 });
});

test('humor: triste quando algum status está muito baixo', () => {
  assert.equal(humorDe({ barriga: 80, humor: 80, energia: 80 }), 'feliz');
  assert.equal(humorDe({ barriga: 80, humor: 45, energia: 80 }), 'neutra');
  assert.equal(humorDe({ barriga: 10, humor: 90, energia: 80 }), 'triste');
});

test('ação dá XP, sobe de nível e respeita a espera', () => {
  const r = aplicarAcao(base({ xp: 45 }), 'passear', 0, () => 0);
  assert.ok(r.ok);
  assert.equal(r.estado.nivel, 2);
  assert.equal(r.estado.xp, 45 + 20 - xpParaProximo(1));
  assert.deepEqual(r.subiu, [2]);

  const repetida = aplicarAcao(r.estado, 'passear', ESPERA_ACAO - 1);
  assert.equal(repetida.ok, false);
  assert.equal(aplicarAcao(r.estado, 'conversar', 1).ok, true);
});

test('cansada não passeia; triste ganha metade do XP', () => {
  assert.equal(aplicarAcao(base({ energia: 10 }), 'passear', 0).ok, false);
  const r = aplicarAcao(base({ barriga: 5 }), 'conversar', 0);
  assert.ok(r.ok);
  assert.equal(r.xpGanho, 6);
});

test('desenho gera SVG válido para qualquer aparência', () => {
  for (let k = 0; k < 20; k++) {
    const svg = desenharGotica(sortearAparencia(), 1 + k, k % 2 ? 'feliz' : 'triste');
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
    assert.doesNotMatch(svg, /undefined|NaN/);
  }
});
