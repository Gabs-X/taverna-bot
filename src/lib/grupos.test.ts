import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emojiValido, EMOJI_PADRAO, problemaNoNome, slugCanal } from './grupos.ts';

test('nome: tamanho, links e caracteres de formatação', () => {
  assert.equal(problemaNoNome('Os Sem-Elo'), undefined);
  assert.equal(problemaNoNome('Grupo 🎮 da Ranked'), undefined);
  assert.ok(problemaNoNome('a'));
  assert.ok(problemaNoNome('x'.repeat(33)));
  assert.ok(problemaNoNome('entra discord.gg/abc'));
  assert.ok(problemaNoNome('@everyone'));
  assert.ok(problemaNoNome('**negrito**'));
});

test('emoji: aceita um só (inclusive compostos), senão usa o padrão', () => {
  assert.equal(emojiValido('🎮'), '🎮');
  assert.equal(emojiValido('👩🏽‍💻'), '👩🏽‍💻');
  assert.equal(emojiValido('🇧🇷'), '🇧🇷');
  assert.equal(emojiValido('🎮🎮'), EMOJI_PADRAO);
  assert.equal(emojiValido('abc'), EMOJI_PADRAO);
  assert.equal(emojiValido(null), EMOJI_PADRAO);
});

test('slug de canal sem acento nem espaço', () => {
  assert.equal(slugCanal('Os Sem-Elo da Ranked!'), 'os-sem-elo-da-ranked');
  assert.equal(slugCanal('Ação & Reação'), 'acao-reacao');
  assert.equal(slugCanal('🎮🎮'), 'grupo');
});
