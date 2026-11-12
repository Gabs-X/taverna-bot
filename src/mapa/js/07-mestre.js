// ---------- Biblioteca do mestre (NPCs e inimigos) ----------
function camposCriatura() {
  const dh = estado.campanha.sistema === 'dh';
  return [
    { k: 'nome', r: 'Nome', t: 'txt', max: 40, obr: true, largo: true, dica: dh ? 'Bandido da Estrada' : 'Goblin' },
    { k: 'tipo', r: 'Tipo', t: 'sel', op: [['npc', '🎭 NPC'], ['inimigo', '👹 Inimigo']], pad: 'npc' },
    num('tamanho', 'Tamanho (casas)', 0.5, 6, 1, { passo: 0.5 }),
    num('pv_max', dh ? 'PV (espaços)' : 'PV', 1, 9999, null),
    num('defesa', dh ? 'Dificuldade' : 'CA', 0, 99, null),
    num('ataque', 'Ataque (bônus)', -20, 50, null),
    ...(dh ? [] : [num('iniciativa', 'Iniciativa (bônus)', -10, 30, null)]),
    txt('dano', 'Dano', 30, { dica: '1d8+2' }),
    ...(dh ? [num('limiar_maior', 'Limiar Maior', 1, 99, null), num('limiar_grave', 'Limiar Grave', 2, 199, null)] : []),
    { k: 'notas', r: 'Notas (só você vê)', t: 'area', max: 1000, largo: true },
  ];
}
let criaturaEditada = null, imagemCriatura = null;
function abrirCriatura(cr, tipo) {
  criaturaEditada = cr || null; imagemCriatura = null;
  $('mc-titulo').textContent = cr ? '✏️ ' + cr.nome : tipo === 'inimigo' ? '👹 Novo inimigo' : '🎭 Novo NPC';
  montarCampos($('mc-form'), camposCriatura(), cr || { tipo: tipo || 'npc' });
  pintarAvatar($('mc-avatar'), cr ? cr.nome : '?', cr && cr.avatar, cr && cr.tipo === 'inimigo' ? '#d63c4f' : null);
  $('mc-tirar').hidden = !(cr && cr.avatar);
  $('mc-apagar').hidden = !cr;
  delete $('mc-apagar').dataset.armado; $('mc-apagar').textContent = '🗑️ Apagar';
  $('modal-criatura').hidden = false;
  setTimeout(() => $('mc-form').elements.nome.focus(), 30);
}
$('mc-arquivo').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return mostrarErro('Use uma imagem PNG, JPG, WEBP ou GIF.');
  try {
    imagemCriatura = await reduzirImagem(f, 512);
    const url = URL.createObjectURL(imagemCriatura);
    pintarAvatar($('mc-avatar'), '?', url);
  } catch (err) { mostrarErro(err.message || 'Não consegui ler essa imagem.'); }
};
$('mc-tirar').onclick = () => {
  if (!criaturaEditada) return;
  post('criatura/imagem/remover', { id: criaturaEditada.id }).then(() => { $('mc-tirar').hidden = true; pintarAvatar($('mc-avatar'), criaturaEditada.nome, null); }).catch(() => {});
};
$('mc-salvar').onclick = async () => {
  const dados = lerCampos($('mc-form'), camposCriatura());
  if (criaturaEditada) dados.id = criaturaEditada.id;
  try {
    const r = await post('criatura', dados);
    if (imagemCriatura) await post('criatura/imagem?id=' + r.id, undefined, { headers: { 'Content-Type': 'application/octet-stream' }, body: imagemCriatura });
    $('modal-criatura').hidden = true;
    aviso(criaturaEditada ? 'Biblioteca atualizada.' : 'Salvo na biblioteca. Arraste para o mapa!', 'ok');
  } catch {}
};
$('mc-form').addEventListener('submit', (e) => { e.preventDefault(); $('mc-salvar').onclick(); });
$('mc-apagar').onclick = () => {
  const b = $('mc-apagar');
  if (!criaturaEditada) return;
  if (!b.dataset.armado) {
    b.dataset.armado = '1';
    b.textContent = criaturaEditada.noMapa ? `Apagar e tirar ${criaturaEditada.noMapa} do mapa?` : 'Clique de novo para apagar';
    setTimeout(() => { delete b.dataset.armado; b.textContent = '🗑️ Apagar'; }, 4000);
    return;
  }
  post('criatura/remover', { id: criaturaEditada.id }).then(() => { $('modal-criatura').hidden = true; aviso('Apagado da biblioteca.', 'ok'); }).catch(() => {});
};
$('nova-npc').onclick = () => abrirCriatura(null, 'npc');
$('nova-inimigo').onclick = () => abrirCriatura(null, 'inimigo');
for (const b of $('filtros').children) b.onclick = () => { filtroLib = b.dataset.f; for (const o of $('filtros').children) o.classList.toggle('on', o === b); painelBiblioteca(); };

