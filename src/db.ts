import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

mkdirSync('dados', { recursive: true });

export const db = new DatabaseSync('dados/taverna.db');
// WAL: gravar não trava quem lê e cada gravação fica bem mais leve (o bot grava a cada mensagem e minuto de call).
// NORMAL é seguro no WAL (no máximo perde a última fração de segundo numa queda de energia). busy_timeout espera
// o banco liberar (ex.: um backup rodando) em vez de falhar na hora.
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');

// Muitas consultas são preparadas dentro das funções (a cada mensagem, a cada minuto de call...). Compilar o SQL
// toda vez custa caro, então o db.prepare reaproveita a consulta já compilada para o mesmo texto. O SQL não pode
// levar valores no texto (use ?), senão cada valor viraria uma entrada nova; o limite abaixo é só uma rede de proteção.
const preparadas = new Map<string, ReturnType<DatabaseSync['prepare']>>();
const prepararDeVerdade = db.prepare.bind(db);
db.prepare = (sql: string) => {
  let consulta = preparadas.get(sql);
  if (!consulta) {
    if (preparadas.size >= 500) preparadas.delete(preparadas.keys().next().value!);
    consulta = prepararDeVerdade(sql);
    preparadas.set(sql, consulta);
  }
  return consulta;
};

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

  // 7 (22/10/2026): telas compartilhadas abertas (para avisar quando param).
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS telas (
        msg_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, canal_id TEXT NOT NULL, user_id TEXT NOT NULL,
        call_id TEXT, titulo TEXT NOT NULL DEFAULT '', inicio INTEGER NOT NULL
      )
    `);
  },
  // 8 (22/10/2026): /assaltar (tempo de espera de quem assalta e proteção de quem foi roubado).
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS assaltos (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        ultimo_assalto INTEGER NOT NULL DEFAULT 0, protegido_ate INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      )
    `);
  },
  // 9 (22/10/2026): configurações que a staff muda pelo Discord (ex.: limites de aposta).
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS config_servidor (
        guild_id TEXT NOT NULL, chave TEXT NOT NULL, valor TEXT NOT NULL,
        PRIMARY KEY (guild_id, chave)
      )
    `);
  },
  // 10 (23/10/2026): góticas morrem de fome. As que já estão de barriga zerada contam as 24 h a partir de agora.
  () => {
    db.exec('ALTER TABLE goticas ADD COLUMN fome_desde INTEGER');
    const agora = Date.now();
    db.prepare('UPDATE goticas SET fome_desde = ? WHERE barriga - 4.0 * (? - atualizado_em) / 3600000 <= 0').run(agora, agora);
  },
  // 11: campanhas de RPG (um mestre; os personagens são as fichas dos jogadores no sistema da campanha).
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS campanhas (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id  TEXT NOT NULL,
        nome      TEXT NOT NULL,
        sistema   TEXT NOT NULL,
        mestre_id TEXT NOT NULL,
        criada_em INTEGER NOT NULL,
        UNIQUE (guild_id, nome COLLATE NOCASE)
      );
      CREATE TABLE IF NOT EXISTS campanha_personagens (
        campanha_id INTEGER NOT NULL,
        user_id     TEXT NOT NULL,
        PRIMARY KEY (campanha_id, user_id)
      );
    `);
  },
  // 12: mapa da campanha (imagem em dados/mapas; peças dos jogadores e NPCs do mestre em pixels da imagem)
  // e o chat da mesa, com rolagens públicas, escondidas pelo mestre e reveladas depois.
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mapas (
        campanha_id INTEGER PRIMARY KEY,
        imagem  TEXT,
        largura INTEGER NOT NULL DEFAULT 1500,
        altura  INTEGER NOT NULL DEFAULT 1000,
        grade   INTEGER NOT NULL DEFAULT 50,
        versao  INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS mapa_pecas (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        campanha_id INTEGER NOT NULL,
        user_id     TEXT,
        nome        TEXT NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        UNIQUE (campanha_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS mapa_chat (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        campanha_id INTEGER NOT NULL,
        user_id     TEXT NOT NULL,
        autor       TEXT NOT NULL,
        tipo        TEXT NOT NULL,
        texto       TEXT NOT NULL DEFAULT '',
        resultado   TEXT,
        secreta     INTEGER NOT NULL DEFAULT 0,
        revelada    INTEGER NOT NULL DEFAULT 0,
        criada_em   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS mapa_chat_campanha ON mapa_chat (campanha_id, id);
    `);
  },
  // 13: canal do Discord ligado ao chat do mapa (o que se escreve lá aparece no mapa e vice-versa).
  () => {
    db.exec('ALTER TABLE campanhas ADD COLUMN canal_id TEXT');
  },
  // 14: call da campanha (o canal de texto é o canal_id; os dois nascem no /sessao iniciar).
  () => {
    db.exec('ALTER TABLE campanhas ADD COLUMN canal_voz_id TEXT');
  },
  // 15: início da sessão em andamento (preenchido pelo /sessao iniciar, limpo pelo /sessao finalizar).
  () => {
    db.exec('ALTER TABLE campanhas ADD COLUMN sessao_inicio INTEGER');
  },
  // 16: imagem e tamanho das peças (o mestre põe a cara do NPC e aumenta monstros grandes; tamanho em casas, 1 = uma casa).
  () => {
    db.exec(`
      ALTER TABLE mapa_pecas ADD COLUMN imagem TEXT;
      ALTER TABLE mapa_pecas ADD COLUMN versao_img INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE mapa_pecas ADD COLUMN tamanho REAL NOT NULL DEFAULT 1;
    `);
  },
  // 17: de qual peça (NPC) saiu a linha do chat, para mostrar a foto dele no lugar da do mestre.
  () => {
    db.exec('ALTER TABLE mapa_chat ADD COLUMN peca_id INTEGER');
  },
  // 18: arquivo permanente de resumos e canal de texto temporário criado pelo bot.
  () => {
    db.exec(`
      ALTER TABLE campanhas ADD COLUMN canal_resumos_id TEXT;
      ALTER TABLE campanhas ADD COLUMN canal_sessao_id TEXT;
    `);
  },
  // 19: ficha criada no mapa (foto do personagem, separada da ficha para o /ficha criar não apagá-la),
  // biblioteca de NPCs e inimigos do mestre e, nas peças, de qual personagem da biblioteca vieram e a vida de cada cópia.
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS personagem_fotos (
        guild_id TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        sistema  TEXT NOT NULL,
        imagem   TEXT NOT NULL,
        versao   INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id, sistema)
      );
      CREATE TABLE IF NOT EXISTS campanha_criaturas (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        campanha_id  INTEGER NOT NULL,
        tipo         TEXT NOT NULL,
        nome         TEXT NOT NULL,
        imagem       TEXT,
        versao_img   INTEGER NOT NULL DEFAULT 0,
        tamanho      REAL NOT NULL DEFAULT 1,
        pv_max       INTEGER,
        defesa       INTEGER,
        ataque       INTEGER,
        dano         TEXT NOT NULL DEFAULT '',
        limiar_maior INTEGER,
        limiar_grave INTEGER,
        notas        TEXT NOT NULL DEFAULT '',
        criada_em    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS campanha_criaturas_campanha ON campanha_criaturas (campanha_id);
      ALTER TABLE mapa_pecas ADD COLUMN criatura_id INTEGER;
      ALTER TABLE mapa_pecas ADD COLUMN tipo TEXT;
      ALTER TABLE mapa_pecas ADD COLUMN pv INTEGER;
    `);
  },
  // 20: combate no mapa (iniciativa ou holofote, peça da vez, rodada), condições das peças, o que os jogadores
  // sabem da vida dos inimigos e o bônus de iniciativa dos personagens da biblioteca.
  () => {
    db.exec(`
      ALTER TABLE mapa_pecas ADD COLUMN condicoes TEXT NOT NULL DEFAULT '';
      ALTER TABLE mapa_pecas ADD COLUMN iniciativa REAL;
      ALTER TABLE mapa_pecas ADD COLUMN agiu INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE mapas ADD COLUMN combate INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE mapas ADD COLUMN rodada INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE mapas ADD COLUMN vez INTEGER;
      ALTER TABLE mapas ADD COLUMN vida_inimigos TEXT NOT NULL DEFAULT 'estado';
      ALTER TABLE campanha_criaturas ADD COLUMN iniciativa INTEGER;
    `);
  },
  // 21: exploração. Névoa de guerra (uma casa por bit), peças escondidas dos jogadores e várias cenas por campanha:
  // a tabela mapas guarda a cena aberta; as outras ficam em mapa_cenas, e as peças do mestre pertencem a uma cena.
  () => {
    db.exec(`
      ALTER TABLE mapas ADD COLUMN nevoa_ligada INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE mapas ADD COLUMN nevoa TEXT;
      ALTER TABLE mapas ADD COLUMN cena_id INTEGER;
      ALTER TABLE mapa_pecas ADD COLUMN escondida INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE mapa_pecas ADD COLUMN cena_id INTEGER;
      CREATE TABLE IF NOT EXISTS mapa_cenas (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        campanha_id  INTEGER NOT NULL,
        nome         TEXT NOT NULL,
        imagem       TEXT,
        largura      INTEGER NOT NULL DEFAULT 1500,
        altura       INTEGER NOT NULL DEFAULT 1000,
        grade        INTEGER NOT NULL DEFAULT 50,
        nevoa_ligada INTEGER NOT NULL DEFAULT 0,
        nevoa        TEXT,
        ambiente     TEXT,
        criada_em    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS mapa_cenas_campanha ON mapa_cenas (campanha_id);
    `);
  },
  // 22: handouts (imagem que o mestre mostra na tela de todos: carta, mapa do tesouro, retrato do vilão).
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mapa_handouts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        campanha_id INTEGER NOT NULL,
        titulo      TEXT NOT NULL,
        imagem      TEXT NOT NULL,
        criada_em   INTEGER NOT NULL
      );
      ALTER TABLE mapas ADD COLUMN handout_id INTEGER;
    `);
  },
  // 23: entre sessões. Diário (cada /sessao finalizar vira uma entrada, com o registro e as notas do mestre)
  // e o que o grupo carrega junto: ouro e inventário compartilhados.
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS campanha_sessoes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        campanha_id INTEGER NOT NULL,
        inicio      INTEGER NOT NULL,
        fim         INTEGER NOT NULL,
        mensagens   INTEGER NOT NULL DEFAULT 0,
        rolagens    INTEGER NOT NULL DEFAULT 0,
        arquivo     TEXT,
        notas       TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS campanha_sessoes_campanha ON campanha_sessoes (campanha_id);
      CREATE TABLE IF NOT EXISTS campanha_inventario (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        campanha_id INTEGER NOT NULL,
        item        TEXT NOT NULL,
        qtd         INTEGER NOT NULL DEFAULT 1,
        criada_em   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS campanha_inventario_campanha ON campanha_inventario (campanha_id);
      ALTER TABLE campanhas ADD COLUMN ouro INTEGER NOT NULL DEFAULT 0;
    `);
  },
  // 24: cartas do Daggerheart de cada personagem (por servidor e jogador, como a ficha): onde está cada uma
  // (base = ancestralidade, comunidade e subclasse; Carregamento; Cofre), se já foi usada até o descanso,
  // e as cartas de domínio extras que o mestre libera (avanços, multiclasse).
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS personagem_cartas (
        guild_id  TEXT NOT NULL,
        user_id   TEXT NOT NULL,
        carta     TEXT NOT NULL,
        lugar     TEXT NOT NULL,
        usada     INTEGER NOT NULL DEFAULT 0,
        criada_em INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id, carta)
      );
      CREATE TABLE IF NOT EXISTS personagem_cartas_extras (
        guild_id TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        extras   INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      );
    `);
  },
  // 25: escolhas da criação guiada da ficha do Daggerheart (classe, subclasse, traços sem bônus, armadura...), para reabrir a guia.
  () => {
    db.exec("ALTER TABLE fichas_dh ADD COLUMN guia TEXT NOT NULL DEFAULT ''");
  },
  // 26: sessão marcada pelo /sessao marcar (evento do Discord da campanha e quando começa).
  () => {
    db.exec(`
      ALTER TABLE campanhas ADD COLUMN evento_id TEXT;
      ALTER TABLE campanhas ADD COLUMN evento_inicio INTEGER;
    `);
  },
  // 27: mais ferramentas da mesa. Visão dos personagens na névoa (raio em casas, 0 = desligada), notas secretas
  // da cena, relógios de progresso, histórico de cada personagem e o roteiro da próxima sessão.
  () => {
    db.exec(`
      ALTER TABLE mapas ADD COLUMN visao INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE mapa_cenas ADD COLUMN notas TEXT NOT NULL DEFAULT '';
      CREATE TABLE IF NOT EXISTS campanha_relogios (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        campanha_id INTEGER NOT NULL,
        nome        TEXT NOT NULL,
        total       INTEGER NOT NULL,
        marcados    INTEGER NOT NULL DEFAULT 0,
        secreto     INTEGER NOT NULL DEFAULT 0,
        criado_em   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS campanha_relogios_campanha ON campanha_relogios (campanha_id);
      CREATE TABLE IF NOT EXISTS personagem_historico (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        em       INTEGER NOT NULL,
        texto    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS personagem_historico_quem ON personagem_historico (guild_id, user_id, id);
      CREATE TABLE IF NOT EXISTS campanha_roteiro (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        campanha_id INTEGER NOT NULL,
        ordem       INTEGER NOT NULL,
        titulo      TEXT NOT NULL,
        cena_id     INTEGER,
        ambiente    TEXT,
        musica      TEXT,
        handout_id  INTEGER,
        notas       TEXT NOT NULL DEFAULT '',
        feito       INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS campanha_roteiro_campanha ON campanha_roteiro (campanha_id, ordem);
    `);
  },
  // 28: cortina do mestre (fechada, os jogadores não veem o mapa enquanto ele ajeita a cena).
  () => {
    db.exec('ALTER TABLE mapas ADD COLUMN cortina INTEGER NOT NULL DEFAULT 0');
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
