#!/usr/bin/env bash
# Instala o Taverneiro num servidor Ubuntu (ex.: Oracle Cloud Always Free). Rode como o usuário normal (com sudo):
#   curl -fsSL https://raw.githubusercontent.com/Gabs-X/taverna-bot/main/scripts/nuvem/instalar.sh | bash
# O que faz:
#   - instala Node 24 e git;
#   - baixa o código em ~/taverna-bot;
#   - cria o serviço "taverna" (sobe junto com o servidor e volta sozinho se cair), que roda o supervisor;
#   - cria o "taverna-atualizar", que a cada 2 minutos baixa a versão nova do GitHub (o supervisor reinicia o bot).
# Depois: crie o ~/taverna-bot/.env (DISCORD_TOKEN e CLIENT_SECRET; sem os TOKEN_MUSICA, que ficam no PC dos
# bardos), copie a pasta dados/ do PC de casa e rode: sudo systemctl start taverna
set -euo pipefail

PASTA="$HOME/taverna-bot"
REPO="https://github.com/Gabs-X/taverna-bot.git"
USUARIO="$(whoami)"

echo "==> Node 24 e git"
if ! command -v node >/dev/null || [[ "$(node -v)" != v24* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo apt-get install -y git

echo "==> Código em $PASTA"
if [[ -d "$PASTA/.git" ]]; then
  git -C "$PASTA" pull --ff-only
else
  git clone "$REPO" "$PASTA"
fi
cd "$PASTA"
npm ci
mkdir -p dados

echo "==> Serviço taverna (supervisor do bot)"
sudo tee /etc/systemd/system/taverna.service >/dev/null <<EOF
[Unit]
Description=Taverneiro (bot do Discord da Taverna)
After=network-online.target
Wants=network-online.target

[Service]
User=$USUARIO
WorkingDirectory=$PASTA
ExecStart=$(command -v node) scripts/supervisor.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "==> Atualização automática a cada 2 minutos"
sudo tee /etc/systemd/system/taverna-atualizar.service >/dev/null <<EOF
[Unit]
Description=Baixa a versão nova do Taverneiro do GitHub

[Service]
Type=oneshot
User=$USUARIO
WorkingDirectory=$PASTA
ExecStart=/usr/bin/env bash $PASTA/scripts/nuvem/atualizar.sh
EOF
sudo tee /etc/systemd/system/taverna-atualizar.timer >/dev/null <<EOF
[Unit]
Description=Confere a cada 2 minutos se há versão nova do Taverneiro

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable taverna taverna-atualizar.timer
sudo systemctl start taverna-atualizar.timer

echo
echo "Pronto. Falta:"
echo "  1) criar $PASTA/.env (DISCORD_TOKEN e CLIENT_SECRET)"
echo "  2) copiar a pasta dados/ do PC de casa para $PASTA/dados/"
echo "  3) sudo systemctl start taverna   (log: tail -f $PASTA/dados/bot.log)"
