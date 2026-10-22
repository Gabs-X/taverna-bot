import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assaltar, ESPERA_ASSALTO, resolverDesafio } from './apostas.ts';

const seq = (...v: number[]) => () => v.shift() ?? 0;

test('desafio na moeda: cara é de quem desafiou', () => {
  assert.equal(resolverDesafio('moeda', () => 0.1).venceu, 'a');
  assert.equal(resolverDesafio('moeda', () => 0.9).venceu, 'b');
});

test('desafio no dado: empate rola de novo', () => {
  const r = resolverDesafio('dado', seq(0.5, 0.5, 0.9, 0.1));
  assert.equal(r.venceu, 'a');
  assert.equal(r.rolagens?.length, 2);
});

test('assalto: espera, proteção, carteiras mínimas, sucesso e multa', () => {
  const agora = 100 * ESPERA_ASSALTO;
  const ladrao = { moedas: 1000, ultimoAssalto: 0 };
  const vitima = { moedas: 1000, protegidoAte: 0 };
  assert.equal(assaltar({ ...ladrao, ultimoAssalto: agora - 1000 }, vitima, agora).ok, false);
  assert.deepEqual(assaltar(ladrao, { ...vitima, protegidoAte: agora + 5 }, agora), { ok: false, motivo: 'protegido', ate: agora + 5 });
  assert.deepEqual(assaltar(ladrao, { ...vitima, moedas: 50 }, agora), { ok: false, motivo: 'vitima-pobre' });
  assert.deepEqual(assaltar({ ...ladrao, moedas: 10 }, vitima, agora), { ok: false, motivo: 'ladrao-pobre' });
  assert.deepEqual(assaltar(ladrao, { ...vitima, moedas: 10_000 }, agora, () => 0), { ok: true, sucesso: true, valor: 500 });
  assert.deepEqual(assaltar(ladrao, vitima, agora, () => 0.9), { ok: true, sucesso: false, multa: 200 });
  assert.deepEqual(assaltar({ ...ladrao, moedas: 60 }, vitima, agora, () => 0.9), { ok: true, sucesso: false, multa: 30 });
});
