import assert from 'node:assert/strict';
import { test } from 'node:test';
import { equipar, ITENS, lerEquipados } from './loja.ts';
import { desenharItem } from './goticaItens.ts';

test('equipar troca o item do mesmo encaixe e mantém os outros', () => {
  let eq = equipar({}, 'chapeu-bruxa');
  eq = equipar(eq, 'gato-preto');
  eq = equipar(eq, 'veu');
  assert.deepEqual(eq, { cabeca: 'veu', companheiro: 'gato-preto' });
});

test('lerEquipados ignora lixo e itens fora do encaixe', () => {
  assert.deepEqual(lerEquipados('{"cabeca":"veu","rosto":"corvo","fundo":"nao-existe"}'), { cabeca: 'veu' });
  assert.deepEqual(lerEquipados('quebrado'), {});
  assert.deepEqual(lerEquipados(null), {});
});

test('todo item da loja tem desenho', () => {
  for (const it of ITENS) assert.ok(desenharItem(it.id).length > 50, it.id);
});
