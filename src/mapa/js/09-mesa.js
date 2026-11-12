// ======================================================================
// Mesa: dados animados, holofote, régua e áreas compartilhadas, relógios,
// descanso, histórico, ficha para imprimir, bestiário, roteiro e pedidos de música.
// ======================================================================

// Faixas de alcance do Daggerheart na grade (1 casa ≈ 1,5 m).
const faixaDH = (casas) => (casas <= 1.05 ? 'Corpo a corpo' : casas <= 3.05 ? 'Muito Próximo' : casas <= 6.05 ? 'Próximo' : casas <= 12.05 ? 'Longe' : 'Muito Longe');
const rotuloDistancia = (casas) => casas.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + (Math.abs(casas - 1) < 0.05 ? ' casa' : ' casas') + (estado && ehDH() ? ' · ' + faixaDH(casas) : '');

// ---------- Moldura por classe (Daggerheart) ----------
const COR_CLASSE = { bardo: '#c2569a', druida: '#3f9a4b', guardiao: '#3b6fc4', ranger: '#7a9a2a', patrulheiro: '#7a9a2a', ladino: '#5b5b8f', serafim: '#e0b84a', seraph: '#e0b84a', feiticeiro: '#c0432f', guerreiro: '#a8602a', mago: '#2b8fd0' };
const chaveClasse = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const corDaClasse = (p) => (p && p.tipo === 'jogador' && p.ficha && COR_CLASSE[chaveClasse(p.ficha.classe)]) || null;

// ---------- Dados animados na tela de todos ----------
function animarDados(m) {
  if (prefs.dados3d === false || !m || !m.resultado || m.resultado.tipo === 'carta') return;
  const r = m.resultado, velho = $('dados3d'); if (velho) velho.remove();
  const ov = el('div'); ov.id = 'dados3d';
  const palco = el('div', 'palco'); palco.append(el('div', 'quem', m.autor + (m.texto ? ' · ' + m.texto : '')));
  const fila = el('div', 'fila');
  const cubo = (valor, faces, cls, rot) => {
    const d = el('div', 'dado3d ' + (cls || ''));
    for (let i = 1; i <= 6; i++) d.append(el('div', 'face f' + i, i === 1 ? String(valor) : String(1 + Math.floor(Math.random() * faces))));
    if (rot) d.append(el('span', 'rot', rot));
    d.style.animationDelay = fila.children.length * 90 + 'ms';
    fila.append(d);
  };
  let fim;
  if (r.tipo === 'dualidade') {
    cubo(r.esperanca, 12, 'esperanca', 'Esperança'); cubo(r.medo, 12, 'medo', 'Medo');
    if (r.d6) cubo(r.d6, 6, '', r.vantagem > 0 ? 'vantagem' : 'desvantagem');
    fim = { critico: '✨ Sucesso crítico!', esperanca: 'com Esperança', medo: 'com Medo' }[r.resultado];
  } else {
    const dados = r.pedacos.filter((p) => p.t !== 'op' && p.t !== 'fixo' && p.mantido).slice(0, 5);
    for (const p of dados) cubo(p.v, p.faces, '', 'd' + p.faces);
    if (!dados.length) return;
  }
  const tot = el('div', 'total', String(r.total));
  if (fim) tot.append(el('small', r.resultado, fim));
  palco.append(fila, tot); ov.append(palco);
  $('acoes-mapa').parentElement.append(ov);
  setTimeout(() => ov.remove(), 3000);
}

