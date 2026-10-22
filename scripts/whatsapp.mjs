// Aviso de versões novas num grupo do WhatsApp (biblioteca não oficial Baileys: use um número extra se puder).
// Conecta só para mandar a mensagem e desconecta em seguida.
//
//   node scripts/whatsapp.mjs conectar          → mostra o QR code; escaneie em WhatsApp → Aparelhos conectados
//   node scripts/whatsapp.mjs grupos            → lista os grupos do número conectado
//   node scripts/whatsapp.mjs grupo "Nome"      → escolhe o grupo que recebe os avisos
//   node scripts/whatsapp.mjs enviar            → manda o texto recebido pela entrada padrão (usado pelo bot)
//   node scripts/whatsapp.mjs desconectar       → desliga o número (apaga a sessão salva)
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import qrcode from 'qrcode-terminal';

const RAIZ = resolve(import.meta.dirname, '..');
const SESSAO = join(RAIZ, 'dados', 'whatsapp-sessao');
const CONFIG = join(RAIZ, 'dados', 'whatsapp.json');
mkdirSync(join(RAIZ, 'dados'), { recursive: true });

// Logger mudo (o Baileys fala muito); só os nossos console.log aparecem.
const mudo = { level: 'silent', trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child() { return mudo; } };

const lerConfig = () => (existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')) : {});
const salvarConfig = (c) => writeFileSync(CONFIG, JSON.stringify({ ...lerConfig(), ...c }, null, 2));

/** Abre a conexão; resolve quando estiver pronta. Mostra QR se ainda não estiver pareado. */
function conectar({ mostrarQr = false } = {}) {
  return new Promise(async (pronto, falhou) => {
    const { state, saveCreds } = await useMultiFileAuthState(SESSAO);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    const abrir = () => {
      const sock = makeWASocket({
        version,
        auth: state,
        logger: mudo,
        browser: Browsers.windows('Taverneiro'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });
      sock.ev.on('creds.update', saveCreds);
      sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          if (!mostrarQr) {
            sock.end(undefined);
            falhou(new Error('WhatsApp não conectado: rode "npm run whatsapp:conectar" e escaneie o QR code.'));
            return;
          }
          console.log('\n📱 No celular do número que vai enviar: WhatsApp → Aparelhos conectados → Conectar um aparelho.\n');
          qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') pronto(sock);
        if (connection === 'close') {
          const codigo = lastDisconnect?.error?.output?.statusCode;
          // Logo depois de escanear o QR, o WhatsApp pede para reconectar uma vez.
          if (codigo === DisconnectReason.restartRequired) return abrir();
          if (codigo === DisconnectReason.loggedOut) {
            rmSync(SESSAO, { recursive: true, force: true });
            falhou(new Error('O número foi desconectado no celular. Rode "npm run whatsapp:conectar" de novo.'));
            return;
          }
          falhou(new Error(`Conexão com o WhatsApp caiu (código ${codigo ?? '?'}).`));
        }
      });
    };
    abrir();
  });
}

async function listarGrupos(sock) {
  const grupos = Object.values(await sock.groupFetchAllParticipating());
  return grupos.map((g) => ({ id: g.id, nome: g.subject, membros: g.participants.length })).sort((a, b) => a.nome.localeCompare(b.nome));
}

const encerrar = async (sock) => {
  await new Promise((r) => setTimeout(r, 1500)); // deixa a mensagem sair antes de fechar
  sock.end(undefined);
};

const [acao, ...resto] = process.argv.slice(2);
try {
  if (acao === 'conectar') {
    const sock = await conectar({ mostrarQr: true });
    console.log(`\n✅ Conectado como ${sock.user?.name ?? sock.user?.id}.`);
    const grupos = await listarGrupos(sock);
    console.log(`\nGrupos deste número (${grupos.length}):`);
    for (const g of grupos) console.log(`  • ${g.nome} (${g.membros} pessoas)`);
    console.log('\nAgora escolha o grupo: npm run whatsapp:grupo -- "Nome do grupo"');
    await encerrar(sock);
  } else if (acao === 'grupos') {
    const sock = await conectar();
    for (const g of await listarGrupos(sock)) console.log(`• ${g.nome} (${g.membros} pessoas)`);
    await encerrar(sock);
  } else if (acao === 'grupo') {
    const busca = resto.join(' ').trim().toLowerCase();
    if (!busca) throw new Error('Diga o nome do grupo: npm run whatsapp:grupo -- "Nome do grupo"');
    const sock = await conectar();
    const grupos = await listarGrupos(sock);
    const achados = grupos.filter((g) => g.nome.toLowerCase().includes(busca));
    await encerrar(sock);
    if (achados.length !== 1) {
      throw new Error(achados.length ? `Mais de um grupo bate com isso: ${achados.map((g) => g.nome).join(', ')}. Seja mais específico.` : 'Nenhum grupo com esse nome. Veja a lista com npm run whatsapp:grupos');
    }
    salvarConfig({ grupoId: achados[0].id, grupoNome: achados[0].nome });
    console.log(`✅ Os avisos de versão vão para o grupo "${achados[0].nome}".`);
  } else if (acao === 'enviar') {
    const { grupoId, grupoNome } = lerConfig();
    if (!grupoId) throw new Error('Nenhum grupo escolhido: npm run whatsapp:grupo -- "Nome do grupo"');
    const texto = readFileSync(0, 'utf8').trim();
    if (!texto) throw new Error('Nada para enviar.');
    const sock = await conectar();
    await sock.sendMessage(grupoId, { text: texto });
    console.log(`✅ Enviado ao grupo "${grupoNome}".`);
    await encerrar(sock);
  } else if (acao === 'desconectar') {
    if (existsSync(SESSAO)) {
      const sock = await conectar().catch(() => null);
      await sock?.logout().catch(() => {});
      rmSync(SESSAO, { recursive: true, force: true });
    }
    console.log('✅ Número desconectado. Os avisos no WhatsApp param até você conectar de novo.');
  } else {
    console.log('Uso: conectar | grupos | grupo "Nome" | enviar | desconectar');
  }
  process.exit(0);
} catch (erro) {
  console.error(`❌ ${erro.message}`);
  process.exit(1);
}
