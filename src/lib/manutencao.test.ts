import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupsVelhos, ficouFora, nomeBackup } from './manutencao.ts';

test('queda só conta se o último sinal de vida foi há mais de 3 min', () => {
  const agora = 10_000_000;
  assert.equal(ficouFora(undefined, agora), 0);
  assert.equal(ficouFora(agora - 20_000, agora), 0);
  assert.equal(ficouFora(agora - 3_600_000, agora), 3_600_000);
});

test('backup com a data de Brasília e só os 7 mais novos ficam', () => {
  assert.equal(nomeBackup(Date.UTC(2026, 9, 23, 2, 0)), 'taverna-2026-10-22.db');
  const nomes = Array.from({ length: 10 }, (_, k) => `taverna-2026-10-${String(k + 10).padStart(2, '0')}.db`).concat('outro.txt');
  assert.deepEqual(backupsVelhos(nomes, 7), ['taverna-2026-10-12.db', 'taverna-2026-10-11.db', 'taverna-2026-10-10.db']);
});
