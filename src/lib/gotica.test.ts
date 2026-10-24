import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apagarRetrato, desenharGotica } from './goticaArte.ts';
import { aplicarAcao, ESPERA_ACAO, estaMorta, fomeDepois, lerAparencia, morreEm, reviver, nomeDaOpcao, OPCOES, PARTES, humorDe, sortearAparencia, statusAgora, xpParaProximo, type Estado } from './gotica.ts';

const HORA = 3_600_000;
const base = (extra: Partial<Estado> = {}): Estado => ({ nivel: 1, xp: 0, barriga: 70, humor: 70, energia: 80, atualizadoEm: 0, ultimas: {}, ...extra });

test('status caem com o tempo e nunca ficam negativos', () => {
  assert.deepEqual(statusAgora(base(), 10 * HORA), { barriga: 30, humor: 40, energia: 60 });
  assert.deepEqual(statusAgora(base(), 100 * HORA), { barriga: 0, humor: 0, energia: 0 });
});

test('humor: triste quando algum status está muito baixo', () => {
  assert.equal(humorDe({ barriga: 80, humor: 80, energia: 80 }), 'feliz');
  assert.equal(humorDe({ barriga: 80, humor: 45, energia: 80 }), 'neutra');
  assert.equal(humorDe({ barriga: 10, humor: 90, energia: 80 }), 'triste');
});

test('ação dá XP, sobe de nível e respeita a espera', () => {
  const r = aplicarAcao(base({ xp: 45 }), 'passear', 0, () => 0);
  assert.ok(r.ok);
  assert.equal(r.estado.nivel, 2);
  assert.equal(r.estado.xp, 45 + 20 - xpParaProximo(1));
  assert.deepEqual(r.subiu, [2]);

  const repetida = aplicarAcao(r.estado, 'passear', ESPERA_ACAO - 1);
  assert.equal(repetida.ok, false);
  assert.equal(aplicarAcao(r.estado, 'conversar', 1).ok, true);
});

test('cansada não passeia; triste ganha metade do XP', () => {
  assert.equal(aplicarAcao(base({ energia: 10 }), 'passear', 0).ok, false);
  const r = aplicarAcao(base({ barriga: 5 }), 'conversar', 0);
  assert.ok(r.ok);
  assert.equal(r.xpGanho, 6);
});

test('morre 24 h depois da barriga zerar; comer antes salva', () => {
  // Barriga 70 caindo 4/h zera em 17,5 h; morre 24 h depois.
  const e = base();
  assert.equal(morreEm(e), 41.5 * HORA);
  assert.equal(estaMorta(e, 41.5 * HORA - 1), false);
  assert.equal(estaMorta(e, 41.5 * HORA), true);

  // Com fome há 23 h, alimentar zera a contagem.
  const r = aplicarAcao(e, 'alimentar', 40.5 * HORA);
  assert.ok(r.ok);
  assert.equal(r.estado.fomeDesde, null);
  assert.equal(estaMorta(r.estado, 60 * HORA), false);

  // Morta não faz nada até reviver.
  assert.equal(aplicarAcao(e, 'alimentar', 50 * HORA).ok, false);
  const viva = reviver(e, 50 * HORA);
  assert.equal(estaMorta(viva, 50 * HORA), false);
  assert.equal(aplicarAcao(viva, 'alimentar', 50 * HORA).ok, true);
});

test('duelo e visita com a barriga zerada não reiniciam o prazo da fome', () => {
  const e = base();
  const fome = fomeDepois(e, 0, 30 * HORA); // zerou às 17,5 h
  assert.equal(fome, 17.5 * HORA);
  const depoisDaVisita = { ...e, barriga: 0, atualizadoEm: 30 * HORA, fomeDesde: fome };
  assert.equal(morreEm(depoisDaVisita), 41.5 * HORA);
});

test('retrato da morta continua SVG válido', () => {
  const svg = apagarRetrato(desenharGotica(sortearAparencia(), 5, 'triste'));
  assert.match(svg, /^<svg[^>]*><defs><filter id="morta">[\s\S]*<\/g><\/svg>$/);
});

test('desenho gera SVG válido para qualquer aparência', () => {
  for (let k = 0; k < 20; k++) {
    const svg = desenharGotica(sortearAparencia(), 1 + k, k % 2 ? 'feliz' : 'triste');
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
    assert.doesNotMatch(svg, /undefined|NaN/);
  }
});

test('aparência antiga (sem vestido) ganha o padrão; toda opção tem nome', () => {
  const antiga = lerAparencia('{"pele":"#f6e3d8","cabelo":"#121016","olhos":"#7a1f3d","batom":"#1a0a12","penteado":"franja"}');
  assert.equal(antiga.vestido, OPCOES.vestido[0].valor);
  for (const parte of PARTES) for (const o of OPCOES[parte]) assert.equal(nomeDaOpcao(parte, o.valor), o.nome);
});
