import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { db } from '../db.ts';
import { assaltar as tentarAssalto, FRASES_ASSALTO, MINIMO_LADRAO, MINIMO_VITIMA, PROTECAO_ASSALTO, resolverDesafio, type JogoDesafio } from '../lib/apostas.ts';
import type { Comando, HandlerBotao } from '../tipos.ts';
import { carteira, darMoedas, gastarMoedas, moedas } from './economia.ts';
import { executarDuelo } from './goticaSocial.ts';
import { registrar } from './registro.ts';

// /desafiar: cara ou coroa, dado ou duelo de góticas valendo moedas entre dois membros (quem ganha leva as duas apostas).
// /assaltar: tenta roubar moedas de alguém; se for pego, paga multa para a vítima.

const PRAZO_CONVITE = 2 * 60_000;
const sortear = <T>(lista: readonly T[]) => lista[Math.floor(Math.random() * lista.length)];
const tempo = (ms: number) => `<t:${Math.ceil(ms / 1000)}:R>`;

type Convite = { guildId: string; a: string; b: string; aposta: number; jogo: JogoDesafio; timer: NodeJS.Timeout };
const convites = new Map<string, Convite>(); // id da mensagem → convite
export const desafiosEmAndamento = () => convites.size;

const NOME_JOGO: Record<JogoDesafio, string> = { moeda: '🪙 cara ou coroa', dado: '🎲 dado (maior d20)' };

export const desafiar: Comando = {
  data: new SlashCommandBuilder()
    .setName('desafiar')
    .setDescription('Desafia alguém valendo moedas: quem ganha leva as duas apostas')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('Quem você desafia').setRequired(true))
    .addIntegerOption((o) => o.setName('aposta').setDescription('Quantas moedas cada um coloca').setRequired(true).setMinValue(10))
    .addStringOption((o) =>
      o.setName('jogo').setDescription('Valendo o quê (padrão: cara ou coroa)').addChoices(
        { name: '🪙 Cara ou coroa (você é cara)', value: 'moeda' },
        { name: '🎲 Dado: maior d20 ganha', value: 'dado' },
        { name: '⚔️ Duelo de góticas', value: 'duelo' },
      ),
    ),

  async executar(i) {
    const g = i.guildId!;
    const alvo = i.options.getUser('membro', true);
    const aposta = i.options.getInteger('aposta', true);
    const jogo = i.options.getString('jogo') ?? 'moeda';
    if (alvo.id === i.user.id || alvo.bot) return i.reply({ content: 'Desafie outra pessoa (bots não apostam).', flags: MessageFlags.Ephemeral });
    if (carteira(g, i.user.id).moedas < aposta) return i.reply({ content: `Você não tem ${moedas(i.guild, aposta)} para apostar.`, flags: MessageFlags.Ephemeral });
    if (jogo === 'duelo') return executarDuelo(i, aposta);

    const embed = new EmbedBuilder()
      .setColor(0xf5b544)
      .setTitle(`🤝 Desafio valendo ${moedas(i.guild, aposta)}!`)
      .setDescription(`${i.user} desafiou ${alvo} no **${NOME_JOGO[jogo as JogoDesafio]}**.\nCada um coloca ${moedas(i.guild, aposta)}; quem ganha leva ${moedas(i.guild, aposta * 2)}.`)
      .setFooter({ text: 'O convite vale por 2 minutos.' });
    const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('desafio:aceitar').setLabel('Aceitar').setEmoji('🤝').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('desafio:recusar').setLabel('Recusar').setEmoji('🏃').setStyle(ButtonStyle.Secondary),
    );
    const msg = await i.reply({ content: `${alvo}, você foi desafiado!`, embeds: [embed], components: [botoes], allowedMentions: { users: [alvo.id] }, withResponse: true });
    const id = msg.resource!.message!.id;
    convites.set(id, {
      guildId: g, a: i.user.id, b: alvo.id, aposta, jogo: jogo as JogoDesafio,
      timer: setTimeout(() => {
        convites.delete(id);
        i.editReply({ content: '⌛ Ninguém respondeu, o desafio foi cancelado.', components: [] }).catch(() => {});
      }, PRAZO_CONVITE),
    });
  },
};

