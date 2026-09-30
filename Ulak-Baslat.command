#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Ulak — Mac başlatıcı  (çift tıkla)
#
#  Üç Terminal penceresi açar ve uygulamayı iOS Simülatör'de başlatır:
#    Pencere 1  →  server:  npm run dev          API + web  (http://localhost:4000)
#    Pencere 2  →  server:  npm run bots         6 sahte ulak (API hazır olunca)
#    Pencere 3  →  mobile:  npx expo start --ios Metro + iOS Simülatör'de Expo Go
#
#  İlk çalıştırmada kendini Masaüstü'ne kopyalar; sonra oradan çift tıkla.
#  Projeyi bulamazsa GitHub'dan ~/leogal içine klonlamayı önerir.
#
#  İsteğe bağlı ortam değişkenleri:
#    ULAK_DIR=/yol/leogal      proje dizinini elle ver
#    ULAK_BOTS=6               bot sayısı (1-20)
#    ULAK_SIM="iPhone 16 Pro"  belirli bir simülatör cihazını önceden aç
#    EXPO_PUBLIC_API_URL=...   uygulamanın bağlanacağı API (varsayılan localhost:4000)
#    ULAK_DRY_RUN=1            pencere açmadan yalnızca komutları yazdır (test)
# ─────────────────────────────────────────────────────────────────────────────
set -u

REPO_URL="https://github.com/avibrahimozen/leogal.git"
BRANCH="claude/ulak-mobile-app-iepob9"
API_PORT=4000
METRO_PORT=8081
CONFIG_DIR="$HOME/.config/ulak"
CONFIG_FILE="$CONFIG_DIR/proje-dizini"
DRY_RUN="${ULAK_DRY_RUN:-}"

# ── Çıktı yardımcıları ───────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_B=$'\033[1m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_0=$'\033[0m'
else
  C_B=''; C_G=''; C_Y=''; C_R=''; C_0=''
fi
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✔ %s%s\n' "$C_G" "$*" "$C_0"; }
warn() { printf '%s⚠ %s%s\n' "$C_Y" "$*" "$C_0"; }
bekle_ve_cik() {
  printf '\n'
  read -r -p "Kapatmak için Enter'a bas… " _ 2>/dev/null </dev/tty || true
  exit "${1:-1}"
}
fail() { printf '%s✖ %s%s\n' "$C_R" "$*" "$C_0"; bekle_ve_cik 1; }
sor()  { # sor "Soru" -> cevap 'e' ise 0
  local c
  read -r -p "$1 [e/H] " c 2>/dev/null </dev/tty || c=""
  case "$c" in e|E|evet|Evet|EVET|y|Y) return 0 ;; *) return 1 ;; esac
}
q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }   # kabuk için tek tırnakla

printf '\n%s🚕 Ulak — geliştirme ortamı başlatılıyor%s\n\n' "$C_B" "$C_0"

# ── 1. macOS ve araçlar ──────────────────────────────────────────────────────
if [ -z "$DRY_RUN" ] && [ "$(uname -s)" != "Darwin" ]; then
  fail "Bu başlatıcı macOS içindir (iOS Simülatör yalnızca Mac'te çalışır)."
fi

# Homebrew / nvm / fnm / volta kurulumlarını PATH'e ekle (kullanıcının kendi sırası önde kalır)
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
command -v fnm >/dev/null 2>&1 && eval "$(fnm env 2>/dev/null)"

