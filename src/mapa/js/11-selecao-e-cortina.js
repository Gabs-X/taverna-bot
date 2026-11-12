// ---------- Movimento ao vivo das peças (evento pequeno, sem baixar o estado) ----------
const deslizando = new Map(); // peça → { de, para, ini }
function receberMovimento(d) {
  if (!estado || d.quem === estado.voce.id) return; // o meu já está na tela
  const p = estado.pecas.find((q) => q.id === d.peca);
  if (!p) { carregar().catch(() => {}); return; } // peça nova para mim: baixa o estado
  if (arrasto && ((arrasto.peca && arrasto.peca.id === p.id) || (arrasto.grupo && selecao.has('p' + p.id)))) return; // estou segurando
  deslizando.set(p.id, { de: { x: p.x, y: p.y }, para: { x: d.x, y: d.y }, ini: performance.now() });
  animarDeslize();
}
let deslizeRodando = false;
function animarDeslize() {
  if (deslizeRodando) return; deslizeRodando = true;
  const passo = () => {
    const agora = performance.now();
    for (const [id, m] of deslizando) {
      const p = estado.pecas.find((q) => q.id === id);
      const k = Math.min(1, (agora - m.ini) / 90), e = 1 - Math.pow(1 - k, 2);
      if (p) { p.x = m.de.x + (m.para.x - m.de.x) * e; p.y = m.de.y + (m.para.y - m.de.y) * e; }
      if (k >= 1 || !p) deslizando.delete(id);
    }
    desenhar();
    if (deslizando.size) requestAnimationFrame(passo); else deslizeRodando = false;
  };
  requestAnimationFrame(passo);
}

// ---------- Seleção de várias peças e elementos (mestre) ----------
const selecao = new Set(); // 'p12' = peça 12, 'e3' = elemento 3
let caixaSel = null;
function itemDaSelecao(k) {
  const id = Number(k.slice(1));
  return k[0] === 'p' ? estado.pecas.find((p) => p.id === id) : (estado.elementos || []).find((e) => e.id === id);
}
function fecharCaixa() {
  const c = caixaSel; caixaSel = null; if (!c) return desenhar();
  const x0 = Math.min(c.a.x, c.b.x), x1 = Math.max(c.a.x, c.b.x), y0 = Math.min(c.a.y, c.b.y), y1 = Math.max(c.a.y, c.b.y);
  if (!c.somar) selecao.clear();
  if (x1 - x0 > 2 || y1 - y0 > 2) {
    const dentro = (o) => o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1;
    for (const p of estado.pecas) if (dentro(p)) selecao.add('p' + p.id);
    for (const e of estado.elementos || []) if (dentro(e)) selecao.add('e' + e.id);
  }
  if (selecao.size) { selecionada = null; elementoSel = null; painel(); }
  painelSelecao(); desenhar();
}
function soltarGrupo(g) {
  const grade = estado.mapa.grade;
  for (const k of g.orig.keys()) {
    const it = itemDaSelecao(k); if (!it) continue;
    if (k[0] === 'p') {
      if (prefs.encaixar) { it.x = encaixe(it.x, grade, it.tamanho || 1, estado.mapa.largura); it.y = encaixe(it.y, grade, it.tamanho || 1, estado.mapa.altura); }
      post('mover', { peca: it.id, x: it.x, y: it.y }).catch(() => {});
    } else post('elemento/mudar', { id: it.id, x: it.x, y: it.y }).catch(() => {});
  }
  desenhar();
}
function painelSelecao() {
  const mestre = estado && estado.voce.mestre;
  $('a-selecionar').hidden = !mestre;
  if (!mestre) { selecao.clear(); $('barra-grupo').hidden = true; return; }
  for (const k of [...selecao]) if (!itemDaSelecao(k)) selecao.delete(k); // apagadas por outra tela
  const barra = $('barra-grupo');
  barra.hidden = selecao.size < 2;
  if (barra.hidden) return;
  const pecas = [...selecao].filter((k) => k[0] === 'p').length, elems = selecao.size - pecas;
  $('grupo-conta').textContent = [pecas ? pecas + (pecas === 1 ? ' peça' : ' peças') : '', elems ? elems + (elems === 1 ? ' elemento' : ' elementos') : ''].filter(Boolean).join(' + ');
  // A barra flutua acima do grupo.
  let topo = Infinity, soma = 0, n = 0;
  for (const k of selecao) { const it = itemDaSelecao(k); if (!it) continue; topo = Math.min(topo, it.y); soma += it.x; n++; }
  const dpr = devicePixelRatio || 1, area = barra.parentElement.getBoundingClientRect(), w = barra.offsetWidth || 360;
  barra.style.left = Math.min(area.width - w / 2 - 8, Math.max(w / 2 + 8, (cam.x + (soma / n) * cam.z) / dpr)) + 'px';
  barra.style.top = Math.max(barra.offsetHeight + 8, (cam.y + topo * cam.z) / dpr - 34) + 'px';
}
function acaoGrupo(acao) {
  const itens = [...selecao].map((k) => [k, itemDaSelecao(k)]).filter(([, it]) => it);
  if (acao === 'limpar') { selecao.clear(); painelSelecao(); desenhar(); return; }
  for (const [k, it] of itens) {
    if (k[0] === 'p') {
      if (it.tipo === 'jogador') continue; // personagens dos jogadores não somem nem saem do mapa
      if (acao === 'tirar') post('npc/remover', { peca: it.id }).catch(() => {});
      else post('peca/esconder', { peca: it.id, escondida: acao === 'esconder' }).catch(() => {});
    } else {
      if (acao === 'tirar') post('elemento/apagar', { id: it.id }).catch(() => {});
      else post('elemento/mudar', { id: it.id, oculto: acao === 'esconder' }).catch(() => {});
    }
  }
  if (acao === 'tirar') { selecao.clear(); painelSelecao(); }
  aviso({ esconder: '🙈 Grupo escondido dos jogadores.', mostrar: '👁️ Grupo visível para a mesa.', tirar: '🗑 Peças do mestre e elementos tirados do mapa (os personagens dos jogadores ficam).' }[acao], 'ok', 2500);
}
for (const b of $('barra-grupo').querySelectorAll('[data-g]')) b.onclick = () => acaoGrupo(b.dataset.g);
// Selecionar: solta qualquer ferramenta e liga a seleção em caixa (clicar de novo desliga).
$('a-selecionar').onclick = () => {
  if (ferrDesenho) escolherFerrDesenho(ferrDesenho);
  if (usandoRegua) $('f-regua').onclick();
  if (pincel) escolherPincel(pincel);
  if (!$('formas').hidden) $('formas').hidden = true;
  escolherModo('selecionar');
  if (modoMapa === 'selecionar') aviso('🖱️ Arraste no mapa vazio para selecionar várias peças. Shift + clique soma ou tira.', '', 3000);
};

