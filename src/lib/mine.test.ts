import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  comNick,
  deveDesligar,
  donoDoNick,
  lerChunky,
  lerLista,
  lerPacotesRcon,
  lerTps,
  nomeDoZip,
  pacoteRcon,
  problemaNoNick,
  RCON_COMANDO,
  semNick,
  uuidOffline,
  versaoDosExtras,
  ZIP_VALIDO,
} from './mine.ts';

test('nick: regra do Minecraft', () => {
  assert.equal(problemaNoNick('Gabs_X'), undefined);
  assert.equal(problemaNoNick('abc'), undefined);
  assert.ok(problemaNoNick('ab'));
  assert.ok(problemaNoNick('x'.repeat(17)));
  assert.ok(problemaNoNick('João'));
  assert.ok(problemaNoNick('com espaço'));
});

test('UUID do modo pirata bate com o do servidor', () => {
  assert.equal(uuidOffline('Notch'), 'b50ad385-829d-3141-a216-7e7d7539ba7f');
  assert.notEqual(uuidOffline('notch'), uuidOffline('Notch'));
});

test('whitelist: troca a entrada de mesmo nick e remove sem ligar para maiúsculas', () => {
  const lista = comNick([{ uuid: 'velho', name: 'ana' }, { uuid: 'x', name: 'Beto' }], 'Ana');
  assert.deepEqual(lista.map((e) => e.name), ['Beto', 'Ana']);
  assert.equal(lista[1].uuid, uuidOffline('Ana'));
  assert.deepEqual(semNick(lista, 'BETO').map((e) => e.name), ['Ana']);
  assert.equal(donoDoNick({ '1': 'Ana', '2': 'Beto' }, 'beto'), '2');
  assert.equal(donoDoNick({ '1': 'Ana' }, 'Carla'), undefined);
});

test('RCON: monta e lê pacotes, inclusive quebrados no meio', () => {
  const p = pacoteRcon(7, RCON_COMANDO, 'list');
  assert.equal(p.length, 18);
  assert.equal(p.readInt32LE(0), 14);
  const junto = Buffer.concat([p, pacoteRcon(8, 0, 'ok ✓')]);
  const meio = lerPacotesRcon(junto.subarray(0, 25));
  assert.deepEqual(meio.pacotes, [{ id: 7, tipo: RCON_COMANDO, corpo: 'list' }]);
  const fim = lerPacotesRcon(Buffer.concat([meio.resto, junto.subarray(25)]));
  assert.deepEqual(fim.pacotes, [{ id: 8, tipo: 0, corpo: 'ok ✓' }]);
  assert.equal(fim.resto.length, 0);
});

test('lê a lista de jogadores, o TPS e o Chunky', () => {
  assert.deepEqual(lerLista('There are 2 of a max of 20 players online: Ana, Beto'), { online: 2, max: 20, nomes: ['Ana', 'Beto'] });
  assert.deepEqual(lerLista('There are 0 of a max of 20 players online: '), { online: 0, max: 20, nomes: [] });
  assert.equal(lerLista('Unknown command'), undefined);
  assert.equal(lerTps('minecraft:overworld: Mean tick time: 3.1 ms. Mean TPS: 20.000\nOverall: Mean tick time: 4.512 ms. Mean TPS: 19.874'), 19.874);
  assert.equal(lerTps('Overworld: 20,000 TPS (12,456 ms/tick)\nThe Nether: 20,000 TPS (0,049 ms/tick)\nOverall: 19,500 TPS (14,313 ms/tick)'), 19.5);
  assert.equal(lerTps('nada'), undefined);
  assert.deepEqual(lerChunky('[Chunky] Task running for minecraft:overworld. Processed: 1490 chunks (1,30%), ETA: 1:23:25'), { rodando: true, porcento: 1.3 });
  assert.deepEqual(lerChunky('[Chunky] No tasks running.'), { rodando: false });
});

test('desliga sozinho só depois de 15 min vazio e fora da pré-geração', () => {
  const agora = 1_000_000_000;
  assert.equal(deveDesligar({ vazioDesde: null, agora, pregerando: false }), false);
  assert.equal(deveDesligar({ vazioDesde: agora - 14 * 60_000, agora, pregerando: false }), false);
  assert.equal(deveDesligar({ vazioDesde: agora - 15 * 60_000, agora, pregerando: false }), true);
  assert.equal(deveDesligar({ vazioDesde: agora - 60 * 60_000, agora, pregerando: true }), false);
});

test('versão dos mods extras muda quando a lista muda e não depende da ordem', () => {
  const a = versaoDosExtras([{ nome: 'scc.jar', tamanho: 10 }, { nome: 'mobs.jar', tamanho: 5 }]);
  assert.equal(a, versaoDosExtras([{ nome: 'mobs.jar', tamanho: 5 }, { nome: 'scc.jar', tamanho: 10 }]));
  assert.notEqual(a, versaoDosExtras([{ nome: 'scc.jar', tamanho: 11 }, { nome: 'mobs.jar', tamanho: 5 }]));
  assert.match(nomeDoZip(a), ZIP_VALIDO);
  assert.doesNotMatch('../mods-extras-aaaaaaaa.zip', ZIP_VALIDO);
});