node_ver_ok() { # node_ver_ok /yol/node  →  22.5 ve üzeri ise 0
  local v major minor
  [ -n "$1" ] && [ -x "$1" ] || return 1
  v=$("$1" -v 2>/dev/null | sed 's/^v//') || return 1
  major=${v%%.*}; v=${v#*.}; minor=${v%%.*}
  [ "${major:-0}" -gt 22 ] 2>/dev/null || { [ "${major:-0}" -eq 22 ] && [ "${minor:-0}" -ge 5 ]; } 2>/dev/null
}
node_ok() { node_ver_ok "$(command -v node 2>/dev/null)"; }

# PATH'teki node eskiyse bilinen kurulum yerlerinde 22.5+ ara
if ! node_ok; then
  for d in /opt/homebrew/opt/node@22/bin /usr/local/opt/node@22/bin /opt/homebrew/opt/node/bin \
           /opt/homebrew/bin /usr/local/bin "$HOME/.volta/bin" \
           $(ls -d "$HOME"/.nvm/versions/node/v*/bin "$HOME"/.fnm/node-versions/v*/installation/bin 2>/dev/null | sort -r); do
    node_ver_ok "$d/node" && { export PATH="$d:$PATH"; break; }
  done
fi
if ! node_ok && command -v nvm >/dev/null 2>&1; then
  nvm use 22 >/dev/null 2>&1 || nvm install 22 >/dev/null 2>&1 || true
fi
if ! node_ok; then
  say "Node.js 22.5 veya üzeri gerekli (bulunan: $(node -v 2>/dev/null || echo yok))."
  say "Kurulum:  brew install node@22   veya   https://nodejs.org (LTS)"
  fail "Node.js kurduktan sonra bu dosyayı yeniden çalıştır."
fi
NODE_BIN="$(dirname "$(command -v node)")"
ok "Node $(node -v) · npm $(npm -v)  ($NODE_BIN)"

command -v git >/dev/null 2>&1 || warn "git bulunamadı — klonlama gerekirse Xcode Command Line Tools kur: xcode-select --install"

if [ -z "$DRY_RUN" ]; then
  if ! xcode-select -p >/dev/null 2>&1; then
    warn "Xcode bulunamadı. App Store'dan Xcode'u kur, bir kez aç ve iOS platformunu indir."
  elif ! xcrun simctl list devices available 2>/dev/null | grep -q "iPhone"; then
    warn "Kullanılabilir iPhone simülatörü yok — Xcode ▸ Settings ▸ Components'ten bir iOS simülatörü indir."
  else
    ok "Xcode ve iOS Simülatör hazır"
  fi
fi

# ── 2. Proje dizini ──────────────────────────────────────────────────────────
SCRIPT_PATH="$0"
case "$SCRIPT_PATH" in /*) ;; *) SCRIPT_PATH="$PWD/$SCRIPT_PATH" ;; esac
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" 2>/dev/null && pwd)"

is_project() { [ -f "$1/server/package.json" ] && [ -f "$1/mobile/package.json" ]; }

find_project() {
  local c f
  if [ -n "${ULAK_DIR:-}" ]; then
    is_project "$ULAK_DIR" && { echo "$ULAK_DIR"; return 0; }
    warn "ULAK_DIR=$ULAK_DIR bir Ulak projesi değil, aranıyor…"
  fi
  is_project "$SCRIPT_DIR" && { echo "$SCRIPT_DIR"; return 0; }
  if [ -f "$CONFIG_FILE" ]; then
    c=$(head -n1 "$CONFIG_FILE")
    is_project "$c" && { echo "$c"; return 0; }
  fi
  for c in "$HOME/leogal" "$HOME/Desktop/leogal" "$HOME/Documents/leogal" "$HOME/Developer/leogal" \
           "$HOME/Projects/leogal" "$HOME/projects/leogal" "$HOME/dev/leogal" "$HOME/code/leogal" \
           "$HOME/src/leogal" "$HOME/Downloads/leogal" "$HOME/ulak" "$HOME/Desktop/ulak"; do
    is_project "$c" && { echo "$c"; return 0; }
  done
  # Geniş arama: ev dizininde 5 seviye (node_modules, Library, çöp hariç)
  find "$HOME" -maxdepth 5 \( -name node_modules -o -name Library -o -name .Trash -o -name .git \) -prune \
       -o -type f -path '*/server/package.json' -print 2>/dev/null |
  while read -r f; do
    c=$(dirname "$(dirname "$f")")
    is_project "$c" && { echo "$c"; break; }
  done
}

PROJECT="$(find_project || true)"