// ---------- Cortina do mestre ----------
let cortinaAntes = null;
function painelCortina() {
  const fechada = !!estado.mapa.cortina, mestre = estado.voce.mestre, c = $('cortina');
  $('a-cortina').hidden = !mestre;
  $('a-cortina').classList.toggle('on', fechada);
  $('a-cortina').querySelector('.rot').textContent = fechada ? 'Abrir cortina' : 'Cortina';
  c.classList.toggle('mestre', mestre);
  if (mestre) c.querySelector('.placa b').textContent = '🎭 Cortina fechada: os jogadores não veem o mapa';
  if (fechada) { c.classList.remove('abrindo'); c.hidden = false; }
  else if (cortinaAntes) { c.classList.add('abrindo'); setTimeout(() => { if (!estado.mapa.cortina) c.hidden = true; }, 950); }
  else c.hidden = true;
  if (cortinaAntes !== null && fechada !== cortinaAntes && !mestre) aviso(fechada ? '🎭 O mestre fechou a cortina para preparar a cena.' : '🎭 A cortina abriu!', 'ok', 2500);
  cortinaAntes = fechada;
}
$('a-cortina').onclick = () => post('cortina', { fechada: !estado.mapa.cortina }).then((r) => aviso(r.fechada ? '🎭 Cortina fechada: os jogadores não veem o mapa nem as suas peças. Clique de novo para abrir.' : '🎭 Cortina aberta: a mesa vê a cena.', 'ok', 3500)).catch((e) => aviso(e.message, 'erro'));

/** Chamado no fim do painel(). */
function painelMesaExtra() {
  painelHolofote();
  painelCortina();
  painelSelecao();
  painelEfeitos();
  painelElemento();
  ajustarAcoes();
  painelRelogios();
  painelCenaExtra();
  painelHistorico();
  painelPedidos();
  painelRoteiro();
  $('linha-descanso-medo').hidden = !(estado.voce.mestre && ehDH());
  const p = minhaPeca();
  $('imprimir-ficha').hidden = !(p && p.ficha);
  $('descansar').hidden = !(p && p.ficha && ehDH());
  animarGifs();
  estado._carregou = true;
}

// GIFs animados no mapa (a imagem do mapa, peças ou elementos): o canvas só mostra o quadro atual quando
// redesenha, então enquanto houver um GIF na tela o mapa redesenha ~12 vezes por segundo.
let lacoGif = null;
function animarGifs() {
  const tem = estado.mapa.gif || estado.pecas.some((p) => p.gif) || (estado.elementos || []).some((e) => e.gif);
  if (tem && !lacoGif) lacoGif = setInterval(() => { if (!document.hidden) desenhar(); }, 80);
  else if (!tem && lacoGif) { clearInterval(lacoGif); lacoGif = null; }
}
$('descansar').onclick = abrirDescanso;
$('f-dados').onclick = () => { prefs.dados3d = prefs.dados3d === false; aplicarPrefs(); aviso(prefs.dados3d ? '🎲 Dados animados ligados.' : '🎲 Dados animados desligados.', '', 1800); };

Promise.all([carregar(), carregarChat()]).then(() => { marcarConexao(true); rolarParaFim(); conectar(); }).catch(() => marcarConexao(false));
