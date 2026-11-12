// ---------- Mapa ----------

/** Junta pedidos: se já está baixando, marca para baixar de novo uma vez quando terminar. */
function juntar(fn) {
  let rodando = null, deNovo = false;
  const chamar = () => {
    if (rodando) { deNovo = true; return rodando; }
    rodando = (async () => {
      try { await fn(); } finally {
        rodando = null;
        if (deNovo) { deNovo = false; setTimeout(() => chamar().catch(() => {}), 0); }
      }
    })();
    return rodando;
  };
  return chamar;
}
async function carregar() { return carregarJunto(); }
const carregarJunto = juntar(carregarAgora);
async function carregarAgora() {
  const novo = await pegar('estado');
  const sig = JSON.stringify(novo);
  if (estado && sig === sigEstado) return;
  sigEstado = sig;
  // Quem está arrastando não perde a peça por causa de um aviso de outro jogador.
  if (arrasto && arrasto.peca) { const p = novo.pecas.find((q) => q.id === arrasto.peca.id); if (p) { p.x = arrasto.peca.x; p.y = arrasto.peca.y; arrasto.peca = p; } }
  // Passo do WASD ainda a caminho do servidor: a peça não volta para trás por causa de uma leitura antiga.
  if (passoPendente) {
    const p = novo.pecas.find((q) => q.id === passoPendente.id);
    if (!p || Date.now() > passoPendente.ate || (p.x === passoPendente.x && p.y === passoPendente.y)) passoPendente = null;
    else { p.x = passoPendente.x; p.y = passoPendente.y; }
  }
  const primeira = !estado;
  estado = novo;
  if (versaoImagem !== estado.mapa.versao) {
    versaoImagem = estado.mapa.versao; imagem = null;
    if (estado.mapa.temImagem) { const i = new Image(); i.onload = () => { imagem = i; desenhar(); }; i.src = api('imagem') + '?v=' + versaoImagem; }
    ajustou = false;
  }
  if (!ajustou) ajustar();
  if (primeira) montarBarra();
  painel(); desenhar();
  if (chat.length) desenharChat(); // a foto de um NPC pode ter mudado
  // Jogador sem personagem nesta mesa: a ficha abre sozinha na primeira vez.
  if (primeira && estado.voce.jogador && !estado.voce.temFicha) abrirFicha();
}

function dimensionar() {
  const dpr = devicePixelRatio || 1, w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (cv.width === w && cv.height === h) return false;
  cv.width = w; cv.height = h; return true;
}

function ajustar() {
  dimensionar();
  const { largura, altura } = estado.mapa;
  const z = Math.min(cv.width / largura, cv.height / altura) * 0.92;
  cam = { z, x: (cv.width - largura * z) / 2, y: (cv.height - altura * z) / 2 };
  ajustou = true;
}
function zoomCentro(f) {
  const cx = cv.width / 2, cy = cv.height / 2, wx = (cx - cam.x) / cam.z, wy = (cy - cam.y) / cam.z;
  cam.z = Math.min(6, Math.max(0.05, cam.z * f)); cam.x = cx - wx * cam.z; cam.y = cy - wy * cam.z; desenhar();
}

function painel() {
  const nomeCamp = estado.campanha.nome, sistema = estado.campanha.sistema === 'dh' ? 'Daggerheart' : 'D&D 3.5';
  $('titulo').textContent = nomeCamp + (estado.mapa.cena ? ' · ' + estado.mapa.cena : ''); $('sub').textContent = sistema + ' · mestre ' + estado.campanha.mestre;
  $('titulo2').textContent = '🐉 ' + nomeCamp; $('sub2').textContent = sistema + ' · mestre ' + estado.campanha.mestre;
  document.title = '🗺️ ' + nomeCamp;
  $('eu-nome').textContent = estado.voce.nome; $('eu-papel').textContent = estado.voce.mestre ? '🐉 Mestre' : '⚔️ Jogador';
  pintarAvatar($('eu-avatar'), estado.voce.nome, estado.voce.avatar);
  $('painel-mestre').hidden = !estado.voce.mestre;
  $('rotulo-escondida').hidden = !estado.voce.mestre;
  if (estado.voce.mestre && document.activeElement !== $('grade')) $('grade').value = estado.mapa.grade;
  const semMapa = !estado.mapa.temImagem;
  $('vazio').hidden = !(semMapa && estado.voce.mestre);
  $('aviso-espera').hidden = !(semMapa && !estado.voce.mestre);

  const lista = $('lista'); lista.textContent = '';
  for (const p of estado.pecas) {
    const d = el('div', 'item' + (p.id === selecionada ? ' sel' : ''));
    const av = el('div', 'avatar'); pintarAvatar(av, p.nome, p.avatar, corDe(p));
    const t = el('div');
    t.append(el('div', 'nome', p.nome + (p.meu ? ' (você)' : '')), el('small', '', p.tipo === 'inimigo' ? '👹 Inimigo' : p.npc ? '🎭 NPC do mestre' : p.jogador));
    d.append(av, t);
    d.onclick = () => { selecionada = p.id; centralizar(p); painel(); desenhar(); };
    lista.append(d);
  }
  if (!estado.pecas.length) lista.append(el('span', 'mudo', 'Nenhum personagem na campanha ainda.'));

  // "Falar como": o mestre escolhe se o chat e as rolagens saem em nome dele ou de um NPC.
  const temNpc = estado.pecas.some((p) => p.npc);
  $('linha-como').hidden = !(estado.voce.mestre && temNpc);
  if (estado.voce.mestre) {
    const sel = $('como'), atual = sel.value; sel.textContent = '';
    sel.append(new Option('Eu (mestre)', ''));
    for (const p of estado.pecas) if (p.npc) sel.append(new Option((p.tipo === 'inimigo' ? '👹 ' : '🎭 ') + p.nome, String(p.id)));
    sel.value = [...sel.options].some((o) => o.value === atual) ? atual : '';
  }
  painelBiblioteca();
  painelMeu();
  painelCombate();
  painelCenas();
  painelImersao();
  painelEntreSessoes();
  painelLivro();
  painelMesaExtra();
  atualizarDock();
  $('a-foco').hidden = !estado.voce.mestre;
  if (!$('modal-cartas').hidden) { opcoesCartas = null; desenharPrancheta().catch(() => {}); }
  if (estado.voce.mestre && document.activeElement !== $('vida-inimigos')) $('vida-inimigos').value = estado.vidaInimigos;

  // Bandeja do grupo (jogadores sempre; NPCs só o mestre vê aqui)
  const bandeja = $('bandeja'); bandeja.textContent = '';
  const visiveis = estado.pecas.filter((p) => !p.npc || estado.voce.mestre);
  bandeja.hidden = !visiveis.length;
  for (const p of visiveis) {
    const c = el('div', 'card' + (p.id === selecionada ? ' sel' : '') + (p.meu ? ' meu' : ''));
    const l1 = el('div', 'linha1'); const av = el('div', 'avatar'); pintarAvatar(av, p.nome, p.avatar, corDe(p));
    l1.append(av, el('div', 'nome', p.nome)); c.append(l1);
    const pv = fracPV(p);
    if (pv) { const b = el('div', 'barra-pv ' + classeBarra(pv.frac)); const i = el('i'); i.style.width = Math.round(pv.frac * 100) + '%'; b.append(i); c.append(b, el('small', '', pv.texto)); }
    else c.append(el('small', '', p.tipo === 'inimigo' ? 'Inimigo' : p.npc ? 'NPC' : (p.ficha && p.ficha.classe) || p.jogador || ''));
    c.onclick = () => { selecionada = p.id; centralizar(p); painel(); desenhar(); };
    bandeja.append(c);
  }
  fichaCard();
}

