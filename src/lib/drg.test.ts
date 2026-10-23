import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acharArma, ARMAS, sugerirArmas, textoMods } from './drg.ts';

test('24 armas, 6 por classe, cada uma com pelo menos uma build válida', () => {
  assert.equal(ARMAS.length, 24);
  for (const classe of ['Driller', 'Engineer', 'Gunner', 'Scout']) assert.equal(ARMAS.filter((a) => a.classe === classe).length, 6);
  for (const a of ARMAS) {
    assert.ok(a.builds.length >= 1 && a.builds.length <= 4, a.nome);
    for (const b of a.builds) if (b.mods) assert.ok(b.mods.length === 5 && b.mods.every((x) => /^[ABC](\/[ABC])*$/.test(x)), `${a.nome}: ${b.overclock}`);
  }
});

test('acha a arma pelo nome, apelido, sem acento ou aspas', () => {
  assert.equal(acharArma('warthog')?.nome, '"Warthog" Auto 210');
  assert.equal(acharArma('"Lead Storm" Powered Minigun')?.classe, 'Gunner');
  assert.equal(acharArma('lanca-chamas')?.nome, 'CRSPR Flamethrower');
  assert.equal(acharArma('boltsh')?.nome, 'Nishanka Boltshark X-80');
  assert.equal(acharArma('nada disso'), undefined);
});

test('sugestões e texto dos mods', () => {
  assert.equal(sugerirArmas('').length, 24);
  assert.ok(sugerirArmas('scout').every((a) => a.classe === 'Scout'));
  assert.equal(textoMods(['B', 'A', 'C', 'A/C', 'B']), '1B · 2A · 3C · 4A/C · 5B');
});
