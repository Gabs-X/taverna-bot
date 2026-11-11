import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARTA, CARTAS, classeDaFicha, dominiosTocados, limites, lugarAoEscolher, motivoParaNaoEscolher, moverCarta, type CartaDoPersonagem } from './cartasDH.ts';

test('catálogo completo do livro básico: 189 de domínio (3 de nível 1 e 2 de cada nível depois), 18 ancestralidades, 9 comunidades e 54 de subclasse', () => {
  const de = (tipo: string) => CARTAS.filter((c) => c.tipo === tipo);
  assert.equal(de('dominio').length, 189);
  assert.equal(de('ancestralidade').length, 18);
  assert.equal(de('comunidade').length, 9);
  assert.equal(de('subclasse').length, 54);
  for (const d of ['arcana', 'blade', 'bone', 'codex', 'grace', 'midnight', 'sage', 'splendor', 'valor']) {
    const niveis = CARTAS.filter((c) => c.tipo === 'dominio' && c.dominio === d).map((c) => (c as { nivel: number }).nivel);
    for (let n = 1; n <= 10; n++) assert.equal(niveis.filter((x) => x === n).length, n === 1 ? 3 : 2, `${d} nível ${n}`);
  }
  assert.deepEqual(CARTA.get('dominio-arcana-telecinese'), { id: 'dominio-arcana-telecinese', nome: 'Telecinese', tipo: 'dominio', dominio: 'arcana', nivel: 6, custo: 0, natureza: 'magia' });
});

test('classe escrita na ficha vira a classe do livro', () => {
  assert.equal(classeDaFicha('Bardo'), 'bardo');
  assert.equal(classeDaFicha('Feiticeira'), 'feiticeiro');
  assert.equal(classeDaFicha('guardiã'), 'guardiao');
  assert.equal(classeDaFicha('Maga das Chamas'), 'mago');
  assert.equal(classeDaFicha('Serafim'), 'seraph');
  assert.equal(classeDaFicha('Magarefe'), null);
  assert.equal(classeDaFicha(''), null);
});

test('filtro de domínio: só os domínios da classe, até o nível do personagem e nível + 1 cartas', () => {
  const ficha = { classe: 'Feiticeira', nivel: 1 };
  assert.equal(motivoParaNaoEscolher('dominio-arcana-talisma-runico', ficha, []), null);
  assert.match(motivoParaNaoEscolher('dominio-valor-pele-dura', ficha, [])!, /Valor não é um domínio de Feiticeiro/);
  assert.match(motivoParaNaoEscolher('dominio-arcana-telecinese', ficha, [])!, /nível 6/);
  const duas: CartaDoPersonagem[] = [{ carta: 'dominio-arcana-talisma-runico', lugar: 'carregamento' }, { carta: 'dominio-midnight-abrir-e-puxar', lugar: 'carregamento' }];
  assert.match(motivoParaNaoEscolher('dominio-arcana-liberar-o-caos', ficha, duas)!, /2 cartas de domínio/);
  assert.equal(motivoParaNaoEscolher('dominio-arcana-liberar-o-caos', { ...ficha, nivel: 2 }, duas), null);
  assert.equal(motivoParaNaoEscolher('dominio-arcana-liberar-o-caos', ficha, duas, 1), null, 'carta extra dada pelo mestre');
  assert.equal(limites({ classe: 'Mago', nivel: 3 }, [{ carta: 'subclasse-mago-escola-do-conhecimento', lugar: 'base' }]).dominio.max, 5, 'Escola do Conhecimento dá +1');
  assert.match(motivoParaNaoEscolher('dominio-arcana-voar', { classe: 'Pescador', nivel: 3 }, [])!, /classe do livro/);
});