const NOMES = { forca: 'Força', destreza: 'Destreza', constituicao: 'Constituição', inteligencia: 'Inteligência', sabedoria: 'Sabedoria', carisma: 'Carisma',
  agilidade: 'Agilidade', acuidade: 'Acuidade', instinto: 'Instinto', presenca: 'Presença', conhecimento: 'Conhecimento',
  fort: 'Fortitude', ref: 'Reflexos', von: 'Vontade', bba: 'Ataque base', ca: 'CA', evasao: 'Evasão', pv: 'PV marcados', pv_atual: 'PV', pv_max: 'PV máx.',
  estresse: 'Estresse', estresse_max: 'Estresse máx.', esperanca: 'Esperança', armadura: 'Armadura usada', armadura_max: 'Armadura', limiar_maior: 'Limiar Maior',
  limiar_grave: 'Limiar Grave', proficiencia: 'Proficiência', ini_extra: 'Iniciativa extra', pericias: 'Perícias', experiencias: 'Experiências', nivel: 'Nível', classe: 'Classe',
  raca: 'Raça', ancestralidade: 'Ancestralidade', comunidade: 'Comunidade', ataque: 'Ataque', dano: 'Dano', notas: 'Notas' };
const nomeDefesa = () => (estado && estado.campanha.sistema === 'dh' ? 'Dificuldade' : 'CA');
const TRACOS_DH = ['agilidade', 'forca', 'acuidade', 'instinto', 'presenca', 'conhecimento'];
const ATRIBUTOS_DND = ['forca', 'destreza', 'constituicao', 'inteligencia', 'sabedoria', 'carisma'];
const sinal = (n) => (n >= 0 ? '+' + n : String(n));

