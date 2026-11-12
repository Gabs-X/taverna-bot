// ---------- Elementos (imagens soltas) e desenhos permanentes do mestre ----------
let elementoSel = null, ferrDesenho = null, desenhoNovo = null;
function pintarCamadaMestre() {
  const px = 1 / cam.z, mestre = estado.voce.mestre;
  for (const e of estado.elementos || []) {
    const img = avatarDe(e.url); // mesma cache das fotos (redesenha quando carrega)
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate((e.rotacao * Math.PI) / 180);
    if (e.oculto) ctx.globalAlpha = 0.45;
    if (img) ctx.drawImage(img, -e.largura / 2, -e.altura / 2, e.largura, e.altura);
    else { ctx.fillStyle = 'rgba(122,82,24,.25)'; ctx.fillRect(-e.largura / 2, -e.altura / 2, e.largura, e.altura); }
    if (mestre && e.id === elementoSel) { posicionarBarraElemento(e); ctx.globalAlpha = 1; ctx.setLineDash([7 * px, 5 * px]); ctx.lineWidth = 2 * px; ctx.strokeStyle = '#f5c451'; ctx.strokeRect(-e.largura / 2, -e.altura / 2, e.largura, e.altura); ctx.setLineDash([]); }
    ctx.restore();
  }
  for (const d of [...(estado.desenhos || []), ...(desenhoNovo ? [desenhoNovo] : [])]) pintarDesenho(d);
}
/** A barra de ajustes flutua logo acima do elemento selecionado (segue a câmera). */
function posicionarBarraElemento(e) {
  const b = $('barra-elemento'), dpr = devicePixelRatio || 1, meia = Math.max(e.largura, e.altura) / 2;
  const x = (cam.x + e.x * cam.z) / dpr, y = (cam.y + (e.y - meia) * cam.z) / dpr - 10;
  const area = b.parentElement.getBoundingClientRect(), w = b.offsetWidth || 380;
  b.style.left = Math.min(area.width - w / 2 - 8, Math.max(w / 2 + 8, x)) + 'px';
  b.style.top = Math.max(b.offsetHeight + 8, y) + 'px';
}
function caminhoDesenho(d) {
  const [a, b] = [d.pontos[0], d.pontos[d.pontos.length - 1]];
  ctx.beginPath();
  if (d.tipo === 'retangulo') ctx.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  else if (d.tipo === 'circulo') ctx.arc(a[0], a[1], Math.hypot(b[0] - a[0], b[1] - a[1]), 0, Math.PI * 2);
  else { ctx.moveTo(a[0], a[1]); for (const p of d.tipo === 'linha' ? [b] : d.pontos.slice(1)) ctx.lineTo(p[0], p[1]); }
}
function pintarDesenho(d) {
  if (!d.pontos || d.pontos.length < 1) return;
  ctx.save(); ctx.globalAlpha = d.oculto ? 0.45 : 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  caminhoDesenho(d);
  if (d.preenchido) { ctx.fillStyle = d.cor; ctx.globalAlpha *= 0.35; ctx.fill(); ctx.globalAlpha = d.oculto ? 0.45 : 1; }
  ctx.strokeStyle = d.cor; ctx.lineWidth = d.espessura; ctx.stroke(); ctx.restore();
}
/** Elemento debaixo do ponto (o de cima primeiro), levando em conta a rotação. */
function elementoEm(pt) {
  const lista = estado.elementos || [];
  for (let i = lista.length - 1; i >= 0; i--) {
    const e = lista[i], r = (-e.rotacao * Math.PI) / 180, dx = pt.x - e.x, dy = pt.y - e.y;
    const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
    if (Math.abs(lx) <= e.largura / 2 && Math.abs(ly) <= e.altura / 2) return e;
  }
  return null;
}
const distSeg = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy; const t = l ? Math.max(0, Math.min(1, ((p.x - a[0]) * vx + (p.y - a[1]) * vy) / l)) : 0; return Math.hypot(p.x - a[0] - t * vx, p.y - a[1] - t * vy); };
/** Desenho debaixo do ponto (para a borracha). */
function desenhoEm(pt) {
  const lista = estado.desenhos || [], folga = 8 / cam.z;
  for (let i = lista.length - 1; i >= 0; i--) {
    const d = lista[i], tol = d.espessura / 2 + folga, [a, b] = [d.pontos[0], d.pontos[d.pontos.length - 1]];
    if (d.tipo === 'circulo') { const r = Math.hypot(b[0] - a[0], b[1] - a[1]), dist = Math.hypot(pt.x - a[0], pt.y - a[1]); if (Math.abs(dist - r) <= tol || (d.preenchido && dist <= r)) return d; continue; }
    if (d.tipo === 'retangulo') {
      const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      const dentro = pt.x >= x0 && pt.x <= x1 && pt.y >= y0 && pt.y <= y1;
      const borda = [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]].some(([p, q]) => distSeg(pt, p, q) <= tol);
      if (borda || (d.preenchido && dentro)) return d; continue;
    }
    const pts = d.tipo === 'linha' ? [a, b] : d.pontos;
    for (let k = 1; k < pts.length; k++) if (distSeg(pt, pts[k - 1], pts[k]) <= tol) return d;
  }
  return null;
}
function escolherFerrDesenho(f) {
  ferrDesenho = ferrDesenho === f ? null : f;
  for (const b of $('ferr-desenho').querySelectorAll('[data-d]')) b.classList.toggle('on', b.dataset.d === ferrDesenho);
  cv.classList.toggle('pintando', !!ferrDesenho && ferrDesenho !== 'borracha');
  cv.classList.toggle('apagando', ferrDesenho === 'borracha');
  if (ferrDesenho && modoMapa) escolherModo(modoMapa);
}
for (const b of $('ferr-desenho').querySelectorAll('[data-d]')) b.onclick = () => escolherFerrDesenho(b.dataset.d);
function comecarDesenho(pt) {
  if (ferrDesenho === 'borracha') { const d = desenhoEm(pt); if (d) post('desenho/apagar', { id: d.id }).catch(() => {}); else aviso('Clique em cima de um desenho para apagar.', '', 1500); return; }
  desenhoNovo = { tipo: ferrDesenho, pontos: [[pt.x, pt.y], [pt.x, pt.y]], cor: $('desenho-cor').value, espessura: Number($('desenho-espessura').value), preenchido: $('desenho-cheio').checked && (ferrDesenho === 'retangulo' || ferrDesenho === 'circulo'), oculto: $('desenho-oculto').checked };
  if (ferrDesenho === 'traco') desenhoNovo.pontos = [[pt.x, pt.y]];
  arrasto = { desenho: true }; desenhar();
}
function continuarDesenho(pt) {
  if (!desenhoNovo) return;
  if (desenhoNovo.tipo === 'traco') { const u = desenhoNovo.pontos[desenhoNovo.pontos.length - 1]; if (Math.hypot(pt.x - u[0], pt.y - u[1]) * cam.z > 3 && desenhoNovo.pontos.length < 600) desenhoNovo.pontos.push([pt.x, pt.y]); }
  else desenhoNovo.pontos[1] = [pt.x, pt.y];
  desenhar();
}
function terminarDesenho() {
  const d = desenhoNovo; if (!d) return;
  const [a, b] = [d.pontos[0], d.pontos[d.pontos.length - 1]];
  if (d.tipo === 'traco' && d.pontos.length === 1) d.pontos.push([a[0] + 0.5, a[1] + 0.5]);
  else if (d.tipo !== 'traco' && Math.hypot(b[0] - a[0], b[1] - a[1]) < 2) { desenhoNovo = null; desenhar(); return; }
  // Fica na tela até o estado novo chegar (sem piscar).
  post('desenho/novo', d).then(() => { if (desenhoNovo === d) desenhoNovo = null; }).catch(() => { desenhoNovo = null; desenhar(); });
}
$('desenho-limpar').onclick = (e) => {
  const b = e.currentTarget;
  if (!b.dataset.armado) { b.dataset.armado = '1'; b.textContent = 'Clique de novo para apagar'; setTimeout(() => { delete b.dataset.armado; b.textContent = 'Apagar todos'; }, 3000); return; }
  delete b.dataset.armado; b.textContent = 'Apagar todos';
  post('desenho/limpar', {}).then(() => aviso('🧽 Desenhos da cena apagados.', 'ok')).catch(() => {});
};
$('elemento-arquivo').onchange = async (e) => {
  const arquivos = [...e.target.files]; e.target.value = '';
  const centro = centroDaTela();
  for (const [k, f] of arquivos.entries()) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) { mostrarErro('Use uma imagem PNG, JPG, WEBP ou GIF.'); continue; }
    try {
      const { i, url } = await carregarImagem(f); URL.revokeObjectURL(url);
      const blob = await reduzirImagem(f, 1024);
      const g = estado.mapa.grade, x = Math.min(estado.mapa.largura, centro.x + k * g), y = centro.y;
      const r = await post(`elemento/novo?l=${i.naturalWidth}&a=${i.naturalHeight}&x=${x}&y=${y}`, undefined, { headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
      if ($('elemento-oculto').checked) await post('elemento/mudar', { id: r.id, oculto: true });
      elementoSel = r.id;
    } catch (err) { if (err && err.message && !/^(Não deu|Só o|Use uma|Imagem)/.test(err.message)) mostrarErro(err.message); }
  }
  aviso('🖼️ Elemento no mapa: clique nele para arrastar, girar ou mudar o tamanho.', 'ok', 3500);
};
function painelElemento() {
  const mestre = estado && estado.voce.mestre;
  $('painel-elementos').hidden = !mestre;
  const e = mestre && elementoSel ? (estado.elementos || []).find((x) => x.id === elementoSel) : null;
  if (!e) elementoSel = null;
  $('barra-elemento').hidden = !e;
  if (e) $('barra-elemento').querySelector('[data-el=esconder]').textContent = e.oculto ? '👁️' : '🙈';
}
for (const b of $('barra-elemento').querySelectorAll('[data-el]')) b.onclick = () => {
  const e = (estado.elementos || []).find((x) => x.id === elementoSel); if (!e) return;
  const acao = b.dataset.el, mudar = (corpo) => post('elemento/mudar', { id: e.id, ...corpo }).catch(() => {});
  if (acao === 'girar-') mudar({ rotacao: e.rotacao - 15 });
  else if (acao === 'girar+') mudar({ rotacao: e.rotacao + 15 });
  else if (acao === 'menor') mudar({ largura: e.largura / 1.15, altura: e.altura / 1.15 });
  else if (acao === 'maior') mudar({ largura: e.largura * 1.15, altura: e.altura * 1.15 });
  else if (acao === 'frente' || acao === 'tras') mudar({ ordem: acao });
  else if (acao === 'esconder') mudar({ oculto: !e.oculto });
  else if (acao === 'copiar') post('elemento/copiar', { id: e.id }).then((r) => { elementoSel = r.id; }).catch(() => {});
  else if (acao === 'apagar') { post('elemento/apagar', { id: e.id }).catch(() => {}); elementoSel = null; painelElemento(); }
  else if (acao === 'fechar') { elementoSel = null; painelElemento(); desenhar(); }
};
addEventListener('keydown', (e) => {
  if (!estado || !estado.voce.mestre || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  if (e.key === 'Escape' && selecao.size) { e.stopImmediatePropagation(); selecao.clear(); painelSelecao(); desenhar(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selecao.size) { e.preventDefault(); acaoGrupo('tirar'); return; }
  if (e.key === 'Escape' && (ferrDesenho || elementoSel)) { e.stopImmediatePropagation(); if (ferrDesenho) escolherFerrDesenho(ferrDesenho); else { elementoSel = null; painelElemento(); desenhar(); } return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && elementoSel) { e.preventDefault(); post('elemento/apagar', { id: elementoSel }).catch(() => {}); elementoSel = null; painelElemento(); }
}, true);

// ---------- Efeitos de tela (ventania, tremor, fogo, explosão...), clima e sons da mesa ----------
// O mestre dispara; cada navegador desenha e toca sozinho (os sons prontos são gerados aqui, sem arquivo).
const fxCv = $('fx'), fx = fxCv.getContext('2d');
let fxAtivos = [], fxRodando = false;
const climaEstado = {}; // partículas de cada clima ligado
const alea = (a, b) => a + Math.random() * (b - a);
function fxTamanho() {
  const r = fxCv.getBoundingClientRect(), d = devicePixelRatio || 1, w = Math.round(r.width * d), h = Math.round(r.height * d);
  if (fxCv.width !== w || fxCv.height !== h) { fxCv.width = w; fxCv.height = h; for (const k of Object.keys(climaEstado)) delete climaEstado[k]; }
  return { W: w, H: h, d };
}
/** Ponto do mapa na tela do efeito (ou o meio da tela). */
function fxPonto(d, W, H) {
  if (d.x === undefined) return { x: W / 2, y: H / 2 };
  return { x: cam.x + d.x * cam.z, y: cam.y + d.y * cam.z };
}
const DURACAO_FX = { ventania: 3200, tremor: 1300, fogo: 4500, explosao: 1800, relampago: 1100, luz: 3500, escuridao: 6000 };
function dispararTela(d) {
  const { W, H } = fxTamanho();
  const ef = { nome: d.nome, ini: performance.now(), dur: DURACAO_FX[d.nome] || 2000, p: fxPonto(d, W, H), parts: [] };
  if (d.nome === 'ventania') for (let i = 0; i < 70; i++) ef.parts.push({ x: alea(-W, 0), y: alea(0, H), v: alea(W * 0.9, W * 1.6), l: alea(60, 220), a: alea(0.15, 0.45) });
  if (d.nome === 'fogo') ef.parts = [];
  if (d.nome === 'explosao') for (let i = 0; i < 90; i++) { const ang = alea(0, Math.PI * 2), v = alea(150, 900); ef.parts.push({ vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: alea(2, 7), cor: Math.random() < 0.5 ? '#ffd27a' : '#ff6a2a' }); }
  if (d.nome === 'luz') for (let i = 0; i < 80; i++) ef.parts.push({ x: alea(0, W), y: alea(H * 0.3, H), v: alea(40, 140), r: alea(1.5, 4), f: alea(0, 6) });
  fxAtivos.push(ef);
  if (d.nome === 'tremor' || d.nome === 'explosao') tremer(d.nome === 'explosao' ? 700 : 1300);
  if (d.nome === 'explosao') tocarPronto('explosao', 0.9);
  if (d.nome === 'relampago') setTimeout(() => tocarPronto('trovao', 0.9), 250);
  rodarFx();
}
function tremer(ms) {
  for (const alvo of [cv, fxCv]) { alvo.classList.remove('treme-tela'); void alvo.offsetWidth; alvo.classList.add('treme-tela'); alvo.style.animationDuration = ms + 'ms'; }
  setTimeout(() => { cv.classList.remove('treme-tela'); fxCv.classList.remove('treme-tela'); }, ms);
}
function rodarFx() {
  if (fxRodando) return; fxRodando = true;
  let antes = performance.now();
  const passo = (agora) => {
    const dt = Math.min(0.05, (agora - antes) / 1000); antes = agora;
    const { W, H, d } = fxTamanho();
    fx.clearRect(0, 0, W, H);
    // Um efeito com problema nunca pode travar o laço (senão nenhum outro aparece).
    for (const nome of (estado && estado.clima) || []) { try { pintarClima(nome, W, H, d, dt); } catch (e) { console.error('[efeito]', e); } }
    fxAtivos = fxAtivos.filter((ef) => agora - ef.ini < ef.dur);
    for (const ef of fxAtivos) { try { pintarFx(ef, Math.min(1, Math.max(0, (agora - ef.ini) / ef.dur)), W, H, d, dt); } catch (e) { console.error('[efeito]', e); fx.restore(); } }
    if (fxAtivos.length || ((estado && estado.clima) || []).length) requestAnimationFrame(passo);
    else { fx.clearRect(0, 0, W, H); fxRodando = false; }
  };
  requestAnimationFrame(passo);
}
function pintarFx(ef, k, W, H, d, dt) {
  const some = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
  fx.save();
  if (ef.nome === 'ventania') {
    fx.lineCap = 'round';
    for (const p of ef.parts) { p.x += p.v * dt; fx.strokeStyle = `rgba(235,245,255,${p.a * some})`; fx.lineWidth = 2 * d; fx.beginPath(); fx.moveTo(p.x, p.y); fx.lineTo(p.x + p.l * d, p.y - p.l * 0.06 * d); fx.stroke(); }
  } else if (ef.nome === 'fogo') {
    const glow = fx.createLinearGradient(0, H, 0, H * 0.45); glow.addColorStop(0, `rgba(255,90,20,${0.32 * some})`); glow.addColorStop(1, 'rgba(255,90,20,0)');
    fx.fillStyle = glow; fx.fillRect(0, 0, W, H);
    if (k < 0.85) for (let i = 0; i < 3; i++) ef.parts.push({ x: alea(0, W), y: H + 20 * d, v: alea(140, 340) * d, r: alea(14, 34) * d, vida: 0 });
    fx.globalCompositeOperation = 'lighter';
    for (const p of ef.parts) {
      p.y -= p.v * dt; p.x += Math.sin((p.y + p.r) / (40 * d)) * 30 * dt * d; p.vida += dt;
      const a = Math.max(0, 1 - p.vida / 1.1) * some * 0.75, g = fx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(255,230,140,${a})`); g.addColorStop(0.4, `rgba(255,120,30,${a * 0.8})`); g.addColorStop(1, 'rgba(180,30,0,0)');
      fx.fillStyle = g; fx.beginPath(); fx.arc(p.x, p.y, p.r, 0, Math.PI * 2); fx.fill();
    }
    ef.parts = ef.parts.filter((p) => p.vida < 1.1);
  } else if (ef.nome === 'explosao') {
    const { x, y } = ef.p, t = k * ef.dur / 1000;
    if (k < 0.08) { fx.fillStyle = `rgba(255,250,230,${0.85 * (1 - k / 0.08)})`; fx.fillRect(0, 0, W, H); }
    fx.globalCompositeOperation = 'lighter';
    const raio = (60 + 520 * Math.min(1, k * 1.6)) * d, bola = fx.createRadialGradient(x, y, 0, x, y, raio * 0.6);
    bola.addColorStop(0, `rgba(255,240,180,${(1 - k) * 0.95})`); bola.addColorStop(0.5, `rgba(255,110,20,${(1 - k) * 0.7})`); bola.addColorStop(1, 'rgba(120,20,0,0)');
    fx.fillStyle = bola; fx.beginPath(); fx.arc(x, y, raio * 0.6, 0, Math.PI * 2); fx.fill();
    fx.strokeStyle = `rgba(255,220,160,${(1 - k) * 0.8})`; fx.lineWidth = 6 * d * (1 - k); fx.beginPath(); fx.arc(x, y, raio, 0, Math.PI * 2); fx.stroke();
    for (const p of ef.parts) { fx.fillStyle = p.cor; fx.globalAlpha = 1 - k; fx.beginPath(); fx.arc(x + p.vx * t * d, y + p.vy * t * d + 200 * t * t * d, p.r * d, 0, Math.PI * 2); fx.fill(); }
  } else if (ef.nome === 'relampago') {
    const flashes = [[0, 0.08, 0.85], [0.16, 0.22, 0.55], [0.3, 0.36, 0.7]];
    const f = flashes.find(([a, b]) => k >= a && k <= b);
    if (f) { fx.fillStyle = `rgba(235,240,255,${f[2]})`; fx.fillRect(0, 0, W, H); }
  } else if (ef.nome === 'luz') {
    fx.globalCompositeOperation = 'lighter';
    const raios = fx.createLinearGradient(0, 0, 0, H); raios.addColorStop(0, `rgba(255,225,140,${0.35 * some * Math.min(1, k * 5)})`); raios.addColorStop(1, 'rgba(255,225,140,0)');
    fx.fillStyle = raios; fx.fillRect(0, 0, W, H);
    for (const p of ef.parts) { p.y -= p.v * dt * d; fx.fillStyle = `rgba(255,240,190,${(0.5 + 0.5 * Math.sin(k * 20 + p.f)) * some})`; fx.beginPath(); fx.arc(p.x, p.y, p.r * d, 0, Math.PI * 2); fx.fill(); }
  } else if (ef.nome === 'escuridao') {
    const fecha = k < 0.25 ? k / 0.25 : k > 0.75 ? (1 - k) / 0.25 : 1;
    const g = fx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.55 - 0.4 * fecha), W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.92 * fecha})`);
    fx.fillStyle = g; fx.fillRect(0, 0, W, H);
  }
  fx.restore();
}
function pintarClima(nome, W, H, d, dt) {
  let e = climaEstado[nome];
  if (!e) {
    e = climaEstado[nome] = { parts: [] };
    const n = { chuva: 220, neve: 140, neblina: 7, vento: 26 }[nome] || 0;
    for (let i = 0; i < n; i++) e.parts.push({ x: alea(0, W), y: alea(0, H), v: alea(0.7, 1.3), f: alea(0, 6), r: alea(0.6, 1.4) });
  }
  fx.save();
  if (nome === 'chuva') {
    fx.fillStyle = 'rgba(20,30,50,.18)'; fx.fillRect(0, 0, W, H);
    fx.strokeStyle = 'rgba(180,200,230,.45)'; fx.lineWidth = 1.2 * d; fx.beginPath();
    for (const p of e.parts) { p.y += 900 * p.v * dt * d; p.x += 120 * dt * d; if (p.y > H) { p.y = -20; p.x = alea(-W * 0.1, W); } fx.moveTo(p.x, p.y); fx.lineTo(p.x - 3 * d, p.y - 16 * d * p.v); }
    fx.stroke();
  } else if (nome === 'neve') {
    fx.fillStyle = 'rgba(240,248,255,.85)';
    for (const p of e.parts) { p.f += dt; p.y += 45 * p.v * dt * d; p.x += Math.sin(p.f) * 20 * dt * d; if (p.y > H) { p.y = -5; p.x = alea(0, W); } fx.beginPath(); fx.arc(p.x, p.y, 2.2 * p.r * d, 0, Math.PI * 2); fx.fill(); }
  } else if (nome === 'neblina') {
    for (const p of e.parts) {
      p.x += 18 * p.v * dt * d; if (p.x - 400 * d > W) p.x = -400 * d;
      const r = 320 * p.r * d, g = fx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, 'rgba(225,230,235,.22)'); g.addColorStop(1, 'rgba(225,230,235,0)');
      fx.fillStyle = g; fx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
  } else if (nome === 'vento') {
    fx.lineCap = 'round';
    for (const p of e.parts) { p.x += 700 * p.v * dt * d; if (p.x > W + 200 * d) { p.x = -200 * d; p.y = alea(0, H); } fx.strokeStyle = 'rgba(235,245,255,.22)'; fx.lineWidth = 1.6 * d; fx.beginPath(); fx.moveTo(p.x, p.y); fx.lineTo(p.x + 120 * p.r * d, p.y - 6 * d); fx.stroke(); }
  }
  fx.restore();
}

// ---------- Sons ----------
let actx = null;
function audio() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
// O navegador só libera o som depois de um clique na página.
addEventListener('pointerdown', () => { try { audio(); } catch {} }, { once: true });
const somLigado = () => prefs.sons !== false;
function ruido(a, seg) { const b = a.createBuffer(1, Math.ceil(a.sampleRate * seg), a.sampleRate), c = b.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1; return b; }
function envelope(g, t, ataque, dur, pico) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pico, t + ataque); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function nota(a, saida, tipo, freq, t, dur, pico, ataque = 0.005) { const o = a.createOscillator(), g = a.createGain(); o.type = tipo; o.frequency.setValueAtTime(freq, t); envelope(g, t, ataque, dur, pico); o.connect(g).connect(saida); o.start(t); o.stop(t + dur + 0.05); return o; }
function chiado(a, saida, t, dur, filtro, freq, pico, ataque = 0.005) { const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = ruido(a, dur + 0.1); f.type = filtro; f.frequency.setValueAtTime(freq, t); envelope(g, t, ataque, dur, pico); s.connect(f).connect(g).connect(saida); s.start(t); s.stop(t + dur + 0.1); return f; }
/** Sons prontos, sintetizados no navegador. */
function tocarPronto(nome, vol = 0.8) {
  if (!somLigado()) return;
  let a; try { a = audio(); } catch { return; }
  const t = a.currentTime + 0.02, saida = a.createGain(); saida.gain.value = vol; saida.connect(a.destination);
  if (nome === 'trovao') { const f = chiado(a, saida, t, 3.2, 'lowpass', 500, 1, 0.08); f.frequency.exponentialRampToValueAtTime(90, t + 3); chiado(a, saida, t, 0.4, 'bandpass', 1200, 0.5); }
  else if (nome === 'explosao') { const f = chiado(a, saida, t, 2, 'lowpass', 1400, 1.2, 0.01); f.frequency.exponentialRampToValueAtTime(80, t + 1.8); const o = nota(a, saida, 'sine', 90, t, 1.4, 0.9); o.frequency.exponentialRampToValueAtTime(35, t + 1.2); }
  else if (nome === 'espada') { for (const [f, p] of [[1250, 0.35], [2650, 0.22], [3900, 0.15], [5200, 0.08]]) nota(a, saida, 'triangle', f, t, 0.9, p); chiado(a, saida, t, 0.08, 'highpass', 3000, 0.4); }
  else if (nome === 'porta') { const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(70, t + 1.5); lfo.frequency.value = 18; lg.gain.value = 25; lfo.connect(lg).connect(o.frequency); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 4; envelope(g, t, 0.15, 1.6, 0.5); o.connect(f).connect(g).connect(saida); o.start(t); lfo.start(t); o.stop(t + 1.7); lfo.stop(t + 1.7); }
  else if (nome === 'sino') { for (const [f, p] of [[660, 0.4], [1320, 0.2], [1650, 0.15], [2640, 0.06]]) nota(a, saida, 'sine', f, t, 3, p, 0.003); }
  else if (nome === 'magia') { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => { nota(a, saida, 'sine', f, t + i * 0.07, 0.9, 0.25); nota(a, saida, 'triangle', f * 2, t + i * 0.07, 0.5, 0.06); }); chiado(a, saida, t, 1.2, 'highpass', 6000, 0.08, 0.3); }
  else if (nome === 'rugido') { const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(60, t + 1.8); lfo.frequency.value = 28; lg.gain.value = 0.35; lfo.connect(lg).connect(g.gain); f.type = 'lowpass'; f.frequency.value = 650; envelope(g, t, 0.25, 1.9, 0.7); o.connect(f).connect(g).connect(saida); o.start(t); lfo.start(t); o.stop(t + 2); lfo.stop(t + 2); chiado(a, saida, t, 1.8, 'lowpass', 900, 0.3, 0.2); }
  else if (nome === 'batida') { for (let i = 0; i < 3; i++) { const tt = t + i * 0.28; nota(a, saida, 'sine', 120, tt, 0.18, 0.9); chiado(a, saida, tt, 0.08, 'bandpass', 300, 0.6); } }
  else if (nome === 'moedas') { for (let i = 0; i < 9; i++) { const tt = t + alea(0, 0.7); nota(a, saida, 'triangle', alea(2200, 4200), tt, 0.25, 0.18, 0.002); } }
  setTimeout(() => saida.disconnect(), 4000);
}
const sonsTocando = new Set();
function tocarSom(d) {
  if (d.pronto) return tocarPronto(d.pronto, (d.volume ?? 80) / 100);
  if (!somLigado() || !d.url) return;
  const s = new Audio(d.url); s.volume = Math.min(1, (d.volume ?? 80) / 100); s.loop = !!d.repetir;
  sonsTocando.add(s); s.onended = () => sonsTocando.delete(s);
  s.play().catch(() => aviso('🔇 O navegador bloqueou o som: clique em qualquer lugar da página para liberar.', '', 3500));
  if (d.nome && !estado.voce.mestre) aviso('🎵 ' + d.nome, '', 2000);
}
function pararSons() { for (const s of sonsTocando) { s.pause(); s.currentTime = 0; } sonsTocando.clear(); }
// Som do clima ligado (chuva e vento), em laço enquanto o clima estiver ligado.
const somClima = {};
function sincronizarClima() {
  const ligados = new Set((estado.clima) || []);
  for (const nome of ['chuva', 'vento']) {
    const quer = ligados.has(nome) && somLigado();
    if (quer && !somClima[nome]) {
      try {
        const a = audio(), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        s.buffer = ruido(a, 4); s.loop = true; f.type = nome === 'chuva' ? 'highpass' : 'lowpass'; f.frequency.value = nome === 'chuva' ? 1800 : 500;
        g.gain.value = nome === 'chuva' ? 0.12 : 0.18; s.connect(f).connect(g).connect(a.destination); s.start();
        somClima[nome] = s;
      } catch {}
    } else if (!quer && somClima[nome]) { somClima[nome].stop(); delete somClima[nome]; }
  }
  if (ligados.size) rodarFx();
  for (const b of document.querySelectorAll('[data-clima]')) b.classList.toggle('on', ligados.has(b.dataset.clima));
}

