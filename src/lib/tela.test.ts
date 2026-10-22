import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codigo, criarSala, duracaoTexto } from './tela.ts';

test('senha e sala só com letras e números (exigência do VDO.Ninja)', () => {
  for (let k = 0; k < 50; k++) {
    const s = criarSala();
    assert.match(s.senha, /^[A-Za-z0-9]{16}$/);
    assert.match(s.id, /^taverna[A-Za-z0-9]{10}$/);
  }
  assert.equal(codigo(5, () => 0), 'aaaaa');
});

test('quem compartilha vai direto para a tela, sem microfone; quem assiste usa a mesma sala e senha', () => {
  const s = criarSala({ titulo: 'Mapa do RPG' });
  const c = new URL(s.compartilhar);
  const v = new URL(s.assistir);
  assert.equal(c.searchParams.get('push'), s.id);
  assert.ok(c.searchParams.has('screenshare'));
  assert.equal(c.searchParams.get('audiodevice'), '0');
  assert.equal(c.searchParams.get('label'), 'Mapa do RPG');
  assert.equal(v.searchParams.get('view'), s.id);
  assert.equal(v.searchParams.get('password'), c.searchParams.get('password'));
  assert.ok(v.searchParams.has('noaudio'));
  assert.ok(!new URL(criarSala({ audio: true }).assistir).searchParams.has('noaudio'));
});

test('duração da tela em texto curto', () => {
  assert.equal(duracaoTexto(30_000), 'menos de 1 min');
  assert.equal(duracaoTexto(25 * 60_000), '25 min');
  assert.equal(duracaoTexto(65 * 60_000), '1h05');
  assert.equal(duracaoTexto(120 * 60_000 + 59_000), '2h00');
});
