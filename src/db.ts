import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

mkdirSync('dados', { recursive: true });

export const db = new DatabaseSync('dados/taverna.db');

// Formato do banco, em migrações numeradas: cada uma roda uma única vez, em ordem.
// A versão atual fica no próprio banco (PRAGMA user_version). Para mudar o banco, ACRESCENTE uma migração
// no fim da lista (nunca altere uma que já rodou).
const MIGRACOES: (() => void)[] = [
  // 1 (22/10/2026): tudo o que existia até aqui. Só cria o que falta, porque bancos antigos já têm parte disso.
  () => {
    // As fichas eram de D&D 5e; a mesa joga 3.5. A tabela antiga é guardada como fichas_5e, não apagada.
    const colunasFichas = db.prepare("SELECT name FROM pragma_table_info('fichas')").all() as { name: string }[];
    if (colunasFichas.length && !colunasFichas.some((c) => c.name === 'bba')) {
      db.exec('DROP TABLE IF EXISTS fichas_5e; ALTER TABLE fichas RENAME TO fichas_5e;');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS calls_temporarias (
        canal_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        dono_id  TEXT NOT NULL
      );

      -- D&D 3.5
      CREATE TABLE IF NOT EXISTS fichas (
        guild_id TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        nome     TEXT NOT NULL,
        classe   TEXT NOT NULL,
        raca     TEXT NOT NULL DEFAULT '',
        nivel    INTEGER NOT NULL,
        forca    INTEGER NOT NULL,
        destreza INTEGER NOT NULL,
        constituicao INTEGER NOT NULL,
        inteligencia INTEGER NOT NULL,
        sabedoria INTEGER NOT NULL,
        carisma  INTEGER NOT NULL,
        pv_max   INTEGER NOT NULL,
        pv_atual INTEGER NOT NULL,
        ca       INTEGER NOT NULL,
        bba      INTEGER NOT NULL,
        fort     INTEGER NOT NULL,
        ref      INTEGER NOT NULL,
        von      INTEGER NOT NULL,
        ini_extra INTEGER NOT NULL DEFAULT 0,
        pericias TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (guild_id, user_id)
      );

      -- Daggerheart
      CREATE TABLE IF NOT EXISTS fichas_dh (
        guild_id TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        nome     TEXT NOT NULL,
        classe   TEXT NOT NULL,
        ancestralidade TEXT NOT NULL DEFAULT '',
        comunidade TEXT NOT NULL DEFAULT '',
        nivel    INTEGER NOT NULL,
        agilidade INTEGER NOT NULL,
        forca    INTEGER NOT NULL,
        acuidade INTEGER NOT NULL,
        instinto INTEGER NOT NULL,
        presenca INTEGER NOT NULL,
        conhecimento INTEGER NOT NULL,
        evasao   INTEGER NOT NULL,
        proficiencia INTEGER NOT NULL DEFAULT 1,
        pv_max   INTEGER NOT NULL,
        pv       INTEGER NOT NULL DEFAULT 0,
        estresse_max INTEGER NOT NULL DEFAULT 6,
        estresse INTEGER NOT NULL DEFAULT 0,
        esperanca INTEGER NOT NULL DEFAULT 2,
        armadura_max INTEGER NOT NULL,
        armadura INTEGER NOT NULL DEFAULT 0,
        limiar_maior INTEGER NOT NULL,
        limiar_grave INTEGER NOT NULL,
        experiencias TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (guild_id, user_id)
      );

      -- Reserva de Medo do Mestre de Daggerheart
      CREATE TABLE IF NOT EXISTS dh_medo (
        guild_id TEXT PRIMARY KEY,
        medo     INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS lembretes (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        canal_id TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        quando   INTEGER NOT NULL,
        texto    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS aniversarios (
        guild_id TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        dia      INTEGER NOT NULL,
        mes      INTEGER NOT NULL,
        ultimo_ano_avisado INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      );

      -- Gótica de estimação (uma por pessoa em cada servidor)
      CREATE TABLE IF NOT EXISTS goticas (
        guild_id TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        nome     TEXT NOT NULL,
        aparencia TEXT NOT NULL,
        personalidade TEXT NOT NULL,
        nivel    INTEGER NOT NULL DEFAULT 1,
        xp       INTEGER NOT NULL DEFAULT 0,
        barriga  REAL NOT NULL,
        humor    REAL NOT NULL,
        energia  REAL NOT NULL,
        atualizado_em INTEGER NOT NULL,
        ultimas  TEXT NOT NULL DEFAULT '{}',
        criada_em INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      );

      -- Moedas da Taverna e nível por atividade
      CREATE TABLE IF NOT EXISTS carteira (
        guild_id TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        moedas   INTEGER NOT NULL DEFAULT 0,
        nivel    INTEGER NOT NULL DEFAULT 0,
        xp       INTEGER NOT NULL DEFAULT 0,
        mensagens INTEGER NOT NULL DEFAULT 0,
        minutos_call INTEGER NOT NULL DEFAULT 0,
        ultima_msg INTEGER NOT NULL DEFAULT 0,
        ultimo_daily INTEGER NOT NULL DEFAULT 0,
        sequencia INTEGER NOT NULL DEFAULT 0,
        ultimo_trabalho INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      );

      -- Itens comprados na loja da gótica
      CREATE TABLE IF NOT EXISTS gotica_itens (
        guild_id TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        item     TEXT NOT NULL,
        PRIMARY KEY (guild_id, user_id, item)
      );
    `);

    const colunasGoticas = db.prepare("SELECT name FROM pragma_table_info('goticas')").all() as { name: string }[];
    if (!colunasGoticas.some((c) => c.name === 'equipados')) db.exec("ALTER TABLE goticas ADD COLUMN equipados TEXT NOT NULL DEFAULT '{}'");

    const colunasLembretes = db.prepare("SELECT name FROM pragma_table_info('lembretes')").all() as { name: string }[];
    if (colunasLembretes.length && !colunasLembretes.some((c) => c.name === 'no_canal')) db.exec('ALTER TABLE lembretes ADD COLUMN no_canal INTEGER NOT NULL DEFAULT 1');

    const colunasCarteira = db.prepare("SELECT name FROM pragma_table_info('carteira')").all() as { name: string }[];
    if (!colunasCarteira.some((c) => c.name === 'xp_dobro_ate')) db.exec('ALTER TABLE carteira ADD COLUMN xp_dobro_ate INTEGER NOT NULL DEFAULT 0');

    // (antes em recursos/campeoes.ts)
    db.exec(`
      CREATE TABLE IF NOT EXISTS vitimas (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, campeao TEXT NOT NULL, vezes INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id, campeao)
      )
    `);

    // (antes em recursos/goticaSocial.ts)
    db.exec(`
      CREATE TABLE IF NOT EXISTS gotica_visitas (
      guild_id TEXT NOT NULL, visitante TEXT NOT NULL, anfitria TEXT NOT NULL, ultima INTEGER NOT NULL,
      PRIMARY KEY (guild_id, visitante, anfitria)
      )
    `);

    // (antes em recursos/grupos.ts)
    db.exec(`
      CREATE TABLE IF NOT EXISTS grupos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      nome TEXT NOT NULL,
      emoji TEXT NOT NULL,
      descricao TEXT NOT NULL DEFAULT '',
      dono_id TEXT NOT NULL,
      aberto INTEGER NOT NULL DEFAULT 1,
      cargo_id TEXT NOT NULL,
      categoria_id TEXT NOT NULL,
      texto_id TEXT NOT NULL,
      voz_id TEXT NOT NULL,
      criado_em INTEGER NOT NULL
      );
      -- Pedidos que esperam o admin: criar grupo, renomear, canal extra.
      CREATE TABLE IF NOT EXISTS grupo_pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      grupo_id INTEGER,
      autor_id TEXT NOT NULL,
      dados TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      criado_em INTEGER NOT NULL
      );
      -- Pedidos de entrada em grupo fechado (esperam o dono).
      CREATE TABLE IF NOT EXISTS grupo_entradas (
      grupo_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (grupo_id, user_id)
      );
    `);

    // (antes em recursos/lojaTaverna.ts)
    db.exec(`
      CREATE TABLE IF NOT EXISTS taverna_itens (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, item TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id, item)
      )
    `);

    // (antes em recursos/permissoesComandos.ts)
    db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_comandos (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expira_em INTEGER NOT NULL
      )
    `);

    // (antes em recursos/quiz.ts)
    db.exec(`
      CREATE TABLE IF NOT EXISTS quiz_pontos (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, acertos INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
      )
    `);

    // (antes em recursos/registro.ts)
    db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT,
      tipo TEXT NOT NULL,
      acao TEXT NOT NULL,
      canal_id TEXT,
      ok INTEGER NOT NULL DEFAULT 1,
      detalhe TEXT,
      criado_em INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS logs_pessoa ON logs (guild_id, user_id, criado_em);
    `);

    // (antes em recursos/sugestoes.ts)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sugestoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      texto TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'analise',
      canal_id TEXT,
      msg_id TEXT,
      criada_em INTEGER NOT NULL
      )
    `);
  },

  // 2 (22/10/2026): IDs dos canais e cargos do plano, para renomear no Discord não quebrar nada.
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ids_servidor (
        guild_id TEXT NOT NULL,
        tipo TEXT NOT NULL,
        chave TEXT NOT NULL,
        id TEXT NOT NULL,
        PRIMARY KEY (guild_id, tipo, chave)
      )
    `);
  },

  // 3 (22/10/2026): cassino, conquistas, palavra do dia e contadores (duelos vencidos, jackpots...).
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cassino_dia (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, dia TEXT NOT NULL, apostado INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id, dia)
      );
      CREATE TABLE IF NOT EXISTS estatisticas (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, chave TEXT NOT NULL, valor INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id, chave)
      );
      CREATE TABLE IF NOT EXISTS conquistas (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, conquista TEXT NOT NULL, em INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id, conquista)
      );
      CREATE TABLE IF NOT EXISTS palavra_jogos (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, dia TEXT NOT NULL, chutes TEXT NOT NULL DEFAULT '[]', acertou INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id, dia)
      );
    `);
  },

  // 4 (22/10/2026): hall da fama, citações e contadores da semana (resumo de domingo).
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS hall_fama (
        guild_id TEXT NOT NULL, msg_id TEXT NOT NULL, hall_msg_id TEXT NOT NULL,
        PRIMARY KEY (guild_id, msg_id)
      );
      CREATE TABLE IF NOT EXISTS citacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL, autor_id TEXT NOT NULL, texto TEXT NOT NULL, salvo_por TEXT NOT NULL,
        canal_id TEXT NOT NULL, msg_id TEXT NOT NULL UNIQUE, em INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS semana (
        guild_id TEXT NOT NULL, semana TEXT NOT NULL, user_id TEXT NOT NULL, chave TEXT NOT NULL, valor INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, semana, user_id, chave)
      );
      CREATE TABLE IF NOT EXISTS semana_musicas (
        guild_id TEXT NOT NULL, semana TEXT NOT NULL, titulo TEXT NOT NULL, vezes INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, semana, titulo)
      );
      CREATE TABLE IF NOT EXISTS resumos (
        guild_id TEXT NOT NULL, semana TEXT NOT NULL,
        PRIMARY KEY (guild_id, semana)
      );
    `);
  },

  // 5 (22/10/2026): contas da Riot vinculadas (/elo) e jogos grátis já avisados.
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS riot_contas (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, riot_id TEXT NOT NULL, regiao TEXT NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS jogos_gratis (
        guild_id TEXT NOT NULL, id TEXT NOT NULL, em INTEGER NOT NULL,
        PRIMARY KEY (guild_id, id)
      );
    `);
  },

  // 6 (22/10/2026): estado do bot (última versão anunciada no Discord e no WhatsApp).
  () => {
    db.exec('CREATE TABLE IF NOT EXISTS bot_estado (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
  },
];

const { user_version: versao } = db.prepare('PRAGMA user_version').get() as { user_version: number };
for (let v = versao; v < MIGRACOES.length; v++) {
  db.exec('BEGIN');
  try {
    MIGRACOES[v]();
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec('COMMIT');
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}
