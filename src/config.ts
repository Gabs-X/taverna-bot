// Tudo o que define o servidor fica aqui: mude nomes, jogos e canais e rode /setup de novo.

export const NOME_SERVIDOR = 'Taverna dos Malucos';

export const CARGOS = {
  admin: { nome: '🍺 Taverneiro', cor: 0xe67e22 },
  mestre: { nome: '🐉 Mestre', cor: 0x8e44ad },
  aventureiro: { nome: '⚔️ Aventureiro', cor: 0xc0392b }, // mesa de D&D 3.5
  daggerheart: { nome: '🌗 Daggerheart', cor: 0x2e86c1 }, // mesa de Daggerheart
  membro: { nome: '🤪 Maluco', cor: 0x2ecc71 },
} as const;

// Cargos ganhos por nível de atividade (mensagens e tempo em call). Fica só o mais alto.
export const CARGOS_NIVEL = [
  { nivel: 5, nome: '🍻 Bebum', cor: 0xd35400 },
  { nivel: 10, nome: '🎲 Frequentador', cor: 0x16a085 },
  { nivel: 20, nome: '🗡️ Veterano da Taverna', cor: 0x2980b9 },
  { nivel: 35, nome: '👑 Lenda da Taverna', cor: 0xf1c40f },
] as const;

export type Jogo = { id: string; nome: string; emoji: string; cor: number; canal: string };

export const JOGOS: Jogo[] = [
  { id: 'valorant', nome: 'Valorant', emoji: '🎯', cor: 0xff4655, canal: 'valorant' },
  { id: 'cs2', nome: 'CS2', emoji: '💣', cor: 0xf0a020, canal: 'cs2' },
  { id: 'lol', nome: 'League of Legends', emoji: '🧙', cor: 0x0ac8b9, canal: 'league-of-legends' },
  { id: 'minecraft', nome: 'Minecraft', emoji: '⛏️', cor: 0x62b47a, canal: 'minecraft' },
  { id: 'fortnite', nome: 'Fortnite', emoji: '🪂', cor: 0x9d4dbb, canal: 'fortnite' },
  { id: 'indie', nome: 'Indie Aleatório', emoji: '🎲', cor: 0xf5c542, canal: 'indie-aleatorio' },
];

export const nomeCargoJogo = (j: Jogo) => `${j.emoji} ${j.nome}`;
export const nomeCanalJogo = (j: Jogo) => `${j.emoji}・${j.canal}`;

export const CANAIS = {
  regras: '📜・regras',
  boasVindas: '👋・boas-vindas',
  escolhaJogos: '🎮・escolha-seus-jogos',
  geral: '💬・geral',
  comandos: '🤖・comandos-do-bot',
  musica: '🎵・pedidos-de-musica',
  goticas: '🦇・goticas',
  levelUp: '⭐・level-up',
  quiz: '🧠・quiz',
  campeoes: '🏹・campeoes',
  economia: '💰・economia',
  logs: '🛡️・logs',
  criarCall: '➕ Criar call',
  avisosRpg: '📢・avisos-da-mesa',
  mesaRpg: '🐉 Mesa de RPG',
  avisosDh: '📢・avisos-dh',
  mesaDh: '🌗 Mesa de Daggerheart',
} as const;

// Atividades do bot: cada uma tem um canal que só aparece para quem desbloquear no painel de #escolha-seus-jogos.
export type Atividade = { id: string; nome: string; emoji: string; cor: number; canal: string; topico: string; somenteLeitura?: boolean };

export const ATIVIDADES: Atividade[] = [
  { id: 'goticas', nome: 'Góticas', emoji: '🦇', cor: 0x9b59b6, canal: CANAIS.goticas, topico: 'Adote, cuide e exiba sua gótica: /gotica, /loja.' },
  { id: 'quiz', nome: 'Quiz', emoji: '🧠', cor: 0xf5b544, canal: CANAIS.quiz, topico: 'Adivinhe o campeão: /quiz iniciar, /quiz ranking.' },
  { id: 'campeoes', nome: 'Campeões', emoji: '🏹', cor: 0x5bc0eb, canal: CANAIS.campeoes, topico: 'Chame /asheap, /darius, /teemo, /yasuo, /blitz, /garen, /jinx, /thresh. Placar: /vitimas.' },
  { id: 'economia', nome: 'Economia', emoji: '💰', cor: 0xf1c40f, canal: CANAIS.economia, topico: '/daily, /trabalhar, /carteira, /pix, /rank e /top.' },
  { id: 'levelup', nome: 'Level up', emoji: '⭐', cor: 0xf39c12, canal: CANAIS.levelUp, topico: 'Quem subiu de nível conversando e em call.', somenteLeitura: true },
];

export const nomeCargoAtividade = (a: Atividade) => `${a.emoji} ${a.nome}`;

// Quem pode ver/escrever em cada canal.
// publico: todos veem e escrevem · leitura: todos veem, só admin escreve
// cargo: só quem tem o cargo vê · staff: só admin vê
export type Acesso =
  | { tipo: 'publico' }
  | { tipo: 'leitura' }
  | { tipo: 'cargo'; cargo: string; escrita?: string }
  | { tipo: 'staff' };

