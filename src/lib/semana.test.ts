import assert from 'node:assert/strict';
import { test } from 'node:test';
import { horaDoResumo, semanaDe, topo } from './semana.ts';

test('semana vai de segunda a domingo no horário de Brasília', () => {
  assert.equal(semanaDe(Date.parse('2026-10-22T13:00:00Z')), '2026-W43'); // quarta
  assert.equal(semanaDe(Date.parse('2026-10-26T01:00:00Z')), '2026-W43'); // domingo 22h em Brasília (já segunda em UTC)
  assert.equal(semanaDe(Date.parse('2026-10-26T03:30:00Z')), '2026-W44'); // segunda 00h30 em Brasília
  assert.equal(semanaDe(Date.parse('2027-01-01T15:00:00Z')), '2026-W53'); // virada de ano segue a regra ISO
});

test('resumo só no domingo a partir das 20h de Brasília', () => {
  assert.equal(horaDoResumo(Date.parse('2026-10-25T22:59:00Z')), false); // domingo 19h59
  assert.equal(horaDoResumo(Date.parse('2026-10-25T23:00:00Z')), true); // domingo 20h
  assert.equal(horaDoResumo(Date.parse('2026-10-22T23:00:00Z')), false); // quinta 20h
});

test('topo ignora zeros e ordena', () => {
  assert.deepEqual(topo([{ user_id: 'a', valor: 2 }, { user_id: 'b', valor: 0 }, { user_id: 'c', valor: 9 }]).map((l) => l.user_id), ['c', 'a']);
});
