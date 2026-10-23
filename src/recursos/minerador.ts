import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMember,
} from 'discord.js';
import { CANAIS, CARGOS } from '../config.ts';
import { canalTexto, cargoPorNome, ehStaff } from '../lib/servidor.ts';
import type { Comando, HandlerBotao } from '../tipos.ts';
import { webhookDo } from './campeoes.ts';
import { registrar } from './registro.ts';

// ⛏️ Anão Minerador R&S (Rock and Stone, de Deep Rock Galaxy): homenagem da staff a quem é muito amigo e presente no servidor. A staff dá com
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
    .setDescription('(Staff) Anão Minerador R&S: homenagem a quem é muito amigo e presente')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('dar')
        .setDescription('Dá o cargo de Anão Minerador R&S e anuncia no #geral')
        .addUserOption((o) => o.setName('membro').setDescription('Quem merece').setRequired(true))
        .addStringOption((o) => o.setName('motivo').setDescription('Por que merece (aparece no anúncio)').setMaxLength(200)),
    )
    .addSubcommand((s) =>
      s
        .setName('tirar')
        .setDescription('Tira o cargo de Anão Minerador R&S')
        .addUserOption((o) => o.setName('membro').setDescription('De quem').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Quem é Anão Minerador R&S')),

  async executar(i) {
    const guild = i.guild!;
    if (!ehStaff(guild, i.user.id)) return i.reply({ content: 'Só a staff dá o cargo de Anão Minerador R&S.', flags: MessageFlags.Ephemeral });
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
      if (!membro.roles.cache.has(cargo.id)) return i.reply({ content: `${membro.displayName} não é Anão Minerador R&S.`, flags: MessageFlags.Ephemeral });
      await membro.roles.remove(cargo, `Anão Minerador R&S tirado por ${i.user.tag}`);
      registrar({ guild, userId: membro.id, tipo: 'auto', acao: `⛏️ perdeu o cargo de Anão Minerador R&S (por <@${i.user.id}>)` });
      return i.reply({ content: `${membro.displayName} não é mais Anão Minerador R&S.`, flags: MessageFlags.Ephemeral });
    }

    if (membro.roles.cache.has(cargo.id)) return i.reply({ content: `${membro.displayName} já é Anão Minerador R&S.`, flags: MessageFlags.Ephemeral });
    await membro.roles.add(cargo, `Anão Minerador R&S dado por ${i.user.tag}`);
    registrar({ guild, userId: membro.id, tipo: 'auto', acao: `⛏️ virou Anão Minerador R&S (por <@${i.user.id}>)` });

    const motivo = i.options.getString('motivo')?.trim();
    const embed = new EmbedBuilder()
      .setColor(CARGOS.honra.cor)
      .setTitle(`⛏️ ${membro.displayName} virou Anão Minerador R&S!`)
      .setDescription(
        `${membro} ${FRASES[Math.floor(Math.random() * FRASES.length)]}\n` +
          (motivo ? `\n> ${motivo}\n` : '') +
          '\nA partir de hoje é da guilda dos amigos de verdade da Taverna.\n\n⛏️ **ROCK AND STONE!**',
      )
      .setThumbnail(membro.displayAvatarURL({ size: 256 }));
    const geral = canalTexto(guild, CANAIS.geral);
    // Chama todos os fregueses para gritar junto.
    const fregueses = cargoPorNome(guild, CARGOS.membro.nome);
    await geral
      ?.send({
        content: `${fregueses ?? ''} ${membro} virou Anão Minerador R&S! 🪨 Did I hear a Rock and Stone?`.trim(),
        embeds: [embed],
        components: [botaoGrito(0)],
        allowedMentions: { users: [membro.id], roles: fregueses ? [fregueses.id] : [] },
      })
      .catch(() => {});
    return i.reply({ content: `⛏️ Pronto! ${membro.displayName} virou Anão Minerador R&S${geral ? ` e foi anunciado em ${geral}` : ''}.`, flags: MessageFlags.Ephemeral });
  },
};

