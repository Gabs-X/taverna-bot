// Regras do mundo de Minecraft da galera que não dependem do Discord nem do servidor ligado:
// protocolo RCON, leitura das respostas do console, whitelist do modo pirata e a hora de desligar sozinho.
import { createHash } from 'node:crypto';

/** Nome do subgrupo de quem joga (o canal de texto dele é onde o /mine funciona). */
export const GRUPO_MINE = process.env.MINE_GRUPO?.trim() || 'Minecraft';

// ---------- Nick ----------

/** Devolve o motivo do problema, ou undefined se o nick serve (regra do próprio Minecraft). */
export function problemaNoNick(nick: string): string | undefined {
  const n = nick.trim();
  if (n.length < 3 || n.length > 16) return 'O nick precisa ter de 3 a 16 caracteres.';
  if (!/^[A-Za-z0-9_]+$/.test(n)) return 'O nick só pode ter letras sem acento, números e _ (como no Minecraft).';
  return undefined;
}

/**
 * UUID que o servidor em modo pirata (online-mode=false) dá ao jogador: UUID versão 3 de "OfflinePlayer:<nick>".
 * A whitelist confere esse UUID, então ele tem que bater com o do servidor.
 */
export function uuidOffline(nick: string): string {
  const h = createHash('md5').update(`OfflinePlayer:${nick}`, 'utf8').digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// ---------- Whitelist (whitelist.json do servidor) ----------

export type EntradaWhitelist = { uuid: string; name: string };

/** Lista com o nick (trocando a entrada antiga de mesmo nome, sem diferenciar maiúsculas). */
export function comNick(lista: EntradaWhitelist[], nick: string): EntradaWhitelist[] {
  return [...semNick(lista, nick), { uuid: uuidOffline(nick), name: nick }];
}
export const semNick = (lista: EntradaWhitelist[], nick: string) => lista.filter((e) => e.name.toLowerCase() !== nick.toLowerCase());

/** Dono do nick entre os cadastros (Discord id → nick), sem diferenciar maiúsculas. */
export const donoDoNick = (cadastros: Record<string, string>, nick: string) =>
  Object.entries(cadastros).find(([, n]) => n.toLowerCase() === nick.toLowerCase())?.[0];

// ---------- RCON ----------

export const RCON_LOGIN = 3;
export const RCON_COMANDO = 2;

/** Pacote RCON: tamanho, id, tipo, corpo em UTF-8 e dois bytes zero (little-endian). */
export function pacoteRcon(id: number, tipo: number, corpo: string): Buffer {
  const texto = Buffer.from(corpo, 'utf8');
  const b = Buffer.alloc(14 + texto.length);
  b.writeInt32LE(10 + texto.length, 0);
  b.writeInt32LE(id, 4);
  b.writeInt32LE(tipo, 8);
  texto.copy(b, 12);
  return b;
}

/** Separa os pacotes completos que chegaram; o que sobrar fica para a próxima leitura. */
export function lerPacotesRcon(buf: Buffer): { pacotes: { id: number; tipo: number; corpo: string }[]; resto: Buffer } {
  const pacotes: { id: number; tipo: number; corpo: string }[] = [];
  let pos = 0;
  while (buf.length - pos >= 4) {
    const tam = buf.readInt32LE(pos);
    if (buf.length - pos - 4 < tam) break;
    pacotes.push({ id: buf.readInt32LE(pos + 4), tipo: buf.readInt32LE(pos + 8), corpo: buf.toString('utf8', pos + 12, pos + 4 + tam - 2) });
    pos += 4 + tam;
  }
  return { pacotes, resto: buf.subarray(pos) };
}

/** Tira as cores do Minecraft (§a, §l...) das respostas. */
export const semCores = (t: string) => t.replace(/§./g, '');

// ---------- Respostas do console ----------

/** "There are 2 of a max of 20 players online: Ana, Beto" (também aceita a versão sem nomes). */
export function lerLista(texto: string): { online: number; max: number; nomes: string[] } | undefined {
  const m = semCores(texto).match(/There are (\d+) of a max(?: of)? (\d+) players online:?\s*(.*)$/s);
  if (!m) return undefined;
  const nomes = m[3].split(',').map((n) => n.trim()).filter(Boolean);
  return { online: Number(m[1]), max: Number(m[2]), nomes };
}

/** TPS geral do "/neoforge tps" (linha "Overall: 20,000 TPS (14,313 ms/tick)"); undefined se não deu para ler. */
export function lerTps(texto: string): number | undefined {
  const linha = semCores(texto).match(/^Overall:?(.*)$/im)?.[1];
  const m = linha?.match(/([\d.,]+)\s*TPS/i) ?? linha?.match(/TPS:\s*([\d.,]+)/i);
  return m ? Number(m[1].replace(',', '.')) : undefined;
}

/** "/chunky progress": se há pré-geração rodando e quanto já foi. */
export function lerChunky(texto: string): { rodando: boolean; porcento?: number } {
  const t = semCores(texto);
  const m = t.match(/Task running[^\n]*?\(([\d.,]+)%\)/i);
  return m ? { rodando: true, porcento: Number(m[1].replace(',', '.')) } : { rodando: false };
}

// ---------- Desligar sozinho ----------

export const DESLIGAR_VAZIO_MS = 15 * 60_000;

/** Desliga quando está vazio há o tempo todo e não tem pré-geração de mapa rodando. */
export function deveDesligar(p: { vazioDesde: number | null; agora: number; pregerando: boolean; limiteMs?: number }): boolean {
  if (p.pregerando || p.vazioDesde === null) return false;
  return p.agora - p.vazioDesde >= (p.limiteMs ?? DESLIGAR_VAZIO_MS);
}

// ---------- Pacote de mods extras ----------

/**
 * Nome do zip dos mods extras: muda sempre que um mod entra, sai ou troca de versão, então o link velho
 * nunca entrega a lista errada. O mesmo código serve de "versão dos mods" para a galera conferir.
 */
export function versaoDosExtras(jars: { nome: string; tamanho: number }[]): string {
  const base = [...jars].sort((a, b) => a.nome.localeCompare(b.nome)).map((j) => `${j.nome}:${j.tamanho}`).join('\n');
  return createHash('sha256').update(base).digest('hex').slice(0, 8);
}
export const nomeDoZip = (versao: string) => `mods-extras-${versao}.zip`;
export const ZIP_VALIDO = /^mods-extras-[a-f0-9]{8}\.zip$/;
