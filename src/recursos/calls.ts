import {
  ActivityType,
  ChannelType,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type Client,
  type GuildMember,
  type VoiceState,
} from 'discord.js';
import { CANAIS } from '../config.ts';
import { db } from '../db.ts';
import { ehAdmin } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';
import { registrar } from './registro.ts';

const inserir = db.prepare('INSERT OR REPLACE INTO calls_temporarias (canal_id, guild_id, dono_id) VALUES (?, ?, ?)');
const remover = db.prepare('DELETE FROM calls_temporarias WHERE canal_id = ?');
const buscar = db.prepare('SELECT dono_id FROM calls_temporarias WHERE canal_id = ?');

// Se o membro estiver jogando algo (presença), a call já nasce com o nome do jogo.
function nomeDaCall(membro: GuildMember) {
  const jogo = membro.presence?.activities.find((a) => a.type === ActivityType.Playing)?.name;
  return (jogo ? `🎮 ${jogo} · ${membro.displayName}` : `🎮 Call do ${membro.displayName}`).slice(0, 100);
}

export async function aoMudarVoz(antes: VoiceState, depois: VoiceState) {
  // Entrou no "➕ Calls": cria a call dele e move.
  if (depois.channel && depois.channel.name === CANAIS.criarCall && depois.member) {
    const membro = depois.member;
    const call = await depois.guild.channels.create({
      name: nomeDaCall(membro),
      type: ChannelType.GuildVoice,
      parent: depois.channel.parentId ?? undefined,
      bitrate: depois.channel.bitrate,
    });
    inserir.run(call.id, call.guild.id, membro.id);
    registrar({ guild: membro.guild, userId: membro.id, tipo: 'auto', acao: `ganhou a call temporária "${call.name}"`, canalId: call.id });
    await membro.voice.setChannel(call).catch(async () => {
      // Saiu antes de ser movido: desfaz.
      remover.run(call.id);
      await call.delete().catch(() => {});
    });
  }

  // Saiu de uma call temporária e ela esvaziou: apaga.
  const anterior = antes.channel;
  if (anterior && anterior.id !== depois.channelId && anterior.members.size === 0 && buscar.get(anterior.id)) {
    remover.run(anterior.id);
    registrar({ guild: anterior.guild, userId: antes.member?.id, tipo: 'auto', acao: `saiu por último da call "${anterior.name}", que foi apagada` });
    await anterior.delete('Call temporária vazia').catch(() => {});
  }
}

// Ao ligar, limpa calls temporárias que ficaram vazias enquanto o bot estava desligado.
export async function limparCallsOrfas(client: Client) {
  const linhas = db.prepare('SELECT canal_id FROM calls_temporarias').all() as { canal_id: string }[];
  for (const { canal_id } of linhas) {
    const canal = await client.channels.fetch(canal_id).catch(() => null);
    if (!canal || (canal.type === ChannelType.GuildVoice && canal.members.size === 0)) {
      remover.run(canal_id);
      if (canal) await canal.delete('Call temporária vazia').catch(() => {});
    }
  }
}

export const call: Comando = {
  data: new SlashCommandBuilder()
    .setName('call')
    .setDescription('Controla a sua call temporária (criada pelo "➕ Calls").')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('nome')
        .setDescription('Renomeia a call')
        .addStringOption((o) => o.setName('nome').setDescription('Novo nome').setRequired(true).setMaxLength(90)),
    )
    .addSubcommand((s) =>
      s
        .setName('limite')
        .setDescription('Limita quantas pessoas podem entrar (0 = sem limite)')
        .addIntegerOption((o) => o.setName('vagas').setDescription('Vagas').setRequired(true).setMinValue(0).setMaxValue(99)),
    )
    .addSubcommand((s) => s.setName('trancar').setDescription('Ninguém mais entra (quem já está continua)'))
    .addSubcommand((s) => s.setName('destrancar').setDescription('Libera a entrada de novo'))
    .addSubcommand((s) =>
      s
        .setName('dono')
        .setDescription('Passa o controle da call para outra pessoa')
        .addUserOption((o) => o.setName('membro').setDescription('Novo dono').setRequired(true)),
    ),

  async executar(i) {
    const membro = i.member as GuildMember;
    const canal = membro.voice.channel;
    const registro = canal ? (buscar.get(canal.id) as { dono_id: string } | undefined) : undefined;

    if (!canal || !registro) {
      return i.reply({ content: `Entre em **${CANAIS.criarCall}** para ganhar uma call sua e depois use este comando.`, flags: MessageFlags.Ephemeral });
    }
    if (registro.dono_id !== i.user.id && !ehAdmin(i.guild!, i.user.id)) {
      return i.reply({ content: `Só <@${registro.dono_id}> pode mexer nesta call.`, flags: MessageFlags.Ephemeral });
    }

    const todos = i.guild!.roles.everyone;
    switch (i.options.getSubcommand()) {
      case 'nome': {
        const nome = i.options.getString('nome', true);
        await canal.setName(nome);
        return i.reply(`🔊 Call renomeada para **${nome}**.`);
      }
      case 'limite': {
        const vagas = i.options.getInteger('vagas', true);
        await canal.setUserLimit(vagas);
        return i.reply(vagas ? `👥 Limite de **${vagas}** pessoas.` : '👥 Sem limite de pessoas.');
      }
      case 'trancar':
        await canal.permissionOverwrites.edit(todos, { Connect: false });
        await canal.permissionOverwrites.edit(i.user.id, { Connect: true });
        return i.reply('🔒 Call trancada.');
      case 'destrancar':
        await canal.permissionOverwrites.edit(todos, { Connect: null });
        return i.reply('🔓 Call liberada.');
      case 'dono': {
        const novo = i.options.getUser('membro', true);
        if (!canal.members.has(novo.id)) return i.reply({ content: 'A pessoa precisa estar na call.', flags: MessageFlags.Ephemeral });
        inserir.run(canal.id, canal.guild.id, novo.id);
        return i.reply(`👑 Agora <@${novo.id}> manda nesta call.`);
      }
    }
  },
};