// ---------- Régua compartilhada ----------
const reguasRemotas = new Map(); // quem → { a, b, t, fim }
let ultimaRegua = 0;
function enviarRegua(fim) {
  if (!regua) return;
  const agora = Date.now(); if (!fim && agora - ultimaRegua < 80) return; ultimaRegua = agora;
  efeito({ tipo: 'regua', a: [regua.a.x, regua.a.y], b: [regua.b.x, regua.b.y], fim: !!fim });
}
function receberRegua(d) {
  if (d.quem === estado.voce.id) return;
  reguasRemotas.set(d.quem, { a: { x: d.a[0], y: d.a[1] }, b: { x: d.b[0], y: d.b[1] }, t: performance.now(), fim: d.fim });
  animarRemotas();
}
let animandoRemotas = false;
function animarRemotas() {
  if (animandoRemotas) return; animandoRemotas = true;
  const passo = () => {
    const agora = performance.now();
    for (const [q, r] of reguasRemotas) if (agora - r.t > (r.fim ? 2500 : 6000)) reguasRemotas.delete(q);
    desenhar();
    if (reguasRemotas.size) requestAnimationFrame(passo); else animandoRemotas = false;
  };
  requestAnimationFrame(passo);
}
function pintarRegua(a, b, cor, nome, alfa, px, grade) {
  const d = Math.hypot(b.x - a.x, b.y - a.y) / grade;
  ctx.save(); ctx.globalAlpha = alfa;
  ctx.strokeStyle = cor; ctx.lineWidth = 3 * px; ctx.setLineDash([10 * px, 7 * px]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
  for (const q of [a, b]) { ctx.beginPath(); ctx.arc(q.x, q.y, 5 * px, 0, Math.PI * 2); ctx.fillStyle = cor; ctx.fill(); }
  const txt = (nome ? nome + ': ' : '') + rotuloDistancia(d);
  const fs = 14 * px; ctx.font = '700 ' + fs + 'px ' + FONTE_TITULO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 16 * px, w = ctx.measureText(txt).width + fs * 1.2;
  rodada(ctx, mx - w / 2, my - fs * 0.9, w, fs * 1.8, fs * 0.3); ctx.fillStyle = '#f3e4c2'; ctx.fill(); ctx.lineWidth = 1.2 * px; ctx.strokeStyle = '#7a5218'; ctx.stroke();
  ctx.fillStyle = '#3b2814'; ctx.fillText(txt, mx, my); ctx.restore();
}

// ---------- Áreas de efeito ----------
let formaArea = 'circulo', areaNova = null;
const NOMES_FORMA = { circulo: '⭕ Círculo', cone: '🔺 Cone', linha: '➖ Linha' };
function caminhoArea(a, grade) {
  const dx = a.x2 - a.x, dy = a.y2 - a.y, dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  ctx.beginPath();
  if (a.forma === 'circulo') ctx.arc(a.x, a.y, dist, 0, Math.PI * 2);
  else if (a.forma === 'cone') { ctx.moveTo(a.x, a.y); ctx.arc(a.x, a.y, dist, ang - Math.PI / 6, ang + Math.PI / 6); ctx.closePath(); }
  else { const w = grade / 2, nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w; ctx.moveTo(a.x + nx, a.y + ny); ctx.lineTo(a.x2 + nx, a.y2 + ny); ctx.lineTo(a.x2 - nx, a.y2 - ny); ctx.lineTo(a.x - nx, a.y - ny); ctx.closePath(); }
  return dist / grade;
}
function pintarArea(a, px, grade, previa) {
  const cor = a.cor || '#f0c35a';
  ctx.save();
  const casas = caminhoArea(a, grade);
  ctx.globalAlpha = previa ? 0.22 : 0.18; ctx.fillStyle = cor; ctx.fill();
  ctx.globalAlpha = 0.9; ctx.lineWidth = 2.4 * px; ctx.strokeStyle = cor; if (previa) ctx.setLineDash([8 * px, 6 * px]); ctx.stroke(); ctx.setLineDash([]);
  const txt = (a.forma === 'circulo' ? 'raio ' : '') + rotuloDistancia(casas);
  const fs = 12 * px; ctx.font = '700 ' + fs + 'px ' + FONTE_TITULO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lx = a.forma === 'circulo' ? a.x : (a.x + a.x2) / 2, ly = a.forma === 'circulo' ? a.y : (a.y + a.y2) / 2, w = ctx.measureText(txt).width + fs;
  ctx.globalAlpha = 1; rodada(ctx, lx - w / 2, ly - fs * 0.85, w, fs * 1.7, fs * 0.3); ctx.fillStyle = 'rgba(243,228,194,.92)'; ctx.fill();
  ctx.fillStyle = '#3b2814'; ctx.fillText(txt, lx, ly); ctx.restore();
}
/** Chamado pelo pintar(): áreas, réguas dos outros e a área sendo desenhada. */
function pintarExtras(px, grade) {
  if (caixaSel) {
    const { a, b } = caixaSel, x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    ctx.save(); ctx.fillStyle = 'rgba(245,196,81,.12)'; ctx.fillRect(x, y, w, h); ctx.setLineDash([8 * px, 5 * px]); ctx.lineWidth = 1.6 * px; ctx.strokeStyle = '#f5c451'; ctx.strokeRect(x, y, w, h); ctx.restore();
  }
  // Elementos do grupo: contorno tracejado (as peças usam o destaque normal).
  for (const k of selecao) {
    if (k[0] !== 'e') continue;
    const e = itemDaSelecao(k); if (!e) continue;
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate((e.rotacao * Math.PI) / 180); ctx.setLineDash([7 * px, 5 * px]); ctx.lineWidth = 2 * px; ctx.strokeStyle = '#f5c451'; ctx.strokeRect(-e.largura / 2, -e.altura / 2, e.largura, e.altura); ctx.restore();
  }
  for (const a of estado.areas || []) pintarArea(a, px, grade, false);
  if (areaNova) pintarArea(areaNova, px, grade, true);
  const agora = performance.now();
  for (const [q, r] of reguasRemotas) pintarRegua(r.a, r.b, corDeQuem(q), nomeDeQuem(q), r.fim ? Math.max(0, 1 - (agora - r.t) / 2500) : 1, px, grade);
}
(function montarFormas() {
  for (const f of ['circulo', 'cone', 'linha']) {
    const b = el('button', '', NOMES_FORMA[f]); b.dataset.f = f;
    b.onclick = () => { formaArea = f; for (const x of $('formas').querySelectorAll('[data-f]')) x.classList.toggle('on', x.dataset.f === f); if (modoMapa !== 'area') escolherModo('area'); };
    $('formas').append(b);
  }
  const limpar = el('button', '', '🧹 Apagar as minhas'); limpar.onclick = () => post('area/limpar', {}).catch(() => {});
  $('formas').append(limpar);
})();
$('a-area').onclick = () => {
  const abrir = $('formas').hidden;
  $('formas').hidden = !abrir;
  if (abrir) { for (const x of $('formas').querySelectorAll('[data-f]')) x.classList.toggle('on', x.dataset.f === formaArea); if (modoMapa !== 'area') escolherModo('area'); }
  else if (modoMapa === 'area') escolherModo('area');
};
function soltarArea() {
  const a = areaNova; areaNova = null;
  if (a && Math.hypot(a.x2 - a.x, a.y2 - a.y) > 3) post('area', { forma: a.forma, x: a.x, y: a.y, x2: a.x2, y2: a.y2, cor: a.cor }).catch(() => {});
  desenhar();
}

// ---------- Holofote (de quem é a vez) ----------
let ultimaVez = null;
function painelHolofote() {
  const cb = estado.combate, ban = $('holofote');
  const p = cb.ativo && cb.vez ? estado.pecas.find((q) => q.id === cb.vez) : null;
  ban.hidden = !p;
  if (p) { ban.textContent = (ehDH() ? '🔦 Holofote: ' : '⚔️ Vez de ') + p.nome + (p.meu ? ' (você!)' : ''); ban.classList.toggle('minha', !!p.meu); }
  const vez = p ? p.id : null;
  if (vez && vez !== ultimaVez && p.meu && ultimaVez !== undefined) aviso(ehDH() ? '🔦 O holofote é seu! O que você faz?' : '⚔️ É a sua vez!', 'ok', 4000);
  ultimaVez = vez;
}

// ---------- Relógios de progresso ----------
function svgRelogio(r) {
  const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '-50 -50 100 100');
  for (let i = 0; i < r.total; i++) {
    const a0 = (i / r.total) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / r.total) * Math.PI * 2 - Math.PI / 2;
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', `M0 0 L${Math.cos(a0) * 44} ${Math.sin(a0) * 44} A44 44 0 0 1 ${Math.cos(a1) * 44} ${Math.sin(a1) * 44} Z`);
    path.setAttribute('fill', i < r.marcados ? (r.marcados >= r.total ? '#ff7b54' : '#d9a441') : 'rgba(40,24,10,.75)');
    path.setAttribute('stroke', '#7a5218'); path.setAttribute('stroke-width', '2.5');
    s.append(path);
  }
  const aro = document.createElementNS(ns, 'circle'); aro.setAttribute('r', '46'); aro.setAttribute('fill', 'none'); aro.setAttribute('stroke', '#fbe39a'); aro.setAttribute('stroke-width', '3'); s.append(aro);
  return s;
}
const relogiosCheios = new Set();
function painelRelogios() {
  const box = $('relogios'); box.textContent = '';
  const mestre = estado.voce.mestre;
  for (const r of estado.relogios || []) {
    const d = el('div', 'relogio vidro' + (mestre ? ' mestre' : '') + (r.marcados >= r.total ? ' cheio' : ''));
    const svg = svgRelogio(r);
    if (mestre) {
      svg.onclick = () => post('relogio/marcar', { id: r.id, delta: 1 }).catch(() => {});
      svg.oncontextmenu = (e) => { e.preventDefault(); post('relogio/marcar', { id: r.id, delta: -1 }).catch(() => {}); };
      d.title = 'Clique: avança · botão direito: volta';
    }
    const txt = el('div'); txt.append(el('b', '', (r.secreto ? '🙈 ' : '') + r.nome), el('small', '', `${r.marcados}/${r.total}`));
    d.append(svg, txt); box.append(d);
    if (r.marcados >= r.total && !relogiosCheios.has(r.id) && estado._carregou) aviso(`⏳ O relógio "${r.nome}" se completou!`, 'ok', 4000);
    if (r.marcados >= r.total) relogiosCheios.add(r.id); else relogiosCheios.delete(r.id);
  }
  // Gaveta do mestre: criar e apagar.
  $('painel-relogios').hidden = !mestre;
  if (!mestre) return;
  const lista = $('relogios-lista'); lista.textContent = '';
  if (!(estado.relogios || []).length) lista.append(el('div', 'mudo', 'Nenhum relógio. Crie um para contar até algo acontecer: os guardas chegarem, o ritual terminar, a ponte cair…'));
  for (const r of estado.relogios || []) {
    const d = el('div', 'passo-rot'); const info = el('div', 'info'); info.append(el('b', '', r.nome), el('small', '', `${r.marcados}/${r.total} partes${r.secreto ? ' · só você vê' : ''}`));
    const menos = el('button', 'btn sec', '−'); menos.onclick = () => post('relogio/marcar', { id: r.id, delta: -1 }).catch(() => {});
    const mais = el('button', 'btn sec', '＋'); mais.onclick = () => post('relogio/marcar', { id: r.id, delta: 1 }).catch(() => {});
    const olho = el('button', 'btn sec', r.secreto ? '👁️' : '🙈'); olho.title = r.secreto ? 'Mostrar para a mesa' : 'Esconder da mesa'; olho.onclick = () => post('relogio/secreto', { id: r.id, secreto: !r.secreto }).catch(() => {});
    const lixo = el('button', 'btn perigo', '🗑'); lixo.onclick = () => post('relogio/apagar', { id: r.id }).catch(() => {});
    d.append(info, menos, mais, olho, lixo); lista.append(d);
  }
}
$('relogio-criar').onclick = () => {
  post('relogio/novo', { nome: $('relogio-nome').value, total: Number($('relogio-total').value), secreto: $('relogio-secreto').checked })
    .then(() => { $('relogio-nome').value = ''; }).catch((e) => aviso(e.message, 'erro'));
};

