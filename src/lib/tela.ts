// Compartilhamento de tela por link: a Tela da Taverna, página própria no GitHub Pages (github.com/Gabs-X/taverna-tela).
// Gratuito, sem login, direto entre navegadores. A tela vai sempre com o som; a voz continua no Discord.

export const SITE_TELA = 'https://gabs-x.github.io/taverna-tela/';

type Sorteio = () => number;
const LETRAS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Código só com letras e números (a página só aceita esses caracteres na sala). */
export const codigo = (tamanho: number, r: Sorteio = Math.random) =>
  Array.from({ length: tamanho }, () => LETRAS[Math.floor(r() * LETRAS.length)]).join('');

export type Sala = { id: string; senha: string; compartilhar: string; assistir: string };

export function criarSala(r: Sorteio = Math.random): Sala {
  const id = `taverna${codigo(10, r)}`;
  const senha = codigo(16, r);
  // Quem assiste manda a senha; quem compartilha confere antes de mandar a tela.
  const compartilhar = `${SITE_TELA}?compartilhar=${id}&chave=${senha}`;
  const assistir = `${SITE_TELA}?assistir=${id}&chave=${senha}`;
  return { id, senha, compartilhar, assistir };
}

/** Quanto tempo a tela ficou aberta, para o aviso de encerrada ("menos de 1 min", "25 min", "1h05"). */
export function duracaoTexto(ms: number) {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}