test('subclasse: uma só, da classe, na ordem e no nível certo', () => {
  const f1 = { classe: 'Bardo', nivel: 1 }, f5 = { classe: 'Bardo', nivel: 5 };
  assert.match(motivoParaNaoEscolher('subclasse-druida-guardiao-da-renovacao', f1, [])!, /Subclasse de Druida/);
  assert.equal(motivoParaNaoEscolher('subclasse-bardo-musico-errante', f1, []), null);
  assert.match(motivoParaNaoEscolher('subclasse-bardo-musico-errante-1', f5, [])!, /Fundação/);
  const fund: CartaDoPersonagem[] = [{ carta: 'subclasse-bardo-musico-errante', lugar: 'base' }];
  assert.match(motivoParaNaoEscolher('subclasse-bardo-musico-errante-1', f1, fund)!, /nível 5/);
  assert.equal(motivoParaNaoEscolher('subclasse-bardo-musico-errante-1', f5, fund), null);
  assert.match(motivoParaNaoEscolher('subclasse-bardo-artifice-das-palavras', f5, fund)!, /já segue Músico Errante/);
});

test('ancestralidade (até 2) e comunidade (1) não dependem da classe', () => {
  const f = { classe: '', nivel: 1 };
  assert.equal(motivoParaNaoEscolher('ancestralidade-elfo', f, []), null);
  const tem: CartaDoPersonagem[] = [{ carta: 'ancestralidade-elfo', lugar: 'base' }, { carta: 'ancestralidade-orc', lugar: 'base' }, { carta: 'comunidade-seaborne', lugar: 'base' }];
  assert.match(motivoParaNaoEscolher('ancestralidade-fada', f, tem)!, /duas ancestralidades/);
  assert.match(motivoParaNaoEscolher('comunidade-wildborne', f, tem)!, /já tem uma comunidade/);
});

test('Carregamento de 5 e Cofre: trazer do Cofre custa Estresse (de graça no descanso); Notório não conta; Vitalidade fica no Cofre', () => {
  const cinco: CartaDoPersonagem[] = ['dominio-blade-levantar-se', 'dominio-blade-redemoinho', 'dominio-blade-imprudente', 'dominio-bone-intocavel', 'dominio-bone-eu-vi-chegando']
    .map((carta) => ({ carta, lugar: 'carregamento' as const }));
  assert.equal(lugarAoEscolher('dominio-bone-tatico', cinco), 'cofre');
  assert.equal(lugarAoEscolher('dominio-bone-tatico', cinco.slice(1)), 'carregamento');
  assert.equal(lugarAoEscolher('dominio-blade-vitalidade', []), 'cofre');
  assert.equal(lugarAoEscolher('dominio-grace-notorio', cinco), 'carregamento');
  assert.equal(lugarAoEscolher('ancestralidade-elfo', []), 'base');

  const comCofre = [...cinco.slice(1), { carta: 'dominio-blade-golpe-do-ceifador', lugar: 'cofre' as const }];
  assert.deepEqual(moverCarta('dominio-blade-golpe-do-ceifador', 'carregamento', comCofre, false), { erro: null, estresse: 3 });
  assert.deepEqual(moverCarta('dominio-blade-golpe-do-ceifador', 'carregamento', comCofre, true), { erro: null, estresse: 0 });
  assert.match(moverCarta('dominio-blade-golpe-do-ceifador', 'carregamento', [...cinco, comCofre[4]], false).erro!, /cheio/);
  assert.match(moverCarta('dominio-blade-vitalidade', 'carregamento', [{ carta: 'dominio-blade-vitalidade', lugar: 'cofre' }], true).erro!, /Cofre de vez/);
  assert.deepEqual(moverCarta('dominio-blade-levantar-se', 'cofre', cinco, false), { erro: null, estresse: 0 });
  assert.deepEqual(dominiosTocados(cinco), []);
  assert.deepEqual(dominiosTocados([...cinco.slice(0, 3), { carta: 'dominio-blade-confusao', lugar: 'carregamento' }]), ['blade']);
});
