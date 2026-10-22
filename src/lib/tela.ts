// Compartilhamento de tela por link (VDO.Ninja: gratuito, sem login, direto entre navegadores).
// A voz continua no Discord: quem compartilha não manda microfone; o som da tela só vai se pedir.

type Sorteio = () => number;
const LETRAS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Código só com letras e números (o VDO.Ninja não aceita outros caracteres na senha). */
export const codigo = (tamanho: number, r: Sorteio = Math.random) =>
  Array.from({ length: tamanho }, () => LETRAS[Math.floor(r() * LETRAS.length)]).join('');

export type Sala = { id: string; senha: string; compartilhar: string; assistir: string };

export function criarSala({ audio = false, titulo = '' }: { audio?: boolean; titulo?: string } = {}, r: Sorteio = Math.random): Sala {
  const id = `taverna${codigo(10, r)}`;
  const senha = codigo(16, r);
  const rotulo = titulo ? `&label=${encodeURIComponent(titulo.slice(0, 40))}` : '';
  // Quem compartilha: vai direto para escolher a tela, sem microfone (a voz é no Discord).
  const compartilhar = `https://vdo.ninja/?push=${id}&screenshare&audiodevice=0&password=${senha}${rotulo}`;
  // Quem assiste: só a tela; sem som, a não ser que o som da tela tenha sido pedido.
  const assistir = `https://vdo.ninja/?view=${id}&password=${senha}${audio ? '' : '&noaudio'}`;
  return { id, senha, compartilhar, assistir };
}

/** Quanto tempo a tela ficou aberta, para o aviso de encerrada ("menos de 1 min", "25 min", "1h05"). */
export function duracaoTexto(ms: number) {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}
