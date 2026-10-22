import { EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { CANAIS } from '../config.ts';
import { db } from '../db.ts';
import { ENCAIXES, equipar, ITENS, itemPorId, lerEquipados, type Encaixe, type IdItem } from '../lib/loja.ts';
import type { Comando } from '../tipos.ts';
import { carteira, gastarMoedas, moedas } from './economia.ts';
import { cartao, estadoDe, ler } from './gotica.ts';

const SEM_GOTICA = 'Você precisa de uma gótica para usar a loja. Adote com `/gotica adotar`.';
const escolhasItens = ITENS.map((i) => ({ name: `${i.nome} (${i.preco})`, value: i.id }));

const temItem = (g: string, u: string, id: string) =>
  !!db.prepare('SELECT 1 FROM gotica_itens WHERE guild_id = ? AND user_id = ? AND item = ?').get(g, u, id);
const salvarEquipados = (g: string, u: string, eq: object) =>
  db.prepare('UPDATE goticas SET equipados = ? WHERE guild_id = ? AND user_id = ?').run(JSON.stringify(eq), g, u);

export const loja: Comando = {
  data: new SlashCommandBuilder()
    .setName('loja')
    .setDescription('Loja de acessórios da gótica (paga com moedas da Taverna)')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('ver').setDescription('Mostra os itens, preços e o que você já tem'))
    .addSubcommand((s) =>
      s.setName('comprar').setDescription('Compra um item (e já equipa)')
        .addStringOption((o) => o.setName('item').setDescription('Qual item').setRequired(true).addChoices(...escolhasItens)),
    )
    .addSubcommand((s) =>
      s.setName('equipar').setDescription('Equipa um item que você já comprou')
        .addStringOption((o) => o.setName('item').setDescription('Qual item').setRequired(true).addChoices(...escolhasItens)),
    )
    .addSubcommand((s) =>
      s.setName('tirar').setDescription('Tira o item de um encaixe')
        .addStringOption((o) =>
          o.setName('encaixe').setDescription('De onde').setRequired(true)
            .addChoices(...Object.entries(ENCAIXES).map(([value, name]) => ({ name, value }))),
        ),
    ),

  async executar(i) {
    const g = i.guildId!;
    const u = i.user.id;
    const sub = i.options.getSubcommand();
    const l = ler(g, u);

    if (sub === 'ver') {
      const meus = new Set((db.prepare('SELECT item FROM gotica_itens WHERE guild_id = ? AND user_id = ?').all(g, u) as { item: string }[]).map((r) => r.item));
      const eq = lerEquipados(l?.equipados);
      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🛍️ Loja da Gótica')
        .setDescription(`Seu saldo: **${moedas(i.guild, carteira(g, u).moedas)}** · ganhe mais com \`/daily\`, \`/trabalhar\`, conversando e em call.`)
        .addFields(
          (Object.keys(ENCAIXES) as Encaixe[]).map((enc) => ({
            name: ENCAIXES[enc],
            value: ITENS.filter((it) => it.encaixe === enc)
              .map((it) => {
                const status = eq[enc] === it.id ? ' · ✅ equipado' : meus.has(it.id) ? ' · comprado' : '';
                return `${it.emoji} **${it.nome}** · ${moedas(i.guild, it.preco)}${status}`;
              })
              .join('\n'),
          })),
        )
        .setFooter({ text: 'Compre com /loja comprar · troque com /loja equipar · tire com /loja tirar' });
      return i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (!l) return i.reply({ content: SEM_GOTICA, flags: MessageFlags.Ephemeral });

    if (sub === 'tirar') {
      const enc = i.options.getString('encaixe', true) as Encaixe;
      const eq = lerEquipados(l.equipados);
      if (!eq[enc]) return i.reply({ content: `Não tem nada equipado em ${ENCAIXES[enc].toLowerCase()}.`, flags: MessageFlags.Ephemeral });
      delete eq[enc];
      salvarEquipados(g, u, eq);
      await i.deferReply();
      return i.editReply(cartao({ ...l, equipados: JSON.stringify(eq) }, estadoDe(l), `👗 **${l.nome}** tirou o item de ${ENCAIXES[enc].toLowerCase()}.\n`));
    }

    const id = i.options.getString('item', true) as IdItem;
    const item = itemPorId(id)!;
    let aviso: string;

    if (sub === 'comprar') {
      if (temItem(g, u, id)) return i.reply({ content: `Você já tem ${item.emoji} ${item.nome}. Use \`/loja equipar\`.`, flags: MessageFlags.Ephemeral });
      if (!gastarMoedas(g, u, item.preco)) {
        const saldo = carteira(g, u).moedas;
        return i.reply({ content: `Faltam ${moedas(i.guild, item.preco - saldo)} para ${item.nome} (você tem ${moedas(i.guild, saldo)}).`, flags: MessageFlags.Ephemeral });
      }
      db.prepare('INSERT INTO gotica_itens (guild_id, user_id, item) VALUES (?, ?, ?)').run(g, u, id);
      aviso = `🛍️ **${l.nome}** ganhou ${item.emoji} **${item.nome}** (${moedas(i.guild, item.preco)}) e já está usando!`;
    } else {
      if (!temItem(g, u, id)) return i.reply({ content: `Você ainda não tem ${item.nome}. Compre com \`/loja comprar\`.`, flags: MessageFlags.Ephemeral });
      aviso = `👗 **${l.nome}** colocou ${item.emoji} **${item.nome}**.`;
    }

    const eq = equipar(lerEquipados(l.equipados), id);
    salvarEquipados(g, u, eq);
    await i.deferReply();
    return i.editReply(cartao({ ...l, equipados: JSON.stringify(eq) }, estadoDe(l), `${aviso}\n`));
  },
};
