import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CORES, DURACAO_XP_DOBRO, ITENS_TAVERNA, novoFimDoDobro, xpComBonus } from './lojaTaverna.ts';

test('XP em dobro só vale enquanto não acabou', () => {
  assert.equal(xpComBonus(20, 2_000, 1_000), 40);
  assert.equal(xpComBonus(20, 1_000, 1_000), 20);
  assert.equal(xpComBonus(20, 0, 1_000), 20);
});

test('comprar o dobro de novo soma 24 h ao fim atual', () => {
  assert.equal(novoFimDoDobro(0, 1_000), 1_000 + DURACAO_XP_DOBRO);
  assert.equal(novoFimDoDobro(5_000, 1_000), 5_000 + DURACAO_XP_DOBRO);
});

test('catálogo: toda cor é item e os ids não se repetem', () => {
  assert.equal(new Set(ITENS_TAVERNA.map((i) => i.id)).size, ITENS_TAVERNA.length);
  for (const c of CORES) assert.ok(ITENS_TAVERNA.some((i) => i.id === c.id));
});
