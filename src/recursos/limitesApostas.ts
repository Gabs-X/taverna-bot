import { EmbedBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type Guild } from 'discord.js';
import { db } from '../db.ts';
import { LIMITE_DIARIO } from '../lib/cassino.ts';
import { ehStaff } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';
import { moedas } from './economia.ts';
import { registrar } from './registro.ts';

// /apostas: a staff define o máximo por aposta (/desafiar, /gotica duelo e /cassino) e quanto cada pessoa
// pode apostar por dia no cassino. Fica salvo por servidor em config_servidor.

export type Limites = { porAposta: number; cassinoDia: number }; // porAposta 0 = sem limite
const PADRAO: Limites = { porAposta: 0, cassinoDia: LIMITE_DIARIO };
const CHAVES = { porAposta: 'aposta_maxima', cassinoDia: 'cassino_limite_diario' } as const;

const ler = db.prepare('SELECT valor FROM config_servidor WHERE guild_id = ? AND chave = ?');
const gravar = db.prepare('INSERT INTO config_servidor (guild_id, chave, valor) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET valor = excluded.valor');

export function limitesApostas(guildId: string): Limites {
  const valor = (chave: keyof Limites) => {
    const linha = ler.get(guildId, CHAVES[chave]) as { valor: string } | undefined;
    return linha ? Number(linha.valor) : PADRAO[chave];
  };
  return { porAposta: valor('porAposta'), cassinoDia: valor('cassinoDia') };
}

/** Motivo para recusar a aposta, se passar do máximo que a staff definiu. */
export function apostaAcimaDoLimite(guild: Guild | null, aposta: number): string | undefined {
  if (!guild) return undefined;
  const { porAposta } = limitesApostas(guild.id);
  if (porAposta && aposta > porAposta) return `🛑 A aposta máxima da Taverna é ${moedas(guild, porAposta)}.`;
  return undefined;
}

export const apostas: Comando = {
  data: new SlashCommandBuilder()
    .setName('apostas')
    .setDescription('(Staff) Limites de aposta do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('ver').setDescription('Mostra os limites de aposta atuais'))
    .addSubcommand((s) =>
      s
        .setName('definir')
        .setDescription('Muda os limites (deixe em branco o que não quiser mudar)')
        .addIntegerOption((o) => o.setName('por_aposta').setDescription('Máximo em uma aposta (/desafiar, /gotica duelo, /cassino). 0 = sem limite').setMinValue(0).setMaxValue(1_000_000))
        .addIntegerOption((o) => o.setName('cassino_por_dia').setDescription(`Quanto cada pessoa pode apostar por dia no cassino (padrão ${LIMITE_DIARIO})`).setMinValue(10).setMaxValue(1_000_000)),
    ),

  async executar(i) {
    const guild = i.guild!;
    if (!ehStaff(guild, i.user.id)) return i.reply({ content: 'Só a staff mexe nos limites de aposta.', flags: MessageFlags.Ephemeral });

    if (i.options.getSubcommand() === 'definir') {
      const porAposta = i.options.getInteger('por_aposta');
      const cassinoDia = i.options.getInteger('cassino_por_dia');
      if (porAposta === null && cassinoDia === null) return i.reply({ content: 'Diga pelo menos um limite para mudar.', flags: MessageFlags.Ephemeral });
      if (porAposta !== null) gravar.run(guild.id, CHAVES.porAposta, String(porAposta));
      if (cassinoDia !== null) gravar.run(guild.id, CHAVES.cassinoDia, String(cassinoDia));
      registrar({ guild, userId: i.user.id, tipo: 'auto', acao: `🎰 mudou os limites de aposta (${[porAposta !== null && `por aposta: ${porAposta || 'sem limite'}`, cassinoDia !== null && `cassino por dia: ${cassinoDia}`].filter(Boolean).join(', ')})` });
    }

    const l = limitesApostas(guild.id);
    const embed = new EmbedBuilder()
      .setColor(0xf5b544)
      .setTitle(i.options.getSubcommand() === 'definir' ? '🎰 Limites de aposta atualizados' : '🎰 Limites de aposta')
      .addFields(
        { name: 'Máximo por aposta', value: l.porAposta ? moedas(guild, l.porAposta) : 'Sem limite (só o saldo de cada um)', inline: true },
        { name: 'Cassino por dia', value: `${moedas(guild, l.cassinoDia)} por pessoa`, inline: true },
      )
      .setFooter({ text: 'O máximo por aposta vale para /desafiar, /gotica duelo e /cassino' });
    return i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
