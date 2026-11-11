// Sobe só o site do mapa, com um banco de teste e um Discord de mentira, para mexer na página sem o bot.
// Uso: npm run mapa:demo  (recarrega sozinho quando algo em src/ muda; os dados ficam na pasta temporária).
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repo = new URL('../src/', import.meta.url).href;
const pasta = process.argv[2] ?? join(tmpdir(), 'taverna-mapa-demo');
mkdirSync(pasta, { recursive: true });
process.chdir(pasta);
process.env.MAPA_PORTA ??= '53199';
delete process.env.MAPA_URL;

const { db } = await import(repo + 'db.ts');
const { iniciarMapa, linkDoMapa } = await import(repo + 'recursos/mapa.ts');

const MESTRE = '100000000000000001';
const JOGADOR = '200000000000000002';
const falso = {
  guilds: { cache: new Map() },
  channels: { fetch: async () => null },
  users: { fetch: async () => { throw new Error('offline'); } },
  user: { id: 'bot' },
};

let c = db.prepare("SELECT id FROM campanhas WHERE nome = 'Demo'").get() as { id: number } | undefined;
if (!c) {
  const id = Number(db.prepare("INSERT INTO campanhas (guild_id, nome, sistema, mestre_id, criada_em) VALUES ('g', 'Demo', 'dh', ?, 0)").run(MESTRE).lastInsertRowid);
  db.prepare('INSERT INTO campanha_personagens (campanha_id, user_id) VALUES (?, ?)').run(id, JOGADOR);
  c = { id };
}
iniciarMapa(falso as never);
console.log(`Dados em ${pasta}`);
console.log(`MESTRE  ${linkDoMapa(c.id, MESTRE, 12 * 3600_000)}`);
console.log(`JOGADOR ${linkDoMapa(c.id, JOGADOR, 12 * 3600_000)}`);
