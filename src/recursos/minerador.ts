import { EmbedBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { CANAIS, CARGOS } from '../config.ts';
import { canalTexto, cargoPorNome, ehStaff } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';
import { registrar } from './registro.ts';

// ⛏️ Anão Minerador RnS (Rock and Stone, de Deep Rock Galaxy): homenagem da staff a quem é muito amigo e presente no servidor. A staff dá com
// /minerador; aparece separado na lista de membros, logo abaixo da staff, e o bot anuncia no #geral.

const FRASES = [
  "cavou tão fundo na amizade da Taverna que achou ouro. **We're rich!** 💰",
  'nunca deixa um anão para trás. **Leave no dwarf behind!**',
  'brindou no bar da estação espacial e mandou um **For Karl!** 🍺',
  'tá sempre aí quando a galera precisa, firme que nem rocha.',
];

export const minerador: Comando = {
  data: new SlashCommandBuilder()
    .setName('minerador')
    .setDescription('(Staff) Anão Minerador RnS: homenagem a quem é muito amigo e presente')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('dar')
        .setDescription('Dá o cargo de Anão Minerador RnS e anuncia no #geral')
        .addUserOption((o) => o.setName('membro').setDescription('Quem merece').setRequired(true))
        .addStringOption((o) => o.setName('motivo').setDescription('Por que merece (aparece no anúncio)').setMaxLength(200)),
    )
    .addSubcommand((s) =>
      s
        .setName('tirar')
        .setDescription('Tira o cargo de Anão Minerador RnS')
        .addUserOption((o) => o.setName('membro').setDescription('De quem').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Quem é Anão Minerador RnS')),

  async executar(i) {
    const guild = i.guild!;
    if (!ehStaff(guild, i.user.id)) return i.reply({ content: 'Só a staff dá o cargo de Anão Minerador RnS.', flags: MessageFlags.Ephemeral });
    const cargo = cargoPorNome(guild, CARGOS.honra.nome);
    if (!cargo) return i.reply({ content: `O cargo ${CARGOS.honra.nome} ainda não existe. Peça a um admin para rodar \`/setup\`.`, flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand();

    if (sub === 'lista') {
      await guild.members.fetch();
      const quem = cargo.members.map((m) => `${m}`).join(', ') || '_ninguém ainda_';
      return i.reply({ content: `${CARGOS.honra.nome}: ${quem}`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    const membro = await guild.members.fetch(i.options.getUser('membro', true).id).catch(() => null);
    if (!membro || membro.user.bot) return i.reply({ content: 'Escolha uma pessoa do servidor.', flags: MessageFlags.Ephemeral });

    if (sub === 'tirar') {
      if (!membro.roles.cache.has(cargo.id)) return i.reply({ content: `${membro.displayName} não é Anão Minerador RnS.`, flags: MessageFlags.Ephemeral });
      await membro.roles.remove(cargo, `Anão Minerador RnS tirado por ${i.user.tag}`);
      registrar({ guild, userId: membro.id, tipo: 'auto', acao: `⛏️ perdeu o cargo de Anão Minerador RnS (por <@${i.user.id}>)` });
      return i.reply({ content: `${membro.displayName} não é mais Anão Minerador RnS.`, flags: MessageFlags.Ephemeral });
    }

    if (membro.roles.cache.has(cargo.id)) return i.reply({ content: `${membro.displayName} já é Anão Minerador RnS.`, flags: MessageFlags.Ephemeral });
    await membro.roles.add(cargo, `Anão Minerador RnS dado por ${i.user.tag}`);
    registrar({ guild, userId: membro.id, tipo: 'auto', acao: `⛏️ virou Anão Minerador RnS (por <@${i.user.id}>)` });

    const motivo = i.options.getString('motivo')?.trim();
    const embed = new EmbedBuilder()
      .setColor(CARGOS.honra.cor)
      .setTitle(`⛏️ ${membro.displayName} virou Anão Minerador RnS!`)
      .setDescription(
        `${membro} ${FRASES[Math.floor(Math.random() * FRASES.length)]}\n` +
          (motivo ? `\n> ${motivo}\n` : '') +
          '\nA partir de hoje é da guilda dos amigos de verdade da Taverna.\n\n⛏️ **ROCK AND STONE!**',
      )
      .setThumbnail(membro.displayAvatarURL({ size: 256 }));
    const geral = canalTexto(guild, CANAIS.geral);
    await geral?.send({ content: `${membro} 🪨 Did I hear a Rock and Stone?`, embeds: [embed], allowedMentions: { users: [membro.id] } }).catch(() => {});
    return i.reply({ content: `⛏️ Pronto! ${membro.displayName} virou Anão Minerador RnS${geral ? ` e foi anunciado em ${geral}` : ''}.`, flags: MessageFlags.Ephemeral });
  },
};