// ---------- Botão "ROCK AND STONE!" do anúncio ----------
// Quem gritou fica guardado num campo do próprio anúncio (sobrevive a reinícios do bot); cada pessoa grita uma vez.

const CAMPO_GRITOS = '🪨 Gritaram ROCK AND STONE';

// Falas dos anões de Deep Rock Galaxy: quem clica "fala" uma delas no chat, com o próprio nome e foto.
const FALAS_DRG = [
  'ROCK AND STONE!',
  'Rock and Stone, brother!',
  'Rock and Stone forever!',
  'Rock and Stone to the bone!',
  'For Rock and Stone!',
  'Rock and Stone... yeeeaaahhh!',
  'Did I hear a Rock and Stone?',
  "We're rich! 💰",
  'For Karl! 🍺',
  'Leave no dwarf behind!',
  'Rock solid!',
  'Rock on!',
  'By the beard!',
  'Stone and Rock! ...oh, wait.',
  "If you don't Rock and Stone, you ain't comin' home!",
  "That's it, lads! Rock and Stone!",
  'Karl would have loved this!',
  'Mushroom! 🍄',
  'We are unbreakable!',
  'Rockity rock and stone!',
];
const MAX_NOMES = 40; // o campo do Discord tem 1024 caracteres

const botaoGrito = (total: number) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('rns')
      .setLabel(total ? `ROCK AND STONE! (${total})` : 'ROCK AND STONE!')
      .setEmoji('⛏️')
      .setStyle(ButtonStyle.Success),
  );

export const botaoMinerador: HandlerBotao = {
  prefixo: 'rns',
  async executar(i) {
    const anuncio = i.message.embeds[0];
    if (!anuncio) return i.deferUpdate();
    const campo = anuncio.fields.find((f) => f.name.startsWith(CAMPO_GRITOS));
    const ids = [...(campo?.value.matchAll(/<@(\d+)>/g) ?? [])].map((m) => m[1]);
    const extras = Number(/e mais (\d+)/.exec(campo?.value ?? '')?.[1] ?? 0);
    if (ids.includes(i.user.id)) return i.reply({ content: '⛏️ Você já gritou, anão! **ROCK AND STONE!**', flags: MessageFlags.Ephemeral });

    const total = ids.length + extras + 1;
    const nomes = ids.length < MAX_NOMES ? [...ids, i.user.id] : ids;
    const sobra = total - nomes.length;
    const valor = nomes.map((id) => `<@${id}>`).join(' ') + (sobra ? ` e mais ${sobra}` : '');
    const embed = EmbedBuilder.from(anuncio).setFields(
      ...anuncio.fields.filter((f) => !f.name.startsWith(CAMPO_GRITOS)),
      { name: `${CAMPO_GRITOS} (${total})`, value: valor },
    );
    await i.update({ embeds: [embed], components: [botaoGrito(total)], allowedMentions: { parse: [] } });

    // A pessoa "fala" no chat uma frase de DRG, com o próprio nome e foto (webhook, como os campeões).
    const fala = FALAS_DRG[Math.floor(Math.random() * FALAS_DRG.length)];
    const membro = i.member as GuildMember;
    if (i.channel?.type !== ChannelType.GuildText) return;
    try {
      const gancho = await webhookDo(i.channel, i.client.user.id);
      await gancho.send({ content: `⛏️ ${fala}`, username: membro.displayName.slice(0, 80), avatarURL: membro.displayAvatarURL(), allowedMentions: { parse: [] } });
    } catch {
      // Sem a permissão "Gerenciar webhooks": manda pelo próprio bot, no formato de fala.
      await i.channel.send({ content: `⛏️ **${membro.displayName}**: ${fala}`, allowedMentions: { parse: [] } }).catch(() => {});
    }
  },
};