function colocarCriatura(id, x, y) {
  post('criatura/colocar', { id, x, y }).then((r) => { aviso(`${r.nome} entrou no mapa.`, 'ok', 2000); }).catch(() => {});
}
/** Centro da tela em coordenadas do mapa: onde cai o personagem posto pelo botão 📍. */
function centroDaTela() {
  const g = estado.mapa.grade, x = (cv.width / 2 - cam.x) / cam.z, y = (cv.height / 2 - cam.y) / cam.z;
  return { x: Math.min(estado.mapa.largura, Math.max(0, prefs.encaixar ? encaixe(x, g, 1, estado.mapa.largura) : x)), y: Math.min(estado.mapa.altura, Math.max(0, prefs.encaixar ? encaixe(y, g, 1, estado.mapa.altura) : y)) };
}

function painelBiblioteca() {
  $('painel-biblioteca').hidden = !estado.voce.mestre;
  if (!estado.voce.mestre) return;
  const caixa = $('biblioteca'); caixa.textContent = '';
  const lista = estado.biblioteca.filter((c) => filtroLib === 'todos' || c.tipo === filtroLib);
  if (!lista.length) caixa.append(el('span', 'mudo', estado.biblioteca.length ? 'Nada neste filtro.' : 'Vazia. Crie NPCs e inimigos para usar nas sessões.'));
  for (const cr of lista) {
    const d = el('div', 'lib-item'); d.draggable = true; d.title = 'Arraste para o mapa';
    d.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-criatura', String(cr.id)); e.dataTransfer.effectAllowed = 'copy'; });
    const av = el('div', 'avatar'); pintarAvatar(av, cr.nome, cr.avatar, cr.tipo === 'inimigo' ? '#d63c4f' : null);
    const info = el('div', 'info');
    const nome = el('div', 'nome', cr.nome); nome.append(el('span', 'tag' + (cr.tipo === 'inimigo' ? ' inimigo' : ''), cr.tipo === 'inimigo' ? 'inimigo' : 'NPC'));
    const detalhes = [cr.pv_max ? cr.pv_max + ' PV' : '', cr.defesa !== null ? nomeDefesa() + ' ' + cr.defesa : '', cr.ataque !== null ? 'atq ' + sinal(cr.ataque) : '', cr.noMapa ? cr.noMapa + ' no mapa' : ''].filter(Boolean).join(' · ');
    info.append(nome, el('small', '', detalhes || 'sem números'));
    const por = el('button', 'mini', '📍'); por.title = 'Pôr no centro da tela'; por.onclick = (e) => { e.stopPropagation(); const c = centroDaTela(); colocarCriatura(cr.id, c.x, c.y); };
    const edt = el('button', 'mini', '✏️'); edt.title = 'Editar'; edt.onclick = (e) => { e.stopPropagation(); abrirCriatura(cr); };
    d.append(av, info, por, edt);
    caixa.append(d);
  }
}
$('editar-criatura').onclick = () => {
  const p = estado.pecas.find((q) => q.id === selecionada), cr = p && estado.biblioteca.find((c) => c.id === p.criaturaId);
  if (cr) abrirCriatura(cr);
};

