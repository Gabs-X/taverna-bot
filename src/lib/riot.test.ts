import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kda, separarRiotId, textoElo } from './riot.ts';

test('Riot ID com e sem espaço; sem tag é inválido', () => {
  assert.deepEqual(separarRiotId('Gabs#BR1'), { nome: 'Gabs', tag: 'BR1' });
  assert.deepEqual(separarRiotId(' O Maluco #  777 '), { nome: 'O Maluco', tag: '777' });
  assert.equal(separarRiotId('SemTag'), undefined);
});

test('elo em português, sem divisão no Mestre para cima', () => {
  assert.equal(textoElo(undefined), 'Sem ranque');
  assert.equal(textoElo({ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 54, wins: 33, losses: 21 }), 'Ouro II · 54 PdL · 61% (33V 21D)');
  assert.equal(textoElo({ queueType: 'RANKED_SOLO_5x5', tier: 'MASTER', rank: 'I', leaguePoints: 120, wins: 10, losses: 10 }), 'Mestre · 120 PdL · 50% (10V 10D)');
  assert.equal(kda({ campeao: 'Jinx', k: 8, d: 2, a: 10, venceu: true, modo: 'ARAM', quando: 0 }), '8/2/10');
});
