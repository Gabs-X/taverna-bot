import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { ChannelType, Collection, type ChatInputCommandInteraction } from 'discord.js';

// Banco e registros isolados: nenhum acesso ao Discord ou aos dados da instalação.
const anterior = process.cwd();
const pasta = mkdtempSync(join(tmpdir(), 'taverna-campanha-'));
process.chdir(pasta);
const { sessao, porNome } = await import('../recursos/campanha.ts');
const { db } = await import('../db.ts');
after(() => { db.close(); process.chdir(anterior); });

let numero = 0;
function mesa(opcoes: { legado?: boolean; externo?: boolean; falhaEnvio?: boolean; falhaTexto?: boolean; semVoz?: boolean } = {}) {
  const nome = `mesa-${++numero}`;
  const acoes: string[] = [];
  const inicio = Date.now() - 60_000;
  db.prepare(`INSERT INTO campanhas (guild_id, nome, sistema, mestre_id, criada_em, sessao_inicio,
    canal_id, canal_voz_id, canal_sessao_id) VALUES ('guild', ?, 'dh', 'mestre', ?, ?, 'texto', 'voz', ?)`).run(
    nome, inicio, inicio, opcoes.legado ? null : 'texto');
  const c = porNome('guild', nome)!;
  if (opcoes.externo) db.prepare("UPDATE campanhas SET canal_id = 'externo' WHERE id = ?").run(c.id);
  const salas = new Map<string, any>();
  for (const id of ['texto', 'voz', 'externo']) salas.set(id, {
    id, type: id === 'voz' ? ChannelType.GuildVoice : ChannelType.GuildText,
    topic: `Campanha ${nome} (Daggerheart): o que se escreve aqui aparece no chat do mapa e vice-versa. /campanha mapa abre o mapa.`,
    delete: async () => {
      if (id === 'texto' && opcoes.falhaTexto) throw new Error('sem permissão');
      acoes.push(`apagar:${id}`);
      salas.delete(id);
    },
  });
  // Call apagada à mão antes de finalizar.
  if (opcoes.semVoz) salas.delete('voz');
  const guild = {
    id: 'guild',
    members: { me: { id: 'bot' }, fetch: async (id: string) => ({ id }) },
    roles: { everyone: { id: 'everyone' } },
    channels: {
      cache: new Collection(),
      // Como o Discord: canal inexistente dá erro Unknown Channel (10003), não null.
      fetch: async (id: string) => {
        if (!salas.has(id)) throw Object.assign(new Error('Unknown Channel'), { code: 10003 });
        return salas.get(id);
      },
      create: async (config: any) => {
        acoes.push('criar:resumos');
        assert.match(config.name, /resumos-mesa/);
        assert.ok(config.permissionOverwrites[0].deny.length);
        const canal = {
          id: `resumos-${numero}`, type: ChannelType.GuildText,
          permissionOverwrites: { set: async () => {} },
          toString: () => `<#resumos-${numero}>`,
          send: async (mensagem: any) => {
            if (opcoes.falhaEnvio) throw new Error('sem anexos');
            acoes.push('enviar:resumo');
            assert.equal(mensagem.files.length, 1);
            assert.match(mensagem.embeds[0].data.title, /encerrada/);
            assert.ok(porNome('guild', nome)!.sessao_inicio);
          },
        };
        salas.set(canal.id, canal);
        return canal;
      },
    },
  };
  let resposta = '';
  const interacao = {
    guildId: 'guild', guild, user: { id: 'mestre' },
    options: { getSubcommand: () => 'finalizar', getString: () => nome },
    deferReply: async () => {},
    editReply: async ({ content }: { content: string }) => { resposta = content; },
    reply: async ({ content }: { content: string }) => { resposta = content; },
  } as unknown as ChatInputCommandInteraction;
  return { nome, acoes, salas, interacao, resposta: () => resposta };
}

test('finalizar cria arquivo de resumos, envia registro e apaga só as salas da sessão', async () => {
  const m = mesa();
  await sessao.executar(m.interacao);
  assert.deepEqual(m.acoes, ['criar:resumos', 'enviar:resumo', 'apagar:texto', 'apagar:voz']);
  const c = porNome('guild', m.nome)!;
  assert.equal(c.sessao_inicio, null);
  assert.equal(c.canal_id, null);
  assert.equal(c.canal_voz_id, null);
  assert.equal(c.canal_sessao_id, null);
  assert.ok(m.salas.has(c.canal_resumos_id!));
  assert.ok(readdirSync('dados/campanhas').some((a) => a.startsWith(`${c.id}-`)));
  // Segunda sessão reaproveita o canal de resumos, sem criar outro arquivo no Discord.
  db.prepare('UPDATE campanhas SET sessao_inicio = ? WHERE id = ?').run(Date.now(), c.id);
  await sessao.executar(m.interacao);
  assert.equal(m.acoes.filter((a) => a === 'criar:resumos').length, 1);
  assert.equal(m.acoes.filter((a) => a === 'enviar:resumo').length, 2);
});

