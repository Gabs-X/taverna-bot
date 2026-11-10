#!/usr/bin/env bash
# Abre o mapa das campanhas (/campanha mapa) para a internet com um túnel grátis da Cloudflare:
# endereço https://algo.trycloudflare.com, sem abrir porta na Oracle e sem domínio. Pode rodar de novo sem problema.
#
# Do PC de casa:  ssh -i ~/.ssh/taverna_oracle ubuntu@IP 'bash ~/taverna-bot/scripts/nuvem/mapa.sh'
# (o script precisa estar no servidor, ou seja, depois que a versão com o mapa chegou lá)
#
# O endereço do túnel muda quando o túnel reinicia (queda ou reboot da máquina). Por isso o serviço roda o
# mapa-url.sh depois de subir: ele guarda o endereço novo em MAPA_URL no .env e reinicia o bot. Com um
# domínio seu na Cloudflare dá para ter um endereço fixo (túnel nomeado); aí não precisa disto.
set -euo pipefail

PORTA="${MAPA_PORTA:-53135}"
DIR="$HOME/taverna-bot"
[[ -f "$DIR/scripts/nuvem/mapa-url.sh" ]] || { echo "Falta $DIR/scripts/nuvem/mapa-url.sh: a versão com o mapa ainda não chegou ao servidor."; exit 1; }

if ! command -v cloudflared >/dev/null; then
  echo "==> Instalando o cloudflared"
  case "$(uname -m)" in
    x86_64) ARQ=amd64 ;;
    aarch64) ARQ=arm64 ;;
    *) echo "Arquitetura $(uname -m) não prevista."; exit 1 ;;
  esac
  curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$ARQ.deb"
  sudo dpkg -i /tmp/cloudflared.deb >/dev/null
  rm -f /tmp/cloudflared.deb
fi

echo "==> Criando o serviço do túnel (porta $PORTA)"
sudo tee /etc/systemd/system/taverna-mapa-tunel.service >/dev/null <<UNIT
[Unit]
Description=Túnel do mapa das campanhas da Taverna
After=network-online.target
Wants=network-online.target

[Service]
User=ubuntu
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --url http://localhost:$PORTA
# "+": roda como root (precisa reiniciar o bot e mexer no .env)
ExecStartPost=+/bin/bash $DIR/scripts/nuvem/mapa-url.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable taverna-mapa-tunel >/dev/null 2>&1
sudo systemctl restart taverna-mapa-tunel

echo "==> Esperando o endereço"
for _ in $(seq 1 30); do
  URL=$(grep -oP '^MAPA_URL=\K.*' "$DIR/.env" 2>/dev/null || true)
  [[ -n "$URL" ]] && break
  sleep 2
done
echo "Pronto. Mapa em: ${URL:-(ainda não apareceu; veja: journalctl -u taverna-mapa-tunel)}"