export const botaoDesafio: HandlerBotao = {
  prefixo: 'desafio',
  async executar(i, acao) {
    const c = convites.get(i.message.id);
    if (!c) return i.reply({ content: 'Esse desafio já acabou.', flags: MessageFlags.Ephemeral });
    if (i.user.id !== c.b) return i.reply({ content: 'Só quem foi desafiado pode responder.', flags: MessageFlags.Ephemeral });
    if (acao === 'recusar') {
      clearTimeout(c.timer);
      convites.delete(i.message.id);
      return i.update({ content: `🏃 <@${c.b}> recusou o desafio.`, components: [], allowedMentions: { parse: [] } });
    }
    if (!gastarMoedas(c.guildId, c.b, c.aposta)) return i.reply({ content: `Você não tem ${moedas(i.guild, c.aposta)} para cobrir a aposta.`, flags: MessageFlags.Ephemeral });
    clearTimeout(c.timer);
    convites.delete(i.message.id);
    if (!gastarMoedas(c.guildId, c.a, c.aposta)) {
      darMoedas(c.guildId, c.b, c.aposta);
      return i.update({ content: `💸 <@${c.a}> gastou as moedas antes e não cobre mais a aposta. Desafio cancelado.`, embeds: [], components: [], allowedMentions: { parse: [] } });
    }

    const r = resolverDesafio(c.jogo);
    const vencedor = r.venceu === 'a' ? c.a : c.b;
    darMoedas(c.guildId, vencedor, c.aposta * 2);
    const como =
      'rolagens' in r && r.rolagens
        ? r.rolagens.map(([x, y], k) => `${k ? 'Empate! De novo: ' : ''}<@${c.a}> 🎲 **${x}** × **${y}** 🎲 <@${c.b}>`).join('\n')
        : `🪙 A moeda girou e ${'texto' in r ? r.texto : ''} (<@${c.a}> era cara).`;
    const embed = new EmbedBuilder()
      .setColor(0x3ba55d)
      .setTitle(`🏆 Desafio de ${moedas(i.guild, c.aposta)}: ${c.jogo === 'moeda' ? 'cara ou coroa' : 'dado'}`)
      .setDescription(`${como}\n\n🎉 <@${vencedor}> levou **${moedas(i.guild, c.aposta * 2)}**!`);
    return i.update({ content: '', embeds: [embed], components: [], allowedMentions: { parse: [] } });
  },
};

// ---------- Assalto ----------

type LinhaAssalto = { ultimo_assalto: number; protegido_ate: number };
const lerAssalto = (g: string, u: string) =>
  (db.prepare('SELECT ultimo_assalto, protegido_ate FROM assaltos WHERE guild_id = ? AND user_id = ?').get(g, u) as LinhaAssalto | undefined) ?? { ultimo_assalto: 0, protegido_ate: 0 };
const gravarAssalto = db.prepare(
  'INSERT INTO assaltos (guild_id, user_id, ultimo_assalto, protegido_ate) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET ultimo_assalto = MAX(ultimo_assalto, excluded.ultimo_assalto), protegido_ate = MAX(protegido_ate, excluded.protegido_ate)',
);

export const assaltar: Comando = {
  data: new SlashCommandBuilder()
    .setName('assaltar')
    .setDescription('Tenta roubar moedas de alguém (40% de chance; se for pego, paga multa)')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('Quem você vai assaltar').setRequired(true)),

  async executar(i) {
    const g = i.guildId!;
    const alvo = i.options.getUser('membro', true);
    if (alvo.id === i.user.id || alvo.bot) return i.reply({ content: 'Assalte outra pessoa (bots não têm carteira).', flags: MessageFlags.Ephemeral });
    const agora = Date.now();
    const r = tentarAssalto(
      { moedas: carteira(g, i.user.id).moedas, ultimoAssalto: lerAssalto(g, i.user.id).ultimo_assalto },
      { moedas: carteira(g, alvo.id).moedas, protegidoAte: lerAssalto(g, alvo.id).protegido_ate },
      agora,
    );
    if (!r.ok) {
      const motivo = {
        espera: () => `🚓 A guarda ainda está de olho em você. Tente de novo ${tempo((r as { ate: number }).ate)}.`,
        protegido: () => `🛡️ ${alvo} foi assaltado há pouco e está com segurança reforçada até ${tempo((r as { ate: number }).ate)}.`,
        'vitima-pobre': () => `😅 ${alvo} tem menos de ${moedas(i.guild, MINIMO_VITIMA)}. Nem compensa.`,
        'ladrao-pobre': () => `Você precisa de pelo menos ${moedas(i.guild, MINIMO_LADRAO)} para pagar a fiança se der errado.`,
      }[r.motivo]();
      return i.reply({ content: motivo, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    gravarAssalto.run(g, i.user.id, agora, 0);
    if (r.sucesso) {
      gastarMoedas(g, alvo.id, r.valor);
      darMoedas(g, i.user.id, r.valor);
      gravarAssalto.run(g, alvo.id, 0, agora + PROTECAO_ASSALTO);
      registrar({ guild: i.guild!, userId: alvo.id, tipo: 'auto', acao: `💰 foi assaltado por <@${i.user.id}> e perdeu ${r.valor} moedas` });
      return i.reply({
        content: `🦹 ${i.user} ${sortear(FRASES_ASSALTO.sucesso)} ${alvo} e levou **${moedas(i.guild, r.valor)}**!`,
        allowedMentions: { users: [alvo.id] },
      });
    }
    gastarMoedas(g, i.user.id, r.multa);
    darMoedas(g, alvo.id, r.multa);
    return i.reply({
      content: `🚨 ${i.user} ${sortear(FRASES_ASSALTO.falha)} ${alvo} e foi pego! Pagou **${moedas(i.guild, r.multa)}** de indenização para a vítima.`,
      allowedMentions: { users: [alvo.id] },
    });
  },
};
