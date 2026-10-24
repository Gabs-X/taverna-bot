// Compartilhamento de tela por link: a Tela da Taverna, página própria no GitHub Pages (github.com/Gabs-X/taverna-tela).
// Gratuito, sem login, direto entre navegadores. A tela vai sempre com o som; a voz continua no Discord.
// Quando os navegadores não se acham direto (CGNAT, roteador fechado), a tela passa pelo TURN da nuvem
// (scripts/nuvem/turn.sh): o link leva uma senha temporária dele, feita com a senha-mestra do .env.

import { createHmac } from 'node:crypto';

export const SITE_TELA = 'https://gabs-x.github.io/taverna-tela/';

type Sorteio = () => number;
const LETRAS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Código só com letras e números (a página só aceita esses caracteres na sala). */
export const codigo = (tamanho: number, r: Sorteio = Math.random) =>
  Array.from({ length: tamanho }, () => LETRAS[Math.floor(r() * LETRAS.length)]).join('');

export type Sala = { id: string; senha: string; compartilhar: string; assistir: string };
export type Turn = { host: string; segredo: string };

export const VALIDADE_TURN = 12 * 3_600_000;

/** Senha temporária do TURN (padrão "use-auth-secret" do coturn): usuário = vencimento em segundos, senha = HMAC dele. */
export function senhaTurn(segredo: string, agora: number) {
  const usuario = `${Math.floor((agora + VALIDADE_TURN) / 1000)}:taverna`;
  return { usuario, senha: createHmac('sha1', segredo).update(usuario).digest('base64') };
}

export function criarSala(r: Sorteio = Math.random, turn?: Turn, agora = Date.now()): Sala {
  const id = `taverna${codigo(10, r)}`;
  const senha = codigo(16, r);
  let extra = '';
  if (turn) {
    const t = senhaTurn(turn.segredo, agora);
    extra = `&turn=${encodeURIComponent(turn.host)}&tu=${encodeURIComponent(t.usuario)}&tp=${encodeURIComponent(t.senha)}`;
  }
  // Quem assiste manda a senha; quem compartilha confere antes de mandar a tela.
  const compartilhar = `${SITE_TELA}?compartilhar=${id}&chave=${senha}${extra}`;
  const assistir = `${SITE_TELA}?assistir=${id}&chave=${senha}${extra}`;
  return { id, senha, compartilhar, assistir };
}

/** Quanto tempo a tela ficou aberta, para o aviso de encerrada ("menos de 1 min", "25 min", "1h05"). */
export function duracaoTexto(ms: number) {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}
