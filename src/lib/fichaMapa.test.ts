import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nomeDaCopia, nomeDeWebhook, validarCriatura, validarFicha } from './fichaMapa.ts';
import { textoDoPersonagem } from './mapa.ts';

const fichaDH = {
  nome: '  Lyra   Brasa ', classe: 'Feiticeira', nivel: 2, agilidade: 1, forca: -1, acuidade: 0, instinto: 2, presenca: 1, conhecimento: 0,
  evasao: 10, pv_max: 6, armadura_max: 3, limiar_maior: 6, limiar_grave: 12, experiencias: 'Ladra de Cofres +2, Criada nas Ruas 3',
};

test('ficha de Daggerheart: limpa o texto, usa os padrões e guarda as experiências', () => {
  const r = validarFicha('dh', fichaDH);
  assert.ok(r.ok);
  assert.equal(r.valores.nome, 'Lyra Brasa');
  assert.equal(r.valores.proficiencia, 1);
  assert.equal(r.valores.estresse_max, 6);
  assert.equal(r.valores.experiencias, 'Ladra de Cofres|2,Criada nas Ruas|3');
});

test('ficha de Daggerheart: recusa campo faltando, fora do limite e limiares invertidos', () => {
  assert.deepEqual(validarFicha('dh', { ...fichaDH, nome: ' ' }), { ok: false, erro: 'Preencha: Nome.' });
  assert.deepEqual(validarFicha('dh', { ...fichaDH, agilidade: 11 }), { ok: false, erro: 'Agilidade: de -5 a 10.' });
  assert.deepEqual(validarFicha('dh', { ...fichaDH, pv_max: 2.5 }), { ok: false, erro: 'PV: use um número inteiro.' });
  assert.deepEqual(validarFicha('dh', { ...fichaDH, limiar_grave: 6 }), { ok: false, erro: 'O limiar Grave precisa ser maior que o Maior.' });
});

test('ficha de D&D 3.5: atributos e combate', () => {
  const base = { nome: 'Thorin', classe: 'Guerreiro 3', nivel: 3, forca: 16, destreza: 12, constituicao: 14, inteligencia: 8, sabedoria: 10, carisma: 9, pv_max: 28, ca: 17, bba: 3, fort: 3, ref: 1, von: 1 };
  const r = validarFicha('dnd', base);
  assert.ok(r.ok);
  assert.equal(r.valores.ini_extra, 0);
  assert.equal(r.valores.raca, '');
  assert.deepEqual(validarFicha('dnd', { ...base, forca: 0 }), { ok: false, erro: 'Força: de 1 a 50.' });
});

test('biblioteca: inimigo com dano de rolagem, campos vazios viram nulos e tamanho de meio em meio', () => {
  const r = validarCriatura({ tipo: 'inimigo', nome: 'Goblin', pv_max: '7', defesa: 15, ataque: '', dano: '1d6 + 1', tamanho: 1.3 });
  assert.ok(r.ok);
  assert.equal(r.valores.tipo, 'inimigo');
  assert.equal(r.valores.pv_max, 7);
  assert.equal(r.valores.ataque, null);
  assert.equal(r.valores.dano, '1d6+1');
  assert.equal(r.valores.tamanho, 1.5);
  assert.equal(validarCriatura({ nome: 'Velho', tipo: 'qualquer' }).ok && validarCriatura({ nome: 'Velho' }).ok, true);
  assert.deepEqual(validarCriatura({ nome: 'Ogro', dano: 'muito' }), { ok: false, erro: 'Dano: escreva como uma rolagem, ex.: 1d8+2.' });
  assert.deepEqual(validarCriatura({ nome: '' }), { ok: false, erro: 'Preencha: Nome.' });
});

test('cópias da biblioteca ganham número sem repetir', () => {
  assert.equal(nomeDaCopia('Goblin', ['Lyra']), 'Goblin');
  assert.equal(nomeDaCopia('Goblin', ['Goblin']), 'Goblin 2');
  assert.equal(nomeDaCopia('Goblin', ['goblin', 'Goblin 2', 'Goblin 4']), 'Goblin 3');
});

test('nome do webhook: corta em 80 letras e recusa o que o Discord proíbe', () => {
  assert.equal(nomeDeWebhook('  Lyra  Brasa '), 'Lyra Brasa');
  assert.equal(nomeDeWebhook('x'.repeat(90))!.length, 80);
  assert.equal(nomeDeWebhook('Discordiano'), null);
  assert.equal(nomeDeWebhook('   '), null);
});

test('texto do personagem no Discord não repete o nome (ele já vem no webhook)', () => {
  assert.equal(textoDoPersonagem('msg', 'Olá, taverneiro!', null), 'Olá, taverneiro!');
  const dados = { tipo: 'dados', expressao: '1d20+5', total: 17, pedacos: [] } as never;
  assert.equal(textoDoPersonagem('dados', 'Ataque', dados), '🎲 rolou `1d20+5` · Ataque: **17**');
});
