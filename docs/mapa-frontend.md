# Mapa da campanha: guia para mexer no front end

Este guia é para quem vai trabalhar **só na tela do mapa** (o site estilo Roll20 do taverna-bot). O servidor, o banco e o Discord já funcionam e ficam como estão.

## Onde o projeto está

- Bot de Discord "Taverneiro" em Node 24 + TypeScript (roda `.ts` direto, sem build), discord.js e SQLite (`node:sqlite`). Versão atual: **v1.10.0** (11/11/2026).
- Em produção, roda numa VM da Oracle Cloud. O site do mapa sai pela internet por um túnel (o endereço muda quando o túnel reinicia).
- O mapa tem: ficha e foto do personagem criadas no próprio mapa, WASD/setas, biblioteca de NPCs e inimigos do mestre (arrastar para o mapa), combate (iniciativa no D&D, holofote e Medo no Daggerheart), vida e condições nas peças, ataque clicando no alvo, névoa de guerra, peças escondidas, cenas, música da mesa, handouts, ping, ouro e inventário do grupo, diário das sessões e chat com rolagens.

## Arquivos

| Arquivo | O que é | Pode mexer? |
|---|---|---|
| `src/mapa/pagina.html` | O **esqueleto** da página (HTML), com os marcadores `/*__ESTILO__*/` e `//__SCRIPT__` | **Sim** |
| `src/mapa/estilo.css` | Todo o visual | **Sim** |
| `src/mapa/js/NN-assunto.js` | O código, dividido por assunto (`01-base`, `02-mapa`, `03-barra-e-ferramentas`, `04-livro`, `05-janelas-e-ficha`, `06-cartas-e-nivel`, `07-mestre`, `08-sessao-e-chat`, `09-mesa`, `10-elementos-e-efeitos`, `11-selecao-e-cortina`) | **Sim** |
| `src/lib/paginaMapa.ts` | Junta as partes numa página só (um `<script>` só, na ordem do número): uma função de um arquivo vale nos outros | Não |
| `src/recursos/mapa.ts` | Servidor HTTP do mapa: rotas da API, regras, quem vê o quê, espelho no Discord | Não (só ler para entender) |
| `src/recursos/mapaTempoReal.ts` | Tempo real: SSE, pulso, efeitos com número, movimento ao vivo e o cache do estado (com gzip) | Não |
| `src/recursos/mapaArquivos.ts`, `mapaMesa.ts` | Imagens, livro e cartas; e as ferramentas da mesa (áreas, relógios, roteiro, bestiário...) | Não |
| `src/lib/mapa.ts`, `fichaMapa.ts`, `combate.ts`, `nevoa.ts`, `ambientes.ts` | Regras puras, com testes | Não |
| `src/db.ts` | Banco e migrações | Não |
| `scripts/demo-mapa.ts` | Sobe só o site do mapa com dados de teste | Usar |

Se o front precisar de algum dado ou de alguma rota que ainda não existe, **não mude o back end**. Anote o que falta para o dono do projeto pedir.

## Como rodar e ver a página

```bash
npm install
npm run mapa:demo
```

- O comando imprime dois links: **MESTRE** e **JOGADOR**. Os dados de teste ficam em `%TEMP%\taverna-mapa-demo` e continuam lá entre uma execução e outra. Apague a pasta para começar do zero.
- O servidor monta a página (esqueleto + `estilo.css` + `js/*.js`) **uma vez, quando sobe**. Arquivo novo em `js/` entra sozinho, na ordem do número do nome. Não crie outro `<script>`: tudo precisa estar no mesmo para as funções valerem entre os arquivos.
- `npm test` inclui o `paginaMapa.test.ts`, que pega erro de sintaxe, nome declarado duas vezes, `$('id')` que não existe no HTML e ícone da barra apontando para gaveta inexistente; e o `mapaSincronia.test.ts`, que abre várias telas ao mesmo tempo e confere se o que um faz chega aos outros. O `mapa:demo` reinicia sozinho quando algo em `src/` muda; depois disso, é só recarregar o navegador.
- O login é um cookie (`mapa_sessao`) criado pelo link. Para ver mestre e jogador **ao mesmo tempo**, abra um link numa janela normal e o outro numa janela anônima (no mesmo navegador, um cookie substitui o outro).
- A demo usa um Discord de mentira: sem avatares do Discord e sem mensagens no canal. Fora isso, tudo funciona.
- Antes de entregar: `npx tsc` e `npm test` (os testes são do back end e servem para garantir que nada foi quebrado sem querer).

## Como a página conversa com o servidor

