// ---------- Livro de regras ----------
// Leitor próprio com PDF.js: busca só os pedaços de cada página (Range), vira a página na hora e funciona no celular.
// Em tela larga, o livro fica aberto (duas páginas, como impresso: a 1 sozinha à direita, depois 2-3, 4-5...).
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/';
const chaveMarcadores = 'mapa_livro_' + ID;
const lerMarcadores = () => { try { return JSON.parse(localStorage.getItem(chaveMarcadores) || '[]').filter((m) => m && m.p > 0); } catch { return []; } };
const gravarMarcadores = (l) => { try { localStorage.setItem(chaveMarcadores, JSON.stringify(l.slice(0, 60))); } catch {} };
const mb = (n) => (n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' MB';
const livro = { url: '', doc: null, abrindo: null, pagina: 1, zoom: 1, tarefas: [], textos: [], busca: 0, umaPagina: false, sumario: undefined, vez: 0 };
try { livro.umaPagina = localStorage.getItem('mapa_livro_modo') === 'uma'; } catch {}

function painelLivro() {
  const l = estado.livro;
  $('f-livro').hidden = true; // o livro abre pela barra de ícones (e pela tecla L)
  $('painel-livro').hidden = !estado.voce.mestre;
  $('livro-status').textContent = l ? '✅ Livro na mesa (' + mb(l.tamanho) + ').' : 'Nenhum livro ainda. Envie o PDF das regras para a mesa consultar.';
  $('livro-abrir').hidden = !l; $('livro-tirar').hidden = !l;
  if (!l && !$('modal-livro').hidden) $('modal-livro').hidden = true;
}

function desenharMarcadores() {
  const sel = $('ml-marcadores'), atual = sel.value; sel.textContent = '';
  const lista = lerMarcadores();
  sel.append(new Option(lista.length ? '🔖 Marcadores (' + lista.length + ')' : '🔖 Sem marcadores', ''));
  for (const m of lista) sel.append(new Option('p. ' + m.p + ' · ' + m.nome, String(m.p)));
  sel.value = [...sel.options].some((o) => o.value === atual) ? atual : '';
  $('ml-desmarcar').hidden = !sel.value;
}
const carregandoLivro = (txt) => { $('ml-carregando').hidden = !txt; if (txt) $('ml-carregando').firstChild.lastChild.textContent = txt; };

/** Carrega o PDF.js e abre o documento (uma vez por versão do livro). */
async function documentoDoLivro() {
  const l = estado.livro;
  if (livro.doc && livro.url === l.url) return livro.doc;
  if (livro.abrindo && livro.url === l.url) return livro.abrindo;
  livro.url = l.url; livro.doc = null; livro.textos = []; livro.sumario = undefined;
  livro.abrindo = (async () => {
    const pdfjs = await import(PDFJS + 'pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
    const tarefa = pdfjs.getDocument({ url: l.url, disableAutoFetch: true, disableStream: true, rangeChunkSize: 262144, withCredentials: true });
    tarefa.onProgress = ({ loaded }) => { if (!livro.doc) carregandoLivro('Abrindo o livro… ' + mb(loaded)); };
    const doc = await tarefa.promise;
    livro.doc = doc;
    $('ml-total').textContent = '/ ' + doc.numPages;
    $('ml-pagina').max = String(doc.numPages);
    $('ml-sub').textContent = (estado.campanha.sistema === 'dh' ? 'Daggerheart' : 'D&D') + ' · ' + doc.numPages + ' páginas · ← → viram a página';
    return doc;
  })();
  try { return await livro.abrindo; } catch (e) { livro.url = ''; throw e; } finally { livro.abrindo = null; }
}

const livroAberto = () => !livro.umaPagina && $('ml-folha').clientWidth >= 900;
/** Páginas à vista: [esquerda, direita] no livro aberto, ou [null, p] com uma página só. */
function paginasAVista(p, n) {
  if (!livroAberto()) return [null, p];
  if (p <= 1) return [null, 1];
  const esq = p % 2 === 0 ? p : p - 1;
  return [esq, esq + 1 <= n ? esq + 1 : null];
}

/** Desenha uma página do PDF num canvas, fora da tela primeiro (a troca não pisca). */
async function desenharPaginaLivro(caixa, numero, larguraMax, alturaMax) {
  const cv = caixa.querySelector('canvas');
  caixa.classList.toggle('vazia', !numero);
  caixa.querySelector('.num').textContent = numero ? String(numero) : '';
  const fitaVelha = caixa.querySelector('.fita'); if (fitaVelha) fitaVelha.remove();
  if (!numero) { cv.width = 0; cv.height = 0; cv.style.width = '0px'; cv.style.height = '0px'; return; }
  const pagina = await livro.doc.getPage(numero), dpr = devicePixelRatio || 1, base = pagina.getViewport({ scale: 1 });
  const escala = Math.max(0.15, Math.min(larguraMax / base.width, alturaMax / base.height) * livro.zoom);
  const vp = pagina.getViewport({ scale: escala * dpr });
  const temp = document.createElement('canvas'); temp.width = Math.floor(vp.width); temp.height = Math.floor(vp.height);
  const tarefa = pagina.render({ canvasContext: temp.getContext('2d'), viewport: vp });
  livro.tarefas.push(tarefa);
  await tarefa.promise;
  cv.width = temp.width; cv.height = temp.height; cv.style.width = Math.floor(vp.width / dpr) + 'px'; cv.style.height = Math.floor(vp.height / dpr) + 'px';
  cv.getContext('2d').drawImage(temp, 0, 0);
  if (lerMarcadores().some((m) => m.p === numero)) caixa.append(el('div', 'fita'));
}

async function mostrarPagina(sentido) {
  const doc = livro.doc; if (!doc) return;
  const vez = ++livro.vez;
  livro.pagina = Math.min(doc.numPages, Math.max(1, livro.pagina));
  if (document.activeElement !== $('ml-pagina')) $('ml-pagina').value = String(livro.pagina);
  for (const t of livro.tarefas.splice(0)) t.cancel();
  const [esq, dir] = paginasAVista(livro.pagina, doc.numPages), folha = $('ml-folha');
  const dois = livroAberto(), larg = (folha.clientWidth - 52 - (dois ? 14 : 0)) / (dois ? 2 : 1), alt = folha.clientHeight - 56;
  $('ml-pag-e').hidden = !dois;
  $('ml-pag-d').classList.toggle('so', !dois);
  $('ml-modo').textContent = dois ? '📖' : '📄';
  $('ml-modo').classList.toggle('on', !livro.umaPagina);
  const demora = setTimeout(() => { if (vez === livro.vez) carregandoLivro('Virando a página…'); }, 180);
  try {
    await Promise.all([dois ? desenharPaginaLivro($('ml-pag-e'), esq, larg, alt) : null, desenharPaginaLivro($('ml-pag-d'), dir, dois ? larg : Math.max(larg, 200), dois ? alt : Math.max(alt, larg * 1.3))]);
  } catch { return; } // outra página foi pedida no meio
  finally { clearTimeout(demora); }
  if (vez !== livro.vez) return;
  carregandoLivro('');
  const lv = $('ml-livro'); lv.classList.remove('vira-prox', 'vira-ant');
  if (sentido) { void lv.offsetWidth; lv.classList.add(sentido > 0 ? 'vira-prox' : 'vira-ant'); }
  $('ml-virar-ant').hidden = livro.pagina <= 1;
  $('ml-virar-prox').hidden = (dir || esq || livro.pagina) >= doc.numPages;
  for (const a of document.querySelectorAll('.achado')) a.classList.toggle('atual', Number(a.dataset.p) === esq || Number(a.dataset.p) === dir);
}

/** Abre a janela do livro (na página pedida, se houver). */
async function abrirLivro(pagina) {
  if (!estado || !estado.livro) return aviso('Esta mesa ainda não tem o livro de regras.', 'erro');
  $('modal-livro').hidden = false;
  desenharMarcadores();
  if (pagina) livro.pagina = Math.max(1, Math.floor(Number(pagina)));
  if (!livro.doc || livro.url !== estado.livro.url) carregandoLivro('Abrindo o livro…');
  try { await documentoDoLivro(); } catch (e) { carregandoLivro('Não consegui abrir o livro. Feche e tente de novo.'); console.error(e); return; }
  await mostrarPagina();
  $('ml-folha').scrollTop = 0;
}
/** Vai para a página p (com a animação no sentido certo). */
function irPara(p) {
  const antes = livro.pagina; livro.pagina = p;
  mostrarPagina(Math.sign(p - antes)).catch(() => {}); $('ml-folha').scrollTop = 0;
}
// No livro aberto, vira de duas em duas.
const virar = (d) => {
  const [esq, dir] = paginasAVista(livro.pagina, livro.doc ? livro.doc.numPages : 1);
  if (!livroAberto()) return irPara(livro.pagina + d);
  irPara(d > 0 ? (dir || esq || livro.pagina) + 1 : Math.max(1, (esq || dir || livro.pagina) - 1));
};

// ----- Painel lateral: sumário e busca -----
function abrirLateral(titulo) {
  $('ml-lateral').hidden = false; $('ml-lateral-titulo').textContent = titulo; $('ml-resultados').textContent = '';
  setTimeout(() => mostrarPagina().catch(() => {}), 220); // o espaço do livro mudou
}
$('ml-lateral-fechar').onclick = () => { livro.busca++; $('ml-lateral').hidden = true; $('ml-busca').value = ''; setTimeout(() => mostrarPagina().catch(() => {}), 50); };

/** Sumário: o do PDF, se tiver; senão, a página do sumário impresso (a que tem mais linhas pontilhadas no começo do livro). */
async function sumarioDoLivro() {
  if (livro.sumario !== undefined) return livro.sumario;
  const doc = await documentoDoLivro(), itens = [];
  const contorno = await doc.getOutline().catch(() => null);
  const paginaDe = async (dest) => {
    try { const d = typeof dest === 'string' ? await doc.getDestination(dest) : dest; return d ? (await doc.getPageIndex(d[0])) + 1 : null; } catch { return null; }
  };
  if (contorno && contorno.length) {
    for (const i of contorno) {
      itens.push({ t: i.title, p: await paginaDe(i.dest), nivel: 0 });
      for (const j of i.items || []) itens.push({ t: j.title, p: await paginaDe(j.dest), nivel: 1 });
    }
    return (livro.sumario = { itens });
  }
  let melhor = null, pontos = 4;
  for (let p = 1; p <= Math.min(12, doc.numPages); p++) {
    const t = await textoDaPagina(p), n = (t.match(/\.{6,}/g) || []).length;
    if (n > pontos) { pontos = n; melhor = p; }
  }
  return (livro.sumario = { impresso: melhor });
}
async function textoDaPagina(p) {
  if (livro.textos[p] === undefined) {
    try { livro.textos[p] = (await (await livro.doc.getPage(p)).getTextContent()).items.map((i) => i.str).join(' ').replace(/\s+/g, ' '); } catch { livro.textos[p] = ''; }
  }
  return livro.textos[p];
}
$('ml-sumario').onclick = async () => {
  const sum = await sumarioDoLivro().catch(() => null);
  if (sum && sum.impresso) { irPara(sum.impresso); return aviso('📜 Sumário do livro na página ' + sum.impresso + '.', 'ok', 2500); }
  abrirLateral('📜 Sumário');
  const caixa = $('ml-resultados');
  if (!sum || !sum.itens || !sum.itens.length) return caixa.append(el('div', 'lateral-vazio', 'Este PDF não tem sumário. Use a busca ou os marcadores.'));
  for (const i of sum.itens) {
    const b = el('button', 'achado ' + (i.nivel ? 'sub' : 'cap')); b.dataset.p = String(i.p || '');
    b.append(el('b', '', i.p ? 'p. ' + i.p : '—'), document.createTextNode(i.t));
    if (i.p) b.onclick = () => irPara(i.p);
    caixa.append(b);
  }
};

// Busca: lê o texto página por página (só o texto, sem baixar as imagens) e mostra os trechos.
const semAcento = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
async function procurarNoLivro(termo) {
  const minha = ++livro.busca, q = semAcento(termo.trim());
  if (q.length < 2) return;
  const doc = await documentoDoLivro();
  abrirLateral('🔎 Procurando…');
  const caixa = $('ml-resultados'), rot = $('ml-lateral-titulo');
  let achados = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    if (minha !== livro.busca) return; // outra busca começou
    const texto = await textoDaPagina(p), i = semAcento(texto).indexOf(q);
    if (i >= 0) {
      achados++;
      const ini = Math.max(0, i - 50), fim = Math.min(texto.length, i + q.length + 70);
      const b = el('button', 'achado'); b.dataset.p = String(p);
      b.append(el('b', '', 'p. ' + p), document.createTextNode((ini > 0 ? '…' : '') + texto.slice(ini, i)), el('mark', '', texto.slice(i, i + q.length)), document.createTextNode(texto.slice(i + q.length, fim) + (fim < texto.length ? '…' : '')));
      b.onclick = () => irPara(p);
      caixa.append(b);
    }
    if (p % 10 === 0 || p === doc.numPages) rot.textContent = p === doc.numPages ? '🔎 ' + achados + (achados === 1 ? ' página' : ' páginas') + ' com "' + termo.trim() + '"' : '🔎 Procurando… ' + p + '/' + doc.numPages + ' (' + achados + ')';
  }
  if (!achados) caixa.append(el('div', 'lateral-vazio', 'Nada encontrado. Tente outra palavra.'));
}

// ----- Controles -----
$('f-livro').onclick = () => abrirLivro();
new MutationObserver(() => { if (!$('modal-livro').hidden) return; $('modal-livro').querySelector('.caixa').classList.remove('cheia'); $('ml-cheia').classList.remove('on'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }).observe($('modal-livro'), { attributes: true, attributeFilter: ['hidden'] });
$('livro-abrir').onclick = () => abrirLivro();
$('ml-ant').onclick = () => virar(-1);
$('ml-prox').onclick = () => virar(1);
$('ml-virar-ant').onclick = () => virar(-1);
$('ml-virar-prox').onclick = () => virar(1);
$('ml-pag-e').onclick = () => { if (livroAberto() && livro.zoom <= 1.01 && !puxou) virar(-1); };
$('ml-pag-d').onclick = () => { if (livroAberto() && livro.zoom <= 1.01 && !puxou) virar(1); };
/** Zoom do livro em direção a um ponto (o do mouse): mostra na hora com CSS e redesenha nítido logo depois. */
let zoomRender = 1, esperaZoom = 0;
function zoomLivro(novo, cx, cy) {
  novo = Math.min(4, Math.max(0.5, novo));
  if (Math.abs(novo - livro.zoom) < 0.001) return;
  const folha = $('ml-folha'), r = folha.getBoundingClientRect();
  const px = (cx ?? r.left + r.width / 2) - r.left, py = (cy ?? r.top + r.height / 2) - r.top;
  const fx = (folha.scrollLeft + px) / (folha.scrollWidth || 1), fy = (folha.scrollTop + py) / (folha.scrollHeight || 1);
  livro.zoom = novo;
  $('ml-zoom').textContent = Math.round(novo * 100) + '%';
  folha.classList.toggle('ampliado', novo > 1.01);
  const lv = $('ml-livro'); lv.style.transformOrigin = '0 0'; lv.style.transform = 'scale(' + novo / zoomRender + ')';
  clearTimeout(esperaZoom);
  esperaZoom = setTimeout(() => mostrarPagina().then(() => {
    lv.style.transform = ''; zoomRender = livro.zoom;
    folha.scrollLeft = fx * folha.scrollWidth - px; folha.scrollTop = fy * folha.scrollHeight - py;
  }).catch(() => {}), 160);
}
$('ml-mais').onclick = () => zoomLivro(livro.zoom * 1.25);
$('ml-menos').onclick = () => zoomLivro(livro.zoom / 1.25);
$('ml-folha').addEventListener('wheel', (e) => { e.preventDefault(); zoomLivro(livro.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY); }, { passive: false });
$('ml-folha').addEventListener('dblclick', (e) => { e.preventDefault(); zoomLivro(1); });
// Com zoom, arrastar move a página (e o clique não vira a página).
let puxando = null, puxou = false;
$('ml-folha').addEventListener('pointerdown', (e) => {
  if (livro.zoom <= 1.01 || e.button !== 0 || e.target.closest('button')) return;
  puxando = { x: e.clientX, y: e.clientY, sl: $('ml-folha').scrollLeft, st: $('ml-folha').scrollTop }; puxou = false;
  $('ml-folha').classList.add('arrastando');
});
addEventListener('pointermove', (e) => {
  if (!puxando) return;
  const dx = e.clientX - puxando.x, dy = e.clientY - puxando.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) puxou = true;
  $('ml-folha').scrollLeft = puxando.sl - dx; $('ml-folha').scrollTop = puxando.st - dy;
});
addEventListener('pointerup', () => { if (puxando) { puxando = null; $('ml-folha').classList.remove('arrastando'); setTimeout(() => { puxou = false; }, 0); } });
/** Tela cheia: o livro ocupa a janela toda e, se o navegador deixar, a tela toda (sem barras). */
function telaCheiaLivro() {
  const caixa = $('modal-livro').querySelector('.caixa'), cheia = !caixa.classList.contains('cheia');
  caixa.classList.toggle('cheia', cheia);
  $('ml-cheia').classList.toggle('on', cheia);
  if (cheia && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  if (!cheia && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  setTimeout(() => mostrarPagina().catch(() => {}), 150);
}
$('ml-cheia').onclick = telaCheiaLivro;
document.addEventListener('fullscreenchange', () => { if (!$('modal-livro').hidden) setTimeout(() => mostrarPagina().catch(() => {}), 120); });
$('ml-modo').onclick = () => {
  livro.umaPagina = !livro.umaPagina; livro.zoom = 1; zoomRender = 1; $('ml-zoom').textContent = '100%'; $('ml-folha').classList.remove('ampliado');
  try { localStorage.setItem('mapa_livro_modo', livro.umaPagina ? 'uma' : 'duas'); } catch {}
  mostrarPagina().catch(() => {});
};
$('ml-pagina').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const p = Number($('ml-pagina').value); if (p) irPara(p); $('ml-pagina').blur(); } });
let esperaBusca = 0;
$('ml-busca').addEventListener('input', () => { clearTimeout(esperaBusca); esperaBusca = setTimeout(() => procurarNoLivro($('ml-busca').value).catch(() => {}), 450); });
$('ml-busca').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(esperaBusca); procurarNoLivro($('ml-busca').value).catch(() => {}); } });
$('ml-marcadores').onchange = () => { const p = Number($('ml-marcadores').value); $('ml-desmarcar').hidden = !p; if (p) irPara(p); };
$('ml-marcar').onclick = () => {
  const [esq, dir] = paginasAVista(livro.pagina, livro.doc ? livro.doc.numPages : 1), p = livroAberto() ? (livro.pagina === esq ? esq : dir || esq) : livro.pagina;
  const ja = lerMarcadores().find((m) => m.p === p), termo = !$('ml-lateral').hidden && $('ml-busca').value.trim();
  const nome = (termo || (ja ? ja.nome : 'Página ' + p)).slice(0, 40);
  gravarMarcadores([...lerMarcadores().filter((m) => m.p !== p), { p, nome }].sort((a, b) => a.p - b.p));
  desenharMarcadores(); $('ml-marcadores').value = String(p); $('ml-desmarcar').hidden = false;
  mostrarPagina().catch(() => {});
  aviso('🔖 Página ' + p + ' marcada como "' + nome + '".', 'ok', 2500);
};
$('ml-desmarcar').onclick = () => { const p = Number($('ml-marcadores').value); gravarMarcadores(lerMarcadores().filter((m) => m.p !== p)); desenharMarcadores(); mostrarPagina().catch(() => {}); };
$('ml-mesa').onclick = () => {
  const p = livro.pagina, marcador = lerMarcadores().find((m) => m.p === p);
  enviar('📖 Livro p. ' + p + (marcador ? ' · ' + marcador.nome : '')).then(() => aviso('📣 Página ' + p + ' enviada para a mesa.', 'ok', 2500)).catch(() => {});
};
$('ml-aba').onclick = () => { if (estado && estado.livro) window.open(estado.livro.url + '#page=' + livro.pagina, '_blank', 'noopener'); };
// Setas viram a página com o livro aberto (fora das caixas de texto).
addEventListener('keydown', (e) => {
  if ($('modal-livro').hidden || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); e.stopImmediatePropagation(); telaCheiaLivro(); return; }
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); e.stopImmediatePropagation(); virar(1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); e.stopImmediatePropagation(); virar(-1); }
}, true);
// No celular: arrastar o dedo para o lado vira a página.
let toqueLivro = null;
$('ml-folha').addEventListener('touchstart', (e) => { if (e.touches.length === 1) toqueLivro = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
$('ml-folha').addEventListener('touchend', (e) => {
  if (!toqueLivro || livro.zoom > 1.01) return (toqueLivro = null);
  const dx = e.changedTouches[0].clientX - toqueLivro.x, dy = e.changedTouches[0].clientY - toqueLivro.y; toqueLivro = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) virar(dx < 0 ? 1 : -1);
});
let esperaTamanho = 0;
addEventListener('resize', () => { if ($('modal-livro').hidden) return; clearTimeout(esperaTamanho); esperaTamanho = setTimeout(() => mostrarPagina().catch(() => {}), 150); });

$('livro-arquivo').onchange = async (e) => {
  const arq = e.target.files[0]; e.target.value = '';
  if (!arq) return;
  if (arq.size > 95 * 1024 * 1024) return aviso('Esse PDF tem ' + mb(arq.size) + ': pelo mapa vão até 95 MB. Livros maiores são copiados direto no servidor.', 'erro');
  aviso('📖 Enviando o livro (' + mb(arq.size) + ')…', '', 60000);
  try { await post('livro', undefined, { headers: { 'Content-Type': 'application/pdf' }, body: arq }); aviso('📖 Livro na mesa!', 'ok'); } catch {}
};
$('livro-tirar').onclick = () => {
  const b = $('livro-tirar');
  if (!b.dataset.armado) { b.dataset.armado = '1'; b.textContent = 'Tirar mesmo?'; setTimeout(() => { delete b.dataset.armado; b.textContent = 'Tirar'; }, 4000); return; }
  delete b.dataset.armado; b.textContent = 'Tirar';
  post('livro/remover', {}).catch(() => {});
};
