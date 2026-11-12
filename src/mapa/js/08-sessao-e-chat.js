// ---------- Pulso: a cada 1,5 s pergunta só "mudou alguma coisa?" ----------
// Resposta pequena (números das mudanças e efeitos novos). O estado e o chat só são baixados quando mudam;
// assim o mapa fica leve para o servidor e para o celular, e funciona mesmo quando o tempo real (SSE) falha.
let marcaPulso = null, falhasPulso = 0, vencida = false;
async function pulso() {
  if (document.hidden || !estado || vencida) return;
  let r;
  try {
    const resp = await fetch(api('pulso/' + Math.max(0, seqEfeitos)), { cache: 'no-store' });
    if (resp.status === 401) { vencida = true; avisoConexao('vencida'); return; }
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    r = await resp.json();
  } catch {
    falhasPulso++;
    if (falhasPulso >= 2) avisoConexao('caiu');
    return;
  }
  const voltou = falhasPulso >= 2;
  falhasPulso = 0;
  if (seqEfeitos >= 0 && !voltou) for (const e of r.lista) aplicarEfeito(e.tipo, e.dados);
  seqEfeitos = r.seq;
  const marca = { e: r.boot + ':' + r.estado, c: r.boot + ':' + r.chat };
  if (voltou || !marcaPulso || marca.e !== marcaPulso.e) carregar().catch(() => {});
  if (voltou || !marcaPulso || marca.c !== marcaPulso.c) carregarChat().catch(() => {});
  marcaPulso = marca;
  avisoConexao(voltou ? 'voltou' : 'ok');
}
setInterval(pulso, 1500);
// Voltou para a aba (celular desbloqueado, outra aba): confere na hora.
document.addEventListener('visibilitychange', () => { if (!document.hidden) pulso(); });

/** Faixa no topo do mapa quando a conexão cai ou o acesso vence. */
function avisoConexao(caso) {
  let f = $('faixa-conexao');
  if (caso === 'ok') { if (f) f.hidden = true; marcarConexao(true); return; }
  if (caso === 'voltou') { if (f) f.hidden = true; marcarConexao(true); aviso('📡 Conectado de novo à mesa.', 'ok', 2500); return; }
  if (!f) { f = el('div'); f.id = 'faixa-conexao'; document.body.append(f); }
  f.textContent = ''; f.hidden = false; f.className = caso;
  if (caso === 'caiu') {
    marcarConexao(false);
    f.append(el('span', 'giro', '📡'), document.createTextNode(' Sem conexão com a mesa. Tentando de novo… (o que você fizer agora pode não chegar)'));
  } else {
    f.append(document.createTextNode('⏳ Seu acesso ao mapa venceu. No Discord, use /sessao mapa e abra o link novo.'));
    const dc = estado && estado.campanha.discord;
    if (dc) { const a = el('a', 'btn', '💬 Ir para o Discord'); a.href = dc; a.target = '_blank'; a.rel = 'noopener'; f.append(a); }
  }
}
function receberPing(d) {
  pings.push({ ...d, ini: performance.now() });
  const animar = () => { const agora = performance.now(); while (pings.length && agora - pings[0].ini > 1800) pings.shift(); desenhar(); if (pings.length) requestAnimationFrame(animar); };
  requestAnimationFrame(animar);
}
cv.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // sem a rolagem automática do Windows

