import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encerrarSalas } from './campanhaSessao.ts';

test('publica o resumo antes de encerrar e apagar texto e voz', async () => {
  const acoes: string[] = [];
  const falhas = await encerrarSalas(
    async () => { acoes.push('publicar'); },
    () => { acoes.push('encerrar'); },
    ['texto', 'voz'].map((id) => ({ id, apagar: async () => { acoes.push(id); } })),
  );
  assert.deepEqual(acoes, ['publicar', 'encerrar', 'texto', 'voz']);
  assert.deepEqual(falhas, []);
});

test('falha ao enviar o resumo preserva sessão e salas', async () => {
  const acoes: string[] = [];
  await assert.rejects(encerrarSalas(
    async () => { throw new Error('sem permissão para anexar'); },
    () => { acoes.push('encerrar'); },
    [{ id: 'texto', apagar: async () => { acoes.push('apagar'); } }],
  ), /sem permissão para anexar/);
  assert.deepEqual(acoes, []);
});

test('falha ao encerrar no banco preserva as salas', async () => {
  let apagou = false;
  await assert.rejects(encerrarSalas(async () => {}, () => { throw new Error('banco indisponível'); },
    [{ id: 'texto', apagar: async () => { apagou = true; } }]), /banco indisponível/);
  assert.equal(apagou, false);
});

test('falha ao apagar texto é informada e ainda tenta apagar voz', async (t) => {
  t.mock.method(console, 'error', () => {});
  let apagouVoz = false;
  const falhas = await encerrarSalas(async () => {}, () => {}, [
    { id: 'texto', apagar: async () => { throw new Error('sem Gerenciar Canais'); } },
    { id: 'voz', apagar: async () => { apagouVoz = true; } },
  ]);
  assert.deepEqual(falhas, ['texto']);
  assert.equal(apagouVoz, true);
});
