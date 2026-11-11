# Mapa da campanha: guia para mexer no front end

Este guia é para quem vai trabalhar **só na tela do mapa** (o site estilo Roll20 do taverna-bot). O servidor, o banco e o Discord já funcionam e ficam como estão.

## Onde o projeto está

- Bot de Discord "Taverneiro" em Node 24 + TypeScript (roda `.ts` direto, sem build), discord.js e SQLite (`node:sqlite`). Versão atual: **v1.10.0** (11/11/2026).
- Em produção, roda numa VM da Oracle Cloud. O site do mapa sai pela internet por um túnel (o endereço muda quando o túnel reinicia).
- O mapa tem: ficha e foto do personagem criadas no próprio mapa, WASD/setas, biblioteca de NPCs e inimigos do mestre (arrastar para o mapa), combate (iniciativa no D&D, holofote e Medo no Daggerheart), vida e condições nas peças, ataque clicando no alvo, névoa de guerra, peças escondidas, cenas, música da mesa, handouts, ping, ouro e inventário do grupo, diário das sessões e chat com rolagens.

## Arquivos

| Arquivo | O que é | Pode mexer? |
|---|---|---|
| `src/mapa/pagina.html` | **A página inteira**: HTML, CSS e JS num arquivo só, sem framework, sem build e sem biblioteca externa | **Sim, é aqui** |
| `src/recursos/mapa.ts` | Servidor HTTP do mapa: rotas da API, regras, quem vê o quê, espelho no Discord | Não (só ler para entender) |
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
- O servidor lê o `pagina.html` **uma vez, quando sobe**. O `mapa:demo` reinicia sozinho quando algo em `src/` muda; depois disso, é só recarregar o navegador.
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
  - `medo`, `handout`, `handouts`, `grupo` (ouro, itens), `diario`
  - só para o mestre: `cenas`, `biblioteca`, `musica`, `vidaInimigos`
- **Chat** (`GET chat`): a lista de linhas (msg, rolagem de dados ou dualidade).
- **Tempo real** (`GET eventos`, SSE): chegam `chat`, `estado` ou `ping:{json}`. A página recarrega o que mudou. Também confere tudo a cada 3 s, porque o túnel às vezes não entrega o SSE.
- **Imagens**: `imagem` (mapa da cena), `peca-imagem/<id>`, `foto/<userId>`, `criatura-imagem/<id>`, `handout-imagem/<id>`. Os uploads vão em POST com o arquivo bruto no corpo (`application/octet-stream`), em PNG, JPG, WEBP ou GIF: até 12 MB para o mapa da cena e até 3 MB para foto, peça, criatura e handout. A página já reduz a imagem antes de mandar (`reduzirImagem`).
- **Ações (POST)**:
  - de todos: `mover`, `chat`, `ficha`, `ficha/foto`, `ficha/foto/remover`, `ficha/recurso`, `ataque`, `peca/condicao`, `combate/agiu`, `ping` e `grupo/*`
  - só do mestre: `mapa`, `grade`, `npc/*`, `criatura*`, `peca/pv`, `peca/tamanho`, `peca/esconder`, `combate/*`, `medo`, `vida-inimigos`, `nevoa/*`, `cena/*`, `musica`, `handout*`, `diario/notas`, `chat/revelar` e `chat/limpar`
  - Os corpos esperados estão em `src/recursos/mapa.ts`: procure por `acao === '<nome>'`.

## Regras para não quebrar nada

1. **Quem vê o quê é decidido no servidor.** O jogador nem recebe as peças escondidas ou debaixo da névoa, nem a biblioteca do mestre, nem a ficha completa dos outros. A página não deve tentar esconder nada sozinha: o que não pode ser visto simplesmente não chega.
2. **Nada de `innerHTML`** (hoje não há nenhum). Nomes, fichas e chat vêm de jogadores: use `textContent` e `createElement`.
3. **Sem bibliotecas externas e sem build.** Tudo continua dentro do `pagina.html`. As cores ficam nas variáveis do `:root` (`--bg`, `--painel`, `--acento`…).
4. **Mantenha os `id`s e as funções que o resto do código usa.** O desenho fica em `pintar()`, num `<canvas>`; a câmera fica em `cam`; o estado mais recente fica em `estado`. Os painéis são montados em `painel()`, `fichaCard()`, `painelCombate()`, `painelCenas()`, `painelImersao()`, `painelBiblioteca()`, `painelEntreSessoes()` e `painelMeu()`.
5. **Atalhos que já existem**: WASD e setas movem a sua peça uma casa; N passa o turno (mestre); `/` abre o chat; F enquadra; G liga a grade; R abre a régua; P mostra o painel; Esc fecha; botão do meio ou Alt + clique fazem o ping. Eles não disparam enquanto alguém digita num campo ou com uma janela aberta.
6. **Textos em português do Brasil, com acento.**
7. **Funciona no celular**: a tela usa toque (`touch-action: none` no canvas); não deixe a página rolar para os lados.
8. **Commits**: mensagem em português e sem `Co-Authored-By`. Não rode `npm run lancar`: quem lança a versão é o dono do projeto.

## O que fica salvo entre uma sessão e outra

`/campanha finalizar` só encerra a sessão: manda o resumo para o canal de resumos, cria a entrada no diário e apaga o canal de texto e a call da sessão. **Nada do mapa é apagado.** No próximo `/campanha iniciar`, a mesa volta do jeito que ficou:

- **Personagens**: ficha, foto, posição no mapa, vida, Estresse, Esperança, Armadura e condições.
- **Cenas**: cada uma com o seu mapa, a sua grade, a sua névoa e a sua trilha. A última cena aberta continua aberta.
- **Biblioteca de NPCs e inimigos**, e as cópias de cada cena, com a vida de cada uma e se estão escondidas.
- **Handouts, ouro, inventário, diário e chat** (o chat guarda as últimas mensagens; o registro completo de cada sessão fica no diário).

Só some o que é apagado de propósito: uma cena, um item da biblioteca, "limpar chat", um jogador tirado da campanha (a peça dele sai) ou a campanha inteira (`/campanha apagar`). Importar um mapa novo **na mesma cena** substitui a imagem anterior; para guardar mapas diferentes, use uma cena para cada. Trocar de cena zera a iniciativa e a rodada do combate.

A ficha é **uma por jogador e por sistema no servidor**, não uma por campanha. Quem joga duas campanhas de Daggerheart aparece com o mesmo personagem nas duas.

## Discord (só para entender, não mexer)

O que sai pelo chat do mapa vai para o canal da campanha com o nome e a foto do personagem (webhook). O que o jogador escreve direto no canal é refeito como o personagem, e a mensagem original é apagada. Ficam como estão: mensagens do mestre, as que começam com `(`, `//` ou `ooc`, respostas e figurinhas. Tudo o que é escrito no canal também aparece no chat do mapa.
