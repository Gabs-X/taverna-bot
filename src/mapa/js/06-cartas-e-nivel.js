// ---------- Prancheta de cartas ----------
let pranchetaDe = null, catalogoAberto = false, filtroCatalogo = { tipo: 'dominio', so: true, busca: '' }, opcoesCartas = null;
const pecaDoJogador = (u) => estado && estado.pecas.find((p) => p.userId === u);
async function abrirPrancheta(userId, catalogo) {
  try { await carregarCatalogo(); } catch { return; }
  pranchetaDe = userId || estado.voce.id; catalogoAberto = !!catalogo; opcoesCartas = null;
  $('modal-cartas').hidden = false;
  await desenharPrancheta();
}
async function desenharPrancheta() {
  if ($('modal-cartas').hidden) return;
  const p = pecaDoJogador(pranchetaDe), pr = p && p.prancheta, corpo = $('pr-corpo');
  $('pr-titulo').textContent = '🃏 Cartas de ' + (p ? p.nome : '…');
  corpo.textContent = '';
  if (!p || !pr) { corpo.append(el('p', 'mudo', 'Este personagem ainda não tem ficha.')); return; }
  const l = pr.limites, souDono = pranchetaDe === estado.voce.id;
  const topo = el('div', 'pr-topo');
  const med = (txt, cheio) => el('span', 'medidor' + (cheio ? ' cheio' : ''), txt);
  topo.append(med(`Domínio ${l.dominio.tem}/${l.dominio.max}`, l.dominio.tem >= l.dominio.max), med(`Carregamento ${l.carregamento.tem}/${l.carregamento.max}`, l.carregamento.tem >= l.carregamento.max));
  for (const d of l.dominios) { const ch = el('span', 'chip-dom', catalogoCartas.dominios[d].nome); ch.style.background = catalogoCartas.dominios[d].cor; topo.append(ch); }
  for (const d of pr.tocados) topo.append(el('span', 'tocado', '✨ Tocado: ' + catalogoCartas.dominios[d].nome));
  topo.append(el('span', 'esp'));
  if (estado.voce.mestre) {
    const ex = el('span', 'contador'), m = el('button', '', '−'), s = el('button', '', '+'); m.type = s.type = 'button';
    m.onclick = () => post('cartas/extras', { user: pranchetaDe, delta: -1 }).then(desenharPrancheta).catch(() => {});
    s.onclick = () => post('cartas/extras', { user: pranchetaDe, delta: 1 }).then(desenharPrancheta).catch(() => {});
    ex.append(document.createTextNode('Cartas extras'), m, el('b', '', String(pr.extras)), s); topo.append(ex);
  }
  const desc = el('button', 'btn sec', '🏕️ Descanso'); desc.type = 'button'; desc.title = 'Volta as cartas usadas';
  desc.onclick = () => post('cartas/descanso', { user: pranchetaDe }).then(() => aviso('🏕️ Cartas prontas de novo.', 'ok', 2500)).catch(() => {});
  const cat = el('button', 'btn', catalogoAberto ? '🃏 Ver a prancheta' : '＋ Escolher cartas'); cat.type = 'button';
  cat.onclick = () => { catalogoAberto = !catalogoAberto; opcoesCartas = null; desenharPrancheta(); };
  topo.append(desc, cat);
  corpo.append(topo);
  if (!l.classe) corpo.append(el('p', 'ajuda', '⚠️ A classe da ficha não é uma das classes do livro, então as cartas de domínio não aparecem. Abra a ficha e escolha a classe.'));
  if (catalogoAberto) return desenharCatalogo(corpo, pr);

  const daBase = (tipo) => pr.minhas.filter((m) => (catalogoCartas.mapa.get(m.carta) || {}).tipo === tipo);
  // Origem e subclasse
  const sec1 = el('div', 'pr-secao'); sec1.append(el('div', 'titulo', 'Origem e subclasse'));
  const linha1 = el('div', 'pr-linha');
  const grupo = (rotulo, cartas, vagas, dica) => {
    const g = el('div', 'pr-grupo'); g.append(el('small', '', rotulo));
    const fila = el('div', 'pr-linha');
    for (const m of cartas) fila.append(cartaNaPrancheta(m));
    const nomesSub = ['Fundação', 'Especialização (nível 5)', 'Maestria (nível 8)'];
    for (let i = cartas.length; i < vagas; i++) { const v = vagaVazia(dica); if (dica === null) v.textContent = nomesSub[i]; fila.append(v); }
    g.append(fila); return g;
  };
  linha1.append(grupo('Ancestralidade', daBase('ancestralidade'), 1, 'Ancestralidade'), grupo('Comunidade', daBase('comunidade'), 1, 'Comunidade'));
  const subs = daBase('subclasse').sort((a, b) => ['fundacao', 'especializacao', 'maestria'].indexOf(catalogoCartas.mapa.get(a.carta).estagio) - ['fundacao', 'especializacao', 'maestria'].indexOf(catalogoCartas.mapa.get(b.carta).estagio));
  linha1.append(grupo('Subclasse', subs, 3, null));
  sec1.append(linha1); corpo.append(sec1);
  // Carregamento
  const sec2 = el('div', 'pr-secao'); sec2.append(el('div', 'titulo', `Carregamento (${l.carregamento.tem}/5)`));
  const car = el('div', 'pr-linha'); car.dataset.zona = 'carregamento';
  const naMao = pr.minhas.filter((m) => m.lugar === 'carregamento');
  for (const m of naMao) car.append(cartaNaPrancheta(m));
  for (let i = naMao.length; i < 5; i++) car.append(vagaVazia('Carta de domínio'));
  zonaDeSoltar(car, 'carregamento'); sec2.append(car); corpo.append(sec2);
  // Cofre
  const sec3 = el('div', 'pr-secao'); sec3.append(el('div', 'titulo', 'Cofre'));
  const cofre = el('div', 'cofre');
  const guardadas = pr.minhas.filter((m) => m.lugar === 'cofre');
  for (const m of guardadas) cofre.append(cartaNaPrancheta(m));
  if (!guardadas.length) { const v = el('div', 'mudo', 'Arraste cartas para cá para guardar. Trazer de volta custa Estresse (no descanso, de graça).'); v.style.gridColumn = '1 / -1'; cofre.append(v); }
  zonaDeSoltar(cofre, 'cofre'); sec3.append(cofre); corpo.append(sec3);
  if (souDono && l.dominio.tem < l.dominio.max && l.classe) corpo.append(el('p', 'ajuda', `✨ Você ainda pode escolher ${l.dominio.max - l.dominio.tem} carta(s) de domínio. Clique em "＋ Escolher cartas".`));
}
function vagaVazia(dica) {
  const v = el('div', 'vaga', dica || '');
  if (dica === 'Carta de domínio' || dica === 'Ancestralidade' || dica === 'Comunidade' || dica === null) {
    v.style.cursor = 'pointer'; v.title = 'Escolher';
    v.onclick = () => { catalogoAberto = true; filtroCatalogo.tipo = dica === 'Ancestralidade' ? 'ancestralidade' : dica === 'Comunidade' ? 'comunidade' : dica === null ? 'subclasse' : 'dominio'; desenharPrancheta(); };
  }
  return v;
}
function cartaNaPrancheta(m) {
  const c = catalogoCartas.mapa.get(m.carta), d = el('div', 'carta-pr' + (m.usada ? ' usada' : ''));
  d.append(desenhoCarta(c));
  if (c.tipo === 'dominio' && m.lugar === 'cofre' && c.custo) d.append(el('span', 'custo', c.custo + '⚡'));
  d.title = c.nome;
  d.onclick = () => zoomCarta(c, m);
  if (c.tipo === 'dominio') {
    d.draggable = true;
    d.ondragstart = (e) => { e.dataTransfer.setData('text/carta', c.id); d.classList.add('arrastando'); };
    d.ondragend = () => d.classList.remove('arrastando');
  }
  return d;
}
function zonaDeSoltar(zona, lugar) {
  zona.ondragover = (e) => { if ([...e.dataTransfer.types].includes('text/carta')) { e.preventDefault(); zona.classList.add('alvo'); } };
  zona.ondragleave = () => zona.classList.remove('alvo');
  zona.ondrop = (e) => { e.preventDefault(); zona.classList.remove('alvo'); const id = e.dataTransfer.getData('text/carta'); if (id) moverCartaPara(id, lugar, false); };
}
function moverCartaPara(id, lugar, descanso) {
  return post('cartas/mover', { user: pranchetaDe, carta: id, para: lugar, descanso }).then((r) => { if (r.estresse) aviso(`⚡ Marcou ${r.estresse} de Estresse para trazer a carta.`, '', 3000); }).catch(() => {});
}
/** A carta em destaque, com o que dá para fazer com ela. */
function zoomCarta(c, m) {
  const velho = $('carta-zoom'); if (velho) velho.remove();
  const z = el('div'); z.id = 'carta-zoom';
  const box = el('div', 'zoom'), grande = desenhoCarta(c, true);
  grande.onclick = (e) => { e.stopPropagation(); z.classList.toggle('ampliada'); };
  box.append(grande);
  const ac = el('div', 'acoes-z'); ac.append(el('h3', '', c.nome));
  if (grande.tagName === 'IMG') ac.append(el('span', 'dica-zoom', 'Clique na carta para ampliar mais · clique fora para voltar'));
  const info = c.tipo === 'dominio' ? `${catalogoCartas.dominios[c.dominio].nome} · nível ${c.nivel} · ${c.natureza} · recuperar custa ${c.custo} de Estresse` : c.tipo === 'subclasse' ? catalogoCartas.estagios[c.estagio].nome : c.tipo === 'ancestralidade' ? 'Ancestralidade' : 'Comunidade';
  ac.append(el('small', '', info));
  const pode = m && pranchetaDe && (pranchetaDe === estado.voce.id || estado.voce.mestre);
  const botao = (txt, cls, fn) => { const b = el('button', 'btn ' + cls, txt); b.type = 'button'; b.onclick = () => { fn(); z.remove(); }; ac.append(b); };
  if (pode) {
    if (m.lugar !== 'cofre') botao(m.usada ? '🃏 Usar de novo' : '🃏 Usar (mostra à mesa)', '', () => post('cartas/usar', { user: pranchetaDe, carta: c.id }).catch(() => {}));
    if (m.usada) botao('↺ Marcar como pronta', 'sec', () => post('cartas/recarregar', { user: pranchetaDe, carta: c.id }).catch(() => {}));
    if (c.tipo === 'dominio' && m.lugar === 'carregamento') botao('📦 Guardar no Cofre', 'sec', () => moverCartaPara(c.id, 'cofre', false));
    if (c.tipo === 'dominio' && m.lugar === 'cofre') {
      const desc = el('label', 'escondida'); const cx = el('input'); cx.type = 'checkbox'; desc.append(cx, document.createTextNode(' Estou descansando (de graça)'));
      botao(`⬆️ Trazer para o Carregamento (${c.custo}⚡)`, '', () => moverCartaPara(c.id, 'carregamento', cx.checked));
      ac.append(desc);
    }
    botao('🗑️ Tirar da prancheta', 'perigo', () => post('cartas/tirar', { user: pranchetaDe, carta: c.id }).catch(() => {}));
  }
  const fechar = el('button', 'btn sec', 'Fechar'); fechar.type = 'button'; fechar.onclick = () => z.remove(); ac.append(fechar);
  box.append(ac); z.append(box);
  z.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#carta-zoom img, #carta-zoom .carta-texto, #carta-zoom .acoes-z')) return;
    if (z.classList.contains('ampliada')) z.classList.remove('ampliada'); else z.remove();
  });
  document.body.append(z);
}
async function desenharCatalogo(corpo, pr) {
  if (!opcoesCartas) { try { opcoesCartas = await pegar('cartas/opcoes/' + pranchetaDe); } catch { return; } }
  const filtros = el('div', 'catalogo-filtros'), abas = el('div', 'filtros');
  for (const [k, n] of [['dominio', 'Domínio'], ['subclasse', 'Subclasse'], ['ancestralidade', 'Ancestralidade'], ['comunidade', 'Comunidade']]) {
    const b = el('button', filtroCatalogo.tipo === k ? 'on' : '', n); b.type = 'button'; b.onclick = () => { filtroCatalogo.tipo = k; desenharPrancheta(); }; abas.append(b);
  }
  const so = el('label', 'escondida'); so.style.color = 'var(--tinta)'; const cx = el('input'); cx.type = 'checkbox'; cx.checked = filtroCatalogo.so;
  cx.onchange = () => { filtroCatalogo.so = cx.checked; desenharPrancheta(); }; so.append(cx, document.createTextNode(' Só o que posso pegar'));
  const busca = el('input'); busca.type = 'text'; busca.placeholder = '🔎 Nome da carta'; busca.value = filtroCatalogo.busca;
  busca.oninput = () => { filtroCatalogo.busca = busca.value; clearTimeout(busca._t); busca._t = setTimeout(() => { desenharPrancheta().then(() => { const b = document.querySelector('.catalogo-filtros input[type=text]'); if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); } }); }, 250); };
  filtros.append(abas, so, busca); corpo.append(filtros);
  const tem = new Set(pr.minhas.map((m) => m.carta)), q = semAcento(filtroCatalogo.busca.trim());
  const lista = catalogoCartas.cartas.filter((c) => c.tipo === filtroCatalogo.tipo)
    .filter((c) => !q || semAcento(c.nome).includes(q))
    .filter((c) => !filtroCatalogo.so || !opcoesCartas.motivos[c.id] || tem.has(c.id))
    .sort((a, b) => (a.nivel || 0) - (b.nivel || 0) || a.nome.localeCompare(b.nome));
  const grade = el('div', 'catalogo');
  for (const c of lista) {
    const motivo = opcoesCartas.motivos[c.id], minha = tem.has(c.id);
    const b = el('button', 'cat-carta' + (motivo && !minha ? ' bloq' : '')); b.type = 'button'; b.title = motivo || c.nome;
    b.append(desenhoCarta(c), lupa(c));
    if (minha) b.append(el('span', 'tem', '✓ na prancheta'));
    else if (motivo) b.append(el('span', 'motivo', motivo));
    b.onclick = () => {
      if (minha || motivo) return zoomCarta(c, minha ? pr.minhas.find((m) => m.carta === c.id) : null);
      post('cartas/escolher', { user: pranchetaDe, carta: c.id }).then((r) => { opcoesCartas = null; aviso(`🃏 ${c.nome} foi para ${r.lugar === 'carregamento' ? 'o Carregamento' : r.lugar === 'cofre' ? 'o Cofre' : 'a prancheta'}.`, 'ok', 2500); }).catch(() => {});
    };
    b.oncontextmenu = (e) => { e.preventDefault(); zoomCarta(c, null); };
    grade.append(b);
  }
  if (!lista.length) grade.append(el('p', 'mudo', filtroCatalogo.so ? 'Nenhuma carta disponível agora. Desmarque "Só o que posso pegar" para ver todas e o porquê.' : 'Nada encontrado.'));
  corpo.append(grade);
}

