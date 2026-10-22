import { EmbedBuilder, type GuildMember, type PartialGuildMember } from 'discord.js';
import { CANAIS, CARGOS, NOME_SERVIDOR } from '../config.ts';
import { canalTexto, cargoPorNome } from '../lib/servidor.ts';
import { registrar } from './registro.ts';

const FRASES = [
  'mais um maluco chegou na taverna!',
  'a loucura coletiva acaba de aumentar.',
  'puxa uma cadeira e pede uma cerveja (virtual).',
  'rolou iniciativa e entrou primeiro.',
];

export async function aoEntrar(membro: GuildMember) {
  const cargo = cargoPorNome(membro.guild, CARGOS.membro.nome);
  if (cargo && !membro.user.bot) await membro.roles.add(cargo).catch(() => {});
  registrar({ guild: membro.guild, userId: membro.id, tipo: 'servidor', acao: `📥 entrou no servidor${cargo ? ` e ganhou o cargo ${cargo.name}` : ''}` });

  const canal = canalTexto(membro.guild, CANAIS.boasVindas);
  const escolha = canalTexto(membro.guild, CANAIS.escolhaJogos);
  const regras = canalTexto(membro.guild, CANAIS.regras);
  if (!canal) return;

  const frase = FRASES[Math.floor(Math.random() * FRASES.length)];
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setAuthor({ name: membro.user.username, iconURL: membro.displayAvatarURL() })
    .setTitle(`Bem-vindo(a) à ${NOME_SERVIDOR}!`)
    .setDescription(
      `${membro}, ${frase}\n\n` +
        `${regras ? `📜 Leia as ${regras}\n` : ''}` +
        `${escolha ? `🎮 Escolha seus jogos em ${escolha}\n` : ''}` +
        `🔊 Para jogar, entre em **${CANAIS.criarCall}**`,
    )
    .setThumbnail(membro.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `Membro nº ${membro.guild.memberCount}` });

  await canal.send({ content: `${membro}`, embeds: [embed] });
  registrar({ guild: membro.guild, userId: membro.id, tipo: 'auto', acao: 'recebeu a mensagem de boas-vindas', canalId: canal.id });
}

export async function aoSair(membro: GuildMember | PartialGuildMember) {
  registrar({ guild: membro.guild, userId: membro.id, tipo: 'servidor', acao: `📤 saiu do servidor (${membro.user?.tag ?? 'sem nome'})` });
}
