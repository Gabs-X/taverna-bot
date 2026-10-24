import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codigo, criarSala, duracaoTexto, senhaTurn, SITE_TELA, VALIDADE_TURN } from './tela.ts';

test('senha e sala só com letras e números (exigência da página)', () => {
  for (let k = 0; k < 50; k++) {
    const s = criarSala();
    assert.match(s.senha, /^[A-Za-z0-9]{16}$/);
    assert.match(s.id, /^taverna[A-Za-z0-9]{10}$/);
  }
  assert.equal(codigo(5, () => 0), 'aaaaa');
});

test('quem compartilha e quem assiste usam a mesma sala e senha na Tela da Taverna', () => {
  const s = criarSala();
  const c = new URL(s.compartilhar);
  const v = new URL(s.assistir);
  assert.equal(c.origin + c.pathname, SITE_TELA);
  assert.equal(c.searchParams.get('compartilhar'), s.id);
  assert.equal(v.searchParams.get('assistir'), s.id);
  assert.equal(c.searchParams.get('chave'), s.senha);
  assert.equal(v.searchParams.get('chave'), s.senha);
});

test('com TURN, os dois links levam a mesma senha temporária, que vence em 12 h', () => {
  const s = criarSala(Math.random, { host: '1.2.3.4', segredo: 'segredo' }, 1_000_000);
  const c = new URL(s.compartilhar);
  const v = new URL(s.assistir);
  assert.equal(c.searchParams.get('turn'), '1.2.3.4');
  assert.equal(c.searchParams.get('tu'), v.searchParams.get('tu'));
  assert.equal(c.searchParams.get('tp'), v.searchParams.get('tp'));
  assert.equal(c.searchParams.get('tu'), `${1000 + VALIDADE_TURN / 1000}:taverna`);
  // Mesmo cálculo do coturn: base64(HMAC-SHA1(segredo, usuario)).
  assert.equal(senhaTurn('segredo', 1_000_000).senha, c.searchParams.get('tp'));
  assert.match(c.searchParams.get('tp')!, /^[A-Za-z0-9+/]{27}=$/);
  assert.equal(new URL(criarSala().assistir).searchParams.has('turn'), false);
});

test('duração da tela em texto curto', () => {
  assert.equal(duracaoTexto(30_000), 'menos de 1 min');
  assert.equal(duracaoTexto(25 * 60_000), '25 min');
  assert.equal(duracaoTexto(65 * 60_000), '1h05');
  assert.equal(duracaoTexto(120 * 60_000 + 59_000), '2h00');
});
