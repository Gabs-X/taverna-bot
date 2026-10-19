import { EmbedBuilder, type GuildMember, type PartialGuildMember } from 'discord.js';
import { CANAIS, CARGOS, NOME_SERVIDOR } from '../config.ts';
import { canalTexto, cargoPorNome } from '../lib/servidor.ts';

const FRASES = [
  'mais um maluco chegou na taverna!',
  'a loucura coletiva acaba de aumentar.',
  'puxa uma cadeira e pede uma cerveja (virtual).',
  'rolou iniciativa e entrou primeiro.',
];

export async function aoEntrar(membro: GuildMember) {
  const cargo = cargoPorNome(membro.guild, CARGOS.membro.nome);
  if (cargo && !membro.user.bot) await membro.roles.add(cargo).catch(() => {});

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
  await registrar(membro, `📥 ${membro.user.tag} entrou.`);
}

export async function aoSair(membro: GuildMember | PartialGuildMember) {
  await registrar(membro, `📤 ${membro.user?.tag ?? membro.id} saiu.`);
}

async function registrar(membro: GuildMember | PartialGuildMember, texto: string) {
  await canalTexto(membro.guild, CANAIS.logs)?.send(texto).catch(() => {});
}
