import { Resvg } from '@resvg/resvg-js';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Message,
} from 'discord.js';
import { db } from '../db.ts';
import {
  ACOES_DUELO,
  barraVida,
  jogar,
  novaLutadora,
  novoDuelo,
  VISITAS,
  vencedora,
  type AcaoDuelo,
  type Duelo,
} from '../lib/duelo.ts';
import { formatarMoedas } from '../lib/economia.ts';
import { humorDe, statusAgora } from '../lib/gotica.ts';
import { juntarRetratos } from '../lib/goticaDupla.ts';
import type { HandlerBotao } from '../tipos.ts';
import { darMoedas } from './economia.ts';
import { ajustarGotica, estadoDe, ler, retratoSvg, type Linha } from './gotica.ts';

const ENERGIA_DUELO = 20;
const PRAZO_CONVITE = 2 * 60_000;
const PRAZO_TURNO = 90_000;
const ESPERA_VISITA = 6 * 3_600_000;
const sortear = <T>(lista: readonly T[]) => lista[Math.floor(Math.random() * lista.length)];

db.exec(`CREATE TABLE IF NOT EXISTS gotica_visitas (
  guild_id TEXT NOT NULL, visitante TEXT NOT NULL, anfitria TEXT NOT NULL, ultima INTEGER NOT NULL,
  PRIMARY KEY (guild_id, visitante, anfitria)
)`);

function imagemDupla(a: Linha, b: Linha, simbolo: 'duelo' | 'visita', humores?: ['feliz' | 'triste', 'feliz' | 'triste']) {
  const svg = juntarRetratos(retratoSvg(a, humores?.[0]), retratoSvg(b, humores?.[1]), simbolo);
  return new AttachmentBuilder(new Resvg(svg).render().asPng(), { name: `${simbolo}.png` });
}

const energiaDe = (l: Linha) => statusAgora(estadoDe(l), Date.now()).energia;
const subiuTexto = (nome: string, subiu: number[]) => (subiu.length ? `\n🎉 **${nome}** subiu para o nível ${subiu.at(-1)}!` : '');

// ---------- Duelo ----------

type Ativo = { duelo: Duelo; mensagem: Message; timer?: NodeJS.Timeout; guildId: string };
const convites = new Map<string, NodeJS.Timeout>(); // id da mensagem → prazo do convite
const ativos = new Map<string, Ativo>(); // id da mensagem → duelo
const ocupadas = new Set<string>(); // guild:user em duelo ou com convite aberto

export async function executarDuelo(i: ChatInputCommandInteraction) {
  const g = i.guildId!;
  const alvo = i.options.getUser('membro', true);
  if (alvo.id === i.user.id || alvo.bot) return i.reply({ content: 'Desafie a gótica de outra pessoa.', flags: MessageFlags.Ephemeral });
  const a = ler(g, i.user.id);
  const b = ler(g, alvo.id);
  if (!a) return i.reply({ content: 'Você ainda não tem uma gótica. Adote com `/gotica adotar`.', flags: MessageFlags.Ephemeral });
  if (!b) return i.reply({ content: `${alvo.username} ainda não tem uma gótica.`, flags: MessageFlags.Ephemeral });
  if (ocupadas.has(`${g}:${i.user.id}`) || ocupadas.has(`${g}:${alvo.id}`)) {
    return i.reply({ content: 'Uma das duas já está num duelo (ou com convite aberto).', flags: MessageFlags.Ephemeral });
  }
  if (energiaDe(a) < ENERGIA_DUELO) return i.reply({ content: `A **${a.nome}** está cansada demais para duelar. Deixe ela dormir antes.`, flags: MessageFlags.Ephemeral });

  await i.deferReply();
  const embed = new EmbedBuilder()
    .setColor(0xf5b544)
    .setTitle(`⚔️ ${a.nome} desafiou ${b.nome} para um duelo!`)
    .setDescription(`<@${a.user_id}> (nível ${a.nivel}) contra <@${b.user_id}> (nível ${b.nivel}).\nQuem vence leva XP e ${formatarMoedas(60)}. Cada duelo gasta ${ENERGIA_DUELO} de energia.`)
    .setImage('attachment://duelo.png')
    .setFooter({ text: 'O convite vale por 2 minutos.' });
  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`duelo:aceitar:${a.user_id}:${b.user_id}`).setLabel('Aceitar').setEmoji('⚔️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`duelo:recusar:${a.user_id}:${b.user_id}`).setLabel('Fugir').setEmoji('🏃‍♀️').setStyle(ButtonStyle.Secondary),
  );
  const msg = await i.editReply({
    content: `<@${b.user_id}>, sua gótica foi desafiada!`,
    embeds: [embed],
    files: [imagemDupla(a, b, 'duelo')],
    components: [botoes],
    allowedMentions: { users: [b.user_id] },
  });

  ocupadas.add(`${g}:${a.user_id}`).add(`${g}:${b.user_id}`);
  convites.set(
    msg.id,
    setTimeout(() => {
      convites.delete(msg.id);
      ocupadas.delete(`${g}:${a.user_id}`);
      ocupadas.delete(`${g}:${b.user_id}`);
      msg.edit({ content: '⌛ Ninguém respondeu, o duelo foi cancelado.', components: [] }).catch(() => {});
    }, PRAZO_CONVITE),
  );
}