// Vida de uma cópia: − e + mexem de 1 em 1; no campo, um número fixa o PV e -7 / +5 tiram ou curam.
function mudarPV(corpo) { const p = estado.pecas.find((q) => q.id === selecionada); if (p) post('peca/pv', { peca: p.id, ...corpo }).catch(() => {}); }
$('pv-menos').onclick = () => mudarPV({ delta: -1 });
$('pv-mais').onclick = () => mudarPV({ delta: 1 });
$('pv-valor').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const v = e.target.value.trim().replace(',', '.');
  if (!/^[+-]?\d+$/.test(v)) return mostrarErro('Escreva um número, ou -7 para tirar e +5 para curar.');
  mudarPV(/^[+-]/.test(v) ? { delta: Number(v) } : { valor: Number(v) });
  e.target.blur();
});

// ---------- Combate ----------
const CONDICOES = { caido: '🛌 Caído', envenenado: '🤢 Envenenado', atordoado: '💫 Atordoado', amedrontado: '😱 Amedrontado', contido: '⛓️ Contido',
  vulneravel: '🎯 Vulnerável', escondido: '🫥 Escondido', sangrando: '🩸 Sangrando', inspirado: '✨ Inspirado', concentrado: '🧠 Concentrado' };
const ehDH = () => estado.campanha.sistema === 'dh';

function painelCombate() {
  const cb = estado.combate, box = $('combate');
  $('iniciar-combate').textContent = cb.ativo ? '🏳️ Encerrar combate' : '⚔️ Iniciar combate';
  box.hidden = !cb.ativo;
  document.body.classList.toggle('em-combate', cb.ativo);
  if (!cb.ativo) return;
  box.textContent = '';
  box.append(el('span', 'rodada', `⚔️ Rodada ${cb.rodada}`));
  const dh = ehDH();
  for (const id of cb.ordem) {
    const p = estado.pecas.find((q) => q.id === id); if (!p) continue;
    const chip = el('button', 'chip' + (cb.vez === p.id ? ' vez' : '') + (dh && p.agiu ? ' agiu' : ''));
    const av = el('div', 'avatar'); pintarAvatar(av, p.nome, p.avatar, corDe(p));
    chip.append(av, el('span', '', p.nome));
    if (!dh && p.iniciativa !== null) chip.append(el('b', '', String(p.iniciativa)));
    if (dh && p.agiu) chip.append(el('b', '', '✓'));
    // Mestre: no D&D passa a vez para a peça; no Daggerheart marca quem agiu. Jogador: marca o dele no Daggerheart.
    chip.title = dh ? (estado.voce.mestre || p.meu ? 'Clique para marcar se já agiu nesta rodada' : p.nome) : estado.voce.mestre ? 'Clique para passar a vez para esta peça' : p.nome;
    chip.onclick = () => {
      selecionada = p.id; painel(); desenhar();
      if (dh && (estado.voce.mestre || p.meu)) post('combate/agiu', { peca: p.id, agiu: !p.agiu }).catch(() => {});
      else if (!dh && estado.voce.mestre) post('combate/vez', { peca: p.id }).catch(() => {});
    };
    // Mestre do Daggerheart: duplo clique dá o holofote para a peça (todos veem de quem é a vez).
    if (dh && estado.voce.mestre) { chip.title += ' · duplo clique: dar o holofote'; chip.ondblclick = () => post('combate/vez', { peca: p.id }).catch(() => {}); }
    box.append(chip);
  }
  if (dh && estado.medo !== null) {
    const m = el('span', 'chip medo'); m.append(el('span', '', `😱 Medo ${estado.medo}`));
    if (estado.voce.mestre) for (const [t, d] of [['−', -1], ['+', 1]]) { const b = el('button', 'mini', t); b.onclick = () => post('medo', { delta: d }).catch(() => {}); m.append(b); }
    box.append(m);
  }
  if (estado.voce.mestre) {
    const prox = el('button', 'btn-redondo', '⏭'); prox.title = dh ? 'Nova rodada (N): todos podem agir de novo' : 'Próximo turno (N)';
    prox.onclick = () => post('combate/proximo', {}).catch(() => {});
    const fim = el('button', 'btn-redondo', '🏳️'); fim.title = 'Encerrar o combate';
    fim.onclick = () => post('combate/encerrar', {}).catch(() => {});
    box.append(prox, fim);
  }
}
$('iniciar-combate').onclick = () => post(estado.combate.ativo ? 'combate/encerrar' : 'combate/iniciar', {}).catch(() => {});
$('vida-inimigos').onchange = (e) => post('vida-inimigos', { modo: e.target.value }).catch(() => {});