// ---------- Entre sessões: grupo (ouro e inventário) e diário ----------
const dataBR = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const duracao = (ms) => { const min = Math.round(ms / 60000); return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`; };
let sessaoAberta = null;

function painelEntreSessoes() {
  const g = estado.grupo;
  $('ouro').textContent = g.ouro.toLocaleString('pt-BR');
  const itens = $('itens'); itens.textContent = '';
  if (!g.itens.length) itens.append(el('div', 'mudo', 'Nada guardado ainda.'));
  for (const it of g.itens) {
    const d = el('div', 'recurso'); d.append(el('span', 'rot', it.item));
    const menos = el('button', '', '−'), mais = el('button', '', '+'), tirar = el('button', '', '✕');
    menos.title = 'Usar um'; mais.title = 'Guardar mais um'; tirar.title = 'Tirar do inventário';
    menos.onclick = () => post('grupo/item/qtd', { id: it.id, delta: -1 }).catch(() => {});
    mais.onclick = () => post('grupo/item/qtd', { id: it.id, delta: 1 }).catch(() => {});
    tirar.onclick = () => post('grupo/item/remover', { id: it.id }).catch(() => {});
    d.append(menos, el('b', '', '×' + it.qtd), mais, tirar); itens.append(d);
  }
  // Diário: uma linha por sessão finalizada; clique abre o resumo do mestre e o registro do chat.
  $('painel-diario').hidden = !estado.diario.length;
  const di = $('diario'); di.textContent = '';
  for (const s of estado.diario) {
    const d = el('div', 'item');
    const info = el('div'); info.style.flex = '1'; info.style.minWidth = '0';
    info.append(el('div', 'nome', `📖 ${dataBR(s.inicio)} · ${duracao(s.fim - s.inicio)}`), el('small', '', s.notas ? s.notas.split('\n')[0].slice(0, 70) : `${s.mensagens} mensagens · ${s.rolagens} rolagens${estado.voce.mestre ? ' · escreva o resumo' : ''}`));
    d.append(info); d.onclick = () => abrirSessao(s);
    di.append(d);
  }
  if (sessaoAberta && !$('modal-registro').hidden && document.activeElement !== $('mr-editar')) {
    const s = estado.diario.find((x) => x.id === sessaoAberta);
    if (s) $('mr-notas').textContent = s.notas || (estado.voce.mestre ? '' : 'O mestre ainda não escreveu o resumo.');
  }
}
async function abrirSessao(s) {
  sessaoAberta = s.id;
  const mestre = estado.voce.mestre;
  $('mr-titulo').textContent = `📖 Sessão de ${dataBR(s.inicio)} (${duracao(s.fim - s.inicio)})`;
  $('mr-notas').textContent = s.notas || (mestre ? '' : 'O mestre ainda não escreveu o resumo.');
  $('mr-notas').hidden = mestre; $('mr-editar').hidden = !mestre; $('mr-acoes').hidden = !mestre;
  if (mestre) $('mr-editar').value = s.notas || '';
  $('mr-registro').textContent = 'Carregando…';
  $('modal-registro').hidden = false;
  try {
    const r = await fetch(api('diario/' + s.id));
    $('mr-registro').textContent = r.ok ? await r.text() : ((await r.json().catch(() => ({}))).erro || 'Não consegui abrir o registro.');
  } catch { $('mr-registro').textContent = 'Não consegui abrir o registro.'; }
}
$('mr-salvar').onclick = () => post('diario/notas', { id: sessaoAberta, notas: $('mr-editar').value }).then(() => aviso('Resumo salvo no diário.', 'ok')).catch(() => {});
function mexerNoOuro(sinalOuro) {
  const v = Math.trunc(Number($('ouro-valor').value));
  if (!(v > 0)) return mostrarErro('Quanto de ouro?');
  post('grupo/ouro', { delta: sinalOuro * v }).then(() => ($('ouro-valor').value = '')).catch(() => {});
}
$('ouro-mais').onclick = () => mexerNoOuro(1);
$('ouro-menos').onclick = () => mexerNoOuro(-1);
$('item-add').onclick = () => {
  const item = $('item-nome').value.trim();
  if (!item) return mostrarErro('Qual item?');
  post('grupo/item', { item, qtd: Number($('item-qtd').value) || 1 }).then(() => { $('item-nome').value = ''; $('item-qtd').value = 1; }).catch(() => {});
};
$('item-nome').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('item-add').onclick(); } });

// ---------- Abas ----------

// O painel da direita agora é só o chat; as funções da mesa abrem pela barra de ícones (gaveta).
function abrirAba(qual) {
  if (qual === 'chat') { novas = 0; contador(); rolarParaFim(); }
  else abrirGaveta('personagens');
}
$('tab-chat').onclick = () => abrirAba('chat');
function contador() { $('novas').hidden = !novas; $('novas').textContent = novas; }

// ---------- Chat e rolagens ----------

const escondida = () => estado && estado.voce.mestre && $('escondida').checked;
const vantagem = () => Number($('vantagem').value);
const mod = () => Math.trunc(Number($('mod').value) || 0);
const comMod = (m) => (m ? sinal(m) : '');
function d20(m, rotulo) {
  const v = vantagem(), dado = v > 0 ? '2d20kh1' : v < 0 ? '2d20kl1' : '1d20';
  return `/r ${dado}${comMod(m)}` + (rotulo ? ` # ${rotulo}` : '');
}
function dualidade(m, rotulo) {
  const v = vantagem();
  return `/dh ${sinal(m)}` + (v > 0 ? ' vantagem' : v < 0 ? ' desvantagem' : '') + (rotulo ? ` # ${rotulo}` : '');
}

