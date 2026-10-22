import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags, Partials, type Interaction } from 'discord.js';
import { aniversario, iniciarAgenda, lembrete, sessao } from './recursos/agenda.ts';
import { aoEntrar, aoSair } from './recursos/boasVindas.ts';
import { aoMudarVoz, call, limparCallsOrfas } from './recursos/calls.ts';
import { dh } from './recursos/daggerheart.ts';
import { botaoCargo } from './recursos/cargos.ts';
import { avatar, bola8, cafe, enquete, moeda, servidor } from './recursos/diversao.ts';
import { botaoLimpeza } from './recursos/limpeza.ts';
import { botaoJam, jam } from './recursos/jam.ts';
import { iniciarMusica, musica, tocar } from './recursos/musica.ts';
import { ficha, iniciativa, rolarComando, teste } from './recursos/rpg.ts';
import { setup } from './recursos/setup.ts';
import { ajuda, botaoLfg, castigo, lfg, limpar, sortear, times } from './recursos/utilidades.ts';
import type { Comando, HandlerBotao } from './tipos.ts';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Falta o DISCORD_TOKEN no arquivo .env (veja o .env.example).');
  process.exit(1);
}

const COMANDOS: Comando[] = [
  setup, tocar, musica, jam, call, ficha, rolarComando, teste, iniciativa, dh, sessao,
  lfg, times, sortear, enquete, lembrete, aniversario, moeda, bola8, cafe, avatar, servidor, limpar, castigo, ajuda,
];
const BOTOES: HandlerBotao[] = [botaoCargo, botaoLfg, botaoLimpeza, botaoJam];
const porNome = new Map(COMANDOS.map((c) => [c.data.name, c]));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privilegiada: boas-vindas e cargo automático
    GatewayIntentBits.GuildPresences, // privilegiada: nomear a call com o jogo
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.GuildMember],
});

client.once(Events.ClientReady, async (c) => {
  // Comandos registrados por servidor aparecem na hora (os globais podem demorar).
  const corpo = COMANDOS.map((cmd) => cmd.data.toJSON());
  for (const guild of c.guilds.cache.values()) await guild.commands.set(corpo);

  await iniciarMusica(c);
  await limparCallsOrfas(c);
  iniciarAgenda(c);
  c.user.setActivity('/ajuda · Taverna dos Malucos', { type: ActivityType.Custom });
  console.log(`🍺 ${c.user.tag} online em ${c.guilds.cache.size} servidor(es) com ${COMANDOS.length} comandos.`);
});

client.on(Events.GuildCreate, (guild) => guild.commands.set(COMANDOS.map((cmd) => cmd.data.toJSON())));

client.on(Events.InteractionCreate, async (i: Interaction) => {
  try {
    if (i.isChatInputCommand()) {
      await porNome.get(i.commandName)?.executar(i);
    } else if (i.isAutocomplete()) {
      await porNome.get(i.commandName)?.autocompletar?.(i);
    } else if (i.isButton()) {
      const [prefixo, ...resto] = i.customId.split(':');
      await BOTOES.find((b) => b.prefixo === prefixo)?.executar(i, resto.join(':'));
    }
  } catch (erro) {
    console.error('[interação]', erro);
    if (!i.isRepliable()) return;
    const msg = { content: '😵 Deu ruim aqui. Tenta de novo; se continuar, avisa o admin.', flags: MessageFlags.Ephemeral } as const;
    await (i.deferred || i.replied ? i.followUp(msg) : i.reply(msg)).catch(() => {});
  }
});

client.on(Events.VoiceStateUpdate, (antes, depois) => aoMudarVoz(antes, depois).catch((e) => console.error('[calls]', e)));
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