/** Parte de combate do card da peça: vida, recursos da ficha, condições, iniciativa e o ataque. */
function cardCombate(p) {
  const f = p.ficha || {}, mestre = estado.voce.mestre, podeEditar = mestre || p.meu, dh = ehDH();
  if (!fracPV(p) && p.vida) $('ficha-pv').append(el('small', '', '❤️ ' + p.vida.texto));
  // Recursos da ficha do jogador (o dono e o mestre mexem): PV, Estresse, Esperança, Armadura.
  const rec = $('recursos'); rec.textContent = '';
  if (p.userId && p.ficha && podeEditar && typeof f.pv_max === 'number') {
    const linhas = dh
      ? [['pv', '❤️ PV marcados', f.pv, f.pv_max], ['estresse', '😰 Estresse', f.estresse, f.estresse_max], ['esperanca', '✨ Esperança', f.esperanca, 6], ['armadura', '🛡️ Armadura usada', f.armadura, f.armadura_max]]
      : [['pv_atual', '❤️ PV', f.pv_atual, f.pv_max]];
    for (const [campo, rotulo, v, max] of linhas) {
      if (typeof v !== 'number') continue;
      const d = el('div', 'recurso'); d.append(el('span', 'rot', rotulo));
      const menos = el('button', '', '−'), mais = el('button', '', '+');
      const passo = campo === 'pv_atual' ? 1 : 1;
      menos.onclick = () => post('ficha/recurso', { user: p.userId, campo, delta: -passo }).catch(() => {});
      mais.onclick = () => post('ficha/recurso', { user: p.userId, campo, delta: passo }).catch(() => {});
      d.append(menos, el('b', '', `${v}/${max}`), mais); rec.append(d);
    }
  }
  // Condições: quem pode mudar vê todas para ligar e desligar; os outros veem só as ativas.
  const conds = $('conds'); conds.textContent = '';
  for (const [k, rotulo] of Object.entries(CONDICOES)) {
    const ativa = (p.condicoes || []).includes(k);
    if (podeEditar) { const b = el('button', ativa ? 'on' : '', rotulo); b.onclick = () => post('peca/condicao', { peca: p.id, condicao: k, ligar: !ativa }).catch(() => {}); conds.append(b); }
    else if (ativa) conds.append(el('span', '', rotulo));
  }
  $('rotulo-conds').hidden = !conds.children.length;
  // Status escrito: quem pode mudar edita; os outros só leem.
  $('linha-status').hidden = !podeEditar;
  $('status-ver').hidden = podeEditar || !p.status; $('status-ver').textContent = p.status ? '💬 ' + p.status : '';
  $('rotulo-status').hidden = !podeEditar && !p.status;
  if (podeEditar && document.activeElement !== $('status-texto')) $('status-texto').value = p.status || '';
  $('status-tirar').hidden = !p.status;
  // Iniciativa à mão (D&D, durante o combate).
  $('linha-ini').hidden = !(mestre && estado.combate.ativo && !dh);
  if (!$('linha-ini').hidden && document.activeElement !== $('ini-valor')) $('ini-valor').value = p.iniciativa ?? '';
  montarAtaque(p);
}
$('ini-valor').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !selecionada) return;
  post('combate/iniciativa', { peca: selecionada, valor: e.target.value === '' ? null : Number(e.target.value) }).then(() => e.target.blur()).catch(() => {});
});

