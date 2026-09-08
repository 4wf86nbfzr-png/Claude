/* ============================================================
   HERM SERVICE TEAM — Schichtabgleich
   Kern: Zeiten, Namen, Listen lesen, Soll/Ist vergleichen
   ------------------------------------------------------------
   Diese Datei enthaelt die ganze Rechenlogik und nichts, was
   einen Browser braucht. Dadurch laeuft sie an zwei Stellen:

     <script src="../assets/js/intern/kern.js">   (Oberflaeche)
     import '../assets/js/intern/kern.js'          (Bruecke, Tests)

   Beide holen sie danach unter globalThis.HSTAbgleich ab.
   Wer hier etwas aendert, faehrt bitte `npm test` in bruecke/ —
   die Faelle dort sind aus echten Zeitlisten abgeleitet.
   ============================================================ */
globalThis.HSTAbgleich = (function () {
  'use strict';

  /* ============================================================
     1 — Zeiten
     Schichten laufen ueber Mitternacht. Deshalb wird intern in
     Minuten seit Schichtbeginn gerechnet und nie mit Date().
     ============================================================ */

  /* Nimmt so ziemlich alles, was auf einer Zeitliste steht:
     "18:00", "18.00", "1800", "18", "18:00 Uhr", "18h30", "8:00" */
  function minutenAusZeit(wert) {
    if (wert === 0) return 0;
    if (!wert && wert !== '0') return null;
    if (typeof wert === 'number') return Math.round(wert);
    var text = String(wert).trim().toLowerCase()
      .replace(/uhr|h(?![0-9])/g, '')
      .replace(/\s+/g, '');
    if (!text) return null;

    var m = text.match(/^(\d{1,2})[:.,h-](\d{2})$/);
    if (m) return pruefeUhrzeit(+m[1], +m[2]);

    m = text.match(/^(\d{3,4})$/);          // 1800, 815
    if (m) {
      var z = m[1];
      var std = +z.slice(0, z.length - 2);
      var min = +z.slice(z.length - 2);
      return pruefeUhrzeit(std, min);
    }

    m = text.match(/^(\d{1,2})$/);          // "18" = 18:00
    if (m) return pruefeUhrzeit(+m[1], 0);

    return null;
  }

  function pruefeUhrzeit(std, min) {
    if (!isFinite(std) || !isFinite(min)) return null;
    if (min > 59) return null;
    if (std === 24 && min === 0) return 1440;
    if (std > 23) return null;
    return std * 60 + min;
  }

  function zeitAusMinuten(min) {
    if (min === null || min === undefined || !isFinite(min)) return '';
    var m = ((Math.round(min) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' +
           String(m % 60).padStart(2, '0');
  }

  /* Dauer in Minuten. Ende <= Beginn heisst: es ging ueber Mitternacht. */
  function dauer(beginn, ende) {
    if (beginn === null || ende === null) return null;
    var d = ende - beginn;
    if (d <= 0) d += 1440;
    return d;
  }

  function stundenText(min) {
    if (min === null || min === undefined || !isFinite(min)) return '–';
    var vz = min < 0 ? '-' : '';
    var a = Math.abs(Math.round(min));
    return vz + Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0') + ' h';
  }

  /* Runden auf ein Raster. 'kaufmaennisch' rundet zur naechsten Marke,
     'mitarbeiter' rundet Beginn ab und Ende auf (Zeit zaehlt fuer den
     Mitarbeiter), 'firma' umgekehrt. Was gilt, steht im Rahmenvertrag —
     deshalb ist es eine Einstellung und keine feste Regel. */
  function runden(min, schritt, art, rolle) {
    if (min === null || min === undefined || !isFinite(min)) return null;
    if (!schritt || schritt < 1) return Math.round(min);
    var q = min / schritt;
    var richtung = 'nah';
    if (art === 'mitarbeiter') richtung = rolle === 'beginn' ? 'ab' : 'auf';
    if (art === 'firma')       richtung = rolle === 'beginn' ? 'auf' : 'ab';
    var g = richtung === 'auf' ? Math.ceil(q)
          : richtung === 'ab'  ? Math.floor(q)
          : Math.round(q);
    return g * schritt;
  }

  /* Gesetzliche Mindestpause, § 4 ArbZG. Nur als Vorschlag —
     was tatsaechlich Pause war, steht auf der Liste. */
  function pauseNachGesetz(bruttoMinuten) {
    if (bruttoMinuten === null) return 0;
    if (bruttoMinuten > 9 * 60) return 45;
    if (bruttoMinuten > 6 * 60) return 30;
    return 0;
  }

  /* Nachtanteil (fuer Zuschlaege). Fenster kommt aus den Regeln. */
  function nachtMinuten(beginn, ende, vonMin, bisMin) {
    if (beginn === null || ende === null) return 0;
    var laenge = dauer(beginn, ende);
    var treffer = 0;
    for (var i = 0; i < laenge; i++) {
      var t = (beginn + i) % 1440;
      var drin = vonMin <= bisMin
        ? (t >= vonMin && t < bisMin)
        : (t >= vonMin || t < bisMin);
      if (drin) treffer++;
    }
    return treffer;
  }

  function heuteIso(verschiebungTage) {
    var d = new Date();
    d.setDate(d.getDate() + (verschiebungTage || 0));
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function datumDeutsch(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso || '';
    var wochentage = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return wochentage[d.getDay()] + '. ' + m[3] + '.' + m[2] + '.' + m[1];
  }

  /* Datum aus Freitext: 07.09.2026, 7.9.26, 2026-09-07 */
  function datumAusText(text) {
    var s = String(text || '');
    var m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})/);
    if (m) {
      var jahr = +m[3];
      if (jahr < 100) jahr += 2000;
      return jahr + '-' + String(+m[2]).padStart(2, '0') + '-' +
             String(+m[1]).padStart(2, '0');
    }
    return null;
  }

  /* ============================================================
     2 — Namen zuordnen
     Auf der Liste steht "Mustermann, M." oder "max mustermann"
     oder das, was die Texterkennung daraus gemacht hat. In
     secplan steht "Max Mustermann". Das muss zusammenfinden,
     ohne dass jemand eine Tabelle pflegt.
     ============================================================ */

  function normalisiere(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(herr|frau|hr|fr|dr|prof|dipl)\b\.?/g, ' ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function bestandteile(name) {
    var n = normalisiere(name);
    return n ? n.split(' ') : [];
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var vorher = new Array(b.length + 1);
    for (var j = 0; j <= b.length; j++) vorher[j] = j;
    for (var i = 1; i <= a.length; i++) {
      var jetzt = [i];
      for (var k = 1; k <= b.length; k++) {
        var kosten = a[i - 1] === b[k - 1] ? 0 : 1;
        jetzt[k] = Math.min(jetzt[k - 1] + 1, vorher[k] + 1, vorher[k - 1] + kosten);
      }
      vorher = jetzt;
    }
    return vorher[b.length];
  }

  function wortAehnlichkeit(a, b) {
    if (a === b) return 1;
    if (a.length === 1 || b.length === 1) {
      // Initiale: "m." passt auf "max", aber nur mit Abschlag.
      return a[0] === b[0] ? 0.88 : 0;
    }
    var d = levenshtein(a, b);
    var max = Math.max(a.length, b.length);
    var s = 1 - d / max;
    return s < 0 ? 0 : s;
  }

  /* 0 (nichts gemeinsam) bis 1 (identisch). Reihenfolge egal —
     "Mustermann Max" und "Max Mustermann" sind derselbe Mensch. */
  function namensAehnlichkeit(a, b) {
    var A = bestandteile(a), B = bestandteile(b);
    if (!A.length || !B.length) return 0;
    var kurz = A.length <= B.length ? A : B;
    var lang = A.length <= B.length ? B : A;
    var vergeben = {};
    var summe = 0;
    for (var i = 0; i < kurz.length; i++) {
      var best = 0, index = -1;
      for (var j = 0; j < lang.length; j++) {
        if (vergeben[j]) continue;
        var s = wortAehnlichkeit(kurz[i], lang[j]);
        if (s > best) { best = s; index = j; }
      }
      if (index >= 0 && best > 0) vergeben[index] = true;
      summe += best;
    }
    var wert = summe / kurz.length;
    // Ein Namensteil weniger als das Gegenueber ist normal ("M. Mustermann"),
    // soll aber nicht so sicher zaehlen wie ein voller Treffer.
    if (lang.length > kurz.length) wert *= 0.94;
    return Math.round(wert * 1000) / 1000;
  }

  var SICHER = 0.86;   // ab hier ohne Rueckfrage zugeordnet
  var VORSCHLAG = 0.62; // darunter gilt der Name als unbekannt
  var ABSTAND = 0.05;   // Vorsprung vor dem zweitbesten Treffer

  /* personen: [{id, name, personalnummer, alias:[...]}]
     aliase:  { "geschriebener name": personId }  — was das Buero
              einmal von Hand zugeordnet hat, merkt sich die Oberflaeche. */
  function zuordnen(rohname, personen, aliase) {
    var leer = { person: null, wert: 0, grund: 'leer' };
    if (!rohname || !personen || !personen.length) return leer;

    var schluessel = normalisiere(rohname);
    if (!schluessel) return leer;

    if (aliase && aliase[schluessel]) {
      var gemerkt = personen.filter(function (p) {
        return String(p.id) === String(aliase[schluessel]);
      })[0];
      if (gemerkt) return { person: gemerkt, wert: 1, grund: 'alias' };
    }

    // Personalnummer schlaegt jeden Namen.
    var nummer = String(rohname).match(/\b(\d{3,8})\b/);
    if (nummer) {
      var perNr = personen.filter(function (p) {
        return p.personalnummer && String(p.personalnummer) === nummer[1];
      })[0];
      if (perNr) return { person: perNr, wert: 1, grund: 'personalnummer' };
    }

    var treffer = personen.map(function (p) {
      var wert = namensAehnlichkeit(rohname, p.name);
      (p.alias || []).forEach(function (a) {
        wert = Math.max(wert, namensAehnlichkeit(rohname, a));
      });
      return { person: p, wert: wert };
    }).sort(function (a, b) { return b.wert - a.wert; });

    var erster = treffer[0];
    var zweiter = treffer[1] || { wert: 0 };
    if (!erster || erster.wert < VORSCHLAG) {
      return { person: null, wert: erster ? erster.wert : 0, grund: 'unbekannt' };
    }
    if (erster.wert - zweiter.wert < ABSTAND && zweiter.wert >= VORSCHLAG) {
      return {
        person: null, wert: erster.wert, grund: 'mehrdeutig',
        kandidaten: treffer.slice(0, 3).filter(function (t) { return t.wert >= VORSCHLAG; })
      };
    }
    return {
      person: erster.person,
      wert: erster.wert,
      grund: erster.wert >= SICHER ? 'sicher' : 'vorschlag'
    };
  }

  /* ============================================================
     3 — Zeitlisten lesen
     Quellen: CSV aus einem Kassen- oder Zutrittssystem, ein
     abgetippter Block, oder das, was die Texterkennung aus dem
     Foto der handschriftlichen Liste macht. Alle drei sehen
     zeilenweise gleich aus: irgendwo ein Name, danach zwei
     Uhrzeiten, vielleicht eine Pause.
     ============================================================ */

  var KOPF_NAME   = /^(name|mitarbeiter|personal|kraft|nachname|mitarbeiterin)/i;
  var KOPF_VON    = /^(von|beginn|start|kommt|ab|dienstbeginn|einsatzbeginn)/i;
  var KOPF_BIS    = /^(bis|ende|schluss|geht|dienstende|einsatzende)/i;
  var KOPF_PAUSE  = /^(pause|pausen|brutto[- ]?pause)/i;
  var KOPF_NUMMER = /^(pers|personalnr|personalnummer|nr|mitarbeiternr)/i;
  var KOPF_DATUM  = /^(datum|tag)/i;
  var KOPF_BEMERK = /^(bemerk|hinweis|notiz|kommentar|position)/i;
  // Der HERM-Stundenzettel hat drei eigene Spalten: die Unterschrift
  // (fuer die Auswertung ohne Belang, aber voller Gekritzel — sie muss
  // erkannt werden, damit sie nichts durcheinanderbringt), das Format
  // des Einsatzes (KS, ML …) und die vom Schichtleiter selbst
  // ausgerechneten Stunden, die als Gegenprobe taugen.
  var KOPF_UNTER  = /^(unterschrift|signatur|zeichen)/i;
  var KOPF_FORMAT = /^(format|bereich|saal|einsatzart|art)/i;
  var KOPF_STD    = /^(stunden|std|dauer|gesamt|summe)/i;
  var KOPF_FUNK   = /^(funktion|taetigkeit|tätigkeit)/i;

  var MUELLZEILE = /^(summe|gesamt|zwischensumme|seite|unterschrift|datum:|blatt|total)\b/i;

  function trennzeichenRaten(text) {
    var zeilen = text.split(/\r?\n/).filter(function (z) { return z.trim(); }).slice(0, 12);
    var kandidaten = [';', '\t', ',', '|'];
    var bestes = null, besteZahl = 0;
    kandidaten.forEach(function (t) {
      var zahlen = zeilen.map(function (z) { return z.split(t).length; });
      var min = Math.min.apply(null, zahlen);
      if (min >= 2 && min > besteZahl) { besteZahl = min; bestes = t; }
    });
    return bestes;   // null = Freitext, wird ueber Uhrzeiten gelesen
  }

  function felder(zeile, trenner) {
    if (trenner) return zeile.split(trenner).map(function (f) { return f.trim().replace(/^"|"$/g, ''); });
    return zeile.trim().split(/\s{2,}|\t/).map(function (f) { return f.trim(); });
  }

  function kopfzeileDeuten(felderListe) {
    var karte = {};
    felderListe.forEach(function (f, i) {
      var t = String(f).trim();
      if (karte.name === undefined && KOPF_NAME.test(t)) karte.name = i;
      else if (karte.von === undefined && KOPF_VON.test(t)) karte.von = i;
      else if (karte.bis === undefined && KOPF_BIS.test(t)) karte.bis = i;
      else if (karte.pause === undefined && KOPF_PAUSE.test(t)) karte.pause = i;
      else if (karte.nummer === undefined && KOPF_NUMMER.test(t)) karte.nummer = i;
      else if (karte.datum === undefined && KOPF_DATUM.test(t)) karte.datum = i;
      else if (karte.unterschrift === undefined && KOPF_UNTER.test(t)) karte.unterschrift = i;
      else if (karte.format === undefined && KOPF_FORMAT.test(t)) karte.format = i;
      else if (karte.stunden === undefined && KOPF_STD.test(t)) karte.stunden = i;
      else if (karte.bemerkung === undefined && (KOPF_BEMERK.test(t) || KOPF_FUNK.test(t))) karte.bemerkung = i;
    });
    var treffer = Object.keys(karte).length;
    return (treffer >= 2 && karte.von !== undefined && karte.bis !== undefined) ||
           (treffer >= 3) ? karte : null;
  }

  /* Zeile ohne Kopf: erste Uhrzeit = Beginn, zweite = Ende,
     davor steht der Name, eine allein stehende Zahl <= 180 ist die Pause. */
  function zeileFreiLesen(text) {
    var roh = String(text);
    // Ein Datum in der Zeile ("07.09.2026") sieht fuer die Uhrzeit-Suche
    // aus wie "07:09" und "2026". Deshalb zuerst herausnehmen und merken.
    var datumInZeile = null;
    roh = roh.replace(/\d{4}-\d{2}-\d{2}/, function (t) { datumInZeile = datumAusText(t); return ' '; })
             .replace(/\d{1,2}\.\s*\d{1,2}\.\s*\d{2,4}/, function (t) { datumInZeile = datumAusText(t); return ' '; });
    var spanne = roh.match(/(\d{1,2}\s*[:.]\s*\d{2}|\b\d{1,2}\b)\s*(?:-|–|—|bis|\/)\s*(\d{1,2}\s*[:.]\s*\d{2}|\b\d{1,2}\b)/i);
    var beginn = null, ende = null, restVorher = roh, restNachher = '';

    if (spanne) {
      beginn = minutenAusZeit(spanne[1]);
      ende   = minutenAusZeit(spanne[2]);
      restVorher  = roh.slice(0, spanne.index);
      restNachher = roh.slice(spanne.index + spanne[0].length);
    } else {
      var re = /(\d{1,2}\s*[:.]\s*\d{2}|\b\d{3,4}\b)/g, m, funde = [];
      while ((m = re.exec(roh)) !== null) funde.push({ text: m[1], index: m.index, ende: re.lastIndex });
      if (funde.length < 2) return null;
      beginn = minutenAusZeit(funde[0].text);
      ende   = minutenAusZeit(funde[1].text);
      restVorher  = roh.slice(0, funde[0].index);
      restNachher = roh.slice(funde[1].ende);
    }
    if (beginn === null || ende === null) return null;

    // Was hinter den Uhrzeiten steht, ist auf dem Zettel gemischt:
    // Unterschrift, Format (KS/ML) und die ausgerechneten Stunden.
    // Eine Pause ist nur eine ganze Zahl ohne Komma dahinter — sonst
    // wuerde aus "9,5 Stunden" eine Pause von neun Minuten.
    var pause = null;
    var pm = restNachher.match(/(?:^|[\s;|])(\d{1,3})(?![.,\d])\s*(min|')?/);
    if (pm) {
      var wert = +pm[1];
      if (wert <= 180 && (pm[2] || wert % 5 === 0)) pause = wert;
    }

    // Stunden laut Zettel: "9,5" / "3.75" — dient als Gegenprobe.
    var stundenLaut = null;
    var sm = restNachher.match(/(\d{1,2})[.,](\d{1,2})(?!\d)/);
    if (sm) stundenLaut = parseFloat(sm[1] + '.' + sm[2]);

    // Format: zwei bis vier Grossbuchstaben, alleinstehend.
    var format = '';
    var fm = restNachher.match(/(?:^|[\s;|])([A-ZÄÖÜ]{2,4})(?:[\s;|]|$)/);
    if (fm) format = fm[1];

    var name = restVorher.replace(/^\s*\d+[.)]\s*/, '').replace(/[;,|]\s*$/, '').trim();
    if (!name) return null;

    return { rohname: name, beginn: beginn, ende: ende, pause: pause,
             datum: datumInZeile, format: format, stundenLaut: stundenLaut,
             bemerkung: restNachher.replace(/^[\s;,|]+/, '').trim() };
  }

  /* Hauptfunktion: Text rein, Ist-Zeilen raus. */
  function zeitlisteLesen(text, optionen) {
    optionen = optionen || {};
    var quelle = optionen.quelle || 'liste';
    var rohzeilen = String(text || '').split(/\r?\n/);
    var trenner = trennzeichenRaten(text || '');
    var karte = null;
    var ergebnis = [];
    var verworfen = [];
    // Das Datum steht mal in der ersten Zeile, mal im Fuss, mal in einer
    // Zeile, die sonst als Kopfzeile verworfen wird. Also im ganzen Text
    // suchen — die erste gefundene Angabe gilt.
    var datumGlobal = optionen.datum || datumAusText(String(text || ''));

    rohzeilen.forEach(function (zeile, nr) {
      var roh = zeile.replace(/ /g, ' ');
      if (!roh.trim()) return;
      if (MUELLZEILE.test(roh.trim())) { verworfen.push({ zeile: nr + 1, text: roh, grund: 'Kopf- oder Summenzeile' }); return; }

      var f = felder(roh, trenner);

      if (!karte && f.length >= 2) {
        var moeglich = kopfzeileDeuten(f);
        if (moeglich) { karte = moeglich; return; }
      }

      var satz = null;

      if (karte && f.length >= 2) {
        var beginn = minutenAusZeit(f[karte.von]);
        var ende   = minutenAusZeit(f[karte.bis]);
        var name   = karte.name !== undefined ? f[karte.name] : '';
        if (!name && karte.nummer !== undefined) name = f[karte.nummer];
        if (beginn !== null && ende !== null && name) {
          satz = {
            rohname: name,
            beginn: beginn,
            ende: ende,
            pause: karte.pause !== undefined ? zahlOderNull(f[karte.pause]) : null,
            personalnummer: karte.nummer !== undefined ? (f[karte.nummer] || '').trim() : '',
            datum: karte.datum !== undefined ? datumAusText(f[karte.datum]) : null,
            format: karte.format !== undefined ? (f[karte.format] || '').trim() : '',
            stundenLaut: karte.stunden !== undefined ? kommazahl(f[karte.stunden]) : null,
            bemerkung: karte.bemerkung !== undefined ? (f[karte.bemerkung] || '').trim() : ''
          };
        }
      }

      if (!satz) satz = zeileFreiLesen(roh);

      if (!satz) {
        // Zeilen ohne zwei Uhrzeiten sind fast immer Ueberschriften.
        if (/\d/.test(roh)) verworfen.push({ zeile: nr + 1, text: roh.trim(), grund: 'keine zwei Uhrzeiten erkannt' });
        return;
      }

      satz.quelle = quelle;
      satz.zeile = nr + 1;
      satz.datum = satz.datum || datumGlobal || null;
      satz.rohtext = roh.trim();
      if (satz.pause === undefined) satz.pause = null;
      if (satz.format === undefined) satz.format = '';
      if (satz.stundenLaut === undefined) satz.stundenLaut = null;
      ergebnis.push(satz);
    });

    return { zeilen: ergebnis, verworfen: verworfen, datum: datumGlobal, trenner: trenner };
  }

  /* "9,5" und "3.75" sind dasselbe. */
  function kommazahl(wert) {
    if (wert === null || wert === undefined || wert === '') return null;
    var m = String(wert).match(/\d{1,3}([.,]\d{1,2})?/);
    if (!m) return null;
    var z = parseFloat(m[0].replace(',', '.'));
    return isFinite(z) ? z : null;
  }

  function zahlOderNull(wert) {
    if (wert === null || wert === undefined || wert === '') return null;
    var m = String(wert).match(/-?\d+([.,]\d+)?/);
    if (!m) return null;
    var z = parseFloat(m[0].replace(',', '.'));
    return isFinite(z) ? Math.round(z) : null;
  }

  /* ============================================================
     4 — Der eigentliche Abgleich
     ============================================================ */

  var REGELN_STANDARD = {
    toleranzMin: 10,        // bis hierhin gilt die Schicht als planmaessig
    raster: 15,             // Rundungsraster in Minuten
    rundung: 'kaufmaennisch', // 'kaufmaennisch' | 'mitarbeiter' | 'firma'
    pauseAutomatisch: false,  // fehlende Pause nach ArbZG ergaenzen
    nachtVon: '23:00',
    nachtBis: '06:00',
    maxAbweichungMin: 240,  // darueber: Verdacht auf Lesefehler, nie automatisch
    // Auf dem Stundenzettel steht eine Schicht oft in mehreren Zeilen,
    // getrennt nach Format (10:30-19:00 KS, danach 19:00-21:30 ML).
    // In secplan ist das eine Schicht. Solche Zeilen werden wieder
    // zusammengefasst; blockLuecke sagt, wie gross die Luecke dazwischen
    // hoechstens sein darf — die Luecke selbst zaehlt dann als Pause.
    blockLuecke: 120,
    tagesbeginn: 300        // 05:00: alles davor gehoert zur Nacht davor
  };

  function regelnMitStandard(regeln) {
    var r = {};
    Object.keys(REGELN_STANDARD).forEach(function (k) { r[k] = REGELN_STANDARD[k]; });
    Object.keys(regeln || {}).forEach(function (k) {
      if (regeln[k] !== undefined && regeln[k] !== null && regeln[k] !== '') r[k] = regeln[k];
    });
    return r;
  }

  /* Eine Soll-Schicht und eine Ist-Zeile gegeneinander. */
  function bewerten(soll, ist, regeln) {
    var r = regelnMitStandard(regeln);

    if (soll && !ist) {
      return { status: 'fehlt', beginn: soll.beginn, ende: soll.ende,
               pause: soll.pause || 0, diffBeginn: null, diffEnde: null, diffDauer: null };
    }
    if (ist && !soll) {
      var b0 = runden(ist.beginn, r.raster, r.rundung, 'beginn');
      var e0 = runden(ist.ende, r.raster, r.rundung, 'ende');
      return { status: 'zusatz', beginn: b0, ende: e0,
               pause: pauseWaehlen(ist, null, b0, e0, r),
               diffBeginn: null, diffEnde: null, diffDauer: null };
    }

    // Verglichen wird mit der echten Zeit, nicht mit der gerundeten:
    // sonst wuerde eine Viertelstundenrundung aus fuenf Minuten
    // Ueberzug eine Abweichung von fuenfzehn machen.
    var dB = kuerzesteDifferenz(ist.beginn, soll.beginn);
    var dE = kuerzesteDifferenz(ist.ende, soll.ende);
    var b = runden(ist.beginn, r.raster, r.rundung, 'beginn');
    var e = runden(ist.ende, r.raster, r.rundung, 'ende');
    var pause = pauseWaehlen(ist, soll, b, e, r);

    var sollNetto = dauer(soll.beginn, soll.ende) - (soll.pause || 0);
    var istNetto  = dauer(b, e) - pause;
    var dD = istNetto - sollNetto;

    // Die Pause zaehlt mit: wer planmaessig kommt und geht, aber eine
    // Stunde Pause auf dem Zettel stehen hat, hat eine Stunde weniger
    // gearbeitet. Ohne diese Pruefung liefe das als "passt" durch.
    var pauseDiff = pause - (soll.pause || 0);

    var status;
    if (Math.abs(dB) > r.maxAbweichungMin || Math.abs(dE) > r.maxAbweichungMin) {
      status = 'pruefen';
    } else if (Math.abs(dB) <= r.toleranzMin && Math.abs(dE) <= r.toleranzMin &&
               Math.abs(pauseDiff) <= r.toleranzMin) {
      status = 'passt';
    } else {
      status = 'abweichung';
    }

    return {
      status: status,
      // Innerhalb der Toleranz bleibt der Plan stehen — sonst wuerde die
      // Oberflaeche jeden Tag hunderte Schichten um drei Minuten korrigieren.
      beginn: status === 'passt' ? soll.beginn : b,
      ende:   status === 'passt' ? soll.ende   : e,
      pause:  status === 'passt' ? (soll.pause || 0) : pause,
      diffBeginn: dB, diffEnde: dE, diffDauer: status === 'passt' ? 0 : dD
    };
  }

  function pauseWaehlen(ist, soll, beginn, ende, r) {
    if (ist && ist.pause !== null && ist.pause !== undefined) return ist.pause;
    if (soll && soll.pause) return soll.pause;
    if (r.pauseAutomatisch) return pauseNachGesetz(dauer(beginn, ende));
    return 0;
  }

  /* Um Mitternacht ist 23:50 nicht 1430 Minuten von 00:10 entfernt,
     sondern 20. Ohne das steht jede Nachtschicht als Ausreisser drin. */
  function kuerzesteDifferenz(a, b) {
    if (a === null || b === null) return null;
    var d = (a - b) % 1440;
    if (d > 720) d -= 1440;
    if (d < -720) d += 1440;
    return d;
  }

  /* ============================================================
     Zeilen zu Bloecken
     Auf dem Zettel steht eine Schicht haeufig in zwei Zeilen —
     10:30-19:00 im Kleinen Saal, danach 19:00-21:30 im anderen.
     secplan kennt dafuer eine Schicht von 10:30 bis 21:30. Also
     werden solche Zeilen wieder zusammengelegt, aber nur so weit,
     wie der Dienstplan es hergibt: sind fuer den Tag zwei Schichten
     geplant, bleiben es zwei.
     ============================================================ */

  /* Uhrzeit auf einen durchgehenden Zeitstrahl legen, damit
     "01:00" nach "19:00" kommt und nicht davor. */
  function aufStrahl(min, tagesbeginn) {
    return min < tagesbeginn ? min + 1440 : min;
  }

  function bloeckeBilden(zeilen, sollAnzahl, r) {
    if (zeilen.length <= Math.max(1, sollAnzahl)) return zeilen.map(alsBlock);

    var bloecke = zeilen.map(alsBlock).sort(function (a, b) { return a.von - b.von; });

    while (bloecke.length > Math.max(1, sollAnzahl)) {
      // Immer zuerst die kleinste Luecke schliessen.
      var besteLuecke = null, stelle = -1;
      for (var i = 0; i < bloecke.length - 1; i++) {
        var luecke = bloecke[i + 1].von - bloecke[i].bis;
        if (luecke < 0) luecke = 0;
        if (besteLuecke === null || luecke < besteLuecke) { besteLuecke = luecke; stelle = i; }
      }
      if (stelle < 0 || besteLuecke > r.blockLuecke) break;
      bloecke.splice(stelle, 2, verschmelzen(bloecke[stelle], bloecke[stelle + 1], besteLuecke));
    }
    return bloecke;

    function alsBlock(z) {
      var von = aufStrahl(z.beginn, r.tagesbeginn);
      var bis = von + dauer(z.beginn, z.ende);
      return {
        rohname: z.rohname, personalnummer: z.personalnummer || '',
        beginn: z.beginn, ende: z.ende, pause: z.pause,
        datum: z.datum, quelle: z.quelle, zeile: z.zeile, rohtext: z.rohtext || '',
        format: z.format || '', stundenLaut: z.stundenLaut === undefined ? null : z.stundenLaut,
        bemerkung: z.bemerkung || '',
        von: von, bis: bis,
        teile: [{ beginn: z.beginn, ende: z.ende, format: z.format || '', pause: z.pause }]
      };
    }

    function verschmelzen(a, b, luecke) {
      var pausen = (a.pause || 0) + (b.pause || 0) + luecke;
      return {
        rohname: a.rohname, personalnummer: a.personalnummer || b.personalnummer || '',
        beginn: a.beginn, ende: b.ende,
        pause: pausen || (a.pause === null && b.pause === null ? null : 0),
        datum: a.datum || b.datum, quelle: a.quelle, zeile: a.zeile,
        rohtext: [a.rohtext, b.rohtext].filter(Boolean).join(' / '),
        format: [a.format, b.format].filter(Boolean).join('+'),
        stundenLaut: (a.stundenLaut || 0) + (b.stundenLaut || 0) || null,
        bemerkung: [a.bemerkung, b.bemerkung].filter(Boolean).join(' / '),
        von: a.von, bis: Math.max(a.bis, b.bis),
        teile: a.teile.concat(b.teile)
      };
    }
  }

  /* Ist-Zeilen den geplanten Schichten zuordnen und alles bewerten.
     sollListe: Schichten aus secplan (Abgleichliste oder Export)
     istListe:  Zeilen vom Stundenzettel / aus der Schnellerfassung
     personen:  Stammdaten fuer die Namenszuordnung          */
  function abgleichen(sollListe, istListe, personen, regeln, aliase) {
    var r = regelnMitStandard(regeln);
    personen = personen || ableitenPersonen(sollListe);
    var offen = (sollListe || []).map(function (s, i) {
      return { soll: s, index: i, belegt: false };
    });
    var zeilen = [];

    // 1 — jede Ist-Zeile einem Menschen zuordnen
    var zugeordnet = (istListe || []).map(function (ist) {
      var z = zuordnen(ist.personalnummer ? (ist.rohname + ' ' + ist.personalnummer) : ist.rohname,
                       personen, aliase);
      return { ist: ist, treffer: z };
    });

    // 2 — nach Person und Tag gruppieren
    var gruppen = {};
    zugeordnet.forEach(function (e) {
      var schluessel = (e.treffer.person ? 'p' + e.treffer.person.id : 'x' + normalisiere(e.ist.rohname)) +
                       '|' + (e.ist.datum || '');
      (gruppen[schluessel] = gruppen[schluessel] || { treffer: e.treffer, zeilen: [] }).zeilen.push(e.ist);
    });

    // 3 — je Gruppe zu Bloecken zusammenfassen, so weit der Plan es hergibt
    var bloecke = [];
    Object.keys(gruppen).forEach(function (schluessel) {
      var g = gruppen[schluessel];
      var person = g.treffer.person;
      var passendeSoll = person ? offen.filter(function (o) {
        return String(personId(o.soll)) === String(person.id) &&
               (!g.zeilen[0].datum || !o.soll.datum || g.zeilen[0].datum === o.soll.datum);
      }).length : 0;
      bloeckeBilden(g.zeilen, passendeSoll, r).forEach(function (b) {
        bloecke.push({ ist: b, treffer: g.treffer });
      });
    });

    // 4 — Bloecke auf Schichten legen und bewerten
    bloecke.forEach(function (e) {
      var ist = e.ist, person = e.treffer.person;

      if (!person) {
        zeilen.push(bauZeile(null, ist, {
          status: 'unklar', beginn: ist.beginn, ende: ist.ende, pause: ist.pause || 0,
          diffBeginn: null, diffEnde: null, diffDauer: null
        }, e.treffer));
        return;
      }

      var passend = offen.filter(function (o) {
        return !o.belegt &&
               String(personId(o.soll)) === String(person.id) &&
               (!ist.datum || !o.soll.datum || ist.datum === o.soll.datum);
      }).sort(function (a, b) {
        return Math.abs(kuerzesteDifferenz(ist.beginn, a.soll.beginn)) -
               Math.abs(kuerzesteDifferenz(ist.beginn, b.soll.beginn));
      })[0];

      if (passend) passend.belegt = true;
      zeilen.push(bauZeile(passend ? passend.soll : null, ist,
                           bewerten(passend ? passend.soll : null, ist, r), e.treffer));
    });

    // 5 — was uebrig bleibt, wurde geplant aber nicht gemeldet
    offen.forEach(function (o) {
      if (o.belegt) return;
      zeilen.push(bauZeile(o.soll, null, bewerten(o.soll, null, r), null));
    });

    zeilen.sort(function (a, b) {
      var rang = { unklar: 0, pruefen: 1, fehlt: 2, zusatz: 3, abweichung: 4, ausfall: 5, passt: 6 };
      var d = (rang[a.status] === undefined ? 9 : rang[a.status]) -
              (rang[b.status] === undefined ? 9 : rang[b.status]);
      if (d) return d;
      var t = String(a.datum || '').localeCompare(String(b.datum || ''));
      if (t) return t;
      return String(a.name).localeCompare(String(b.name), 'de');
    });

    zeilen.forEach(function (z, i) { z.id = 'z' + i; });
    return { zeilen: zeilen, kennzahlen: kennzahlen(zeilen), regeln: r };
  }

  function personId(soll) {
    return soll && soll.mitarbeiter ? soll.mitarbeiter.id : (soll ? soll.mitarbeiterId : null);
  }

  function ableitenPersonen(sollListe) {
    var karte = {};
    (sollListe || []).forEach(function (s) {
      var p = s.mitarbeiter || { id: s.mitarbeiterId, name: s.name, personalnummer: s.personalnummer };
      if (p && p.id !== undefined && p.id !== null && !karte[p.id]) karte[p.id] = p;
    });
    return Object.keys(karte).map(function (k) { return karte[k]; });
  }

  function bauZeile(soll, ist, urteil, zuordnung) {
    var person = soll ? (soll.mitarbeiter || { id: soll.mitarbeiterId, name: soll.name })
                      : (zuordnung && zuordnung.person ? zuordnung.person : null);
    return {
      id: null,
      status: urteil.status,
      name: person ? person.name : (ist ? ist.rohname : '—'),
      rohname: ist ? ist.rohname : '',
      person: person,
      zuordnung: zuordnung ? { grund: zuordnung.grund, wert: zuordnung.wert,
                               kandidaten: zuordnung.kandidaten || [] } : null,
      datum: (soll && soll.datum) || (ist && ist.datum) || null,
      einsatz: soll ? (soll.einsatz || soll.objekt || '') : (ist && ist.format) || (ist && ist.bemerkung) || '',
      funktion: soll ? (soll.funktion || '') : '',
      format: (ist && ist.format) || '',
      schichtId: soll ? (soll.id || null) : null,
      soll: soll ? { beginn: soll.beginn, ende: soll.ende, pause: soll.pause || 0,
                     pauseUnbekannt: !!soll.pauseUnbekannt } : null,
      ist: ist ? { beginn: ist.beginn, ende: ist.ende, pause: ist.pause,
                   quelle: ist.quelle, zeile: ist.zeile, rohtext: ist.rohtext || '',
                   format: ist.format || '', stundenLaut: ist.stundenLaut === undefined ? null : ist.stundenLaut,
                   teile: ist.teile || null } : null,
      vorschlag: { beginn: urteil.beginn, ende: urteil.ende, pause: urteil.pause },
      diffBeginn: urteil.diffBeginn,
      diffEnde: urteil.diffEnde,
      diffDauer: urteil.diffDauer,
      // Was ohne Zutun freigegeben werden darf: alles, was zum Plan passt.
      freigegeben: urteil.status === 'passt',
      erledigt: false,
      notiz: ''
    };
  }

  function kennzahlen(zeilen) {
    var k = { gesamt: zeilen.length, passt: 0, abweichung: 0, fehlt: 0, zusatz: 0,
              unklar: 0, pruefen: 0, ausfall: 0, freigegeben: 0,
              sollMinuten: 0, istMinuten: 0 };
    zeilen.forEach(function (z) {
      if (k[z.status] !== undefined) k[z.status]++;
      if (z.freigegeben) k.freigegeben++;
      if (z.soll) k.sollMinuten += Math.max(0, dauer(z.soll.beginn, z.soll.ende) - (z.soll.pause || 0));
      if (z.vorschlag && z.vorschlag.beginn !== null && z.status !== 'fehlt' && z.status !== 'ausfall') {
        k.istMinuten += Math.max(0, dauer(z.vorschlag.beginn, z.vorschlag.ende) - (z.vorschlag.pause || 0));
      }
    });
    k.diffMinuten = k.istMinuten - k.sollMinuten;
    k.offen = k.gesamt - k.freigegeben;
    return k;
  }

  /* ============================================================
     5 — CSV rein und raus
     ============================================================ */

  function csvLesen(text) {
    var trenner = trennzeichenRaten(text || '') || ';';
    var zeilen = String(text || '').split(/\r?\n/).filter(function (z) { return z.trim(); });
    if (!zeilen.length) return [];
    var kopf = zerlegeCsvZeile(zeilen[0], trenner).map(function (h) {
      return normalisiere(h).replace(/ /g, '');
    });
    return zeilen.slice(1).map(function (z) {
      var f = zerlegeCsvZeile(z, trenner);
      var satz = {};
      kopf.forEach(function (h, i) { satz[h] = (f[i] === undefined ? '' : f[i]).trim(); });
      return satz;
    });
  }

  function zerlegeCsvZeile(zeile, trenner) {
    var aus = [], jetzt = '', inZitat = false;
    for (var i = 0; i < zeile.length; i++) {
      var c = zeile[i];
      if (c === '"') {
        if (inZitat && zeile[i + 1] === '"') { jetzt += '"'; i++; }
        else inZitat = !inZitat;
      } else if (c === trenner && !inZitat) { aus.push(jetzt); jetzt = ''; }
      else jetzt += c;
    }
    aus.push(jetzt);
    return aus;
  }

  /* Soll-Schichten aus einem secplan-Export. Die Spaltennamen sind
     absichtlich grosszuegig gefasst — jeder Export heisst anders. */
  function sollAusCsv(text) {
    var saetze = csvLesen(text);
    var aus = [];
    saetze.forEach(function (s, i) {
      var name = ersterWert(s, ['mitarbeiter', 'name', 'personal', 'mitarbeitername', 'nachnamevorname']);
      var von  = ersterWert(s, ['von', 'beginn', 'start', 'dienstbeginn', 'schichtbeginn', 'zeitvon']);
      var bis  = ersterWert(s, ['bis', 'ende', 'dienstende', 'schichtende', 'zeitbis']);
      if (!name || minutenAusZeit(von) === null || minutenAusZeit(bis) === null) return;
      var nummer = ersterWert(s, ['personalnummer', 'personalnr', 'persnr', 'mitarbeiternummer', 'nr']);
      var pauseRoh = ersterWert(s, ['pause', 'pausemin', 'pauseminuten']);
      aus.push({
        id: ersterWert(s, ['schichtid', 'id', 'dienstid', 'einsatzid']) || ('s' + i),
        datum: datumAusText(ersterWert(s, ['datum', 'tag', 'einsatztag'])) || null,
        einsatz: ersterWert(s, ['einsatz', 'objekt', 'veranstaltung', 'auftrag', 'kunde', 'einsatzort']) || '',
        bereich: ersterWert(s, ['bereich', 'sparte', 'taetigkeit', 'position', 'funktion']) || '',
        mitarbeiter: { id: nummer || ('p' + normalisiere(name).replace(/ /g, '-')),
                       name: name, personalnummer: nummer || '' },
        beginn: minutenAusZeit(von),
        ende: minutenAusZeit(bis),
        pause: pauseRoh === '' ? 0 : (zahlOderNull(pauseRoh) || 0),
        pauseUnbekannt: pauseRoh === ''
      });
    });
    return aus;
  }

  function ersterWert(satz, schluessel) {
    for (var i = 0; i < schluessel.length; i++) {
      if (satz[schluessel[i]]) return satz[schluessel[i]];
    }
    return '';
  }

  /* ============================================================
     Die Abgleichliste aus secplan
     ------------------------------------------------------------
     secplan gibt "offene Abgleiche" als PDF aus (TCPDF). Die
     Spalten stehen dort an festen Stellen; lange Eintraege
     brechen ueber zwei bis drei Zeilen um:

        123 FM -   | Ahmed, Ziyad   | Sicherheitsmitarb | Di, 08.09.2026 | 08:30 | 16:00
        Sicherheit | Khalaf (2620)  | eiter             |                |       |

     Erwartet wird, was HSTPdf.zeilenAus() liefert: Zeilen mit
     Textstuecken samt x-Position. Die Kopfzeile gibt die
     Spaltengrenzen vor, ein Datum in der Datumsspalte beginnt
     einen neuen Satz — alles danach ohne Datum gehoert dazu.
     ============================================================ */
  function secplanAbgleichLesen(pdfZeilen) {
    var zeilen = (pdfZeilen || []).slice();
    var spalten = null;
    var saetze = [];
    var jetzt = null;

    zeilen.forEach(function (zeile) {
      var texte = zeile.teile.map(function (t) { return t.text.trim(); });
      var ganz = texte.join(' ');

      // Kopfzeile — auch auf Folgeseiten, dort wird sie uebersprungen.
      var istKopf = texte.some(function (t) { return /^mitarbeiter$/i.test(t); }) &&
                    texte.some(function (t) { return /^datum$/i.test(t); });
      if (istKopf) {
        spalten = zeile.teile.map(function (t) {
          return { name: normalisiere(t.text).replace(/ /g, ''), x: t.x };
        }).sort(function (a, b) { return a.x - b.x; });
        // Auf Folgeseiten steht die Kopfzeile erneut. Ohne diese Zeile
        // haengt sich ihr Umbruchrest ("…statu" / "s") an den letzten
        // Satz der Seite davor.
        jetzt = null;
        return;
      }
      if (!spalten) return;                                   // Titelzeilen vor der Tabelle
      if (/^seite\s*\d+\s*\/\s*\d+$/i.test(ganz)) return;   // Fusszeile
      if (/powered by/i.test(ganz)) return;

      var felder = {};
      zeile.teile.forEach(function (t) {
        var spalte = null;
        for (var i = 0; i < spalten.length; i++) {
          if (t.x >= spalten[i].x - 2) spalte = spalten[i]; else break;
        }
        if (!spalte) spalte = spalten[0];
        felder[spalte.name] = anhaengen(felder[spalte.name], t.text.trim());
      });

      var datumText = felder.datum || '';
      if (datumAusText(datumText)) {
        jetzt = felder;
        saetze.push(jetzt);
      } else if (jetzt) {
        Object.keys(felder).forEach(function (k) {
          jetzt[k] = anhaengen(jetzt[k], felder[k]);
        });
      }
    });

    return saetze.map(function (f, i) {
      var person = personAusSecplan(f.mitarbeiter || '');
      var von = minutenAusZeit(erstesWort(f.von));
      var bis = minutenAusZeit(erstesWort(f.bis));
      if (!person.name || von === null || bis === null) return null;
      var datum = datumAusText(f.datum);
      return {
        id: 'sp|' + datum + '|' + (person.personalnummer || normalisiere(person.name)) + '|' + zeitAusMinuten(von),
        datum: datum,
        einsatz: aufraeumen(f.planung || ''),
        funktion: aufraeumen(f.funktion || ''),
        tarif: aufraeumen(f.tarif || ''),
        anwesenheit: aufraeumen(f.status || ''),
        abgleichstatus: aufraeumen(f.abgleichstatu || f.abgleichstatus || ''),
        mitarbeiter: {
          id: person.personalnummer || ('p' + normalisiere(person.name).replace(/ /g, '-')),
          name: person.name,
          nachnameZuerst: person.nachnameZuerst,
          personalnummer: person.personalnummer
        },
        beginn: von,
        ende: bis,
        // Die Abgleichliste fuehrt keine Pausenspalte. Das ist etwas
        // anderes als "keine Pause" — sonst meldet die Pruefung nach
        // § 4 ArbZG jede einzelne Schicht.
        pause: 0,
        pauseUnbekannt: true
      };
    }).filter(Boolean);
  }

  /* Umbrueche in einer Tabellenzelle wieder zusammensetzen.
     Meist gehoert ein Leerzeichen dazwischen ("Nicht" + "abgeglichen").
     Zwei Faelle nicht: ein Bindestrich am Ende ("Hettmann-" + "Jelovic")
     und ein Wort, das mitten durchgebrochen wurde, weil es breiter war
     als die Spalte ("Sicherheitsmitarb" + "eiter"). Letzteres erkennt
     man daran, dass das erste Stueck lang ist und das zweite klein
     anfaengt und kurz bleibt. */
  function anhaengen(bisher, neuTeil) {
    if (!bisher) return neuTeil;
    if (!neuTeil) return bisher;
    // Nur ein Bindestrich, der am Wort klebt ("Hettmann-"), ist ein
    // Umbruch. Ein freistehender ist ein Trenner ("123 FM -").
    if (/[A-Za-zÄÖÜäöüß]-$/.test(bisher)) return bisher + neuTeil;
    var letztes = bisher.split(/\s/).pop();
    if (letztes.length >= 12 && /^[a-zäöüß]/.test(neuTeil) && neuTeil.length <= 8) {
      return bisher + neuTeil;
    }
    return bisher + ' ' + neuTeil;
  }

  function erstesWort(text) {
    return String(text || '').trim().split(/\s+/)[0] || '';
  }

  function aufraeumen(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  /* "Hettmann-Jelovic, Valentino (2027)" ->
     { name: "Valentino Hettmann-Jelovic", personalnummer: "2027" }
     Auf dem Stundenzettel steht der Vorname vorn — deshalb wird hier
     gedreht, sonst muesste die Namenssuche das jedes Mal ausgleichen. */
  function personAusSecplan(text) {
    var roh = aufraeumen(text);
    var nummer = '';
    roh = roh.replace(/\((\d{2,8})\)/, function (t, n) { nummer = n; return ' '; });
    roh = aufraeumen(roh);
    var teile = roh.split(',');
    var nachname = aufraeumen(teile[0] || '');
    var vorname = aufraeumen(teile.slice(1).join(' '));
    return {
      name: vorname ? (vorname + ' ' + nachname) : nachname,
      nachnameZuerst: vorname ? (nachname + ', ' + vorname) : nachname,
      personalnummer: nummer
    };
  }

  /* ============================================================
     Die Ergebnisdatei
     ------------------------------------------------------------
     Das, was am Ende zaehlt: eine Liste, die man neben secplan
     legt und abarbeitet. Oben steht, was geaendert werden muss,
     darunter das, was so bleiben kann.
     ============================================================ */
  var AENDERUNG = {
    passt:      'unveraendert',
    abweichung: 'Zeit anpassen',
    zusatz:     'nicht geplant - pruefen',
    ausfall:    'Ausfall eintragen',
    fehlt:      'noch offen',
    pruefen:    'pruefen',
    unklar:     'Person klaeren'
  };

  function ergebnisZeilen(zeilen, nurAenderungen) {
    return zeilen.filter(function (z) {
      if (!z.freigegeben) return false;
      if (nurAenderungen && z.status === 'passt') return false;
      return true;
    }).slice().sort(function (a, b) {
      var rang = { abweichung: 0, ausfall: 1, zusatz: 2, pruefen: 3, unklar: 4, fehlt: 5, passt: 6 };
      var d = (rang[a.status] === undefined ? 9 : rang[a.status]) -
              (rang[b.status] === undefined ? 9 : rang[b.status]);
      if (d) return d;
      var t = String(a.datum || '').localeCompare(String(b.datum || ''));
      return t || String(a.name).localeCompare(String(b.name), 'de');
    });
  }

  /* Die Felder, aus denen sich eine Ergebnisdatei zusammensetzen
     laesst. secplan kann CSV importieren, aber welche Spalten in
     welcher Reihenfolge erwartet werden, weiss nur die eigene
     Installation — deshalb ist die Spaltenfolge eine Einstellung
     (konfig.json unter "export") und keine feste Groesse. */
  var ERGEBNIS_FELDER = {
    aenderung:      function (z) { return AENDERUNG[z.status] || z.status; },
    datum:          function (z) { return z.datum ? datumDeutsch(z.datum).slice(4) : ''; },
    datum_iso:      function (z) { return z.datum || ''; },
    mitarbeiter:    function (z) { return (z.person && z.person.nachnameZuerst) || z.name; },
    vorname_nachname: function (z) { return z.name; },
    personalnummer: function (z) { return (z.person && z.person.personalnummer) || ''; },
    planung:        function (z) { return z.einsatz || ''; },
    funktion:       function (z) { return z.funktion || ''; },
    soll_von:       function (z) { return z.soll ? zeitAusMinuten(z.soll.beginn) : ''; },
    soll_bis:       function (z) { return z.soll ? zeitAusMinuten(z.soll.ende) : ''; },
    soll_pause:     function (z) { return z.soll ? (z.soll.pause || 0) : ''; },
    neu_von:        function (z) { return endgueltig(z).beginn === null ? '' : zeitAusMinuten(endgueltig(z).beginn); },
    neu_bis:        function (z) { return endgueltig(z).beginn === null ? '' : zeitAusMinuten(endgueltig(z).ende); },
    pause:          function (z) { return endgueltig(z).beginn === null ? '' : (endgueltig(z).pause || 0); },
    stunden:        function (z) {
      var n = nettoVon(z);
      return n === null ? '' : (n / 60).toFixed(2).replace('.', ',');
    },
    stunden_punkt:  function (z) {
      var n = nettoVon(z);
      return n === null ? '' : (n / 60).toFixed(2);
    },
    minuten:        function (z) { var n = nettoVon(z); return n === null ? '' : n; },
    differenz:      function (z) {
      if (z.diffDauer === null || z.diffDauer === undefined || z.status === 'passt') return '';
      return (z.diffDauer > 0 ? '+' : '') + Math.round(z.diffDauer) + ' min';
    },
    format:         function (z) { return z.format || ''; },
    status:         function (z) { return z.status; },
    notiz:          function (z) { return z.notiz || ''; },
    hinweis:        function (z) { return hinweisZu(z); }
  };

  function endgueltig(z) {
    return (z.status === 'fehlt' || z.status === 'ausfall')
      ? { beginn: null, ende: null, pause: 0 } : z.vorschlag;
  }

  function nettoVon(z) {
    var e = endgueltig(z);
    if (e.beginn === null) return null;
    return dauer(e.beginn, e.ende) - (e.pause || 0);
  }

  var ERGEBNIS_SPALTEN = [
    ['Aenderung', 'aenderung'], ['Datum', 'datum'], ['Mitarbeiter', 'mitarbeiter'],
    ['Personalnummer', 'personalnummer'], ['Planung', 'planung'], ['Funktion', 'funktion'],
    ['Geplant von', 'soll_von'], ['Geplant bis', 'soll_bis'],
    ['Neu von', 'neu_von'], ['Neu bis', 'neu_bis'], ['Pause min', 'pause'],
    ['Stunden neu', 'stunden'], ['Differenz', 'differenz'], ['Format', 'format'],
    ['Hinweis', 'hinweis']
  ];

  function ergebnisCsv(zeilen, optionen) {
    optionen = optionen || {};
    var trenner = optionen.trenner || ';';
    var spalten = (optionen.spalten && optionen.spalten.length) ? optionen.spalten : ERGEBNIS_SPALTEN;
    var liste = ergebnisZeilen(zeilen, optionen.nurAenderungen);

    var raus = [spalten.map(function (s) { return s[0]; }).join(trenner)];
    liste.forEach(function (z) {
      raus.push(spalten.map(function (s) {
        var holen = ERGEBNIS_FELDER[s[1]];
        var w = holen ? holen(z) : '';
        var t = String(w === undefined || w === null ? '' : w);
        return /["\r\n]/.test(t) || t.indexOf(trenner) >= 0 ? '"' + t.replace(/"/g, '""') + '"' : t;
      }).join(trenner));
    });
    return raus.join('\r\n') + '\r\n';
  }

  /* Alles, was jemand beim Nacharbeiten wissen muss — und sonst nichts. */
  function hinweisZu(z) {
    var teile = [];
    if (z.notiz) teile.push(z.notiz);
    if (z.ist && z.ist.teile && z.ist.teile.length > 1) {
      teile.push('Zettel in ' + z.ist.teile.length + ' Zeilen: ' + z.ist.teile.map(function (t) {
        return zeitAusMinuten(t.beginn) + '-' + zeitAusMinuten(t.ende) + (t.format ? ' ' + t.format : '');
      }).join(', '));
    }
    if (z.ist && z.ist.stundenLaut && z.vorschlag && z.vorschlag.beginn !== null) {
      var gerechnet = (dauer(z.vorschlag.beginn, z.vorschlag.ende) - (z.vorschlag.pause || 0)) / 60;
      if (Math.abs(gerechnet - z.ist.stundenLaut) > 0.26) {
        teile.push('Zettel nennt ' + String(z.ist.stundenLaut).replace('.', ',') +
                   ' h, gerechnet ' + gerechnet.toFixed(2).replace('.', ',') + ' h');
      }
    }
    if (z.zuordnung && z.zuordnung.grund === 'vorschlag') teile.push('Name nur aehnlich - bitte pruefen');
    if (z.ist && z.ist.quelle === 'ocr') teile.push('aus Foto gelesen');
    return teile.join(' | ');
  }

  /* Freigegebene Zeilen als CSV — der Weg, der ohne jede
     Automatisierung funktioniert: Datei erzeugen, in secplan
     importieren oder an die Lohnbuchhaltung weiterreichen. */
  function csvSchreiben(zeilen, optionen) {
    optionen = optionen || {};
    var trenner = optionen.trenner || ';';
    var spalten = optionen.spalten || [
      ['Datum', function (z) { return z.datum ? datumDeutsch(z.datum).slice(4) : ''; }],
      ['Personalnummer', function (z) { return z.person && z.person.personalnummer || ''; }],
      ['Mitarbeiter', function (z) { return z.name; }],
      ['Einsatz', function (z) { return z.einsatz; }],
      ['SchichtID', function (z) { return z.schichtId || ''; }],
      ['Beginn', function (z) { return zeitAusMinuten(z.vorschlag.beginn); }],
      ['Ende', function (z) { return zeitAusMinuten(z.vorschlag.ende); }],
      ['Pause', function (z) { return z.vorschlag.pause || 0; }],
      ['Stunden', function (z) {
        var netto = dauer(z.vorschlag.beginn, z.vorschlag.ende) - (z.vorschlag.pause || 0);
        return (netto / 60).toFixed(2).replace('.', ',');
      }],
      ['Status', function (z) { return z.status; }],
      ['Notiz', function (z) { return z.notiz || ''; }]
    ];
    var raus = [spalten.map(function (s) { return s[0]; }).join(trenner)];
    zeilen.forEach(function (z) {
      if (z.status === 'ausfall') return;
      if (z.status === 'fehlt' && !z.freigegeben) return;
      raus.push(spalten.map(function (s) {
        var w = String(s[1](z) === undefined ? '' : s[1](z));
        return /[";\n]/.test(w) ? '"' + w.replace(/"/g, '""') + '"' : w;
      }).join(trenner));
    });
    return raus.join('\r\n') + '\r\n';
  }

  /* Was an die Bruecke geht, wenn jemand freigibt. Bewusst schmal:
     nur Schicht, Zeiten und wer es war. */
  function freigabePaket(zeilen, datum, bearbeiter) {
    return {
      datum: datum,
      bearbeiter: bearbeiter || '',
      erzeugt: new Date().toISOString(),
      schichten: zeilen.filter(function (z) {
        return z.freigegeben && z.status !== 'fehlt' && z.status !== 'ausfall' &&
               z.vorschlag.beginn !== null;
      }).map(function (z) {
        return {
          schichtId: z.schichtId,
          mitarbeiterId: z.person ? z.person.id : null,
          personalnummer: z.person ? z.person.personalnummer || '' : '',
          name: z.name,
          // So steht der Name in secplan — danach wird dort gesucht.
          nameSecplan: (z.person && z.person.nachnameZuerst) || z.name,
          datum: z.datum,
          einsatz: z.einsatz,
          // Die geplanten Zeiten fahren mit: an ihnen erkennt die Bruecke
          // in der Schichtmaske, welches Feld der Beginn und welches das
          // Ende ist — verlaesslicher als jeder Feldname.
          geplantBeginn: z.soll ? zeitAusMinuten(z.soll.beginn) : '',
          geplantEnde: z.soll ? zeitAusMinuten(z.soll.ende) : '',
          geplantPause: z.soll ? (z.soll.pause || 0) : 0,
          beginn: zeitAusMinuten(z.vorschlag.beginn),
          ende: zeitAusMinuten(z.vorschlag.ende),
          pause: z.vorschlag.pause || 0,
          unveraendert: z.status === 'passt',
          status: z.status,
          neu: !z.schichtId,
          notiz: z.notiz || ''
        };
      }),
      ausfaelle: zeilen.filter(function (z) { return z.status === 'ausfall' && z.freigegeben; })
        .map(function (z) {
          return { schichtId: z.schichtId, name: z.name, datum: z.datum,
                   grund: z.notiz || 'nicht erschienen' };
        })
    };
  }

  /* ============================================================
     6 — Konflikte
     ------------------------------------------------------------
     Der Abgleich sagt, ob Plan und Zettel zusammenpassen. Das ist
     nicht dasselbe wie: ob das Ergebnis in Ordnung ist. Jemand kann
     genau wie geplant vierzehn Stunden gearbeitet haben — dann
     stimmt der Abgleich und das Arbeitszeitgesetz nicht.

     Geprueft wird deshalb zusaetzlich das Ergebnis: Ueberschneidungen,
     Hoechstarbeitszeit (§ 3 ArbZG), Ruhezeit (§ 5), Pausen (§ 4) und
     was schlicht unplausibel ist. Alles als Hinweis mit Paragraph —
     entschieden wird im Buero, nicht hier.
     ============================================================ */

  var ARBZG = {
    hoechstStunden: 10,      // § 3: werktaeglich 8 h, verlaengerbar auf 10 h
    ruheStunden: 11,         // § 5: 11 Stunden ununterbrochene Ruhezeit
    pauseAb6: 30,            // § 4: mehr als 6 h -> 30 min
    pauseAb9: 45,            // § 4: mehr als 9 h -> 45 min
    unplausibelStunden: 16
  };

  /* Ein Zeitpunkt auf einem durchgehenden Strahl: Tagesnummer * 1440
     + Minuten. Damit lassen sich Schichten ueber Tage hinweg
     vergleichen, ohne mit Datum und Uhrzeit zu jonglieren. */
  function zeitpunkt(datum, minuten) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(datum || ''));
    if (!m) return null;
    var tag = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000;
    return tag * 1440 + minuten;
  }

  function spanneVon(zeile) {
    if (!zeile.vorschlag || zeile.vorschlag.beginn === null) return null;
    var von = zeitpunkt(zeile.datum, zeile.vorschlag.beginn);
    if (von === null) return null;
    return { von: von, bis: von + dauer(zeile.vorschlag.beginn, zeile.vorschlag.ende),
             netto: dauer(zeile.vorschlag.beginn, zeile.vorschlag.ende) - (zeile.vorschlag.pause || 0) };
  }

  /* zeilen:    das Ergebnis des Abgleichs (ein Tag)
     umgebung:  weitere bekannte Schichten derselben Leute (Vor- und
                Folgetag), damit die Ruhezeit ueberhaupt pruefbar ist */
  function konflikte(zeilen, regeln, umgebung) {
    var r = regelnMitStandard(regeln);
    var grenzen = Object.assign({}, ARBZG, r.arbzg || {});
    var aus = [];

    function melden(art, schwere, text, ids, paragraf) {
      aus.push({ art: art, schwere: schwere, text: text, zeilen: ids || [], paragraf: paragraf || '' });
    }

    var offen = zeilen.filter(function (z) {
      return z.status !== 'ausfall' && z.vorschlag && z.vorschlag.beginn !== null;
    });
    var ohnePause = [];

    // ---- je Schicht ----
    offen.forEach(function (z) {
      var s = spanneVon(z);
      var netto = s ? s.netto : (dauer(z.vorschlag.beginn, z.vorschlag.ende) - (z.vorschlag.pause || 0));
      var brutto = dauer(z.vorschlag.beginn, z.vorschlag.ende);

      if (netto > grenzen.unplausibelStunden * 60 || netto < 0) {
        melden('unplausibel', 'fehler',
          z.name + ': ' + stundenText(netto) + ' am Stueck — das ist vermutlich ein Lesefehler.',
          [z.id]);
        return;
      }
      if (netto > grenzen.hoechstStunden * 60) {
        melden('hoechstarbeitszeit', 'warnung',
          z.name + ': ' + stundenText(netto) + ' Arbeitszeit. Zulaessig sind ' +
          grenzen.hoechstStunden + ' Stunden.', [z.id], '§ 3 ArbZG');
      }
      var noetig = brutto > 9 * 60 ? grenzen.pauseAb9 : brutto > 6 * 60 ? grenzen.pauseAb6 : 0;
      if (!noetig) return;

      // "Keine Pause eingetragen" ist nicht dasselbe wie "keine Pause
      // gemacht". Die Abgleichliste aus secplan fuehrt gar keine
      // Pausenspalte — daraus jede Schicht anzumahnen waere Laerm,
      // durch den man die echten Faelle nicht mehr sieht.
      var bekannt = (z.ist && typeof z.ist.pause === 'number') ||
                    (z.soll && !z.soll.pauseUnbekannt) ||
                    r.pauseAutomatisch;
      if (!bekannt) { ohnePause.push(z.id); return; }

      if ((z.vorschlag.pause || 0) < noetig) {
        melden('pause', 'warnung',
          z.name + ': ' + stundenText(brutto) + ' vor Ort, aber nur ' + (z.vorschlag.pause || 0) +
          ' min Pause. Vorgeschrieben sind ' + noetig + ' min.', [z.id], '§ 4 ArbZG');
      }
    });

    if (ohnePause.length) {
      melden('pause_unbekannt', 'hinweis',
        'Bei ' + ohnePause.length + ' Schichten steht in den Daten keine Pause. ' +
        'Ob § 4 ArbZG eingehalten ist, l\u00e4sst sich so nicht sagen — die Pausenspalte ' +
        'des Stundenzettels oder die Regel \u201ePause automatisch erg\u00e4nzen\u201c schafft Klarheit.',
        ohnePause, '§ 4 ArbZG');
    }

    // ---- je Person: Ueberschneidung und Ruhezeit ----
    var proPerson = {};
    offen.forEach(function (z) {
      if (!z.person) return;
      (proPerson[z.person.id] = proPerson[z.person.id] || []).push({ zeile: z, spanne: spanneVon(z) });
    });
    (umgebung || []).forEach(function (s) {
      var id = s.mitarbeiter ? s.mitarbeiter.id : s.mitarbeiterId;
      if (!id || !proPerson[id]) return;
      var von = zeitpunkt(s.datum, s.beginn);
      if (von === null) return;
      proPerson[id].push({
        zeile: { id: null, name: s.mitarbeiter ? s.mitarbeiter.name : '', datum: s.datum, geplant: true },
        spanne: { von: von, bis: von + dauer(s.beginn, s.ende), netto: 0 }
      });
    });

    Object.keys(proPerson).forEach(function (id) {
      var liste = proPerson[id].filter(function (e) { return e.spanne; })
        .sort(function (a, b) { return a.spanne.von - b.spanne.von; });

      for (var i = 1; i < liste.length; i++) {
        var vorher = liste[i - 1], jetzt = liste[i];
        if (vorher.zeile.geplant && jetzt.zeile.geplant) continue;

        if (jetzt.spanne.von < vorher.spanne.bis) {
          melden('ueberschneidung', 'fehler',
            (jetzt.zeile.name || vorher.zeile.name) + ': zwei Schichten ueberschneiden sich (' +
            datumDeutsch(vorher.zeile.datum) + ' ' + zeitAusMinuten(vorher.spanne.von % 1440) + '–' +
            zeitAusMinuten(vorher.spanne.bis % 1440) + ' und ' +
            datumDeutsch(jetzt.zeile.datum) + ' ' + zeitAusMinuten(jetzt.spanne.von % 1440) + '–' +
            zeitAusMinuten(jetzt.spanne.bis % 1440) + ').',
            [vorher.zeile.id, jetzt.zeile.id].filter(Boolean));
          continue;
        }
        var ruhe = jetzt.spanne.von - vorher.spanne.bis;
        if (ruhe < grenzen.ruheStunden * 60) {
          melden('ruhezeit', 'warnung',
            (jetzt.zeile.name || vorher.zeile.name) + ': nur ' + stundenText(ruhe) +
            ' zwischen den Schichten am ' + datumDeutsch(vorher.zeile.datum) + ' und ' +
            datumDeutsch(jetzt.zeile.datum) + '. Vorgeschrieben sind ' + grenzen.ruheStunden + ' Stunden.',
            [vorher.zeile.id, jetzt.zeile.id].filter(Boolean), '§ 5 ArbZG');
        }
      }
    });

    // ---- Zettel doppelt eingelesen ----
    var gesehen = {};
    zeilen.forEach(function (z) {
      if (!z.ist || z.vorschlag.beginn === null) return;
      var schluessel = normalisiere(z.name) + '|' + z.datum + '|' + z.ist.beginn + '|' + z.ist.ende;
      if (gesehen[schluessel]) {
        melden('doppelt', 'warnung',
          z.name + ': dieselbe Zeit steht zweimal in der Liste (' +
          zeitAusMinuten(z.ist.beginn) + '–' + zeitAusMinuten(z.ist.ende) +
          '). Wurde der Zettel zweimal eingelesen?', [gesehen[schluessel], z.id]);
      } else {
        gesehen[schluessel] = z.id;
      }
    });

    var rang = { fehler: 0, warnung: 1, hinweis: 2 };
    aus.sort(function (a, b) { return rang[a.schwere] - rang[b.schwere]; });
    return aus;
  }

  /* ============================================================
     7 — Sprache
     ------------------------------------------------------------
     Im Buero liegt der Zettel links, die Maus rechts, und zwischen
     beidem sitzt jemand, der vorlesen koennte statt zu tippen:

       "Kanopka von acht Uhr dreissig bis siebzehn Uhr fuenfzehn"
       "Fett Ende achtzehn Uhr fuenfundvierzig"
       "Botis Ausfall"
       "Schmedding wie geplant"
       "Pause dreissig Minuten fuer Mustermann"

     Hier steht nur das Verstehen des Satzes — reiner Text rein,
     Anweisung raus. Wo der Text herkommt (Mikrofon, Tastatur,
     Diktiergeraet), ist dieser Datei gleichgueltig, und genau
     deshalb laesst sie sich pruefen.
     ============================================================ */

  var ZAHLWORT = {
    null: 0, eins: 1, ein: 1, eine: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fuenf: 5,
    sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwoelf: 12,
    dreizehn: 13, vierzehn: 14, fuenfzehn: 15, sechzehn: 16, siebzehn: 17,
    achtzehn: 18, neunzehn: 19, zwanzig: 20, dreissig: 30, vierzig: 40, fuenfzig: 50
  };

  function zahlAusWort(wort) {
    var w = normalisiere(wort);
    if (!w) return null;
    if (/^\d{1,2}$/.test(w)) return +w;
    if (ZAHLWORT[w] !== undefined) return ZAHLWORT[w];
    var m = /^(\w+?)und(zwanzig|dreissig|vierzig|fuenfzig)$/.exec(w);
    if (m && ZAHLWORT[m[1]] !== undefined && ZAHLWORT[m[2]] !== undefined) {
      return ZAHLWORT[m[2]] + ZAHLWORT[m[1]];
    }
    return null;
  }

  /* Findet die erste Zeitangabe in einem gesprochenen Satz und gibt
     zurueck, wo sie stand — der Rest ist dann der Name oder der Befehl. */
  function zeitAusSprache(text) {
    var worte = normalisiere(text).split(' ').filter(Boolean);

    for (var i = 0; i < worte.length; i++) {
      // "halb acht" = 7:30 — im Alltag haeufig, in Zeitlisten selten,
      // aber wer spricht, sagt es nun mal so.
      if (worte[i] === 'halb') {
        var h = zahlAusWort(worte[i + 1]);
        if (h !== null) {
          var std = (h - 1 + 24) % 24;
          return { minuten: std * 60 + 30, von: i, bis: i + 1 };
        }
      }

      var erste = zahlAusWort(worte[i]);
      if (erste === null) continue;

      // "18:45", "1845" wurden schon von minutenAusZeit erkannt
      var direkt = minutenAusZeit(worte[i]);
      if (direkt !== null && /[:.]/.test(worte[i])) return { minuten: direkt, von: i, bis: i };

      if (erste > 23) continue;

      var j = i;
      var minute = 0;
      if (normalisiere(worte[i + 1] || '') === 'uhr') j = i + 1;
      var naechste = zahlAusWort(worte[j + 1]);
      if (naechste !== null && naechste <= 59 && (j > i || naechste >= 10)) {
        minute = naechste;
        j = j + 1;
      }
      return { minuten: erste * 60 + minute, von: i, bis: j };
    }
    return null;
  }

  var BEFEHL = [
    { art: 'ausfall',    muster: /\b(ausfall|nicht da|nicht erschienen|krank|abgesagt|fehlt)\b/ },
    { art: 'wieGeplant', muster: /\b(wie geplant|planmaessig|planmassig|passt|war da|unveraendert)\b/ },
    { art: 'zuruecknehmen', muster: /\b(zurueck|zuruecknehmen|rueckgaengig|doch nicht)\b/ }
  ];
  // Dieselben Woerter noch einmal, um sie aus dem Satz zu streichen —
  // sonst sucht die Namenszuordnung spaeter nach "Sanchez Ausfall".
  var BEFEHLSWOERTER = /\b(ausfall|nicht da|nicht erschienen|krank|abgesagt|fehlt|wie geplant|planmaessig|planmassig|passt|war da|unveraendert|zurueck|zuruecknehmen|rueckgaengig|doch nicht)\b/g;

  /* text:     was gesprochen wurde
     personen: Stammdaten, damit der Name zugeordnet werden kann
     Ergebnis: { art, person, beginn, ende, pause, rest, verstanden } */
  function sprachbefehlLesen(text, personen, aliase) {
    var roh = String(text || '').trim();
    var flach = normalisiere(roh);
    if (!flach) return { art: 'leer', verstanden: false, text: roh };

    var ergebnis = { art: null, person: null, beginn: null, ende: null, pause: null,
                     text: roh, verstanden: false };

    // Pause zuerst: "pause dreissig minuten". Das erkannte Stueck wird
    // aus dem Satz genommen, damit es nicht spaeter als Name gilt.
    var worte = flach.split(' ').filter(Boolean);
    var pi = worte.indexOf('pause');
    if (pi >= 0) {
      for (var i = pi + 1; i < Math.min(worte.length, pi + 4); i++) {
        var z = zahlAusWort(worte[i]);
        if (z !== null) { ergebnis.pause = z; worte.splice(i, 1); break; }
      }
      if (ergebnis.pause !== null) { ergebnis.art = 'pause'; worte.splice(pi, 1); }
    }
    flach = worte.join(' ');

    for (var b = 0; b < BEFEHL.length; b++) {
      if (BEFEHL[b].muster.test(flach)) { ergebnis.art = BEFEHL[b].art; break; }
    }
    flach = flach.replace(BEFEHLSWOERTER, ' ').replace(/\s+/g, ' ').trim();

    // Zeiten: bis zu zwei, in der Reihenfolge Beginn, Ende.
    // "ende achtzehn uhr" setzt nur das Ende.
    if (!ergebnis.art || ergebnis.art === 'pause') {
      var nurEnde = /\b(ende|bis|schluss|geht|feierabend)\b/.test(flach) &&
                    !/\b(von|beginn|start|ab|kommt|angefangen)\b/.test(flach);
      var nurBeginn = /\b(beginn|start|angefangen|gekommen)\b/.test(flach) &&
                      !/\b(bis|ende|schluss)\b/.test(flach);

      var rest = flach;
      var zeiten = [];
      for (var n = 0; n < 2; n++) {
        var t = zeitAusSprache(rest);
        if (!t) break;
        zeiten.push(t.minuten);
        var w = rest.split(' ');
        w.splice(t.von, t.bis - t.von + 1);
        rest = w.join(' ');
      }
      if (zeiten.length === 2) { ergebnis.beginn = zeiten[0]; ergebnis.ende = zeiten[1]; ergebnis.art = 'zeit'; }
      else if (zeiten.length === 1) {
        if (nurEnde) ergebnis.ende = zeiten[0];
        else if (nurBeginn) ergebnis.beginn = zeiten[0];
        else ergebnis.beginn = zeiten[0];
        ergebnis.art = ergebnis.art === 'pause' ? 'pause' : 'zeit';
      }
      flach = rest;
    }

    // Was uebrig bleibt, ohne Fuellwoerter, ist der Name.
    var namenstext = flach
      .replace(/\b(von|bis|uhr|ende|beginn|start|schluss|geht|kommt|ab|fuer|der|die|das|herr|frau|minuten|minute|pause|und|dann|bitte|auf|setzen|eintragen|hat|ist|war|halb)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();

    if (namenstext && personen && personen.length) {
      var treffer = zuordnen(namenstext, personen, aliase);
      if (treffer.person) {
        ergebnis.person = treffer.person;
        ergebnis.zuordnung = treffer;
      } else {
        ergebnis.zuordnung = treffer;
      }
    }
    ergebnis.name = namenstext;
    ergebnis.verstanden = !!(ergebnis.person && ergebnis.art);
    return ergebnis;
  }

  return {
    // Zeit
    minutenAusZeit: minutenAusZeit, zeitAusMinuten: zeitAusMinuten, dauer: dauer,
    runden: runden, pauseNachGesetz: pauseNachGesetz, nachtMinuten: nachtMinuten,
    stundenText: stundenText, kuerzesteDifferenz: kuerzesteDifferenz,
    heuteIso: heuteIso, datumDeutsch: datumDeutsch, datumAusText: datumAusText,
    // Namen
    normalisiere: normalisiere, namensAehnlichkeit: namensAehnlichkeit, zuordnen: zuordnen,
    // Listen
    zeitlisteLesen: zeitlisteLesen, csvLesen: csvLesen, sollAusCsv: sollAusCsv,
    csvSchreiben: csvSchreiben, secplanAbgleichLesen: secplanAbgleichLesen,
    personAusSecplan: personAusSecplan,
    // Ergebnis
    ergebnisCsv: ergebnisCsv, ergebnisZeilen: ergebnisZeilen, AENDERUNG: AENDERUNG,
    ERGEBNIS_SPALTEN: ERGEBNIS_SPALTEN, ERGEBNIS_FELDER: ERGEBNIS_FELDER,
    // Abgleich
    bewerten: bewerten, abgleichen: abgleichen, kennzahlen: kennzahlen,
    bloeckeBilden: bloeckeBilden,
    // Konflikte und Sprache
    konflikte: konflikte, ARBZG: ARBZG, zeitpunkt: zeitpunkt,
    sprachbefehlLesen: sprachbefehlLesen, zeitAusSprache: zeitAusSprache, zahlAusWort: zahlAusWort,
    freigabePaket: freigabePaket, regelnMitStandard: regelnMitStandard,
    REGELN_STANDARD: REGELN_STANDARD, SCHWELLEN: { SICHER: SICHER, VORSCHLAG: VORSCHLAG }
  };
})();
