// ---------- Barra de ícones (funções da mesa espalhadas pela tela) ----------
const DOCK = [
  { k: 'meu', ico: '🧙', nome: 'Meu personagem', secs: ['painel-meu'] },
  { k: 'cartas', ico: '🃏', nome: 'Cartas (C)', acao: () => abrirPrancheta(estado.voce.id), ver: () => estado.campanha.sistema === 'dh' && !!(minhaPeca() && minhaPeca().ficha) },
  { k: 'descanso', ico: '🏕️', nome: 'Descansar', acao: () => abrirDescanso(), ver: () => estado.campanha.sistema === 'dh' && !!(minhaPeca() && minhaPeca().ficha) },
  { k: 'livro', ico: '📖', nome: 'Livro de regras (L)', acao: () => abrirLivro(), ver: () => !!estado.livro },
  { k: 'grupo', ico: '💰', nome: 'Grupo: ouro e inventário', secs: ['painel-grupo'] },
  { k: 'personagens', ico: '👥', nome: 'Personagens', secs: ['painel-personagens'] },
  { k: 'diario', ico: '📜', nome: 'Diário da campanha', secs: ['painel-diario'] },
  { k: 'pedir', ico: '🎶', nome: 'Pedir música ao mestre', secs: ['painel-pedir'] },
  { sep: 'Mestre' },
  { k: 'mesa', ico: '🗺️', nome: 'Mesa: mapa, combate e livro', secs: ['painel-mestre', 'painel-livro'] },
  { k: 'cenas', ico: '🎬', nome: 'Cenas e névoa', secs: ['painel-cenas'] },
  { k: 'biblioteca', ico: '👹', nome: 'NPCs e inimigos', secs: ['painel-biblioteca'] },
  { k: 'musica', ico: '🎵', nome: 'Música da mesa', secs: ['painel-musica'] },
  { k: 'handouts', ico: '🖼️', nome: 'Handouts', secs: ['painel-handouts'] },
  { k: 'efeitos', ico: '✨', nome: 'Efeitos de tela e sons', secs: ['painel-efeitos'] },
  { k: 'elementos', ico: '🧱', nome: 'Elementos e desenhos', secs: ['painel-elementos'] },
  { k: 'relogios', ico: '⏳', nome: 'Relógios de progresso', secs: ['painel-relogios'] },
  { k: 'roteiro', ico: '📋', nome: 'Roteiro da sessão', secs: ['painel-roteiro'] },
  { k: 'bestiario', ico: '📚', nome: 'Bestiário e encontros', acao: () => abrirBestiario(), ver: () => !!estado.temBestiario },
];
let gavetaAberta = null;
(function montarDock() {
  for (const sec of [...$('aba-mesa').children]) $('gaveta-corpo').append(sec);
  $('aba-mesa').remove();
  for (const d of DOCK) {
    if (d.sep) { const s = el('div', 'sep-mestre', d.sep); s.dataset.sep = '1'; $('dock').append(s); continue; }
    const b = el('button', 'ferr', d.ico); b.dataset.dica = d.nome; b.dataset.k = d.k;
    b.onclick = () => (d.acao ? d.acao() : abrirGaveta(d.k));
    // Dica fora da barra: aparece ao lado do ícone, sem ser cortada pela rolagem.
    b.onmouseenter = () => {
      let dica = $('dica-dock'); if (!dica) { dica = el('div'); dica.id = 'dica-dock'; document.body.append(dica); }
      const r = b.getBoundingClientRect(); dica.textContent = d.nome; dica.style.left = r.right + 10 + 'px'; dica.style.top = r.top + r.height / 2 + 'px'; dica.hidden = false;
    };
    b.onmouseleave = () => { const dica = $('dica-dock'); if (dica) dica.hidden = true; };
    $('dock').append(b);
  }
})();
const visivelNoDock = (d) => (d.ver ? d.ver() : d.secs.some((id) => !$(id).hidden));
function atualizarDock() {
  for (const b of $('dock').querySelectorAll('button')) { const d = DOCK.find((x) => x.k === b.dataset.k); b.hidden = !visivelNoDock(d); b.classList.toggle('ativo', gavetaAberta === d.k); }
  const sep = $('dock').querySelector('[data-sep]'); if (sep) sep.hidden = !estado.voce.mestre;
  if (gavetaAberta && !visivelNoDock(DOCK.find((x) => x.k === gavetaAberta))) fecharGaveta();
}
function abrirGaveta(k) {
  if (gavetaAberta === k) return fecharGaveta();
  const d = DOCK.find((x) => x.k === k); if (!d || !d.secs) return;
  gavetaAberta = k;
  $('gaveta-titulo').textContent = d.ico + ' ' + d.nome;
  for (const sec of $('gaveta-corpo').children) sec.classList.toggle('na-gaveta', d.secs.includes(sec.id));
  $('gaveta').classList.toggle('uma', d.secs.filter((id) => !$(id).hidden).length <= 1);
  $('gaveta').hidden = false; $('gaveta-corpo').scrollTop = 0;
  atualizarDock();
}
function fecharGaveta() { gavetaAberta = null; $('gaveta').hidden = true; for (const b of $('dock').querySelectorAll('button')) b.classList.remove('ativo'); }
$('gaveta-fechar').onclick = fecharGaveta;

