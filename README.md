# 🍺 Taverneiro · bot da Taverna dos Malucos

Um bot só para o servidor todo, no lugar de dez: música, calls que se criam sozinhas, RPG de D&D 5e,
chamada para jogar, boas-vindas e moderação. O `/setup` monta o servidor inteiro.

Página com todos os comandos: pasta [`site/`](site/) (deploy na Vercel, veja abaixo).

## O que ele faz

| Área | Recursos |
|---|---|
| 🏗️ Servidor | `/setup` cria cargos, categorias, canais, regras e o painel de jogos. Pode rodar de novo: só completa o que falta e **não apaga nada** |
| 🔊 Calls | Entrou em **➕ Criar call**, ganhou uma call sua (com o nome do jogo que você está jogando). Esvaziou, ela some. `/call` renomeia, limita, tranca e passa o controle |
| 🎵 Música | `/tocar` com YouTube, Spotify e SoundCloud (links, playlists ou busca por nome), fila, loop, autoplay, volume |
| 🐉 RPG | `/rolar` (1d20+5, 4d6kh3, vantagem), fichas de D&D 5e, testes de perícia e salvaguarda com proficiência automática, controle de iniciativa |
| 🎮 Jogos | Botões de cargo por jogo (libera o canal), `/lfg` chama quem joga, `/times` divide a call, `/sortear` decide o indie da noite |
| 🛡️ Admin | Boas-vindas com cargo automático, log de entrada/saída, `/limpar`, `/castigo` |

## Estrutura que o `/setup` cria

```
📜 ENTRADA       #regras · #boas-vindas · #escolha-seus-jogos
💬 RESENHA       #geral · #memes · #clipes-e-prints · #comandos-do-bot · 🔊 Resenha · 🔊 AFK
🎵 MÚSICA        #pedidos-de-musica · 🔊 Rádio da Taverna
🎮 JOGATINA      🔊 ➕ Criar call · 🔊 🎲 Indie Aleatório · #procurando-grupo
                 #valorant · #cs2 · #league-of-legends · #minecraft · #fortnite · #indie-aleatorio  (cada um só para quem tem o cargo)
🐉 RPG · D&D 5e  #avisos-da-mesa · #mesa-de-jogo · #rolagens · #fichas · #off-rpg · 🔊 Mesa de RPG  (só ⚔️ Aventureiro)
🛡️ STAFF         #logs
```

Cargos: 🍺 Taverneiro (admin) · 🐉 Mestre · ⚔️ Aventureiro · 🤪 Maluco (todo mundo) · um por jogo.
Para mudar nomes, jogos ou canais, edite [`src/config.ts`](src/config.ts) e rode `/setup` de novo.

## Como colocar no ar

### 1. Criar o bot no Discord (uma vez)

1. Entre em <https://discord.com/developers/applications> → **New Application** → nome `Taverneiro`.
2. Aba **Bot**:
   - **Reset Token** → copie o token (ele aparece uma vez só; guarde para o passo 3).
   - Em **Privileged Gateway Intents**, ligue **Presence Intent** e **Server Members Intent** → **Save Changes**.
3. Aba **OAuth2 → URL Generator**: marque `bot` e `applications.commands`; em *Bot Permissions* marque `Administrator`.
   Abra a URL gerada e adicione o bot ao servidor.
4. No servidor: **Configurações → Cargos**, arraste o cargo do bot para o **topo** da lista (senão ele não consegue dar cargos).

### 2. Rodar no seu PC

Precisa do [Node.js 24+](https://nodejs.org/).

```bash
git clone https://github.com/Gabs-X/taverna-bot.git
cd taverna-bot
npm install
cp .env.example .env      # no Windows: copy .env.example .env
# abra o .env e cole o token em DISCORD_TOKEN=
npm start
```

Aparecendo `🍺 Taverneiro#0000 online`, vá ao Discord e rode **`/setup`** (só admin vê o comando).
Depois dê o cargo **🐉 Mestre** a quem narra o RPG e remova os bots de música antigos.

> O bot fica online enquanto o terminal estiver aberto. Para deixar 24h, rode numa VPS
> (ou num PC que fique ligado) com `npm start` dentro de um gerenciador como o `pm2`.

### Comandos de desenvolvimento

```bash
npm run dev        # reinicia sozinho ao salvar
npm test           # testes da rolagem de dados
npm run typecheck  # checagem de tipos
```

## Página do bot (Vercel)

A pasta `site/` é uma página estática com todos os comandos. Na Vercel:
**Add New → Project** → importe este repositório → em **Root Directory** escolha `site` → **Deploy**.
Não precisa de build.

## Tecnologia

Node.js 24 rodando TypeScript direto (sem build), [discord.js](https://discord.js.org) 14,
[discord-player](https://discord-player.js.org) 7 para música e `node:sqlite` para fichas e calls.

## Problemas comuns

| Mensagem | O que fazer |
|---|---|
| `Token inválido` | Gere outro token na aba Bot e atualize o `.env` |
| `Ative "Server Members Intent"...` | Ligue as duas intents do passo 1.2 |
| Comandos não aparecem | Feche e abra o Discord (Ctrl+R); confira se convidou com `applications.commands` |
| `Não consigo castigar` / cargo não é dado | Cargo do bot precisa estar acima dos outros (passo 1.4) |
| Música não toca uma faixa | O YouTube muda a API com frequência: `npm update discord-player-youtubei` |
