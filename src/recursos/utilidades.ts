import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextChannel,
  type Guild,
  type GuildMember,
  type Message,
} from 'discord.js';
import { CANAIS, JOGOS, nomeCargoJogo } from '../config.ts';
import { cargoPorNome, emoji } from '../lib/servidor.ts';
import type { Comando, HandlerBotao, HandlerSelecao } from '../tipos.ts';

const embaralhar = <T>(lista: T[]) => {
  const copia = [...lista];
  for (let n = copia.length - 1; n > 0; n--) {
    const j = Math.floor(Math.random() * (n + 1));
    [copia[n], copia[j]] = [copia[j], copia[n]];
  }
  return copia;
};

// ---------- /lfg: chamar a galera para jogar ----------
// O estado (vagas e confirmados) mora no próprio embed, então sobrevive a reinícios do bot.

const botoesLfg = (cheio: boolean) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('lfg:entrar').setLabel(cheio ? 'Lotado' : 'Tô dentro').setEmoji('✋').setStyle(ButtonStyle.Success).setDisabled(cheio),
    new ButtonBuilder().setCustomId('lfg:sair').setLabel('Sair').setStyle(ButtonStyle.Secondary),
  );

export const lfg: Comando = {
  data: new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Chama a galera para jogar (avisa quem tem o cargo do jogo)')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName('jogo')
        .setDescription('Qual jogo')
        .setRequired(true)
        .addChoices(...JOGOS.map((j) => ({ name: `${j.emoji} ${j.nome}`, value: j.id }))),
    )
    .addIntegerOption((o) => o.setName('vagas').setDescription('Quantas pessoas além de você').setRequired(true).setMinValue(1).setMaxValue(20))
    .addStringOption((o) => o.setName('recado').setDescription('Ex.: ranked às 21h, partida casual...').setMaxLength(150)),

  async executar(i) {
    const jogo = JOGOS.find((j) => j.id === i.options.getString('jogo', true))!;
    const vagas = i.options.getInteger('vagas', true);
    const cargo = cargoPorNome(i.guild!, nomeCargoJogo(jogo));
    const recado = i.options.getString('recado');

    const embed = new EmbedBuilder()
      .setColor(jogo.cor)
      .setTitle(`${jogo.emoji} Bora de ${jogo.nome}?`)
      .setDescription(`${emoji(i.guild, 'hype', '🔥')} ${i.user} está chamando!${recado ? `\n> ${recado}` : ''}`)
      .addFields({ name: `Confirmados (0/${vagas})`, value: '_ninguém ainda_' })
      .setFooter({ text: `Entre em "${CANAIS.criarCall}" quando fechar o grupo.` });

    return i.reply({
      content: cargo ? `${cargo}` : undefined,
      embeds: [embed],
      components: [botoesLfg(false)],
      allowedMentions: { roles: cargo ? [cargo.id] : [] },
    });
  },
};

export const botaoLfg: HandlerBotao = {
  prefixo: 'lfg',
  async executar(i, acao) {
    const original = i.message.embeds[0];
    const campo = original?.fields[0];
    const vagas = Number(campo?.name.match(/\/(\d+)\)/)?.[1] ?? 0);
    if (!original || !campo || !vagas) return i.reply({ content: 'Esse chamado expirou.', flags: MessageFlags.Ephemeral });

    let confirmados = [...campo.value.matchAll(/<@(\d+)>/g)].map((m) => m[1]);
    const criador = original.description?.match(/<@(\d+)>/)?.[1];

    if (acao === 'entrar') {
      if (i.user.id === criador) return i.reply({ content: 'Você já é quem está chamando 😄', flags: MessageFlags.Ephemeral });
      if (confirmados.includes(i.user.id)) return i.reply({ content: 'Você já está na lista.', flags: MessageFlags.Ephemeral });
      if (confirmados.length >= vagas) return i.reply({ content: 'Lotou!', flags: MessageFlags.Ephemeral });
      confirmados.push(i.user.id);
    } else {
      if (!confirmados.includes(i.user.id)) return i.reply({ content: 'Você não estava na lista.', flags: MessageFlags.Ephemeral });
      confirmados = confirmados.filter((id) => id !== i.user.id);
    }

    const cheio = confirmados.length >= vagas;
    const embed = EmbedBuilder.from(original).setFields({
      name: `Confirmados (${confirmados.length}/${vagas})${cheio ? ' · FECHOU! 🔥' : ''}`,
      value: confirmados.length ? confirmados.map((id) => `<@${id}>`).join('\n') : '_ninguém ainda_',
    });
    await i.update({ embeds: [embed], components: [botoesLfg(cheio)] });
    if (cheio && acao === 'entrar') {
      await i.followUp({ content: `🔥 Fechou o grupo! <@${criador}> ${confirmados.map((id) => `<@${id}>`).join(' ')} bora pra call!` });
    }
  },
};