function montarBarra() {
  const caixa = $('botoes-dado'); caixa.textContent = '';
  if (estado.campanha.sistema === 'dh') {
    const b = el('button', 'dh', '🌗 Dualidade'); b.title = 'd12 de Esperança + d12 de Medo + modificador';
    b.onclick = () => enviar(dualidade(mod())); caixa.append(b);
  }
  for (const f of [4, 6, 8, 10, 12, 20, 100]) {
    const b = el('button', f === 20 ? 'd20' : '', 'd' + f);
    b.onclick = () => enviar(f === 20 ? d20(mod()) : `/r 1d${f}${comMod(mod())}`);
    caixa.append(b);
  }
  $('dica').textContent = estado.campanha.sistema === 'dh'
    ? '/r 2d6+3 · /dh +2 vantagem · # dá nome à rolagem' + (estado.voce.mestre ? ' · /gr e /gdh rolam escondido' : '')
    : '/r 1d20+5 · /r 4d6kh3 · # dá nome à rolagem' + (estado.voce.mestre ? ' · /gr rola escondido' : '');
}

/** Envia texto ao chat. Com "Escondida" marcada, o mestre transforma /r em /gr e /dh em /gdh. */
async function enviar(texto, comoPeca) {
  let t = texto.trim(); if (!t) return;
  if (escondida()) t = t.replace(/^\/(r|roll|rolar)(\s|$)/i, '/gr$2').replace(/^\/(dh|dualidade)(\s|$)/i, '/gdh$2');
  const como = !estado || !estado.voce.mestre ? undefined : comoPeca ? comoPeca : $('como').value ? Number($('como').value) : undefined;
  await post('chat', { texto: t, como });
  if (!prefs.painel) alternar('painel');
  abrirAba('chat');
}
$('enviar').onclick = () => { const i = $('texto'); enviar(i.value).then(() => (i.value = '')).catch(() => {}); };
$('texto').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('enviar').onclick(); } });

const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const pertoDoFim = () => { const m = $('mensagens'); return m.scrollHeight - m.scrollTop - m.clientHeight < 80; };
const rolarParaFim = () => { const m = $('mensagens'); m.style.scrollBehavior = 'auto'; m.scrollTop = m.scrollHeight; m.style.scrollBehavior = ''; };

