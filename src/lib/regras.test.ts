import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  desserializarExperiencias,
  lerExperiencias,
  pvPorDano,
  rolarDualidade,
  serializarExperiencias,
} from './daggerheart.ts';
import {
  acharPericia,
  desserializarGraduacoes,
  estadoVida,
  lerGraduacoes,
  modificador,
  PERICIAS,
  serializarGraduacoes,
} from './dnd35.ts';

const sequencia = (...valores: number[]) => {
  let i = 0;
  return () => valores[i++ % valores.length];
};

describe('D&D 3.5', () => {
  it('modificador de atributo', () => {
    assert.equal(modificador(10), 0);
    assert.equal(modificador(15), 2);
    assert.equal(modificador(8), -1);
    assert.equal(modificador(1), -5);
  });

  it('tem as perícias do Livro do Jogador com ids únicos', () => {
    assert.equal(new Set(PERICIAS.map((p) => p.id)).size, PERICIAS.length);
    assert.equal(acharPericia('esconder-se')?.atributo, 'destreza');
    assert.equal(acharPericia('Conhecimento (Os Planos)')?.id, 'conhecimento-os-planos');
    assert.equal(acharPericia('conhecimento arcano')?.treinada, true);
    assert.equal(acharPericia('usar instrumento magico')?.atributo, 'carisma');
  });

  it('lê graduações em texto livre e ida e volta pelo banco', () => {
    const g = lerGraduacoes('Esconder-se 5, ouvir=4, conhecimento (arcano) 6, observar 0');
    assert.deepEqual([...g], [['esconder-se', 5], ['ouvir', 4], ['conhecimento-arcano', 6], ['observar', 0]]);
    const salvo = serializarGraduacoes(g);
    assert.equal(salvo, 'esconder-se:5,ouvir:4,conhecimento-arcano:6');
    assert.deepEqual([...desserializarGraduacoes(salvo)], [['esconder-se', 5], ['ouvir', 4], ['conhecimento-arcano', 6]]);
    // Dados do formato antigo (5e) são ignorados.
    assert.equal(desserializarGraduacoes('furtividade,percepcao').size, 0);
  });

  it('recusa perícia desconhecida ou sem graduação', () => {
    assert.throws(() => lerGraduacoes('percepção 3'), /percepção/);
    assert.throws(() => lerGraduacoes('ouvir'), /graduação/);
  });

  it('estado de vida pelos PV', () => {
    assert.equal(estadoVida(5), '');
    assert.match(estadoVida(0), /Incapacitado/);
    assert.match(estadoVida(-3), /Morrendo/);
    assert.match(estadoVida(-10), /Morto/);
  });
});

describe('Daggerheart', () => {
  it('dualidade: esperança, medo e crítico', () => {
    assert.deepEqual(rolarDualidade(2, 0, sequencia(9, 4)), { esperanca: 9, medo: 4, d6: undefined, modificador: 2, total: 15, resultado: 'esperanca' });
    assert.equal(rolarDualidade(0, 0, sequencia(3, 11)).resultado, 'medo');
    assert.equal(rolarDualidade(0, 0, sequencia(7, 7)).resultado, 'critico');
  });

  it('vantagem soma e desvantagem subtrai um d6', () => {
    assert.equal(rolarDualidade(1, 1, sequencia(5, 6, 4)).total, 5 + 6 + 1 + 4);
    assert.equal(rolarDualidade(1, -1, sequencia(5, 6, 4)).total, 5 + 6 + 1 - 4);
  });

  it('PV marcados pelos limiares de dano', () => {
    assert.equal(pvPorDano(0, 7, 14), 0);
    assert.equal(pvPorDano(6, 7, 14), 1);
    assert.equal(pvPorDano(7, 7, 14), 2);
    assert.equal(pvPorDano(14, 7, 14), 3);
    assert.equal(pvPorDano(14, 7, 14, true), 2);
    assert.equal(pvPorDano(3, 7, 14, true), 0);
  });

  it('experiências com bônus padrão +2', () => {
    const lista = lerExperiencias('Ladrão de Cofres +2, Criado nas Ruas 3, Bardo de Taverna');
    assert.deepEqual(lista, [
      { nome: 'Ladrão de Cofres', bonus: 2 },
      { nome: 'Criado nas Ruas', bonus: 3 },
      { nome: 'Bardo de Taverna', bonus: 2 },
    ]);
    assert.deepEqual(desserializarExperiencias(serializarExperiencias(lista)), lista);
  });
});