// ---------- /times: divide a call em times ----------

export const times: Comando = {
  data: new SlashCommandBuilder()
    .setName('times')
    .setDescription('Divide quem está na sua call em times aleatórios')
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantos times (padrão: 2)').setMinValue(2).setMaxValue(10)),

  async executar(i) {
    const canal = (i.member as GuildMember).voice.channel;
    if (!canal) return i.reply({ content: 'Entre numa call com a galera primeiro.', flags: MessageFlags.Ephemeral });

    const pessoas = embaralhar([...canal.members.filter((m) => !m.user.bot).values()]);
    const qtd = i.options.getInteger('quantidade') ?? 2;
    if (pessoas.length < qtd) return i.reply({ content: `Só tem ${pessoas.length} pessoa(s) na call.`, flags: MessageFlags.Ephemeral });

    const grupos: GuildMember[][] = Array.from({ length: qtd }, () => []);
    pessoas.forEach((p, n) => grupos[n % qtd].push(p));
    const cores = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠', '⚪', '⚫', '🟤', '🩷'];

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`⚔️ Times de ${canal.name}`)
      .addFields(grupos.map((g, n) => ({ name: `${cores[n]} Time ${n + 1}`, value: g.map((m) => m.displayName).join('\n'), inline: true })));
    return i.reply({ embeds: [embed] });
  },
};

// ---------- /sortear: decide no aleatório ----------

