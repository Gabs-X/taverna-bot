// Conquistas: medalhas por marcos de atividade. Puro: recebe os números da pessoa e diz o que ela já merece.

export type Estatisticas = {
  mensagens: number;
  minutos_call: number;
  nivel: number;
  sequencia: number;
  moedas: number;
  duelos_vencidos: number;
  quiz: number;
  apanhou: number;
  jackpots: number;
  palavras: number;
  gotica_nivel: number;
};

export const CONQUISTAS = [
  { id: 'tagarela', nome: 'Tagarela', emoji: '💬', chave: 'mensagens', alvo: 100, descricao: '100 mensagens no servidor' },
  { id: 'nao-cala', nome: 'Não Cala a Boca', emoji: '📢', chave: 'mensagens', alvo: 1000, descricao: '1.000 mensagens no servidor' },
  { id: 'morador', nome: 'Morador da Call', emoji: '🔊', chave: 'minutos_call', alvo: 600, descricao: '10 horas em call com a galera' },
  { id: 'vive-call', nome: 'Vive na Call', emoji: '🏠', chave: 'minutos_call', alvo: 6000, descricao: '100 horas em call' },
  { id: 'veterano', nome: 'Veterano', emoji: '🗡️', chave: 'nivel', alvo: 20, descricao: 'Chegar ao nível 20' },
  { id: 'lenda', nome: 'Lenda Viva', emoji: '👑', chave: 'nivel', alvo: 35, descricao: 'Chegar ao nível 35' },
  { id: 'fiel', nome: 'Fiel à Taverna', emoji: '📅', chave: 'sequencia', alvo: 7, descricao: '7 dias seguidos de /daily' },
  { id: 'mobilia', nome: 'Mobília da Taverna', emoji: '🪑', chave: 'sequencia', alvo: 30, descricao: '30 dias seguidos de /daily' },
  { id: 'rico', nome: 'Rico da Taverna', emoji: '💰', chave: 'moedas', alvo: 10000, descricao: 'Juntar 10.000 moedas' },
  { id: 'primeira-vitoria', nome: 'Primeira Vitória', emoji: '⚔️', chave: 'duelos_vencidos', alvo: 1, descricao: 'Vencer um duelo de góticas' },
  { id: 'duelista', nome: 'Duelista', emoji: '🏆', chave: 'duelos_vencidos', alvo: 10, descricao: 'Vencer 10 duelos de góticas' },
  { id: 'sabe-tudo', nome: 'Sabe-Tudo de LoL', emoji: '🧠', chave: 'quiz', alvo: 10, descricao: 'Acertar 10 perguntas do quiz' },
  { id: 'enciclopedia', nome: 'Enciclopédia de Runeterra', emoji: '📚', chave: 'quiz', alvo: 50, descricao: 'Acertar 50 perguntas do quiz' },
  { id: 'saco-pancada', nome: 'Saco de Pancada', emoji: '🩹', chave: 'apanhou', alvo: 10, descricao: 'Apanhar 10 vezes dos campeões' },
  { id: 'jackpot', nome: 'Jackpot!', emoji: '🎰', chave: 'jackpots', alvo: 1, descricao: 'Três moedas no caça-níquel' },
  { id: 'letrado', nome: 'Letrado', emoji: '🔤', chave: 'palavras', alvo: 1, descricao: 'Acertar a palavra do dia' },
  { id: 'dicionario', nome: 'Dicionário Ambulante', emoji: '📖', chave: 'palavras', alvo: 10, descricao: 'Acertar 10 palavras do dia' },
  { id: 'mae-gotica', nome: 'Cuidador de Gótica', emoji: '🦇', chave: 'gotica_nivel', alvo: 10, descricao: 'Levar a sua gótica ao nível 10' },
] as const satisfies readonly { id: string; nome: string; emoji: string; chave: keyof Estatisticas; alvo: number; descricao: string }[];

export type Conquista = (typeof CONQUISTAS)[number];

/** Conquistas que a pessoa já merece e ainda não tem. */
export const novasConquistas = (e: Estatisticas, jaTem: ReadonlySet<string>) => CONQUISTAS.filter((c) => !jaTem.has(c.id) && e[c.chave] >= c.alvo);

/** Progresso em texto ("37/100") para as que faltam. */
export const progresso = (c: Conquista, e: Estatisticas) => `${Math.min(e[c.chave], c.alvo).toLocaleString('pt-BR')}/${c.alvo.toLocaleString('pt-BR')}`;
