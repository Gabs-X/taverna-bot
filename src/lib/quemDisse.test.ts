import assert from 'node:assert/strict';
import { test } from 'node:test';
import { opcoesQuemDisse } from './quemDisse.ts';

test('quem disse: a certa sempre aparece, sem repetir, completando com membros', () => {
  for (let k = 0; k < 30; k++) {
    const o = opcoesQuemDisse('a', ['b', 'a'], ['a', 'c', 'd', 'e', 'b']);
    assert.equal(o.length, 4);
    assert.ok(o.includes('a') && o.includes('b'));
    assert.equal(new Set(o).size, 4);
  }
  assert.deepEqual(opcoesQuemDisse('a', [], ['a']), ['a']);
});