export const sortear: Comando = {
  data: new SlashCommandBuilder()
    .setName('sortear')
    .setDescription('Sorteia uma opção. Ex.: qual indie jogar hoje')
    .addStringOption((o) => o.setName('opcoes').setDescription('Separadas por vírgula. Ex.: Peak, Repo, Lethal Company').setRequired(true).setMaxLength(500)),

  async executar(i) {
    const opcoes = i.options.getString('opcoes', true).split(',').map((o) => o.trim()).filter(Boolean);
    if (opcoes.length < 2) return i.reply({ content: 'Coloque pelo menos duas opções separadas por vírgula.', flags: MessageFlags.Ephemeral });
    const escolhida = opcoes[Math.floor(Math.random() * opcoes.length)];
    return i.reply(`🎰 Entre ${opcoes.map((o) => `\`${o}\``).join(', ')}...\n\n🎉 **${escolhida}**!`);
  },
};

// ---------- Moderação ----------

export const limpar: Comando = {
  data: new SlashCommandBuilder()
    .setName('limpar')
    .setDescription('Apaga mensagens do canal (de todo mundo, inclusive do bot) ou o canal inteiro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName('quantidade').setDescription('1 a 100 (padrão: 100)').setMinValue(1).setMaxValue(100))
    .addBooleanOption((o) => o.setName('tudo').setDescription('Apaga TODAS as mensagens do canal (recria o canal; pede confirmação)'))
    .addStringOption((o) =>
      o.setName('de').setDescription('De quem apagar (padrão: todo mundo, inclusive bots)').addChoices(
        { name: 'Todo mundo (inclusive bots)', value: 'todos' },
        { name: 'Só bots', value: 'bots' },
        { name: 'Só pessoas', value: 'pessoas' },
      ),
    )
    .addUserOption((o) => o.setName('membro').setDescription('Apagar só as mensagens desta pessoa (ou bot)')),

  async executar(i) {
    const canal = i.channel;
    if (!canal || !('bulkDelete' in canal)) return i.reply({ content: 'Não dá para limpar aqui.', flags: MessageFlags.Ephemeral });

    if (i.options.getBoolean('tudo')) {
      if (!(canal instanceof TextChannel)) return i.reply({ content: 'Limpar tudo só funciona em canal de texto comum.', flags: MessageFlags.Ephemeral });
      if (!(i.member as GuildMember).permissions.has(PermissionFlagsBits.ManageChannels)) {
        return i.reply({ content: 'Limpar tudo recria o canal: precisa da permissão **Gerenciar canais**.', flags: MessageFlags.Ephemeral });
      }
      const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`limpartudo:confirmar:${i.user.id}`).setLabel('Apagar tudo').setEmoji('🧨').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`limpartudo:cancelar:${i.user.id}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
      );
      return i.reply({
        content: `⚠️ Isso apaga **todas** as mensagens de ${canal}, inclusive as fixadas, e não dá para desfazer. O canal é recriado igual (nome, tópico, permissões e posição). Confirmar?`,
        components: [botoes],
        flags: MessageFlags.Ephemeral,
      });
    }

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const quantidade = i.options.getInteger('quantidade') ?? 100;
    const de = i.options.getString('de') ?? 'todos';
    const membro = i.options.getUser('membro');

    // Busca em páginas até achar `quantidade` mensagens que passam no filtro (no máximo 500 olhadas).
    const alvo: Message[] = [];
    let antes: string | undefined;
    for (let pagina = 0; pagina < 5 && alvo.length < quantidade; pagina++) {
      const lote = await canal.messages.fetch({ limit: 100, before: antes });
      if (!lote.size) break;
      for (const m of lote.values()) {
        if (m.pinned) continue;
        if (membro && m.author.id !== membro.id) continue;
        if (de === 'bots' && !m.author.bot) continue;
        if (de === 'pessoas' && m.author.bot) continue;
        alvo.push(m);
        if (alvo.length === quantidade) break;
      }
      antes = lote.last()!.id;
    }

    // Até 14 dias o Discord apaga em lote; as mais velhas só uma a uma.
    const limite = Date.now() - 14 * 24 * 3_600_000 + 60_000;
    const recentes = alvo.filter((m) => m.createdTimestamp > limite);
    const antigas = alvo.filter((m) => m.createdTimestamp <= limite);
    let apagadas = 0;
    let falhas = 0;
    try {
      if (recentes.length === 1) await recentes[0].delete();
      else if (recentes.length) await canal.bulkDelete(recentes);
      apagadas += recentes.length;
    } catch {
      falhas += recentes.length;
    }
    for (const m of antigas) {
      try {
        await m.delete();
        apagadas++;
      } catch {
        falhas++;
      }
    }

    const partes = [`🧹 Apaguei ${apagadas} mensagem(ns).`];
    if (antigas.length) partes.push(`${antigas.length} tinham mais de 14 dias e foram apagadas uma a uma.`);
    if (falhas) partes.push(`⚠️ ${falhas} não deu para apagar: confira se o bot tem a permissão **Gerenciar mensagens** neste canal.`);
    if (alvo.length < quantidade) partes.push(`Só achei ${alvo.length} que batiam com o filtro nas últimas 500 mensagens (fixadas não contam).`);
    return i.editReply(partes.join('\n'));
  },
};

