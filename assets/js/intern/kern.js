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
  var KOPF_BEMERK = /^(bemerk|hinweis|notiz|kommentar|position|funktion)/i;

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
      else if (karte.bemerkung === undefined && KOPF_BEMERK.test(t)) karte.bemerkung = i;
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

    var pause = null;
    var pm = restNachher.match(/(\d{1,3})\s*(?:min|')?\b/);
    if (pm && +pm[1] <= 180) pause = +pm[1];

    var name = restVorher.replace(/^\s*\d+[.)]\s*/, '').replace(/[;,|]\s*$/, '').trim();
    if (!name) return null;

    return { rohname: name, beginn: beginn, ende: ende, pause: pause,
             datum: datumInZeile,
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
      ergebnis.push(satz);
    });

    return { zeilen: ergebnis, verworfen: verworfen, datum: datumGlobal, trenner: trenner };
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
    maxAbweichungMin: 240   // darueber: Verdacht auf Lesefehler, nie automatisch
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

    var status;
    if (Math.abs(dB) > r.maxAbweichungMin || Math.abs(dE) > r.maxAbweichungMin) {
      status = 'pruefen';
    } else if (Math.abs(dB) <= r.toleranzMin && Math.abs(dE) <= r.toleranzMin) {
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

  /* Ist-Zeilen den geplanten Schichten zuordnen und alles bewerten.
     sollListe: Schichten aus secplan (ein Tag)
     istListe:  Zeilen aus der Zeitliste / Schnellerfassung
     personen:  Stammdaten fuer die Namenszuordnung          */
  function abgleichen(sollListe, istListe, personen, regeln, aliase) {
    var r = regelnMitStandard(regeln);
    personen = personen || ableitenPersonen(sollListe);
    var offen = (sollListe || []).map(function (s, i) {
      return { soll: s, index: i, belegt: false };
    });
    var zeilen = [];

    (istListe || []).forEach(function (ist) {
      var z = zuordnen(ist.personalnummer ? (ist.rohname + ' ' + ist.personalnummer) : ist.rohname,
                       personen, aliase);
      var person = z.person;

      if (!person) {
        zeilen.push(bauZeile(null, ist, {
          status: 'unklar', beginn: ist.beginn, ende: ist.ende, pause: ist.pause || 0,
          diffBeginn: null, diffEnde: null, diffDauer: null
        }, z));
        return;
      }

      // Passende geplante Schicht: gleiche Person, gleicher Tag,
      // bei mehreren die mit dem naechstliegenden Beginn.
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
                           bewerten(passend ? passend.soll : null, ist, r), z));
    });

    // Was uebrig bleibt, wurde geplant aber nicht abgehakt.
    offen.forEach(function (o) {
      if (o.belegt) return;
      zeilen.push(bauZeile(o.soll, null, bewerten(o.soll, null, r), null));
    });

    zeilen.sort(function (a, b) {
      var rang = { unklar: 0, pruefen: 1, fehlt: 2, zusatz: 3, abweichung: 4, passt: 5 };
      var d = (rang[a.status] === undefined ? 9 : rang[a.status]) -
              (rang[b.status] === undefined ? 9 : rang[b.status]);
      if (d) return d;
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
      einsatz: soll ? (soll.einsatz || soll.objekt || '') : (ist && ist.bemerkung) || '',
      schichtId: soll ? (soll.id || null) : null,
      soll: soll ? { beginn: soll.beginn, ende: soll.ende, pause: soll.pause || 0 } : null,
      ist: ist ? { beginn: ist.beginn, ende: ist.ende, pause: ist.pause,
                   quelle: ist.quelle, zeile: ist.zeile, rohtext: ist.rohtext || '' } : null,
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
              unklar: 0, pruefen: 0, freigegeben: 0,
              sollMinuten: 0, istMinuten: 0 };
    zeilen.forEach(function (z) {
      if (k[z.status] !== undefined) k[z.status]++;
      if (z.freigegeben) k.freigegeben++;
      if (z.soll) k.sollMinuten += Math.max(0, dauer(z.soll.beginn, z.soll.ende) - (z.soll.pause || 0));
      if (z.vorschlag && z.vorschlag.beginn !== null && z.status !== 'fehlt') {
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
      aus.push({
        id: ersterWert(s, ['schichtid', 'id', 'dienstid', 'einsatzid']) || ('s' + i),
        datum: datumAusText(ersterWert(s, ['datum', 'tag', 'einsatztag'])) || null,
        einsatz: ersterWert(s, ['einsatz', 'objekt', 'veranstaltung', 'auftrag', 'kunde', 'einsatzort']) || '',
        bereich: ersterWert(s, ['bereich', 'sparte', 'taetigkeit', 'position', 'funktion']) || '',
        mitarbeiter: { id: nummer || ('p' + normalisiere(name).replace(/ /g, '-')),
                       name: name, personalnummer: nummer || '' },
        beginn: minutenAusZeit(von),
        ende: minutenAusZeit(bis),
        pause: zahlOderNull(ersterWert(s, ['pause', 'pausemin', 'pauseminuten'])) || 0
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
        return z.freigegeben && z.status !== 'fehlt' && z.vorschlag.beginn !== null;
      }).map(function (z) {
        return {
          schichtId: z.schichtId,
          mitarbeiterId: z.person ? z.person.id : null,
          personalnummer: z.person ? z.person.personalnummer || '' : '',
          name: z.name,
          datum: z.datum,
          einsatz: z.einsatz,
          beginn: zeitAusMinuten(z.vorschlag.beginn),
          ende: zeitAusMinuten(z.vorschlag.ende),
          pause: z.vorschlag.pause || 0,
          status: z.status,
          neu: !z.schichtId,
          notiz: z.notiz || ''
        };
      }),
      ausfaelle: zeilen.filter(function (z) { return z.status === 'fehlt' && z.freigegeben; })
        .map(function (z) {
          return { schichtId: z.schichtId, name: z.name, datum: z.datum,
                   grund: z.notiz || 'nicht erschienen' };
        })
    };
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
    csvSchreiben: csvSchreiben,
    // Abgleich
    bewerten: bewerten, abgleichen: abgleichen, kennzahlen: kennzahlen,
    freigabePaket: freigabePaket, regelnMitStandard: regelnMitStandard,
    REGELN_STANDARD: REGELN_STANDARD, SCHWELLEN: { SICHER: SICHER, VORSCHLAG: VORSCHLAG }
  };
})();
