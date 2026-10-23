#!/usr/bin/env bash
# Atualiza o Taverneiro na nuvem (rodado a cada 2 minutos pelo taverna-atualizar.timer).
# Só vai para o ar uma VERSÃO (tag vX.Y.Z, criada pelo npm run lancar) e só depois que os testes do GitHub
# (Actions) passaram nela: commits soltos no main não derrubam o bot. O supervisor percebe os arquivos novos em
# src/ e reinicia o bot sozinho.
# Para mandar o main na hora (correção urgente): bash scripts/nuvem/atualizar.sh --main
set -euo pipefail
cd "$(dirname "$0")/../.."

git fetch --quiet --tags origin main

if [[ "${1:-}" == "--main" ]]; then
  alvo="$(git rev-parse origin/main)"
  rotulo="main"
else
  tag="$(git tag --list 'v*' --sort=-v:refname | head -1)"
  [[ -z "$tag" ]] && exit 0
  alvo="$(git rev-list -n1 "$tag")"
  rotulo="$tag"
  # Já está nela, ou mais à frente (ex.: alguém mandou o main à mão): nada a fazer.
  git merge-base --is-ancestor "$alvo" HEAD && exit 0
  # Testes do GitHub nesse commit: espera terminarem; se falharam, não atualiza.
  situacao="$(curl -fsS "https://api.github.com/repos/Gabs-X/taverna-bot/commits/$alvo/check-runs" | node -e '
    let d = ""; process.stdin.on("data", (c) => (d += c)).on("end", () => {
      const runs = JSON.parse(d).check_runs ?? [];
      if (!runs.length || runs.some((r) => r.status !== "completed")) return console.log("pendente");
      console.log(runs.every((r) => ["success", "skipped", "neutral"].includes(r.conclusion)) ? "ok" : "falhou");
    });' || echo pendente)"
  case "$situacao" in
    ok) ;;
    pendente) exit 0 ;;
    *) echo "A versão $tag está com os testes do GitHub falhando: não atualizei."; exit 0 ;;
  esac
fi

[[ "$(git rev-parse HEAD)" == "$alvo" ]] && exit 0
antes="$(git rev-parse HEAD)"
git merge --ff-only --quiet "$alvo"
# Dependências mudaram: instala antes de o supervisor reiniciar o bot.
if ! git diff --quiet "$antes" HEAD -- package-lock.json; then npm ci --silent; fi
echo "Atualizado para $rotulo: $(git log -1 --format='%h %s')"
