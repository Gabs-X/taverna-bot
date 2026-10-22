import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alternativas, esconderNome, limparHtml, recorte } from './quiz.ts';

test('limpa tags do Data Dragon', () => {
  assert.equal(limparHtml('Causa <magicDamage>100 de dano</magicDamage>.<br><br>Depois <status>atordoa</status>.'), 'Causa 100 de dano.\n\nDepois atordoa.');
});

test('esconde o nome do campeão e partes longas dele', () => {
  assert.equal(esconderNome('Miss Fortune atira. A Fortune sorri.', 'Miss Fortune'), '??? atira. A ??? sorri.');
  assert.equal(esconderNome('Os ataques de Ashe reduzem', 'Ashe'), 'Os ataques de ??? reduzem');
});

test('alternativas: 4 distintas e a certa sempre está lá', () => {
  const todos = Array.from({ length: 20 }, (_, k) => ({ id: `c${k}` }));
  for (let n = 0; n < 50; n++) {
    const certa = todos[n % 20];
    const op = alternativas(todos, certa);
    assert.equal(op.length, 4);
    assert.equal(new Set(op.map((o) => o.id)).size, 4);
    assert.ok(op.some((o) => o.id === certa.id));
  }
});

test('recorte nunca sai da imagem', () => {
  for (const v of [0, 0.5, 0.999]) {
    const c = recorte(() => v);
    assert.ok(c.x <= 0 && c.y <= 0);
    assert.ok(c.x + c.largura >= 512 && c.y + c.altura >= 512);
  }
});
