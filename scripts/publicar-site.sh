#!/usr/bin/env bash
# Publica o build estático no ramo "site": app.html (o painel) + index.html (carregador sempre atualizado).
# Uso: scripts/publicar-site.sh <pasta-do-clone-do-ramo-site> "mensagem"
set -euo pipefail
DEST="$1"; MSG="${2:-Site: atualização}"
VITE_TSE_BASE=https://resultados.tse.jus.br npm run build
find "$DEST" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r dist/. "$DEST"/
mv "$DEST/index.html" "$DEST/app.html"
cp scripts/loader.html "$DEST/index.html"
git -C "$DEST" add -A
git -C "$DEST" commit -qm "$MSG"
git -C "$DEST" push -q https://github.com/kelmanymarques-cmd/urna360 HEAD:site
git -C "$DEST" rev-parse HEAD
