import { ChannelType, MessageFlags, type ChatInputCommandInteraction, type Guild, type GuildMember, type Role, type TextChannel } from 'discord.js';
import { CANAIS, CARGOS } from '../config.ts';

export const cargoPorNome = (guild: Guild, nome: string): Role | undefined =>
  guild.roles.cache.find((r) => r.name === nome);

export const canalTexto = (guild: Guild, nome: string): TextChannel | undefined =>
  guild.channels.cache.find((c): c is TextChannel => c.type === ChannelType.GuildText && c.name === nome);

export const ehAdmin = (guild: Guild, userId: string): boolean => {
  const membro = guild.members.cache.get(userId);
  if (!membro) return false;
  return membro.permissions.has('Administrator') || membro.roles.cache.some((r) => r.name === CARGOS.admin.nome);
};

// Mestre de qualquer mesa (D&D ou Daggerheart) ou admin.
export const ehMestre = (membro: GuildMember): boolean =>
  membro.roles.cache.some((r) => r.name === CARGOS.mestre.nome) || ehAdmin(membro.guild, membro.id);

/**
 * Atividade com canal próprio: se o canal existe e o comando veio de outro lugar, devolve o aviso
 * (efêmero) mandando para lá. Sem o canal (servidor sem /setup), o comando funciona em qualquer canal.
 */
export function avisoCanalErrado(i: ChatInputCommandInteraction, nomeCanal: string) {
  const canal = canalTexto(i.guild!, nomeCanal);
  if (!canal || canal.id === i.channelId) return undefined;
  const escolha = canalTexto(i.guild!, CANAIS.escolhaJogos);
  return {
    content: `👉 Isso é em ${canal}.${escolha ? ` Não está vendo o canal? Desbloqueie em ${escolha}.` : ''}`,
    flags: MessageFlags.Ephemeral,
  } as const;
}
