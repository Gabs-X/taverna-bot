import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { formatar, interpretar, rolar } from './dados.ts';

// Gerador previsível: devolve os valores na ordem dada.
const sequencia = (...valores: number[]) => {
  let i = 0;
  return () => valores[i++ % valores.length];
};

describe('interpretar', () => {
  it('entende dados, modificadores e manter', () => {
    assert.deepEqual(interpretar('2d20kh1+5'), [
      { tipo: 'dado', sinal: 1, qtd: 2, faces: 20, manter: { modo: 'kh', qtd: 1 } },
      { tipo: 'fixo', sinal: 1, valor: 5 },
    ]);
    assert.deepEqual(interpretar('d6 - 1'), [
      { tipo: 'dado', sinal: 1, qtd: 1, faces: 6 },
      { tipo: 'fixo', sinal: -1, valor: 1 },
    ]);
  });

  it('recusa expressões inválidas e exageradas', () => {
    assert.throws(() => interpretar(''));
    assert.throws(() => interpretar('abc'));
    assert.throws(() => interpretar('1d20++2'));
    assert.throws(() => interpretar('500d6'));
    assert.throws(() => interpretar('1d1'));
    assert.throws(() => interpretar('2d6kh3'));
  });
});

describe('rolar', () => {
  it('soma termos com sinal', () => {
    const r = rolar('2d6+3-1d4', sequencia(4, 5, 2));
    assert.equal(r.total, 4 + 5 + 3 - 2);
  });

  it('mantém os maiores e os menores', () => {
    assert.equal(rolar('4d6kh3', sequencia(1, 6, 3, 5)).total, 14);
    assert.equal(rolar('2d20kl1', sequencia(17, 4)).total, 4);
  });

  it('identifica o d20 mantido para crítico', () => {
    assert.equal(rolar('2d20kh1+2', sequencia(20, 3)).d20, 20);
    assert.equal(rolar('1d20', sequencia(1)).d20, 1);
    assert.equal(rolar('2d20', sequencia(1, 2)).d20, undefined);
    assert.equal(rolar('1d8', sequencia(1)).d20, undefined);
  });

  it('formata riscando os descartados', () => {
    assert.equal(formatar(rolar('2d20kh1+3', sequencia(7, 15))), '[~~7~~, 15] + 3');
  });
});
