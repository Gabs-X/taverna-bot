const ID = location.pathname.split('/').pop();
const api = (p) => `/api/m/${ID}/${p}`;
const $ = (s) => document.getElementById(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
const cv = $('c'), ctx = cv.getContext('2d');
let estado = null, imagem = null, versaoImagem = -1;
let cam = { x: 0, y: 0, z: 1 }, ajustou = false;
let selecionada = null, arrasto = null, regua = null, usandoRegua = false;
let chat = [], ultimoChat = 0, novas = 0, primeiroChat = true;
let sigEstado = '', sigChat = ''; // para não redesenhar à toa quando nada mudou
let online = false, passoPendente = null, ultimoPasso = 0, filtroLib = 'todos', pincel = null;
const avatares = new Map();
const CORES = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e84393'];

// ---------- Preferências (ficam no navegador) ----------
const prefs = Object.assign({ grade: true, encaixar: true, painel: true }, (() => { try { return JSON.parse(localStorage.getItem('mapa_prefs') || '{}'); } catch { return {}; } })());
const salvarPrefs = () => { try { localStorage.setItem('mapa_prefs', JSON.stringify(prefs)); } catch {} };

// ---------- Avisos ----------
function aviso(msg, tipo = '', ms) {
  if ([...$('toasts').children].some((t) => t.textContent === msg)) return; // não empilha o mesmo aviso
  const t = el('div', 'toast ' + tipo, msg);
  $('toasts').append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, ms || (tipo === 'erro' ? 8000 : 3500));
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
const mostrarErro = (msg) => aviso(msg, 'erro');

async function post(p, corpo, opcoes = {}) {
  const r = await fetch(api(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo), ...opcoes });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { mostrarErro(j.erro || 'Não deu certo.'); throw new Error(j.erro); }
  // Não espera o aviso em tempo real (alguns túneis não entregam): puxa o que mudou na hora.
  if (p === 'chat' || p === 'chat/revelar' || p === 'chat/limpar') carregarChat().catch(() => {});
  else if (p !== 'mover' && !p.startsWith('tela/') && !p.startsWith('som/') && p !== 'efeito' && p !== 'ping') carregar().catch(() => {});
  return j;
}
async function pegar(p) {
  const r = await fetch(api(p));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { mostrarErro(j.erro || 'Não consegui carregar.'); throw new Error(j.erro); }
  return j;
}

// ---------- Utilidades de aparência ----------
const corDoTexto = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 55% 45%)`; };
const iniciais = (nome) => (String(nome).replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || '?').toUpperCase();
function pintarAvatar(div, nome, url, cor) {
  div.style.setProperty('--cor', cor || corDoTexto(nome));
  div.style.backgroundColor = corDoTexto(nome);
  if (url) { div.style.backgroundImage = `url("${String(url).replace(/"/g, '%22')}")`; div.textContent = ''; } else { div.style.backgroundImage = ''; div.textContent = iniciais(nome); }
}
function fracPV(p) {
  const f = p.ficha; if (!f) return null;
  if (typeof f.pv_max !== 'number' || f.pv_max <= 0) return null;
  if (typeof f.pv_atual === 'number') return { frac: Math.max(0, Math.min(1, f.pv_atual / f.pv_max)), texto: `${f.pv_atual}/${f.pv_max} PV` };
  if (typeof f.pv === 'number') return { frac: Math.max(0, Math.min(1, 1 - f.pv / f.pv_max)), texto: `${f.pv_max - f.pv}/${f.pv_max} PV livres` };
  return null;
}
const classeBarra = (frac) => (frac <= 0.25 ? 'baixo' : frac <= 0.55 ? 'medio' : '');
