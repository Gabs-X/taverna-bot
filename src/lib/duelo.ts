// Duelo de góticas por turnos. Puro (sem Discord) para dar para testar.

type Sorteio = () => number;

export type Lutadora = { id: string; nome: string; nivel: number; hp: number; hpMax: number; defendendo: boolean; triste: boolean };
export type Duelo = { a: Lutadora; b: Lutadora; vez: 'a' | 'b'; turno: number; log: string[] };
export type AcaoDuelo = 'atacar' | 'feitico' | 'defender';

export const ACOES_DUELO: Record<AcaoDuelo, { rotulo: string; emoji: string; dica: string }> = {
  atacar: { rotulo: 'Atacar', emoji: '⚔️', dica: 'dano garantido' },
  feitico: { rotulo: 'Feitiço', emoji: '🔮', dica: 'dano alto, pode errar' },
  defender: { rotulo: 'Defender', emoji: '🛡️', dica: 'metade do próximo dano e cura um pouco' },
};

export const MAX_TURNOS = 40;
export const hpMaximo = (nivel: number) => 80 + 12 * nivel;

export function novaLutadora(id: string, nome: string, nivel: number, triste: boolean): Lutadora {
  const hpMax = hpMaximo(nivel);
  return { id, nome, nivel, hp: hpMax, hpMax, defendendo: false, triste };
}

export const novoDuelo = (a: Lutadora, b: Lutadora, r: Sorteio = Math.random): Duelo => ({ a, b, vez: r() < 0.5 ? 'a' : 'b', turno: 1, log: [] });

const entre = (min: number, max: number, r: Sorteio) => min + Math.floor(r() * (max - min + 1));

const GOLPES = {
  atacar: ['deu uma bolsada com spikes', 'arranhou com as unhas pretas', 'jogou um coturno', 'acertou um tapa de renda'],
  feitico: ['lançou uma maldição de tarô', 'invocou um enxame de morcegos', 'jogou uma praga de batom preto', 'conjurou uma névoa de incenso'],
};

/** Aplica a ação de quem está na vez e passa a vez. */
export function jogar(d: Duelo, acao: AcaoDuelo, r: Sorteio = Math.random): Duelo {
  const atual = { ...d[d.vez] };
  const outraChave = d.vez === 'a' ? 'b' : 'a';
  const outra = { ...d[outraChave] };
  let linha: string;
  atual.defendendo = false;

  if (acao === 'defender') {
    const cura = Math.min(atual.hpMax - atual.hp, 6 + atual.nivel);
    atual.hp += cura;
    atual.defendendo = true;
    linha = `🛡️ **${atual.nome}** se protegeu com o guarda-chuva rendado${cura ? ` e recuperou ${cura} de vida` : ''}.`;
  } else {
    const errou = acao === 'feitico' && r() >= 0.6;
    if (errou) {
      linha = `💨 **${atual.nome}** tentou um feitiço, mas errou feio.`;
    } else {
      let dano = acao === 'atacar' ? 10 + atual.nivel * 2 + entre(0, 8, r) : 16 + atual.nivel * 3 + entre(0, 10, r);
      const critico = r() < 0.1;
      if (critico) dano = Math.round(dano * 1.5);
      if (atual.triste) dano = Math.round(dano * 0.8);
      if (outra.defendendo) dano = Math.round(dano / 2);
      outra.hp = Math.max(0, outra.hp - dano);
      const golpe = GOLPES[acao][Math.floor(r() * GOLPES[acao].length)];
      linha = `${ACOES_DUELO[acao].emoji} **${atual.nome}** ${golpe}: **${dano}** de dano${critico ? ' (CRÍTICO!)' : ''}${outra.defendendo ? ' (defendido)' : ''}.`;
    }
    outra.defendendo = false;
  }

  return { ...d, [d.vez]: atual, [outraChave]: outra, vez: outraChave, turno: d.turno + 1, log: [...d.log, linha].slice(-5) } as Duelo;
}

/** Quem venceu, ou undefined se ainda está rolando. Passou do limite de turnos: vence quem tem mais vida (proporcional). */
export function vencedora(d: Duelo): 'a' | 'b' | undefined {
  if (d.a.hp <= 0) return 'b';
  if (d.b.hp <= 0) return 'a';
  if (d.turno > MAX_TURNOS) return d.a.hp / d.a.hpMax >= d.b.hp / d.b.hpMax ? 'a' : 'b';
  return undefined;
}

export const barraVida = (l: Lutadora) => {
  const cheios = Math.round((l.hp / l.hpMax) * 10);
  return `${'🟥'.repeat(cheios)}${'⬛'.repeat(10 - cheios)} ${l.hp}/${l.hpMax}`;
};

export const VISITAS = [
  'tomaram chá preto num banco do cemitério',
  'trocaram dicas de delineado gatinho',
  'fizeram uma sessão de tarô à luz de velas',
  'ouviram Bauhaus no último volume',
  'viram filme de terror abraçadas no cobertor',
  'fizeram pulseiras de spike juntas',
  'escreveram poemas tristes uma para a outra',
  'garimparam roupas pretas no brechó',
];