const chaveDano = () => 'mapa_dano_' + ID;
function montarAtaque(p) {
  const mestre = estado.voce.mestre, eu = minhaPeca(), dh = ehDH();
  const podeAtacar = mestre ? estado.pecas.some((q) => q.npc && q.id !== p.id) : !!(eu && eu.ficha && !p.meu);
  $('ataque').hidden = !podeAtacar;
  if (!podeAtacar) return;
  // Mestre escolhe quem ataca (as peças dele; começa pela da vez ou pela do "Falar como").
  $('ataque-como-linha').hidden = !mestre;
  if (mestre) {
    const sel = $('ataque-como'), atual = sel.value; sel.textContent = '';
    for (const q of estado.pecas) if (q.npc && q.id !== p.id) sel.append(new Option((q.tipo === 'inimigo' ? '👹 ' : '🎭 ') + q.nome, String(q.id)));
    const preferida = [atual, String(estado.combate.vez), $('como').value].find((v) => [...sel.options].some((o) => o.value === v));
    if (preferida) sel.value = preferida;
  }
  // Jogador do Daggerheart com armas na ficha guiada: escolher a arma preenche traço, dano e bônus.
  const armas = armasDaFicha(eu), selArma = $('ataque-arma');
  selArma.hidden = mestre || !dh || !armas.length;
  if (!selArma.hidden) {
    const atual = selArma.dataset.escolha; selArma.textContent = ''; // a escolha do jogador; sem ela, a arma principal
    for (const a of armas) selArma.append(new Option(`⚔️ ${a.nome} (${danoDaArma(a, eu.ficha.proficiencia || 1)})`, a.id));
    selArma.append(new Option('✍️ Outra (digitar)', ''));
    selArma.value = atual !== undefined && [...selArma.options].some((o) => o.value === atual) ? atual : armas[0].id;
  }
  // Jogador do Daggerheart escolhe o traço; no D&D o bônus já vem (ataque base + Força) e pode ser trocado.
  const tr = $('ataque-traco');
  tr.hidden = mestre || !dh;
  if (!tr.hidden && !tr.options.length) for (const t of TRACOS_DH) tr.append(new Option(`${NOMES[t]} ${sinal(eu.ficha[t] ?? 0)}`, t));
  if (!tr.hidden) for (const o of tr.options) o.textContent = `${NOMES[o.value]} ${sinal(eu.ficha[o.value] ?? 0)}`;
  const bonus = $('ataque-bonus');
  bonus.hidden = !mestre && dh;
  if (document.activeElement !== bonus) bonus.value = '';
  bonus.placeholder = mestre ? 'da biblioteca' : dh ? '' : sinal((eu.ficha.bba || 0) + Math.floor(((eu.ficha.forca || 10) - 10) / 2));
  const dano = $('ataque-dano');
  dano.placeholder = mestre ? 'da biblioteca' : 'dano: 1d8+2';
  if (!mestre && document.activeElement !== dano && !dano.value) { try { dano.value = localStorage.getItem(chaveDano()) || ''; } catch {} }
  if (!selArma.hidden && selArma.value) aplicarArma();
}
/** Armas escolhidas na ficha guiada (principal e secundária). */
function armasDaFicha(p) {
  try { const g = p && p.ficha && p.ficha.guia ? JSON.parse(p.ficha.guia) : null; return g && g.armas ? [g.armas.primaria, g.armas.secundaria].map((id) => ARMA.get(id)).filter(Boolean) : []; } catch { return []; }
}
function aplicarArma() {
  const a = ARMA.get($('ataque-arma').value), eu = minhaPeca();
  $('ataque-traco').disabled = !!a; $('ataque-dano').readOnly = !!a;
  if (!a || !eu || !eu.ficha) return;
  $('ataque-traco').value = a.traco;
  $('ataque-dano').value = danoDaArma(a, eu.ficha.proficiencia || 1);
}
$('ataque-arma').onchange = () => { $('ataque-arma').dataset.escolha = $('ataque-arma').value; if (!$('ataque-arma').value) { $('ataque-dano').value = ''; } aplicarArma(); };
$('atacar').onclick = () => {
  const alvo = selecionada; if (!alvo) return;
  const mestre = estado.voce.mestre, dano = $('ataque-dano').value.trim();
  if (!mestre && !dano) return mostrarErro('Escreva o dano da sua arma (ex.: 1d8+2).');
  if (!mestre) { try { localStorage.setItem(chaveDano(), dano); } catch {} }
  const corpo = { alvo, dano, vantagem: vantagem(), bonus: $('ataque-bonus').value === '' ? null : Number($('ataque-bonus').value) };
  if (mestre) corpo.como = Number($('ataque-como').value);
  else if (ehDH()) {
    corpo.traco = $('ataque-traco').value;
    // Arma com bônus de ataque (Espada Larga: Confiável): manda o total, o traço mais o bônus.
    const a = !$('ataque-arma').hidden && ARMA.get($('ataque-arma').value), eu = minhaPeca();
    if (a && a.ataque && eu && eu.ficha) corpo.bonus = Number(eu.ficha[a.traco] || 0) + a.ataque;
  }
  post('ataque', corpo).then((r) => { if (!prefs.painel) alternar('painel'); abrirAba('chat'); if (r.acertou === false) aviso('Errou!', '', 1800); }).catch(() => {});
};

