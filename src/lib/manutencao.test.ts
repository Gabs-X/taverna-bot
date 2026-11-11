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

test('espelho dos arquivos da nuvem: só traz o que falta ou mudou, e ignora caminhos perigosos', async () => {
  const { lerListaRemota, arquivosParaTrazer } = await import('./manutencao.ts');
  const lista = lerListaRemota('mapas/a.png\t100\t1700000000.5\r\nlivros/g-dh.pdf\t264007599\t1700000100.0\n../segredo\t1\t1\n/etc/passwd\t1\t1\nlixo\n\ncartas/dh/p/x.jpg\tabc\t1\n');
  assert.deepEqual(lista.map((a) => a.caminho), ['mapas/a.png', 'livros/g-dh.pdf']);
  const aqui: Record<string, { tamanho: number; em: number }> = { 'mapas/a.png': { tamanho: 100, em: 1700000000 }, 'livros/g-dh.pdf': { tamanho: 5, em: 1700000100 } };
  assert.deepEqual(arquivosParaTrazer(lista, (c) => aqui[c] ?? null), ['livros/g-dh.pdf']);
  assert.deepEqual(arquivosParaTrazer(lista, () => null), ['mapas/a.png', 'livros/g-dh.pdf']);
});

test('cópia depois da sessão: nome com a hora e a mesa, e guarda só as mais novas', async () => {
  const { nomeBackupSessao, backupsDeSessaoVelhos, backupsQueFaltam } = await import('./manutencao.ts');
  assert.equal(nomeBackupSessao(Date.UTC(2026, 10, 12, 0, 30), 'Brumas de Ávalon!'), 'taverna-2026-11-11-sessao-2130-brumas-de-avalon.db');
  const nomes = ['taverna-2026-11-01-sessao-2100-a.db', 'taverna-2026-11-03-sessao-2100-a.db', 'taverna-2026-11-02-sessao-2200-b.db', 'taverna-2026-11-03.db'];
  assert.deepEqual(backupsDeSessaoVelhos(nomes, 2), ['taverna-2026-11-01-sessao-2100-a.db']);
  assert.deepEqual(backupsVelhos(nomes, 0), ['taverna-2026-11-03.db']);
  assert.deepEqual(backupsQueFaltam(['taverna-2026-11-09.db', 'taverna-2026-11-08.db', 'taverna-2026-11-10.db', 'x.db', 'taverna-2026-11-10-sessao-2300-a.db'], ['taverna-2026-11-10.db']),
    ['taverna-2026-11-08.db', 'taverna-2026-11-09.db', 'taverna-2026-11-10-sessao-2300-a.db']);
});
