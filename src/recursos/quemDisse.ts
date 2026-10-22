import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder, type Message } from 'discord.js';
import { db } from '../db.ts';
import { opcoesQuemDisse } from '../lib/quemDisse.ts';
import type { Comando, HandlerBotao } from '../tipos.ts';
import { darMoedas, moedas } from './economia.ts';

// /quemdisse: uma citação salva do servidor e 4 nomes; o primeiro a acertar quem falou ganha moedas.

const TEMPO = 30_000;
const PREMIO = 25;

type Citacao = { autor_id: string; texto: string; canal_id: string; msg_id: string; em: number };
type Rodada = { citacao: Citacao; opcoes: string[]; nomes: string[]; tentaram: Set<string>; mensagem: Message; timer: NodeJS.Timeout };
const rodadas = new Map<string, Rodada>(); // id da mensagem → rodada

const botoes = (r: Pick<Rodada, 'opcoes' | 'nomes' | 'citacao'>, revelar = false) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    r.nomes.map((nome, k) =>
      new ButtonBuilder()
        .setCustomId(`quemdisse:${k}`)
        .setLabel(nome.slice(0, 80))
        .setStyle(revelar ? (r.opcoes[k] === r.citacao.autor_id ? ButtonStyle.Success : ButtonStyle.Secondary) : ButtonStyle.Primary)
        .setDisabled(revelar),
    ),
  );

/** Mostra quem disse (com o link da mensagem original) e trava os botões. */
async function revelar(id: string, vencedor?: string) {
  const r = rodadas.get(id);
  if (!r) return;
  rodadas.delete(id);
  clearTimeout(r.timer);
  const c = r.citacao;
  const link = `https://discord.com/channels/${r.mensagem.guildId}/${c.canal_id}/${c.msg_id}`;
  const embed = EmbedBuilder.from(r.mensagem.embeds[0])
    .setColor(vencedor ? 0x3ba55d : 0x4f545c)
    .addFields({
      name: 'Quem disse',
      value: `<@${c.autor_id}> em <t:${Math.floor(c.em / 1000)}:D> · [ver a mensagem](${link})\n` +
        (vencedor ? `🎉 <@${vencedor}> acertou e ganhou ${moedas(r.mensagem.guild, PREMIO)}!` : '⌛ Ninguém acertou.'),
    })
    .setFooter({ text: '/quemdisse para outra rodada' });
  await r.mensagem.edit({ embeds: [embed], components: [botoes(r, true)], allowedMentions: { parse: [] } }).catch(() => {});
}

export const quemdisse: Comando = {
  data: new SlashCommandBuilder()
    .setName('quemdisse')
    .setDescription('Uma frase salva da galera: acerte quem falou e ganhe moedas')
    .setContexts(InteractionContextType.Guild),

  async executar(i) {
    const g = i.guildId!;
    const c = db.prepare('SELECT * FROM citacoes WHERE guild_id = ? ORDER BY RANDOM() LIMIT 1').get(g) as Citacao | undefined;
    if (!c) return i.reply({ content: 'Ainda não há citações salvas. Botão direito numa mensagem → **Apps** → **Salvar citação**.', flags: MessageFlags.Ephemeral });

    await i.deferReply();
    const autores = (db.prepare('SELECT DISTINCT autor_id FROM citacoes WHERE guild_id = ?').all(g) as { autor_id: string }[]).map((a) => a.autor_id);
    const membros = i.guild!.members.cache.filter((m) => !m.user.bot).map((m) => m.id);
    const opcoes = opcoesQuemDisse(c.autor_id, autores, membros);
    if (opcoes.length < 2) return i.editReply('Preciso de pelo menos 2 pessoas no servidor para dar alternativas.');
    const achados = await i.guild!.members.fetch({ user: opcoes }).catch(() => null);
    const nomes = opcoes.map((id) => achados?.get(id)?.displayName ?? 'Alguém que saiu');

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🗣️ Quem disse?')
      .setDescription(`>>> ${c.texto.slice(0, 1500)}`)
      .setFooter({ text: `Um chute por pessoa · 30 segundos · o primeiro a acertar ganha ${PREMIO} moedas` });
    const mensagem = await i.editReply({ embeds: [embed], components: [botoes({ opcoes, nomes, citacao: c })], allowedMentions: { parse: [] } });
    rodadas.set(mensagem.id, { citacao: c, opcoes, nomes, tentaram: new Set(), mensagem, timer: setTimeout(() => void revelar(mensagem.id), TEMPO) });
  },
};

export const botaoQuemDisse: HandlerBotao = {
  prefixo: 'quemdisse',
  async executar(i, argumento) {
    const r = rodadas.get(i.message.id);
    if (!r) return i.reply({ content: 'Essa rodada já acabou. Use `/quemdisse` para outra.', flags: MessageFlags.Ephemeral });
    if (r.tentaram.has(i.user.id)) return i.reply({ content: 'Você já chutou nessa rodada.', flags: MessageFlags.Ephemeral });
    r.tentaram.add(i.user.id);
    if (r.opcoes[Number(argumento)] !== r.citacao.autor_id) {
      return i.reply({ content: `❌ Não foi **${r.nomes[Number(argumento)]}**. Agora é torcer para ninguém acertar.`, flags: MessageFlags.Ephemeral });
    }
    darMoedas(i.guildId!, i.user.id, PREMIO);
    await i.deferUpdate();
    return revelar(i.message.id, i.user.id);
  },
};