export const botaoLimparTudo: HandlerBotao = {
  prefixo: 'limpartudo',
  async executar(i, argumento) {
    const [acao, donoId] = argumento.split(':');
    if (i.user.id !== donoId) return i.reply({ content: 'Esse botão não é seu.', flags: MessageFlags.Ephemeral });
    if (acao === 'cancelar') return i.update({ content: '👍 Cancelado. Nada foi apagado.', components: [] });

    const canal = i.channel;
    if (!(canal instanceof TextChannel)) return i.update({ content: 'Esse canal não pode ser recriado.', components: [] });
    if (Date.now() - i.message.createdTimestamp > 2 * 60_000) {
      return i.update({ content: '⌛ A confirmação expirou. Rode `/limpar tudo:true` de novo.', components: [] });
    }
    await i.update({ content: '🧨 Limpando...', components: [] });

    try {
      // Clonar copia nome, tópico, categoria, permissões, slowmode e NSFW; a posição é ajustada em seguida.
      const novo = await canal.clone({ reason: `/limpar tudo por ${i.user.tag}` });
      await novo.setPosition(canal.position);
      await canal.delete(`/limpar tudo por ${i.user.tag}`);
      await novo.send({ content: `🧹 Canal limpo por ${i.user}.`, allowedMentions: { parse: [] } });
    } catch {
      return i.editReply({ content: '⚠️ Não consegui recriar o canal. O bot precisa da permissão **Gerenciar canais**.' }).catch(() => null);
    }
  },
};

export const castigo: Comando = {
  data: new SlashCommandBuilder()
    .setName('castigo')
    .setDescription('Deixa alguém de castigo (sem falar/escrever) por um tempo')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('membro').setDescription('Quem').setRequired(true))
    .addIntegerOption((o) => o.setName('minutos').setDescription('Duração (0 tira o castigo)').setRequired(true).setMinValue(0).setMaxValue(10080))
    .addStringOption((o) => o.setName('motivo').setDescription('Por quê').setMaxLength(200)),

  async executar(i) {
    const membro = await i.guild!.members.fetch(i.options.getUser('membro', true).id).catch(() => null);
    if (!membro?.moderatable) return i.reply({ content: 'Não consigo castigar essa pessoa (cargo acima do meu?).', flags: MessageFlags.Ephemeral });
    const minutos = i.options.getInteger('minutos', true);
    const motivo = i.options.getString('motivo') ?? undefined;
    await membro.timeout(minutos ? minutos * 60_000 : null, motivo);
    return i.reply(minutos ? `🔇 ${membro} de castigo por ${minutos} min.${motivo ? ` Motivo: ${motivo}` : ''}` : `🔊 ${membro} saiu do castigo.`);
  },
};

// ---------- /ajuda ----------

// Cada tópico vira uma página; o menu troca de página sem poluir o chat (tudo só para quem pediu).
type Topico = { id: string; emoji: string; nome: string; resumo: string; texto: string; linhas: [string, string][] };

