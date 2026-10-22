import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags, Partials, type ChatInputCommandInteraction, type Interaction } from 'discord.js';
import { aniversario, iniciarAgenda, lembrete, sessao } from './recursos/agenda.ts';
import { aoEntrar, aoSair } from './recursos/boasVindas.ts';
import { aoMudarVoz, call, limparCallsOrfas } from './recursos/calls.ts';
import { dh } from './recursos/daggerheart.ts';
import { botaoGotica, gotica } from './recursos/gotica.ts';
import { comandosCampeoes, vitimas } from './recursos/campeoes.ts';
import { botaoCargo } from './recursos/cargos.ts';
import { aoMensagem, carteiraCmd, daily, iniciarAtividade, pix, rank, top, trabalhar } from './recursos/economia.ts';
import { avatar, bola8, cafe, enquete, moeda, servidor } from './recursos/diversao.ts';
import { botaoDuelo } from './recursos/goticaSocial.ts';
import { botaoGrupo, ehCanalDeGrupo, grupo, modalGrupo } from './recursos/grupos.ts';
import { botaoLimpeza } from './recursos/limpeza.ts';
import { loja } from './recursos/loja.ts';
import { botaoJam, jam } from './recursos/jam.ts';
import { botaoRadio, iniciarMusica, musica, radio, tocar } from './recursos/musica.ts';
import { botaoQuiz, quiz } from './recursos/quiz.ts';
import { iniciarRegistro, logs, registrarInteracao } from './recursos/registro.ts';
import { ficha, iniciativa, rolarComando, teste } from './recursos/rpg.ts';
import { setup } from './recursos/setup.ts';
import { staff } from './recursos/staff.ts';
import { ajuda, botaoLfg, botaoLimparTudo, castigo, lfg, limpar, sortear, times } from './recursos/utilidades.ts';
import { canaisDoComando } from './canaisDosComandos.ts';
import { avisoCanalErrado, registrarCliente } from './lib/servidor.ts';
import { NOME_SERVIDOR } from './config.ts';
import type { Comando, HandlerBotao, HandlerModal } from './tipos.ts';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Falta o DISCORD_TOKEN no arquivo .env (veja o .env.example).');
  process.exit(1);
}

const COMANDOS: Comando[] = [
  setup, tocar, radio, musica, jam, call, ficha, rolarComando, teste, iniciativa, dh, sessao,
  lfg, times, sortear, enquete, lembrete, aniversario, moeda, bola8, cafe, gotica, avatar, servidor, limpar, castigo, ajuda,
  daily, trabalhar, carteiraCmd, pix, rank, top, loja, vitimas, quiz, grupo, logs, staff, ...comandosCampeoes,
];
const BOTOES: HandlerBotao[] = [botaoCargo, botaoLfg, botaoLimpeza, botaoJam, botaoGotica, botaoLimparTudo, botaoDuelo, botaoQuiz, botaoGrupo, botaoRadio];
const MODAIS: HandlerModal[] = [modalGrupo];
const porNome = new Map(COMANDOS.map((c) => [c.data.name, c]));

/** Aviso se o comando foi usado fora do canal dele (tabela em canaisDosComandos.ts). */
function foraDoCanal(i: ChatInputCommandInteraction) {
  const canais = canaisDoComando(i.commandName);
  if (!canais || !i.inGuild()) return undefined;
  const categoria = i.channel && 'parentId' in i.channel ? i.channel.parentId : null;
  if (i.commandName === 'grupo' && ehCanalDeGrupo(i.guildId, categoria)) return undefined;
  return avisoCanalErrado(i, canais);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privilegiada: boas-vindas e cargo automático
    GatewayIntentBits.GuildPresences, // privilegiada: nomear a call com o jogo
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages, // não privilegiada: XP por mensagem (o texto não é lido)
    GatewayIntentBits.GuildExpressions, // não privilegiada: mantém a lista de emojis do servidor atualizada
  ],
  partials: [Partials.GuildMember],
});

client.once(Events.ClientReady, async (c) => {
  registrarCliente(c);
  // Comandos registrados por servidor aparecem na hora (os globais podem demorar).
  const corpo = COMANDOS.map((cmd) => cmd.data.toJSON());
  for (const guild of c.guilds.cache.values()) await guild.commands.set(corpo);

  await iniciarMusica(c);
  await limparCallsOrfas(c);
  iniciarAgenda(c);
  iniciarAtividade(c);
  iniciarRegistro(c);
  c.user.setActivity(`/ajuda · ${NOME_SERVIDOR}`, { type: ActivityType.Custom });
  console.log(`🍺 ${c.user.tag} online em ${c.guilds.cache.size} servidor(es) com ${COMANDOS.length} comandos.`);
});

client.on(Events.GuildCreate, (guild) => guild.commands.set(COMANDOS.map((cmd) => cmd.data.toJSON())));

client.on(Events.InteractionCreate, async (i: Interaction) => {
  try {
    if (i.isChatInputCommand()) {
      const fora = foraDoCanal(i);
      if (fora) {
        await i.reply(fora);
        registrarInteracao(i, 'usado fora do canal do comando');
        return;
      }
      await porNome.get(i.commandName)?.executar(i);
    } else if (i.isAutocomplete()) {
      await porNome.get(i.commandName)?.autocompletar?.(i);
    } else if (i.isButton()) {
      const [prefixo, ...resto] = i.customId.split(':');
      await BOTOES.find((b) => b.prefixo === prefixo)?.executar(i, resto.join(':'));
    } else if (i.isModalSubmit()) {
      const [prefixo, ...resto] = i.customId.split(':');
      await MODAIS.find((m) => m.prefixo === prefixo)?.executar(i, resto.join(':'));
    }
    registrarInteracao(i);
  } catch (erro) {
    console.error('[interação]', erro);
    registrarInteracao(i, erro);
    if (!i.isRepliable()) return;
    const msg = { content: '😵 Deu ruim aqui. Tenta de novo; se continuar, avisa o admin.', flags: MessageFlags.Ephemeral } as const;
    await (i.deferred || i.replied ? i.followUp(msg) : i.reply(msg)).catch(() => {});
  }
});

client.on(Events.VoiceStateUpdate, (antes, depois) => aoMudarVoz(antes, depois).catch((e) => console.error('[calls]', e)));
client.on(Events.MessageCreate, (m) => aoMensagem(m).catch((e) => console.error('[atividade]', e)));
client.on(Events.GuildMemberAdd, (m) => aoEntrar(m).catch((e) => console.error('[boas-vindas]', e)));
client.on(Events.GuildMemberRemove, (m) => aoSair(m).catch((e) => console.error('[saída]', e)));

process.on('unhandledRejection', (e) => console.error('[não tratado]', e));

try {
  await client.login(token);
} catch (erro) {
  const codigo = (erro as { code?: string }).code;
  if (codigo === 'TokenInvalid') console.error('Token inválido. Gere um novo em Developer Portal → Bot → Reset Token.');
  else if (codigo === 'DisallowedIntents')
    console.error('Ative "Server Members Intent" e "Presence Intent" em Developer Portal → Bot → Privileged Gateway Intents.');
  else console.error('Não consegui conectar ao Discord:', erro);
  process.exitCode = 1;
  await client.destroy();
}
