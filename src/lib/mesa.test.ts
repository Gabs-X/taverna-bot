import assert from 'node:assert/strict';
import { test } from 'node:test';
import { custoDe, lerBestiario, pontosDeBatalha, sugerirEncontro, type Adversario } from './bestiario.ts';
import { aplicarDescanso, faixaDH, medoDoDescanso, tierDoNivel, validarArea, validarRelogio } from './mesa.ts';
import { casaRevelada, nevoaToda, revelarRaio } from './nevoa.ts';

test('faixas de alcance do Daggerheart em casas', () => {
  assert.equal(faixaDH(1), 'Corpo a corpo');
  assert.equal(faixaDH(2.5), 'Muito Próximo');
  assert.equal(faixaDH(6), 'Próximo');
  assert.equal(faixaDH(9), 'Longe');
  assert.equal(faixaDH(20), 'Muito Longe');
});

test('descanso curto recupera 1d4 + tier; longo limpa tudo; preparar dá Esperança', () => {
  assert.deepEqual([1, 2, 4, 5, 7, 8, 10].map(tierDoNivel), [1, 2, 2, 3, 3, 4, 4]);
  const ficha = { nivel: 3, pv: 5, estresse: 4, armadura: 2, esperanca: 1 };
  const curto = aplicarDescanso(ficha, 'curto', ['ferimentos', 'preparar'], false, 6, () => 1);
  assert.equal(curto.ficha.pv, 2); // 1d4 (1) + tier 2 = 3
  assert.equal(curto.ficha.esperanca, 2);
  assert.match(curto.texto, /1d4\+2 = 3/);
  const repetido = aplicarDescanso(ficha, 'curto', ['estresse', 'estresse'], false, 6, () => 4);
  assert.equal(repetido.ficha.estresse, 0);
  const longo = aplicarDescanso(ficha, 'longo', ['ferimentos', 'armadura'], false, 6, () => 1);
  assert.deepEqual([longo.ficha.pv, longo.ficha.armadura, longo.ficha.estresse], [0, 0, 4]);
  const juntos = aplicarDescanso({ ...ficha, esperanca: 5 }, 'longo', ['preparar', 'preparar'], true, 6, () => 1);
  assert.equal(juntos.ficha.esperanca, 6);
  assert.throws(() => aplicarDescanso(ficha, 'curto', ['preparar'], false, 6, () => 1));
  assert.equal(medoDoDescanso('curto', 4, () => 3), 3);
  assert.equal(medoDoDescanso('longo', 4, () => 3), 7);
});

test('relógio e área validados', () => {
  assert.deepEqual(validarRelogio({ nome: '  Os guardas  chegam ', total: 6 }), { nome: 'Os guardas chegam', total: 6, secreto: 0 });
  assert.throws(() => validarRelogio({ nome: 'x', total: 5 }));
  assert.throws(() => validarRelogio({ nome: '', total: 4 }));
  assert.deepEqual(validarArea({ forma: 'cone', x: 10, y: 10, x2: 5000, y2: -3 }, 1000, 800), { forma: 'cone', x: 10, y: 10, x2: 1000, y2: 0 });
  assert.throws(() => validarArea({ forma: 'quadrado', x: 0, y: 0, x2: 9, y2: 9 }, 100, 100));
  assert.throws(() => validarArea({ forma: 'circulo', x: 5, y: 5, x2: 5, y2: 5 }, 100, 100));
});

test('visão revela um círculo de casas em volta do personagem', () => {
  const cols = 20, rows = 20, bits = nevoaToda(cols, rows, false);
  assert.equal(revelarRaio(bits, cols, rows, 10, 10, 2), true);
  assert.ok(casaRevelada(bits, cols, 10, 10));
  assert.ok(casaRevelada(bits, cols, 12, 10));
  assert.ok(!casaRevelada(bits, cols, 13, 10));
  assert.ok(!casaRevelada(bits, cols, 12, 12)); // canto fora do círculo
  assert.equal(revelarRaio(bits, cols, rows, 10, 10, 2), false); // nada novo
  revelarRaio(bits, cols, rows, 0, 0, 3); // borda do mapa não quebra
  assert.ok(casaRevelada(bits, cols, 0, 0));
});

