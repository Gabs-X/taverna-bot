import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESPERA_AVISO, mudancaLendaria } from './callLendaria.ts';

test('call lendária começa com 5, acaba abaixo de 3 e não repete aviso dentro de 1 h', () => {
  const agora = 10 * ESPERA_AVISO;
  assert.equal(mudancaLendaria(4, false, 0, agora), undefined);
  assert.equal(mudancaLendaria(5, false, 0, agora), 'comecar');
  assert.equal(mudancaLendaria(5, false, agora - 1000, agora), undefined);
  assert.equal(mudancaLendaria(3, true, 0, agora), undefined);
  assert.equal(mudancaLendaria(2, true, 0, agora), 'terminar');
});
