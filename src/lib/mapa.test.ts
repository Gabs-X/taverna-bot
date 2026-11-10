import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assinarLink,
  chatVisivel,
  criarSessao,
  DURACAO_CONVITE,
  DURACAO_LINK,
  DURACAO_SESSAO,
  interpretarEntrada,
  lerCookies,
  lerLink,
  lerSessao,
  registroDaSessao,
  textoParaDiscord,
  limitar,
  posicaoInicial,
  rolarEntrada,
  tipoImagem,
  type LinhaChat,
} from './mapa.ts';

const ID = '123456789012345678';

test('link pessoal vale para a pessoa e a campanha certas, e vence', () => {
  const l = assinarLink('segredo', 3, ID, 1000);
  assert.equal(lerLink('segredo', 3, l, 2000), ID);
  assert.equal(lerLink('segredo', 4, l, 2000), undefined);
  assert.equal(lerLink('outro', 3, l, 2000), undefined);
  assert.equal(lerLink('segredo', 3, { ...l, u: '999999999999999999' }, 2000), undefined);
  assert.equal(lerLink('segredo', 3, l, 1000 + DURACAO_LINK + 1), undefined);
  assert.equal(lerLink('segredo', 3, {}, 2000), undefined);
});

test('sessão assinada volta o id e recusa adulteração ou vencimento', () => {
  const c = criarSessao('segredo', ID, 1000);
  assert.equal(lerSessao('segredo', c, 2000), ID);
  assert.equal(lerSessao('outro', c, 2000), undefined);
  assert.equal(lerSessao('segredo', c.replace(ID, '999999999999999999'), 2000), undefined);
  assert.equal(lerSessao('segredo', c, 1000 + DURACAO_SESSAO + 1), undefined);
  assert.equal(lerSessao('segredo', undefined), undefined);
  assert.equal(lerSessao('segredo', 'lixo'), undefined);
  // A assinatura do link não serve como sessão (e vice-versa).
  const l = assinarLink('segredo', 3, ID, 1000);
  assert.equal(lerSessao('segredo', `${ID}.${l.v}.${l.k}`, 2000), undefined);
});

test('cookies', () => {
  assert.deepEqual(lerCookies('a=1; b=2=3'), { a: '1', b: '2=3' });
  assert.deepEqual(lerCookies(undefined), {});
});

test('tipo da imagem pela assinatura', () => {
  assert.equal(tipoImagem(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0]))?.ext, 'png');
  assert.equal(tipoImagem(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext, 'jpg');
  assert.equal(tipoImagem(Buffer.from('RIFF0000WEBPxxxx'))?.ext, 'webp');
  assert.equal(tipoImagem(Buffer.from('GIF89a....'))?.ext, 'gif');
  assert.equal(tipoImagem(Buffer.from('<svg onload=alert(1)>')), undefined);
});

test('limites e posição inicial das peças', () => {
  assert.equal(limitar(5000, 0, 100, 7), 100);
  assert.equal(limitar(-3, 0, 100, 7), 0);
  assert.equal(limitar('x', 0, 100, 7), 7);
  const a = posicaoInicial(0, 50);
  const b = posicaoInicial(8, 50);
  assert.equal(b.x, a.x);
  assert.ok(b.y > a.y);
});

test('chat: texto comum é mensagem, /r rola para todos e /gr esconde', () => {
  assert.deepEqual(interpretarEntrada('  olá mesa  '), { tipo: 'msg', texto: 'olá mesa' });
  assert.deepEqual(interpretarEntrada('/r 1d20 + 5 # Ataque'), { tipo: 'dados', expressao: '1d20+5', rotulo: 'Ataque', secreta: false });
  assert.deepEqual(interpretarEntrada('/gr 2d6'), { tipo: 'dados', expressao: '2d6', rotulo: '', secreta: true });
  assert.equal((interpretarEntrada('/ROLL d8') as { secreta: boolean }).secreta, false);
  assert.throws(() => interpretarEntrada('/r'), /Diga os dados/);
  assert.throws(() => interpretarEntrada('/r banana'), /Não entendi/);
  assert.throws(() => interpretarEntrada('/xyz 1d6'), /não existe/);
  assert.throws(() => interpretarEntrada('   '), /Escreva/);
});

test('chat: /dh lê modificador e vantagem; /gdh esconde', () => {
  assert.deepEqual(interpretarEntrada('/dh +2 vantagem # Agilidade'), { tipo: 'dualidade', modificador: 2, vantagem: 1, rotulo: 'Agilidade', secreta: false });
  assert.deepEqual(interpretarEntrada('/gdh -1 d'), { tipo: 'dualidade', modificador: -1, vantagem: -1, rotulo: '', secreta: true });
  assert.deepEqual(interpretarEntrada('/dh'), { tipo: 'dualidade', modificador: 0, vantagem: 0, rotulo: '', secreta: false });
  assert.throws(() => interpretarEntrada('/dh dragão'), /Não entendi/);
});

test('rolagem do chat guarda os dados, o descartado e o total', () => {
  const seq = [15, 4, 3];
  const rng = () => seq.shift()!;
  const r = rolarEntrada({ tipo: 'dados', expressao: '2d20kh1+3', rotulo: '', secreta: false }, rng);
  assert.equal(r.tipo, 'dados');
  if (r.tipo !== 'dados') return;
  assert.equal(r.total, 18);
  assert.deepEqual(r.pedacos, [
    { t: 'dado', v: 15, faces: 20, mantido: true },
    { t: 'dado', v: 4, faces: 20, mantido: false },
    { t: 'op', v: '+' },
    { t: 'fixo', v: 3 },
  ]);
  const neg = rolarEntrada({ tipo: 'dados', expressao: '-1d4', rotulo: '', secreta: false }, () => 2);
  assert.deepEqual(neg.tipo === 'dados' && neg.pedacos, [{ t: 'op', v: '-' }, { t: 'dado', v: 2, faces: 4, mantido: true }]);
});