if [ -z "$PROJECT" ]; then
  say ""
  warn "Ulak proje klasörü (leogal) bulunamadı."
  say "  1) GitHub'dan klonla → ~/leogal   ($REPO_URL, dal: $BRANCH)"
  say "  2) Klasörün yolunu elle gir"
  read -r -p "Seçim [1/2]: " secim 2>/dev/null </dev/tty || secim=""
  case "$secim" in
    1)
      command -v git >/dev/null 2>&1 || fail "git yok. Önce: xcode-select --install"
      say "📥 Klonlanıyor…"
      git clone "$REPO_URL" "$HOME/leogal" || fail "Klonlama başarısız (ağ / GitHub erişimi?)."
      (cd "$HOME/leogal" && git checkout "$BRANCH" >/dev/null 2>&1) || warn "'$BRANCH' dalı yok, varsayılan dalda kalındı."
      PROJECT="$HOME/leogal"
      ;;
    *)
      read -r -p "Proje klasörü: " girilen 2>/dev/null </dev/tty || girilen=""
      girilen="${girilen/#\~/$HOME}"
      is_project "$girilen" || fail "'$girilen' içinde server/ ve mobile/ bulunamadı."
      PROJECT="$(cd "$girilen" && pwd)"
      ;;
  esac
fi

mkdir -p "$CONFIG_DIR" 2>/dev/null && printf '%s\n' "$PROJECT" > "$CONFIG_FILE" 2>/dev/null
ok "Proje: $PROJECT"

# ── 3. Bağımlılıklar ve demo verisi ──────────────────────────────────────────
ensure_deps() {
  if [ ! -d "$1/node_modules" ]; then
    say "📦 $2 bağımlılıkları kuruluyor (npm install) — ilk seferde birkaç dakika sürebilir…"
    (cd "$1" && npm install) || fail "$2 için npm install başarısız."
  fi
}
ensure_deps "$PROJECT/server" "Sunucu"
ensure_deps "$PROJECT/mobile" "Mobil uygulama"
ok "Bağımlılıklar hazır"

say "🌱 Demo verisi hazırlanıyor (npm run seed — tekrar çalıştırmak güvenlidir)…"
(cd "$PROJECT/server" && npm run --silent seed 2>&1 | grep -v "ExperimentalWarning\|trace-warnings") || warn "Seed tamamlanamadı; sunucu yine de başlatılıyor."

# ── 4. Portlar ve zaten çalışan süreçler ─────────────────────────────────────
port_pid() { command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -n1; }
kill_port() {
  local p; p=$(port_pid "$1")
  [ -n "$p" ] && { kill "$p" 2>/dev/null; sleep 1; kill -9 "$p" 2>/dev/null; }
  return 0
}

START_API=1; START_BOTS=1; START_EXPO=1

API_PID=$(port_pid "$API_PORT")
if [ -n "$API_PID" ]; then
  if curl -s "http://localhost:$API_PORT/api/health" 2>/dev/null | grep -q '"service":"ulak"'; then
    ok "Ulak API zaten çalışıyor (pid $API_PID) — 1. pencere açılmayacak"
    START_API=0
  else
    warn "$API_PORT portu başka bir süreç tarafından kullanılıyor (pid $API_PID)."
    if sor "Kapatıp Ulak API'yi başlatayım mı?"; then kill_port "$API_PORT"; else fail "$API_PORT portu boşalmadan sunucu başlatılamaz."; fi
  fi
fi

if pgrep -f "scripts/bots.ts" >/dev/null 2>&1; then
  ok "Sahte ulak botları zaten çalışıyor — 2. pencere açılmayacak"
  START_BOTS=0
fi

METRO_PID=$(port_pid "$METRO_PORT")
if [ -n "$METRO_PID" ]; then
  warn "Metro portu $METRO_PORT dolu (pid $METRO_PID) — muhtemelen eski bir 'expo start'."
  if sor "Kapatıp yeniden başlatayım mı?"; then kill_port "$METRO_PORT"; else
    ok "Mevcut Expo oturumu korunuyor — 3. pencere açılmayacak (o pencerede 'i' tuşuna bas)"
    START_EXPO=0
  fi
fi

# ── 5. Simülatör (isteğe bağlı: belirli cihaz) ───────────────────────────────
if [ -z "$DRY_RUN" ] && [ -n "${ULAK_SIM:-}" ]; then
  say "📱 '$ULAK_SIM' simülatörü açılıyor…"
  xcrun simctl boot "$ULAK_SIM" >/dev/null 2>&1 || true
  open -a Simulator >/dev/null 2>&1 || true
fi

