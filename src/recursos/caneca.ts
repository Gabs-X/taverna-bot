import { EmbedBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { CANAIS, CARGOS } from '../config.ts';
import { canalTexto, cargoPorNome, ehStaff } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';
import { registrar } from './registro.ts';

// 🏅 Caneca de Honra: como nas tavernas antigas, quem é muito amigo e presente ganha uma caneca com o nome
// pendurada atrás do balcão. A staff dá com /caneca; aparece separado na lista de membros, logo abaixo da staff,
// e o bot anuncia no #geral.

const FRASES = [
  'já tem a caneca pendurada atrás do balcão, com o nome gravado.',
  'é tão da casa que o taverneiro já enche a caneca sem perguntar o pedido.',
  'nunca deixa a resenha esfriar.',
  'tá sempre aí quando a galera precisa.',
];

export const caneca: Comando = {
  data: new SlashCommandBuilder()
    .setName('caneca')
    .setDescription('(Staff) Caneca de Honra: homenagem a quem é muito amigo e presente')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('dar')
        .setDescription('Dá a Caneca de Honra e anuncia no #geral')
        .addUserOption((o) => o.setName('membro').setDescription('Quem merece').setRequired(true))
        .addStringOption((o) => o.setName('motivo').setDescription('Por que merece (aparece no anúncio)').setMaxLength(200)),
    )
    .addSubcommand((s) =>
      s
        .setName('tirar')
        .setDescription('Tira a Caneca de Honra')
        .addUserOption((o) => o.setName('membro').setDescription('De quem').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Quem tem a Caneca de Honra')),

  async executar(i) {
    const guild = i.guild!;
    if (!ehStaff(guild, i.user.id)) return i.reply({ content: 'Só a staff dá a Caneca de Honra.', flags: MessageFlags.Ephemeral });
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
      if (!membro.roles.cache.has(cargo.id)) return i.reply({ content: `${membro.displayName} não tem a Caneca de Honra.`, flags: MessageFlags.Ephemeral });
      await membro.roles.remove(cargo, `Caneca de Honra tirada por ${i.user.tag}`);
      registrar({ guild, userId: membro.id, tipo: 'auto', acao: `🏅 perdeu a Caneca de Honra (por <@${i.user.id}>)` });
      return i.reply({ content: `${membro.displayName} não tem mais a Caneca de Honra.`, flags: MessageFlags.Ephemeral });
    }

    if (membro.roles.cache.has(cargo.id)) return i.reply({ content: `${membro.displayName} já tem a Caneca de Honra.`, flags: MessageFlags.Ephemeral });
    await membro.roles.add(cargo, `Caneca de Honra dada por ${i.user.tag}`);
    registrar({ guild, userId: membro.id, tipo: 'auto', acao: `🏅 ganhou a Caneca de Honra (de <@${i.user.id}>)` });

    const motivo = i.options.getString('motivo')?.trim();
    const embed = new EmbedBuilder()
      .setColor(CARGOS.honra.cor)
      .setTitle(`🏅 ${membro.displayName} ganhou uma Caneca de Honra!`)
      .setDescription(
        `${membro} ${FRASES[Math.floor(Math.random() * FRASES.length)]}\n` +
          (motivo ? `\n> ${motivo}\n` : '') +
          '\nA partir de hoje tem caneca própria atrás do balcão da Taverna. 🍻',
      )
      .setThumbnail(membro.displayAvatarURL({ size: 256 }));
    const geral = canalTexto(guild, CANAIS.geral);
    await geral?.send({ content: `${membro}`, embeds: [embed], allowedMentions: { users: [membro.id] } }).catch(() => {});
    return i.reply({ content: `🏅 Pronto! ${membro.displayName} ganhou a Caneca de Honra${geral ? ` e foi anunciado em ${geral}` : ''}.`, flags: MessageFlags.Ephemeral });
  },
};
