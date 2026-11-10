#!/usr/bin/env bash
# Chamado pelo serviço taverna-mapa-tunel (como root) depois que o túnel sobe: descobre o endereço dele,
# guarda em MAPA_URL no .env e reinicia o bot se o endereço mudou.
set -euo pipefail

ENV=/home/ubuntu/taverna-bot/.env
UNIDADE=taverna-mapa-tunel

# Só olha o log desta execução do túnel (senão pegaria o endereço velho da anterior).
INVOCACAO=$(systemctl show -p InvocationID --value "$UNIDADE")
URL=""
for _ in $(seq 1 45); do
  URL=$(journalctl "_SYSTEMD_INVOCATION_ID=$INVOCACAO" -o cat --no-pager 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  [[ -n "$URL" ]] && break
  sleep 2
done
[[ -n "$URL" ]] || { echo "Não achei o endereço do túnel."; exit 0; }

ATUAL=$(grep -oP '^MAPA_URL=\K.*' "$ENV" 2>/dev/null || true)
[[ "$ATUAL" == "$URL" ]] && exit 0

# Regrava no mesmo arquivo (mantém dono e permissão do .env).
NOVO=$(grep -v '^MAPA_URL=' "$ENV" || true)
printf '%s\nMAPA_URL=%s\n' "$NOVO" "$URL" > "$ENV"
systemctl restart taverna
