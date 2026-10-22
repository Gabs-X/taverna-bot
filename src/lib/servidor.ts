import { ChannelType, type ChatInputCommandInteraction, type Client, type Guild, type GuildBasedChannel, type GuildMember, type Role, type TextChannel } from 'discord.js';
import { CANAIS, CARGOS } from '../config.ts';
import { db } from '../db.ts';

// Canais e cargos são achados pelo nome do plano (config.ts) só na primeira vez; daí o ID fica salvo
// e vale mesmo que alguém renomeie no Discord.
const lerId = db.prepare('SELECT id FROM ids_servidor WHERE guild_id = ? AND tipo = ? AND chave = ?');
const salvarId = db.prepare('INSERT INTO ids_servidor (guild_id, tipo, chave, id) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET id = excluded.id');

function porChave<T extends { id: string }>(guild: Guild, tipo: string, chave: string, porId: (id: string) => T | undefined, porNome: () => T | undefined) {
  const salvo = (lerId.get(guild.id, tipo, chave) as { id: string } | undefined)?.id;
  const achado = (salvo && porId(salvo)) || porNome();
  if (achado && achado.id !== salvo) salvarId.run(guild.id, tipo, chave, achado.id);
  return achado || undefined;
}

export const cargoPorNome = (guild: Guild, nome: string): Role | undefined =>
  porChave(guild, 'cargo', nome, (id) => guild.roles.cache.get(id), () => guild.roles.cache.find((r) => r.name === nome));

/** Canal do plano de qualquer tipo (texto, voz, categoria), pelo ID salvo ou, na primeira vez, pelo nome. */
export function canalPorNome<T extends GuildBasedChannel>(guild: Guild, nome: string, tipo: ChannelType): T | undefined {
  return porChave(
    guild,
    `canal-${tipo}`,
    nome,
    (id) => {
      const c = guild.channels.cache.get(id);
      return c?.type === tipo ? (c as T) : undefined;
    },
    () => guild.channels.cache.find((c) => c.type === tipo && c.name === nome) as T | undefined,
  );
}

export const canalTexto = (guild: Guild, nome: string): TextChannel | undefined => canalPorNome<TextChannel>(guild, nome, ChannelType.GuildText);

const temCargo = (membro: GuildMember, nome: string) => {
  const cargo = cargoPorNome(membro.guild, nome);
  return !!cargo && membro.roles.cache.has(cargo.id);
};

export const ehAdmin = (guild: Guild, userId: string): boolean => {
  const membro = guild.members.cache.get(userId);
  if (!membro) return false;
  return membro.permissions.has('Administrator') || temCargo(membro, CARGOS.admin.nome) || temCargo(membro, CARGOS.dono.nome);
};

/** Staff e acima (Staff, Taverneiro, Dono ou quem tem Administrador). */
export const ehStaff = (guild: Guild, userId: string): boolean =>
  ehAdmin(guild, userId) || (() => {
    const membro = guild.members.cache.get(userId);
    return !!membro && temCargo(membro, CARGOS.staff.nome);
  })();

// Mestre de qualquer mesa (D&D ou Daggerheart) ou admin.
export const ehMestre = (membro: GuildMember): boolean =>
  temCargo(membro, CARGOS.mestre.nome) || ehAdmin(membro.guild, membro.id);

/**
 * Comando com canal próprio: se veio de outro lugar, devolve o aviso dizendo onde usar. É público (o efêmero
 * passa despercebido, sobretudo no chat das calls) e o index apaga depois de alguns segundos.
 * Se nenhum dos canais existe (servidor sem /setup), o comando funciona em qualquer canal.
 */
export function avisoCanalErrado(i: ChatInputCommandInteraction, nomesCanais: readonly string[]) {
  const canais = nomesCanais.map((n) => canalTexto(i.guild!, n)).filter((c): c is TextChannel => !!c);
  if (!canais.length || canais.some((c) => c.id === i.channelId)) return undefined;
  const lista = canais.length === 1 ? `${canais[0]}` : `${canais.slice(0, -1).join(', ')} ou ${canais.at(-1)}`;
  // Canal trancado por cargo (atividade, mesa de RPG): explica onde desbloquear.
  const membro = i.member as GuildMember | null;
  const naoVe = !!membro && canais.every((c) => !c.permissionsFor(membro).has('ViewChannel'));
  const escolha = canalTexto(i.guild!, CANAIS.escolhaJogos);
  const dica = naoVe && escolha ? `\nNão está vendo o canal? Desbloqueie em ${escolha}.` : '';
  return {
    content: `👉 ${i.user}, o \`/${i.commandName}\` só funciona em ${lista}. Manda lá!${dica}`,
    allowedMentions: { users: [i.user.id] },
  };
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