// ---------- Exploração: névoa, peças escondidas e cenas ----------
let nevoaCache = { sig: '', canvas: null };
/** Uma imagem com 1 pixel por casa (preto onde está coberto), esticada sobre o mapa: rápida mesmo com muitas casas. */
function camadaNevoa() {
  const n = estado && estado.mapa.nevoa; if (!n) return null;
  const sig = n.cols + 'x' + n.rows + ':' + n.bits;
  if (nevoaCache.sig === sig) return nevoaCache.canvas;
  const bin = atob(n.bits), c = document.createElement('canvas'); c.width = n.cols; c.height = n.rows;
  const g = c.getContext('2d'), img = g.createImageData(n.cols, n.rows);
  for (let i = 0; i < n.cols * n.rows; i++) {
    const revelada = (bin.charCodeAt(i >> 3) & (1 << (i & 7))) !== 0;
    img.data[i * 4] = 16; img.data[i * 4 + 1] = 10; img.data[i * 4 + 2] = 6; img.data[i * 4 + 3] = revelada ? 0 : 255;
  }
  g.putImageData(img, 0, 0);
  nevoaCache = { sig, canvas: c };
  return c;
}
function escolherPincel(qual) {
  pincel = pincel === qual ? null : qual;
  if (pincel && usandoRegua) { usandoRegua = false; regua = null; }
  if (pincel && estado && !estado.mapa.nevoa) post('nevoa/ligar', { ligada: true }).then(() => aviso('Névoa ligada: o mapa começa todo coberto para os jogadores.', 'ok')).catch(() => {});
  $('f-revelar').classList.toggle('on', pincel === 'revelar'); $('f-cobrir').classList.toggle('on', pincel === 'cobrir');
  cv.classList.toggle('regua', !!pincel || usandoRegua); aplicarPrefs();
}
$('f-revelar').onclick = () => escolherPincel('revelar');
$('f-cobrir').onclick = () => escolherPincel('cobrir');
$('nevoa-ligada').onchange = (e) => post('nevoa/ligar', { ligada: e.target.checked }).catch(() => {});
$('revelar-tudo').onclick = () => post('nevoa/tudo', { revelar: true }).catch(() => {});
$('cobrir-tudo').onclick = () => post('nevoa/tudo', { revelar: false }).catch(() => {});
$('esconder').onclick = () => {
  const p = estado.pecas.find((q) => q.id === selecionada);
  if (p) post('peca/esconder', { peca: p.id, escondida: !p.escondida }).catch(() => {});
};

