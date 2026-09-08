/* ============================================================
   Zeitlisten lesbar machen
   ------------------------------------------------------------
   Drei Wege, in dieser Reihenfolge:
     1. PDF mit Textebene  -> pdftotext (poppler), verlustfrei
     2. Bild oder Scan     -> Texterkennung (tesseract.js, deutsch)
     3. nichts davon da    -> ehrliche Fehlermeldung

   Wichtig fuer den Alltag: was hier herauskommt, ist ein
   Vorschlag. Handschrift wird auch von guter Software falsch
   gelesen; deshalb zeigt die Oberflaeche daneben immer das
   Originalbild und laesst jede Zeile bestaetigen.
   ============================================================ */
import { writeFile, readFile, unlink, mkdtemp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';

const starte = promisify(execFile);

function ausDatenUrl(daten) {
  const treffer = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(daten || '');
  if (!treffer) throw new Error('Unbrauchbare Datei');
  const art = treffer[1] || 'application/octet-stream';
  const roh = treffer[2]
    ? Buffer.from(treffer[3], 'base64')
    : Buffer.from(decodeURIComponent(treffer[3]), 'utf8');
  return { art, roh };
}

async function vorhanden(befehl) {
  try { await starte(befehl, ['-v']); return true; } catch (f) { return f.code !== 'ENOENT'; }
}

export async function lesen({ name = 'liste', daten }, einstellungen = {}) {
  const { art, roh } = ausDatenUrl(daten);
  const ordner = await mkdtemp(path.join(tmpdir(), 'hst-'));
  const endung = art.includes('pdf') ? '.pdf' : path.extname(name) || '.png';
  const datei = path.join(ordner, 'liste' + endung);
  await writeFile(datei, roh);

  try {
    if (art.includes('pdf')) {
      const text = await pdfLesen(datei);
      if (text && text.replace(/\s/g, '').length > 20) return { text, weg: 'pdf' };
      // PDF ohne Textebene: ist ein Scan, also weiter zur Erkennung.
    }
    const text = await bildLesen(datei, einstellungen);
    return { text, weg: 'ocr' };
  } finally {
    unlink(datei).catch(() => {});
  }
}

async function pdfLesen(datei) {
  if (!(await vorhanden('pdftotext'))) return '';
  const aus = datei + '.txt';
  try {
    await starte('pdftotext', ['-layout', '-enc', 'UTF-8', datei, aus]);
    const text = await readFile(aus, 'utf8');
    unlink(aus).catch(() => {});
    return text;
  } catch (f) {
    return '';
  }
}

let erkennerVersprechen = null;

/* Die Texterkennung wird einmal gestartet und bleibt dann stehen —
   das Hochfahren dauert einige Sekunden, das Erkennen selbst nicht.
   Sprachdaten holt tesseract.js beim ersten Mal aus dem Netz und legt
   sie in daten/tessdata ab. Wer keinen Netzzugang hat oder ihn nicht
   moechte, laedt deu.traineddata.gz einmal von Hand dorthin und traegt
   den Ordner in konfig.json unter ocr.datenPfad ein. */
async function erkennerHolen(einstellungen) {
  if (erkennerVersprechen) return erkennerVersprechen;
  erkennerVersprechen = (async () => {
    let tesseract;
    try {
      tesseract = await import('tesseract.js');
    } catch (f) {
      throw new Error(
        'Fuer Fotos und gescannte PDF fehlt die Texterkennung. ' +
        'Einmalig im Ordner bruecke/ ausfuehren:  npm install tesseract.js');
    }
    const optionen = { logger: () => {}, errorHandler: () => {} };
    if (einstellungen.datenPfad) optionen.langPath = einstellungen.datenPfad;
    if (einstellungen.zwischenlager) optionen.cachePath = einstellungen.zwischenlager;
    // Von Hand abgelegte Sprachdaten liegen meist unkomprimiert vor
    // (deu.traineddata statt deu.traineddata.gz).
    if (einstellungen.gepackt === false) optionen.gzip = false;

    const erkenner = await tesseract.createWorker(einstellungen.sprache || 'deu', 1, optionen);
    await erkenner.setParameters({
      // Zeitlisten sind Tabellen: Abstaende zwischen den Spalten erhalten,
      // sonst klebt der Name an der ersten Uhrzeit und die Spalten sind weg.
      preserve_interword_spaces: '1',
      // Seitenmodus 3 (automatisch) statt der Voreinstellung 6 ("ein Block").
      // Auf einer Tabelle mit Rahmen macht 6 aus drei Zeilen zwei und
      // verschluckt die erste — nachgemessen an einer eingescannten Liste.
      tessedit_pageseg_mode: String(einstellungen.seitenmodus || 3)
    });
    return erkenner;
  })();

  // Scheitert das Hochfahren, darf der naechste Versuch es erneut probieren
  // — und die Bruecke darf daran nicht sterben.
  erkennerVersprechen.catch(() => { erkennerVersprechen = null; });
  return erkennerVersprechen;
}

/* Ohne Frist wartet der Aufrufer notfalls ewig — etwa wenn der
   Rechner die Sprachdaten nicht laden kann und die Bibliothek
   still weiterprobiert. Lieber nach einer Minute ehrlich absagen. */
function mitFrist(versprechen, ms, text) {
  let uhr;
  return Promise.race([
    versprechen.finally(() => clearTimeout(uhr)),
    new Promise((_, daneben) => { uhr = setTimeout(() => daneben(new Error(text)), ms); })
  ]);
}

async function bildLesen(datei, einstellungen) {
  let erkenner;
  try {
    erkenner = await mitFrist(
      erkennerHolen(einstellungen),
      (einstellungen.startFrist || 60) * 1000,
      'Die Texterkennung ist nicht hochgekommen (Zeitueberschreitung). ' +
      'Meist fehlen die Sprachdaten und der Rechner kommt nicht ins Netz.');
  } catch (f) {
    erkennerVersprechen = null;
    throw netzFehler(f);
  }
  try {
    const { data } = await mitFrist(
      erkenner.recognize(datei),
      (einstellungen.leseFrist || 120) * 1000,
      'Die Texterkennung hat zu lange gebraucht. Bei sehr grossen Fotos hilft es, ' +
      'sie vorher zu verkleinern — 2000 Pixel Breite reichen.');
    return data.text || '';
  } catch (f) {
    erkennerVersprechen = null;
    throw netzFehler(f);
  }
}

function netzFehler(f) {
  const text = String(f && f.message ? f.message : f);
  if (/Network error|ENOTFOUND|ECONNREFUSED|403|fetch/i.test(text)) {
    return new Error(
      'Die Sprachdaten fuer die Texterkennung liessen sich nicht laden ' +
      '(' + text.split('\n')[0].slice(0, 120) + '). ' +
      'Entweder hat dieser Rechner keinen Netzzugang, oder eine Firewall blockt. ' +
      'Abhilfe: deu.traineddata.gz einmal herunterladen, in bruecke/daten/tessdata legen ' +
      'und in konfig.json unter "ocr": { "datenPfad": "daten/tessdata" } eintragen. ' +
      'Bis dahin: Foto als Vorlage nehmen und die Zeiten daneben eintippen.');
  }
  return new Error(text.split('\n')[0].slice(0, 200));
}

export async function aufraeumen() {
  if (!erkennerVersprechen) return;
  try { (await erkennerVersprechen).terminate(); } catch (f) {}
  erkennerVersprechen = null;
}
