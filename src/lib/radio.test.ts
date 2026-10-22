import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chaveMusica, escolherProxima, lembrar, pareceMusica, TAMANHO_HISTORICO } from './radio.ts';

test('a mesma música em versões diferentes tem a mesma chave', () => {
  const k = chaveMusica('Bring Me To Life', 'Evanescence');
  assert.equal(k, 'bring me to life');
  assert.equal(chaveMusica('Evanescence - Bring Me To Life (Official HD Music Video) ft. Paul McCoy', 'EvanescenceVEVO'), k);
  assert.equal(chaveMusica('Numb (Official Music Video) [4K UPGRADE] – Linkin Park', 'Linkin Park'), 'numb');
  assert.equal(chaveMusica('In The End [Official HD Music Video] - Linkin Park', 'Linkin Park'), 'in the end');
  assert.equal(chaveMusica('Linkin Park - Numb', 'Linkin Park - Topic'), 'numb');
  assert.equal(chaveMusica('Lady Gaga, Bradley Cooper - Shallow (from A Star Is Born)', 'LadyGagaVEVO'), 'shallow');
  assert.equal(chaveMusica('Boulevard of Broken Dreams - Single Album Version', 'Green Day'), 'boulevard of broken dreams');
  assert.equal(chaveMusica('Ação', ''), 'acao');
});

test('descarta shorts, vídeos longos e o que não é música', () => {
  assert.ok(pareceMusica({ title: 'Numb', author: 'LP', durationMS: 188_000 }));
  assert.ok(!pareceMusica({ title: 'Numb', author: 'LP', durationMS: 30_000 }));
  assert.ok(!pareceMusica({ title: 'Linkin Park Full Album', author: 'LP', durationMS: 300_000 }));
  assert.ok(!pareceMusica({ title: 'Reagindo a Numb', author: 'X', durationMS: 300_000 }));
  assert.ok(!pareceMusica({ title: 'Meteora ao vivo', author: 'LP', durationMS: 3_600_000 }));
});

test('não repete o que já tocou e sorteia entre as primeiras boas', () => {
  const lista = [
    { title: 'Numb', author: 'Linkin Park', durationMS: 188_000 },
    { title: 'In the End', author: 'Linkin Park', durationMS: 219_000 },
    { title: 'In The End (Lyrics)', author: 'Linkin Park', durationMS: 219_000 },
    { title: 'Short', author: 'X', durationMS: 20_000 },
    { title: 'Iris', author: 'Goo Goo Dolls', durationMS: 216_000 },
  ];
  const historico = lembrar([], 'Numb', 'Linkin Park');
  const vistas = new Set<string>();
  for (const v of [0, 0.5, 0.99]) vistas.add(escolherProxima(lista, historico, () => v)!.title);
  assert.deepEqual([...vistas].sort(), ['In the End', 'Iris']);
  assert.equal(escolherProxima([lista[0]], historico), undefined);
});

test('histórico guarda só as últimas e sem duplicar', () => {
  let h: string[] = [];
  for (let k = 0; k < 40; k++) h = lembrar(h, `musica ${k}`);
  h = lembrar(h, 'musica 39');
  assert.equal(h.length, TAMANHO_HISTORICO);
  assert.equal(h.at(-1), 'musica 39');
});