// ---------- Gaveta de efeitos (mestre) ----------
function painelEfeitos() {
  const mestre = estado.voce.mestre;
  $('painel-efeitos').hidden = !mestre;
  sincronizarClima();
  $('f-som').classList.toggle('on', somLigado());
  $('f-som').textContent = somLigado() ? '🔊' : '🔇';
  if (!mestre) return;
  const box = $('sons-lista'); box.textContent = '';
  if (!(estado.sons || []).length) box.append(el('div', 'mudo', 'Nenhum som seu ainda. Envie um áudio (trilha, grito, porta, risada…): ele toca no navegador de cada jogador.'));
  for (const s of estado.sons || []) {
    const d = el('div', 'passo-rot'); const info = el('div', 'info'); info.append(el('b', '', '🎵 ' + s.nome));
    const tocar = el('button', 'btn', '▶'); tocar.title = 'Tocar para a mesa'; tocar.onclick = () => post('som/tocar', { id: s.id, volume: Number($('som-volume').value) }).catch(() => {});
    const laco = el('button', 'btn sec', '🔁'); laco.title = 'Tocar em laço (até ⏹ Parar)'; laco.onclick = () => post('som/tocar', { id: s.id, volume: Number($('som-volume').value), repetir: true }).catch(() => {});
    const lixo = el('button', 'btn perigo', '🗑'); lixo.onclick = () => post('som/apagar', { id: s.id }).catch(() => {});
    d.append(info, tocar, laco, lixo); box.append(d);
  }
}
for (const b of document.querySelectorAll('[data-fx]')) b.onclick = () => {
  if (b.dataset.fx === 'explosao') { escolherModo('explodir'); return; }
  post('tela/efeito', { nome: b.dataset.fx }).catch(() => {});
};
for (const b of document.querySelectorAll('[data-clima]')) b.onclick = () => post('tela/clima', { nome: b.dataset.clima, ligado: !b.classList.contains('on') }).catch(() => {});
for (const b of document.querySelectorAll('[data-som]')) b.onclick = () => post('som/tocar', { pronto: b.dataset.som, volume: Number($('som-volume').value) }).catch(() => {});
$('som-parar').onclick = () => post('som/parar', {}).catch(() => {});
$('som-arquivo').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > 8 * 1048576) return mostrarErro('Áudio grande demais (máximo 8 MB).');
  const nome = $('som-nome').value.trim() || f.name.replace(/\.[^.]+$/, '');
  try {
    await post('som/enviar?nome=' + encodeURIComponent(nome), undefined, { headers: { 'Content-Type': 'application/octet-stream' }, body: f });
    $('som-nome').value = ''; aviso('🎵 Som salvo: ' + nome, 'ok');
  } catch {}
};
$('f-som').onclick = () => {
  prefs.sons = !somLigado(); salvarPrefs();
  if (!prefs.sons) { pararSons(); for (const k of Object.keys(somClima)) { somClima[k].stop(); delete somClima[k]; } }
  painelEfeitos();
  aviso(prefs.sons ? '🔊 Sons da mesa ligados.' : '🔇 Sons da mesa desligados (só para você).', '', 2000);
};
addEventListener('resize', () => { if (fxRodando) fxTamanho(); });

// ---------- Status escrito na peça ----------
function salvarStatus(texto) {
  if (!selecionada) return;
  post('peca/status', { peca: selecionada, texto }).then((r) => aviso(r.status ? '💬 Status: ' + r.status : '💬 Status tirado.', 'ok', 1800)).catch(() => {});
}
$('status-texto').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); salvarStatus($('status-texto').value); $('status-texto').blur(); } };
$('status-texto').onchange = () => salvarStatus($('status-texto').value);
$('status-tirar').onclick = () => { $('status-texto').value = ''; salvarStatus(''); };