function painelCenas() {
  const mestre = estado.voce.mestre;
  $('painel-cenas').hidden = !mestre;
  $('f-revelar').hidden = $('f-cobrir').hidden = !mestre;
  if (!mestre) return;
  $('nevoa-ligada').checked = !!estado.mapa.nevoa;
  const caixa = $('cenas'); caixa.textContent = '';
  if (!estado.cenas.length) caixa.append(el('div', 'mudo', 'Uma cena só por enquanto. Crie outra (taverna, masmorra…) e troque com um clique: todo mundo vai junto.'));
  for (const c of estado.cenas) {
    const d = el('div', 'item' + (c.ativa ? ' sel' : ''));
    const info = el('div', 'info'); info.style.flex = '1';
    info.append(el('div', 'nome', (c.ativa ? '🎬 ' : '') + c.nome), el('small', '', c.ativa ? 'aberta agora' : 'clique para abrir'));
    d.append(info);
    // Trilha da cena: os bardos tocam sozinhos quando ela abre.
    if (estado.musica) {
      const tr = el('select'); tr.title = 'Trilha que toca ao abrir esta cena'; tr.style.width = '118px'; tr.style.flex = 'none';
      tr.append(new Option('Sem trilha', ''));
      for (const a of estado.musica.ambientes) tr.append(new Option(a.nome, a.id));
      tr.value = c.ambiente || '';
      tr.onclick = (e) => e.stopPropagation();
      tr.onchange = () => post('cena/ambiente', { id: c.id, ambiente: tr.value }).catch(() => {});
      d.append(tr);
    }
    if (!c.ativa) d.onclick = () => post('cena/abrir', { id: c.id }).then(() => { selecionada = null; ajustou = false; }).catch(() => {});
    const ren = el('button', 'mini', '✏️'); ren.className = 'btn-redondo'; ren.title = 'Renomear (usa o nome escrito abaixo)';
    ren.onclick = (e) => { e.stopPropagation(); const nome = $('cena-nome').value.trim(); if (!nome) return mostrarErro('Escreva o novo nome no campo abaixo e clique em ✏️.'); post('cena/renomear', { id: c.id, nome }).then(() => ($('cena-nome').value = '')).catch(() => {}); };
    d.append(ren);
    if (!c.ativa) {
      const apagar = el('button', '', '🗑️'); apagar.className = 'btn-redondo'; apagar.title = 'Apagar a cena (clique duas vezes)';
      apagar.onclick = (e) => {
        e.stopPropagation();
        if (!apagar.dataset.armado) { apagar.dataset.armado = '1'; apagar.textContent = '❗'; setTimeout(() => { delete apagar.dataset.armado; apagar.textContent = '🗑️'; }, 3000); return; }
        post('cena/apagar', { id: c.id }).catch(() => {});
      };
      d.append(apagar);
    }
    caixa.append(d);
  }
}
$('nova-cena').onclick = () => {
  const nome = $('cena-nome').value.trim();
  if (!nome) return mostrarErro('Dê um nome para a cena.');
  post('cena/nova', { nome }).then(() => { $('cena-nome').value = ''; selecionada = null; ajustou = false; aviso(`Cena "${nome}" aberta. Importe o mapa dela.`, 'ok'); }).catch(() => {});
};

