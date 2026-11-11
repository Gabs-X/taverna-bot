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

test('link do Spotify: reconhece o tipo e tira "título artista" da página da música', async () => {
  const { linkDoSpotify, buscaDaPaginaSpotify } = await import('./ambientes.ts');
  assert.deepEqual(linkDoSpotify('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc'), { tipo: 'track' });
  assert.deepEqual(linkDoSpotify('https://open.spotify.com/intl-pt/track/4cOdK2wGLETKBW3PvgPWqT'), { tipo: 'track' });
  assert.deepEqual(linkDoSpotify('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'), { tipo: 'playlist' });
  assert.equal(linkDoSpotify('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), null);
  const html = '<meta property="og:title" content="Don&#x27;t Stop Me Now"/><meta property="og:description" content="Queen · Jazz · Song · 1978"/>';
  assert.equal(buscaDaPaginaSpotify(html), "Don't Stop Me Now Queen");
  assert.equal(buscaDaPaginaSpotify('<html></html>'), null);
});
