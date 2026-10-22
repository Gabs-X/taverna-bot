// Gerador para o Mestre: NPCs, tavernas, tesouros e nomes (fantasia medieval, compatível com D&D 3.5 e Daggerheart).
// Puro: recebe o sorteio para dar para testar. Para aumentar as listas, é só acrescentar itens.

type Sorteio = () => number;
const um = <T>(lista: readonly T[], r: Sorteio) => lista[Math.floor(r() * lista.length)];
const entre = (min: number, max: number, r: Sorteio) => min + Math.floor(r() * (max - min + 1));

export const RACAS = ['Humano', 'Anão', 'Elfo', 'Halfling', 'Gnomo', 'Meio-orc', 'Meio-elfo', 'Tiefling', 'Draconato'] as const;

const SILABAS: Record<string, { inicio: string[]; meio: string[]; fim: string[] }> = {
  Humano: { inicio: ['Al', 'Bran', 'Cel', 'Dor', 'Ed', 'Gar', 'Hel', 'Mar', 'Ro', 'Ser', 'Tom', 'Val'], meio: ['a', 'e', 'i', 'o', 'an', 'el'], fim: ['ric', 'mund', 'wen', 'dor', 'na', 'ia', 'ton', 'ard'] },
  Anão: { inicio: ['Bal', 'Dur', 'Grim', 'Kaz', 'Thor', 'Brom', 'Dag', 'Hild'], meio: ['in', 'ar', 'um', 'or'], fim: ['dun', 'grim', 'rak', 'in', 'da', 'bek', 'gar'] },
  Elfo: { inicio: ['Ael', 'Cael', 'Eli', 'Fae', 'Gal', 'Ith', 'Lae', 'Syl', 'Thal'], meio: ['a', 'ri', 'le', 'na', 'th'], fim: ['wyn', 'rion', 'thil', 'iel', 'anor', 'ra', 'lis'] },
  Halfling: { inicio: ['Bil', 'Cor', 'Fin', 'Mer', 'Pip', 'Ros', 'Tob', 'Wil'], meio: ['o', 'i', 'a', 'ly'], fim: ['bo', 'do', 'kin', 'ie', 'wick', 'ny'] },
  Gnomo: { inicio: ['Bim', 'Fiz', 'Glim', 'Nim', 'Tink', 'Zook', 'Pock'], meio: ['ble', 'i', 'a', 'ter'], fim: ['wick', 'nok', 'zle', 'fen', 'kin'] },
  'Meio-orc': { inicio: ['Gru', 'Kra', 'Mog', 'Thar', 'Ur', 'Zog', 'Dur'], meio: ['g', 'a', 'u', 'r'], fim: ['ak', 'mash', 'gul', 'tha', 'rok', 'ka'] },
};

/** Nome que combina com a raça (as que não têm sílabas próprias usam as humanas ou élficas). */
export function gerarNome(raca: string, r: Sorteio = Math.random) {
  const base = SILABAS[raca] ?? (raca === 'Meio-elfo' ? SILABAS.Elfo : SILABAS.Humano);
  const nome = um(base.inicio, r) + (r() < 0.5 ? um(base.meio, r) : '') + um(base.fim, r);
  return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
}

const PROFISSOES = ['ferreiro', 'taverneiro', 'guarda da cidade', 'mercador de especiarias', 'sacerdote', 'ladrão aposentado', 'bardo itinerante', 'caçador', 'alquimista', 'escriba', 'pescador', 'mercenário', 'cartógrafo', 'coveiro', 'nobre falido', 'feiticeira de aldeia'];
const JEITOS = ['desconfiado', 'falante demais', 'gentil e ingênuo', 'ganancioso', 'mal-humorado', 'supersticioso', 'nervoso', 'orgulhoso', 'brincalhão', 'misterioso', 'leal até o fim', 'covarde'];
const APARENCIAS = ['uma cicatriz atravessando o rosto', 'roupas finas mas remendadas', 'um tapa-olho de couro', 'tatuagens rúnicas nos braços', 'uma risada alta demais', 'cheiro forte de ervas', 'dentes de ouro', 'um corvo no ombro', 'mãos sempre sujas de tinta', 'um sotaque estrangeiro carregado'];
const SEGREDOS = ['deve dinheiro para a guilda dos ladrões', 'é espião de um reino vizinho', 'viu o assassinato que todos querem esquecer', 'guarda um mapa que não sabe ler', 'é procurado em outra cidade com outro nome', 'tem um irmão gêmeo que ninguém conhece', 'jurou vingança contra um nobre local', 'sabe a entrada secreta das catacumbas', 'vende relíquias falsas', 'foi amaldiçoado e ninguém sabe'];

export function gerarNpc(r: Sorteio = Math.random) {
  const raca = um(RACAS, r);
  return { nome: gerarNome(raca, r), raca, profissao: um(PROFISSOES, r), jeito: um(JEITOS, r), aparencia: um(APARENCIAS, r), segredo: um(SEGREDOS, r) };
}

