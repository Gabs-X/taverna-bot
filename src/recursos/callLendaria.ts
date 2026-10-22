import { EmbedBuilder, type Message, type VoiceBasedChannel, type VoiceState } from 'discord.js';
import { CANAIS } from '../config.ts';
import { mudancaLendaria } from '../lib/callLendaria.ts';
import { canalTexto } from '../lib/servidor.ts';
import { duracaoTexto } from '../lib/tela.ts';
import { registrar } from './registro.ts';

// Call lendária: quando 5+ pessoas estão na mesma call, o bot chama todo mundo no #geral.
// Quando a call esvazia (menos de 3), o aviso vira o placar: quanto durou e o pico de gente.

type Lendaria = { mensagem: Message; inicio: number; pico: number; nome: string };
const ativas = new Map<string, Lendaria>(); // id da call → aviso
const ultimoAviso = new Map<string, number>(); // id do servidor → quando avisou

const pessoasNa = (canal: VoiceBasedChannel | null) => canal?.members.filter((m) => !m.user.bot).size ?? 0;

/** Troca o aviso pelo placar: quanto durou e o pico de gente. */
async function encerrar(callId: string) {
  const ativa = ativas.get(callId);
  if (!ativa) return;
  ativas.delete(callId);
  const embed = new EmbedBuilder()
    .setColor(0x4f545c)
    .setTitle('🏆 A call lendária acabou')
    .setDescription(`Em **${ativa.nome}**: durou **${duracaoTexto(Date.now() - ativa.inicio)}**, com pico de **${ativa.pico} pessoas**.`)
    .setTimestamp();
  await ativa.mensagem.edit({ content: '', embeds: [embed] }).catch(() => {});
}

async function conferir(canal: VoiceBasedChannel) {
  if (canal.id === canal.guild.afkChannelId) return;
  const pessoas = pessoasNa(canal);
  const ativa = ativas.get(canal.id);
  if (ativa) ativa.pico = Math.max(ativa.pico, pessoas);
  const agora = Date.now();
  const mudanca = mudancaLendaria(pessoas, !!ativa, ultimoAviso.get(canal.guild.id) ?? 0, agora);

  if (mudanca === 'comecar') {
    const geral = canalTexto(canal.guild, CANAIS.geral);
    if (!geral) return;
    ultimoAviso.set(canal.guild.id, agora);
    const nomes = canal.members.filter((m) => !m.user.bot).map((m) => m.displayName);
    const embed = new EmbedBuilder()
      .setColor(0xff7a00)
      .setTitle('🔥 A CALL LENDÁRIA ESTÁ ACONTECENDO!')
      .setDescription(`**${pessoas} pessoas** em ${canal} agora: ${nomes.join(', ')}.\nChega mais que a resenha tá boa! 🍺`)
      .setTimestamp();
    const mensagem = await geral.send({ content: '@here', embeds: [embed], allowedMentions: { parse: ['everyone'] } }).catch(() => null);
    if (!mensagem) return;
    ativas.set(canal.id, { mensagem, inicio: agora, pico: pessoas, nome: canal.name });
    registrar({ guild: canal.guild, tipo: 'auto', acao: `🔥 call lendária em ${canal.name} (${pessoas} pessoas)`, canalId: canal.id });
  } else if (mudanca === 'terminar') {
    await encerrar(canal.id);
  }
}

export async function aoMudarVozLendaria(antes: VoiceState, depois: VoiceState) {
  if (antes.channelId === depois.channelId || antes.member?.user.bot) return;
  if (depois.channel) await conferir(depois.channel);
  if (antes.channel) await conferir(antes.channel);
  // A call temporária some quando esvazia: fecha o aviso dela também.
  else if (antes.channelId) await encerrar(antes.channelId);
}