const TEXTO_LIVRO = `ADVERSÁRIOS DE NÍVEL 1 (NÍVEL 1)
BANDIDO DE FACA DENTADA
Padrão de Nível 1 Um criminoso astuto em uma capa. Motivos e táticas: Fugir, lucrar, roubar
Dificuldade: 12| Thresholds: 8/14| HP: 5| Stress: 3 ATQ: +1| Daggers: Corpo a corpo| 1d8+1 phy
Experiência: Ladrão +2
RECURSOS
Escalador - Passivo: O Bandido escala com facilidade. De cima para baixo - Passivo: Quando o Bandido ataca de cima, ele causa
1d10+1 de dano físico.

RATO GIGANTE
Minion de Nível 1
Um roedor do tamanho de um gato. Motivos e táticas: Escavar, vasculhar
Dificuldade: 10| Thresholds: Nenhum| HP: 1| Estresse: 1
ATK: -4| Claws: Corpo a corpo| 1 phy
RECURSOS
Lacaios (3) - Passivo: O Rato é derrotado quando recebe qualquer dano.

ADVERSÁRIOS DE NÍVEL 2 (NÍVEIS 2-4) ESQUADRÃO DE ARQUEIROS
Horda de Nível 2 (3/HP) Um grupo de arqueiros treinados. Motivos e táticas: Disparar
Dificuldade: 13| Thresholds: 8/16| HP: 4| Stress: 3 ATQ: +0| Longbow: Longe| 2d6+3 phy
RECURSOS
Horda (1d6+3) - Passivo: Quando marcar metade dos PV, causa 1d6+3.
`;

test('lê os blocos de adversário do texto do livro', () => {
  const l = lerBestiario(TEXTO_LIVRO);
  assert.equal(l.length, 3);
  const bandido = l.find((a) => a.nome === 'Bandido De Faca Dentada')!;
  assert.deepEqual(
    [bandido.nivel, bandido.tipo, bandido.dificuldade, bandido.limiarMaior, bandido.limiarGrave, bandido.pv, bandido.estresse, bandido.ataque, bandido.dano, bandido.alcance],
    [1, 'Padrão', 12, 8, 14, 5, 3, 1, '1d8+1', 'Corpo a corpo'],
  );
  assert.equal(bandido.recursos.length, 2);
  assert.match(bandido.recursos[1], /^De cima para baixo - Passivo/);
  assert.equal(bandido.experiencias, 'Ladrão +2');
  const rato = l.find((a) => a.nome === 'Rato Gigante')!;
  assert.deepEqual([rato.tipo, rato.limiarMaior, rato.ataque, rato.dano], ['Lacaio', null, -4, '1']);
  const esquadrao = l.find((a) => a.nome === 'Esquadrão De Arqueiros')!;
  assert.deepEqual([esquadrao.nivel, esquadrao.tipo, esquadrao.horda], [2, 'Horda', 3]);
});

test('guia de batalha: pontos, ajustes e sugestão dentro do orçamento', () => {
  const adv = (id: string, tipo: Adversario['tipo'], nivel = 1) => ({ id, nome: id, nivel, tipo }) as Adversario;
  assert.equal(pontosDeBatalha(3), 11);
  assert.equal(pontosDeBatalha(5), 17);
  assert.equal(pontosDeBatalha(4, { maisFacil: true }), 13);
  // Exemplo do livro: +2 de dano em todos dá 12 pontos para 4 PJs.
  assert.equal(pontosDeBatalha(4, { danoExtra: true }), 12);
  assert.equal(pontosDeBatalha(4, {}, [adv('a', 'Solo'), adv('b', 'Solo')]), 12);
  assert.equal(pontosDeBatalha(4, {}, [adv('a', 'Padrão')]), 15); // sem Bruiser, Horda, Líder ou Solo
  assert.equal(custoDe([adv('a', 'Bruiser'), adv('b', 'Bruiser'), adv('c', 'Padrão'), adv('d', 'Padrão'), adv('e', 'Lacaio')]), 13);
  const lista = [adv('lider', 'Líder'), adv('bruto', 'Bruiser'), adv('soldado', 'Padrão'), adv('arqueiro', 'À distância'), adv('rato', 'Lacaio'), adv('alto', 'Padrão', 3)];
  let semente = 0.3;
  const s = sugerirEncontro(lista, 1, 4, {}, () => (semente = (semente * 9301 + 0.49297) % 1));
  assert.ok(s.escolhidos.length > 0);
  assert.ok(s.gastos <= s.pontos);
  assert.ok(s.escolhidos.every((a) => a.nivel === 1));
});