// ---------- Mostrar coisas no mapa: apontar, desenhar, reagir e "olhem aqui" ----------
const REACOES = ['👍', '👎', '😂', '😱', '😡', '❤️', '🤔', '🎉', '💀', '🙏'];
let modoMapa = null; // 'apontar' | 'desenhar' | 'foco'
function escolherModo(m) {
  modoMapa = modoMapa === m ? null : m;
  if (modoMapa && usandoRegua) $('f-regua').onclick();
  if (modoMapa && pincel) escolherPincel(pincel);
  if (modoMapa && ferrDesenho) escolherFerrDesenho(ferrDesenho);
  cv.classList.toggle('selecionando', modoMapa === 'selecionar');
  for (const [id, k] of [['a-selecionar', 'selecionar'], ['a-apontar', 'apontar'], ['a-desenhar', 'desenhar'], ['a-foco', 'foco'], ['a-area', 'area']]) $(id).classList.toggle('on', modoMapa === k);
  if (modoMapa !== 'area') $('formas').hidden = true;
  cv.classList.toggle('mira', modoMapa === 'apontar' || modoMapa === 'foco' || modoMapa === 'area' || modoMapa === 'explodir');
  if (modoMapa === 'explodir') aviso('💥 Clique no ponto do mapa onde vai explodir.', '', 3000);
  cv.classList.toggle('lapis', modoMapa === 'desenhar');
  if (modoMapa === 'foco') aviso('📢 Clique no ponto do mapa para onde todos devem olhar.', '', 3000);
}
$('a-apontar').onclick = () => escolherModo('apontar');
$('a-desenhar').onclick = () => escolherModo('desenhar');
$('a-foco').onclick = () => escolherModo('foco');
(function montarReacoes() {
  for (const r of REACOES) {
    const b = el('button', '', r); b.title = 'Reagir com ' + r;
    b.onclick = () => {
      const alvo = estado.voce.mestre ? estado.pecas.find((p) => p.id === selecionada) : minhaPeca();
      if (!alvo) return aviso(estado.voce.mestre ? 'Selecione a peça que vai reagir.' : 'Você ainda não tem personagem no mapa.', 'erro');
      efeito({ tipo: 'reacao', emoji: r, peca: alvo.id });
      $('reacoes').hidden = true; $('a-reagir').classList.remove('on');
    };
    $('reacoes').append(b);
  }
})();
$('a-reagir').onclick = () => { $('reacoes').hidden = !$('reacoes').hidden; $('a-reagir').classList.toggle('on', !$('reacoes').hidden); };
function efeito(corpo) { return fetch(api('efeito'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).catch(() => {}); }

// Traços de desenho (laser) e reações: chegam pelo tempo real e somem sozinhos.
const tracos = new Map(), reacoesNoMapa = [];
let animandoEfeitos = false;
function animarEfeitos() {
  if (animandoEfeitos) return; animandoEfeitos = true;
  const passo = () => {
    const agora = performance.now();
    for (const [id, t] of tracos) if (agora - t.t > (t.fim ? 1600 : 5000)) tracos.delete(id);
    while (reacoesNoMapa.length && agora - reacoesNoMapa[0].ini > 3200) reacoesNoMapa.shift();
    desenhar();
    if (tracos.size || reacoesNoMapa.length) requestAnimationFrame(passo); else animandoEfeitos = false;
  };
  requestAnimationFrame(passo);
}
const corDeQuem = (u) => { if (estado && u === estado.campanha.mestreId) return '#f0c35a'; const p = estado && estado.pecas.find((q) => q.userId === u); return p ? corDe(p) : '#ff8040'; };
const nomeDeQuem = (u) => { if (!estado) return ''; if (u === estado.campanha.mestreId) return estado.campanha.mestre + ' (mestre)'; const p = estado.pecas.find((q) => q.userId === u); return p ? p.nome : ''; };
function receberEfeito(d) {
  if (d.tipo === 'mov') return receberMovimento(d);
  if (d.tipo === 'anuncio') return mostrarAnuncio(d);
  if (d.tipo === 'tela') return dispararTela(d);
  if (d.tipo === 'som') return tocarSom(d);
  if (d.tipo === 'som-parar') return pararSons();
  if (d.tipo === 'regua') return receberRegua(d);
  if (d.tipo === 'laser') {
    if (d.quem === estado.voce.id) return; // o meu já está na tela
    const t = tracos.get(d.id) || { pontos: [], quem: d.quem };
    t.pontos.push(...d.pontos); t.t = performance.now(); t.fim = !!d.fim; tracos.set(d.id, t);
    animarEfeitos();
  } else if (d.tipo === 'reacao') {
    reacoesNoMapa.push({ peca: d.peca, emoji: d.emoji, ini: performance.now() }); animarEfeitos();
  } else if (d.tipo === 'foco') {
    // O mestre pediu: a câmera de todos vai suavemente até o ponto, com um ping grande.
    const ini = { ...cam }, alvo = { x: cv.width / 2 - d.x * cam.z, y: cv.height / 2 - d.y * cam.z }, t0 = performance.now();
    const ir = () => { const k = Math.min(1, (performance.now() - t0) / 450), e = 1 - Math.pow(1 - k, 3); cam.x = ini.x + (alvo.x - ini.x) * e; cam.y = ini.y + (alvo.y - ini.y) * e; desenhar(); if (k < 1) requestAnimationFrame(ir); };
    requestAnimationFrame(ir);
    receberPing({ x: d.x, y: d.y, quem: d.quem, foco: true });
    if (d.quem !== estado.voce.id) aviso('📢 O mestre pediu: olhem aqui!', 'ok', 2500);
  }
}
// Desenho local: vai para a tela na hora e para a mesa em pedaços (a cada 100 ms).
let meuTraco = null;
function enviarTraco(fim) {
  if (!meuTraco) return;
  const novos = meuTraco.pontos.slice(Math.max(0, meuTraco.enviados - 1));
  if (novos.length > 1 || fim) efeito({ tipo: 'laser', id: meuTraco.id, pontos: novos.slice(0, 60).map((p) => [Math.round(p[0]), Math.round(p[1])]), fim: !!fim });
  meuTraco.enviados = meuTraco.pontos.length;
  if (fim) { const t = tracos.get(meuTraco.id); if (t) { t.fim = true; t.t = performance.now(); } clearInterval(meuTraco.timer); meuTraco = null; }
}

// ---------- Ferramentas ----------
function aplicarPrefs() {
  $('f-grade').classList.toggle('on', prefs.grade);
  $('f-encaixar').classList.toggle('on', prefs.encaixar);
  $('f-regua').classList.toggle('on', usandoRegua);
  $('f-dados').classList.toggle('on', prefs.dados3d !== false);
  cv.classList.toggle('regua', usandoRegua || !!pincel);
  document.body.classList.toggle('recolhido', !prefs.painel);
  $('f-painel').classList.toggle('on', prefs.painel);
  setTimeout(desenhar, 260);
}
const alternar = (k) => { prefs[k] = !prefs[k]; salvarPrefs(); aplicarPrefs(); desenhar(); };
$('f-enquadrar').onclick = () => { if (estado) { ajustar(); desenhar(); } };
$('f-mais').onclick = () => zoomCentro(1.25);
$('f-menos').onclick = () => zoomCentro(1 / 1.25);
$('f-grade').onclick = () => alternar('grade');
$('f-encaixar').onclick = () => alternar('encaixar');
$('f-painel').onclick = () => alternar('painel');
$('f-regua').onclick = () => { usandoRegua = !usandoRegua; if (!usandoRegua) regua = null; aplicarPrefs(); desenhar(); };
aplicarPrefs();

// WASD e setas: o jogador anda com a própria peça uma casa por tecla; o mestre move a peça selecionada.
const PASSOS = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0], arrowup: [0, -1], arrowleft: [-1, 0], arrowdown: [0, 1], arrowright: [1, 0] };
function andar(dx, dy, repetida) {
  if (!estado) return false;
  const sel = estado.pecas.find((q) => q.id === selecionada && q.podeMover && (estado.voce.mestre || q.meu));
  const p = sel || estado.pecas.find((q) => q.id === estado.voce.pecaId);
  if (!p) return false;
  const agora = Date.now();
  if (repetida && agora - ultimoPasso < 110) return true; // tecla segurada anda num ritmo que o servidor acompanha
  ultimoPasso = agora;
  const g = estado.mapa.grade, t = p.tamanho || 1;
  let x = Math.min(estado.mapa.largura, Math.max(0, p.x + dx * g)), y = Math.min(estado.mapa.altura, Math.max(0, p.y + dy * g));
  if (prefs.encaixar) { x = encaixe(x, g, t, estado.mapa.largura); y = encaixe(y, g, t, estado.mapa.altura); }
  p.x = x; p.y = y; passoPendente = { id: p.id, x, y, ate: agora + 2000 };
  enviarMover(p, true); esconderDica(); desenhar();
  return true;
}