// ---------- Visão e notas da cena (mestre) ----------
function painelCenaExtra() {
  if (!estado.voce.mestre) return;
  if (document.activeElement !== $('visao-raio')) $('visao-raio').value = estado.mapa.visao || 0;
  const ativa = estado.cenas.find((c) => c.ativa);
  $('linha-notas-cena').hidden = !ativa;
  if (ativa && document.activeElement !== $('notas-cena')) { $('notas-cena').value = ativa.notas || ''; $('notas-cena').dataset.id = ativa.id; }
}
$('visao-raio').onchange = () => post('visao', { raio: Number($('visao-raio').value) || 0 }).then((r) => aviso(r.raio ? `👁️ Os personagens revelam ${r.raio} casas em volta ao andar (com a névoa ligada).` : '👁️ Visão desligada: só você revela a névoa.', 'ok', 3500)).catch((e) => aviso(e.message, 'erro'));
$('notas-cena').onchange = () => post('cena/notas', { id: Number($('notas-cena').dataset.id), notas: $('notas-cena').value }).then(() => aviso('📝 Notas da cena salvas.', 'ok', 1800)).catch((e) => aviso(e.message, 'erro'));

// ---------- Descanso guiado (Daggerheart) ----------
let escolhasDescanso = [];
const NOMES_DESC = { ferimentos: '🩹 Cuidar dos ferimentos', estresse: '😮‍💨 Aliviar o Estresse', armadura: '🛡️ Consertar a armadura', preparar: '🔥 Preparar-se' };
function desenharDescanso() {
  const longo = $('desc-longo').checked, box = $('desc-opcoes'); box.textContent = '';
  const dica = { ferimentos: longo ? 'Limpa todos os PV marcados' : 'Limpa 1d4 + tier de PV', estresse: longo ? 'Limpa todo o Estresse' : 'Limpa 1d4 + tier de Estresse', armadura: longo ? 'Conserta toda a Armadura' : 'Conserta 1d4 + tier de Armadura', preparar: '+1 Esperança (+2 se o grupo se preparar junto)' };
  for (const k of Object.keys(NOMES_DESC)) {
    const n = escolhasDescanso.filter((e) => e === k).length;
    const b = el('button', 'btn ' + (n ? '' : 'sec')); b.type = 'button';
    b.append(el('b', '', NOMES_DESC[k]), document.createElement('br'), el('small', '', dica[k]));
    if (n) b.append(el('span', 'n', '×' + n));
    b.onclick = () => { if (escolhasDescanso.length >= 2) escolhasDescanso.shift(); escolhasDescanso.push(k); desenharDescanso(); };
    box.append(b);
  }
  $('desc-ok').disabled = escolhasDescanso.length !== 2;
  $('desc-ok').textContent = escolhasDescanso.length === 2 ? (longo ? '🏕️ Descansar (longo)' : '☕ Descansar (curto)') : `Escolha ${2 - escolhasDescanso.length} movimento${escolhasDescanso.length === 1 ? '' : 's'}`;
}
function abrirDescanso() { escolhasDescanso = []; $('desc-curto').checked = true; $('desc-juntos').checked = false; desenharDescanso(); $('modal-descanso').hidden = false; }
$('desc-curto').onchange = $('desc-longo').onchange = desenharDescanso;
$('desc-ok').onclick = () => {
  post('descanso', { tipo: $('desc-longo').checked ? 'longo' : 'curto', escolhas: escolhasDescanso, juntos: $('desc-juntos').checked })
    .then((r) => { $('modal-descanso').hidden = true; aviso('🏕️ ' + r.texto, 'ok', 6000); }).catch((e) => aviso(e.message, 'erro'));
};
for (const [id, tipo] of [['medo-curto', 'curto'], ['medo-longo', 'longo']]) {
  $(id).onclick = () => post('descanso/medo', { tipo }).then((r) => aviso(`😱 +${r.ganho} de Medo pelo descanso ${tipo} (agora ${r.medo}).`, 'ok', 4000)).catch((e) => aviso(e.message, 'erro'));
}

