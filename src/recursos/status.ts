import { statSync } from 'node:fs';
import { EmbedBuilder, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { duracaoTexto } from '../lib/tela.ts';
import type { Comando } from '../tipos.ts';
import { duelosEmAndamento } from './goticaSocial.ts';
import { situacaoTocadores } from './musica.ts';
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
    const tocadores = situacaoTocadores();
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
        { name: '🎵 Música', value: tocadores.map((t) => `${t.online ? '🟢' : '🔴'} ${t.nome}${t.tocando ? ` · tocando em ${t.tocando} call(s)` : ' · livre'}`).join('\n') || 'Sem tocadores' },
        { name: '🎲 Rolando agora', value: rolando.join(' · ') || 'Nada no momento' },
        { name: '🛡️ Reinício automático', value: process.env.TAVERNA_SUPERVISOR ? 'Ligado (volta sozinho se cair)' : 'Desligado (rodando pelo terminal)' },
      )
      .setFooter({ text: `Node ${process.versions.node} · ${i.client.guilds.cache.size} servidor(es)` })
      .setTimestamp();
    return i.editReply({ embeds: [embed] });
  },
};
