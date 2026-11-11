import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerComandoMusica } from './ambientes.ts';

test('comandos de música do mapa: confere trilha, busca e volume', () => {
  assert.deepEqual(lerComandoMusica({ acao: 'ambiente', tipo: 'masmorra' }), { acao: 'ambiente', tipo: 'masmorra' });
  assert.equal(lerComandoMusica({ acao: 'ambiente', tipo: 'disco' }), 'Trilha desconhecida.');
  assert.deepEqual(lerComandoMusica({ acao: 'tocar', busca: '  Mamonas  ' }), { acao: 'tocar', busca: 'Mamonas' });
  assert.equal(lerComandoMusica({ acao: 'tocar', busca: ' ' }), 'Escreva o nome da música ou cole o link.');
  assert.deepEqual(lerComandoMusica({ acao: 'volume', volume: 250 }), { acao: 'volume', volume: 100 });
  assert.deepEqual(lerComandoMusica({ acao: 'pular' }), { acao: 'pular' });
  assert.equal(lerComandoMusica({ acao: 'explodir' }), 'Comando de música desconhecido.');
});