// ---------- Subir de nível (livro p. 24) ----------
// Em todo nível: limiares +1 (pelo nível) e uma carta de domínio a mais. Nos níveis 2, 5 e 8: +1 Experiência (+2) e
// +1 de Proficiência; no 5 e no 8 as marcas dos traços se apagam. E o jogador escolhe dois avanços do patamar.
const AVANCOS = [
  { k: 'tracos', nome: '+1 em dois traços não marcados', det: 'Os dois ficam marcados até o nível 5 (ou 8).', max: 3 },
  { k: 'pv', nome: '+1 espaço de Pontos de Vida', max: 2 },
  { k: 'estresse', nome: '+1 espaço de Estresse', max: 2 },
  { k: 'experiencias', nome: '+1 em duas Experiências', max: 1 },
  { k: 'carta', nome: 'Uma carta de domínio extra', det: 'Do seu nível ou menor, dos domínios da sua classe.', max: 1 },
  { k: 'evasao', nome: '+1 de Evasão', max: 1 },
  { k: 'subclasse', nome: 'Carta de subclasse melhorada', det: 'Especialização a partir do nível 5 e Maestria a partir do 8 (na prancheta).', max: 1, desde: 3 },
  { k: 'proficiencia', nome: '+1 de Proficiência', det: 'Ocupa os dois avanços deste nível.', max: 1, desde: 3, custo: 2 },
];
const patamar = (n) => (n <= 1 ? 1 : n <= 4 ? 2 : n <= 7 ? 3 : 4);
let subida = null;
async function abrirSubirNivel() {
  const p = minhaPeca(); if (!p || !p.ficha) return;
  try { await carregarCatalogo(); } catch { return; }
  const g = novoGuia(p);
  if (!g.classe) { aviso('Esta ficha foi feita à mão: abra a ficha e use a criação guiada para subir de nível automaticamente.', 'erro', 7000); return; }
  const novo = Number(g.nivel) + 1;
  if (novo > 10) return aviso('O personagem já está no nível 10.', 'ok');
  subida = { g, novo, escolhas: [], tracos: [], exps: [], novaExp: '' };
  $('mn-titulo').textContent = '⬆️ ' + g.nome + ': nível ' + g.nivel + ' → ' + novo;
  $('mn-sub').textContent = 'Patamar ' + patamar(novo) + ' · escolha 2 avanços · o resto é automático';
  desenharSubida();
  $('modal-nivel').hidden = false;
}
function usosNoPatamar(g, k, t) { return g.historico.filter((h) => patamar(h.nivel) === t).reduce((n, h) => n + h.avancos.filter((a) => a === k).length, 0); }
function desenharSubida() {
  const { g, novo } = subida, t = patamar(novo), corpo = $('mn-corpo'), marco = novo === 2 || novo === 5 || novo === 8;
  corpo.textContent = '';
  const depois = calcularGuia({ ...g, nivel: novo });
  corpo.append(el('div', 'rotulo-sec', 'O que vem sozinho'));
  const ganhos = el('div', 'ganhos');
  const ganho = (titulo, txt) => { const d = el('div', 'ganho'); d.append(el('b', '', titulo), document.createTextNode(txt)); ganhos.append(d); };
  ganho('Limiares', `${calcularGuia(g).limiar_maior}/${calcularGuia(g).limiar_grave} → ${depois.limiar_maior}/${depois.limiar_grave}`);
  ganho('Carta de domínio', 'mais uma, até o nível ' + novo + ' (escolha na prancheta)');
  if (marco) ganho('Proficiência', `${calcularGuia(g).proficiencia} → ${depois.proficiencia} (o dano rola mais um dado)`);
  if (novo === 5 || novo === 8) ganho('Traços', 'as marcas se apagam: dá para subir qualquer traço de novo');
  corpo.append(ganhos);
  if (marco) {
    const c = el('label', 'campo largo'); c.append(document.createTextNode('Nova Experiência (+2) *'));
    const i = el('input'); i.type = 'text'; i.maxLength = 40; i.placeholder = 'ex.: Veterano de Guerra'; i.value = subida.novaExp; i.oninput = () => { subida.novaExp = i.value; };
    c.append(i); corpo.append(c);
  }
  const usados = subida.escolhas.reduce((n, k) => n + (AVANCOS.find((a) => a.k === k).custo || 1), 0);
  const tit = el('div', 'rotulo-sec', 'Escolha dois avanços'); tit.append(el('span', 'slots', usados + '/2')); corpo.append(tit);
  const marcadosAgora = novo === 5 || novo === 8 ? [] : g.marcados;
  for (const a of AVANCOS) {
    const usos = usosNoPatamar(g, a.k, t), escolhido = subida.escolhas.includes(a.k);
    let bloqueio = null;
    if (a.desde && t < a.desde) bloqueio = 'a partir do nível 5';
    else if (usos >= a.max) bloqueio = 'já usado ' + usos + 'x neste patamar';
    else if (!escolhido && usados + (a.custo || 1) > 2) bloqueio = 'sem avanço sobrando';
    const b = el('button', 'avanco-op' + (escolhido ? ' sel' : '')); b.type = 'button'; b.disabled = !!bloqueio && !escolhido;
    const txt = el('div'); txt.append(document.createTextNode(a.nome)); if (a.det) txt.append(el('span', 'det', a.det));
    b.append(el('span', 'marca', escolhido ? '✓' : ''), txt, el('span', 'usos', bloqueio || `${usos}/${a.max} no patamar`));
    b.onclick = () => { subida.escolhas = escolhido ? subida.escolhas.filter((k) => k !== a.k) : [...subida.escolhas, a.k]; desenharSubida(); };
    corpo.append(b);
    if (escolhido && a.k === 'tracos') {
      const ex = el('div', 'escolha-extra');
      for (const tr of TRACOS_DH) {
        const on = subida.tracos.includes(tr), marcado = marcadosAgora.includes(tr);
        const bt = el('button', on ? 'on' : '', NOMES[tr] + ' ' + sinal(calcularGuia(g).tracos[tr])); bt.type = 'button'; bt.disabled = marcado; if (marcado) bt.title = 'Marcado: libera no nível 5 ou 8';
        bt.onclick = () => { subida.tracos = on ? subida.tracos.filter((x) => x !== tr) : [...subida.tracos, tr].slice(-2); desenharSubida(); };
        ex.append(bt);
      }
      corpo.append(ex);
    }
    if (escolhido && a.k === 'experiencias') {
      const ex = el('div', 'escolha-extra');
      g.experiencias.filter((e) => String(e.nome || '').trim()).forEach((e, i) => {
        const on = subida.exps.includes(i), bt = el('button', on ? 'on' : '', e.nome + ' +' + (e.bonus || 2)); bt.type = 'button';
        bt.onclick = () => { subida.exps = on ? subida.exps.filter((x) => x !== i) : [...subida.exps, i].slice(-2); desenharSubida(); };
        ex.append(bt);
      });
      corpo.append(ex);
    }
  }
  const nav = el('div', 'guia-nav');
  if (estado.livro) { const lv = el('button', 'btn sec', '📖 Avanços (p. 24)'); lv.type = 'button'; lv.onclick = () => abrirLivro(24); nav.append(lv); }
  nav.append(el('span', 'esp'));
  const ok = el('button', 'btn', '⬆️ Subir para o nível ' + novo); ok.type = 'button'; ok.onclick = () => confirmarSubida().catch(() => {});
  nav.append(ok); corpo.append(nav);
}
async function confirmarSubida() {
  const { g, novo } = subida, marco = novo === 2 || novo === 5 || novo === 8;
  const usados = subida.escolhas.reduce((n, k) => n + (AVANCOS.find((a) => a.k === k).custo || 1), 0);
  if (usados !== 2) return aviso('Escolha dois avanços (a Proficiência conta como os dois).', 'erro');
  if (subida.escolhas.includes('tracos') && subida.tracos.length !== 2) return aviso('Escolha os dois traços que sobem.', 'erro');
  if (subida.escolhas.includes('experiencias') && subida.exps.length !== 2) return aviso('Escolha as duas Experiências que sobem.', 'erro');
  if (marco && !subida.novaExp.trim()) return aviso('Dê um nome para a nova Experiência.', 'erro');
  if (novo === 5 || novo === 8) g.marcados = [];
  for (const k of subida.escolhas) {
    if (k === 'tracos') for (const tr of subida.tracos) { g.avancoTracos[tr] = (Number(g.avancoTracos[tr]) || 0) + 1; g.marcados = [...new Set([...g.marcados, tr])]; }
    if (k === 'pv') g.extras.pv = (Number(g.extras.pv) || 0) + 1;
    if (k === 'estresse') g.extras.estresse = (Number(g.extras.estresse) || 0) + 1;
    if (k === 'evasao') g.extras.evasao = (Number(g.extras.evasao) || 0) + 1;
    if (k === 'proficiencia') g.extras.proficiencia = (Number(g.extras.proficiencia) || 0) + 1;
    if (k === 'carta') g.cartasAvanco = (Number(g.cartasAvanco) || 0) + 1;
    if (k === 'experiencias') { const nomeadas = g.experiencias.filter((e) => String(e.nome || '').trim()); for (const i of subida.exps) if (nomeadas[i]) nomeadas[i].bonus = (Number(nomeadas[i].bonus) || 2) + 1; }
  }
  if (marco) g.experiencias = [...g.experiencias.filter((e) => String(e.nome || '').trim()), { nome: subida.novaExp.trim(), bonus: 2 }];
  g.historico = [...g.historico, { nivel: novo, avancos: [...subida.escolhas] }];
  g.nivel = novo;
  await post('ficha', dadosDaGuia(g));
  const nomes = subida.escolhas.map((k) => AVANCOS.find((a) => a.k === k).nome.replace(/^\+1 /, '+1 ')).join(' e ');
  await post('chat', { texto: `⬆️ ${g.nome} subiu para o nível ${novo}! (${nomes})` }).catch(() => {});
  $('modal-nivel').hidden = true;
  aviso('⬆️ Nível ' + novo + '! Escolha a nova carta de domínio na prancheta.', 'ok', 6000);
  setTimeout(() => abrirPrancheta(estado.voce.id, true), 600);
}
$('subir-nivel').onclick = abrirSubirNivel;

