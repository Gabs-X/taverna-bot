# 🍺 Taverneiro · bot da Taverna dos Malucos

Um bot só para o servidor todo, no lugar de dez: música, calls que se criam sozinhas, RPG de D&D 3.5 e Daggerheart,
chamada para jogar, boas-vindas e moderação. O `/setup` monta o servidor inteiro.

Página com todos os comandos: pasta [`site/`](site/) (deploy na Vercel, veja abaixo).

## O que ele faz

| Área | Recursos |
|---|---|
| 🏗️ Servidor | `/setup` cria cargos, categorias, canais, regras e o painel de jogos. Pode rodar de novo: só completa o que falta e **não apaga nada**. Com `limpar_tudo:true` (e confirmação), apaga todos os canais e cargos antes, guardando um backup da estrutura |
| 🔊 Calls | Entrou em **➕ Calls**, ganhou uma call sua (com o nome do jogo que você está jogando). Esvaziou, ela some. `/call` renomeia, limita, tranca e passa o controle |
| 🎵 Música | `/tocar` com YouTube, Spotify e SoundCloud (links, playlists ou busca por nome), fila, loop, autoplay, volume. `/jam` divulga a sua Jam do Spotify com botão para entrar e a música que está tocando |
| 🐉 D&D 3.5 | `/rolar` (1d20+5, 4d6kh3), fichas com graduações de perícia, BBA e resistências, `/teste` de perícia, resistência e ataque (margem de ameaça e confirmação de crítico), estabilizar, iniciativa |
| 🌗 Daggerheart | `/dh rolar` com dados de dualidade (Esperança e Medo atualizados sozinhos, experiências, vantagem), ficha, `/dh dano` pelos limiares, Estresse, armadura e o Medo do Mestre |
| 📅 Sessões | `/sessao marcar mesa:…` cria o evento do Discord na call da mesa e avisa quem joga |
| 🎮 Jogos | Botões de cargo por jogo (para ser chamado no `/lfg`), `/lfg` chama quem joga, `/times` divide a call, `/sortear` decide o indie da noite, `/enquete` abre uma votação |
| 📅 Agenda | `/lembrete` (30m, 2h, 3d…), `/aniversario` com parabéns automático no #geral às 9h. Fica salvo no SQLite e sobrevive a reinícios |
| 🦇 Gótica | No canal 🦇・goticas (criado pelo `/setup`): `/gotica adotar`: aparência e personalidade sorteadas, retrato desenhado pelo bot. `/gotica ver` com botões para alimentar, conversar, ouvir música, passear e dormir; ela sobe de nível e ganha acessórios. `/gotica customizar` escolhe penteado, cabelo, olhos, batom, pele e vestido desde o nível 1, `/gotica visual` sorteia a aparência de novo (e a personalidade, se quiser), `/gotica duelo @membro` (por turnos com botões: atacar, feitiço, defender; vale XP e moedas), `/gotica visitar @membro` (as duas ganham XP, retrato das duas juntas), `/gotica renomear`, `/gotica ranking`. `/loja`: compra com moedas chapéu de bruxa, véu, orelhas de gato, óculos de coração, estrelinhas, gatinho preto, corvo e 3 fundos (cemitério, lua de sangue, rosas) |
| 💰 Moedas e níveis | Mensagens (1 por minuto) e tempo em call com mais gente dão XP e moedas. Avisos de nível no #level-up. Cargos automáticos por nível (🍻 Bebum 5, 🎲 Frequentador 10, 🗡️ Veterano 20, 👑 Lenda 35). `/daily` com sequência, `/trabalhar`, `/carteira`, `/pix`, `/rank` (cartão em imagem), `/top` |
| 🏹 Campeões do LoL | `/asheap`, `/darius`, `/teemo`, `/yasuo`, `/blitz`, `/garen`, `/jinx`, `/thresh`: o campeão "manda a mensagem" (webhook com nome e foto dele) com splash de uma skin sorteada. `/vitimas` mostra o placar de quem mais apanha. `/quiz iniciar`: rodadas com pedaço de splash ou descrição de habilidade, 4 botões, quem acertar primeiro ganha moedas; `/quiz ranking` |
| 👥 Subgrupos | `/grupo criar nome emoji descricao fechado`: o pedido vai para #aprovacoes (staff) com Aprovar, Aprovar com outro nome e Recusar. Aprovado, o grupo ganha cargo, categoria, texto e voz próprios. Entra pelo painel de #subgrupos ou `/grupo entrar` (grupo fechado: o dono aprova). O dono pede canais extras (`/grupo canal`, também com aprovação), renomeia (com aprovação), convida, remove, abre/fecha, transfere e apaga |
| 🎉 Diversão | `/moeda`, `/8ball`, `/cafe`, `/avatar`, `/servidor` |
| 🛡️ Admin | Boas-vindas com cargo automático, log de entrada/saída, `/limpar` (inclusive mensagens do bot e com mais de 14 dias; filtro por bots, pessoas ou membro; `tudo:true` recria o canal vazio), `/castigo` |

## Estrutura que o `/setup` cria

```
📜 ENTRADA       #regras · #boas-vindas · #escolha-seus-jogos
💬 RESENHA       #geral · #memes · #clipes-e-prints · #comandos-do-bot · #subgrupos · 🔊 Resenha · 🔊 AFK
🎵 MÚSICA        #pedidos-de-musica · 🔊 Rádio da Taverna
🎮 JOGATINA      🔊 ➕ Calls  (entrou, ganhou uma call sua; esvaziou, some)
🎉 ATIVIDADES    #goticas · #quiz · #campeoes · #economia · #level-up  (cada um só para quem desbloquear no painel)
🐉 RPG · D&D 3.5     #avisos-da-mesa · #mesa-de-jogo · #rolagens · #fichas · #off-rpg · 🔊 Mesa de RPG  (só ⚔️ Aventureiro)
🌗 RPG · Daggerheart #avisos-dh · #mesa-dh · #rolagens-dh · #fichas-dh · 🔊 Mesa de Daggerheart  (só 🌗 Daggerheart)
🛡️ STAFF         #logs · #aprovacoes
👥 (um por grupo) #nome-do-grupo · 🔊 Nome do grupo  (só quem está no grupo; criadas pelo /grupo)
```

Cargos: 🍺 Taverneiro (admin) · 🐉 Mestre (narra qualquer mesa) · ⚔️ Aventureiro (D&D) · 🌗 Daggerheart · 🤪 Maluco (todo mundo) · um por jogo (para os chamados do /lfg) · um por atividade (🦇 Góticas, 🧠 Quiz, 🏹 Campeões, 💰 Economia, ⭐ Level up) · por nível (🍻 Bebum a 👑 Lenda).
Os comandos de cada atividade só funcionam no canal dela; usados em outro lugar, o bot indica o canal e onde desbloquear.
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
Para começar do zero, use **`/setup limpar_tudo:true`**: aparece um botão de confirmação; ao confirmar, o bot salva a estrutura antiga em `dados/backup-*.json`, apaga todos os canais (com as mensagens) e cargos, mantém membros, emojis e cargos de bots, e monta a Taverna. O resultado sai em #logs.
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
