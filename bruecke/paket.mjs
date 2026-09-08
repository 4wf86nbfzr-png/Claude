/* ============================================================
   Tagespakete und Protokoll
   ------------------------------------------------------------
   Ein "Tagespaket" ist alles, was das Buero fuer einen Tag
   braucht: die geplanten Schichten, die bereits gemeldeten
   Zeiten und was damit passiert ist. Eine Datei pro Tag, damit
   man sie zur Not auch von Hand lesen kann.

   Personenbezogene Daten: die Dateien liegen nur auf dem
   Buerorechner und werden nach konfig.aufbewahrungTage
   geloescht. daten/ gehoert nicht ins Repository.
   ============================================================ */
import { readFile, writeFile, readdir, unlink, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function pfad(konfig, tag) {
  return path.join(konfig.ordner.daten, `tagespaket-${tag}.json`);
}

export async function laden(konfig, tag) {
  const datei = pfad(konfig, tag);
  if (!existsSync(datei)) return null;
  try {
    return JSON.parse(await readFile(datei, 'utf8'));
  } catch (f) {
    return null;
  }
}

export async function sichern(konfig, paket) {
  paket.erzeugt = paket.erzeugt || new Date().toISOString();
  paket.geaendert = new Date().toISOString();
  await writeFile(pfad(konfig, paket.tag), JSON.stringify(paket, null, 2), 'utf8');
  return paket;
}

export function leeresPaket(tag) {
  return { tag, erzeugt: new Date().toISOString(), soll: [], ist: [], ausfaelle: [], meldungen: [] };
}

/* Eine Meldung des Schichtleiters einsortieren. Zweimal dieselbe
   Meldung ueberschreibt die erste — jemand tippt sich auch mal. */
export async function erfassungAufnehmen(konfig, meldung) {
  const tag = meldung.tag;
  const paket = (await laden(konfig, tag)) || leeresPaket(tag);
  paket.ist = paket.ist || [];
  paket.ausfaelle = paket.ausfaelle || [];
  paket.meldungen = paket.meldungen || [];

  const betroffen = new Set((meldung.zeilen || []).map((z) => z.rohname)
    .concat((meldung.ausfaelle || []).map((a) => a.name)));
  paket.ist = paket.ist.filter((z) => !(z.quelle === 'erfassung' && betroffen.has(z.rohname)));
  paket.ausfaelle = paket.ausfaelle.filter((a) => !betroffen.has(a.name));

  paket.ist = paket.ist.concat(meldung.zeilen || []);
  paket.ausfaelle = paket.ausfaelle.concat(meldung.ausfaelle || []);
  paket.meldungen.push({
    melder: meldung.melder, einsatz: meldung.einsatz || '',
    bemerkung: meldung.bemerkung || '', eingegangen: new Date().toISOString(),
    zeilen: (meldung.zeilen || []).length, ausfaelle: (meldung.ausfaelle || []).length
  });
  return sichern(konfig, paket);
}

/* Wer hat wann was freigegeben. Zeilenweises JSON, damit sich
   die Datei auch bei laufendem Betrieb anhaengen laesst. */
export async function protokollieren(konfig, eintrag) {
  const monat = (eintrag.datum || new Date().toISOString()).slice(0, 7);
  const datei = path.join(konfig.ordner.daten, `protokoll-${monat}.jsonl`);
  await appendFile(datei, JSON.stringify({ zeit: new Date().toISOString(), ...eintrag }) + '\n', 'utf8');
  return datei;
}

/* Protokoll lesen — neueste zuerst. Kaputte Zeilen werden
   uebergangen statt den ganzen Monat unlesbar zu machen. */
export async function protokollLesen(konfig, monat, grenze = 200) {
  const datei = path.join(konfig.ordner.daten, `protokoll-${monat}.jsonl`);
  if (!existsSync(datei)) return [];
  const text = await readFile(datei, 'utf8');
  const aus = [];
  for (const zeile of text.split(/\r?\n/)) {
    if (!zeile.trim()) continue;
    try { aus.push(JSON.parse(zeile)); } catch (f) { /* uebergehen */ }
  }
  return aus.reverse().slice(0, grenze);
}

export async function protokollMonate(konfig) {
  return (await readdir(konfig.ordner.daten))
    .map((n) => /^protokoll-(\d{4}-\d{2})\.jsonl$/.exec(n))
    .filter(Boolean).map((m) => m[1]).sort().reverse();
}

export async function letztesPaket(konfig) {
  const dateien = (await readdir(konfig.ordner.daten))
    .filter((n) => /^tagespaket-\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .sort();
  if (!dateien.length) return null;
  return dateien[dateien.length - 1].slice(11, 21);
}

export async function aufraeumen(konfig) {
  const grenze = new Date();
  grenze.setDate(grenze.getDate() - (konfig.aufbewahrungTage || 400));
  const grenzText = grenze.toISOString().slice(0, 10);
  let weg = 0;
  for (const name of await readdir(konfig.ordner.daten)) {
    const m = /^tagespaket-(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
    if (m && m[1] < grenzText) {
      await unlink(path.join(konfig.ordner.daten, name));
      weg++;
    }
  }
  return weg;
}