test('rolagem de dualidade no chat', () => {
  const seq = [9, 4, 5];
  const r = rolarEntrada({ tipo: 'dualidade', modificador: 1, vantagem: 1, rotulo: '', secreta: false }, () => seq.shift()!);
  assert.equal(r.tipo, 'dualidade');
  if (r.tipo !== 'dualidade') return;
  assert.equal(r.total, 9 + 4 + 1 + 5);
  assert.equal(r.resultado, 'esperanca');
  assert.equal(r.vantagem, 1);
});

test('rolagem escondida só chega ao mestre; revelada chega a todos', () => {
  const linha = (id: number, secreta: number, revelada = 0): LinhaChat => ({
    id,
    user_id: ID,
    autor: 'Mestre',
    tipo: 'dados',
    texto: '',
    resultado: JSON.stringify({ tipo: 'dados', expressao: '1d20', total: 20, pedacos: [] }),
    secreta,
    revelada,
    criada_em: id,
  });
  const linhas = [linha(1, 0), linha(2, 1), linha(3, 0, 1)];
  assert.deepEqual(chatVisivel(linhas, false).map((l) => l.id), [1, 3]);
  assert.deepEqual(chatVisivel(linhas, true).map((l) => l.id), [1, 2, 3]);
  assert.equal(chatVisivel(linhas, true)[1].secreta, true);
  assert.equal(chatVisivel(linhas, false)[1].revelada, true);
  assert.equal(chatVisivel(linhas, false)[0].resultado?.tipo, 'dados');
});

test('texto que vai para o Discord: mensagem, dados e dualidade', () => {
  assert.equal(textoParaDiscord('Aria (Gabs)', 'msg', 'Vou pela esquerda', null), '🗺️ **Aria (Gabs):** Vou pela esquerda');
  assert.equal(textoParaDiscord('Aria', 'dados', 'ataque', { tipo: 'dados', expressao: '1d20+5', total: 17, pedacos: [] }), '🎲 **Aria** rolou `1d20+5` · ataque: **17**');
  const dualidade = { tipo: 'dualidade' as const, vantagem: 1 as const, esperanca: 9, medo: 4, d6: 3, modificador: 2, total: 18, resultado: 'esperanca' as const };
  assert.equal(
    textoParaDiscord('Aria', 'dualidade', '', dualidade),
    '🌗 **Aria** rolou dualidade (vantagem): Esperança [9] · Medo [4] = **18** com Esperança',
  );
  // Marcas de formatação no nome não quebram a mensagem.
  assert.equal(textoParaDiscord('**Ar_ia**', 'msg', 'oi', null), '🗺️ **Aria:** oi');
});

test('link de convite vale mais que o link comum, mas continua assinado', () => {
  const agora = 1_000_000;
  const comum = assinarLink('segredo', 1, '123456789012345678', agora);
  const convite = assinarLink('segredo', 1, '123456789012345678', agora, DURACAO_CONVITE);
  assert.equal(lerLink('segredo', 1, comum, agora + DURACAO_LINK + 1), undefined);
  assert.equal(lerLink('segredo', 1, convite, agora + DURACAO_LINK + 1), '123456789012345678');
  assert.equal(lerLink('segredo', 1, convite, agora + DURACAO_CONVITE + 1), undefined);
  assert.equal(lerLink('segredo', 2, convite, agora + 10), undefined);
});

test('registro da sessão: mensagens e rolagens, sem as escondidas', () => {
  const base = { user_id: '1', revelada: 0, secreta: 0 };
  const t0 = Date.UTC(2026, 10, 10, 17, 0); // 14:00 em Brasília
  const linhas = [
    { ...base, id: 1, autor: 'Aria', tipo: 'msg' as const, texto: 'Vou pela esquerda', resultado: null, criada_em: t0 },
    { ...base, id: 2, autor: 'Aria', tipo: 'dados' as const, texto: 'ataque', resultado: JSON.stringify({ tipo: 'dados', expressao: '1d20+5', total: 17, pedacos: [] }), criada_em: t0 + 60_000 },
    { ...base, id: 3, autor: 'Mestre', tipo: 'dados' as const, texto: '', resultado: JSON.stringify({ tipo: 'dados', expressao: '2d6', total: 9, pedacos: [] }), secreta: 1, criada_em: t0 + 120_000 },
    {
      ...base,
      id: 4,
      autor: 'Mestre',
      tipo: 'dualidade' as const,
      texto: 'armadilha',
      resultado: JSON.stringify({ tipo: 'dualidade', vantagem: 0, esperanca: 3, medo: 8, modificador: 1, total: 12, resultado: 'medo' }),
      revelada: 1,
      criada_em: t0 + 180_000,
    },
  ];
  const texto = registroDaSessao('A Cripta', t0, t0 + 3_600_000, linhas);
  assert.match(texto, /Campanha: A Cripta/);
  assert.match(texto, /das 14:00 às 15:00/);
  assert.match(texto, /\[14:00\] Aria: Vou pela esquerda/);
  assert.match(texto, /\[14:01\] Aria rolou 1d20\+5 \(ataque\): 17/);
  assert.doesNotMatch(texto, /2d6/);
  assert.match(texto, /Esperança 3 · Medo 8 = 12, com Medo \[revelada pelo mestre\]/);
  assert.match(registroDaSessao('X', t0, t0, []), /nada foi dito/);
});