- Todas as chamadas vão para `/api/m/<campanha>/<ação>` (a função `api()` monta o endereço). `pegar(ação)` faz GET; `post(ação, corpo)` faz POST com JSON, mostra o `erro` da resposta num aviso e, depois, recarrega o estado e o chat.
- **Estado** (`GET estado`): um JSON com tudo o que a pessoa pode ver. Os campos principais:
  - `campanha` (nome, sistema `dh` ou `dnd`, mestre)
  - `voce` (id, mestre, jogador, pecaId, temFicha, nome, avatar)
  - `mapa` (versao, temImagem, largura, altura, grade, nevoa `{cols, rows, bits base64}`, cena)
  - `pecas[]` (id, nome, x, y, tipo `jogador|npc|inimigo`, meu, podeMover, tamanho, avatar, ficha, vida, condicoes, iniciativa, agiu, escondida)
  - `combate` (ativo, rodada, vez, ordem)
  - `medo`, `handout`, `handouts`, `grupo` (ouro, itens), `diario`, `livro` (`{tamanho, url}` ou `null`)
  - só para o mestre: `cenas`, `biblioteca`, `musica`, `vidaInimigos`
- **Chat** (`GET chat`): a lista de linhas (msg, rolagem de dados ou dualidade).
- **Tempo real** (`GET eventos`, SSE): chegam `chat`, `estado` ou `ping:{json}`. A página recarrega o que mudou. Também confere tudo a cada 3 s, porque o túnel às vezes não entrega o SSE.
- **Imagens**: `imagem` (mapa da cena), `peca-imagem/<id>`, `foto/<userId>`, `criatura-imagem/<id>`, `handout-imagem/<id>`. Os uploads vão em POST com o arquivo bruto no corpo (`application/octet-stream`), em PNG, JPG, WEBP ou GIF: até 12 MB para o mapa da cena e os handouts, e até 3 MB para foto, peça e criatura. A página já reduz a imagem antes de mandar (`reduzirImagem`).
- **Livro de regras** (`GET livro`): o PDF do sistema (um por servidor e sistema, em `dados/livros/<guild>-<sistema>.pdf`), entregue em pedaços (`Range`). A página lê com o PDF.js, que busca só as partes de cada página, e por isso abre livros grandes (o de Daggerheart tem 264 MB e 415 páginas) sem baixar tudo. O mestre envia o PDF (`POST livro`, até 95 MB, por causa do limite do túnel) e tira o livro (`livro/remover`). Livros maiores são copiados direto para a pasta no servidor. No chat, uma mensagem com `📖 Livro p. N` ganha o botão "Abrir na página N".
- **Cartas do Daggerheart**:
  - **Catálogo**: as 270 cartas do livro básico, com nível, custo e tipo, ficam em `src/lib/cartasDH.dados.ts`.
  - **Regras**: o que cada ficha pode escolher fica em `src/lib/cartasDH.ts` (domínios da classe, nível, nível + 1 cartas, Carregamento de 5, Estresse para trazer do Cofre).
  - **Imagens**: ficam só no servidor (`dados/cartas/dh/{p,g}/<id>.jpg`), fora do repositório.
  - **Rotas**: `GET cartas/catalogo`, `GET carta/p|g/<id>`, `GET cartas/opcoes/<userId>` (o motivo de cada carta estar bloqueada) e `POST cartas/escolher|tirar|mover|usar|recarregar|descanso|extras`.
  - **Prancheta**: a de cada jogador vem em `pecas[].prancheta`, só para o dono e o mestre.
- **Ficha guiada (Daggerheart)**: o passo a passo fica no `pagina.html` (`CLASSES_DH`, `ARMADURAS_T1` e `calcularGuia()`), com os números do livro: classes nas páginas 29 a 51, armaduras na 127, limiares na 115 e avanços na 24. As escolhas ficam guardadas em `fichas_dh.guia` (JSON), para reabrir a guia no mesmo ponto.
  - **Armas**: as tabelas do Nível 1 ficam em `ARMAS_PRIMARIAS` e `ARMAS_SECUNDARIAS` (livro p. 116 e 125). No formulário de ataque, escolher a arma preenche o traço, o dano (com a Proficiência) e o bônus.
  - **Subir de nível**: fica em `abrirSubirNivel()` (livro p. 24). O que é automático e os dois avanços do patamar vão para `guia.historico`, `guia.marcados`, `guia.extras` e `guia.cartasAvanco`. O servidor soma `cartasAvanco` às cartas extras do mestre.
- **Layout**:
  - O painel da direita é só o chat.
  - As funções da mesa ficam nas seções do HTML, que o `montarDock()` move para a gaveta `#gaveta`, aberta pela barra de ícones `#dock` à esquerda. Os grupos de seções estão em `DOCK`.
  - A ficha da peça selecionada fica à direita, ao lado das ferramentas.
