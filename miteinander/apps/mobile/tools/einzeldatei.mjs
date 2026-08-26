/**
 * Baut aus dem Expo-Web-Export eine einzige, in sich geschlossene
 * HTML-Datei.
 *
 * Zweck: die App zum Ausprobieren weitergeben, ohne dass jemand einen
 * Server starten muss. Doppelklick genuegt.
 *
 * Vorgehen: das JavaScript-Bundle wird in die Seite eingebettet, alle
 * Bilddateien werden als data:-URI ersetzt. Danach gibt es keinen
 * einzigen externen Abruf mehr -- das ist auch datenschutzseitig der
 * Punkt: die Datei laedt nichts nach.
 */
import fs from 'node:fs';
import path from 'node:path';

const distDir = process.argv[2] ?? 'dist';
const zielDatei = process.argv[3] ?? 'miteinander-testfassung.html';

function alleDateien(verzeichnis) {
  return fs.readdirSync(verzeichnis, { withFileTypes: true }).flatMap((eintrag) => {
    const voll = path.join(verzeichnis, eintrag.name);
    return eintrag.isDirectory() ? alleDateien(voll) : [voll];
  });
}

const mimeTypen = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// 1. Bundle einlesen
const bundleDatei = alleDateien(path.join(distDir, '_expo')).find((f) => f.endsWith('.js'));
if (!bundleDatei) throw new Error('Kein JavaScript-Bundle im Export gefunden.');
let bundle = fs.readFileSync(bundleDatei, 'utf8');

// 2. Bilder als data:-URI einsetzen.
//    Laengste Pfade zuerst, damit kein kuerzerer Pfad einen laengeren zerschneidet.
const medien = alleDateien(distDir).filter((f) => mimeTypen[path.extname(f).toLowerCase()]);
let ersetzt = 0;
for (const datei of medien.sort((a, b) => b.length - a.length)) {
  const url = '/' + path.relative(distDir, datei).split(path.sep).join('/');
  if (!bundle.includes(url)) continue;
  const typ = mimeTypen[path.extname(datei).toLowerCase()];
  const dataUri = `data:${typ};base64,${fs.readFileSync(datei).toString('base64')}`;
  bundle = bundle.split(url).join(dataUri);
  ersetzt++;
}

/**
 * Wird nur in der Datei-Fassung gebraucht.
 *
 * Eine Seite, die per Doppelklick aus dem Dateisystem geoeffnet wird, darf
 * die Adresszeile nicht aendern -- der Browser wirft dabei einen
 * SecurityError. Die Navigation der App laeuft ohnehin ueber ihren eigenen
 * Zustand; die Adresszeile ist nur Beiwerk. Deshalb werden die beiden
 * History-Funktionen hier stillgelegt.
 *
 * Folge: Der Zurueck-Knopf des Browsers hat in dieser Fassung keine
 * Wirkung. Der Zurueck-Knopf in der App funktioniert normal.
 */
const dateiModusShim = `<script>
  (function () {
    if (window.location.protocol !== 'file:') return;
    var still = function () {};
    try {
      window.history.pushState = still;
      window.history.replaceState = still;
    } catch (fehler) {
      /* Wenn der Browser das nicht zulaesst, laeuft die App trotzdem. */
    }
  })();
</script>`;

// 3. Seite zusammensetzen
//    Wichtig: als Ersetzung wird immer eine Funktion uebergeben. Ein
//    String-Ersatz wuerde $-Folgen wie "$&" als Sonderzeichen deuten und
//    damit fremden Code beschaedigen -- im Bundle steckt genau so eine
//    Stelle.
const einfuegen = (text) => () => text;

const hinweis = `<!--
      MITEINANDER - Testfassung zum Ausprobieren.

      Diese Datei ist in sich geschlossen: kein Server noetig, keine
      Internetverbindung, kein Abruf von fremden Servern.

      Alle Daten sind erfunden und mit "(Demo)" gekennzeichnet. Sie liegen
      nur im Arbeitsspeicher des Browsers -- ein Neuladen setzt alles
      zurueck. Es wird nichts gespeichert und nichts verschickt.

      Erzeugt aus: apps/mobile (Expo Web-Export)
      Erzeugen mit: npm run testdatei
    -->`;

const seite = fs
  .readFileSync(path.join(distDir, 'index.html'), 'utf8')
  .replace('<html lang="en">', einfuegen('<html lang="de">'))
  .replace('<head>', einfuegen(`<head>\n    ${hinweis}`))
  // Der externe Skriptverweis weicht dem eingebetteten Bundle.
  .replace(
    /<script src="[^"]*"[^>]*><\/script>/,
    einfuegen(`${dateiModusShim}\n<script>\n//# Eingebettetes Anwendungs-Bundle\n${bundle}\n</script>`),
  );

fs.writeFileSync(zielDatei, seite);

const groesse = (fs.statSync(zielDatei).size / 1024 / 1024).toFixed(1);
console.log(`Testfassung geschrieben: ${zielDatei} (${groesse} MB)`);
console.log(`Eingebettete Mediendateien: ${ersetzt}`);
if (seite.includes('src="/_expo')) {
  console.error('WARNUNG: Es steht noch ein externer Skriptverweis in der Datei.');
  process.exitCode = 1;
}