addEventListener('keydown', (e) => {
  const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  const aberta = document.querySelector('.modal:not([hidden])');
  if (e.key === 'Escape') { if (aberta) { if (!aberta.dataset.fixa) aberta.hidden = true; } else if (modoMapa) escolherModo(modoMapa); else if (!$('reacoes').hidden) { $('reacoes').hidden = true; $('a-reagir').classList.remove('on'); } else if (gavetaAberta) fecharGaveta(); else if (pincel) escolherPincel(pincel); else if (usandoRegua) $('f-regua').onclick(); else if (selecionada) $('fechar-ficha').onclick(); return; }
  if (aberta || digitando || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (PASSOS[k]) { if (andar(PASSOS[k][0], PASSOS[k][1], e.repeat)) e.preventDefault(); return; }
  if (k === 'n' && estado && estado.voce.mestre && estado.combate.ativo) { post('combate/proximo', {}).catch(() => {}); return; }
  if (k === '/') { e.preventDefault(); abrirAba('chat'); if (!prefs.painel) alternar('painel'); $('texto').focus(); }
  else if (k === 'f') $('f-enquadrar').onclick();
  else if (k === 'g') $('f-grade').onclick();
  else if (k === 'r') $('f-regua').onclick();
  else if (k === 'p') $('f-painel').onclick();
  else if (k === 'l' && estado && estado.livro) abrirLivro();
  else if (k === 'c' && estado && estado.campanha.sistema === 'dh' && minhaPeca() && minhaPeca().ficha) abrirPrancheta(estado.voce.id);
});

// ---------- Importar mapa ----------
const LIMITE_ENVIO = 11 * 1024 * 1024;
function carregarImagem(arquivo) {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(arquivo), i = new Image();
    i.onload = () => ok({ i, url }); i.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não consegui ler essa imagem.')); }; i.src = url;
  });
}
/** Imagens grandes demais são reduzidas aqui mesmo (o servidor aceita até 12 MB). */
async function prepararImagem(arquivo) {
  const { i, url } = await carregarImagem(arquivo);
  try {
    if (arquivo.size <= LIMITE_ENVIO && Math.max(i.naturalWidth, i.naturalHeight) <= 8000) return { blob: arquivo, l: i.naturalWidth, a: i.naturalHeight, reduzida: false };
    // GIF animado vai inteiro: reduzir pelo canvas viraria uma imagem parada.
    if (arquivo.type === 'image/gif') throw new Error(`Esse GIF é grande demais (máximo ${Math.round(LIMITE_ENVIO / 1048576)} MB). Reduzir tiraria a animação: use um GIF menor.`);
    let escala = Math.min(1, 6000 / Math.max(i.naturalWidth, i.naturalHeight));
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      const c = document.createElement('canvas'); c.width = Math.round(i.naturalWidth * escala); c.height = Math.round(i.naturalHeight * escala);
      c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
      if (blob && blob.size <= LIMITE_ENVIO) return { blob, l: c.width, a: c.height, reduzida: true };
      escala *= 0.75;
    }
    throw new Error('Essa imagem é grande demais, mesmo reduzida. Tente uma menor.');
  } finally { URL.revokeObjectURL(url); }
}
async function importarMapa(arquivo) {
  if (!arquivo) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(arquivo.type)) return mostrarErro('Use uma imagem PNG, JPG, WEBP ou GIF.');
  try {
    aviso('Preparando o mapa…', 'dado', 2500);
    const { blob, l, a, reduzida } = await prepararImagem(arquivo);
    await post(`mapa?l=${l}&a=${a}`, undefined, { headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
    aviso(reduzida ? 'Mapa importado (reduzi a imagem para caber).' : 'Mapa importado!', 'ok');
  } catch (e) { if (e && e.message && !/^(Não deu|Só o|Use uma)/.test(e.message)) mostrarErro(e.message); }
}
$('arquivo').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; importarMapa(f); };
let arrastosArquivo = 0;
addEventListener('dragenter', (e) => { if (estado && estado.voce.mestre && [...(e.dataTransfer.types || [])].includes('Files')) { arrastosArquivo++; $('solte').classList.add('on'); } });
addEventListener('dragleave', () => { arrastosArquivo = Math.max(0, arrastosArquivo - 1); if (!arrastosArquivo) $('solte').classList.remove('on'); });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault(); arrastosArquivo = 0; $('solte').classList.remove('on');
  if (!estado || !estado.voce.mestre) return;
  // Personagem arrastado da biblioteca: cai onde foi solto (encaixado na casa, se o ímã estiver ligado).
  const criatura = e.dataTransfer.getData('application/x-criatura');
  if (criatura) {
    if (e.target !== cv) return;
    const pt = mundo(e), cr = estado.biblioteca.find((c) => c.id === Number(criatura)), t = (cr && cr.tamanho) || 1, g = estado.mapa.grade;
    const x = prefs.encaixar ? encaixe(pt.x, g, t, estado.mapa.largura) : pt.x, y = prefs.encaixar ? encaixe(pt.y, g, t, estado.mapa.altura) : pt.y;
    colocarCriatura(Number(criatura), x, y);
    return;
  }
  if (e.dataTransfer.files[0]) importarMapa(e.dataTransfer.files[0]);
});