function fichaCard() {
  const p = estado.pecas.find((q) => q.id === selecionada);
  $('ficha-card').classList.toggle('aberta', !!p);
  if (!p) return;
  const f = p.ficha || {};
  pintarAvatar($('ficha-avatar'), p.nome, p.avatar, corDe(p));
  $('ficha-titulo').textContent = p.nome;
  const daBiblioteca = p.npc && !!p.criaturaId;
  $('ficha-sub').textContent = p.tipo === 'inimigo' ? '👹 Inimigo do mestre' : p.npc ? '🎭 NPC do mestre' : [f.classe, f.nivel ? 'nível ' + f.nivel : '', p.jogador].filter(Boolean).join(' · ');
  const pvBox = $('ficha-pv'); pvBox.textContent = '';
  const pv = fracPV(p);
  if (pv) { const b = el('div', 'barra-pv ' + classeBarra(pv.frac)); b.style.height = '8px'; const i = el('i'); i.style.width = Math.round(pv.frac * 100) + '%'; b.append(i); pvBox.append(b, el('small', '', pv.texto)); }
  const tracos = $('tracos'); tracos.textContent = '';
  // Botões que rolam direto no chat com o valor da ficha (só aparecem para o dono e o mestre, que veem a ficha toda).
  const botao = (rotulo, valor, comando, como) => {
    const b = el('button'); b.append(el('span', '', '🎲 ' + rotulo), el('b', '', typeof valor === 'number' ? sinal(valor) : valor));
    b.onclick = () => enviar(comando, como).catch(() => {}); tracos.append(b);
  };
  if (daBiblioteca) {
    // Cópia da biblioteca: ataque e dano saem no chat em nome dela.
    if (typeof f.ataque === 'number') botao('Ataque', f.ataque, d20(f.ataque, 'Ataque'), p.id);
    if (f.dano) botao('Dano', f.dano, `/r ${f.dano} # Dano`, p.id);
  } else if (estado.campanha.sistema === 'dh') {
    for (const k of TRACOS_DH) if (typeof f[k] === 'number') botao(NOMES[k], f[k], dualidade(f[k], NOMES[k]));
  } else {
    for (const k of ATRIBUTOS_DND) if (typeof f[k] === 'number') { const m = Math.floor((f[k] - 10) / 2); botao(NOMES[k] + ' ' + f[k], m, d20(m, NOMES[k])); }
    for (const k of ['fort', 'ref', 'von', 'bba']) if (typeof f[k] === 'number') botao(NOMES[k], f[k], d20(f[k], NOMES[k]));
  }
  $('rotulo-tracos').hidden = !tracos.children.length;
  const dl = $('ficha'); dl.textContent = '';
  if (daBiblioteca) {
    const linhas = [[nomeDefesa(), f.defesa], ['Ataque', typeof f.ataque === 'number' ? sinal(f.ataque) : null], ['Dano', f.dano],
      ['Limiares', f.limiar_maior ? `Maior ${f.limiar_maior} · Grave ${f.limiar_grave ?? '—'}` : null], ['Notas', f.notas]];
    for (const [k, v] of linhas) if (v !== null && v !== undefined && v !== '') dl.append(el('dt', '', k), el('dd', '', String(v)));
  } else {
    for (const [k, v] of Object.entries(f)) {
      if (v === null || v === '' || k === 'guia' || k === 'nome' || k === 'classe' || k === 'nivel' || TRACOS_DH.includes(k) || (estado.campanha.sistema === 'dnd' && ATRIBUTOS_DND.includes(k))) continue;
      dl.append(el('dt', '', NOMES[k] || k.replaceAll('_', ' ')), el('dd', '', k === 'experiencias' ? experienciasEmTexto(v) : String(v)));
    }
  }
  if (!p.ficha) dl.append(el('span', 'mudo', p.npc ? (p.tipo === 'inimigo' ? 'Inimigo do mestre.' : 'NPC do mestre.') : p.meu ? 'Você ainda não criou o seu personagem.' : 'Ainda sem ficha.'));
  $('editar-ficha').hidden = !p.meu;
  $('ver-cartas').hidden = !(estado.campanha.sistema === 'dh' && p.userId && p.ficha && p.prancheta);
  $('editar-ficha').textContent = p.ficha ? '✏️ Editar meu personagem' : '✨ Criar meu personagem';
  $('editar-criatura').hidden = !(daBiblioteca && estado.voce.mestre);
  const comPV = daBiblioteca && estado.voce.mestre && typeof f.pv_max === 'number';
  $('linha-pv').hidden = !comPV;
  if (comPV && document.activeElement !== $('pv-valor')) $('pv-valor').value = String(f.pv_atual);
  cardCombate(p);
  $('remover-npc').hidden = !(p.npc && estado.voce.mestre);
  $('esconder').hidden = !(p.npc && estado.voce.mestre);
  $('esconder').textContent = p.escondida ? '👁️ Mostrar aos jogadores' : '🙈 Esconder dos jogadores';
  // Só o mestre mexe no tamanho (de qualquer peça) e na imagem e nas rolagens dos NPCs.
  $('gestao').hidden = !estado.voce.mestre;
  $('tam-valor').textContent = String(p.tamanho || 1).replace('.', ',') + '×';
  $('linha-npc-img').hidden = !p.npc;
  $('tirar-imagem').hidden = !(p.npc && p.imagemPropria);
  $('rolar-como').hidden = !p.npc;
}
$('fechar-ficha').onclick = () => { selecionada = null; painel(); desenhar(); };

