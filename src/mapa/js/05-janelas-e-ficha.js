// ---------- Janelas ----------
for (const b of document.querySelectorAll('[data-fecha]')) b.onclick = (e) => { e.preventDefault(); $(b.dataset.fecha).hidden = true; };
// Clicar fora fecha as janelas, menos as fixas (criação de personagem e subir de nível), que só fecham pelo ✕.
for (const m of document.querySelectorAll('.modal')) m.addEventListener('pointerdown', (e) => {
  if (e.target !== m) return;
  if (m.dataset.fixa) { const cx = m.querySelector('.caixa'); cx.classList.remove('treme'); void cx.offsetWidth; cx.classList.add('treme'); return; }
  m.hidden = true;
});
// O ✕ das janelas fixas pede confirmação (um segundo clique) para não perder o que foi escolhido.
for (const m of document.querySelectorAll('.modal[data-fixa]')) {
  const x = m.querySelector('.fechar');
  x.onclick = (e) => {
    e.preventDefault();
    const livre = m.id === 'modal-ficha' && $('mf-guia').hidden;
    if (livre || x.dataset.armado) { delete x.dataset.armado; x.classList.remove('armado'); m.hidden = true; return; }
    x.dataset.armado = '1'; x.classList.add('armado');
    aviso('Clique de novo no ✕ para sair sem salvar.', '', 3000);
    setTimeout(() => { delete x.dataset.armado; x.classList.remove('armado'); }, 3000);
  };
}

/** Monta os campos de um formulário a partir da lista (rótulo, tipo, limites e valor atual). */
function montarCampos(form, campos, valores) {
  form.textContent = '';
  let grade = null;
  for (const c of campos) {
    if (c.secao) { form.append(el('div', 'rotulo-sec', c.secao)); grade = el('div', 'form-grade'); form.append(grade); continue; }
    if (!grade) { grade = el('div', 'form-grade'); form.append(grade); }
    const rot = el('label', 'campo' + (c.largo ? ' largo' : ''));
    rot.append(document.createTextNode(c.r + (c.obr ? ' *' : '')));
    let input;
    if (c.t === 'sel') { input = el('select'); for (const [v, n] of c.op) input.append(new Option(n, v)); }
    else if (c.t === 'area') { input = el('textarea'); input.maxLength = c.max; }
    else {
      input = el('input'); input.type = c.t === 'num' ? 'number' : 'text';
      if (c.t === 'num') { input.min = c.min; input.max = c.max; input.step = c.passo || 1; } else input.maxLength = c.max;
      if (c.dica) input.placeholder = c.dica;
    }
    input.name = c.k;
    const v = valores && valores[c.k] !== undefined && valores[c.k] !== null ? valores[c.k] : c.pad;
    if (v !== undefined && v !== null) input.value = String(v);
    rot.append(input); grade.append(rot);
  }
}
function lerCampos(form, campos) {
  const r = {};
  for (const c of campos) if (c.k) { const v = form.elements[c.k].value.trim(); r[c.k] = c.t === 'num' ? (v === '' ? null : Number(v)) : v; }
  return r;
}
// "Ladrão de Cofres|2,Criado nas Ruas|3" (como fica salvo) ↔ "Ladrão de Cofres +2, Criado nas Ruas +3" (como se escreve)
const experienciasEmTexto = (v) => String(v || '').split(',').filter(Boolean).map((i) => { const [n, b] = i.split('|'); return `${n} +${b || 2}`; }).join(', ');

// ---------- Ficha do jogador (criada aqui no mapa) ----------
const num = (k, r, min, max, pad, extra) => ({ k, r, t: 'num', min, max, pad, ...extra });
const txt = (k, r, max, extra) => ({ k, r, t: 'txt', max, ...extra });
const CAMPOS_FICHA = {
  dh: [
    { secao: 'Quem é' },
    txt('nome', 'Nome', 60, { obr: true, largo: true }), txt('classe', 'Classe (subclasse)', 50, { obr: true, dica: 'Patrulheiro (Andarilho)' }),
    txt('ancestralidade', 'Ancestralidade', 40, { dica: 'Fungril' }), txt('comunidade', 'Comunidade', 40, { dica: 'Das Montanhas' }), num('nivel', 'Nível', 1, 10, 1),
    { secao: 'Traços' },
    ...TRACOS_DH.map((t) => num(t, NOMES[t], -5, 10, 0)),
    { secao: 'Defesa e vida' },
    num('evasao', 'Evasão', 1, 40, 10), num('pv_max', 'PV (espaços)', 1, 12, 6), num('estresse_max', 'Estresse', 1, 12, 6),
    num('armadura_max', 'Armadura (espaços)', 0, 12, 3), num('limiar_maior', 'Limiar Maior', 1, 99, 6), num('limiar_grave', 'Limiar Grave', 2, 199, 12),
    num('proficiencia', 'Proficiência', 1, 6, 1),
    { secao: 'Experiências' },
    txt('experiencias', 'Separe por vírgula', 300, { largo: true, dica: 'Ladrão de Cofres +2, Criado nas Ruas +2' }),
  ],
  dnd: [
    { secao: 'Quem é' },
    txt('nome', 'Nome', 60, { obr: true, largo: true }), txt('classe', 'Classe', 40, { obr: true, dica: 'Guerreiro 3 / Ladino 2' }),
    txt('raca', 'Raça', 40, { dica: 'Elfo' }), num('nivel', 'Nível', 1, 40, 1),
    { secao: 'Atributos' },
    ...ATRIBUTOS_DND.map((a) => num(a, NOMES[a], 1, 50, 10)),
    { secao: 'Combate' },
    num('pv_max', 'PV máximo', 1, 999, 10), num('ca', 'CA', 1, 80, 10), num('bba', 'Ataque base', 0, 40, 0),
    num('fort', 'Fortitude base', 0, 30, 0), num('ref', 'Reflexos base', 0, 30, 0), num('von', 'Vontade base', 0, 30, 0), num('ini_extra', 'Iniciativa extra', -10, 30, 0),
  ],
};
const minhaPeca = () => estado && estado.pecas.find((p) => p.id === estado.voce.pecaId);