# ── 6. Terminal pencereleri ──────────────────────────────────────────────────
PATH_PREFIX="export PATH=$(q "$NODE_BIN"):\"\$PATH\""
CMD_API="cd $(q "$PROJECT/server") && $PATH_PREFIX && clear && echo '🚕 Ulak API — http://localhost:$API_PORT   (durdurmak için Ctrl+C)' && PORT=$API_PORT npm run dev"
CMD_BOTS="cd $(q "$PROJECT/server") && $PATH_PREFIX && clear && echo '🤖 Sahte ulaklar — API hazır olunca başlayacak' && until curl -sf http://localhost:$API_PORT/api/health >/dev/null; do sleep 1; done && ULAK_API_URL=http://localhost:$API_PORT ULAK_BOTS=${ULAK_BOTS:-6} npm run bots"
CMD_EXPO="cd $(q "$PROJECT/mobile") && $PATH_PREFIX && clear && echo '📱 Expo — iOS Simülatör açılıyor (i: iOS, a: Android, w: web, r: yenile)' && ${EXPO_PUBLIC_API_URL:+EXPO_PUBLIC_API_URL=$(q "$EXPO_PUBLIC_API_URL") }npx expo start --ios"

open_window() { # open_window "Başlık" "komut"
  if [ -n "$DRY_RUN" ]; then
    printf '%s[%s]%s\n  %s\n' "$C_B" "$1" "$C_0" "$2"
    return 0
  fi
  /usr/bin/osascript - "$1" "$2" <<'APPLESCRIPT'
on run argv
  set winTitle to item 1 of argv
  set cmd to item 2 of argv
  tell application "Terminal"
    activate
    set t to do script cmd
    delay 0.4
    try
      set custom title of t to winTitle
    end try
  end tell
end run
APPLESCRIPT
}

say ""
[ "$START_API"  = 1 ] && { open_window "Ulak · API (4000)" "$CMD_API";   ok "1. pencere: API sunucusu"; }
[ "$START_BOTS" = 1 ] && { open_window "Ulak · Botlar"     "$CMD_BOTS";  ok "2. pencere: sahte ulaklar"; }
[ "$START_EXPO" = 1 ] && { open_window "Ulak · Expo / iOS" "$CMD_EXPO";  ok "3. pencere: Expo + iOS Simülatör"; }

# ── 7. Masaüstü kısayolu ─────────────────────────────────────────────────────
DESKTOP="$HOME/Desktop"
if [ -z "$DRY_RUN" ] && [ -d "$DESKTOP" ]; then
  for f in Ulak-Baslat.command Ulak-Durdur.command; do
    src="$SCRIPT_DIR/$f"; [ -f "$src" ] || src="$PROJECT/$f"; [ -f "$src" ] || continue
    dst="$DESKTOP/$f"
    if [ "$src" != "$dst" ] && ! cmp -s "$src" "$dst" 2>/dev/null; then
      cp -X "$src" "$dst" 2>/dev/null || cp "$src" "$dst"
      chmod +x "$dst"; xattr -d com.apple.quarantine "$dst" 2>/dev/null || true
      ok "Masaüstüne kopyalandı: ~/Desktop/$f"
    fi
  done
fi

# ── 8. Özet ──────────────────────────────────────────────────────────────────
cat <<OZET

${C_B}Hazır.${C_0} Simülatörün açılması ve Expo Go'nun ilk kez yüklenmesi 1-2 dakika sürebilir.

  API + web        http://localhost:$API_PORT
  Yönetim paneli   http://localhost:$API_PORT/admin
  Metro            http://localhost:$METRO_PORT   (Expo penceresinde: i = iOS, a = Android, w = web)

  Demo hesaplar (şifre demo123):
    Yolcu    +905550000001        Sürücü   +905550000002
    Yolcu 2  +905550000003        Sürücü 2 +905550000004
    Yönetici +903920000000 / ulak-admin  (tarayıcıda /admin)

  Durdurmak için: pencerelerde Ctrl+C  ya da  Ulak-Durdur.command
OZET

[ -n "$DRY_RUN" ] && exit 0
read -r -p "Bu pencereyi kapatmak için Enter'a bas… " _ 2>/dev/null </dev/tty || true
exit 0
