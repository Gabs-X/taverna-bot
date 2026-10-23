import assert from 'node:assert/strict';
import { test } from 'node:test';
import { corDoNumero, girarRoleta, girarSlots, jogarMoeda, retornoMedioSlots, SIMBOLOS } from './cassino.ts';
import { CONQUISTAS, novasConquistas, type Estatisticas } from './conquistas.ts';
import { avaliar, diaDe, palavraDoDia, PALAVRAS, premioPalavra } from './palavra.ts';

test('cassino: a casa ganha um pouco, mas não demais', () => {
  const ev = retornoMedioSlots();
  assert.ok(ev > 0.88 && ev < 0.97, `retorno ${ev}`);
  // Simulação confirma a conta.
  let total = 0;
  for (let k = 0; k < 200_000; k++) total += girarSlots().multiplicador;
  assert.ok(Math.abs(total / 200_000 - ev) < 0.03);
});

test('cassino: cada símbolo paga um valor diferente com dois iguais', () => {
  assert.equal(new Set(SIMBOLOS.map((x) => x.paga2)).size, SIMBOLOS.length);
  const seq = (...v: number[]) => () => v.shift()!; // cerveja < 0.30 · d20 < 0.55 · coração < 0.73 · caveira < 0.88 · gótica < 0.96 · moeda
  const parCerveja = girarSlots(seq(0.1, 0.1, 0.5));
  assert.deepEqual([parCerveja.combinacao, parCerveja.simbolo?.id, parCerveja.multiplicador], ['dois', 'cerveja', 1.1]);
  const parGotica = girarSlots(seq(0.9, 0.2, 0.9));
  assert.deepEqual([parGotica.combinacao, parGotica.simbolo?.id, parGotica.multiplicador], ['dois', 'gotica', 3]);
  assert.equal(girarSlots(seq(0.8, 0.8, 0.1)).multiplicador, 0.25); // duas caveiras: devolve só um quarto
  assert.equal(girarSlots(seq(0.8, 0.8, 0.8)).multiplicador, 0); // três caveiras: perde tudo
  const jackpot = girarSlots(seq(0.97, 0.97, 0.97));
  assert.ok(jackpot.jackpot && jackpot.multiplicador === 100);
  assert.equal(girarSlots(seq(0.1, 0.4, 0.6)).combinacao, 'nada');
});

test('cassino: moeda e roleta pagam certo', () => {
  assert.equal(jogarMoeda('cara', () => 0.1).multiplicador, 1.9);
  assert.equal(jogarMoeda('cara', () => 0.9).multiplicador, 0);
  assert.equal(corDoNumero(0), 'verde');
  assert.equal(corDoNumero(1), 'vermelho');
  assert.equal(corDoNumero(2), 'preto');
  assert.equal(girarRoleta('numero', 0, () => 0).multiplicador, 36);
  assert.equal(girarRoleta('verde', null, () => 0).multiplicador, 14);
  assert.equal(girarRoleta('vermelho', null, () => 0).multiplicador, 0);
});

test('conquistas: só as merecidas e ainda não ganhas', () => {
  const zero: Estatisticas = { mensagens: 0, minutos_call: 0, nivel: 0, sequencia: 0, moedas: 0, duelos_vencidos: 0, quiz: 0, apanhou: 0, jackpots: 0, palavras: 0, gotica_nivel: 0 };
  assert.equal(novasConquistas(zero, new Set()).length, 0);
  const novas = novasConquistas({ ...zero, mensagens: 150, jackpots: 1 }, new Set(['jackpot']));
  assert.deepEqual(novas.map((c) => c.id), ['tagarela']);
  assert.equal(new Set(CONQUISTAS.map((c) => c.id)).size, CONQUISTAS.length);
});

test('palavra: avaliação com letras repetidas como no Wordle', () => {
  assert.deepEqual(avaliar('sorte', 'sorte'), ['certo', 'certo', 'certo', 'certo', 'certo']);
  assert.deepEqual(avaliar('arara', 'amora'), ['certo', 'errado', 'errado', 'certo', 'certo']);
  // "lento" × "folha": o L e o O existem em outro lugar, só uma vez cada
  assert.deepEqual(avaliar('lento', 'folha'), ['lugar', 'errado', 'errado', 'errado', 'lugar']);
  // "ossos" × "massa": um S no lugar certo, outro S em outro lugar, o terceiro S sobra
  assert.deepEqual(avaliar('ossos', 'massa'), ['errado', 'lugar', 'certo', 'errado', 'errado']);
});

test('palavra: mesma palavra no dia, todas com 5 letras, prêmio cai com as tentativas', () => {
  assert.ok(PALAVRAS.every((p) => /^[a-z]{5}$/.test(p)));
  assert.equal(palavraDoDia('2026-10-22'), palavraDoDia('2026-10-22'));
  assert.equal(diaDe(Date.UTC(2026, 9, 22, 2, 0)), '2026-10-21'); // 23h em Brasília ainda é dia 21
  assert.ok(premioPalavra(1) > premioPalavra(6) && premioPalavra(6) >= 30);
});