const TOPICOS: Topico[] = [
  {
    id: 'comeco',
    emoji: '🚪',
    nome: 'Primeiros passos',
    resumo: 'Formulário, cargos e onde fica cada coisa',
    texto: 'Novo por aqui? Começa por estes.',
    linhas: [
      ['#✅・verificacao', 'Responda o formulário (jogos, atividades, subgrupos e parabéns) para liberar o servidor. Clique de novo quando quiser trocar as escolhas.'],
      ['#🎮・escolha-suas-atividades', 'Botões para ligar e desligar jogos e atividades a qualquer hora.'],
      ['Canais das atividades', 'Góticas, Quiz, Campeões, Economia e Level up têm canal próprio, que só aparece para quem desbloquear.'],
      ['Comandos no lugar certo', 'Cada comando tem seu canal. Se usar no lugar errado, o bot avisa onde é.'],
      ['/ajuda', 'Esta ajuda. Escolha um tópico no menu.'],
    ],
  },
  {
    id: 'musica',
    emoji: '🎵',
    nome: 'Música e calls',
    resumo: 'Tocar música, rádio, calls próprias e compartilhar tela',
    texto: 'Quem toca são os bardos (Claudinho e Durgan), cada um numa call ao mesmo tempo. Os comandos de música são do Claudinho e funcionam quando os bardos estão online (veja no `/status`).',
    linhas: [
      ['/tocar', 'Toca uma música pelo nome ou link (YouTube, Spotify…) na sua call.'],
      ['/radio', 'Começa por uma música e segue sozinho com músicas parecidas, sem repetir.'],
      ['/musica', 'Controla a música da sua call: pular, pausar, parar, fila, tocando, volume, loop e embaralhar.'],
      ['/jam', 'Divulga a sua Jam do Spotify para a galera entrar.'],
      ['➕ Calls', 'Entre nesse canal de voz e ganhe uma call só sua, que some quando esvazia.'],
      ['/call', 'Manda na sua call: nome, limite de pessoas, trancar, destrancar e passar a dona.'],
      ['/tela', 'Compartilha sua tela (com som) por um link. No chat sai o botão Assistir.'],
    ],
  },
  {
    id: 'jogos',
    emoji: '🎮',
    nome: 'Jogatina e grupos',
    resumo: 'Chamar a galera, dividir times, LoL e subgrupos',
    texto: 'Para juntar a galera e organizar a jogatina.',
    linhas: [
      ['/lfg', 'Chama quem joga aquele jogo (quem marcou o jogo no formulário).'],
      ['/times', 'Divide quem está na call em times.'],
      ['/sortear', 'Sorteia algo da lista (o indie da noite, quem começa…).'],
      ['/enquete', 'Abre uma votação.'],
      ['/elo', 'LoL: vincula sua conta e mostra elo, maestrias e partidas (vincular, ver, buscar).'],
      ['/gratis', 'Jogos de graça na Epic, Steam e GOG. Os novos também são avisados em #jogos-gratis.'],
      ['/drg build', 'Deep Rock Galactic: opções de build (overclock e mods) de cada arma, no canal de builds de DRG.'],
      ['/rockandstone', 'ROCK AND STONE! Se você estiver em call, um bardo entra, solta uma fala do Deep Rock e sai.'],
      ['/grupo', 'Subgrupos: criar (a staff aprova), entrar, sair, lista. O dono pede canais, renomeia, convida, remove, transfere e apaga.'],
      ['Aviso automático', 'Quando 2 ou mais pessoas abrem o mesmo jogo, o bot avisa.'],
    ],
  },
  {
    id: 'rpg',
    emoji: '🐉',
    nome: 'RPG',
    resumo: 'D&D 3.5, Daggerheart e ferramentas do Mestre',
    texto: 'Os canais das mesas aparecem para quem marcou D&D 3.5 ou Daggerheart.',
    linhas: [
      ['/rolar', 'Rola dados, por exemplo `1d20+5`.'],
      ['/ficha', 'D&D: cria e vê a ficha, mexe nos PV, edita e vê as perícias.'],
      ['/teste', 'D&D: testes de perícia, atributo, resistência, ataque e estabilizar.'],
      ['/iniciativa', 'D&D: entra na iniciativa, adiciona NPCs, passa o turno e mostra a ordem.'],
      ['/dh', 'Daggerheart: rola dualidade (com traço e experiência), dano, marca PV, Estresse, Esperança e Armadura, medo e ficha.'],
      ['/sessao', 'Marca a próxima sessão da mesa como evento do Discord e mostra as próximas.'],
      ['/gerar', 'Mestre: gera NPC, taverna, loot do 3.5 ou nome por raça.'],
      ['/ambiente', 'Mestre: trilha em loop na call da mesa (taverna, combate, floresta, masmorra, cidade, chuva, mistério, viagem).'],
    ],
  },
  {
    id: 'gotica',
    emoji: '🦇',
    nome: 'Góticas',
    resumo: 'Adotar, cuidar, evoluir e duelar',
    texto: 'Tudo no canal #goticas (desbloqueie a atividade Góticas).',
    linhas: [
      ['/gotica adotar', 'Adota a sua gótica, com aparência e personalidade sorteadas.'],
      ['/gotica ver', 'Mostra a gótica com botões para alimentar, conversar, ouvir música, passear e dormir.'],
      ['/gotica customizar', 'Escolhe penteado, cabelo, olhos, batom, pele e vestido. `/gotica visual` sorteia um visual novo.'],
      ['Evolução', 'Asas no nível 10, aura no 15, coroa no 20 e lua de sangue no 30.'],
      ['/gotica duelo', 'Duelo por turnos com outra gótica, valendo XP e moedas (e uma aposta, se quiser).'],
      ['/gotica visitar', 'Visita a gótica de alguém: as duas ganham XP.'],
      ['/gotica ranking', 'As góticas mais fortes do servidor. `/gotica renomear` troca o nome.'],
      ['/loja gotica', 'Chapéus, óculos, bichinhos e fundos para sua gótica.'],
    ],
  },
  {
    id: 'economia',
    emoji: '💰',
    nome: 'Moedas e níveis',
    resumo: 'Daily, trabalho, loja, ranking e conquistas',
    texto: 'Conversar e ficar em call dá XP e moedas. Subir de nível dá cargos (Bebum, Frequentador, Veterano e Lenda).',
    linhas: [
      ['/daily', 'Moedas do dia. Dias seguidos rendem mais.'],
      ['/trabalhar', 'Faz um bico na taverna e ganha moedas (uma vez por hora).'],
      ['/carteira', 'Mostra suas moedas.'],
      ['/pix', 'Manda moedas para alguém.'],
      ['/rank', 'Seu cartão de nível.'],
      ['/top', 'Ranking por nível, moedas ou tempo em call.'],
      ['/loja taverna', 'Compra cor do nome e XP em dobro.'],
      ['/conquistas', 'As conquistas que você já desbloqueou.'],
    ],
  },
  {
    id: 'apostas',
    emoji: '🎰',
    nome: 'Apostas e minigames',
    resumo: 'Cassino, desafios, assalto, quiz e palavra do dia',
    texto: 'Para gastar (ou multiplicar) as moedas.',
    linhas: [
      ['/cassino', 'Moeda, slots e roleta. No caça-níquel cada símbolo paga diferente com 2 ou 3 iguais: `/cassino premios` mostra a tabela. `/cassino limite` mostra quanto ainda dá para apostar hoje.'],
      ['/desafiar', 'Desafia alguém valendo moedas: cara ou coroa, dado ou duelo de góticas. Quem ganha leva as duas apostas.'],
      ['/assaltar', 'Tenta roubar moedas de alguém (40% de chance). Se for pego, paga multa para a vítima.'],
      ['/quemdisse', 'Uma frase salva da galera: acerte quem falou e ganhe moedas.'],
      ['/palavra', 'Palavra do dia: chutar, ver e ranking.'],
      ['/quiz', 'Adivinhe o campeão do LoL (iniciar e ranking).'],
      ['Campeões', '`/asheap`, `/darius`, `/teemo`, `/yasuo`, `/blitz`, `/garen`, `/jinx` e `/thresh` falam no chat e descem a lenha em alguém. `/vitimas` mostra o placar.'],
    ],
  },
  {
    id: 'resenha',
    emoji: '💬',
    nome: 'Resenha e agenda',
    resumo: 'Hall da fama, citações, lembretes e aniversários',
    texto: 'O que a galera falou e o que vem por aí.',
    linhas: [
      ['⭐ Hall da fama', 'Reaja com ⭐: com 3 estrelas, a mensagem vai para #hall-da-fama.'],
      ['Salvar citação', 'Botão direito numa mensagem → Apps → **Salvar citação**. `/citacao` sorteia uma.'],
      ['Resumo da semana', 'Todo domingo às 20h sai no #geral o resumo da semana da Taverna.'],
      ['/lembrete', 'Cria, lista e apaga lembretes (o aviso chega no seu privado).'],
      ['/aniversario', 'Salva seu aniversário: no dia, o bot chama a galera no #geral às 9h.'],
      ['/sugestao', 'Manda uma ideia para o bot. A galera vota em #sugestoes e a staff aprova.'],
      ['Call lendária', 'Com 5 ou mais pessoas na mesma call, o bot chama todo mundo no #geral.'],
    ],
  },
  {
    id: 'diversao',
    emoji: '🎉',
    nome: 'Diversão',
    resumo: 'Comandos rápidos para zoar e conferir',
    texto: 'Coisas rápidas, no #comandos-do-bot.',
    linhas: [
      ['/moeda', 'Cara ou coroa.'],
      ['/8ball', 'Pergunte e a bola mágica responde.'],
      ['/cafe', 'O taverneiro passa um café para você (ou para alguém).'],
      ['/avatar', 'Mostra a foto de alguém em tamanho grande.'],
      ['/servidor', 'Informações do servidor.'],
      ['/status', 'Como o bot está: ping, tempo no ar, música e memória.'],
      ['/versao', 'O que mudou na última versão do bot.'],
    ],
  },
  {
    id: 'staff',
    emoji: '🛡️',
    nome: 'Staff',
    resumo: 'Moderação, configurações e homenagens',
    texto: 'Só para a staff e os admins.',
    linhas: [
      ['/limpar', 'Apaga mensagens: uma quantidade, só de bots, de pessoas ou de alguém, ou `tudo` (recria o canal).'],
      ['/castigo', 'Deixa alguém de castigo (sem falar) por alguns minutos.'],
      ['/logs', 'Tudo o que o bot fez para cada pessoa.'],
      ['/resumo', 'Prévia do resumo da semana que sai domingo às 20h.'],
      ['/apostas', 'Máximo por aposta e limite diário do cassino.'],
      ['/minerador', '⛏️ Anão Minerador R&S: homenagem para quem é muito amigo e presente, com anúncio no #geral (dar, tirar, lista).'],
      ['/staff', 'Admin: dá e tira o cargo de Staff e mostra quem é.'],
      ['/setup', 'Admin: monta ou completa o servidor (cargos, canais e painéis).'],
      ['/permissoes', 'Admin: faz cada comando aparecer só para quem tem o cargo dele.'],
      ['/reiniciar', 'Admin: reinicia o bot.'],
    ],
  },
];

