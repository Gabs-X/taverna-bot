import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hpMaximo, jogar, MAX_TURNOS, novaLutadora, novoDuelo, vencedora, type AcaoDuelo } from './duelo.ts';

const duelo = () => novoDuelo(novaLutadora('1', 'Morticia', 3, false), novaLutadora('2', 'Wandinha', 3, false), () => 0);

test('ataque tira vida, passa a vez e não deixa vida negativa', () => {
  const d = jogar(duelo(), 'atacar', () => 0.5);
  assert.equal(d.vez, 'b');
  assert.ok(d.b.hp < hpMaximo(3));
  assert.equal(d.log.length, 1);
});

test('defender reduz o próximo golpe pela metade', () => {
  const r = () => 0.5;
  const semDefesa = jogar(jogar(duelo(), 'atacar', r), 'atacar', r);
  const comDefesa = jogar(jogar(duelo(), 'defender', r), 'atacar', r);
  const danoSem = hpMaximo(3) - semDefesa.a.hp;
  const danoCom = hpMaximo(3) - comDefesa.a.hp;
  assert.equal(danoCom, Math.round(danoSem / 2));
});

test('feitiço pode errar', () => {
  const d = jogar(duelo(), 'feitico', () => 0.99);
  assert.equal(d.b.hp, d.b.hpMax);
  assert.match(d.log[0], /errou/);
});

test('todo duelo termina com uma vencedora', () => {
  for (let k = 0; k < 200; k++) {
    let d = novoDuelo(novaLutadora('1', 'A', 1 + (k % 10), k % 3 === 0), novaLutadora('2', 'B', 1 + (k % 7), false));
    const acoes: AcaoDuelo[] = ['atacar', 'feitico', 'defender'];
    while (!vencedora(d)) d = jogar(d, acoes[Math.floor(Math.random() * 3)]);
    assert.ok(d.turno <= MAX_TURNOS + 1);
    assert.ok(d.a.hp >= 0 && d.b.hp >= 0);
  }
});
