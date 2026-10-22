import { ChannelType, MessageFlags, type ChatInputCommandInteraction, type Client, type Guild, type GuildMember, type Role, type TextChannel } from 'discord.js';
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

/**
 * Emoji próprio do servidor (os da Taverna, enviados pelo /setup) em formato de mensagem (<:nome:id>).
 * Se o servidor ainda não tem esse emoji, usa o emoji comum de reserva.
 */
let cliente: Client | undefined;
/** Guarda o client para o emoji() achar o servidor só pelo ID (ex.: retrato da gótica, que só tem o guild_id). */
export const registrarCliente = (c: Client) => {
  cliente = c;
};

export function emoji(servidor: Guild | string | null | undefined, nome: string, reserva: string): string {
  const guild = typeof servidor === 'string' ? cliente?.guilds.cache.get(servidor) : servidor;
  const e = guild?.emojis.cache.find((x) => x.name === nome && x.available !== false);
  return e ? e.toString() : reserva;
}