// ---------- Imersão: música, handouts e ping ----------
let handoutVisto = null;
const pings = [];
function abrirHandout(h) {
  $('mh-titulo').textContent = '📜 ' + h.titulo;
  $('mh-img').src = h.url;
  $('modal-handout').hidden = false;
}
function painelImersao() {
  const mestre = estado.voce.mestre;
  // O handout que o mestre mostra abre sozinho na tela de todos (uma vez; dá para reabrir pela lista).
  const h = estado.handout;
  if (h && h.id !== handoutVisto) { handoutVisto = h.id; if (!mestre) abrirHandout(h); }
  if (!h) handoutVisto = null;
  $('painel-handouts').hidden = !mestre && !estado.handouts.length;
  $('linha-novo-handout').hidden = !mestre;
  const lista = $('handouts'); lista.textContent = '';
  for (const ho of estado.handouts) {
    const naTela = !!(h && h.id === ho.id);
    const d = el('div', 'item' + (naTela ? ' sel' : ''));
    const info = el('div'); info.style.flex = '1'; info.append(el('div', 'nome', '📜 ' + ho.titulo), el('small', '', naTela ? 'na tela da mesa agora' : 'clique para ver'));
    d.append(info); d.onclick = () => abrirHandout(ho);
    if (mestre) {
      const mostrar = el('button', 'btn-redondo', naTela ? '🙈' : '📢');
      mostrar.title = naTela ? 'Tirar da tela da mesa' : 'Mostrar à mesa';
      mostrar.onclick = (e) => { e.stopPropagation(); post('handout/mostrar', { id: naTela ? null : ho.id }).catch(() => {}); };
      const apagar = el('button', 'btn-redondo', '🗑️'); apagar.title = 'Apagar (clique duas vezes)';
      apagar.onclick = (e) => {
        e.stopPropagation();
        if (!apagar.dataset.armado) { apagar.dataset.armado = '1'; apagar.textContent = '❗'; setTimeout(() => { delete apagar.dataset.armado; apagar.textContent = '🗑️'; }, 3000); return; }
        post('handout/apagar', { id: ho.id }).catch(() => {});
      };
      d.append(mostrar, apagar);
    }
    lista.append(d);
  }
  if (!estado.handouts.length && mestre) lista.append(el('div', 'mudo', 'Mostre uma imagem na tela de todos: carta, mapa do tesouro, retrato do vilão.'));

  // Música da mesa (só o mestre controla; quem toca são os bardos, no PC de casa).
  const m = estado.musica;
  $('painel-musica').hidden = !mestre || !m;
  if (!mestre || !m) return;
  $('musica-status').textContent = !m.ponte ? '🔌 Os bardos estão sem ligação com o mapa (o PC da música está desligado?).'
    : !m.temCall ? '🔇 A mesa ainda não tem call: abra a sessão com /sessao iniciar.'
    : m.fila ? `🎶 ${m.fila.bardo}: ${m.fila.titulo || '…'}${m.fila.pausado ? ' (pausado)' : ''}` : '🎶 Nada tocando na call da mesa.';
  const trilhas = $('musica-trilhas');
  if (!trilhas.children.length) for (const a of m.ambientes) { const b = el('button', '', a.nome); b.dataset.id = a.id; b.onclick = () => musica({ acao: 'ambiente', tipo: a.id }); trilhas.append(b); }
  for (const b of trilhas.children) b.classList.toggle('on', !!(m.fila && m.fila.ambiente === b.dataset.id));
  if (m.fila && document.activeElement !== $('musica-volume')) $('musica-volume').value = m.fila.volume;
}
function musica(corpo) { return post('musica', corpo).then((r) => aviso(r.msg, 'ok', 2500)).catch(() => {}); }
for (const b of document.querySelectorAll('[data-musica]')) b.onclick = () => musica({ acao: b.dataset.musica });
$('musica-tocar').onclick = () => {
  const v = $('musica-busca').value.trim();
  if (!v) return mostrarErro('Escreva o nome da música ou cole o link.');
  musica({ acao: 'tocar', busca: v }).then(() => ($('musica-busca').value = ''));
};
$('musica-busca').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('musica-tocar').onclick(); } });
$('musica-volume').onchange = (e) => musica({ acao: 'volume', volume: Number(e.target.value) });
$('handout-arquivo').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return mostrarErro('Use uma imagem PNG, JPG, WEBP ou GIF.');
  try {
    const { blob } = await prepararImagem(f);
    const titulo = $('handout-titulo').value.trim() || f.name.replace(/\.[^.]+$/, '');
    await post('handout?titulo=' + encodeURIComponent(titulo), undefined, { headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
    $('handout-titulo').value = ''; aviso('Handout na tela da mesa!', 'ok');
  } catch (err) { if (err && err.message && !/^(Não deu|Só o|Use uma|Imagem)/.test(err.message)) mostrarErro(err.message); }
};

// Ping: botão do meio (ou Alt + clique) no mapa mostra um "olha aqui" para todos.
let ultimoPing = 0;
function pingar(pt) {
  if (Date.now() - ultimoPing < 650) return;
  ultimoPing = Date.now();
  receberPing({ x: pt.x, y: pt.y, quem: estado.voce.id }); // o meu aparece na hora
  fetch(api('ping'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: pt.x, y: pt.y }) }).catch(() => {});
}
// Pings e efeitos chegam pelo tempo real e, de reserva, pela busca a cada segundo: o número (seq) evita repetir.
const efeitosVistos = new Set();
let seqEfeitos = -1;
function aplicarEfeito(tipo, texto) {
  let d; try { d = JSON.parse(texto); } catch { return; }
  if (d.seq) { if (efeitosVistos.has(d.seq)) return; efeitosVistos.add(d.seq); if (efeitosVistos.size > 600) efeitosVistos.delete(efeitosVistos.values().next().value); }
  if (tipo === 'ping') { if (d.quem !== estado.voce.id) receberPing(d); } else receberEfeito(d);
}
