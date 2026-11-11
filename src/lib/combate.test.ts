import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alternarCondicao, estadoDaVida, ordenarIniciativa, perdaDeVida, proximoTurno, resolverAtaque } from './combate.ts';
import type { ResultadoChat } from './mapa.ts';

test('condições: liga, desliga, ignora as desconhecidas e mantém a ordem da tabela', () => {
  assert.equal(alternarCondicao('', 'envenenado', true), 'envenenado');
  assert.equal(alternarCondicao('envenenado', 'caido', true), 'caido,envenenado');
  assert.equal(alternarCondicao('caido,envenenado,xyz', 'caido', false), 'envenenado');
  assert.equal(alternarCondicao('caido', 'caido', true), 'caido');
});

test('iniciativa: maior primeiro, empate pelo nome, sem iniciativa no fim', () => {
  const ordem = ordenarIniciativa([
    { id: 1, iniciativa: 12, nome: 'Goblin' },
    { id: 2, iniciativa: null, nome: 'Aldeão' },
    { id: 3, iniciativa: 18, nome: 'Lyra' },
    { id: 4, iniciativa: 12, nome: 'Bruno' },
  ]);
  assert.deepEqual(ordem.map((p) => p.id), [3, 4, 1, 2]);
});

test('turnos: anda na ordem e vira a rodada no fim', () => {
  assert.deepEqual(proximoTurno([3, 4, 1], null, 0), { vez: 3, rodada: 1 });
  assert.deepEqual(proximoTurno([3, 4, 1], 4, 1), { vez: 1, rodada: 1 });
  assert.deepEqual(proximoTurno([3, 4, 1], 1, 1), { vez: 3, rodada: 2 });
  assert.deepEqual(proximoTurno([3, 4, 1], 99, 2), { vez: 3, rodada: 2 }); // a peça da vez saiu do mapa
  assert.deepEqual(proximoTurno([], 1, 2), { vez: null, rodada: 2 });
});

test('estado da vida dos inimigos', () => {
  assert.equal(estadoDaVida(7, 7), 'Ileso');
  assert.equal(estadoDaVida(5, 7), 'Ferido');
  assert.equal(estadoDaVida(2, 7), 'Muito ferido');
  assert.equal(estadoDaVida(1, 7), 'Quase morto');
  assert.equal(estadoDaVida(0, 7), 'Caído');
});

const d20 = (v: number, total: number): ResultadoChat => ({ tipo: 'dados', expressao: '1d20+3', total, pedacos: [{ t: 'dado', v, faces: 20, mantido: true }, { t: 'op', v: '+' }, { t: 'fixo', v: 3 }] });
const dual = (resultado: 'critico' | 'esperanca' | 'medo', total: number): ResultadoChat =>
  ({ tipo: 'dualidade', vantagem: 0, esperanca: 5, medo: resultado === 'critico' ? 5 : 3, modificador: 0, total, resultado });

test('ataque de D&D: 20 natural crítico, 1 natural erra, senão compara com a CA', () => {
  assert.deepEqual(resolverAtaque(d20(20, 23), 30), { acertou: true, critico: true });
  assert.deepEqual(resolverAtaque(d20(1, 4), 2), { acertou: false, critico: false });
  assert.deepEqual(resolverAtaque(d20(12, 15), 15), { acertou: true, critico: false });
  assert.deepEqual(resolverAtaque(d20(11, 14), 15), { acertou: false, critico: false });
  assert.equal(resolverAtaque(d20(11, 14), null), null);
});

test('ataque de Daggerheart: crítico sempre acerta, senão compara com a Dificuldade', () => {
  assert.deepEqual(resolverAtaque(dual('critico', 10), 15), { acertou: true, critico: true });
  assert.deepEqual(resolverAtaque(dual('medo', 15), 14), { acertou: true, critico: false });
  assert.deepEqual(resolverAtaque(dual('esperanca', 9), 14), { acertou: false, critico: false });
});

test('perda de vida: pontos no D&D, espaços pelos limiares no Daggerheart', () => {
  assert.equal(perdaDeVida('dnd', 9), 9);
  assert.equal(perdaDeVida('dh', 9, { maior: 6, grave: 12 }), 2);
  assert.equal(perdaDeVida('dh', 13, { maior: 6, grave: 12 }), 3);
  assert.equal(perdaDeVida('dh', 30, { maior: null, grave: null }), 1);
  assert.equal(perdaDeVida('dh', 0, { maior: 6, grave: 12 }), 0);
});
