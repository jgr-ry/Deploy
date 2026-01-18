#!/usr/bin/env bash
set -e
if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI no encontrado. Instálalo desde https://cli.github.com/"
  exit 1
fi
REPO="jgr-ry/ZeroRP"
if [ -n "$1" ]; then
  WEBHOOK="$1"
else
  read -rp "Introduce la URL del webhook (no se guardará en el repo): " WEBHOOK
fi
if [ -z "$WEBHOOK" ]; then
  echo "No se proporcionó webhook. Abortando."
  exit 1
fi
# Usa stdin para no dejar el value en el historial del shell
printf "%s" "$WEBHOOK" | gh secret set DISCORD_WEBHOOK_URL -b -R "$REPO"
echo "Secret DISCORD_WEBHOOK_URL establecido para $REPO"