$('ver-cartas').onclick = () => { const p = estado.pecas.find((q) => q.id === selecionada); if (p && p.userId) abrirPrancheta(p.userId); };
$('minhas-cartas').onclick = () => abrirPrancheta(estado.voce.id);
// Esc fecha a carta em destaque antes das janelas.
addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('carta-zoom')) { e.preventDefault(); e.stopImmediatePropagation(); $('carta-zoom').remove(); } }, true);

function painelMeu() {
  const p = minhaPeca();
  $('painel-meu').hidden = !p;
  if (!p) return;
  pintarAvatar($('meu-avatar'), p.nome, p.avatar, corDe(p));
  $('meu-nome').textContent = p.ficha ? p.nome : 'Personagem ainda não criado';
  $('minhas-cartas').hidden = !(estado.campanha.sistema === 'dh' && p.ficha);
  $('subir-nivel').hidden = !(estado.campanha.sistema === 'dh' && p.ficha && p.ficha.guia && Number(p.ficha.nivel) < 10);
  if (!$('subir-nivel').hidden) $('subir-nivel').textContent = '⬆️ Nível ' + (Number(p.ficha.nivel) + 1);
  $('meu-sub').textContent = p.ficha ? [p.ficha.classe, p.ficha.nivel ? 'nível ' + p.ficha.nivel : ''].filter(Boolean).join(' · ') : 'Crie a ficha e escolha a foto';
  $('abrir-ficha').textContent = p.ficha ? '✏️ Ficha e foto' : '✨ Criar meu personagem';
  $('meu-resumo').onclick = () => { selecionada = p.id; centralizar(p); painel(); desenhar(); };
}
