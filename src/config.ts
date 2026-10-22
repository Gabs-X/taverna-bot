// Tudo o que define o servidor fica aqui: mude nomes, jogos e canais e rode /setup de novo.

export const NOME_SERVIDOR = 'Taverna';

// Hierarquia de cima para baixo: Dono > Taverneiro (admin) > Staff. Canais e comandos de staff valem para Staff e acima.
export const CARGOS = {
  dono: { nome: '👑 Dono', cor: 0xf1c40f },
  admin: { nome: '🍺 Taverneiro', cor: 0xe67e22 },
  staff: { nome: '🛡️ Staff', cor: 0x3498db },
  mestre: { nome: '🐉 Mestre', cor: 0x8e44ad },
  aventureiro: { nome: '⚔️ Aventureiro', cor: 0xc0392b }, // mesa de D&D 3.5
  daggerheart: { nome: '🌗 Daggerheart', cor: 0x2e86c1 }, // mesa de Daggerheart
  membro: { nome: '🤪 Maluco', cor: 0x2ecc71 },
  aniversario: { nome: '🎂 Parabéns', cor: 0xff6b9d }, // marcou no formulário de entrada que quer parabéns
} as const;

// Cargos ganhos por nível de atividade (mensagens e tempo em call). Fica só o mais alto.
export const CARGOS_NIVEL = [
  { nivel: 5, nome: '🍻 Bebum', cor: 0xd35400 },
  { nivel: 10, nome: '🎲 Frequentador', cor: 0x16a085 },
  { nivel: 20, nome: '🗡️ Veterano da Taverna', cor: 0x2980b9 },
  { nivel: 35, nome: '👑 Lenda da Taverna', cor: 0xf1c40f },
] as const;

export type Jogo = { id: string; nome: string; emoji: string; cor: number };

export const JOGOS: Jogo[] = [
  { id: 'valorant', nome: 'Valorant', emoji: '🎯', cor: 0xff4655 },
  { id: 'cs2', nome: 'CS2', emoji: '💣', cor: 0xf0a020 },
  { id: 'lol', nome: 'League of Legends', emoji: '🧙', cor: 0x0ac8b9 },
  { id: 'minecraft', nome: 'Minecraft', emoji: '⛏️', cor: 0x62b47a },
  { id: 'fortnite', nome: 'Fortnite', emoji: '🪂', cor: 0x9d4dbb },
  { id: 'indie', nome: 'Indie Aleatório', emoji: '🎲', cor: 0xf5c542 },
  { id: 'cobblemon', nome: 'Cobblemon', emoji: '🐾', cor: 0xe3350d }, // libera a categoria do Farbound
];

export const nomeCargoJogo = (j: Jogo) => `${j.emoji} ${j.nome}`;

export const CANAIS = {
  regras: '📜・regras',
  boasVindas: '👋・boas-vindas',
  escolhaJogos: '🎮・escolha-suas-atividades',
  geral: '💬・geral',
  comandos: '🤖・comandos-do-bot',
  musica: '🎵・pedidos-de-musica',
  goticas: '🦇・goticas',
  levelUp: '⭐・level-up',
  quiz: '🧠・quiz',
  campeoes: '🏹・campeoes',
  economia: '💰・economia',
  logs: '🛡️・logs',
  aprovacoes: '📥・aprovacoes',
  subgrupos: '👥・subgrupos',
  sugestoes: '💡・sugestoes',
  hallFama: '🏆・hall-da-fama',
  jogosGratis: '🆓・jogos-gratis',
  novidades: '🆕・novidades',
  criarCall: '➕ Calls',
  avisosRpg: '📢・avisos-da-mesa',
  mesaRpgTexto: '🗺️・mesa-de-jogo',
  rolagens: '🎲・rolagens',
  fichas: '📖・fichas',
  mesaRpg: '🐉 Mesa de RPG',
  avisosDh: '📢・avisos-dh',
  mesaDhTexto: '🗺️・mesa-dh',
  rolagensDh: '🎲・rolagens-dh',
  fichasDh: '📖・fichas-dh',
  mesaDh: '🌗 Mesa de Daggerheart',
  avisosFarbound: '📢・avisos-farbound',
  farbound: '💬・farbound',
} as const;

// Atividades do bot: cada uma tem um canal que só aparece para quem desbloquear no painel de #escolha-suas-atividades.
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

// `antigos` (canal ou categoria): nomes anteriores; o /setup renomeia em vez de criar outro.
export type CanalPlano = { nome: string; voz?: boolean; topico?: string; acesso?: Acesso; limite?: number; antigos?: string[] };
export type CategoriaPlano = { nome: string; antigos?: string[]; acesso?: Acesso; canais: CanalPlano[] };

const cargoCobblemon = nomeCargoJogo(JOGOS.find((j) => j.id === 'cobblemon')!);
const cobblemon: Acesso = { tipo: 'cargo', cargo: cargoCobblemon };
const rpg: Acesso = { tipo: 'cargo', cargo: CARGOS.aventureiro.nome };
const dh: Acesso = { tipo: 'cargo', cargo: CARGOS.daggerheart.nome };