function centralizar(p) { cam.x = cv.width / 2 - p.x * cam.z; cam.y = cv.height / 2 - p.y * cam.z; }
function corDe(p) { return p.tipo === 'inimigo' ? '#d63c4f' : (corDaClasse(p) || CORES[p.id % CORES.length]); }
function avatarDe(url) {
  if (!url) return null;
  if (!avatares.has(url)) { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = desenhar; i.src = url; avatares.set(url, i); }
  const i = avatares.get(url); return i.complete && i.naturalWidth ? i : null;
}
function rodada(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

const FONTE_TITULO = "'Cinzel', 'Palatino Linotype', Georgia, serif";
// As fontes do tema chegam depois do primeiro desenho: redesenha quando carregarem.
if (document.fonts) document.fonts.ready.then(() => desenhar());

// Tábuas de madeira da mesa, feitas uma vez só (veios com ruído fixo, sem imagem externa).
let mesaCache = null;
function texturaMesa() {
  if (mesaCache) return mesaCache;
  const c = document.createElement('canvas'); c.width = 512; c.height = 384;
  const g = c.getContext('2d'); let semente = 7;
  const acaso = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  const alturaTabua = 64;
  for (let y = 0; y < c.height; y += alturaTabua) {
    const base = 26 + Math.floor(acaso() * 8), grad = g.createLinearGradient(0, y, 0, y + alturaTabua);
    grad.addColorStop(0, 'rgb(' + (base + 22) + ',' + (base + 8) + ',' + Math.round(base * 0.35) + ')');
    grad.addColorStop(1, 'rgb(' + (base + 10) + ',' + base + ',' + Math.round(base * 0.2) + ')');
    g.fillStyle = grad; g.fillRect(0, y, c.width, alturaTabua);
    for (let k = 0; k < 26; k++) { // veios
      const yy = y + acaso() * alturaTabua;
      g.strokeStyle = 'rgba(' + (acaso() < 0.5 ? '0,0,0' : '255,210,150') + ',' + (0.04 + acaso() * 0.06) + ')'; g.lineWidth = 0.6 + acaso() * 1.4;
      g.beginPath(); g.moveTo(0, yy); for (let x = 0; x <= c.width; x += 32) g.lineTo(x, yy + Math.sin(x / (40 + k * 3) + k) * 1.6); g.stroke();
    }
    if (acaso() < 0.7) { // nó da madeira
      const nx = acaso() * c.width, ny = y + 14 + acaso() * (alturaTabua - 28), n = g.createRadialGradient(nx, ny, 0, nx, ny, 12);
      n.addColorStop(0, 'rgba(10,5,2,.55)'); n.addColorStop(1, 'rgba(10,5,2,0)');
      g.fillStyle = n; g.beginPath(); g.ellipse(nx, ny, 14, 6, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, y, c.width, 2); g.fillStyle = 'rgba(255,220,160,.06)'; g.fillRect(0, y + 2, c.width, 1);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(Math.floor(acaso() * c.width), y, 2, alturaTabua); // emenda entre tábuas
  }
  return (mesaCache = c);
}

// Vários pedidos de desenho no mesmo instante viram um só por quadro (arrastar não engasga).
let quadro = 0;
function desenhar() { if (!quadro) quadro = requestAnimationFrame(() => { quadro = 0; pintar(); }); }

function pintar() {
  if (dimensionar() && estado && !ajustou) ajustar();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Fundo: o tampo de madeira da mesa (anda junto com o mapa) e a luz da vela no meio.
  const mesa = texturaMesa(), dpr = devicePixelRatio || 1;
  ctx.save(); ctx.translate(cam.x % (mesa.width * dpr), cam.y % (mesa.height * dpr)); ctx.scale(dpr, dpr);
  ctx.fillStyle = ctx.createPattern(mesa, 'repeat'); ctx.fillRect(-mesa.width, -mesa.height, cv.width / dpr + mesa.width * 2, cv.height / dpr + mesa.height * 2); ctx.restore();
  const g = ctx.createRadialGradient(cv.width / 2, cv.height * 0.45, 0, cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.75);
  g.addColorStop(0, 'rgba(255,170,80,.10)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
  if (!estado) return;
  const { largura, altura, grade } = estado.mapa;
  ctx.setTransform(cam.z, 0, 0, cam.z, cam.x, cam.y);
  // Sombra do mapa sem blur (blur em imagem grande deixa o arrastar pesado): três molduras escuras e suaves.
  for (let k = 3; k >= 1; k--) { ctx.fillStyle = `rgba(0,0,0,${0.16 / k})`; const e = k * 9 / cam.z; ctx.fillRect(-e, -e, largura + 2 * e, altura + 2 * e); }
  // Moldura de madeira com filete de latão; sem imagem, o mapa é uma folha de pergaminho.
  const bm = Math.max(10 / cam.z, Math.min(largura, altura) * 0.018);
  ctx.fillStyle = '#3a2413'; ctx.fillRect(-bm, -bm, largura + 2 * bm, altura + 2 * bm);
  ctx.strokeStyle = '#1c0f06'; ctx.lineWidth = 2 / cam.z; ctx.strokeRect(-bm, -bm, largura + 2 * bm, altura + 2 * bm);
  ctx.strokeStyle = 'rgba(255,220,160,.18)'; ctx.lineWidth = 1 / cam.z; ctx.strokeRect(-bm * 0.55, -bm * 0.55, largura + bm * 1.1, altura + bm * 1.1);
  if (imagem) ctx.drawImage(imagem, 0, 0, largura, altura);
  else {
    const pg = ctx.createRadialGradient(largura * 0.4, altura * 0.3, 0, largura / 2, altura / 2, Math.max(largura, altura) * 0.75);
    pg.addColorStop(0, '#f6e8c6'); pg.addColorStop(0.7, '#e3cb98'); pg.addColorStop(1, '#c9a86c');
    ctx.fillStyle = pg; ctx.fillRect(0, 0, largura, altura);
  }
  pintarCamadaMestre();
  if (prefs.grade) {
    ctx.strokeStyle = imagem ? 'rgba(255,236,200,.24)' : 'rgba(90,55,20,.28)'; ctx.lineWidth = 1 / cam.z; ctx.beginPath();
    for (let x = 0; x <= largura; x += grade) { ctx.moveTo(x, 0); ctx.lineTo(x, altura); }
    for (let y = 0; y <= altura; y += grade) { ctx.moveTo(0, y); ctx.lineTo(largura, y); }
    ctx.stroke();
  }
  // Névoa: opaca para os jogadores, translúcida para o mestre (ele precisa ver o mapa para revelar).
  const nev = camadaNevoa();
  if (nev) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = estado.voce.mestre ? 0.55 : 1; ctx.drawImage(nev, 0, 0, nev.width * grade, nev.height * grade); ctx.restore(); }
  ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 2.5 / cam.z; ctx.strokeRect(0, 0, largura, altura);
  ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1 / cam.z; ctx.strokeRect(-1.5 / cam.z, -1.5 / cam.z, largura + 3 / cam.z, altura + 3 / cam.z);

  const px = 1 / cam.z;
  // As maiores primeiro, para as pequenas ficarem por cima.
  for (const p of [...estado.pecas].sort((a, b) => (b.tamanho || 1) - (a.tamanho || 1))) {
    const r = grade * 0.42 * (p.tamanho || 1);
    const cor = corDe(p), sel = p.id === selecionada || selecao.has('p' + p.id);
    ctx.globalAlpha = p.escondida ? 0.45 : 1; // escondida: o mestre vê meio apagada
    // sombra e halo
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 10 * px; ctx.shadowOffsetY = 3 * px;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = cor; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.clip();
    const av = avatarDe(p.avatar);
    if (av) { const lado = Math.min(av.naturalWidth, av.naturalHeight); ctx.drawImage(av, (av.naturalWidth - lado) / 2, (av.naturalHeight - lado) / 2, lado, lado, p.x - r, p.y - r, r * 2, r * 2); } // recorta ao centro, sem esticar
    else { ctx.fillStyle = '#fff'; ctx.font = '700 ' + (r * 0.85) + 'px ' + FONTE_TITULO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(iniciais(p.nome), p.x, p.y + r * 0.04); }
    ctx.restore();
    // Aro de metal: latão nos jogadores, ferro avermelhado nos inimigos, prata nos NPCs; por dentro, a cor da peça.
    const aro = Math.max(3 * px, r * 0.13), met = ctx.createLinearGradient(p.x, p.y - r, p.x, p.y + r);
    const tons = p.tipo === 'inimigo' ? ['#ff9a85', '#b3362a', '#5e140c'] : p.npc ? ['#f4f1ea', '#a39d92', '#55504a'] : ['#fbe39a', '#d9a441', '#7a4f17'];
    met.addColorStop(0, tons[0]); met.addColorStop(0.5, tons[1]); met.addColorStop(1, tons[2]);
    ctx.beginPath(); ctx.arc(p.x, p.y, r - aro * 0.5 - 1.2 * px, 0, Math.PI * 2); ctx.lineWidth = 1.6 * px; ctx.strokeStyle = cor; ctx.stroke();
    ctx.save();
    if (sel) { ctx.shadowColor = 'rgba(255,200,90,.95)'; ctx.shadowBlur = 16 * px; }
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.lineWidth = aro; ctx.strokeStyle = met; ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.arc(p.x, p.y, r + aro / 2, 0, Math.PI * 2); ctx.lineWidth = 1 * px; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke();
    if (p.meu) { // estrelinha de latão: "este é você"
      const sx = p.x - r * 0.78, sy = p.y - r * 0.78, sr = Math.max(6 * px, r * 0.26);
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fillStyle = met; ctx.fill(); ctx.lineWidth = 1 * px; ctx.strokeStyle = '#3a2410'; ctx.stroke();
      ctx.fillStyle = '#3a2410'; ctx.font = '900 ' + (sr * 1.25) + 'px ' + FONTE_TITULO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', sx, sy + sr * 0.05);
    }
    if (p.npc) { // selinho: N para NPC, caveira para inimigo
      const inimigo = p.tipo === 'inimigo';
      ctx.fillStyle = inimigo ? '#8e2418' : '#2b1b10'; ctx.beginPath(); ctx.arc(p.x + r * 0.78, p.y - r * 0.78, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.2 * px; ctx.strokeStyle = inimigo ? '#ff9a85' : '#d9a441'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${r * 0.34}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(inimigo ? '☠' : 'N', p.x + r * 0.78, p.y - r * 0.76);
    }
    // Peça da vez no combate: anel dourado tracejado.
    if (estado.combate.ativo && estado.combate.vez === p.id) {
      ctx.save(); ctx.setLineDash([7 * px, 5 * px]); ctx.beginPath(); ctx.arc(p.x, p.y, r + 12 * px, 0, Math.PI * 2);
      ctx.lineWidth = 3 * px; ctx.strokeStyle = '#f5c451'; ctx.stroke(); ctx.restore();
    }
    // Condições: os ícones em cima da peça.
    if (p.condicoes && p.condicoes.length) {
      const fsC = Math.max(11 * px, r * 0.42), icones = p.condicoes.map((c) => (CONDICOES[c] || '?').split(' ')[0]).join('');
      ctx.font = `${fsC}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const wC = ctx.measureText(icones).width + fsC * 0.6;
      rodada(ctx, p.x - wC / 2, p.y - r - fsC * 1.45, wC, fsC * 1.3, fsC * 0.65); ctx.fillStyle = 'rgba(30,18,9,.85)'; ctx.fill(); ctx.lineWidth = 1 * px; ctx.strokeStyle = 'rgba(217,164,65,.6)'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillText(icones, p.x, p.y - r - fsC * 0.22);
    }
    // barra de PV (a ficha do grupo, ou o que o mestre deixa ver dos inimigos)
    const pv = fracPV(p) || (p.vida && p.vida.frac !== null ? p.vida : null); let yBase = p.y + r + 5 * px;
    if (pv) {
      const w = r * 1.7, h = Math.max(4 * px, grade * 0.09), x0 = p.x - w / 2;
      rodada(ctx, x0, yBase, w, h, h / 2); ctx.fillStyle = 'rgba(20,12,6,.8)'; ctx.fill();
      rodada(ctx, x0, yBase, Math.max(h, w * pv.frac), h, h / 2); ctx.fillStyle = pv.frac <= 0.25 ? '#e0473a' : pv.frac <= 0.55 ? '#e6a93a' : '#6cbf4c'; ctx.fill();
      rodada(ctx, x0, yBase, w, h, h / 2); ctx.lineWidth = 1 * px; ctx.strokeStyle = 'rgba(217,164,65,.7)'; ctx.stroke();
      yBase += h + 3 * px;
    } else if (p.vida) { // só o estado: "Ferido", "Quase morto"...
      const fsV = Math.max(10 * px, grade * 0.2); ctx.font = `700 ${fsV}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = p.vida.texto === 'Ileso' ? '#8fe070' : p.vida.texto === 'Ferido' ? '#ffcc5c' : '#ff7a6b';
      ctx.font = '700 ' + fsV + 'px ' + FONTE_TITULO; ctx.lineWidth = 3 * px; ctx.strokeStyle = 'rgba(20,12,6,.85)'; ctx.strokeText(p.vida.texto, p.x, yBase);
      ctx.fillText(p.vida.texto, p.x, yBase); yBase += fsV * 1.25;
    }
    // status escrito: balão de pergaminho em cima da peça
    if (p.status) {
      const fsS = Math.max(11 * px, grade * 0.22); ctx.font = 'italic 700 ' + fsS + 'px ' + FONTE_TITULO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const txt = '💬 ' + p.status, w = ctx.measureText(txt).width + fsS * 1.2, h = fsS * 1.7, yb = p.y - r - h * 0.6 - 6 * px;
      ctx.globalAlpha = p.escondida ? 0.45 : 1;
      rodada(ctx, p.x - w / 2, yb - h / 2, w, h, h * 0.45); ctx.fillStyle = 'rgba(251,241,216,.95)'; ctx.fill(); ctx.lineWidth = 1.2 * px; ctx.strokeStyle = '#7a5218'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - 5 * px, yb + h / 2 - 0.5 * px); ctx.lineTo(p.x, yb + h / 2 + 6 * px); ctx.lineTo(p.x + 5 * px, yb + h / 2 - 0.5 * px); ctx.fillStyle = 'rgba(251,241,216,.95)'; ctx.fill();
      ctx.fillStyle = '#3b2814'; ctx.fillText(txt, p.x, yb);
      ctx.globalAlpha = 1;
    }
    // nome em uma etiqueta
    const fs = Math.max(12 * px, grade * 0.26);
    ctx.font = '700 ' + fs + 'px ' + FONTE_TITULO; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const rotulo = (p.escondida ? '🙈 ' : '') + p.nome, tw = ctx.measureText(rotulo).width + fs * 1.1, th = fs * 1.5, xf = p.x - tw / 2, pont = th * 0.35;
    // fita com as pontas recortadas
    ctx.beginPath(); ctx.moveTo(xf - pont, yBase); ctx.lineTo(xf + tw + pont, yBase); ctx.lineTo(xf + tw, yBase + th / 2); ctx.lineTo(xf + tw + pont, yBase + th);
    ctx.lineTo(xf - pont, yBase + th); ctx.lineTo(xf, yBase + th / 2); ctx.closePath();
    const fita = ctx.createLinearGradient(0, yBase, 0, yBase + th);
    fita.addColorStop(0, p.tipo === 'inimigo' ? '#f3d2c4' : '#f8ecd0'); fita.addColorStop(1, p.tipo === 'inimigo' ? '#d9a690' : '#dcc292');
    ctx.fillStyle = fita; ctx.fill(); ctx.lineWidth = 1.2 * px; ctx.strokeStyle = p.tipo === 'inimigo' ? '#7a2018' : '#7a5218'; ctx.stroke();
    ctx.fillStyle = p.tipo === 'inimigo' ? '#5e140c' : '#3b2814'; ctx.fillText(rotulo, p.x, yBase + fs * 0.24);
    ctx.globalAlpha = 1;
  }

  // Traços de desenho: linha brilhante na cor de quem desenhou, some aos poucos.
  const agoraEf = performance.now();
  for (const t of tracos.values()) {
    if (t.pontos.length < 1) continue;
    const alfa = t.fim ? Math.max(0, 1 - (agoraEf - t.t) / 1600) : 1;
    ctx.save(); ctx.globalAlpha = alfa; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = corDeQuem(t.quem); ctx.shadowBlur = 14 * px; ctx.strokeStyle = corDeQuem(t.quem); ctx.lineWidth = 5 * px;
    ctx.beginPath(); ctx.moveTo(t.pontos[0][0], t.pontos[0][1]); for (const p of t.pontos) ctx.lineTo(p[0], p[1]);
    if (t.pontos.length === 1) ctx.lineTo(t.pontos[0][0] + 0.1, t.pontos[0][1]);
    ctx.stroke(); ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.6 * px; ctx.stroke(); ctx.restore();
  }
  // Reações: o emoji sobe de cima da peça e some.
  for (const r of reacoesNoMapa) {
    const p = estado.pecas.find((q) => q.id === r.peca); if (!p) continue;
    const k = (agoraEf - r.ini) / 3200, raio = grade * 0.42 * (p.tamanho || 1);
    ctx.save(); ctx.globalAlpha = k < 0.75 ? 1 : Math.max(0, 1 - (k - 0.75) / 0.25);
    const tam = Math.max(22 * px, grade * 0.7) * (k < 0.12 ? 0.6 + k * 3.3 : 1);
    ctx.font = tam + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(r.emoji, p.x, p.y - raio - 6 * px - k * grade * 0.9); ctx.restore();
  }

  // Pings: dois anéis que crescem e somem, com o nome de quem apontou.
  const agoraPing = performance.now();
  for (const pg of pings) {
    const t = Math.min(1, (agoraPing - pg.ini) / 1800), cor = pg.foco ? '240,195,90' : pg.quem === estado.voce.id ? '240,195,90' : '255,128,64';
    const nome = pg.foco ? '👁️ Olhem aqui!' : nomeDeQuem(pg.quem);
    if (nome) {
      const fsP = 13 * px; ctx.font = '700 ' + fsP + 'px ' + FONTE_TITULO; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3 * px; ctx.strokeStyle = 'rgba(20,12,6,' + (1 - t) + ')'; ctx.strokeText(nome, pg.x, pg.y - grade * 0.5);
      ctx.fillStyle = 'rgba(' + cor + ',' + (1 - t) + ')'; ctx.fillText(nome, pg.x, pg.y - grade * 0.5);
    }
    for (const atraso of [0, 0.25]) {
      const tt = Math.max(0, t - atraso); if (tt <= 0) continue;
      ctx.beginPath(); ctx.arc(pg.x, pg.y, grade * (0.3 + 2.2 * tt), 0, Math.PI * 2);
      ctx.lineWidth = 4 * px; ctx.strokeStyle = `rgba(${cor},${1 - tt})`; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(pg.x, pg.y, 6 * px, 0, Math.PI * 2); ctx.fillStyle = `rgba(${cor},${1 - t})`; ctx.fill();
  }

  // Área da névoa sendo pintada pelo mestre.
  if (arrasto && arrasto.nevoa && arrasto.b) {
    const { a, b } = arrasto, x0 = Math.floor(Math.min(a.x, b.x) / grade) * grade, y0 = Math.floor(Math.min(a.y, b.y) / grade) * grade;
    const x1 = (Math.floor(Math.max(a.x, b.x) / grade) + 1) * grade, y1 = (Math.floor(Math.max(a.y, b.y) / grade) + 1) * grade;
    ctx.fillStyle = arrasto.revelar ? 'rgba(245,196,81,.18)' : 'rgba(10,5,18,.45)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = arrasto.revelar ? '#f5c451' : '#a899c0'; ctx.lineWidth = 2 * px; ctx.setLineDash([8 * px, 6 * px]); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
  }

  pintarExtras(px, grade);

  // Régua
  if (regua) {
    const { a, b } = regua, d = Math.hypot(b.x - a.x, b.y - a.y) / grade;
    ctx.strokeStyle = '#f5c451'; ctx.lineWidth = 3 * px; ctx.setLineDash([10 * px, 7 * px]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    for (const q of [a, b]) { ctx.beginPath(); ctx.arc(q.x, q.y, 5 * px, 0, Math.PI * 2); ctx.fillStyle = '#f5c451'; ctx.fill(); }
    const txt = rotuloDistancia(d);
    const fs = 14 * px; ctx.font = '700 ' + fs + 'px ' + FONTE_TITULO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 16 * px, w = ctx.measureText(txt).width + fs * 1.2;
    rodada(ctx, mx - w / 2, my - fs * 0.9, w, fs * 1.8, fs * 0.3); ctx.fillStyle = '#f3e4c2'; ctx.fill(); ctx.lineWidth = 1.2 * px; ctx.strokeStyle = '#7a5218'; ctx.stroke();
    ctx.fillStyle = '#3b2814'; ctx.fillText(txt, mx, my);
  }
}

const mundo = (e) => { const b = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1; return { x: ((e.clientX - b.left) * dpr - cam.x) / cam.z, y: ((e.clientY - b.top) * dpr - cam.y) / cam.z }; };
function pecaEm(pt) {
  const g = estado.mapa.grade * 0.42;
  return [...estado.pecas].sort((a, b) => (a.tamanho || 1) - (b.tamanho || 1)).find((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= g * (p.tamanho || 1));
}
// Peça de tamanho par (2×, 4×...) encaixa no cruzamento das casas; as outras, no centro da casa.
function encaixe(v, g, t, max) {
  const par = t >= 1 && Math.round(t) % 2 === 0;
  return Math.min(max, par ? Math.round(v / g) * g : (Math.floor(v / g) + 0.5) * g);
}

let ultimoEnvio = 0;
function enviarMover(p, forcar) {
  const agora = Date.now();
  if (!forcar && agora - ultimoEnvio < 45) return;
  ultimoEnvio = agora;
  post('mover', { peca: p.id, x: p.x, y: p.y }).catch(() => {});
}

cv.addEventListener('pointerdown', (e) => {
  if (!estado) return;
  if (e.button === 1 || (e.altKey && e.button === 0)) { e.preventDefault(); pingar(mundo(e)); return; }
  cv.setPointerCapture(e.pointerId);
  const pt = mundo(e);
  if (e.button === 0 && modoMapa === 'apontar') { pingar(pt); return; }
  if (e.button === 0 && modoMapa === 'area') { areaNova = { forma: formaArea, x: pt.x, y: pt.y, x2: pt.x, y2: pt.y, cor: corDeQuem(estado.voce.id) }; arrasto = { area: true }; return; }
  if (e.button === 0 && modoMapa === 'explodir') { post('tela/efeito', { nome: 'explosao', x: pt.x, y: pt.y }).catch(() => {}); escolherModo('explodir'); return; }
  if (e.button === 0 && modoMapa === 'foco') { efeito({ tipo: 'foco', x: pt.x, y: pt.y }); escolherModo('foco'); return; }
  if (e.button === 0 && modoMapa === 'desenhar') {
    const id = Math.random().toString(36).slice(2, 10);
    meuTraco = { id, pontos: [[pt.x, pt.y]], enviados: 0, timer: setInterval(() => enviarTraco(false), 100) };
    tracos.set(id, { pontos: meuTraco.pontos, quem: estado.voce.id, t: performance.now(), fim: false });
    arrasto = { laser: true }; animarEfeitos(); return;
  }
  if (usandoRegua) { regua = { a: pt, b: pt }; arrasto = { regua: true }; desenhar(); return; }
  if (pincel) { arrasto = { nevoa: true, revelar: pincel === 'revelar', a: pt, b: pt }; desenhar(); return; }
  if (e.button === 0 && ferrDesenho) { comecarDesenho(pt); return; }
  const p = pecaEm(pt);
  if (estado.voce.mestre && e.button === 0) {
    const elAqui = p ? null : elementoEm(pt), chave = p ? 'p' + p.id : elAqui ? 'e' + elAqui.id : null;
    // Shift + clique: soma ou tira da seleção. Shift (ou o modo Selecionar) no vazio: caixa de seleção.
    if (e.shiftKey && chave) { if (selecao.has(chave)) selecao.delete(chave); else selecao.add(chave); painelSelecao(); desenhar(); return; }
    if (!chave && (e.shiftKey || modoMapa === 'selecionar')) { caixaSel = { a: pt, b: pt, somar: e.shiftKey }; arrasto = { caixa: true }; return; }
    // Arrastar uma peça que faz parte do grupo: o grupo todo vai junto.
    if (chave && selecao.has(chave) && selecao.size > 1) {
      const orig = new Map();
      for (const k of selecao) { const o = itemDaSelecao(k); if (o) orig.set(k, { x: o.x, y: o.y }); }
      arrasto = { grupo: true, inicio: pt, orig }; cv.classList.add('arrastando'); return;
    }
    if (chave && !e.shiftKey && selecao.size) { selecao.clear(); painelSelecao(); }
  }
  // Mestre: sem peça no clique, pega um elemento (imagem solta) para arrastar.
  if (!p && e.button === 0 && estado.voce.mestre) {
    const el2 = elementoEm(pt);
    if (el2) { elementoSel = el2.id; arrasto = { elemento: el2, dx: el2.x - pt.x, dy: el2.y - pt.y }; painelElemento(); desenhar(); return; }
    if (elementoSel) { elementoSel = null; painelElemento(); }
  }
  if (p) {
    selecionada = p.id; painel();
    if (p.podeMover) arrasto = { peca: p, dx: p.x - pt.x, dy: p.y - pt.y };
  } else arrasto = { mapa: true, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
  cv.classList.add('arrastando'); esconderDica(); desenhar();
});
cv.addEventListener('pointermove', (e) => {
  if (!arrasto) return;
  if (arrasto.laser && meuTraco) {
    const pt = mundo(e), ult = meuTraco.pontos[meuTraco.pontos.length - 1];
    if (Math.hypot(pt.x - ult[0], pt.y - ult[1]) * cam.z > 3) { meuTraco.pontos.push([pt.x, pt.y]); const t = tracos.get(meuTraco.id); if (t) t.t = performance.now(); desenhar(); }
    return;
  }
  if (arrasto.area) { const q = mundo(e); areaNova.x2 = q.x; areaNova.y2 = q.y; desenhar(); return; }
  if (arrasto.desenho) { continuarDesenho(mundo(e)); return; }
  if (arrasto.caixa) { caixaSel.b = mundo(e); desenhar(); return; }
  if (arrasto.grupo) {
    const q = mundo(e), dx = q.x - arrasto.inicio.x, dy = q.y - arrasto.inicio.y;
    for (const [k, o] of arrasto.orig) { const it = itemDaSelecao(k); if (it) { it.x = Math.min(estado.mapa.largura, Math.max(0, o.x + dx)); it.y = Math.min(estado.mapa.altura, Math.max(0, o.y + dy)); } }
    arrasto.moveu = true; desenhar(); return;
  }
  if (arrasto.elemento) { const q = mundo(e); arrasto.elemento.x = q.x + arrasto.dx; arrasto.elemento.y = q.y + arrasto.dy; arrasto.moveu = true; desenhar(); return; }
  if (arrasto.regua) { regua.b = mundo(e); enviarRegua(false); desenhar(); return; }
  if (arrasto.nevoa) { arrasto.b = mundo(e); desenhar(); return; }
  if (arrasto.mapa) { const dpr = devicePixelRatio || 1; cam.x = arrasto.cx + (e.clientX - arrasto.sx) * dpr; cam.y = arrasto.cy + (e.clientY - arrasto.sy) * dpr; }
  else { const pt = mundo(e); arrasto.peca.x = Math.min(estado.mapa.largura, Math.max(0, pt.x + arrasto.dx)); arrasto.peca.y = Math.min(estado.mapa.altura, Math.max(0, pt.y + arrasto.dy)); enviarMover(arrasto.peca, false); }
  desenhar();
});
function soltar() {
  if (arrasto && arrasto.caixa) { arrasto = null; fecharCaixa(); return; }
  if (arrasto && arrasto.grupo) { const g = arrasto; arrasto = null; cv.classList.remove('arrastando'); if (g.moveu) soltarGrupo(g); return; }
  if (arrasto && arrasto.desenho) { arrasto = null; terminarDesenho(); return; }
  if (arrasto && arrasto.elemento) { const el2 = arrasto.elemento, moveu = arrasto.moveu; arrasto = null; if (moveu) post('elemento/mudar', { id: el2.id, x: el2.x, y: el2.y }).catch(() => {}); return; }
  if (arrasto && arrasto.area) { arrasto = null; soltarArea(); return; }
  if (arrasto && arrasto.regua) enviarRegua(true);
  if (arrasto && arrasto.laser) { enviarTraco(true); arrasto = null; return; }
  if (arrasto && arrasto.nevoa) {
    const g = estado.mapa.grade, { a, b } = arrasto;
    post('nevoa/pintar', { c0: Math.floor(a.x / g), r0: Math.floor(a.y / g), c1: Math.floor(b.x / g), r1: Math.floor(b.y / g), revelar: arrasto.revelar }).catch(() => {});
  }
  if (arrasto && arrasto.peca) {
    const g = estado.mapa.grade, p = arrasto.peca; // encaixa no centro da casa
    if (prefs.encaixar) { p.x = encaixe(p.x, g, p.tamanho || 1, estado.mapa.largura); p.y = encaixe(p.y, g, p.tamanho || 1, estado.mapa.altura); }
    enviarMover(p, true);
  }
  arrasto = null; cv.classList.remove('arrastando'); desenhar();
}
cv.addEventListener('pointerup', soltar); cv.addEventListener('pointercancel', soltar);
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const pt = mundo(e), f = e.deltaY < 0 ? 1.12 : 1 / 1.12, dpr = devicePixelRatio || 1, b = cv.getBoundingClientRect();
  cam.z = Math.min(6, Math.max(0.05, cam.z * f));
  cam.x = (e.clientX - b.left) * dpr - pt.x * cam.z; cam.y = (e.clientY - b.top) * dpr - pt.y * cam.z; desenhar();
}, { passive: false });
addEventListener('resize', desenhar);
function esconderDica() { const d = $('dica-mapa'); if (d && !d.hidden) d.hidden = true; try { localStorage.setItem('mapa_dica', '1'); } catch {} }
try { if (localStorage.getItem('mapa_dica')) $('dica-mapa').hidden = true; } catch {}