function telaDuelo(d: Duelo) {
  const daVez = d[d.vez];
  const embed = new EmbedBuilder()
    .setColor(0xc0392b)
    .setTitle(`⚔️ ${d.a.nome} vs ${d.b.nome}`)
    .addFields(
      { name: `${d.a.nome} · nível ${d.a.nivel}${d.a.defendendo ? ' 🛡️' : ''}${d.a.triste ? ' 😢' : ''}`, value: barraVida(d.a) },
      { name: `${d.b.nome} · nível ${d.b.nivel}${d.b.defendendo ? ' 🛡️' : ''}${d.b.triste ? ' 😢' : ''}`, value: barraVida(d.b) },
    )
    .setDescription(d.log.length ? d.log.join('\n') : 'O duelo começou!')
    .setImage('attachment://duelo.png')
    .setFooter({ text: `Turno ${d.turno} · vez da ${daVez.nome} · 90 s para jogar` });
  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(Object.keys(ACOES_DUELO) as AcaoDuelo[]).map((a) =>
      new ButtonBuilder().setCustomId(`duelo:${a}`).setLabel(ACOES_DUELO[a].rotulo).setEmoji(ACOES_DUELO[a].emoji).setStyle(ButtonStyle.Primary),
    ),
    new ButtonBuilder().setCustomId('duelo:desistir').setLabel('Desistir').setEmoji('🏳️').setStyle(ButtonStyle.Secondary),
  );
  return { content: `<@${daVez.id}>, é a sua vez! (${Object.values(ACOES_DUELO).map((a) => `${a.emoji} ${a.dica}`).join(' · ')})`, embeds: [embed], components: [botoes], allowedMentions: { parse: [] } };
}

function armarTurno(id: string) {
  const ativo = ativos.get(id);
  if (!ativo) return;
  clearTimeout(ativo.timer);
  ativo.timer = setTimeout(() => {
    const d = ativo.duelo;
    const perdedora = d.vez;
    encerrar(id, perdedora === 'a' ? 'b' : 'a', `⌛ **${d[perdedora].nome}** demorou demais e perdeu por W.O.`).catch((e) => console.error('[duelo]', e));
  }, PRAZO_TURNO);
}

async function encerrar(id: string, venceu: 'a' | 'b', motivo: string) {
  const ativo = ativos.get(id);
  if (!ativo) return;
  ativos.delete(id);
  clearTimeout(ativo.timer);
  const { duelo: d, mensagem, guildId: g } = ativo;
  ocupadas.delete(`${g}:${d.a.id}`);
  ocupadas.delete(`${g}:${d.b.id}`);

  const perdeu = venceu === 'a' ? 'b' : 'a';
  const lv = ler(g, d[venceu].id);
  const lp = ler(g, d[perdeu].id);
  if (!lv || !lp) return;
  const subiuV = ajustarGotica(lv, { xp: 30, humor: 15, energia: -ENERGIA_DUELO });
  const subiuP = ajustarGotica(lp, { xp: 10, humor: -10, energia: -ENERGIA_DUELO });
  darMoedas(g, d[venceu].id, 60);

  // Relê depois do XP para o retrato final já mostrar acessórios novos.
  const la = ler(g, d.a.id)!;
  const lb = ler(g, d.b.id)!;
  const humores: ['feliz' | 'triste', 'feliz' | 'triste'] = venceu === 'a' ? ['feliz', 'triste'] : ['triste', 'feliz'];
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`🏆 ${d[venceu].nome} venceu o duelo!`)
    .setDescription(
      [...d.log, motivo].filter(Boolean).join('\n') +
        `\n\n**${d[venceu].nome}** ganhou 30 XP e ${formatarMoedas(60)} para <@${d[venceu].id}>. **${d[perdeu].nome}** ganhou 10 XP pela coragem.` +
        subiuTexto(d[venceu].nome, subiuV) +
        subiuTexto(d[perdeu].nome, subiuP),
    )
    .setImage('attachment://duelo.png');
  await mensagem.edit({ content: '', embeds: [embed], files: [imagemDupla(la, lb, 'duelo', humores)], attachments: [], components: [], allowedMentions: { parse: [] } });
}