function desenharRolagem(r, rotulo, secreta) {
  const caixa = el('div', 'cartao ' + (secreta ? 'secreta ' : '') + (r.tipo === 'dualidade' ? 'dualidade ' : '') + (r.tipo === 'dualidade' && r.resultado === 'critico' ? 'critico' : ''));
  if (rotulo) caixa.append(el('div', 'rotulo', rotulo));
  const dados = el('div', 'dados');
  if (r.tipo === 'dados') {
    caixa.append(el('div', 'expr', r.expressao));
    for (const p of r.pedacos) {
      if (p.t === 'op') dados.append(el('span', 'op', p.v));
      else if (p.t === 'fixo') dados.append(el('span', 'dado', String(p.v)));
      else dados.append(el('span', 'dado' + (!p.mantido ? ' fora' : p.v === p.faces ? ' max' : p.v === 1 ? ' um' : ''), String(p.v)));
    }
  } else {
    caixa.append(el('div', 'expr', 'Dualidade ' + sinal(r.modificador) + (r.vantagem > 0 ? ' com vantagem' : r.vantagem < 0 ? ' com desvantagem' : '')));
    const e = el('span', 'dado esperanca', String(r.esperanca)); e.title = 'Esperança';
    const m = el('span', 'dado medo', String(r.medo)); m.title = 'Medo';
    dados.append(e, el('span', 'op', '+'), m);
    if (r.d6) { dados.append(el('span', 'op', r.vantagem > 0 ? '+' : '-')); const d = el('span', 'dado', String(r.d6)); d.title = 'd6'; dados.append(d); }
    if (r.modificador) dados.append(el('span', 'op', r.modificador > 0 ? '+' : '-'), el('span', 'dado', String(Math.abs(r.modificador))));
  }
  dados.append(el('span', 'op', '='));
  // Os dados entram rolando um atrás do outro (só na mensagem nova, pelo CSS).
  [...dados.querySelectorAll('.dado')].forEach((d, i) => { d.style.animationDelay = i * 70 + 'ms'; });
  const linha = el('div'); linha.append(el('span', 'total', String(r.total)));
  if (r.tipo === 'dados') {
    // Um d20 só (normal, vantagem ou desvantagem): 20 e 1 naturais ganham faixa.
    const d20s = r.pedacos.filter((p) => p.t !== 'op' && p.t !== 'fixo' && p.faces === 20 && p.mantido);
    if (d20s.length === 1 && d20s[0].v === 20) linha.append(el('span', 'faixa vinte', '⚔️ VINTE NATURAL!'));
    else if (d20s.length === 1 && d20s[0].v === 1) linha.append(el('span', 'faixa um', '💀 FALHA CRÍTICA'));
  }
  if (r.tipo === 'dualidade') {
    const txt = { critico: '✨ Sucesso crítico!', esperanca: 'com Esperança', medo: 'com Medo' }[r.resultado];
    linha.append(el('span', 'resultado ' + r.resultado, txt));
  }
  caixa.append(dados, linha);
  return caixa;
}

let ultimoAnimado = null; // mensagens com id maior que este entram animadas (na primeira carga, nenhuma)
function desenharChat() {
  const caixa = $('mensagens'), descer = pertoDoFim();
  caixa.textContent = '';
  if (!chat.length) {
    const v = el('div', 'vazio-chat'); v.append(el('span', 'grande', '🍺'), document.createTextNode('A taverna está em silêncio…'), document.createElement('br'), document.createTextNode('Puxe assunto ou role um dado.'));
    caixa.append(v);
  }
  for (const m of chat) {
    const minha = estado && m.userId === estado.voce.id;
    const d = el('div', 'msg' + (minha ? ' minha' : '') + (ultimoAnimado !== null && m.id > ultimoAnimado ? ' nova' : ''));
    // Quando o mestre fala por um NPC, aparece a foto do NPC no lugar da dele.
    // Jogador aparece com a foto do personagem; o mestre, com a foto dele do Discord.
    const npc = m.pecaId && estado ? estado.pecas.find((p) => p.id === m.pecaId) : null;
    const personagem = !m.pecaId && estado ? estado.pecas.find((p) => p.userId && p.userId === m.userId) : null;
    const av = el('div', 'avatar');
    if (npc) pintarAvatar(av, npc.nome, npc.avatar, corDe(npc));
    else if (personagem) pintarAvatar(av, m.autor, personagem.avatar, corDe(personagem));
    else pintarAvatar(av, m.autor, estado && m.userId === estado.campanha.mestreId ? estado.campanha.mestreAvatar : minha ? estado.voce.avatar : null);
    const c = el('div', 'conteudo');
    const topo = el('div', 'topo'); topo.append(el('b', '', m.autor), el('time', '', hora(m.em)));
    c.append(topo);
    if (m.tipo === 'msg') {
      c.append(el('div', 'corpo', m.texto));
      if (m.resultado && m.resultado.tipo === 'carta') {
        if (!catalogoCartas) carregarCatalogo().then(() => desenharChat()).catch(() => {});
        else { const ct = catalogoCartas.mapa.get(m.resultado.id); if (ct) { const mini = el('div', 'carta-pr carta-chat'); mini.append(desenhoCarta(ct)); mini.onclick = () => zoomCarta(ct, null); c.append(mini); } }
      }
      const pg = /📖 Livro p\. (\d+)/.exec(m.texto);
      if (pg && estado && estado.livro) { const b = el('button', 'btn sec link-livro', '📖 Abrir na página ' + pg[1]); b.onclick = () => abrirLivro(Number(pg[1])); c.append(b); }
    }
    else if (m.resultado) c.append(desenharRolagem(m.resultado, m.texto, m.secreta));
    if (m.secreta) {
      c.append(el('span', 'selo', '🔒 Escondida: só você vê'));
      const b = el('button', 'btn sec', '👁️ Mostrar para a mesa'); b.style.marginTop = '6px';
      b.onclick = () => post('chat/revelar', { id: m.id }).catch(() => {});
      c.append(b);
    } else if (m.revelada) c.append(el('span', 'selo revelada', '👁️ Revelada pelo mestre'));
    d.append(av, c);
    caixa.append(d);
  }
  if (chat.length) ultimoAnimado = Math.max(ultimoAnimado ?? 0, ...chat.map((m) => m.id));
  else if (ultimoAnimado === null) ultimoAnimado = 0;
  if (descer) rolarParaFim();
}

