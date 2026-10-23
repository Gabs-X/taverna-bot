// Builds de Deep Rock Galactic (/drg build). Opções por arma, tiradas de guias da comunidade (Season 5/6):
// - "Ultimate Overclock Guide (Season 06)": steamcommunity.com/sharedfiles/filedetails/?id=2801428551
// - "DRG Weapon Guide (Up-to-Date)": steamcommunity.com/sharedfiles/filedetails/?id=2857301067
// Mods: uma letra por nível (1 a 5), contando da esquerda no jogo (A = primeira opção da linha). "A/B" = tanto faz.
// mods null = o guia recomenda o overclock mas não fecha os mods.

export type Classe = 'Driller' | 'Engineer' | 'Gunner' | 'Scout';
export type Build = { overclock: string; mods: string[] | null; quando: string };
export type Arma = { nome: string; apelidos: string[]; classe: Classe; tipo: 'primária' | 'secundária'; builds: Build[] };

const m = (...niveis: string[]) => niveis;

export const ARMAS: Arma[] = [
  // ---------- Driller ----------
  {
    nome: 'CRSPR Flamethrower', apelidos: ['lança-chamas', 'flamethrower', 'crspr'], classe: 'Driller', tipo: 'primária',
    builds: [
      { overclock: 'Compact Feed Valves', mods: m('B', 'A', 'C', 'A/C', 'B'), quando: 'Sustentável: bem mais munição para manter a chama ligada a missão toda.' },
      { overclock: 'Scorching Tide', mods: m('A', 'A/B', 'C', 'A/C', 'A'), quando: 'Dano em rajada. Gasta muito: vale com mods e perks de munição.' },
      { overclock: 'Sticky Fuel', mods: null, quando: 'Controle de enxame: chão em chamas que segura os insetos. Combina com a Wave Cooker (Mega Power Supply).' },
    ],
  },
  {
    nome: 'Cryo Cannon', apelidos: ['cryo', 'gelo'], classe: 'Driller', tipo: 'primária',
    builds: [
      { overclock: 'Improved Thermal Efficiency', mods: m('C', 'A', 'B', 'B', 'B'), quando: 'Opção limpa: mais munição e a pressão dura mais.' },
      { overclock: 'Improved Thermal Efficiency (variação)', mods: m('A/B', 'A', 'B', 'A', 'A'), quando: 'Mesma ideia, focada em congelar mais rápido.' },
      { overclock: 'Ice Spear', mods: null, quando: 'Alvo único: lança de gelo com muito dano em quem está congelado. Combina com a Wave Cooker.' },
    ],
  },
  {
    nome: 'Corrosive Sludge Pump', apelidos: ['sludge', 'gosma', 'corrosive'], classe: 'Driller', tipo: 'primária',
    builds: [
      { overclock: 'Volatile Impact Mixture', mods: m('A/B', 'C', 'B', 'A/B', 'B'), quando: 'Dano direto forte em alvo único, sem preparo. Com a Subata cobre os alvos longe. Uma das melhores do Driller.' },
      { overclock: 'Disperser Compound', mods: m('C', 'B', 'A/B', 'A', 'A/B'), quando: 'Controle de enxame: espalha poças de gosma por toda parte.' },
    ],
  },
  {
    nome: 'Subata 120', apelidos: ['subata', 'pistola'], classe: 'Driller', tipo: 'secundária',
    builds: [{ overclock: 'Explosive Reload', mods: m('B', 'A', 'C', 'C', 'B/C'), quando: 'Rajada contra alvos grandes: as balas explodem na recarga (cancele a recarga para acelerar).' }],
  },
  {
    nome: 'Experimental Plasma Charger', apelidos: ['epc', 'plasma charger', 'plasma'], classe: 'Driller', tipo: 'secundária',
    builds: [
      { overclock: 'Energy Rerouting', mods: m('B', 'B', 'A', 'B', 'B'), quando: 'Mais munição e carga mais rápida.' },
      { overclock: 'Heavy Hitter', mods: m('A/B', 'B', 'C', 'B', 'A'), quando: 'Dano: tiro carregado bem mais forte.' },
      { overclock: 'Persistent Plasma', mods: m('B', 'B', 'A', 'B', 'B'), quando: 'Área: o plasma fica no chão. No nível 4, não combina com Expanded Plasma Splash.' },
    ],
  },
  {
    nome: 'Colette Wave Cooker', apelidos: ['wave cooker', 'micro-ondas', 'colette'], classe: 'Driller', tipo: 'secundária',
    builds: [
      { overclock: 'Mega Power Supply', mods: m('B/C', 'B', 'B', 'A', 'C'), quando: 'Mais cadência e munição. Faz choque térmico em quem está pegando fogo ou congelado.' },
      { overclock: 'Mega Power Supply (variação)', mods: m('A', 'A/B', 'A', 'B', 'B'), quando: 'Mesma ideia, com mais alcance.' },
    ],
  },
  // ---------- Engineer ----------
  {
    nome: '"Warthog" Auto 210', apelidos: ['warthog', 'escopeta', 'shotgun'], classe: 'Engineer', tipo: 'primária',
    builds: [
      { overclock: 'Pump Action', mods: m('A/B', 'A', 'B/C', 'A/B', 'A/B'), quando: 'Muito dano por tiro, cadência menor.' },
      { overclock: 'Magnetic Pellet Alignment', mods: m('A', 'B', 'B/C', 'B', 'A'), quando: 'Espalhamento fechado e dano em ponto fraco: alvo único.' },
      { overclock: 'Stunner', mods: m('A/B', 'B', 'B/C', 'B', 'A'), quando: 'Atordoa e dá dano extra em atordoados. Combina com o Turret Whip.' },
    ],
  },
  {
    nome: '"Stubby" Voltaic SMG', apelidos: ['stubby', 'smg'], classe: 'Engineer', tipo: 'primária',
    builds: [
      { overclock: 'Turret EM Discharge', mods: m('B', 'A/B', 'B', 'B', 'B'), quando: 'Atire nas suas torretas: viram descargas elétricas que travam enxames.' },
      { overclock: 'EM Refire Booster', mods: m('A/B', 'A/B', 'B', 'B', 'B'), quando: 'Maior dano por segundo da Stubby.' },
      { overclock: 'Light-Weight Rounds', mods: m('A', 'C', 'B', 'A', 'A'), quando: 'Munição de sobra.' },
      { overclock: 'Hyperalloy Assembly', mods: m('A', 'B', 'A/B', 'A', 'A/C'), quando: 'Ponto fraco de perto.' },
    ],
  },
  {
    nome: 'LOK-1 Smart Rifle', apelidos: ['lok', 'lok-1', 'smart rifle'], classe: 'Engineer', tipo: 'primária',
    builds: [
      { overclock: 'Explosive Chemical Rounds', mods: m('B', 'A/B', 'A', 'B', 'A'), quando: 'Controle de enxame: os alvos travados explodem.' },
      { overclock: 'Executioner', mods: m('B', 'A', 'C', 'A', 'B'), quando: 'Dano enorme em ponto fraco com a mira totalmente travada.' },
    ],
  },
  {
    nome: 'Deepcore 40mm PGL', apelidos: ['pgl', 'lança-granadas', 'granada'], classe: 'Engineer', tipo: 'secundária',
    builds: [
      { overclock: 'Clean Sweep', mods: m('A/C', 'B', 'A', 'B', 'A/B'), quando: 'Mais dano e raio de explosão.' },
      { overclock: 'RJ250 Compound', mods: m('A/B/C', 'A/B', 'A', 'A', 'A/B'), quando: 'Munição e mobilidade: dá para pular com a explosão.' },
      { overclock: 'Fat Boy', mods: null, quando: 'Uma explosão gigante (com radiação) por tiro: limpa ondas inteiras, munição bem curta.' },
    ],
  },
  {
    nome: 'LWC Breach Cutter', apelidos: ['breach cutter', 'cutter', 'lwc'], classe: 'Engineer', tipo: 'secundária',
    builds: [
      { overclock: 'Light-Weight Cases', mods: null, quando: 'Provavelmente a melhor opção limpa: mais munição.' },
      { overclock: 'Inferno', mods: m('A', 'A', 'A', 'B', 'B'), quando: 'Fogo que se espalha e queima mais tempo, em troca de dano direto.' },
    ],
  },
  {
    nome: 'Shard Diffractor', apelidos: ['diffractor', 'shard'], classe: 'Engineer', tipo: 'secundária',
    builds: [
      { overclock: 'Plascrete Catalyst', mods: m('C', 'B', 'B', 'A/B', 'C'), quando: 'Feixe com o dobro de área e alcance; atire nas plataformas para explodir.' },
      { overclock: 'Overdrive Booster', mods: m('B/C', 'A', 'B', 'A/B', 'A/B'), quando: 'Alvo único com o feixe turbinado (não dá para andar). Combina com a Stubby.' },
    ],
  },
  // ---------- Gunner ----------
  {
    nome: '"Lead Storm" Powered Minigun', apelidos: ['minigun', 'lead storm'], classe: 'Gunner', tipo: 'primária',
    builds: [
      { overclock: 'Lead Storm', mods: null, quando: 'Dano enorme em alvo único e área, mas não anda atirando. Combina com a Coil Gun.' },
      { overclock: 'A Little More Oomph!', mods: m('B', 'A', 'B', 'A/B', 'C'), quando: 'Opção limpa: mais dano e gira mais rápido.' },
      { overclock: 'Burning Hell', mods: m('A', 'A', 'B', 'B', 'B'), quando: 'Lança fogo à frente. Combina com a Bulldog (Volatile Bullets).' },
      { overclock: 'Rotary Overdrive', mods: m('C', 'A', 'C', 'A/B', 'A'), quando: 'Mais cadência, com cargas de resfriamento.' },
    ],
  },
  {
    nome: '"Thunderhead" Heavy Autocannon', apelidos: ['autocannon', 'thunderhead', 'canhão'], classe: 'Gunner', tipo: 'primária',
    builds: [
      { overclock: 'Splintering Shells', mods: m('C', 'B/C', 'A/B', 'B', 'C'), quando: 'Generalista: mais área sem perder o dano direto.' },
      { overclock: 'Carpet Bomber', mods: m('C', 'B/C', 'B', 'B', 'A/C'), quando: 'Enxames: muito mais área. Use uma secundária de alvo único.' },
      { overclock: 'Neurotoxin Payload', mods: m('C', 'C', 'B', 'B', 'B'), quando: 'Controle com veneno, munição menor.' },
      { overclock: 'Composite Drums', mods: m('A', 'A', 'C', 'A', 'C'), quando: 'Opção limpa: bem mais munição e recarga rápida.' },
    ],
  },
  {
    nome: '"Hurricane" Guided Rocket System', apelidos: ['hurricane', 'foguete', 'rocket'], classe: 'Gunner', tipo: 'primária',
    builds: [
      { overclock: 'Jet Fuel Homebrew', mods: null, quando: 'Dano extremo em alvo único, com bom controle. Considerada a melhor da arma.' },
      { overclock: 'Fragmentation Missiles', mods: m('C', 'A/B', 'A/B', 'B', 'B'), quando: 'Área contra enxames; o nível 5B atordoa. Gasta munição rápido.' },
      { overclock: 'Overtuned Feed Mechanism', mods: m('A/B', 'A/B', 'B', 'A', 'A/B'), quando: 'Opção limpa: mísseis mais rápidos e mais cadência.' },
      { overclock: 'Cluster Charges', mods: m('A', 'A/B', 'A/B', 'B', 'A/B'), quando: 'Segure a recarga para soltar bombinhas. Combina com Volatile Bullets na Bulldog.' },
    ],
  },
  {
    nome: '"Bulldog" Heavy Revolver', apelidos: ['bulldog', 'revólver', 'revolver'], classe: 'Gunner', tipo: 'secundária',
    builds: [
      { overclock: 'Volatile Bullets', mods: m('B', 'A', 'C', 'A/B', 'A'), quando: '+300% de dano em alvos pegando fogo. Precisa de fogo no time (Burning Hell, Hellfire).' },
      { overclock: 'Magic Bullets', mods: m('A', 'C', 'B', 'A', 'B'), quando: 'Os tiros ricocheteiam em quem está perto.' },
      { overclock: 'Six Shooter', mods: m('B', 'B/C', 'C', 'A', 'A'), quando: 'Mais balas, mais cadência.' },
    ],
  },
  {
    nome: 'BRT7 Burst Fire Gun', apelidos: ['brt7', 'brt', 'burst'], classe: 'Gunner', tipo: 'secundária',
    builds: [{ overclock: 'Compact Mags', mods: m('A/B', 'C', 'B', 'C', 'A'), quando: 'Munição de sobra (Disabled Safety e Born Ready compensam as perdas).' }],
  },
  {
    nome: 'ArmsKore Coil Gun', apelidos: ['coil gun', 'coil', 'armskore'], classe: 'Gunner', tipo: 'secundária',
    builds: [
      { overclock: 'Ultra-Magnetic Coils', mods: m('C', 'B', 'B', 'B', 'B/C'), quando: 'Rastro maior e mais longo. Combina com a Lead Storm.' },
      { overclock: 'The Mole', mods: m('A', 'A', 'A', 'A', 'A/B/C'), quando: 'Atravessa terreno e ganha dano a cada parede.' },
      { overclock: 'Hellfire', mods: m('B', 'C', 'A/B', 'A/B', 'B'), quando: 'Incendeia o caminho do tiro. Combina com a Bulldog (Volatile Bullets).' },
    ],
  },
  // ---------- Scout ----------
  {
    nome: 'Deepcore GK2', apelidos: ['gk2', 'deepcore'], classe: 'Scout', tipo: 'primária',
    builds: [
      { overclock: 'AI Stability Engine', mods: m('B', 'A', 'B', 'A', 'C'), quando: 'Zero recuo e mais dano em ponto fraco: alvo único em qualquer distância.' },
      { overclock: 'Bullets of Mercy', mods: m('C', 'A/B', 'B', 'A', 'C'), quando: '+50% de dano em alvos com efeito. Generalista, gasta munição.' },
      { overclock: 'Electrifying Reload', mods: null, quando: 'Controle de enxame: eletrocuta e deixa lento ao recarregar.' },
    ],
  },
  {
    nome: 'M1000 Classic', apelidos: ['m1000', 'rifle'], classe: 'Scout', tipo: 'primária',
    builds: [
      { overclock: 'Hipster', mods: m('B', 'C', 'B', 'A/B', 'C'), quando: 'Quase o dobro de munição e mais cadência. Combina com a Boltshark ou a Boomstick (Special Powder).' },
      { overclock: 'Hoverclock', mods: m('B', 'A', 'A', 'B', 'A'), quando: 'Flutua no ar enquanto mira: ótimo para atirar pendurado no gancho.' },
    ],
  },
  {
    nome: 'DRAK-25 Plasma Carbine', apelidos: ['drak', 'drak-25', 'carbine'], classe: 'Scout', tipo: 'primária',
    builds: [
      { overclock: 'Thermal Exhaust Feedback', mods: m('A/B/C', 'A', 'A/B', 'A', 'A/B'), quando: 'Muito dano mantendo o calor alto. Tem curva de aprendizado.' },
      { overclock: 'Aggressive Venting', mods: m('A', 'A', 'C', 'A/B', 'A/B'), quando: 'Explosão de fogo ao superaquecer: controle de área. Combina com a Zhukov.' },
      { overclock: 'Overtuned Particle Accelerator', mods: null, quando: 'De perto: dano alto em alvo único e bom controle.' },
      { overclock: 'Shield Battery Booster', mods: null, quando: 'Equilibrada e sustentável, dano extra com o escudo cheio.' },
    ],
  },
  {
    nome: 'Jury-Rigged Boomstick', apelidos: ['boomstick', 'escopeta do scout'], classe: 'Scout', tipo: 'secundária',
    builds: [
      { overclock: 'Special Powder', mods: m('B', 'A', 'B', 'A', 'C'), quando: 'Mobilidade: o tiro te arremessa (cuidado com dano de queda). Born Ready ajuda.' },
      { overclock: 'Jumbo Shells', mods: m('A/B', 'A', 'C', 'A/B', 'C'), quando: 'Dano alto, controle e até tiro de longe, com recarga lenta.' },
    ],
  },
  {
    nome: 'Zhukov NUK17', apelidos: ['zhukov', 'zhuk', 'nuk17'], classe: 'Scout', tipo: 'secundária',
    builds: [
      { overclock: 'Custom Casings', mods: m('A', 'B', 'A', 'B', 'A'), quando: 'Pente maior quase sem perder cadência.' },
      { overclock: 'Embedded Detonators', mods: m('A', 'A', 'B', 'C', 'B'), quando: 'Explode por dentro ao recarregar: guarde para alvos pesados.' },
    ],
  },
  {
    nome: 'Nishanka Boltshark X-80', apelidos: ['boltshark', 'besta', 'nishanka', 'crossbow'], classe: 'Scout', tipo: 'secundária',
    builds: [{ overclock: 'Fire Bolt', mods: m('A', 'B', 'A', 'A', 'A'), quando: 'Incendeia e o fogo se espalha pelo grupo: ótima contra enxames (fraca contra robôs).' }],
  },
];

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/["']/g, '').toLowerCase().trim();

/** Acha a arma pelo nome ou apelido (sem acento, maiúscula ou aspas). */
export function acharArma(texto: string): Arma | undefined {
  const t = normalizar(texto);
  if (!t) return undefined;
  return ARMAS.find((a) => normalizar(a.nome) === t || a.apelidos.some((x) => normalizar(x) === t)) ??
    ARMAS.find((a) => normalizar(a.nome).includes(t) || a.apelidos.some((x) => normalizar(x).includes(t)));
}

/** Sugestões para o autocompletar (até 25, o limite do Discord). */
export function sugerirArmas(texto: string): Arma[] {
  const t = normalizar(texto);
  return ARMAS.filter((a) => !t || normalizar(`${a.nome} ${a.classe} ${a.apelidos.join(' ')}`).includes(t)).slice(0, 25);
}

/** "1B · 2A · 3C · 4A/C · 5B" */
export const textoMods = (mods: string[]) => mods.map((x, k) => `${k + 1}${x}`).join(' · ');