test('falha no envio mantém as salas e permite tentar finalizar novamente', async (t) => {
  t.mock.method(console, 'error', () => {});
  const m = mesa({ falhaEnvio: true });
  await sessao.executar(m.interacao);
  assert.ok(porNome('guild', m.nome)!.sessao_inicio);
  assert.deepEqual(m.acoes, ['criar:resumos']);
  assert.match(m.resposta(), /nenhuma sala foi apagada/);
  await sessao.executar(m.interacao);
  assert.doesNotMatch(m.resposta(), /sendo finalizada/);
});

test('sessão aberta antes da atualização reconhece o canal criado pelo bot', async () => {
  const m = mesa({ legado: true });
  await sessao.executar(m.interacao);
  assert.ok(m.acoes.includes('apagar:texto'));
  assert.ok(m.acoes.includes('apagar:voz'));
});

test('canal vinculado manualmente é preservado ao apagar as salas temporárias', async () => {
  const m = mesa({ externo: true });
  await sessao.executar(m.interacao);
  assert.ok(m.salas.has('externo'));
  assert.equal(porNome('guild', m.nome)!.canal_id, 'externo');
  assert.ok(m.acoes.includes('apagar:texto'));
});

test('falha parcial ao apagar é avisada e preserva o ID da sala pendente', async (t) => {
  t.mock.method(console, 'error', () => {});
  const m = mesa({ falhaTexto: true });
  await sessao.executar(m.interacao);
  const c = porNome('guild', m.nome)!;
  assert.equal(c.sessao_inicio, null);
  assert.equal(c.canal_voz_id, null);
  assert.equal(c.canal_sessao_id, 'texto');
  assert.match(m.resposta(), /<#texto>/);
});

test('canal de resumos apagado à mão é recriado na próxima finalização', async () => {
  const m = mesa();
  await sessao.executar(m.interacao);
  const c = porNome('guild', m.nome)!;
  m.salas.delete(c.canal_resumos_id!);
  db.prepare('UPDATE campanhas SET sessao_inicio = ? WHERE id = ?').run(Date.now(), c.id);
  await sessao.executar(m.interacao);
  assert.equal(m.acoes.filter((a) => a === 'criar:resumos').length, 2);
  assert.equal(porNome('guild', m.nome)!.sessao_inicio, null);
});

test('call apagada à mão conta como apagada, sem aviso de falha', async () => {
  const m = mesa({ semVoz: true });
  await sessao.executar(m.interacao);
  const c = porNome('guild', m.nome)!;
  assert.equal(c.sessao_inicio, null);
  assert.equal(c.canal_voz_id, null);
  assert.ok(m.acoes.includes('apagar:texto'));
  assert.doesNotMatch(m.resposta(), /Não consegui apagar/);
});

test('sem o campo campanha, o /sessao usa a única campanha da pessoa (ou a com sessão aberta)', async () => {
  const { campanhaDaVez } = await import('../recursos/campanha.ts');
  const pedir = (user: string, campo: string | null = null) =>
    campanhaDaVez({ guildId: 'guild', user: { id: user }, options: { getString: () => campo } } as unknown as ChatInputCommandInteraction);
  assert.match(pedir('ninguem') as string, /não está em nenhuma campanha/);
  db.prepare("INSERT INTO campanhas (guild_id, nome, sistema, mestre_id, criada_em) VALUES ('guild', 'Brumas', 'dh', 'outro', 0)").run();
  const brumas = porNome('guild', 'Brumas')!;
  db.prepare('INSERT INTO campanha_personagens (campanha_id, user_id) VALUES (?, ?)').run(brumas.id, 'jogadora');
  assert.equal((pedir('jogadora') as { nome: string }).nome, 'Brumas');
  db.prepare("INSERT INTO campanhas (guild_id, nome, sistema, mestre_id, criada_em) VALUES ('guild', 'Cinzas', 'dnd', 'jogadora', 0)").run();
  assert.match(pedir('jogadora') as string, /mais de uma campanha.*Brumas.*Cinzas/);
  db.prepare('UPDATE campanhas SET sessao_inicio = 1 WHERE id = ?').run(brumas.id);
  assert.equal((pedir('jogadora') as { nome: string }).nome, 'Brumas');
  assert.equal((pedir('jogadora', 'cinzas') as { nome: string }).nome, 'Cinzas');
});
