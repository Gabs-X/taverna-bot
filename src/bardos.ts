import { writeFileSync } from 'node:fs';
import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags, type ChatInputCommandInteraction, type GuildMember, type Interaction } from 'discord.js';
import { canaisDoComando } from './canaisDosComandos.ts';
import { CARGOS } from './config.ts';
import { avisoCanalErrado, ehMestre, ehStaff, registrarCliente, temCargo } from './lib/servidor.ts';
import { ambiente, botaoRadio, iniciarMusica, musica, musicasTocando, radio, rockandstone, tocar } from './recursos/musica.ts';
import type { Comando, HandlerBotao } from './tipos.ts';

// Bardos: o programa da música, separado do Taverneiro. Roda no PC de casa porque o YouTube bloqueia muito os
// endereços de servidores na nuvem (onde fica o Taverneiro). Se este PC desligar, só a música para.
//
// O primeiro bardo do .env (TOKEN_MUSICA_2, o Claudinho) é o dono dos comandos de música e atende quem os usa;
// os outros (TOKEN_MUSICA_3...) só tocam. Cada bardo toca numa call ao mesmo tempo.
// Uso: node --env-file=.env src/bardos.ts   (ou o supervisor: node scripts/supervisor.mjs --entrada src/bardos.ts)

const COMANDOS: Comando[] = [tocar, radio, musica, ambiente, rockandstone];
const BOTOES: HandlerBotao[] = [botaoRadio];
const porNome = new Map(COMANDOS.map((c) => [c.data.name, c]));

const tokens = Object.entries(process.env)
  .filter(([chave, valor]) => /^TOKEN_MUSICA_\d+$/.test(chave) && valor)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
if (!tokens.length) {
  console.error('Falta pelo menos um TOKEN_MUSICA_2 no arquivo .env (o token do primeiro bardo).');
  process.exit(1);
}

/** Liga um bardo e espera ele ficar pronto. */
async function conectar(chave: string, token: string) {
  const bardo = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  const pronto = new Promise((r) => bardo.once(Events.ClientReady, r));
  await bardo.login(token);
  await pronto;
  console.log(`🎵 Bardo ${bardo.user!.tag} online (${chave}).`);
  return bardo;
}

const bardos: Client[] = [];
for (const [chave, token] of tokens) {
  try {
    bardos.push(await conectar(chave, token!));
  } catch (erro) {
    console.error(`[bardos] ${chave} não conectou:`, (erro as Error).message);
  }
}
if (!bardos.length) {
  console.error('Nenhum bardo conectou. Confira os tokens no .env.');
  process.exit(1);
}

const principal = bardos[0];
registrarCliente(principal);
await iniciarMusica(bardos);

// Comandos de música ficam no app do primeiro bardo (registrados por servidor: aparecem na hora).
const corpo = COMANDOS.map((c) => c.data.toJSON());
for (const guild of principal.guilds.cache.values()) await guild.commands.set(corpo);
principal.on(Events.GuildCreate, (guild) => guild.commands.set(corpo));
for (const b of bardos) b.user!.setActivity('🎵 /tocar · /radio', { type: ActivityType.Custom });

/** Mesma regra do Taverneiro: cada comando no canal dele (canaisDosComandos.ts). */
function foraDoCanal(i: ChatInputCommandInteraction) {
  const canais = canaisDoComando(i.commandName);
  return canais && i.inGuild() ? avisoCanalErrado(i, canais) : undefined;
}

/** /ambiente é da mesa de RPG: só quem joga numa mesa, o Mestre ou a staff. */
function podeAmbiente(i: ChatInputCommandInteraction) {
  const m = i.member as GuildMember | null;
  if (!m || !i.guild) return false;
  return ehMestre(m) || ehStaff(i.guild, m.id) || temCargo(m, CARGOS.aventureiro.nome) || temCargo(m, CARGOS.daggerheart.nome);
}

principal.on(Events.InteractionCreate, async (i: Interaction) => {
  try {
    if (i.isChatInputCommand()) {
      const fora = foraDoCanal(i);
      if (fora) {
        await i.reply(fora);
        setTimeout(() => i.deleteReply().catch(() => {}), 30_000);
        return;
      }
      if (i.commandName === 'ambiente' && !podeAmbiente(i)) {
        return void (await i.reply({ content: 'O `/ambiente` é das mesas de RPG (jogadores, Mestre e staff).', flags: MessageFlags.Ephemeral }));
      }
      await porNome.get(i.commandName)?.executar(i);
    } else if (i.isButton()) {
      const [prefixo, ...resto] = i.customId.split(':');
      await BOTOES.find((b) => b.prefixo === prefixo)?.executar(i, resto.join(':'));
    }
  } catch (erro) {
    console.error('[bardos]', erro);
    if (!i.isRepliable()) return;
    const msg = { content: '😵 Deu ruim aqui. Tenta de novo; se continuar, avisa o admin.', flags: MessageFlags.Ephemeral } as const;
    await (i.deferred || i.replied ? i.followUp(msg) : i.reply(msg)).catch(() => {});
  }
});

// Conta ao supervisor o que está tocando: ele adia o reinício até a música acabar.
setInterval(() => {
  const tocando = musicasTocando();
  try {
    writeFileSync('dados/estado.json', JSON.stringify({ em: Date.now(), ocupado: tocando ? [`${tocando} música(s) tocando`] : [] }));
  } catch {
    // sem pasta de dados ainda
  }
}, 5_000).unref();

process.on('unhandledRejection', (e) => console.error('[não tratado]', e));
console.log(`🎶 Bardos prontos: ${bardos.map((b) => b.user!.username).join(', ')} · comandos pelo ${principal.user!.username}.`);
