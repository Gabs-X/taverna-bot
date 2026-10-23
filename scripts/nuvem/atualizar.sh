#!/usr/bin/env bash
# Baixa a versão nova do GitHub, se houver (rodado a cada 2 minutos pelo taverna-atualizar.timer).
# O supervisor percebe os arquivos novos em src/ e reinicia o bot sozinho (conferindo o código antes).
set -euo pipefail
cd "$(dirname "$0")/../.."

git fetch --quiet origin main
if [[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]]; then exit 0; fi

antes="$(git rev-parse HEAD)"
git pull --ff-only --quiet origin main
# Dependências mudaram: instala antes de o supervisor reiniciar o bot.
if ! git diff --quiet "$antes" HEAD -- package-lock.json; then npm ci --silent; fi
echo "Atualizado: $(git log -1 --format='%h %s')"
