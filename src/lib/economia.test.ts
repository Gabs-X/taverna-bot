import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularDaily, ESPERA_DAILY, PERDE_SEQUENCIA, somarXp, trabalhar, xpDoNivel } from './economia.ts';
import { semEmoji } from './cartaoRank.ts';

test('XP sobe vários níveis de uma vez e guarda a sobra', () => {
  assert.equal(xpDoNivel(0), 100);
  const r = somarXp(0, 0, 100 + 155 + 10);
  assert.deepEqual(r, { nivel: 2, xp: 10, subiu: [1, 2] });
});

test('daily: espera, sequência e perda da sequência', () => {
  const primeiro = calcularDaily(0, 0, 1_000);
  assert.ok(primeiro.ok && primeiro.moedas === 100 && primeiro.sequencia === 1);
  assert.equal(calcularDaily(1_000, 1, 1_000 + ESPERA_DAILY - 1).ok, false);
  const segundo = calcularDaily(1_000, 1, 1_000 + ESPERA_DAILY);
  assert.ok(segundo.ok && segundo.moedas === 110 && segundo.sequencia === 2);
  const perdeu = calcularDaily(1_000, 5, 1_000 + PERDE_SEQUENCIA + 1);
  assert.ok(perdeu.ok && perdeu.sequencia === 1 && perdeu.perdeuSequencia);
  const teto = calcularDaily(1_000, 30, 1_000 + ESPERA_DAILY);
  assert.ok(teto.ok && teto.moedas === 200);
});

test('trabalhar respeita a hora de descanso e paga dentro da faixa', () => {
  assert.equal(trabalhar(1_000, 2_000).ok, false);
  const r = trabalhar(0, 2_000, () => 0);
  assert.ok(r.ok && r.moedas === 30);
});

test('nome do cartão sem emoji', () => {
  assert.equal(semEmoji('🍺 Gabs Maluco 🎲'), 'Gabs Maluco');
});