export const PLANO: CategoriaPlano[] = [
  {
    nome: '📜 ENTRADA',
    canais: [
      { nome: CANAIS.regras, acesso: { tipo: 'leitura' }, topico: 'Leia antes de causar.' },
      { nome: CANAIS.novidades, acesso: { tipo: 'leitura' }, topico: 'Versões novas do Taverneiro e o que mudou em cada uma.' },
      { nome: CANAIS.boasVindas, acesso: { tipo: 'leitura' } },
      { nome: CANAIS.escolhaJogos, antigos: ['🎮・escolha-seus-jogos'], acesso: { tipo: 'leitura' }, topico: 'Escolha seus jogos (chamados do /lfg) e desbloqueie as atividades do bot.' },
    ],
  },
  {
    nome: '💬 RESENHA',
    canais: [
      { nome: CANAIS.geral, topico: 'Papo de maluco liberado.' },
      { nome: '😂・memes' },
      { nome: '🎬・clipes-e-prints', topico: 'Jogadas absurdas, fails e prints.' },
      { nome: CANAIS.comandos, topico: 'Use os comandos do bot aqui para não poluir o geral.' },
      { nome: CANAIS.hallFama, acesso: { tipo: 'leitura' }, topico: 'Mensagens que ganharam 3 ou mais ⭐. Reaja com ⭐ no que merece entrar.' },
      { nome: CANAIS.sugestoes, acesso: { tipo: 'leitura' }, topico: 'Ideias para o bot. Mande a sua com /sugestao e vote com 👍 ou 👎.' },
      { nome: CANAIS.subgrupos, acesso: { tipo: 'leitura' }, topico: 'Grupos da galera: clique para entrar. Peça o seu com /grupo criar.' },
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
      // Um canal só: quem entra ganha uma call própria, que some quando esvazia.
      { nome: CANAIS.criarCall, voz: true, antigos: ['➕ Criar call'] },
      { nome: CANAIS.jogosGratis, acesso: { tipo: 'leitura' }, topico: 'Jogos de graça na Epic, Steam e GOG: o bot avisa sozinho quando aparece um novo.' },
    ],
  },
  {
    // Servidor de Cobblemon (Minecraft) de um amigo: aparece para quem tem o cargo de jogo Cobblemon.
    nome: '🐾 FARBOUND · COBBLEMON',
    acesso: cobblemon,
    canais: [
      { nome: CANAIS.avisosFarbound, acesso: { tipo: 'cargo', cargo: cargoCobblemon, escrita: CARGOS.staff.nome }, topico: 'Novidades, temporadas e eventos do Farbound.' },
      { nome: CANAIS.farbound, acesso: cobblemon, topico: 'Servidor brasileiro de Cobblemon com mods exclusivos, temporadas com pioneiros e nenhum pay-to-win.' },
      { nome: '📸・prints-farbound', acesso: cobblemon, topico: 'Capturas, shinies, bases e times.' },
      { nome: '🐾 Farbound', voz: true, acesso: cobblemon },
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
      { nome: CANAIS.mesaRpgTexto, acesso: rpg, topico: 'Narração e ações dos personagens.' },
      { nome: CANAIS.rolagens, acesso: rpg, topico: '/rolar, /teste e /iniciativa.' },
      { nome: CANAIS.fichas, acesso: rpg, topico: '/ficha criar e /ficha ver.' },
      { nome: '🍺・off-rpg', acesso: rpg },
      { nome: CANAIS.mesaRpg, voz: true, acesso: rpg },
    ],
  },
  {
    nome: '🌗 RPG · Daggerheart',
    acesso: dh,
    canais: [
      { nome: CANAIS.avisosDh, acesso: { tipo: 'cargo', cargo: CARGOS.daggerheart.nome, escrita: CARGOS.mestre.nome } },
      { nome: CANAIS.mesaDhTexto, acesso: dh, topico: 'Narração e ações dos personagens.' },
      { nome: CANAIS.rolagensDh, acesso: dh, topico: '/dh rolar, /dh dano e /dh medo.' },
      { nome: CANAIS.fichasDh, acesso: dh, topico: '/dh ficha criar e /dh ficha ver.' },
      { nome: CANAIS.mesaDh, voz: true, acesso: dh },
    ],
  },
  {
    nome: '🛡️ STAFF',
    acesso: { tipo: 'staff' },
    canais: [
      { nome: CANAIS.logs, acesso: { tipo: 'staff' } },
      { nome: CANAIS.aprovacoes, acesso: { tipo: 'staff' }, topico: 'Pedidos de subgrupos e de canais novos para aprovar.' },
    ],
  },
];

// Canais que saíram do plano: o /setup apaga se encontrar (com as mensagens deles).
// Canais criados à mão nunca entram aqui; esses o /setup só lista.
export const CANAIS_REMOVIDOS: { nome: string; voz?: boolean }[] = [
  { nome: '🎯・valorant' },
  { nome: '💣・cs2' },
  { nome: '🧙・league-of-legends' },
  { nome: '⛏️・minecraft' },
  { nome: '🪂・fortnite' },
  { nome: '🎲・indie-aleatorio' },
  { nome: '🔍・procurando-grupo' },
  { nome: '🎲 Indie Aleatório', voz: true },
];

export const REGRAS = [
  'Respeito acima de tudo: zoeira sim, ofensa pessoal não.',
  'Nada de conteúdo ilegal, NSFW fora de lugar ou spam.',
  'Cada assunto no seu canal: comandos em #comandos-do-bot, atividades nos canais delas.',
  `Precisa de uma call? Entre em "${CANAIS.criarCall}" e ela é sua até esvaziar.`,
  'Na mesa de RPG, o Mestre tem a palavra final.',
  'Divirta-se. Somos todos malucos aqui.',
];
