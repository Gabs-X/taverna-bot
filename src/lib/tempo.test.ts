import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dataValida, interpretarDataHora, interpretarDuracao, partesBrasilia } from './tempo.ts';

test('durações simples e combinadas', () => {
  assert.equal(interpretarDuracao('30m'), 30 * 60_000);
  assert.equal(interpretarDuracao('2h'), 2 * 3_600_000);
  assert.equal(interpretarDuracao('1h30m'), 90 * 60_000);
  assert.equal(interpretarDuracao('1d 12h'), 36 * 3_600_000);
});

test('durações inválidas', () => {
  for (const t of ['', 'amanhã', '10', '5x', '0m', 'h']) assert.equal(interpretarDuracao(t), null, t);
});

test('data e hora em Brasília', () => {
  const d = interpretarDataHora('25/10/2026', '20:30')!;
  assert.equal(d.toISOString(), '2026-10-25T23:30:00.000Z');
  assert.equal(interpretarDataHora('25/10/26', '20h')!.toISOString(), '2026-10-25T23:00:00.000Z');
  assert.equal(interpretarDataHora('1/11/2026', '9h05')!.toISOString(), '2026-11-01T12:05:00.000Z');
});

test('sem ano usa a próxima ocorrência', () => {
  const agora = new Date('2026-10-21T15:00:00Z');
  assert.equal(interpretarDataHora('25/10', '20', agora)!.toISOString(), '2026-10-25T23:00:00.000Z');
  assert.equal(interpretarDataHora('10/01', '20', agora)!.toISOString().slice(0, 4), '2027');
  assert.equal(interpretarDataHora('21/10', '11', agora)!.toISOString().slice(0, 4), '2027');
});

test('datas e horas impossíveis', () => {
  assert.equal(interpretarDataHora('31/02/2026', '20'), null);
  assert.equal(interpretarDataHora('29/02/2026', '20'), null);
  assert.equal(interpretarDataHora('10/10/2026', '24:00'), null);
  assert.equal(interpretarDataHora('amanhã', '20'), null);
  assert.ok(dataValida(29, 2));
});

test('partes no fuso de Brasília', () => {
  // 01:00 UTC do dia 22 ainda é dia 21 em Brasília.
  assert.deepEqual(partesBrasilia(new Date('2026-10-22T01:00:00Z')), { dia: 21, mes: 10, ano: 2026, hora: 22 });
});
