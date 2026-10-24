#!/usr/bin/env bash
# Instala o TURN (coturn) da Tela da Taverna no servidor da nuvem: retransmite a tela quando os navegadores
# não conseguem se conectar direto (operadora com CGNAT, roteador fechado). Pode rodar de novo sem problema.
#
# Do PC de casa:  ssh -i ~/.ssh/taverna_oracle ubuntu@IP 'bash -s' < scripts/nuvem/turn.sh
# Depois, no painel da Oracle, libere na Security List da rede (entrada, origem 0.0.0.0/0):
#   UDP 3478 · TCP 3478 · UDP 49160-49400
set -euo pipefail

ENV="$HOME/taverna-bot/.env"
IP_INTERNO=$(hostname -I | awk '{print $1}')
IP_PUBLICO=$(curl -s -m 10 ifconfig.me)
[[ -n "$IP_PUBLICO" ]] || { echo "Não consegui descobrir o IP público."; exit 1; }

echo "==> Instalando o coturn"
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq coturn >/dev/null

# Reaproveita a senha-mestra se já existir (senão os links abertos param de valer).
SEGREDO=$(grep -oP '^TURN_SEGREDO=\K.*' "$ENV" 2>/dev/null || true)
[[ -n "$SEGREDO" ]] || SEGREDO=$(openssl rand -hex 32)

echo "==> Configurando ($IP_PUBLICO)"
sudo tee /etc/turnserver.conf >/dev/null <<CONF
# TURN da Tela da Taverna (gerado por scripts/nuvem/turn.sh)
listening-port=3478
listening-ip=$IP_INTERNO
relay-ip=$IP_INTERNO
external-ip=$IP_PUBLICO/$IP_INTERNO
min-port=49160
max-port=49400
realm=taverna
use-auth-secret
static-auth-secret=$SEGREDO
fingerprint
no-cli
no-tls
no-dtls
no-multicast-peers
no-loopback-peers
# Ninguém usa o TURN para chegar na rede interna da Oracle.
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
user-quota=20
total-quota=60
syslog
CONF
sudo chown root:turnserver /etc/turnserver.conf
sudo chmod 640 /etc/turnserver.conf

echo "==> Senha-mestra no .env do bot"
sed -i '/^TURN_SEGREDO=/d;/^TURN_HOST=/d' "$ENV"
printf 'TURN_HOST=%s\nTURN_SEGREDO=%s\n' "$IP_PUBLICO" "$SEGREDO" >> "$ENV"

echo "==> Firewall da máquina"
for regra in "-p udp --dport 3478" "-p tcp --dport 3478" "-p udp --dport 49160:49400"; do
  # Entra antes do REJECT padrão das imagens da Oracle.
  # shellcheck disable=SC2086
  sudo iptables -C INPUT $regra -m state --state NEW -j ACCEPT 2>/dev/null ||
    sudo iptables -I INPUT "$(sudo iptables -L INPUT --line-numbers | awk '/REJECT/{print $1; exit}')" $regra -m state --state NEW -j ACCEPT
done
sudo netfilter-persistent save >/dev/null 2>&1 || sudo sh -c 'iptables-save > /etc/iptables/rules.v4'

echo "==> Ligando"
sudo systemctl enable coturn >/dev/null 2>&1
sudo systemctl restart coturn
sleep 2
systemctl is-active coturn
echo "O bot lê o TURN do .env ao religar (sudo systemctl restart taverna, ou na próxima versão)."
echo "Pronto. Falta liberar UDP 3478, TCP 3478 e UDP 49160-49400 na Security List da Oracle."