export type CanalPlano = { nome: string; voz?: boolean; topico?: string; acesso?: Acesso; limite?: number };
// `antigos`: nomes anteriores da categoria; o /setup renomeia em vez de criar outra.
export type CategoriaPlano = { nome: string; antigos?: string[]; acesso?: Acesso; canais: CanalPlano[] };

const rpg: Acesso = { tipo: 'cargo', cargo: CARGOS.aventureiro.nome };
const dh: Acesso = { tipo: 'cargo', cargo: CARGOS.daggerheart.nome };

export const PLANO: CategoriaPlano[] = [
  {
    nome: '📜 ENTRADA',
    canais: [
      { nome: CANAIS.regras, acesso: { tipo: 'leitura' }, topico: 'Leia antes de causar.' },
      { nome: CANAIS.boasVindas, acesso: { tipo: 'leitura' } },
      { nome: CANAIS.escolhaJogos, acesso: { tipo: 'leitura' }, topico: 'Clique nos botões para ver os canais dos seus jogos.' },
    ],
  },
  {
    nome: '💬 RESENHA',
    canais: [
      { nome: CANAIS.geral, topico: 'Papo de maluco liberado.' },
      { nome: '😂・memes' },
      { nome: '🎬・clipes-e-prints', topico: 'Jogadas absurdas, fails e prints.' },
      { nome: CANAIS.comandos, topico: 'Use os comandos do bot aqui para não poluir o geral.' },
      { nome: '🍻 Resenha', voz: true },
      { nome: '💤 AFK', voz: true },
    ],
  },
  {
    nome: '🎵 MÚSICA',
    canais: [
      { nome: CANAIS.musica, topico: 'Use /tocar <música ou link>.' },
      { nome: '🎵 Rádio da Taverna', voz: true },
    ],
  },
  {
    nome: '🎮 JOGATINA',
    canais: [
      { nome: CANAIS.criarCall, voz: true },
      { nome: '🎲 Indie Aleatório', voz: true },
      ...JOGOS.map((j): CanalPlano => ({
        nome: nomeCanalJogo(j),
        acesso: { tipo: 'cargo', cargo: nomeCargoJogo(j) },
        topico: `Tudo sobre ${j.nome}. Chame a galera com /lfg.`,
      })),
      { nome: '🔍・procurando-grupo', topico: 'Use /lfg para chamar gente para jogar.' },
    ],
  },
  {
    nome: '🎉 ATIVIDADES',
    canais: ATIVIDADES.map((a): CanalPlano => ({
      nome: a.canal,
      topico: a.topico,
      // Somente leitura: quem tem o cargo vê, só o bot (admin) escreve.
      acesso: { tipo: 'cargo', cargo: nomeCargoAtividade(a), escrita: a.somenteLeitura ? CARGOS.admin.nome : undefined },
    })),
  },
  {
    nome: '🐉 RPG · D&D 3.5',
    antigos: ['🐉 RPG · D&D 5e'],
    acesso: rpg,
    canais: [
      { nome: CANAIS.avisosRpg, acesso: { tipo: 'cargo', cargo: CARGOS.aventureiro.nome, escrita: CARGOS.mestre.nome } },
      { nome: '🗺️・mesa-de-jogo', acesso: rpg, topico: 'Narração e ações dos personagens.' },
      { nome: '🎲・rolagens', acesso: rpg, topico: '/rolar, /teste e /iniciativa.' },
      { nome: '📖・fichas', acesso: rpg, topico: '/ficha criar e /ficha ver.' },
      { nome: '🍺・off-rpg', acesso: rpg },
      { nome: CANAIS.mesaRpg, voz: true, acesso: rpg },
    ],
  },
  {
    nome: '🌗 RPG · Daggerheart',
    acesso: dh,
    canais: [
      { nome: CANAIS.avisosDh, acesso: { tipo: 'cargo', cargo: CARGOS.daggerheart.nome, escrita: CARGOS.mestre.nome } },
      { nome: '🗺️・mesa-dh', acesso: dh, topico: 'Narração e ações dos personagens.' },
      { nome: '🎲・rolagens-dh', acesso: dh, topico: '/dh rolar, /dh dano e /dh medo.' },
      { nome: '📖・fichas-dh', acesso: dh, topico: '/dh ficha criar e /dh ficha ver.' },
      { nome: CANAIS.mesaDh, voz: true, acesso: dh },
    ],
  },
  {
    nome: '🛡️ STAFF',
    acesso: { tipo: 'staff' },
    canais: [{ nome: CANAIS.logs, acesso: { tipo: 'staff' } }],
  },
];

export const REGRAS = [
  'Respeito acima de tudo: zoeira sim, ofensa pessoal não.',
  'Nada de conteúdo ilegal, NSFW fora de lugar ou spam.',
  'Cada assunto no seu canal: jogos nos canais dos jogos, comandos em #comandos-do-bot.',
  'Precisa de uma call? Entre em "➕ Criar call" e ela é sua até esvaziar.',
  'Na mesa de RPG, o Mestre tem a palavra final.',
  'Divirta-se. Somos todos malucos aqui.',
];
