import { EmbedBuilder, MessageFlags, Routes, type ChatInputCommandInteraction, type Guild, type GuildMember, type Role } from 'discord.js';
import { CARGOS } from '../config.ts';
import { db } from '../db.ts';
import { CORES, corPorId, ITENS_TAVERNA, nomeCargoCor, novoFimDoDobro, PRECO_COR, PRECO_XP_DOBRO } from '../lib/lojaTaverna.ts';
import { cargoPorNome } from '../lib/servidor.ts';
import { carteira, gastarMoedas, moedas } from './economia.ts';

// Loja da Taverna: cores de nome (cargos de cor) e XP em dobro. As cores compradas ficam suas para trocar à vontade.


const efemera = (content: string) => ({ content, flags: MessageFlags.Ephemeral }) as const;
const tem = (g: string, u: string, item: string) => !!db.prepare('SELECT 1 FROM taverna_itens WHERE guild_id = ? AND user_id = ? AND item = ?').get(g, u, item);

/**
 * Cargo da cor (cria se ainda não existe). Fica logo abaixo da Staff: acima dos cargos de nível,
 * senão a cor do nível apareceria no lugar da comprada.
 */
async function cargoDaCor(guild: Guild, id: string): Promise<Role> {
  const c = corPorId(id)!;
  const existente = cargoPorNome(guild, nomeCargoCor(c));
  if (existente) return existente;
  const cargo = await guild.roles.create({ name: nomeCargoCor(c), colors: { primaryColor: c.cor }, hoist: false, mentionable: false, reason: 'Cor comprada na loja da Taverna' });
  const staff = cargoPorNome(guild, CARGOS.staff.nome);
  if (staff) {
    await guild.client.rest
      .patch(Routes.guildRoles(guild.id), { body: [{ id: cargo.id, position: Math.max(1, staff.position - 1) }], reason: 'Cor acima dos cargos de nível' })
      .catch(() => {});
  }
  return cargo;
}

/** Tira todas as cores e põe a escolhida (ou nenhuma). */
async function vestirCor(membro: GuildMember, id: string | null) {
  const nomes = new Set(CORES.map((c) => nomeCargoCor(c)));
  const tirar = membro.roles.cache.filter((r) => nomes.has(r.name));
  if (tirar.size) await membro.roles.remove(tirar, 'Troca de cor (loja da Taverna)');
  if (id) await membro.roles.add(await cargoDaCor(membro.guild, id), 'Cor da loja da Taverna');
}

export async function executarLojaTaverna(i: ChatInputCommandInteraction) {
  const g = i.guildId!;
  const u = i.user.id;
  const membro = i.member as GuildMember;
  const sub = i.options.getSubcommand();

  if (sub === 'ver') {
    const c = carteira(g, u);
    const dobro = c.xp_dobro_ate > Date.now() ? `\n⚡ XP em dobro valendo até <t:${Math.floor(c.xp_dobro_ate / 1000)}:f>.` : '';
    const usando = membro.roles.cache.find((r) => CORES.some((cor) => nomeCargoCor(cor) === r.name))?.name;
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🛒 Loja da Taverna')
      .setDescription(`Seu saldo: **${moedas(i.guild, c.moedas)}**${dobro}`)
      .addFields(
        {
          name: `🎨 Cor do nome · ${moedas(i.guild, PRECO_COR)} cada`,
          value: CORES.map((cor) => `${cor.emoji} ${cor.nome}${usando === nomeCargoCor(cor) ? ' · ✅ usando' : tem(g, u, cor.id) ? ' · comprada' : ''}`).join('\n'),
        },
        { name: `⚡ XP em dobro · ${moedas(i.guild, PRECO_XP_DOBRO)}`, value: 'Conversar e ficar em call rendem o dobro de XP por 24 h (comprar de novo soma mais 24 h).' },
      )
      .setFooter({ text: 'Compre com /loja taverna comprar · troque de cor com /loja taverna equipar · tire com /loja taverna tirar-cor' });
    return i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (sub === 'tirar-cor') {
    await vestirCor(membro, null);
    return i.reply(efemera('Seu nome voltou à cor normal. As cores que você comprou continuam suas.'));
  }

  const id = i.options.getString('item', true);
  const item = ITENS_TAVERNA.find((x) => x.id === id)!;

  if (sub === 'equipar') {
    if (!corPorId(id)) return i.reply(efemera('Só dá para equipar cores.'));
    if (!tem(g, u, id)) return i.reply(efemera(`Você ainda não tem ${item.emoji} ${item.nome}. Compre com \`/loja taverna comprar\`.`));
    await vestirCor(membro, id);
    return i.reply({ content: `${item.emoji} ${membro} agora está de **${corPorId(id)!.nome}**!`, allowedMentions: { parse: [] } });
  }

  // comprar
  if (corPorId(id) && tem(g, u, id)) return i.reply(efemera(`Você já tem essa cor. Use \`/loja taverna equipar\`.`));
  if (!gastarMoedas(g, u, item.preco)) {
    const saldo = carteira(g, u).moedas;
    return i.reply(efemera(`Faltam ${moedas(i.guild, item.preco - saldo)} para ${item.nome} (você tem ${moedas(i.guild, saldo)}).`));
  }
  if (id === 'xp-dobro') {
    const fim = novoFimDoDobro(carteira(g, u).xp_dobro_ate, Date.now());
    db.prepare('UPDATE carteira SET xp_dobro_ate = ? WHERE guild_id = ? AND user_id = ?').run(fim, g, u);
    return i.reply({ content: `⚡ ${membro} ativou **XP em dobro** até <t:${Math.floor(fim / 1000)}:f>!`, allowedMentions: { parse: [] } });
  }
  db.prepare('INSERT INTO taverna_itens (guild_id, user_id, item) VALUES (?, ?, ?)').run(g, u, id);
  try {
    await vestirCor(membro, id);
  } catch {
    return i.reply(efemera(`Comprado! Mas não consegui colocar a cor agora (o cargo do bot precisa estar acima). Tente \`/loja taverna equipar\` depois.`));
  }
  return i.reply({ content: `${item.emoji} ${membro} comprou **${corPorId(id)!.nome}** e já está usando!`, allowedMentions: { parse: [] } });
}

export const escolhasItensTaverna = ITENS_TAVERNA.map((x) => ({ name: `${x.nome} (${x.preco})`, value: x.id }));
export const escolhasCores = CORES.map((c) => ({ name: c.nome, value: c.id }));
