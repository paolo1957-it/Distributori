#!/bin/bash
# Firma l'app e la carica su TestFlight. Lo esegue il workflow "Pubblica su TestFlight"
# su un Mac di GitHub: sul computer di paolo non serve niente. Vedi ios/TESTFLIGHT.md.
#
# Due modi:
#  - senza CarPlay (CARPLAY=false): firma automatica con la sola chiave API di App Store Connect.
#    Serve finché Apple non ha concesso l'autorizzazione CarPlay.
#  - con CarPlay (CARPLAY=true): firma manuale con il certificato di distribuzione e il profilo
#    che contiene l'autorizzazione "CarPlay Fueling" (Apple non la mette nei profili automatici).
set -euo pipefail
cd "$(dirname "$0")/.."

TMP="${RUNNER_TEMP:-$(mktemp -d)}"
ARCHIVIO="$TMP/QuiDistributori.xcarchive"
USCITA="$TMP/esportazione"
OPZIONI="$TMP/ExportOptions.plist"
BUNDLE_ID="it.quivicino.distributori"
NUMERO_BUILD="${NUMERO_BUILD:-1}"

# ---- Controllo dei secret ----
manca=""
for s in APPLE_TEAM_ID ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8; do
  [ -n "${!s:-}" ] || manca="$manca $s"
done
if [ "${CARPLAY:-false}" = "true" ]; then
  for s in DIST_CERT_P12 DIST_CERT_PASSWORD CARPLAY_PROFILE; do
    [ -n "${!s:-}" ] || manca="$manca $s"
  done
fi
if [ -n "$manca" ]; then
  echo "::error::Mancano questi secret del repository:$manca. Vedi ios/TESTFLIGHT.md."
  exit 1
fi

# ---- Chiave API di App Store Connect (file .p8) ----
CHIAVE="$TMP/AuthKey_${ASC_KEY_ID}.p8"
printf '%s\n' "$ASC_KEY_P8" > "$CHIAVE"
AUTENTICAZIONE=(-allowProvisioningUpdates
  -authenticationKeyPath "$CHIAVE"
  -authenticationKeyID "$ASC_KEY_ID"
  -authenticationKeyIssuerID "$ASC_ISSUER_ID")

xcodegen generate

if [ "${CARPLAY:-false}" = "true" ]; then
  echo "Firma con CarPlay (certificato e profilo dai secret)"

  # Portachiavi temporaneo con il certificato di distribuzione
  PORTACHIAVI="$TMP/firma.keychain-db"
  PAROLA="$(uuidgen)"
  security create-keychain -p "$PAROLA" "$PORTACHIAVI"
  security set-keychain-settings -lut 21600 "$PORTACHIAVI"
  security unlock-keychain -p "$PAROLA" "$PORTACHIAVI"
  printf '%s' "$DIST_CERT_P12" | base64 --decode > "$TMP/certificato.p12"
  security import "$TMP/certificato.p12" -P "$DIST_CERT_PASSWORD" -A -t cert -f pkcs12 -k "$PORTACHIAVI"
  security set-key-partition-list -S apple-tool:,apple: -k "$PAROLA" "$PORTACHIAVI" > /dev/null
  security list-keychains -d user -s "$PORTACHIAVI" $(security list-keychains -d user | tr -d '"')

  # Profilo con l'autorizzazione CarPlay
  printf '%s' "$CARPLAY_PROFILE" | base64 --decode > "$TMP/profilo.mobileprovision"
  security cms -D -i "$TMP/profilo.mobileprovision" > "$TMP/profilo.plist"
  UUID_PROFILO=$(/usr/libexec/PlistBuddy -c 'Print UUID' "$TMP/profilo.plist")
  NOME_PROFILO=$(/usr/libexec/PlistBuddy -c 'Print Name' "$TMP/profilo.plist")
  if ! /usr/libexec/PlistBuddy -c 'Print Entitlements:com.apple.developer.carplay-fueling' "$TMP/profilo.plist" > /dev/null 2>&1; then
    echo "::error::Il profilo \"$NOME_PROFILO\" non contiene l'autorizzazione CarPlay Fueling."
    exit 1
  fi
  for cartella in "$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"; do
    mkdir -p "$cartella"
    cp "$TMP/profilo.mobileprovision" "$cartella/$UUID_PROFILO.mobileprovision"
  done
  echo "Profilo: $NOME_PROFILO ($UUID_PROFILO)"

  xcodebuild archive \
    -project QuiDistributori.xcodeproj -scheme QuiDistributori -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$ARCHIVIO" \
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Manual \
    CODE_SIGN_IDENTITY="Apple Distribution" PROVISIONING_PROFILE_SPECIFIER="$NOME_PROFILO" \
    CURRENT_PROJECT_VERSION="$NUMERO_BUILD"

  python3 - "$OPZIONI" "$APPLE_TEAM_ID" "$BUNDLE_ID" "$NOME_PROFILO" <<'PY'
import plistlib, sys
percorso, team, bundle, profilo = sys.argv[1:]
plistlib.dump({
    "method": "app-store-connect", "destination": "upload", "teamID": team,
    "signingStyle": "manual", "signingCertificate": "Apple Distribution",
    "provisioningProfiles": {bundle: profilo}, "uploadSymbols": True,
}, open(percorso, "wb"))
PY
else
  echo "Firma automatica senza CarPlay (finché Apple non concede l'autorizzazione)"
  # L'archivio si crea senza firma e senza l'autorizzazione CarPlay; la firma di distribuzione
  # la mette Xcode all'esportazione, con un certificato gestito da Apple nel cloud.
  xcodebuild archive \
    -project QuiDistributori.xcodeproj -scheme QuiDistributori -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$ARCHIVIO" \
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGNING_ALLOWED=NO CODE_SIGN_ENTITLEMENTS= \
    CURRENT_PROJECT_VERSION="$NUMERO_BUILD"

  python3 - "$OPZIONI" "$APPLE_TEAM_ID" <<'PY'
import plistlib, sys
percorso, team = sys.argv[1:]
plistlib.dump({
    "method": "app-store-connect", "destination": "upload", "teamID": team,
    "signingStyle": "automatic", "uploadSymbols": True,
}, open(percorso, "wb"))
PY
fi

# Firma per l'App Store e invio ad App Store Connect: dopo qualche minuto la build compare in TestFlight.
xcodebuild -exportArchive -archivePath "$ARCHIVIO" -exportOptionsPlist "$OPZIONI" \
  -exportPath "$USCITA" "${AUTENTICAZIONE[@]}"

echo "Build $NUMERO_BUILD inviata. Tra 10-30 minuti la trovi nell'app TestFlight sull'iPhone."
