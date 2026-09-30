#!/bin/bash
# Ulak — Mac durdurucu (çift tıkla): API sunucusunu, sahte ulak botlarını ve
# Expo/Metro'yu kapatır. Terminal pencerelerini kendin kapatabilirsin.
set -u
API_PORT=4000; METRO_PORT=8081

port_pids() { command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null; }
stop_pids() { # stop_pids "etiket" pid...
  local etiket="$1"; shift
  [ $# -eq 0 ] && { printf '· %s: çalışmıyor\n' "$etiket"; return; }
  kill "$@" 2>/dev/null; sleep 1; kill -9 "$@" 2>/dev/null
  printf '✔ %s durduruldu (pid %s)\n' "$etiket" "$*"
}

printf '\n🛑 Ulak durduruluyor\n\n'
stop_pids "Sahte ulak botları" $(pgrep -f "scripts/bots.ts" 2>/dev/null)
stop_pids "API sunucusu (:$API_PORT)" $(port_pids "$API_PORT")
stop_pids "Expo / Metro (:$METRO_PORT)" $(port_pids "$METRO_PORT")
stop_pids "tsx watch" $(pgrep -f "tsx watch src/index.ts" 2>/dev/null)

if command -v xcrun >/dev/null 2>&1; then
  read -r -p "iOS Simülatör de kapatılsın mı? [e/H] " c 2>/dev/null </dev/tty || c=""
  case "$c" in e|E|evet|Evet|y|Y) xcrun simctl shutdown all >/dev/null 2>&1; osascript -e 'tell application "Simulator" to quit' >/dev/null 2>&1; printf '✔ Simülatör kapatıldı\n' ;; esac
fi

printf '\nBitti. '
read -r -p "Kapatmak için Enter'a bas… " _ 2>/dev/null </dev/tty || true
