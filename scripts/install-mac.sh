#!/usr/bin/env bash
# Builds Snapshot Studio and installs it into /Applications in one go:
#   npm run install:mac
# The first run also creates a local code-signing certificate. Builds signed
# with it keep the same identity, so macOS keeps the Screen Recording
# permission across rebuilds (an ad-hoc signature changes with every build).
set -euo pipefail
cd "$(dirname "$0")/.."

IDENTITY="Snapshot Studio Local"
APP="/Applications/Snapshot Studio.app"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

create_identity() {
  local tmp
  tmp=$(mktemp -d)
  cat > "$tmp/cert.cnf" <<CNF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $IDENTITY
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
CNF
  # macOS's own LibreSSL: its PKCS#12 output is what `security import` reads.
  /usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$tmp/cert.cnf" \
    -keyout "$tmp/key.pem" -out "$tmp/cert.pem" 2>/dev/null
  /usr/bin/openssl pkcs12 -export -inkey "$tmp/key.pem" -in "$tmp/cert.pem" -name "$IDENTITY" \
    -passout pass:snapshot -out "$tmp/identity.p12"
  security import "$tmp/identity.p12" -k "$KEYCHAIN" -P snapshot -T /usr/bin/codesign >/dev/null
  rm -rf "$tmp"
}

if ! security find-certificate -c "$IDENTITY" "$KEYCHAIN" >/dev/null 2>&1; then
  echo "• Creating local code-signing certificate \"$IDENTITY\" (one time only)"
  if create_identity; then
    # Permission granted to an earlier, differently signed build no longer
    # applies; clear it so macOS asks again instead of silently refusing.
    tccutil reset ScreenCapture com.snapshotstudio.app >/dev/null 2>&1 || true
  else
    echo "  ! Could not create it; this build will be ad-hoc signed instead."
  fi
fi

rm -rf dist
npm run dist:mac

echo "• Installing to $APP"
osascript -e 'quit app "Snapshot Studio"' >/dev/null 2>&1 || true
sleep 1
pkill -f "$APP/Contents/MacOS/" >/dev/null 2>&1 || true
rm -rf "$APP"
cp -R dist/mac*/"Snapshot Studio.app" /Applications/
open "$APP"
echo "• Done. Snapshot Studio is running in the menu bar."
