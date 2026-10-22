import { EmbedBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { CARGOS } from '../config.ts';
import { cargoPorNome, ehAdmin } from '../lib/servidor.ts';
import type { Comando } from '../tipos.ts';

// Dono e admin dão e tiram o cargo de Staff sem abrir as configurações do servidor.
export const staff: Comando = {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('(Dono e admin) Gerencia quem é da staff')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s.setName('adicionar').setDescription('Dá o cargo de Staff a alguém')
        .addUserOption((o) => o.setName('membro').setDescription('Quem').setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName('remover').setDescription('Tira o cargo de Staff de alguém')
        .addUserOption((o) => o.setName('membro').setDescription('Quem').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Mostra o Dono, os admins e a staff')),

  async executar(i) {
    const guild = i.guild!;
    if (!ehAdmin(guild, i.user.id)) return i.reply({ content: 'Só o Dono e os admins mexem na staff.', flags: MessageFlags.Ephemeral });
    const cargo = cargoPorNome(guild, CARGOS.staff.nome);
    if (!cargo) return i.reply({ content: `O cargo ${CARGOS.staff.nome} ainda não existe. Rode \`/setup\`.`, flags: MessageFlags.Ephemeral });

    if (i.options.getSubcommand() === 'lista') {
      await guild.members.fetch();
      const quem = (nome: string) => cargoPorNome(guild, nome)?.members.map((m) => `${m}`).join(', ') || '_ninguém_';
      const embed = new EmbedBuilder()
        .setColor(CARGOS.staff.cor)
        .setTitle('🛡️ Quem cuida da Taverna')
        .addFields(
          { name: CARGOS.dono.nome, value: quem(CARGOS.dono.nome) },
          { name: CARGOS.admin.nome, value: quem(CARGOS.admin.nome) },
          { name: CARGOS.staff.nome, value: quem(CARGOS.staff.nome) },
        );
      return i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    const membro = await guild.members.fetch(i.options.getUser('membro', true).id).catch(() => null);
    if (!membro || membro.user.bot) return i.reply({ content: 'Escolha uma pessoa do servidor.', flags: MessageFlags.Ephemeral });
    if (!cargo.editable) {
      return i.reply({ content: `Não consigo mexer no ${cargo}: o cargo do bot precisa estar acima dele (Configurações > Cargos).`, flags: MessageFlags.Ephemeral });
    }

    if (i.options.getSubcommand() === 'adicionar') {
      if (membro.roles.cache.has(cargo.id)) return i.reply({ content: `${membro.displayName} já é da staff.`, flags: MessageFlags.Ephemeral });
      await membro.roles.add(cargo, `Staff adicionado por ${i.user.tag}`);
      return i.reply({ content: `🛡️ ${membro} agora é da **staff**: vê os canais de staff e usa \`/limpar\`, \`/castigo\` e \`/logs\`.`, allowedMentions: { users: [membro.id] } });
    }
    if (!membro.roles.cache.has(cargo.id)) return i.reply({ content: `${membro.displayName} não é da staff.`, flags: MessageFlags.Ephemeral });
    await membro.roles.remove(cargo, `Staff removido por ${i.user.tag}`);
    return i.reply({ content: `${membro.displayName} saiu da staff.`, flags: MessageFlags.Ephemeral });
  },
};