const ADJETIVOS = ['Bêbado', 'Dourado', 'Sorridente', 'Caolho', 'Furioso', 'Dorminhoco', 'Prateado', 'Maldito', 'Saltitante', 'Barbudo', 'Perdido', 'Afogado'];
const BICHOS = [['O', 'Javali'], ['O', 'Dragão'], ['A', 'Caneca'], ['O', 'Grifo'], ['A', 'Raposa'], ['O', 'Corvo'], ['O', 'Gigante'], ['A', 'Sereia'], ['O', 'Anão'], ['O', 'Pônei'], ['A', 'Coruja']] as const;
const PRATOS = ['ensopado de coelho com cerveja preta', 'torta de carne misteriosa', 'peixe defumado com pão de centeio', 'javali assado no espeto', 'sopa de cebola que levanta defunto', 'queijo de cabra com mel da casa'];
const BEBIDAS = ['hidromel de mel silvestre', 'cerveja anã que derruba elfo', 'vinho élfico aguado', 'grogue do pirata (não pergunte)', 'cidra de maçã azeda', 'chá de ervas "medicinal"'];
const RUMORES = ['um caixão chegou ontem à noite e ninguém sabe de quem é', 'as minas do norte voltaram a soltar fumaça', 'o prefeito anda saindo à meia-noite para o cemitério', 'pagam bem para quem escoltar uma carroça até a capital', 'viram lobos andando em duas patas perto da floresta', 'um mago procura aventureiros para entrar numa torre "inofensiva"', 'o poço da praça está sussurrando nomes'];

export function gerarTaverna(r: Sorteio = Math.random) {
  const [artigo, bicho] = um(BICHOS, r);
  const adj = um(ADJETIVOS, r);
  const adjetivo = artigo === 'A' ? adj.replace(/o$/, 'a').replace(/ão$/, 'ona') : adj;
  return {
    nome: `${artigo} ${bicho} ${adjetivo}`,
    dono: gerarNpc(r),
    prato: um(PRATOS, r),
    bebida: um(BEBIDAS, r),
    preco: `${entre(2, 9, r)} pc a caneca · ${entre(3, 15, r)} pp o quarto`,
    rumor: um(RUMORES, r),
  };
}

const GEMAS = ['ágata', 'quartzo', 'jaspe', 'pérola', 'âmbar', 'granada', 'ametista', 'topázio', 'esmeralda', 'safira', 'rubi', 'diamante'];
const OBJETOS = ['cálice de prata com runas', 'colar de ouro com camafeu', 'adaga cerimonial cravejada', 'estatueta de marfim de um dragão', 'coroa de cobre amassada', 'tapeçaria élfica', 'anel de sinete de uma casa extinta', 'espelho de mão com moldura de ébano'];
const MAGICOS_MENORES = ['Poção de Curar Ferimentos Leves', 'Pergaminho de Mísseis Mágicos', 'Poção de Invisibilidade', 'Óleo de Arma Mágica', 'Varinha de Luz (12 cargas)', 'Anel de Proteção +1', 'Capa de Resistência +1', 'Espada Longa +1', 'Armadura de Couro Batido +1', 'Bolsa Devoradora (mentira: é só uma bolsa)'];
const MAGICOS_MEDIOS = ['Poção de Curar Ferimentos Moderados', 'Varinha de Bola de Fogo (8 cargas)', 'Botas Élficas', 'Manto Élfico', 'Mochila Útil de Heward', 'Anel de Proteção +2', 'Espada Longa Flamejante +1', 'Amuleto de Armadura Natural +1', 'Bolsa Devoradora'];

/** Tesouro aproximado por nível do grupo (1 a 20): moedas, gemas, objetos de arte e itens mágicos. */
export function gerarLoot(nivel: number, r: Sorteio = Math.random) {
  const n = Math.max(1, Math.min(20, nivel));
  const po = entre(10, 60, r) * n * (n > 10 ? 3 : 1);
  const gemas = Array.from({ length: entre(0, Math.ceil(n / 4), r) }, () => {
    const k = Math.min(GEMAS.length - 1, entre(0, Math.floor(n / 2), r));
    return `${GEMAS[k]} (${(k + 1) * 10 * entre(1, 5, r)} po)`;
  });
  const objetos = r() < 0.3 + n * 0.02 ? [`${um(OBJETOS, r)} (${entre(5, 30, r) * n} po)`] : [];
  const magicos = [
    ...(r() < 0.5 ? [um(MAGICOS_MENORES, r)] : []),
    ...(n >= 6 && r() < 0.3 + n * 0.02 ? [um(MAGICOS_MEDIOS, r)] : []),
  ];
  return { nivel: n, moedas: `${po} po · ${entre(0, 9, r) * 10} pp · ${entre(0, 99, r)} pc`, gemas, objetos, magicos };
}
