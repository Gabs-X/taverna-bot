// Trilhas sonoras da mesa de RPG (/ambiente e a música das cenas do mapa). Fica fora do musica.ts para o
// Taverneiro (que não toca música) poder listar as trilhas sem carregar o player.

export const AMBIENTES = {
  taverna: { nome: '🍺 Taverna', busca: 'medieval tavern ambience music 1 hour' },
  combate: { nome: '⚔️ Combate', busca: 'epic battle music dnd combat 1 hour' },
  floresta: { nome: '🌲 Floresta', busca: 'fantasy forest ambience music 1 hour' },
  masmorra: { nome: '🕯️ Masmorra', busca: 'dungeon ambience dark music dnd 1 hour' },
  cidade: { nome: '🏰 Cidade', busca: 'medieval city market ambience 1 hour' },
  chuva: { nome: '🌧️ Chuva e trovões', busca: 'rain thunder fantasy ambience 1 hour' },
  misterio: { nome: '👁️ Mistério', busca: 'dark mystery horror rpg ambience music 1 hour' },
  viagem: { nome: '🗺️ Viagem', busca: 'fantasy exploration travel music rpg 1 hour' },
} as const;
export type Ambiente = keyof typeof AMBIENTES;
export const ehAmbiente = (t: unknown): t is Ambiente => typeof t === 'string' && Object.hasOwn(AMBIENTES, t);

/** Pedido do mapa para os bardos (vai pela ponte SSH até o PC de casa). */
export type ComandoMusica =
  | { acao: 'ambiente'; tipo: Ambiente }
  | { acao: 'tocar'; busca: string }
  | { acao: 'pausar' | 'continuar' | 'pular' | 'parar' }
  | { acao: 'volume'; volume: number };
export type PedidoMusica = ComandoMusica & { guildId: string; canalVozId: string; canalTextoId: string | null };

/** O que os bardos contam ao Taverneiro sobre cada call em que estão tocando. */
export type FilaTocando = { guildId: string; canalId: string; bardo: string; titulo: string | null; pausado: boolean; volume: number; ambiente: string | null };

/** Confere o comando mandado pela página do mapa. */
export function lerComandoMusica(b: Record<string, unknown>): ComandoMusica | string {
  switch (b.acao) {
    case 'ambiente':
      return ehAmbiente(b.tipo) ? { acao: 'ambiente', tipo: b.tipo } : 'Trilha desconhecida.';
    case 'tocar': {
      const busca = String(b.busca ?? '').trim().slice(0, 200);
      return busca ? { acao: 'tocar', busca } : 'Escreva o nome da música ou cole o link.';
    }
    case 'pausar':
    case 'continuar':
    case 'pular':
    case 'parar':
      return { acao: b.acao };
    case 'volume': {
      const v = Number(b.volume);
      return Number.isFinite(v) ? { acao: 'volume', volume: Math.round(Math.min(100, Math.max(0, v))) } : 'Volume inválido.';
    }
    default:
      return 'Comando de música desconhecido.';
  }
}