// ---------- Tamanho e imagem das peças (só o mestre) ----------
function mudarTamanho(passo) {
  const p = estado && estado.pecas.find((q) => q.id === selecionada); if (!p) return;
  const novo = Math.min(6, Math.max(0.5, (p.tamanho || 1) + passo));
  if (novo !== (p.tamanho || 1)) post('peca/tamanho', { peca: p.id, tamanho: novo }).catch(() => {});
}
$('tam-menos').onclick = () => mudarTamanho(-0.5);
$('tam-mais').onclick = () => mudarTamanho(0.5);

/** Reduz a imagem do NPC para no máximo 512 px (a ficha de um token não precisa de mais). */
async function reduzirImagem(arquivo, lado) {
  // GIF animado vai como está (até 3 MB): reduzir pelo canvas tiraria a animação.
  if (arquivo.type === 'image/gif') {
    if (arquivo.size > 3 * 1048576) throw new Error('Esse GIF é grande demais (máximo 3 MB para peças e fotos). Reduzir tiraria a animação: use um GIF menor.');
    return arquivo;
  }
  const { i, url } = await carregarImagem(arquivo);
  try {
    const e = Math.min(1, lado / Math.max(i.naturalWidth, i.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(i.naturalWidth * e)); c.height = Math.max(1, Math.round(i.naturalHeight * e));
    c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob(r, 'image/webp', 0.9));
  } finally { URL.revokeObjectURL(url); }
}
$('arquivo-npc').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f || !selecionada) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return mostrarErro('Use uma imagem PNG, JPG, WEBP ou GIF.');
  try {
    const blob = await reduzirImagem(f, 512);
    await post('npc/imagem?peca=' + selecionada, undefined, { headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
    aviso('Imagem do NPC atualizada.', 'ok');
  } catch (err) { if (err && err.message && !/^(Não deu|Só o|Use uma|Imagem)/.test(err.message)) mostrarErro(err.message); }
};
$('tirar-imagem').onclick = () => { if (selecionada) post('npc/imagem/remover', { peca: selecionada }).catch(() => {}); };
$('rolar-como').onclick = () => {
  if (!selecionada) return;
  $('como').value = String(selecionada);
  if (!prefs.painel) alternar('painel');
  abrirAba('chat');
  const t = $('texto'); if (!t.value) t.value = '/r 1d20';
  t.focus();
};

$('salvar-grade').onclick = () => post('grade', { grade: Number($('grade').value) }).then(() => aviso('Grade atualizada.', 'ok')).catch(() => {});
$('remover-npc').onclick = () => { if (selecionada) post('npc/remover', { peca: selecionada }).then(() => { selecionada = null; }).catch(() => {}); };
$('limpar-chat').onclick = () => { if (confirmarLimpeza()) post('chat/limpar', {}).catch(() => {}); };
// Sem diálogo do navegador: o primeiro clique arma, o segundo (em até 4 s) confirma.
function confirmarLimpeza() {
  const b = $('limpar-chat');
  if (b.dataset.armado) { delete b.dataset.armado; b.textContent = '🧹 Limpar o chat'; return true; }
  b.dataset.armado = '1'; b.textContent = 'Clique de novo para apagar tudo';
  setTimeout(() => { delete b.dataset.armado; b.textContent = '🧹 Limpar o chat'; }, 4000);
  return false;
}