// ---------- Histórico do personagem ----------
function painelHistorico() {
  const box = $('meu-historico'); if (!box) return;
  const h = estado.historico || [];
  $('ver-historico').hidden = !minhaPeca() || !h.length;
  box.textContent = '';
  for (const l of h) { const d = el('div'); d.append(el('time', '', new Date(l.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })), document.createTextNode(l.texto)); box.append(d); }
}
$('ver-historico').onclick = () => { $('meu-historico').hidden = !$('meu-historico').hidden; $('ver-historico').classList.toggle('on', !$('meu-historico').hidden); };

// ---------- Ficha para imprimir ----------
async function imprimirFicha(p) {
  if (!p || !p.ficha) return aviso('Crie a ficha antes de imprimir.', 'erro');
  const f = p.ficha, dh = ehDH(), w = open('', '_blank');
  if (!w) return aviso('O navegador bloqueou a janela: libere os pop-ups deste site.', 'erro');
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const caixas = (total, marcadas) => Array.from({ length: Number(total) || 0 }, (_, i) => `<span class="cx${i < marcadas ? ' m' : ''}"></span>`).join('');
  let corpo;
  if (dh) {
    let cartas = '';
    if (p.prancheta) {
      try { if (!catalogoCartas) await carregarCatalogo(); } catch {}
      const nome = (id) => (catalogoCartas && catalogoCartas.mapa.get(id) ? catalogoCartas.mapa.get(id).nome : id);
      const grupo = (l, t) => { const cs = p.prancheta.minhas.filter((m) => m.lugar === l); return cs.length ? `<h3>${t}</h3><ul>${cs.map((m) => `<li>${esc(nome(m.carta))}</li>`).join('')}</ul>` : ''; };
      cartas = `<section><h2>Cartas</h2>${grupo('base', 'Fundação')}${grupo('carregamento', 'Carregamento')}${grupo('cofre', 'Cofre')}</section>`;
    }
    const tracos = [['Agilidade', f.agilidade], ['Força', f.forca], ['Acuidade', f.acuidade], ['Instinto', f.instinto], ['Presença', f.presenca], ['Conhecimento', f.conhecimento]];
    corpo = `
      <section class="tracos">${tracos.map(([n, v]) => `<div class="tr"><b>${Number(v) >= 0 ? '+' : ''}${esc(v)}</b><span>${n}</span></div>`).join('')}</section>
      <section class="lado">
        <div class="bloco"><h2>Defesa</h2><p>Evasão <b>${esc(f.evasao)}</b> · Proficiência <b>${esc(f.proficiencia)}</b></p>
          <p>Limiares: Menor 1 · Maior <b>${esc(f.limiar_maior)}</b> · Grave <b>${esc(f.limiar_grave)}</b></p>
          <p>Armadura ${caixas(f.armadura_max, Number(f.armadura))}</p></div>
        <div class="bloco"><h2>Vida e ânimo</h2><p>PV ${caixas(f.pv_max, Number(f.pv))}</p><p>Estresse ${caixas(f.estresse_max, Number(f.estresse))}</p><p>Esperança ${caixas(6, Number(f.esperanca))}</p></div>
      </section>
      <section><h2>Experiências</h2><p>${esc(f.experiencias || '—').replace(/\n/g, '<br>')}</p></section>${cartas}`;
  } else {
    const pular = new Set(['nome', 'classe', 'nivel', 'guia']);
    corpo = `<section><h2>Ficha</h2><table>${Object.entries(f).filter(([k]) => !pular.has(k)).map(([k, v]) => `<tr><th>${esc(k.replace(/_/g, ' '))}</th><td>${esc(v)}</td></tr>`).join('')}</table></section>`;
  }
  const subt = [f.classe, f.ancestralidade, f.comunidade, 'nível ' + f.nivel].filter(Boolean).map(esc).join(' · ');
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(f.nome)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Georgia, 'Palatino Linotype', serif; color: #2b1a08; background: #fbf4e2; margin: 0; padding: 24px; }
  h1 { font-size: 30px; margin: 0; letter-spacing: .04em; } .sub { color: #7a5218; margin: 4px 0 16px; font-style: italic; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .12em; border-bottom: 2px solid #b8862f; padding-bottom: 3px; margin: 14px 0 8px; }
  h3 { font-size: 13px; margin: 8px 0 2px; } ul { margin: 0; padding-left: 18px; }
  .topo { display: flex; gap: 16px; align-items: center; } .topo img { width: 92px; height: 92px; border-radius: 50%; object-fit: cover; border: 3px solid #b8862f; }
  .tracos { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
  .tr { border: 2px solid #b8862f; border-radius: 10px; text-align: center; padding: 8px 4px; } .tr b { display: block; font-size: 24px; } .tr span { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  .lado { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .bloco p { margin: 6px 0; }
  .cx { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #7a5218; border-radius: 3px; margin: 0 2px; vertical-align: middle; } .cx.m { background: #7a5218; }
  table { border-collapse: collapse; width: 100%; } th, td { border-bottom: 1px solid #e0cfa8; padding: 4px 6px; text-align: left; font-size: 13px; } th { text-transform: capitalize; width: 40%; }
  .rodape { margin-top: 22px; font-size: 11px; color: #9a7a4a; text-align: center; }
  @media print { body { background: #fff; padding: 0; } .nao-imprime { display: none; } }
  .nao-imprime { position: fixed; top: 12px; right: 12px; padding: 8px 16px; font: 700 14px Georgia, serif; background: #d9a441; border: 1px solid #7a5218; border-radius: 8px; cursor: pointer; }
</style></head><body>
<button class="nao-imprime" onclick="print()">🖨️ Imprimir / salvar PDF</button>
<div class="topo">${p.avatar ? `<img src="${esc(new URL(p.avatar, location.href).href)}" alt="">` : ''}<div><h1>${esc(f.nome)}</h1><div class="sub">${subt}</div></div></div>
${corpo}
<div class="rodape">${esc(estado.campanha.nome)} · ${dh ? 'Daggerheart' : 'D&D 3.5'} · tirada do mapa da Taverna em ${new Date().toLocaleDateString('pt-BR')}</div>
</body></html>`);
  w.document.close();
}
$('imprimir-ficha').onclick = () => imprimirFicha(minhaPeca());

// ---------- Pedidos de música ----------
let pedidosVistos = null;
function painelPedidos() {
  const mestre = estado.voce.mestre, lista = estado.pedidosMusica || [];
  $('painel-pedir').hidden = mestre || !estado.voce.jogador;
  const meus = $('meus-pedidos'); meus.textContent = '';
  if (!mestre) {
    for (const p of lista) {
      const d = el('div', 'passo-rot'); const info = el('div', 'info'); info.append(el('b', '', '🎶 ' + p.busca), el('small', '', 'esperando o mestre'));
      const x = el('button', 'btn sec', '✕'); x.title = 'Cancelar o pedido'; x.onclick = () => post('musica/cancelar', { id: p.id }).catch(() => {});
      d.append(info, x); meus.append(d);
    }
  }
  const box = $('pedidos-musica'); if (!box) return;
  box.hidden = !mestre || !lista.length; box.textContent = '';
  if (!mestre) return;
  if (lista.length) box.append(el('div', 'rotulo-sec', '🎶 Pedidos dos jogadores'));
  for (const p of lista) {
    const d = el('div', 'passo-rot'); const info = el('div', 'info'); info.append(el('b', '', p.busca), el('small', '', 'pedido por ' + p.quem));
    const sim = el('button', 'btn', '▶️'); sim.title = 'Tocar agora'; sim.onclick = () => post('musica/pedido', { id: p.id, aceitar: true }).then((r) => aviso('🎵 ' + (r.msg || 'Tocando.'), 'ok')).catch((e) => aviso(e.message, 'erro'));
    const nao = el('button', 'btn sec', '✕'); nao.title = 'Recusar'; nao.onclick = () => post('musica/pedido', { id: p.id, aceitar: false }).catch(() => {});
    d.append(info, sim, nao); box.append(d);
  }
  const ids = lista.map((p) => p.id);
  if (pedidosVistos && ids.some((id) => !pedidosVistos.includes(id))) aviso('🎶 Um jogador pediu uma música (gaveta 🎵).', 'ok', 4000);
  pedidosVistos = ids;
}
$('pedir-tocar').onclick = () => {
  const busca = $('pedir-busca').value.trim(); if (!busca) return;
  post('musica/pedir', { busca }).then(() => { $('pedir-busca').value = ''; aviso('🎶 Pedido enviado ao mestre.', 'ok'); }).catch((e) => aviso(e.message, 'erro'));
};
$('pedir-busca').onkeydown = (e) => { if (e.key === 'Enter') $('pedir-tocar').onclick(); };

// ---------- Roteiro da sessão (mestre) ----------
let editandoPasso = null;
function preencherSelectsRoteiro() {
  const cena = $('rot-cena'), amb = $('rot-ambiente'), ho = $('rot-handout');
  const manter = (s) => s.value;
  const [vc, va, vh] = [manter(cena), manter(amb), manter(ho)];
  cena.textContent = ''; cena.append(new Option('— mesma cena —', ''));
  for (const c of estado.cenas) cena.append(new Option('🎬 ' + c.nome, c.id));
  amb.textContent = ''; amb.append(new Option('— sem trilha —', ''));
  for (const a of (estado.musica && estado.musica.ambientes) || []) amb.append(new Option('🎵 ' + a.nome, a.id));
  amb.append(new Option('🔎 Música pelo nome ou link…', '__busca'));
  ho.textContent = ''; ho.append(new Option('— sem handout —', ''));
  for (const h of estado.handouts || []) ho.append(new Option('📜 ' + h.titulo, h.id));
  cena.value = vc; amb.value = va; ho.value = vh;
  $('rot-musica').hidden = amb.value !== '__busca';
}
function painelRoteiro() {
  $('painel-roteiro').hidden = !estado.voce.mestre;
  if (!estado.voce.mestre) return;
  preencherSelectsRoteiro();
  const box = $('roteiro'); box.textContent = '';
  const passos = estado.roteiro || [];
  if (!passos.length) box.append(el('div', 'mudo', 'Monte a sessão antes de começar: cada passo abre uma cena, toca a música e mostra um handout com um clique só.'));
  const nomeCena = (id) => (estado.cenas.find((c) => c.id === id) || {}).nome;
  const nomeAmb = (id) => ((estado.musica && estado.musica.ambientes.find((a) => a.id === id)) || {}).nome;
  const nomeHo = (id) => ((estado.handouts || []).find((h) => h.id === id) || {}).titulo;
  passos.forEach((p, i) => {
    const d = el('div', 'passo-rot' + (p.feito ? ' feito' : ''));
    const feito = el('input'); feito.type = 'checkbox'; feito.checked = p.feito; feito.title = 'Feito'; feito.onchange = () => post('roteiro/feito', { id: p.id, feito: feito.checked }).catch(() => {});
    const info = el('div', 'info');
    const partes = [p.cena_id ? '🎬 ' + (nomeCena(p.cena_id) || 'cena apagada') : '', p.ambiente ? '🎵 ' + (nomeAmb(p.ambiente) || p.ambiente) : p.musica ? '🎵 ' + p.musica : '', p.handout_id ? '📜 ' + (nomeHo(p.handout_id) || 'handout apagado') : ''].filter(Boolean);
    info.append(el('b', '', `${i + 1}. ${p.titulo}`), el('small', '', partes.join(' · ') || 'só anotação'));
    if (p.notas) info.title = p.notas;
    const ir = el('button', 'btn', '▶'); ir.title = 'Executar: abre a cena, toca a música e mostra o handout';
    ir.onclick = () => post('roteiro/executar', { id: p.id }).then((r) => aviso('▶ ' + p.titulo + (r.feitos.length ? ': ' + r.feitos.join(', ') : '') + (r.avisos.length ? ' · ⚠️ ' + r.avisos.join('; ') : ''), r.avisos.length ? 'erro' : 'ok', 4000)).catch((e) => aviso(e.message, 'erro'));
    const cima = el('button', 'btn sec', '↑'); cima.onclick = () => post('roteiro/mover', { id: p.id, dir: -1 }).catch(() => {});
    const baixo = el('button', 'btn sec', '↓'); baixo.onclick = () => post('roteiro/mover', { id: p.id, dir: 1 }).catch(() => {});
    const edit = el('button', 'btn sec', '✏️'); edit.onclick = () => editarPasso(p);
    const lixo = el('button', 'btn perigo', '🗑'); lixo.onclick = () => post('roteiro/apagar', { id: p.id }).catch(() => {});
    d.append(feito, info, ir, cima, baixo, edit, lixo); box.append(d);
  });
  $('rot-limpar').hidden = !passos.some((p) => p.feito);
}
function editarPasso(p) {
  editandoPasso = p ? p.id : null;
  $('rot-titulo').value = p ? p.titulo : ''; $('rot-cena').value = p && p.cena_id ? p.cena_id : '';
  $('rot-ambiente').value = p ? (p.ambiente || (p.musica ? '__busca' : '')) : ''; $('rot-musica').value = p && p.musica ? p.musica : '';
  $('rot-handout').value = p && p.handout_id ? p.handout_id : ''; $('rot-notas').value = p ? p.notas : '';
  $('rot-musica').hidden = $('rot-ambiente').value !== '__busca';
  $('rot-salvar').textContent = p ? '💾 Salvar passo' : '+ Passo'; $('rot-cancelar').hidden = !p;
  if (p) $('rot-titulo').focus();
}
$('rot-ambiente').onchange = () => { $('rot-musica').hidden = $('rot-ambiente').value !== '__busca'; };
$('rot-cancelar').onclick = () => editarPasso(null);
$('rot-limpar').onclick = () => post('roteiro/limpar-feitos', {}).catch(() => {});
$('rot-salvar').onclick = () => {
  const amb = $('rot-ambiente').value;
  const corpo = { id: editandoPasso, titulo: $('rot-titulo').value, cena_id: Number($('rot-cena').value) || null, ambiente: amb && amb !== '__busca' ? amb : null, musica: amb === '__busca' ? $('rot-musica').value : null, handout_id: Number($('rot-handout').value) || null, notas: $('rot-notas').value };
  post(editandoPasso ? 'roteiro/editar' : 'roteiro/novo', corpo).then(() => editarPasso(null)).catch((e) => aviso(e.message, 'erro'));
};

// ---------- Bestiário e encontros (mestre, Daggerheart) ----------
let bestiarioLista = null, encontro = [], abaBes = 'lista';
const TIER_DO_NIVEL = (n) => (n <= 1 ? 1 : n <= 4 ? 2 : n <= 7 ? 3 : 4);
async function abrirBestiario() {
  $('modal-bestiario').hidden = false;
  if (!bestiarioLista) {
    $('bes-lista').textContent = 'Abrindo o bestiário…';
    try { const r = await pegar('bestiario'); bestiarioLista = r.lista; } catch (e) { $('bes-lista').textContent = e.message; return; }
    const tipos = [...new Set(bestiarioLista.map((a) => a.tipo))].sort();
    for (const t of tipos) $('bes-tipo').append(new Option(t, t));
    // Nível sugerido: o tier médio dos personagens na mesa; PJs: quantos têm ficha.
    const pjs = estado.pecas.filter((p) => p.tipo === 'jogador' && p.ficha);
    $('enc-pjs').value = Math.max(1, pjs.length || 4);
    const media = pjs.length ? pjs.reduce((t, p) => t + Number(p.ficha.nivel || 1), 0) / pjs.length : 1;
    $('bes-nivel').value = $('enc-nivel').value = String(TIER_DO_NIVEL(Math.round(media)));
  }
  desenharBestiario();
}
function cartaoAdversario(a, noEncontro) {
  const d = el('div', 'bes');
  const cab = el('div', 'cab'); cab.append(el('b', '', a.nome), el('span', 'tag', `${a.tipo} · Nível ${a.nivel}${a.nivelEstimado ? '?' : ''}`));
  const acoes = el('div', 'acoes');
  if (noEncontro !== undefined) {
    const x = el('button', 'btn sec', '✕'); x.title = 'Tirar do encontro'; x.onclick = () => { encontro.splice(noEncontro, 1); desenharBestiario(); };
    acoes.append(x);
  } else {
    const bib = el('button', 'btn sec', '+ Biblioteca'); bib.onclick = () => post('bestiario/importar', { id: a.id }).then(() => aviso(`👹 ${a.nome} está na biblioteca.`, 'ok')).catch((e) => aviso(e.message, 'erro'));
    const mapa = el('button', 'btn sec', '📍 No mapa'); mapa.onclick = () => { const c = centroDaTela(); post('bestiario/importar', { id: a.id, colocar: true, x: c.x, y: c.y }).then((r) => aviso(`📍 ${r.nome} entrou no mapa.`, 'ok')).catch((e) => aviso(e.message, 'erro')); };
    const enc = el('button', 'btn', '+ Encontro'); enc.onclick = () => { encontro.push(a); aviso(`⚔️ ${a.nome} no encontro (${encontro.length}).`, 'ok', 1500); };
    acoes.append(bib, mapa, enc);
  }
  cab.append(acoes);
  const num = el('div', 'num', `Dificuldade ${a.dificuldade} · Limiares ${a.limiarMaior ?? '—'}/${a.limiarGrave ?? '—'} · PV ${a.pv}${a.horda ? ` (Horda ${a.horda}/PV)` : ''} · Estresse ${a.estresse}` + (a.arma ? ` · ATQ ${a.ataque >= 0 ? '+' : ''}${a.ataque} ${a.arma} (${a.alcance}) ${a.dano} ${a.tipoDano}` : ''));
  const det = el('details'); det.append(el('summary', '', 'Descrição e recursos'));
  if (a.descricao) det.append(el('p', '', a.descricao));
  if (a.motivos) det.append(el('p', '', 'Motivos e táticas: ' + a.motivos));
  if (a.experiencias) det.append(el('p', '', 'Experiência: ' + a.experiencias));
  for (const r of a.recursos) det.append(el('p', '', '• ' + r));
  d.append(cab, num, det);
  return d;
}
const CUSTO = { Lacaio: 1, Social: 1, Suporte: 1, Horda: 2, 'À distância': 2, Skulk: 2, Padrão: 2, Líder: 3, Bruiser: 4, Solo: 5 };
function desenharBestiario() {
  for (const b of $('modal-bestiario').querySelectorAll('[data-aba]')) b.classList.toggle('on', b.dataset.aba === abaBes);
  $('bes-filtros').hidden = abaBes !== 'lista'; $('enc-filtros').hidden = abaBes !== 'encontro';
  const box = $('bes-lista'); box.textContent = '';
  if (!bestiarioLista) return;
  if (abaBes === 'lista') {
    const q = chaveClasse($('bes-busca').value), nivel = $('bes-nivel').value, tipo = $('bes-tipo').value;
    const achados = bestiarioLista.filter((a) => (!nivel || String(a.nivel) === nivel) && (!tipo || a.tipo === tipo) && (!q || chaveClasse(a.nome + ' ' + a.descricao).includes(q)));
    $('bes-conta').textContent = `${achados.length} adversário${achados.length === 1 ? '' : 's'}`;
    for (const a of achados.slice(0, 80)) box.append(cartaoAdversario(a));
    if (achados.length > 80) box.append(el('div', 'mudo', 'Mostrando 80. Use a busca para achar os outros.'));
    return;
  }
  const pjs = Math.max(1, Number($('enc-pjs').value) || 4);
  let pontos = 3 * pjs + 2;
  if ($('enc-facil').checked) pontos -= 1;
  if ($('enc-dificil').checked) pontos += 2;
  if ($('enc-dano').checked) pontos -= 2;
  if (encontro.filter((a) => a.tipo === 'Solo').length >= 2) pontos -= 2;
  if (encontro.length && !encontro.some((a) => ['Bruiser', 'Horda', 'Líder', 'Solo'].includes(a.tipo))) pontos += 1;
  const gastos = encontro.reduce((t, a) => t + CUSTO[a.tipo], 0);
  const orc = el('div', 'orcamento' + (gastos > pontos ? ' estourou' : ''), `⚔️ ${gastos} de ${pontos} Pontos de Batalha` + (gastos > pontos ? ' · passou do orçamento' : gastos < pontos ? ` · sobram ${pontos - gastos}` : ' · na medida'));
  box.append(orc);
  if (!encontro.length) box.append(el('div', 'mudo', 'Clique em 🎲 Sugerir, ou use + Encontro na aba Bestiário. (3 × PJs) + 2 pontos; lacaios custam 1 por grupo do tamanho do grupo.'));
  encontro.forEach((a, i) => box.append(cartaoAdversario(a, i)));
  $('enc-colocar').disabled = !encontro.length;
}
for (const b of $('modal-bestiario').querySelectorAll('[data-aba]')) b.onclick = () => { abaBes = b.dataset.aba; desenharBestiario(); };
for (const id of ['bes-busca', 'bes-nivel', 'bes-tipo', 'enc-pjs', 'enc-facil', 'enc-dificil', 'enc-dano']) $(id).addEventListener('input', desenharBestiario);
$('enc-sugerir').onclick = () => post('bestiario/encontro', { pjs: Number($('enc-pjs').value), nivel: Number($('enc-nivel').value), maisFacil: $('enc-facil').checked, maisDificil: $('enc-dificil').checked, danoExtra: $('enc-dano').checked })
  .then((r) => { encontro = r.ids.map((id) => bestiarioLista.find((a) => a.id === id)).filter(Boolean); desenharBestiario(); }).catch((e) => aviso(e.message, 'erro'));
$('enc-limpar').onclick = () => { encontro = []; desenharBestiario(); };
$('enc-colocar').onclick = () => { const c = centroDaTela(); post('bestiario/colocar-encontro', { ids: encontro.map((a) => a.id), x: c.x, y: c.y }).then((r) => { aviso(`⚔️ ${r.nomes.length} peças no mapa.`, 'ok'); $('modal-bestiario').hidden = true; }).catch((e) => aviso(e.message, 'erro')); };

// ---------- Anúncio na tela (sessão começou / acabou) ----------
function mostrarAnuncio(d) {
  const velho = $('anuncio'); if (velho) velho.remove();
  const a = el('div'); a.id = 'anuncio';
  const cx = el('div', 'caixa-a'); cx.append(el('h2', '', d.titulo), el('p', '', d.texto));
  const ok = el('button', 'btn', d.momento === 'fim' ? 'Até a próxima!' : 'Bora jogar!'); ok.onclick = () => a.remove();
  cx.append(ok); a.append(cx); document.body.append(a);
  a.onclick = (e) => { if (e.target === a) a.remove(); };
  if (d.momento === 'inicio') setTimeout(() => a.remove(), 8000);
}

// Barra de ações do mapa: se não couber na largura do mapa, fica só com os ícones.
function ajustarAcoes() {
  const barra = $('acoes-mapa'), largura = barra.parentElement.clientWidth - 40;
  barra.classList.remove('compacta');
  if (barra.scrollWidth > largura) barra.classList.add('compacta');
}
addEventListener('resize', () => { if (estado) ajustarAcoes(); });
