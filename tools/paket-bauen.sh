#!/usr/bin/env bash
# ============================================================================
#  Baut das ZIP, das bei Netlify per Drag-and-drop hochgeladen wird.
# ----------------------------------------------------------------------------
#  Beim Ziehen-und-Ablegen führt Netlify keinen Build aus — es veröffentlicht,
#  was im Paket liegt. Eine Funktion, die `require('pdfkit')` sagt, findet
#  dort also nichts. Deshalb wird sie hier vorher gebündelt: aus
#  api/_netlify.js samt aller Abhängigkeiten wird eine einzige Datei unter
#  netlify/functions/formular.js. Die braucht kein node_modules und keinen
#  Bündler auf der Gegenseite — sie läuft, wo immer sie landet.
#
#  Nebeneffekt: das Paket ist ein Bruchteil so groß, weil node_modules nicht
#  mit hinein muss.
#
#  Aufruf:  bash tools/paket-bauen.sh
#  Ergebnis: herm-website-netlify.zip im Projektordner
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ZIEL="herm-website-netlify.zip"
GEBAUT="netlify/functions/formular.js"

echo "→ Abhängigkeiten sicherstellen"
[ -d node_modules/esbuild ] || npm ci --no-audit --no-fund >/dev/null

echo "→ Funktion zu einer Datei bündeln"
mkdir -p netlify/functions
npx --no-install esbuild api/_netlify.js \
  --bundle --platform=node --target=node20 --format=cjs \
  --outfile="$GEBAUT" --log-level=warning

echo "→ Prüfen, dass das Bündel für sich allein läuft"
node -e "
  const h = require('./$GEBAUT').handler;
  h({ httpMethod:'GET', headers:{}, body:'' }).then(a => {
    if(a.statusCode !== 405) { console.error('unerwartet:', a); process.exit(1); }
    console.log('   Antwort auf GET:', a.statusCode, a.body);
  });
"

echo "→ Prüfen, dass das Bündel wirklich nichts nachlädt"
node -e "
  const q = require('fs').readFileSync('./$GEBAUT','utf8');
  const offen = [...q.matchAll(/require\(['\"]([^'\".][^'\"]*)['\"]\)/g)]
    .map(m => m[1])
    .filter(m => !require('module').builtinModules.includes(m.replace(/^node:/,'')));
  if(offen.length){ console.error('   noch offen:', [...new Set(offen)]); process.exit(1); }
  console.log('   nur eingebaute Node-Module — nichts Externes');
"

AUSSEN=(
  "*.git*"          "tools/*"        "docs/*"
  "*.md"            ".vorschau-stand"
  "vercel.json"     ".vercelignore"  ".htaccess"  ".nojekyll"
  "node_modules/*"  "package.json"   "package-lock.json"
  "api/*"           "$ZIEL"
)

echo "→ Paket schnüren"
rm -f "$ZIEL"
zip -qr "$ZIEL" . -x "${AUSSEN[@]}"

echo
echo "Fertig: $ZIEL  ($(du -h "$ZIEL" | cut -f1))"
echo "Die Funktion darin: $GEBAUT ($(du -h "$GEBAUT" | cut -f1), eine Datei)"
echo
echo "Weiter geht es in README.md unter „Auf Netlify veröffentlichen“."