async function carregarChat() { return carregarChatJunto(); }
const carregarChatJunto = juntar(carregarChatAgora);
async function carregarChatAgora() {
  const novo = await pegar('chat');
  const sig = JSON.stringify(novo);
  if (sig === sigChat) return;
  sigChat = sig;
  const ultimo = novo.length ? novo[novo.length - 1].id : 0;
  const recentes = novo.filter((m) => m.id > ultimoChat && estado && m.userId !== estado.voce.id);
  if (!primeiroChat) {
    const chatVisivel = $('aba-chat').classList.contains('ativa') && prefs.painel;
    if (!chatVisivel) { novas += recentes.length; contador(); }
    // Rolagem de outra pessoa aparece em um aviso sobre o mapa, mesmo com o painel fechado.
    for (const m of recentes) if (m.tipo !== 'msg' && m.resultado && !chatVisivel) aviso(`🎲 ${m.autor}: ${m.resultado.total}${m.texto ? ' · ' + m.texto : ''}`, 'dado');
    if (!chatVisivel) for (const m of recentes) if (m.tipo === 'msg') aviso(`💬 ${m.autor}: ${m.texto.slice(0, 80)}`, '');
  }
  if (!primeiroChat) { const rol = novo.filter((m) => m.id > ultimoChat && m.tipo !== 'msg' && m.resultado && !m.secreta).pop(); if (rol) animarDados(rol); }
  primeiroChat = false;
  ultimoChat = ultimo; chat = novo; desenharChat();
}

function marcarConexao(ok) { online = ok; $('ponto').classList.toggle('ok', ok); $('ponto').title = ok ? 'Conectado à mesa' : 'Sem conexão: tentando de novo…'; }

function conectar() {
  const es = new EventSource(api('eventos'));
  es.onmessage = (e) => {
    if (e.data.startsWith('ping:')) { aplicarEfeito('ping', e.data.slice(5)); return; }
    if (e.data.startsWith('efeito:')) { aplicarEfeito('efeito', e.data.slice(7)); return; }
    (e.data === 'chat' ? carregarChat() : carregar()).catch(() => {});
  };
  es.onopen = () => { carregar().catch(() => {}); carregarChat().catch(() => {}); };
  // Plano B (o tempo real pode não chegar por causa do túnel ou da rede): o pulso, a cada 1,5 s.
}
