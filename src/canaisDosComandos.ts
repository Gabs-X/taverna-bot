// Em que canal de texto cada comando funciona. Usado em outro canal, o bot avisa onde usar.
// Comando fora da tabela funciona em qualquer canal (admin: /setup, /limpar, /castigo, /logs; e /call, da sua call).
// Para mudar, edite aqui; os nomes dos canais ficam em config.ts.
import { CANAIS } from './config.ts';
import { CAMPEOES } from './recursos/campeoes.ts';

const TABELA: [string[], string[]][] = [
  // Música: o bot toca em qualquer call, mas os pedidos são só no chat de música.
  [['tocar', 'radio', 'musica', 'jam'], [CANAIS.musica]],

  // D&D 3.5
  [['rolar'], [CANAIS.rolagens, CANAIS.mesaRpgTexto, CANAIS.rolagensDh, CANAIS.mesaDhTexto]],
  [['ficha'], [CANAIS.fichas, CANAIS.rolagens]],
  [['teste', 'iniciativa'], [CANAIS.rolagens, CANAIS.mesaRpgTexto]],
  // Daggerheart
  [['dh'], [CANAIS.rolagensDh, CANAIS.fichasDh, CANAIS.mesaDhTexto]],
  // Sessões: o Mestre marca nos avisos de cada mesa.
  [['sessao'], [CANAIS.avisosRpg, CANAIS.avisosDh]],
  // Ferramentas do Mestre: em qualquer canal das duas mesas.
  [['gerar', 'ambiente'], [CANAIS.mesaRpgTexto, CANAIS.rolagens, CANAIS.fichas, CANAIS.mesaDhTexto, CANAIS.rolagensDh, CANAIS.fichasDh]],

  // Atividades
  [['gotica', 'loja gotica'], [CANAIS.goticas]],
  [['loja taverna'], [CANAIS.economia]],
  [['quiz', 'palavra', 'quemdisse'], [CANAIS.quiz]],
  [['cassino', 'desafiar', 'assaltar'], [CANAIS.economia]],
  [['conquistas'], [CANAIS.economia, CANAIS.comandos]],
  [[...CAMPEOES.map((c) => c.comando), 'vitimas'], [CANAIS.campeoes]],
  [['elo'], [CANAIS.campeoes, CANAIS.comandos]],
  [['daily', 'trabalhar', 'carteira', 'pix', 'rank', 'top'], [CANAIS.economia]],

  // O resto fica no chat de comandos (/grupo também vale dentro dos canais do próprio grupo).
  [
    ['grupo', 'sugestao', 'citacao', 'gratis', 'versao', 'lfg', 'times', 'sortear', 'enquete', 'lembrete', 'aniversario', 'moeda', '8ball', 'cafe', 'avatar', 'servidor', 'status', 'ajuda'],
    [CANAIS.comandos],
  ],
];

const porComando = new Map(TABELA.flatMap(([comandos, canais]) => comandos.map((c) => [c, canais] as const)));

/** Canais do comando; para comandos com grupos (ex.: /loja taverna), o grupo pode ter canal próprio. */
export const canaisDoComando = (nome: string, grupo?: string | null): readonly string[] | undefined =>
  (grupo ? porComando.get(`${nome} ${grupo}`) : undefined) ?? porComando.get(nome);
