import { EmbedBuilder, type GuildMember, type PartialGuildMember } from 'discord.js';
import { CANAIS, CARGOS, NOME_SERVIDOR } from '../config.ts';
import { canalTexto, cargoPorNome, emoji } from '../lib/servidor.ts';
import { registrar } from './registro.ts';

const FRASES = [
  'mais um freguês chegou na taverna!',
  'a taverna acaba de ficar mais cheia.',
  'puxa uma cadeira e pede uma cerveja (virtual).',
  'rolou iniciativa e entrou primeiro.',
];

export async function aoEntrar(membro: GuildMember) {
  // Bot (ex.: um bardo de música novo): ganha o cargo base para enxergar as calls, sem boas-vindas.
  if (membro.user.bot) {
    const cargo = cargoPorNome(membro.guild, CARGOS.membro.nome);
    if (cargo) await membro.roles.add(cargo).catch(() => {});
    registrar({ guild: membro.guild, userId: membro.id, tipo: 'servidor', acao: '🤖 bot entrou no servidor' });
    return;
  }
  // Gente: só vê #verificacao até responder o formulário (formulario.ts), que dá o cargo base.
  registrar({ guild: membro.guild, userId: membro.id, tipo: 'servidor', acao: '📥 entrou no servidor' });

  const canal = canalTexto(membro.guild, CANAIS.boasVindas);
  const verificacao = canalTexto(membro.guild, CANAIS.verificacao);
  if (!canal) return;

  const frase = FRASES[Math.floor(Math.random() * FRASES.length)];
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setAuthor({ name: membro.user.username, iconURL: membro.displayAvatarURL() })
    .setTitle(`${emoji(membro.guild, 'taverna_cerveja', '🍺')} Bem-vindo(a) à ${NOME_SERVIDOR}!`)
    .setDescription(
      `👋 ${membro}, ${frase}\n\n` +
        `${verificacao ? `✅ Responda o formulário em ${verificacao} para liberar o servidor\n` : ''}` +
        `${emoji(membro.guild, 'call', '🔊')} Para jogar, entre em **${CANAIS.criarCall}**`,
    )
    .setThumbnail(membro.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `Membro nº ${membro.guild.memberCount}` });

  await canal.send({ content: `${membro}`, embeds: [embed] });
  registrar({ guild: membro.guild, userId: membro.id, tipo: 'auto', acao: 'recebeu a mensagem de boas-vindas', canalId: canal.id });
}

export async function aoSair(membro: GuildMember | PartialGuildMember) {
  registrar({ guild: membro.guild, userId: membro.id, tipo: 'servidor', acao: `📤 saiu do servidor (${membro.user?.tag ?? 'sem nome'})` });
}
