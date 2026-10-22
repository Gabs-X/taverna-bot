import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type Client,
  type GuildMember,
  type VoiceState,
} from 'discord.js';
import { db } from '../db.ts';
import { criarSala, duracaoTexto } from '../lib/tela.ts';
import type { Comando, HandlerBotao } from '../tipos.ts';

// /tela: compartilhamento de tela por link (o vídeo do Discord não está disponível para a galera).
// Quem pediu recebe, só para si, o botão de começar a compartilhar; no chat sai o botão de assistir.
// A página da tela não avisa o bot quando a tela fecha, então o aviso do chat é encerrado quando a pessoa sai da call,
// clica em "Parei" ou o tempo máximo passa.

type Tela = { msg_id: string; guild_id: string; canal_id: string; user_id: string; call_id: string | null; titulo: string; inicio: number };

const inserir = db.prepare('INSERT INTO telas (msg_id, guild_id, canal_id, user_id, call_id, titulo, inicio) VALUES (?, ?, ?, ?, ?, ?, ?)');
const buscar = db.prepare('SELECT * FROM telas WHERE msg_id = ?');
const remover = db.prepare('DELETE FROM telas WHERE msg_id = ?');
const daCall = db.prepare('SELECT * FROM telas WHERE guild_id = ? AND user_id = ? AND call_id = ?');

const MAX_COM_CALL = 6 * 3_600_000; // sem sair da call: ninguém compartilha tanto tempo assim
const MAX_SEM_CALL = 2 * 3_600_000; // sem call não há como saber quando parou

let cliente: Client | undefined;

/** Troca o aviso do chat por "encerrada" (sem o botão de assistir) e esquece a tela. */
async function encerrar(t: Tela, motivo: string) {
  remover.run(t.msg_id);
  const canal = await cliente?.channels.fetch(t.canal_id).catch(() => null);
  if (!canal?.isTextBased()) return;
  const msg = await canal.messages.fetch(t.msg_id).catch(() => null);
  if (!msg) return;
  const embed = EmbedBuilder.from(msg.embeds[0] ?? {})
    .setColor(0x4f545c)
    .setTitle(`🖥️ ${t.titulo || 'Compartilhamento de tela'} (encerrado)`)
    .setDescription(`<@${t.user_id}> compartilhou a tela por ${duracaoTexto(Date.now() - t.inicio)}. ${motivo}`)
    .setFooter({ text: '/tela para abrir a sua' });
  await msg.edit({ embeds: [embed], components: [], allowedMentions: { parse: [] } }).catch(() => {});
}

export const tela: Comando = {
  data: new SlashCommandBuilder()
    .setName('tela')
    .setDescription('Compartilha sua tela (com o som) por um link: abre no navegador, a voz continua na call')
    .setContexts(InteractionContextType.Guild),

  async executar(i) {
    // Sem opções: título genérico e sempre com o som da tela.
    const sala = criarSala();
    const call = (i.member as GuildMember).voice.channel;
    const botaoCompartilhar = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Começar a compartilhar').setEmoji('🖥️').setURL(sala.compartilhar);

    // 1) Para quem vai compartilhar (só ele vê).
    await i.reply({
      content:
        '🖥️ **Sua sala está pronta.** Clique, escolha a tela ou a janela e pronto.' +
        '\n🔊 Para mandar o som, marque **"Compartilhar áudio"** na janela de escolha do navegador.' +
        '\n▶️ Vai mostrar vídeo (YouTube etc.)? Escolha a **guia do Chrome** com o vídeo em vez da tela inteira, que o som dela vai junto.' +
        '\n🎧 Tela inteira com som leva junto o som do Discord (quem assiste se ouve). Para jogo, desmarque o áudio ou use o botão **Tirar o som** da página.' +
        `\nPara parar, feche a aba e clique em **Parei**${call ? ' (ou só saia da call)' : ''}.`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(botaoCompartilhar)],
      flags: MessageFlags.Ephemeral,
    });

    // 2) No chat, para quem vai assistir.
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: (i.member as GuildMember).displayName, iconURL: i.user.displayAvatarURL() })
      .setTitle('🖥️ Compartilhando a tela')
      .setDescription(
        `${i.user} está compartilhando a tela${call ? ` na call ${call}` : ''}.\n` +
          `Clique em **Assistir**: abre no navegador, sem instalar nada. Com o som da tela.` +
          (call ? '\nA conversa continua na call do Discord.' : ''),
      )
      .setFooter({ text: 'Sala com senha: só quem tem o link vê · /tela para abrir a sua' });
    const msg = await i.followUp({
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Assistir').setEmoji('👀').setURL(sala.assistir))],
      allowedMentions: { parse: [] },
    });

    // 3) Guarda para avisar quando parar, e dá o botão "Parei" para quem compartilha.
    inserir.run(msg.id, i.guildId, msg.channelId, i.user.id, call?.id ?? null, '', Date.now());
    return i.editReply({
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          botaoCompartilhar,
          new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel('Parei').setEmoji('⏹️').setCustomId(`tela:${msg.id}`),
        ),
      ],
    });
  },
};

export const botaoTela: HandlerBotao = {
  prefixo: 'tela',
  async executar(i, msgId) {
    const t = buscar.get(msgId) as Tela | undefined;
    if (t && t.user_id === i.user.id) await encerrar(t, 'Parou pelo botão.');
    return i.update({ content: '⏹️ Pronto, o aviso no chat foi encerrado. Se a aba ainda estiver aberta, feche-a.', components: [] });
  },
};

export const telasAbertas = () => (db.prepare('SELECT COUNT(*) AS n FROM telas').get() as { n: number }).n;

/** Saiu da call (ou trocou de call) com a tela aberta: encerra o aviso. */
export async function aoMudarVozTela(antes: VoiceState, depois: VoiceState) {
  if (!antes.channelId || antes.channelId === depois.channelId || !antes.member) return;
  const telas = daCall.all(antes.guild.id, antes.member.id, antes.channelId) as Tela[];
  for (const t of telas) await encerrar(t, 'Saiu da call.');
}

/** Ao ligar e a cada 10 min: encerra telas de quem já não está na call (bot desligado) ou abertas há tempo demais. */
export function iniciarTelas(c: Client) {
  cliente = c;
  const conferir = async () => {
    for (const t of db.prepare('SELECT * FROM telas').all() as Tela[]) {
      const idade = Date.now() - t.inicio;
      if (t.call_id) {
        const membro = await c.guilds.cache.get(t.guild_id)?.members.fetch(t.user_id).catch(() => null);
        if (membro?.voice.channelId !== t.call_id) await encerrar(t, 'Saiu da call.');
        else if (idade > MAX_COM_CALL) await encerrar(t, 'Encerrado pelo tempo.');
      } else if (idade > MAX_SEM_CALL) await encerrar(t, 'Encerrado pelo tempo.');
    }
  };
  void conferir().catch((e) => console.error('[tela]', e));
  setInterval(() => void conferir().catch((e) => console.error('[tela]', e)), 10 * 60_000).unref();
}