export const botaoDuelo: HandlerBotao = {
  prefixo: 'duelo',
  async executar(i, argumento) {
    const [acao, desafiante, desafiada] = argumento.split(':');
    const g = i.guildId!;

    if (acao === 'aceitar' || acao === 'recusar') {
      if (i.user.id !== desafiada) return i.reply({ content: 'Só a dona da gótica desafiada pode responder.', flags: MessageFlags.Ephemeral });
      const prazo = convites.get(i.message.id);
      if (!prazo) return i.reply({ content: 'Esse convite já expirou.', flags: MessageFlags.Ephemeral });

      const a = ler(g, desafiante);
      const b = ler(g, desafiada);
      const liberar = () => {
        clearTimeout(prazo);
        convites.delete(i.message.id);
        ocupadas.delete(`${g}:${desafiante}`);
        ocupadas.delete(`${g}:${desafiada}`);
      };
      if (acao === 'recusar' || !a || !b) {
        liberar();
        return i.update({ content: `🏃‍♀️ A **${b?.nome ?? 'gótica'}** fugiu do duelo. Covarde... ou esperta.`, components: [] });
      }
      if (energiaDe(b) < ENERGIA_DUELO) return i.reply({ content: `A **${b.nome}** está cansada demais. Deixe ela dormir e aceite depois.`, flags: MessageFlags.Ephemeral });
      if (energiaDe(a) < ENERGIA_DUELO) {
        liberar();
        return i.update({ content: `A **${a.nome}** ficou cansada antes de começar. Duelo cancelado.`, components: [] });
      }

      clearTimeout(prazo);
      convites.delete(i.message.id);
      const triste = (l: Linha) => humorDe(statusAgora(estadoDe(l), Date.now())) === 'triste';
      const duelo = novoDuelo(novaLutadora(a.user_id, a.nome, a.nivel, triste(a)), novaLutadora(b.user_id, b.nome, b.nivel, triste(b)));
      ativos.set(i.message.id, { duelo, mensagem: i.message, guildId: g });
      armarTurno(i.message.id);
      return i.update(telaDuelo(duelo));
    }

    const ativo = ativos.get(i.message.id);
    if (!ativo) return i.reply({ content: 'Esse duelo já acabou.', flags: MessageFlags.Ephemeral });
    const d = ativo.duelo;
    const lado = d.a.id === i.user.id ? 'a' : d.b.id === i.user.id ? 'b' : undefined;
    if (!lado) return i.reply({ content: 'Você não está nesse duelo. Desafie alguém com `/gotica duelo`.', flags: MessageFlags.Ephemeral });

    if (acao === 'desistir') {
      await i.deferUpdate();
      return encerrar(i.message.id, lado === 'a' ? 'b' : 'a', `🏳️ **${d[lado].nome}** jogou a toalha (preta, claro).`);
    }
    if (d.vez !== lado) return i.reply({ content: `Calma, é a vez da **${d[d.vez].nome}**.`, flags: MessageFlags.Ephemeral });

    ativo.duelo = jogar(d, acao as AcaoDuelo);
    const venceu = vencedora(ativo.duelo);
    if (venceu) {
      await i.deferUpdate();
      return encerrar(i.message.id, venceu, '');
    }
    armarTurno(i.message.id);
    return i.update(telaDuelo(ativo.duelo));
  },
};

// ---------- Visita ----------

export async function executarVisita(i: ChatInputCommandInteraction) {
  const g = i.guildId!;
  const alvo = i.options.getUser('membro', true);
  if (alvo.id === i.user.id || alvo.bot) return i.reply({ content: 'Visite a gótica de outra pessoa.', flags: MessageFlags.Ephemeral });
  const a = ler(g, i.user.id);
  const b = ler(g, alvo.id);
  if (!a) return i.reply({ content: 'Você ainda não tem uma gótica. Adote com `/gotica adotar`.', flags: MessageFlags.Ephemeral });
  if (!b) return i.reply({ content: `${alvo.username} ainda não tem uma gótica.`, flags: MessageFlags.Ephemeral });

  const ultima = (db.prepare('SELECT ultima FROM gotica_visitas WHERE guild_id = ? AND visitante = ? AND anfitria = ?').get(g, a.user_id, b.user_id) as { ultima: number } | undefined)?.ultima ?? 0;
  if (Date.now() - ultima < ESPERA_VISITA) {
    return i.reply({ content: `A **${a.nome}** visitou a **${b.nome}** há pouco. Pode voltar <t:${Math.ceil((ultima + ESPERA_VISITA) / 1000)}:R>.`, flags: MessageFlags.Ephemeral });
  }

  await i.deferReply();
  db.prepare('INSERT INTO gotica_visitas (guild_id, visitante, anfitria, ultima) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET ultima = excluded.ultima').run(g, a.user_id, b.user_id, Date.now());
  const subiuA = ajustarGotica(a, { xp: 10, humor: 15 });
  const subiuB = ajustarGotica(b, { xp: 10, humor: 15 });
  darMoedas(g, a.user_id, 15);

  const embed = new EmbedBuilder()
    .setColor(0xe8436f)
    .setTitle(`🏠 ${a.nome} foi visitar ${b.nome}!`)
    .setDescription(
      `Elas ${sortear(VISITAS)}. 🖤\nAs duas ganharam 10 XP e ficaram mais felizes; <@${a.user_id}> ganhou ${formatarMoedas(15)} pela gentileza.` +
        subiuTexto(a.nome, subiuA) +
        subiuTexto(b.nome, subiuB),
    )
    .setImage('attachment://visita.png');
  return i.editReply({
    content: `<@${b.user_id}>, sua gótica recebeu visita!`,
    embeds: [embed],
    files: [imagemDupla(ler(g, a.user_id)!, ler(g, b.user_id)!, 'visita', ['feliz', 'feliz'])],
    allowedMentions: { users: [b.user_id] },
  });
}
