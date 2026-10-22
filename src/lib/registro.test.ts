import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agruparLinhas, descreverBotao, descreverComando } from './registro.ts';

test('comando com subcomando e opções vira frase legível', () => {
  const opcoes = [{ name: 'duelo', type: 1, options: [{ name: 'membro', type: 6, value: '123' }] }];
  assert.equal(descreverComando('gotica', opcoes), '/gotica duelo membro:<@123>');
  assert.equal(descreverComando('grupo', [{ name: 'canal', type: 1, options: [{ name: 'tipo', type: 3, value: 'voz' }, { name: 'nome', type: 3, value: 'Sala 2' }] }]), '/grupo canal tipo:voz nome:"Sala 2"');
  assert.equal(descreverComando('daily'), '/daily');
  assert.equal(descreverComando('limpar', [{ name: 'tudo', type: 5, value: true }]), '/limpar tudo:true');
});

test('botões conhecidos viram frase; desconhecidos aparecem crus', () => {
  assert.equal(descreverBotao('gotica:alimentar:42'), 'Gótica: alimentou a gótica de <@42>');
  assert.equal(descreverBotao('duelo:feitico'), 'Duelo: lançou feitiço');
  assert.equal(descreverBotao('cargo:atv-quiz'), 'Painel: ligou/desligou a atividade quiz');
  assert.equal(descreverBotao('grupo:aceitar:7:99'), 'Subgrupo: aceitou entrada no grupo #7 de <@99>');
  assert.equal(descreverBotao('grupom:outronome:3', 'Os Brabos'), 'Subgrupo: aprovou o pedido #3 com o nome "Os Brabos"');
  assert.match(descreverBotao('reset:confirmar:1'), /CONFIRMOU/);
  assert.equal(descreverBotao('xyz:1'), 'Botão xyz:1');
});

test('agrupa linhas em mensagens que cabem no Discord', () => {
  const linhas = Array.from({ length: 100 }, (_, k) => `linha ${k} `.padEnd(50, '.'));
  const blocos = agruparLinhas(linhas);
  assert.ok(blocos.every((b) => b.length <= 1900));
  assert.equal(blocos.join('\n').split('\n').length, 100);
});
