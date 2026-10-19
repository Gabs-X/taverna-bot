import { ChannelType, type Guild, type Role, type TextChannel } from 'discord.js';
import { CARGOS } from '../config.ts';

export const cargoPorNome = (guild: Guild, nome: string): Role | undefined =>
  guild.roles.cache.find((r) => r.name === nome);

export const canalTexto = (guild: Guild, nome: string): TextChannel | undefined =>
  guild.channels.cache.find((c): c is TextChannel => c.type === ChannelType.GuildText && c.name === nome);

export const ehAdmin = (guild: Guild, userId: string): boolean => {
  const membro = guild.members.cache.get(userId);
  if (!membro) return false;
  return membro.permissions.has('Administrator') || membro.roles.cache.some((r) => r.name === CARGOS.admin.nome);
};