function paginaAjuda(guild: Guild | null, id?: string) {
  const topico = TOPICOS.find((t) => t.id === id);
  const embed = new EmbedBuilder().setColor(0xe67e22);
  if (!topico) {
    embed
      .setTitle(`${emoji(guild, 'taverna_cerveja', '🍺')} Ajuda do Taverneiro`)
      .setDescription('Escolha um tópico no menu abaixo para ver os comandos e o que cada um faz.\n\n' + TOPICOS.map((t) => `${t.emoji} **${t.nome}**: ${t.resumo}`).join('\n'))
      .setFooter({ text: 'Só você vê esta mensagem' });
  } else {
    embed
      .setTitle(`${topico.emoji} ${topico.nome}`)
      .setDescription(`${topico.texto}\n\n` + topico.linhas.map(([nome, texto]) => `**${nome.startsWith('/') ? `\`${nome}\`` : nome}**\n${texto}`).join('\n\n'))
      .setFooter({ text: 'Troque de tópico no menu abaixo' });
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ajuda:topico')
    .setPlaceholder('📚 Escolha um tópico')
    .addOptions(TOPICOS.map((t) => ({ label: t.nome, value: t.id, emoji: t.emoji, description: t.resumo.slice(0, 100), default: t.id === id })));
  return { embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
}

export const ajuda: Comando = {
  data: new SlashCommandBuilder()
    .setName('ajuda')
    .setDescription('O que o bot faz, separado por tópicos')
    .addStringOption((o) =>
      o
        .setName('topico')
        .setDescription('Ir direto para um tópico')
        .addChoices(...TOPICOS.map((t) => ({ name: `${t.emoji} ${t.nome}`, value: t.id }))),
    ),
  async executar(i) {
    return i.reply({ ...paginaAjuda(i.guild, i.options.getString('topico') ?? undefined), flags: MessageFlags.Ephemeral });
  },
};

export const selecaoAjuda: HandlerSelecao = {
  prefixo: 'ajuda',
  async executar(i) {
    return i.update(paginaAjuda(i.guild, i.values[0]));
  },
};
