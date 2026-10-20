import { writeFileSync } from 'node:fs';
import { ChannelType, EmbedBuilder, MessageFlags, type Guild, type GuildMember } from 'discord.js';
import { CANAIS } from '../config.ts';
import { db } from '../db.ts';
import { canalTexto } from '../lib/servidor.ts';
import type { HandlerBotao } from '../tipos.ts';
import { montarServidor } from './setup.ts';

const VALIDADE_MS = 2 * 60_000;
const emAndamento = new Set<string>();

// Guarda a estrutura antiga (não as mensagens) para dar para recriar à mão, se precisar.
async function salvarBackup(guild: Guild) {
  const canais = await guild.channels.fetch();
  const cargos = await guild.roles.fetch();
  const backup = {
    servidor: { id: guild.id, nome: guild.name },
    data: new Date().toISOString(),
    canais: [...canais.values()]
      .filter((c) => c !== null)
      .map((c) => ({
        id: c.id,
        nome: c.name,
        tipo: ChannelType[c.type],
        categoria: c.parent?.name ?? null,
        posicao: c.position,
        topico: 'topic' in c ? c.topic : null,
        limite: 'userLimit' in c ? c.userLimit : null,
        permissoes: c.permissionOverwrites.cache.map((o) => ({
          alvo: o.type === 0 ? (cargos.get(o.id)?.name ?? o.id) : `membro:${o.id}`,
          permitir: o.allow.toArray(),
          negar: o.deny.toArray(),
        })),
      })),
    cargos: [...cargos.values()]
      .filter((r) => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        nome: r.name,
        cor: r.hexColor,
        separado: r.hoist,
        mencionavel: r.mentionable,
        gerenciado: r.managed,
        permissoes: r.permissions.toArray(),
        membros: r.members.size,
      })),
  };
  const arquivo = `dados/backup-${guild.id}-${backup.data.replace(/[:.]/g, '-')}.json`;
  writeFileSync(arquivo, JSON.stringify(backup, null, 2));
  return arquivo;
}

async function limparServidor(guild: Guild) {
  const falhas: string[] = [];
  const canais = [...(await guild.channels.fetch()).values()].filter((c) => c !== null);

  // Canais primeiro, categorias por último (uma categoria com canais dentro dá erro).
  canais.sort((a, b) => Number(a.type === ChannelType.GuildCategory) - Number(b.type === ChannelType.GuildCategory));
  let canaisApagados = 0;
  for (const canal of canais) {
    try {
      await canal.delete('Limpeza total pelo /setup');
      canaisApagados++;
    } catch (erro) {
      // 50074: canal obrigatório de servidor Comunidade (regras/atualizações).
      const codigo = (erro as { code?: number }).code;
      falhas.push(`#${canal.name}${codigo === 50074 ? ' (obrigatório do modo Comunidade)' : ''}`);
    }
  }
  db.prepare('DELETE FROM calls_temporarias WHERE guild_id = ?').run(guild.id);

  // Só dá para apagar cargos abaixo do cargo do bot e que não sejam de integração (bots, boost).
  const cargos = [...(await guild.roles.fetch()).values()].filter((r) => r.id !== guild.id);
  let cargosApagados = 0;
  const mantidos: string[] = [];
  for (const cargo of cargos) {
    if (cargo.managed || !cargo.editable) {
      mantidos.push(cargo.name);
      continue;
    }
    try {
      await cargo.delete('Limpeza total pelo /setup');
      cargosApagados++;
    } catch {
      falhas.push(`@${cargo.name}`);
    }
  }

  return { canaisApagados, cargosApagados, mantidos, falhas };
}

export const botaoLimpeza: HandlerBotao = {
  prefixo: 'reset',
  async executar(i, argumento) {
    const [acao, donoId, renomear] = argumento.split(':');
    if (i.user.id !== donoId) return i.reply({ content: 'Esse botão não é seu.', flags: MessageFlags.Ephemeral });

    if (acao === 'cancelar') return i.update({ content: '👍 Cancelado. Nada foi apagado.', embeds: [], components: [] });

    const guild = i.guild!;
    const expirou = Date.now() - i.message.createdTimestamp > VALIDADE_MS;
    if (expirou) return i.update({ content: '⌛ A confirmação expirou. Rode `/setup limpar_tudo:true` de novo.', embeds: [], components: [] });
    if (!(i.member as GuildMember).permissions.has('Administrator')) {
      return i.update({ content: 'Só administradores podem limpar o servidor.', embeds: [], components: [] });
    }
    if (emAndamento.has(guild.id)) return i.reply({ content: 'Já estou limpando este servidor.', flags: MessageFlags.Ephemeral });

    emAndamento.add(guild.id);
    try {
      await i.update({ content: '🧹 Salvando backup e limpando o servidor... (o canal atual vai sumir, o resultado sai em #logs)', embeds: [], components: [] });

      const backup = await salvarBackup(guild);
      const { canaisApagados, cargosApagados, mantidos, falhas } = await limparServidor(guild);
      const relatorio = await montarServidor(guild, i.user.id, renomear === '1');

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('🧹 Servidor limpo e montado do zero')
        .setDescription(relatorio.slice(0, 3500))
        .addFields(
          { name: 'Apagados', value: `${canaisApagados} canais · ${cargosApagados} cargos`, inline: true },
          { name: 'Backup da estrutura antiga', value: `\`${backup}\` (na pasta do bot)`, inline: true },
        )
        .setFooter({ text: `Pedido por ${i.user.username}` });
      if (mantidos.length) embed.addFields({ name: 'Cargos mantidos (bots, boost ou acima do bot)', value: mantidos.join(', ').slice(0, 1000) });
      if (falhas.length) embed.addFields({ name: '⚠️ Não consegui apagar', value: falhas.join(', ').slice(0, 1000) });

      await canalTexto(guild, CANAIS.logs)?.send({ content: `${i.user}`, embeds: [embed] });
      console.log(`[limpeza] ${guild.name}: ${canaisApagados} canais e ${cargosApagados} cargos apagados; backup em ${backup}`);
    } catch (erro) {
      console.error('[limpeza]', erro);
      await i.followUp({ content: '😵 A limpeza parou no meio. Veja o terminal do bot e rode `/setup` para completar.', flags: MessageFlags.Ephemeral }).catch(() => {});
    } finally {
      emAndamento.delete(guild.id);
    }
  },
};