- **Efeitos ao vivo** (`POST efeito`, chegam pelo SSE como `efeito:{json}`): `laser` (traço de desenho em pedaços), `reacao` (emoji em cima da peça; só a própria peça, ou qualquer uma para o mestre) e `foco` (só o mestre: puxa a câmera de todos). Os botões ficam em `#acoes-mapa`. O ping antigo (`POST ping`) continua valendo.
- **Ações (POST)**:
  - de todos: `mover`, `chat`, `ficha`, `ficha/foto`, `ficha/foto/remover`, `ficha/recurso`, `ataque`, `peca/condicao`, `combate/agiu`, `ping` e `grupo/*`
  - só do mestre: `mapa`, `grade`, `npc/*`, `criatura*`, `peca/pv`, `peca/tamanho`, `peca/esconder`, `combate/*`, `medo`, `vida-inimigos`, `nevoa/*`, `cena/*`, `musica`, `handout*`, `diario/notas`, `chat/revelar` e `chat/limpar`
  - Os corpos esperados estão em `src/recursos/mapa.ts`: procure por `acao === '<nome>'`.

## Regras para não quebrar nada

1. **Quem vê o quê é decidido no servidor.** O jogador nem recebe as peças escondidas ou debaixo da névoa, nem a biblioteca do mestre, nem a ficha completa dos outros. A página não deve tentar esconder nada sozinha: o que não pode ser visto simplesmente não chega.
2. **Nada de `innerHTML`** (hoje não há nenhum). Nomes, fichas e chat vêm de jogadores: use `textContent` e `createElement`.
3. **Sem build e quase sem nada externo.** Tudo continua dentro do `pagina.html`. As duas exceções são as fontes do Google Fonts (Cinzel nos títulos, Alegreya Sans na interface e Alegreya no texto), que têm reserva caso não carreguem, e o PDF.js do cdnjs com a versão fixa, carregado só quando alguém abre o livro.
4. **Tema "Taverna".** Madeira escura com latão nos painéis, e pergaminho com tinta escura na ficha, nas janelas, nos avisos e nas rolagens. As cores ficam nas variáveis do `:root` (`--bg`, `--painel`, `--acento`, `--ouro`, `--latao`, `--madeira`, `--papel`…), e o bloco "Pergaminho" troca essas variáveis dentro das áreas de papel. Para uma área nova de papel, basta incluí-la nesse bloco. No canvas, a mesa de madeira é desenhada uma vez (`texturaMesa()`), e as peças usam aro de latão (jogador), prata (NPC) ou ferro avermelhado (inimigo), com o nome numa fita.
5. **Mantenha os `id`s e as funções que o resto do código usa.** O desenho fica em `pintar()`, num `<canvas>`; a câmera fica em `cam`; o estado mais recente fica em `estado`. Os painéis são montados em `painel()`, `fichaCard()`, `painelCombate()`, `painelCenas()`, `painelImersao()`, `painelBiblioteca()`, `painelEntreSessoes()`, `painelMeu()` e `painelLivro()`.
6. **Atalhos que já existem**: WASD e setas movem a sua peça uma casa; N passa o turno (mestre); `/` abre o chat; F enquadra; G liga a grade; R abre a régua; P mostra o painel; L abre o livro (lá dentro, ← → trocam de página); Esc fecha; botão do meio ou Alt + clique fazem o ping. Eles não disparam enquanto alguém digita num campo ou com uma janela aberta.
7. **Textos em português do Brasil, com acento.**
8. **Funciona no celular**: a tela usa toque (`touch-action: none` no canvas); não deixe a página rolar para os lados.
9. **Commits**: mensagem em português e sem `Co-Authored-By`. Não rode `npm run lancar`: quem lança a versão é o dono do projeto.

## O que fica salvo entre uma sessão e outra

`/sessao finalizar` só encerra a sessão: manda o resumo para o canal de resumos, cria a entrada no diário e apaga o canal de texto e a call da sessão. **Nada do mapa é apagado.** No próximo `/sessao iniciar`, a mesa volta do jeito que ficou:

- **Personagens**: ficha, foto, posição no mapa, vida, Estresse, Esperança, Armadura e condições.
- **Cenas**: cada uma com o seu mapa, a sua grade, a sua névoa e a sua trilha. A última cena aberta continua aberta.
- **Biblioteca de NPCs e inimigos**, e as cópias de cada cena, com a vida de cada uma e se estão escondidas.
- **Handouts, ouro, inventário, diário e chat** (o chat guarda as últimas mensagens; o registro completo de cada sessão fica no diário).

Só some o que é apagado de propósito: uma cena, um item da biblioteca, "limpar chat", um jogador tirado da campanha (a peça dele sai) ou a campanha inteira (`/campanha apagar`). Importar um mapa novo **na mesma cena** substitui a imagem anterior; para guardar mapas diferentes, use uma cena para cada. Trocar de cena zera a iniciativa e a rodada do combate.

A ficha é **uma por jogador e por sistema no servidor**, não uma por campanha. Quem joga duas campanhas de Daggerheart aparece com o mesmo personagem nas duas.

## Discord (só para entender, não mexer)

O que sai pelo chat do mapa vai para o canal da campanha com o nome e a foto do personagem (webhook). O que o jogador escreve direto no canal é refeito como o personagem, e a mensagem original é apagada. Ficam como estão: mensagens do mestre, as que começam com `(`, `//` ou `ooc`, respostas e figurinhas. Tudo o que é escrito no canal também aparece no chat do mapa.
