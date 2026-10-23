import { statSync } from 'node:fs';
import { EmbedBuilder, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { duracaoTexto } from '../lib/tela.ts';
import type { Comando } from '../tipos.ts';
import { duelosEmAndamento } from './goticaSocial.ts';
import { BARDOS } from '../config.ts';
import { VERSAO } from './novidades.ts';
import { quizzesEmAndamento } from './quiz.ts';
import { telasAbertas } from './tela.ts';

// /status: saúde do bot (há quanto tempo está no ar, ping, memória, música e o que está rolando).

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export const status: Comando = {
  data: new SlashCommandBuilder().setName('status').setDescription('Mostra como o bot está (ping, tempo no ar, música, memória)').setContexts(InteractionContextType.Guild),

  async executar(i) {
    const inicio = Date.now();
    await i.deferReply();
    const resposta = Date.now() - inicio;
    const ping = i.client.ws.ping;
    // Os bardos rodam em outro programa (no PC de casa): o status deles vem do servidor (online e em que call estão).
    const tocadores = BARDOS.map((b) => {
      const m = i.guild?.members.cache.get(b.id);
      const online = !!m?.presence && m.presence.status !== 'offline';
      return { nome: m?.displayName ?? b.nome, online, tocando: m?.voice.channelId ? 1 : 0 };
    });
    const memoria = process.memoryUsage();
    let banco = '?';
    try {
      banco = mb(statSync('dados/taverna.db').size);
    } catch {
      // sem o arquivo: fica "?"
    }

    const tudoBem = ping >= 0 && ping < 400 && tocadores.every((t) => t.online);
    const rolando = [
      [tocadores.reduce((n, t) => n + t.tocando, 0), 'música(s) tocando'],
      [duelosEmAndamento(), 'duelo(s)'],
      [quizzesEmAndamento(), 'quiz(zes)'],
      [telasAbertas(), 'tela(s) compartilhada(s)'],
    ]
      .filter(([n]) => n)
      .map(([n, o]) => `${n} ${o}`);

    const embed = new EmbedBuilder()
      .setColor(tudoBem ? 0x3ba55d : 0xfaa61a)
      .setTitle(`${tudoBem ? '🟢 Tudo certo' : '🟡 Funcionando, com atenção'} · Taverneiro v${VERSAO}`)
      .addFields(
        { name: '⏱️ No ar há', value: duracaoTexto(process.uptime() * 1000), inline: true },
        { name: '📶 Ping', value: `${ping >= 0 ? `${ping} ms` : 'medindo...'} (resposta ${resposta} ms)`, inline: true },
        { name: '🧠 Memória', value: `${mb(memoria.rss)} · banco ${banco}`, inline: true },
        { name: '🎵 Bardos (no PC de casa)', value: tocadores.map((t) => `${t.online ? '🟢' : '🔴'} ${t.nome}${!t.online ? ' · offline' : t.tocando ? ' · tocando numa call' : ' · livre'}`).join('\n') || 'Sem bardos' },
        { name: '🎲 Rolando agora', value: rolando.join(' · ') || 'Nada no momento' },
        { name: '🛡️ Reinício automático', value: process.env.TAVERNA_SUPERVISOR ? 'Ligado (volta sozinho se cair)' : 'Desligado (rodando pelo terminal)' },
      )
      .setFooter({ text: `Node ${process.versions.node} · ${i.client.guilds.cache.size} servidor(es)` })
      .setTimestamp();
    return i.editReply({ embeds: [embed] });
  },
};