/** Daggerheart abre a ficha guiada; D&D, o formulário. */
function abrirFicha() {
  if (estado && estado.campanha.sistema === 'dh') return abrirFichaGuiada();
  abrirFichaLivre();
}
function abrirFichaLivre() {
  const p = minhaPeca(); if (!p) return;
  $('mf-guia').hidden = true; $('mf-livre').hidden = false;
  const f = p.ficha ? { ...p.ficha } : null;
  if (f && f.experiencias !== undefined) f.experiencias = experienciasEmTexto(f.experiencias);
  $('mf-titulo').textContent = f ? '✏️ ' + p.nome : '✨ Crie o seu personagem';
  $('mf-sub').textContent = (estado.campanha.sistema === 'dh' ? 'Daggerheart' : 'D&D 3.5') + ' · ' + estado.campanha.nome + (f ? '' : ' · os campos com * são obrigatórios');
  montarCampos($('mf-form'), CAMPOS_FICHA[estado.campanha.sistema], f);
  fotoNaFicha();
  $('modal-ficha').hidden = false;
  setTimeout(() => $('mf-form').elements.nome.focus(), 30);
}
function fotoNaFicha() {
  const p = minhaPeca(); if (!p) return;
  pintarAvatar($('mf-avatar'), p.nome, p.avatar, corDe(p));
  $('mf-tirar').hidden = !(p.avatar && p.avatar.includes('/foto/'));
}
$('mf-salvar').onclick = () => {
  const dados = lerCampos($('mf-form'), CAMPOS_FICHA[estado.campanha.sistema]);
  post('ficha', dados).then(() => { $('modal-ficha').hidden = true; aviso('Personagem salvo!', 'ok'); }).catch(() => {});
};
$('mf-form').addEventListener('submit', (e) => { e.preventDefault(); $('mf-salvar').onclick(); });
$('mf-arquivo').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return mostrarErro('Use uma imagem PNG, JPG, WEBP ou GIF.');
  try {
    const blob = await reduzirImagem(f, 512);
    await post('ficha/foto', undefined, { headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
    aviso('Foto do personagem atualizada.', 'ok');
    setTimeout(() => { fotoNaFicha(); if (!$('mf-guia').hidden) desenharGuia(); }, 600);
  } catch (err) { if (err && err.message && !/^(Não deu|Só |Use uma|Imagem)/.test(err.message)) mostrarErro(err.message); }
};
$('mf-tirar').onclick = () => post('ficha/foto/remover', {}).then(() => setTimeout(fotoNaFicha, 400)).catch(() => {});
$('editar-ficha').onclick = abrirFicha;
$('abrir-ficha').onclick = abrirFicha;

// ---------- Ficha guiada do Daggerheart ----------
// Os números vêm do livro básico (PT-BR): classes nas páginas 29 a 51, criação nas 18 a 21, armaduras na 127,
// limiares na 115 (soma o nível; sem armadura, Maior = nível e Grave = dobro) e avanços na 24
// (Proficiência e uma Experiência a mais nos níveis 2, 5 e 8).
const CLASSES_DH = {
  bardo: { nome: 'Bardo', ev: 10, pv: 5, pagina: 29, desc: 'Inspira os aliados com palavras e música.' },
  druida: { nome: 'Druida', ev: 10, pv: 6, pagina: 31, desc: 'Guardião da natureza que vira fera.' },
  guardiao: { nome: 'Guardião', ev: 9, pv: 7, pagina: 37, desc: 'Muralha da linha de frente que protege o grupo.' },
  ranger: { nome: 'Ranger', ev: 12, pv: 6, pagina: 39, desc: 'Caçador e rastreador à distância.' },
  ladino: { nome: 'Ladino', ev: 12, pv: 6, pagina: 43, desc: 'Furtivo, esperto e cheio de truques.' },
  seraph: { nome: 'Serafim', ev: 9, pv: 7, pagina: 45, desc: 'Guerreiro sagrado com poder divino.' },
  feiticeiro: { nome: 'Feiticeiro', ev: 10, pv: 6, pagina: 47, desc: 'Magia que nasce de dentro, crua e poderosa.' },
  guerreiro: { nome: 'Guerreiro', ev: 11, pv: 6, pagina: 49, desc: 'Mestre das armas e do combate.' },
  mago: { nome: 'Mago', ev: 11, pv: 5, pagina: 51, desc: 'Estudioso das artes arcanas.' },
};
// Traço de conjuração de cada subclasse (lido nas cartas de subclasse). Guardião e Guerreiro não conjuram.
const CONJURACAO = { bardo: 'presenca', druida: 'instinto', feiticeiro: 'instinto', ladino: 'acuidade', mago: 'conhecimento', ranger: 'agilidade', seraph: 'forca' };
const DESCRICAO_TRACO = { agilidade: 'correr, pular, esquivar', forca: 'erguer, empurrar, agarrar', acuidade: 'controle, precisão, furtividade', instinto: 'perceber, sentir, rastrear', presenca: 'encantar, convencer, intimidar', conhecimento: 'lembrar, analisar, entender' };
const ARMADURAS_T1 = {
  nenhuma: { nome: 'Sem armadura', maior: null, grave: null, pontos: 0, ev: 0, ag: 0, efeito: 'Maior = nível, Grave = dobro do nível' },
  gambeson: { nome: 'Gambeson', maior: 5, grave: 11, pontos: 3, ev: 1, ag: 0, efeito: 'Flexível: +1 de Evasão' },
  couro: { nome: 'Couro', maior: 6, grave: 13, pontos: 3, ev: 0, ag: 0, efeito: '—' },
  malha: { nome: 'Cota de Malha', maior: 7, grave: 15, pontos: 4, ev: -1, ag: 0, efeito: 'Pesada: −1 de Evasão' },
  placa: { nome: 'Placa Completa', maior: 8, grave: 17, pontos: 4, ev: -2, ag: -1, efeito: 'Muito pesada: −2 de Evasão e −1 de Agilidade' },
};
const VALORES_TRACOS = [2, 1, 1, 0, 0, -1];
// Armas do Nível 1 (livro p. 116 e p. 125). maos: 1 ou 2; magica: precisa de traço de conjuração;
// ev/ac/arm: o que a arma muda na Evasão, na Acuidade e na Armadura; ataque: bônus nas rolagens de ataque.
const arma = (id, nome, traco, alcance, dano, maos, extra = {}) => ({ id, nome, traco, alcance, dano, maos, ...extra });
const ARMAS_PRIMARIAS = [
  arma('espada-larga', 'Espada Larga', 'agilidade', 'Corpo a corpo', 'd8', 1, { efeito: 'Confiável: +1 nas rolagens de ataque', ataque: 1 }),
  arma('espada-longa', 'Espada Longa', 'agilidade', 'Corpo a corpo', 'd8+3', 2),
  arma('machado-de-batalha', 'Machado de Batalha', 'forca', 'Corpo a corpo', 'd10+3', 2),
  arma('montante', 'Montante', 'forca', 'Corpo a corpo', 'd10+3', 2, { efeito: 'Enorme: −1 de Evasão; no acerto, role um dado de dano a mais e descarte o menor', ev: -1 }),
  arma('maca', 'Maça', 'forca', 'Corpo a corpo', 'd8+1', 1),
  arma('martelo-de-guerra', 'Martelo de Guerra', 'forca', 'Corpo a corpo', 'd12+3', 2, { efeito: 'Pesado: −1 de Evasão', ev: -1 }),
  arma('adaga', 'Adaga', 'acuidade', 'Corpo a corpo', 'd8+1', 1),
  arma('bastao', 'Bastão', 'instinto', 'Corpo a corpo', 'd10+3', 2),
  arma('cutelo', 'Cutelo', 'presenca', 'Corpo a corpo', 'd8+1', 1),
  arma('rapieira', 'Rapieira', 'presenca', 'Corpo a corpo', 'd8', 1, { efeito: 'Rápida: ao atacar, marque 1 Estresse para atingir outro alvo no alcance' }),
  arma('alabarda', 'Alabarda', 'forca', 'Muito próximo', 'd10+2', 2, { efeito: 'Incômoda: −1 de Acuidade', ac: -1 }),
  arma('lanca', 'Lança', 'acuidade', 'Muito próximo', 'd10+2', 2, { efeito: 'Incômoda: −1 de Acuidade', ac: -1 }),
  arma('arco-curto', 'Arco Curto', 'agilidade', 'Distante', 'd6+3', 2),
  arma('besta', 'Besta', 'acuidade', 'Distante', 'd6+1', 1),
  arma('arco-longo', 'Arco Longo', 'agilidade', 'Muito longe', 'd8+3', 2, { efeito: 'Incômodo: −1 de Acuidade', ac: -1 }),
  arma('manoplas-arcanas', 'Manoplas Arcanas', 'forca', 'Corpo a corpo', 'd10+3', 2, { magica: true }),
  arma('machado-sagrado', 'Machado Sagrado', 'forca', 'Corpo a corpo', 'd8+1', 1, { magica: true }),
  arma('aneis-brilhantes', 'Anéis Brilhantes', 'agilidade', 'Muito próximo', 'd10+1', 2, { magica: true }),
  arma('runas-de-mao', 'Runas de Mão', 'instinto', 'Muito próximo', 'd10', 1, { magica: true }),
  arma('lamina-de-retorno', 'Lâmina de Retorno', 'acuidade', 'Próximo', 'd8', 1, { magica: true, efeito: 'Retorno: arremessada no alcance, volta para a sua mão logo depois do ataque' }),
  arma('cajado-curto', 'Cajado Curto', 'instinto', 'Próximo', 'd8+1', 1, { magica: true }),
  arma('cajado-duplo', 'Cajado Duplo', 'instinto', 'Distante', 'd6+3', 2, { magica: true }),
  arma('cetro', 'Cetro', 'presenca', 'Longe', 'd6', 2, { magica: true, efeito: 'Versátil: também serve como Presença, Corpo a corpo, d8' }),
  arma('varinha', 'Varinha', 'conhecimento', 'Distante', 'd6+1', 1, { magica: true }),
  arma('grande-cajado', 'Grande Cajado', 'conhecimento', 'Muito longe', 'd6', 2, { magica: true, efeito: 'Poderoso: no acerto, role um dado de dano a mais e descarte o menor' }),
];
const ARMAS_SECUNDARIAS = [
  arma('espada-curta', 'Espada Curta', 'agilidade', 'Corpo a corpo', 'd8', 1, { efeito: 'Emparelhada: +2 no dano da arma principal contra alvos em Corpo a corpo' }),
  arma('escudo-redondo', 'Escudo Redondo', 'forca', 'Corpo a corpo', 'd4', 1, { efeito: 'Proteção: +1 de Armadura', arm: 1 }),
  arma('escudo-de-torre', 'Escudo de Torre', 'forca', 'Corpo a corpo', 'd6', 1, { efeito: 'Barreira: +2 de Armadura e −1 de Evasão', arm: 2, ev: -1 }),
  arma('punhal', 'Punhal', 'acuidade', 'Corpo a corpo', 'd8', 1, { efeito: 'Emparelhado: +2 no dano da arma principal contra alvos em Corpo a corpo' }),
  arma('chicote', 'Chicote', 'presenca', 'Muito próximo', 'd6', 1, { efeito: 'Surpreendente: marque 1 Estresse para afastar quem está em Corpo a corpo de você' }),
  arma('gancho', 'Gancho', 'acuidade', 'Próximo', 'd6', 1, { efeito: 'Enganchado: no acerto, pode puxar o alvo para Corpo a corpo' }),
  arma('besta-de-mao', 'Besta de Mão', 'acuidade', 'Distante', 'd6+1', 1),
];
const ARMA = new Map([...ARMAS_PRIMARIAS, ...ARMAS_SECUNDARIAS].map((a) => [a.id, a]));
/** Dano com a Proficiência: d8+3 com Proficiência 2 vira 2d8+3. */
const danoDaArma = (a, prof) => (a ? Math.max(1, prof) + a.dano : '');
const EXEMPLOS_EXP = ['Ladrão de Cofres', 'Criado nas Ruas', 'Erudito de Bibliotecas', 'Caçador da Floresta', 'Veterano de Guerra', 'Navegador', 'Mentiroso Nato', 'Curandeiro de Aldeia', 'Ferreiro', 'Diplomata da Corte'];
const PASSOS_GUIA = [
  { k: 'classe', nome: 'Classe' }, { k: 'subclasse', nome: 'Subclasse' }, { k: 'heranca', nome: 'Herança' }, { k: 'tracos', nome: 'Traços' },
  { k: 'armadura', nome: 'Armadura' }, { k: 'armas', nome: 'Armas' }, { k: 'experiencias', nome: 'Experiências' }, { k: 'nome', nome: 'Nome e nível' },
];
const tiers = (n) => (n >= 2) + (n >= 5) + (n >= 8);
let catalogoCartas = null;
async function carregarCatalogo() {
  if (!catalogoCartas) { catalogoCartas = await pegar('cartas/catalogo'); catalogoCartas.mapa = new Map(catalogoCartas.cartas.map((c) => [c.id, c])); }
  return catalogoCartas;
}
const urlCarta = (id, grande) => api('carta/' + (grande ? 'g' : 'p') + '/' + id);
/** Lupa no canto da carta: abre a carta grande sem escolher. */
function lupa(c, mini) { const l = el('span', 'lupa' + (mini ? ' mini' : '')); l.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg><b>Ampliar</b>'; l.tabIndex = 0; l.title = 'Ver a carta grande'; l.setAttribute('role', 'button'); l.onclick = (e) => { e.preventDefault(); e.stopPropagation(); zoomCarta(c, null); }; return l; }
/** Uma carta desenhada: a imagem (se o servidor tiver) ou um cartão com o nome, nas cores do domínio. */
function desenhoCarta(c, grande) {
  if (catalogoCartas && catalogoCartas.imagens) { const i = el('img'); i.src = urlCarta(c.id, grande); i.alt = c.nome; i.loading = 'lazy'; return i; }
  const cor = c.tipo === 'dominio' ? catalogoCartas.dominios[c.dominio].cor : c.tipo === 'subclasse' ? '#6b4a2c' : c.tipo === 'ancestralidade' ? '#3a6b7a' : '#7a5a2a';
  const d = el('div', 'carta-texto'); d.style.background = `linear-gradient(160deg, ${cor}, #1a0f08)`;
  const sub = c.tipo === 'dominio' ? `${catalogoCartas.dominios[c.dominio].nome} · nível ${c.nivel} · custo ${c.custo}` : c.tipo === 'subclasse' ? catalogoCartas.estagios[c.estagio].nome : c.tipo === 'ancestralidade' ? 'Ancestralidade' : 'Comunidade';
  d.append(el('b', '', c.nome), el('small', '', sub));
  return d;
}

let guia = null, passoGuia = 0;
function novoGuia(p) {
  const f = p && p.ficha;
  let salvo = {};
  try { salvo = f && f.guia ? JSON.parse(f.guia) : {}; } catch {}
  const pr = (p && p.prancheta && p.prancheta.minhas) || [];
  const tem = (tipo) => pr.filter((m) => catalogoCartas.mapa.get(m.carta) && catalogoCartas.mapa.get(m.carta).tipo === tipo).map((m) => m.carta);
  const sub = tem('subclasse').map((id) => catalogoCartas.mapa.get(id)).find((c) => c.estagio === 'fundacao');
  return {
    classe: salvo.classe || null,
    subclasse: salvo.subclasse || (sub && sub.id) || null,
    ancestralidades: salvo.ancestralidades || tem('ancestralidade'),
    comunidade: salvo.comunidade || tem('comunidade')[0] || null,
    mista: !!salvo.mista || tem('ancestralidade').length > 1,
    tracos: salvo.tracos || {},
    avancoTracos: salvo.avancoTracos || {},
    armadura: salvo.armadura || null,
    armas: Object.assign({ primaria: null, secundaria: null }, salvo.armas || {}),
    extras: Object.assign({ pv: 0, estresse: 0, evasao: 0, proficiencia: 0 }, salvo.extras || {}),
    historico: salvo.historico || [],
    marcados: salvo.marcados || [],
    cartasAvanco: salvo.cartasAvanco || 0,
    experiencias: salvo.experiencias || (f && f.experiencias ? String(f.experiencias).split(',').filter(Boolean).map((i) => { const [nome, b] = i.split('|'); return { nome, bonus: Number(b) || 2 }; }) : []),
    nome: (f && f.nome) || '',
    nivel: (f && f.nivel) || 1,
  };
}
/** Tudo o que a ficha calcula sozinha a partir das escolhas. */
function calcularGuia(g) {
  const cl = g.classe && CLASSES_DH[g.classe], arm = ARMADURAS_T1[g.armadura || 'nenhuma'], n = Math.max(1, Math.min(10, Number(g.nivel) || 1));
  const armas = [ARMA.get(g.armas && g.armas.primaria), ARMA.get(g.armas && g.armas.secundaria)].filter(Boolean);
  const somaArmas = (k) => armas.reduce((t, a) => t + (a[k] || 0), 0);
  const tracos = {};
  for (const t of TRACOS_DH) tracos[t] = (Number(g.tracos[t]) || 0) + (Number(g.avancoTracos[t]) || 0) + (t === 'agilidade' ? arm.ag : 0) + (t === 'acuidade' ? somaArmas('ac') : 0);
  return {
    nivel: n, tracos,
    evasao: cl ? cl.ev + arm.ev + somaArmas('ev') + (Number(g.extras.evasao) || 0) : null,
    pv_max: cl ? cl.pv + (Number(g.extras.pv) || 0) : null,
    estresse_max: 6 + (Number(g.extras.estresse) || 0),
    armadura_max: arm.pontos + somaArmas('arm'),
    limiar_maior: arm.maior === null ? n : arm.maior + n,
    limiar_grave: arm.grave === null ? 2 * n : arm.grave + n,
    proficiencia: 1 + tiers(n) + (Number(g.extras.proficiencia) || 0),
    experiencias: 2 + tiers(n),
    esperanca: 2,
  };
}
function pendenciasGuia(g) {
  const usados = TRACOS_DH.map((t) => g.tracos[t]).filter((v) => v !== undefined && v !== '' && v !== null);
  const restantes = [...VALORES_TRACOS]; let tracosOk = usados.length === 6;
  for (const v of usados) { const i = restantes.indexOf(Number(v)); if (i < 0) tracosOk = false; else restantes.splice(i, 1); }
  const calc = calcularGuia(g);
  return [
    ['Classe', !!g.classe], ['Subclasse', !!g.subclasse], ['Ancestralidade', g.ancestralidades.length >= (g.mista ? 2 : 1)], ['Comunidade', !!g.comunidade],
    ['Traços (+2, +1, +1, 0, 0, −1)', tracosOk], ['Armadura', !!g.armadura], ['Arma principal', !!(g.armas && g.armas.primaria)],
    [`${calc.experiencias} Experiências`, g.experiencias.filter((e) => e && String(e.nome || '').trim()).length >= calc.experiencias], ['Nome', !!String(g.nome).trim()],
  ];
}

async function abrirFichaGuiada() {
  const p = minhaPeca(); if (!p) return;
  try { await carregarCatalogo(); } catch { return; }
  guia = novoGuia(p);
  passoGuia = 0;
  const pend = pendenciasGuia(guia); const primeiro = pend.findIndex(([, ok]) => !ok);
  passoGuia = p.ficha ? 0 : Math.max(0, Math.min(PASSOS_GUIA.length - 1, primeiro < 0 ? 0 : [0, 1, 2, 2, 3, 4, 5, 6, 7][primeiro]));
  $('mf-titulo').textContent = p.ficha ? '✏️ ' + p.nome : '✨ Crie o seu personagem';
  $('mf-sub').textContent = 'Daggerheart · ' + estado.campanha.nome + ' · a ficha se preenche sozinha conforme você escolhe';
  $('modal-ficha').querySelector('.caixa').classList.add('guia');
  $('mf-livre').hidden = true; $('mf-guia').hidden = false;
  desenharGuia();
  $('modal-ficha').hidden = false;
}
function usarFormularioLivre() {
  $('modal-ficha').querySelector('.caixa').classList.remove('guia');
  $('mf-guia').hidden = true; $('mf-livre').hidden = false;
  abrirFichaLivre();
}

let resumoAnterior = {};
function desenharGuia() {
  const g = guia, calc = calcularGuia(g), pend = pendenciasGuia(g), caixa = $('mf-guia');
  caixa.textContent = '';
  const topo = el('div', 'guia-topo');
  const livre = el('button', 'trocar', '✍️ Prefiro preencher tudo à mão'); livre.type = 'button'; livre.onclick = usarFormularioLivre;
  topo.append(livre); caixa.append(topo);
  // Trilha de passos
  const passos = el('div', 'passos');
  const feitoPasso = { classe: pend[0][1], subclasse: pend[1][1], heranca: pend[2][1] && pend[3][1], tracos: pend[4][1], armadura: pend[5][1], armas: pend[6][1], experiencias: pend[7][1], nome: pend[8][1] };
  PASSOS_GUIA.forEach((ps, i) => {
    const b = el('button', (i === passoGuia ? 'atual ' : '') + (feitoPasso[ps.k] ? 'feito' : '')); b.type = 'button';
    const nn = el('span', 'n'); nn.append(el('span', '', String(i + 1)));
    b.append(nn, document.createTextNode(ps.nome)); b.onclick = () => { passoGuia = i; desenharGuia(); };
    passos.append(b);
  });
  caixa.append(passos);
  const corpo = el('div', 'guia-corpo'), passo = el('div', 'guia-passo');
  corpo.append(passo, resumoGuia(calc, pend)); caixa.append(corpo);
  [passoClasse, passoSubclasse, passoHeranca, passoTracos, passoArmadura, passoArmas, passoExperiencias, passoNome][passoGuia](passo, calc);
  // Navegação
  const nav = el('div', 'guia-nav');
  if (passoGuia > 0) { const v = el('button', 'btn sec', '◀ Voltar'); v.type = 'button'; v.onclick = () => { passoGuia--; desenharGuia(); }; nav.append(v); }
  nav.append(el('span', 'esp'));
  if (passoGuia < PASSOS_GUIA.length - 1) { const a = el('button', 'btn sec', 'Próximo ▶'); a.type = 'button'; a.onclick = () => { passoGuia++; desenharGuia(); }; nav.append(a); }
  const salvar = el('button', 'btn', '💾 Salvar personagem'); salvar.type = 'button'; salvar.onclick = () => salvarFichaGuiada().catch(() => {});
  nav.append(salvar);
  passo.append(nav);
}
function resumoGuia(calc, pend) {
  const r = el('div', 'resumo'), g = guia;
  r.append(el('h4', '', g.nome || 'Seu personagem'));
  const cl = g.classe ? CLASSES_DH[g.classe].nome : '—', sub = g.subclasse && catalogoCartas.mapa.get(g.subclasse);
  const anc = g.ancestralidades.map((id) => catalogoCartas.mapa.get(id)?.nome).filter(Boolean).join(' / ') || '—';
  const com = g.comunidade ? catalogoCartas.mapa.get(g.comunidade)?.nome : '—';
  r.append(el('div', 'quem', `${cl}${sub ? ' (' + sub.nome + ')' : ''} · ${anc} · ${com} · nível ${calc.nivel}`));
  const grade = el('div', 'grade-r');
  const caixas = [['Evasão', calc.evasao ?? '—'], ['PV', calc.pv_max ?? '—'], ['Estresse', calc.estresse_max], ['Esperança', calc.esperanca], ['Armadura', calc.armadura_max], ['Proficiência', calc.proficiencia],
    ['Limiar Maior', calc.limiar_maior], ['Limiar Grave', calc.limiar_grave], ['Experiências', calc.experiencias]];
  for (const [k, v] of caixas) { const c = el('div', 'cx' + (resumoAnterior[k] !== undefined && resumoAnterior[k] !== v ? ' muda' : '')); c.append(el('b', '', String(v)), el('small', '', k)); grade.append(c); resumoAnterior[k] = v; }
  r.append(grade);
  const tr = el('div', 'grade-r'); tr.style.marginTop = '6px';
  for (const t of TRACOS_DH) { const c = el('div', 'cx'); c.append(el('b', '', g.tracos[t] === undefined || g.tracos[t] === '' ? '—' : sinal(calc.tracos[t])), el('small', '', NOMES[t])); tr.append(c); }
  r.append(tr);
  for (const [rot, id] of [['Arma', g.armas && g.armas.primaria], ['Secundária', g.armas && g.armas.secundaria]]) {
    const a = ARMA.get(id); if (!a) continue;
    const l = el('div', 'arma-resumo'); l.append(el('b', '', a.nome), document.createTextNode(` · ${NOMES[a.traco]} · ${danoDaArma(a, calc.proficiencia)}${a.magica ? ' mag' : ' fís'}`)); r.append(l);
  }
  const falta = el('ul', 'falta');
  for (const [n, ok] of pend) falta.append(el('li', ok ? 'ok' : 'nao', n));
  r.append(falta);
  return r;
}
const tituloPasso = (p, t, ajuda) => { p.append(el('h3', '', t)); if (ajuda) p.append(el('p', 'ajuda', ajuda)); };

function passoClasse(p) {
  tituloPasso(p, 'Escolha a sua classe', 'A classe define seus dois domínios de cartas, sua Evasão e seus Pontos de Vida iniciais.');
  const op = el('div', 'opcoes');
  for (const [k, c] of Object.entries(CLASSES_DH)) {
    const b = el('button', 'opcao' + (guia.classe === k ? ' sel' : '')); b.type = 'button';
    b.append(el('b', '', c.nome), el('small', '', c.desc));
    const st = el('div'); st.style.marginTop = '6px';
    for (const [n, v] of [['Evasão', c.ev], ['PV', c.pv]]) { const s = el('span', 'stat'); s.append(document.createTextNode(n + ' '), el('b', '', String(v))); st.append(s); }
    const chips = el('div', 'chips');
    for (const d of catalogoCartas.classes[k].dominios) { const ch = el('span', 'chip-dom', catalogoCartas.dominios[d].nome); ch.style.background = catalogoCartas.dominios[d].cor; chips.append(ch); }
    b.append(st, chips);
    if (estado.livro) { const lv = el('small', '', '📖 livro p. ' + c.pagina); lv.style.cursor = 'pointer'; lv.style.textDecoration = 'underline'; lv.onclick = (e) => { e.stopPropagation(); abrirLivro(c.pagina); }; b.append(lv); }
    b.onclick = () => {
      if (guia.classe !== k) { guia.classe = k; guia.subclasse = null; }
      passoGuia = 1; desenharGuia();
    };
    op.append(b);
  }
  p.append(op);
}
function passoSubclasse(p) {
  if (!guia.classe) { tituloPasso(p, 'Subclasse', 'Escolha a classe primeiro.'); return; }
  const cl = CLASSES_DH[guia.classe];
  tituloPasso(p, 'Escolha a subclasse de ' + cl.nome, 'A carta de Fundação entra agora; a Especialização libera no nível 5 e a Maestria no 8.' + (CONJURACAO[guia.classe] ? ' Seu traço de conjuração é ' + NOMES[CONJURACAO[guia.classe]] + '.' : ''));
  const op = el('div', 'opcoes'); op.style.gridTemplateColumns = 'repeat(auto-fill, minmax(320px, 1fr))';
  for (const c of catalogoCartas.cartas.filter((x) => x.tipo === 'subclasse' && x.classe === guia.classe && x.estagio === 'fundacao')) {
    const b = el('button', 'opcao' + (guia.subclasse === c.id ? ' sel' : '')); b.type = 'button';
    const linha = el('div', 'sub-op'), img = desenhoCarta(c, true);
    const txt = el('div'); txt.append(el('b', '', c.nome), el('small', '', 'Fundação · clique em Ampliar para ler a carta'));
    const moldura = el('div', 'moldura-lupa'); moldura.style.position = 'relative'; moldura.append(img, lupa(c, true));
    linha.append(moldura, txt); b.append(linha);
    img.onclick = (e) => { e.stopPropagation(); zoomCarta(c, null); };
    b.onclick = () => { guia.subclasse = c.id; passoGuia = 2; desenharGuia(); };
    op.append(b);
  }
  p.append(op);
}
function passoHeranca(p) {
  tituloPasso(p, 'Ancestralidade e comunidade', 'De onde o seu personagem vem. Para ler uma carta grande, clique em Ampliar sobre ela.');
  const mista = el('label', 'escondida'); mista.style.color = 'var(--tinta)';
  const cx = el('input'); cx.type = 'checkbox'; cx.checked = guia.mista;
  cx.onchange = () => { guia.mista = cx.checked; if (!guia.mista) guia.ancestralidades = guia.ancestralidades.slice(0, 1); desenharGuia(); };
  mista.append(cx, document.createTextNode(' Herança mista (duas ancestralidades)'));
  p.append(el('div', 'rotulo-sec', 'Ancestralidade' + (guia.mista ? ' (escolha duas)' : '')), mista);
  const grade = (tipo, sel, aoEscolher) => {
    const op = el('div', 'opcoes cartas');
    for (const c of catalogoCartas.cartas.filter((x) => x.tipo === tipo)) {
      const b = el('button', 'opcao carta-op' + (sel(c.id) ? ' sel' : '')); b.type = 'button';
      b.append(desenhoCarta(c), el('span', '', c.nome), lupa(c));
      b.onclick = () => { aoEscolher(c.id); desenharGuia(); };
      b.oncontextmenu = (e) => { e.preventDefault(); zoomCarta(c, null); };
      op.append(b);
    }
    return op;
  };
  p.append(grade('ancestralidade', (id) => guia.ancestralidades.includes(id), (id) => {
    if (guia.ancestralidades.includes(id)) guia.ancestralidades = guia.ancestralidades.filter((x) => x !== id);
    else guia.ancestralidades = guia.mista ? [...guia.ancestralidades, id].slice(-2) : [id];
  }));
  p.append(el('div', 'rotulo-sec', 'Comunidade'));
  p.append(grade('comunidade', (id) => guia.comunidade === id, (id) => { guia.comunidade = id; }));
}
function passoTracos(p, calc) {
  tituloPasso(p, 'Distribua os traços', 'Dê +2, +1, +1, 0, 0 e −1 aos seis traços, um valor para cada. O +2 vai no que o seu personagem faz de melhor.');
  const usados = TRACOS_DH.map((t) => guia.tracos[t]).filter((v) => v !== undefined && v !== '');
  const bolsa = el('div', 'bolsa'); bolsa.append(el('small', '', 'Valores:'));
  const resta = [...VALORES_TRACOS];
  for (const v of usados) { const i = resta.indexOf(Number(v)); if (i >= 0) resta.splice(i, 1); }
  const marcados = [...VALORES_TRACOS]; const sobra = [...resta];
  for (const v of marcados) { const i = sobra.indexOf(v); const s = el('span', 'v' + (i < 0 ? ' usado' : ''), sinal(v)); if (i >= 0) sobra.splice(i, 1); bolsa.append(s); }
  const sug = el('button', 'btn sec', '✨ Sugestão rápida'); sug.type = 'button';
  sug.title = 'Põe +2 no traço de conjuração da classe (ou Força, para quem não conjura) e distribui o resto';
  sug.onclick = () => {
    const principal = CONJURACAO[guia.classe] || 'forca';
    const ordem = [principal, ...['agilidade', 'instinto', 'acuidade', 'presenca', 'conhecimento', 'forca'].filter((t) => t !== principal)];
    guia.tracos = {}; ordem.forEach((t, i) => { guia.tracos[t] = VALORES_TRACOS[i]; }); desenharGuia();
  };
  const limpar = el('button', 'btn sec', 'Limpar'); limpar.type = 'button'; limpar.onclick = () => { guia.tracos = {}; desenharGuia(); };
  bolsa.append(el('span', 'esp'), sug, limpar); bolsa.querySelector('.esp').style.flex = '1';
  p.append(bolsa);
  const grade = el('div', 'tracos-guia');
  for (const t of TRACOS_DH) {
    const c = el('div', 'traco-g'), atual = guia.tracos[t];
    const topo = el('div', 'nome'); topo.append(el('span', '', NOMES[t] + (CONJURACAO[guia.classe] === t ? ' ✨' : '')), el('span', 'final', atual === undefined || atual === '' ? '—' : sinal(calc.tracos[t])));
    c.append(topo, el('small', '', DESCRICAO_TRACO[t]));
    const s = el('select'); s.append(new Option('escolher…', ''));
    const disponiveis = [...resta]; if (atual !== undefined && atual !== '') disponiveis.push(Number(atual));
    for (const v of [...new Set(disponiveis)].sort((a, b) => b - a)) s.append(new Option(sinal(v), String(v)));
    s.value = atual === undefined ? '' : String(atual);
    s.onchange = () => { if (s.value === '') delete guia.tracos[t]; else guia.tracos[t] = Number(s.value); desenharGuia(); };
    c.append(s);
    if (calc.nivel > 1) {
      const av = el('div', 'avanco'), n = Number(guia.avancoTracos[t]) || 0;
      const menos = el('button', '', '−'), mais = el('button', '', '+'); menos.type = mais.type = 'button';
      menos.onclick = () => { guia.avancoTracos[t] = Math.max(0, n - 1); desenharGuia(); };
      mais.onclick = () => { guia.avancoTracos[t] = Math.min(4, n + 1); desenharGuia(); };
      av.append(document.createTextNode('Avanços'), menos, el('b', '', '+' + n), mais); c.append(av);
    }
    if (t === 'agilidade' && guia.armadura === 'placa') c.append(el('small', '', '−1 da Placa Completa'));
    grade.append(c);
  }
  p.append(grade);
}
function passoArmadura(p, calc) {
  tituloPasso(p, 'Escolha a armadura', 'Os limiares de dano já somam o seu nível (' + calc.nivel + '). Pontos de armadura são os espaços que você marca para reduzir o dano.');
  const op = el('div', 'opcoes');
  for (const [k, a] of Object.entries(ARMADURAS_T1)) {
    const b = el('button', 'opcao' + (guia.armadura === k ? ' sel' : '')); b.type = 'button';
    const maior = a.maior === null ? calc.nivel : a.maior + calc.nivel, grave = a.grave === null ? 2 * calc.nivel : a.grave + calc.nivel;
    b.append(el('b', '', a.nome));
    const st = el('div'); st.style.marginTop = '6px';
    for (const [n, v] of [['Limiares', maior + '/' + grave], ['Pontos', a.pontos]]) { const s = el('span', 'stat'); s.append(document.createTextNode(n + ' '), el('b', '', String(v))); st.append(s); }
    b.append(st, el('small', '', a.efeito));
    b.onclick = () => { guia.armadura = k; passoGuia = 5; desenharGuia(); };
    op.append(b);
  }
  p.append(op);
  if (estado.livro) { const lv = el('button', 'btn sec', '📖 Tabela de armaduras (p. 127)'); lv.type = 'button'; lv.style.marginTop = '10px'; lv.onclick = () => abrirLivro(127); p.append(lv); }
}
function passoArmas(p, calc) {
  const conjura = !!CONJURACAO[guia.classe];
  tituloPasso(p, 'Escolha as armas', `O dano já leva a sua Proficiência (${calc.proficiencia}): cada ponto rola um dado. Arma de duas mãos não deixa usar arma secundária.`);
  const principal = ARMA.get(guia.armas.primaria);
  const cartao = (a, sel, bloqueio, aoEscolher) => {
    const b = el('button', 'opcao' + (sel ? ' sel' : '') + (bloqueio ? ' bloqueada' : '')); b.type = 'button';
    b.append(el('b', '', a.nome));
    const st = el('div'); st.style.marginTop = '5px';
    for (const [n, v] of [['Traço', NOMES[a.traco] + ' ' + sinal(calc.tracos[a.traco] ?? 0)], ['Dano', danoDaArma(a, calc.proficiencia) + (a.magica ? ' mág.' : ' fís.')], ['Alcance', a.alcance], ['Mãos', a.maos === 2 ? 'duas' : 'uma']]) {
      const sp = el('span', 'stat'); sp.append(document.createTextNode(n + ' '), el('b', '', String(v))); st.append(sp);
    }
    b.append(st);
    if (a.efeito) b.append(el('small', '', a.efeito));
    if (bloqueio) { b.append(el('small', 'motivo-op', bloqueio)); b.disabled = true; }
    else b.onclick = aoEscolher;
    return b;
  };
  for (const [titulo, lista] of [['Armas físicas', ARMAS_PRIMARIAS.filter((a) => !a.magica)], ['Armas mágicas', ARMAS_PRIMARIAS.filter((a) => a.magica)]]) {
    p.append(el('div', 'rotulo-sec', titulo + (titulo === 'Armas mágicas' && !conjura ? ' (só para quem conjura)' : '')));
    const op = el('div', 'opcoes');
    for (const a of lista) op.append(cartao(a, guia.armas.primaria === a.id, a.magica && !conjura ? (guia.classe ? CLASSES_DH[guia.classe].nome + ' não tem traço de conjuração.' : 'Escolha a classe antes.') : null, () => {
      guia.armas.primaria = a.id; if (a.maos === 2) guia.armas.secundaria = null; desenharGuia();
    }));
    p.append(op);
  }
  p.append(el('div', 'rotulo-sec', 'Arma secundária (opcional)'));
  const op2 = el('div', 'opcoes');
  const nenhuma = el('button', 'opcao' + (!guia.armas.secundaria ? ' sel' : '')); nenhuma.type = 'button';
  nenhuma.append(el('b', '', 'Nenhuma'), el('small', '', 'Mão livre.')); nenhuma.onclick = () => { guia.armas.secundaria = null; desenharGuia(); };
  op2.append(nenhuma);
  for (const a of ARMAS_SECUNDARIAS) op2.append(cartao(a, guia.armas.secundaria === a.id, principal && principal.maos === 2 ? principal.nome + ' usa as duas mãos.' : null, () => { guia.armas.secundaria = a.id; desenharGuia(); }));
  p.append(op2);
  if (estado.livro) {
    const linha = el('div', 'linha');
    for (const [t, pg] of [['📖 Armas principais (p. 116)', 116], ['📖 Armas secundárias (p. 125)', 125]]) { const lv = el('button', 'btn sec', t); lv.type = 'button'; lv.onclick = () => abrirLivro(pg); linha.append(lv); }
    p.append(linha);
  }
}
function passoExperiencias(p, calc) {
  tituloPasso(p, 'Experiências', `O que o seu personagem viveu e sabe fazer. No nível ${calc.nivel} são ${calc.experiencias}, cada uma com +2 (avanços podem subir para +3).`);
  while (guia.experiencias.length < calc.experiencias) guia.experiencias.push({ nome: '', bonus: 2 });
  const lista = el('div', 'exps');
  guia.experiencias.forEach((e, i) => {
    const l = el('div', 'exp-linha'), nome = el('input'), bonus = el('input');
    nome.type = 'text'; nome.maxLength = 40; nome.placeholder = 'Experiência ' + (i + 1); nome.value = e.nome || '';
    bonus.type = 'number'; bonus.min = 1; bonus.max = 9; bonus.value = String(e.bonus || 2);
    nome.oninput = () => { e.nome = nome.value; };
    nome.onchange = () => desenharGuia();
    bonus.onchange = () => { e.bonus = Number(bonus.value) || 2; desenharGuia(); };
    l.append(nome, bonus); lista.append(l);
  });
  if (guia.experiencias.length > calc.experiencias) {
    const tirar = el('button', 'btn sec', 'Tirar a última'); tirar.type = 'button'; tirar.onclick = () => { guia.experiencias.pop(); desenharGuia(); }; lista.append(tirar);
  }
  p.append(lista, el('div', 'rotulo-sec', 'Ideias (clique para usar)'));
  const ex = el('div', 'exemplos');
  for (const nome of EXEMPLOS_EXP) {
    const b = el('button', '', nome); b.type = 'button';
    b.onclick = () => { const vaga = guia.experiencias.find((e) => !String(e.nome || '').trim()); if (vaga) vaga.nome = nome; else guia.experiencias.push({ nome, bonus: 2 }); desenharGuia(); };
    ex.append(b);
  }
  p.append(ex);
}
function passoNome(p, calc) {
  tituloPasso(p, 'Nome, nível e retrato', 'Ao salvar, as cartas de subclasse, ancestralidade e comunidade entram na sua prancheta. Depois é só escolher as cartas de domínio.');
  const linha = el('div', 'form-grade');
  const cn = el('label', 'campo largo'); cn.append(document.createTextNode('Nome do personagem *'));
  const nome = el('input'); nome.type = 'text'; nome.maxLength = 60; nome.value = guia.nome; nome.placeholder = 'Lyra Brasa'; nome.oninput = () => { guia.nome = nome.value; }; nome.onchange = () => desenharGuia();
  cn.append(nome);
  const cv = el('label', 'campo'); cv.append(document.createTextNode('Nível'));
  const nv = el('input'); nv.type = 'number'; nv.min = 1; nv.max = 10; nv.value = String(guia.nivel); nv.onchange = () => { guia.nivel = Math.max(1, Math.min(10, Number(nv.value) || 1)); desenharGuia(); };
  cv.append(nv); linha.append(cn, cv); p.append(linha);
  if (calc.nivel > 1) {
    p.append(el('div', 'rotulo-sec', 'Avanços escolhidos ao subir de nível'));
    const av = el('div', 'avancos');
    for (const [k, r] of [['pv', '+1 espaço de PV'], ['estresse', '+1 espaço de Estresse'], ['evasao', '+1 de Evasão']]) {
      const c = el('div', 'contador'), n = Number(guia.extras[k]) || 0, m = el('button', '', '−'), s = el('button', '', '+'); m.type = s.type = 'button';
      m.onclick = () => { guia.extras[k] = Math.max(0, n - 1); desenharGuia(); }; s.onclick = () => { guia.extras[k] = Math.min(6, n + 1); desenharGuia(); };
      c.append(el('span', '', r), el('span'), m, el('b', '', String(n)), s); av.append(c);
    }
    p.append(av, el('p', 'ajuda', 'Os +1 nos traços ficam no passo Traços. Cartas de domínio extras (avanço) o mestre libera na sua prancheta.'));
    if (estado.livro) { const lv = el('button', 'btn sec', '📖 Avanços por nível (p. 24)'); lv.type = 'button'; lv.onclick = () => abrirLivro(24); p.append(lv); }
  }
  const foto = el('div', 'foto-edit'), av = el('div', 'avatar'), mp = minhaPeca();
  pintarAvatar(av, guia.nome || 'Personagem', mp && mp.avatar, mp && corDe(mp));
  const botoes = el('div'); const lb = el('label', 'btn sec', '🖼️ Escolher retrato'); lb.htmlFor = 'mf-arquivo';
  botoes.append(lb, el('div', 'mudo', 'Aparece na sua peça, no chat e no Discord.'));
  foto.append(av, botoes); p.append(foto);
}

function dadosDaGuia(g) {
  const calc = calcularGuia(g), nomeDe = (id) => (catalogoCartas.mapa.get(id) || {}).nome || '';
  const sub = g.subclasse ? catalogoCartas.mapa.get(g.subclasse) : null;
  return {
    nome: g.nome.trim(), classe: CLASSES_DH[g.classe].nome + (sub ? ' (' + sub.nome + ')' : ''),
    ancestralidade: g.ancestralidades.map(nomeDe).join(' / ').slice(0, 40), comunidade: nomeDe(g.comunidade).slice(0, 40), nivel: calc.nivel,
    ...calc.tracos,
    evasao: calc.evasao, proficiencia: Math.min(6, calc.proficiencia), pv_max: Math.min(12, calc.pv_max), estresse_max: Math.min(12, calc.estresse_max), armadura_max: Math.min(12, calc.armadura_max),
    limiar_maior: calc.limiar_maior, limiar_grave: calc.limiar_grave,
    experiencias: g.experiencias.filter((e) => String(e.nome || '').trim()).map((e) => `${e.nome.trim().replace(/[,|+]/g, ' ')} +${e.bonus || 2}`).join(', '),
    guia: JSON.stringify({ classe: g.classe, subclasse: g.subclasse, ancestralidades: g.ancestralidades, comunidade: g.comunidade, mista: g.mista, tracos: g.tracos, avancoTracos: g.avancoTracos, armadura: g.armadura, armas: g.armas, extras: g.extras, experiencias: g.experiencias, historico: g.historico, marcados: g.marcados, cartasAvanco: g.cartasAvanco }),
  };
}

async function salvarFichaGuiada() {
  const g = guia, calc = calcularGuia(g), pend = pendenciasGuia(g), faltando = pend.filter(([, ok]) => !ok).map(([n]) => n);
  if (!g.classe || !String(g.nome).trim()) { aviso('Falta ' + (!g.classe ? 'escolher a classe' : 'o nome do personagem') + '.', 'erro'); passoGuia = !g.classe ? 0 : 7; return desenharGuia(); }
  const nomeDe = (id) => (catalogoCartas.mapa.get(id) || {}).nome || '';
  const sub = g.subclasse ? catalogoCartas.mapa.get(g.subclasse) : null;
  const dados = {
    nome: g.nome.trim(), classe: CLASSES_DH[g.classe].nome + (sub ? ' (' + sub.nome + ')' : ''),
    ancestralidade: g.ancestralidades.map(nomeDe).join(' / ').slice(0, 40), comunidade: nomeDe(g.comunidade).slice(0, 40), nivel: calc.nivel,
    ...calc.tracos,
    evasao: calc.evasao, proficiencia: calc.proficiencia, pv_max: calc.pv_max, estresse_max: calc.estresse_max, armadura_max: calc.armadura_max,
    limiar_maior: calc.limiar_maior, limiar_grave: calc.limiar_grave,
    experiencias: g.experiencias.filter((e) => String(e.nome || '').trim()).map((e) => `${e.nome.trim().replace(/[,|+]/g, ' ')} +${e.bonus || 2}`).join(', '),
    guia: JSON.stringify({ classe: g.classe, subclasse: g.subclasse, ancestralidades: g.ancestralidades, comunidade: g.comunidade, mista: g.mista, tracos: g.tracos, avancoTracos: g.avancoTracos, armadura: g.armadura, armas: g.armas, extras: g.extras, experiencias: g.experiencias, historico: g.historico, marcados: g.marcados, cartasAvanco: g.cartasAvanco }),
  };
  await post('ficha', dados);
  // Cartas de base na prancheta: tira as que mudaram e põe as escolhidas.
  try {
    const p = minhaPeca(), atuais = ((p && p.prancheta && p.prancheta.minhas) || []).map((m) => m.carta);
    const querBase = new Set([...g.ancestralidades, g.comunidade].filter(Boolean));
    for (const id of atuais) {
      const c = catalogoCartas.mapa.get(id); if (!c) continue;
      const fora = (c.tipo === 'ancestralidade' || c.tipo === 'comunidade') ? !querBase.has(id) : c.tipo === 'subclasse' ? !sub || c.subclasse !== sub.subclasse : false;
      if (fora) await post('cartas/tirar', { carta: id });
    }
    for (const id of [g.subclasse, ...querBase]) if (id && !atuais.includes(id)) await post('cartas/escolher', { carta: id }).catch(() => {});
  } catch {}
  $('modal-ficha').hidden = true;
  aviso(faltando.length ? '💾 Salvo! Ainda falta: ' + faltando.join(', ') + '.' : '💾 Personagem pronto! Agora escolha as suas cartas de domínio.', faltando.length ? '' : 'ok', 6000);
  if (!faltando.length) setTimeout(() => abrirPrancheta(estado.voce.id, true), 500);
}
