/* ============================================================
   HERM SERVICE TEAM — PDF lesen
   ------------------------------------------------------------
   Die Abgleichliste kommt aus secplan als PDF. Sie enthaelt
   echten Text, kein Bild — man muss ihn nur herausholen.

   Diese Datei tut genau das und nichts weiter: Streams
   entpacken, Textoperatoren einsammeln, Stuecke mit ihrer
   Position auf der Seite zurueckgeben. Daraus baut kern.js
   die Tabelle wieder zusammen.

   Bewusst ohne fremde Bibliothek:
   - im Browser waeren das mehrere Megabyte fuer eine Aufgabe,
     die hier sechzig Zeilen braucht,
   - auf dem Buerorechner muesste jemand sie installieren,
   - und das Entpacken kann beides von Haus aus
     (DecompressionStream gibt es im Browser wie in Node).

   Grenze: gescannte PDF haben keinen Text. Kommt nichts
   heraus, faellt die Oberflaeche auf die Texterkennung zurueck.
   ============================================================ */
globalThis.HSTPdf = (function () {
  'use strict';

  function istPdf(puffer) {
    var b = new Uint8Array(puffer);
    return b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
  }

  /* ---- Streams finden -------------------------------------- */
  function suche(daten, muster, ab) {
    aussen: for (var i = ab; i <= daten.length - muster.length; i++) {
      for (var j = 0; j < muster.length; j++) if (daten[i + j] !== muster[j]) continue aussen;
      return i;
    }
    return -1;
  }

  function alsBytes(text) {
    var b = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i++) b[i] = text.charCodeAt(i);
    return b;
  }

  var STREAM = alsBytes('stream');
  var ENDSTREAM = alsBytes('endstream');

  function streamsSammeln(daten) {
    var aus = [], stelle = 0;
    while (true) {
      var a = suche(daten, STREAM, stelle);
      if (a < 0) break;
      var anfang = a + STREAM.length;
      if (daten[anfang] === 0x0d) anfang++;
      if (daten[anfang] === 0x0a) anfang++;
      var e = suche(daten, ENDSTREAM, anfang);
      if (e < 0) break;
      var ende = e;
      while (ende > anfang && (daten[ende - 1] === 0x0a || daten[ende - 1] === 0x0d)) ende--;
      aus.push(daten.subarray(anfang, ende));
      stelle = e + ENDSTREAM.length;
    }
    return aus;
  }

  /* ---- Entpacken (zlib, wie PDF es benutzt) ------------------ */
  async function entpacken(roh) {
    if (typeof DecompressionStream === 'undefined') return null;
    for (var art of ['deflate', 'deflate-raw']) {
      try {
        var strom = new Blob([roh]).stream().pipeThrough(new DecompressionStream(art));
        var puffer = await new Response(strom).arrayBuffer();
        return new Uint8Array(puffer);
      } catch (f) { /* naechste Art versuchen */ }
    }
    return null;
  }

  /* ---- Bytes zu Text (WinAnsi, wie TCPDF es schreibt) -------- */
  var WINANSI = {
    0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
    0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š',
    0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’',
    0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
    0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ', 0x9E: 'ž',
    0x9F: 'Ÿ'
  };

  function zuText(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      var c = bytes[i];
      s += (c >= 0x80 && c <= 0x9f && WINANSI[c]) ? WINANSI[c] : String.fromCharCode(c);
    }
    return s;
  }

  /* ---- Textoperatoren lesen ---------------------------------
     Verfolgt wird nur, was fuer eine Tabelle noetig ist: wo der
     Text anfaengt (Td/TD/Tm) und was dort steht (Tj/TJ).      */
  function stueckeAusInhalt(inhalt, seite) {
    var aus = [];
    var x = 0, y = 0;
    var i = 0, n = inhalt.length;
    var zahlen = [];

    function zahlLesen() {
      var anfang = i;
      while (i < n && /[-+0-9.]/.test(inhalt[i])) i++;
      var w = parseFloat(inhalt.slice(anfang, i));
      return isFinite(w) ? w : 0;
    }

    function zeichenketteLesen() {
      // ( … ) mit Klammerschachtelung und Rueckwaertsschraegstrich
      var tiefe = 1, text = '';
      i++;
      while (i < n && tiefe > 0) {
        var c = inhalt[i];
        if (c === '\\') {
          var d = inhalt[i + 1];
          if (d === 'n') text += '\n';
          else if (d === 'r') text += '\r';
          else if (d === 't') text += '\t';
          else if (d === 'b' || d === 'f') text += ' ';
          else if (d >= '0' && d <= '7') {
            var oktal = '';
            var k = i + 1;
            while (k < n && oktal.length < 3 && inhalt[k] >= '0' && inhalt[k] <= '7') { oktal += inhalt[k]; k++; }
            var code = parseInt(oktal, 8);
            text += (code >= 0x80 && code <= 0x9f && WINANSI[code]) ? WINANSI[code] : String.fromCharCode(code);
            i = k;
            continue;
          } else text += d;
          i += 2;
          continue;
        }
        if (c === '(') tiefe++;
        if (c === ')') { tiefe--; if (!tiefe) { i++; break; } }
        text += c;
        i++;
      }
      return text;
    }

    function hexLesen() {
      var anfang = ++i;
      while (i < n && inhalt[i] !== '>') i++;
      var roh = inhalt.slice(anfang, i).replace(/\s+/g, '');
      i++;
      var text = '';
      for (var k = 0; k + 1 < roh.length; k += 2) text += String.fromCharCode(parseInt(roh.substr(k, 2), 16));
      return text;
    }

    while (i < n) {
      var c = inhalt[i];

      if (c === '(') { zahlen.push({ text: zeichenketteLesen() }); continue; }
      if (c === '<' && inhalt[i + 1] !== '<') { zahlen.push({ text: hexLesen() }); continue; }
      if (/[-+0-9.]/.test(c)) { zahlen.push({ zahl: zahlLesen() }); continue; }
      if (c === '[' || c === ']') { i++; continue; }

      if (/[A-Za-z'"*]/.test(c)) {
        var anfang = i;
        while (i < n && /[A-Za-z0-9'"*]/.test(inhalt[i])) i++;
        var befehl = inhalt.slice(anfang, i);

        if (befehl === 'Td' || befehl === 'TD') {
          var werte = zahlen.filter(function (z) { return z.zahl !== undefined; });
          if (werte.length >= 2) {
            x = werte[werte.length - 2].zahl;
            y = werte[werte.length - 1].zahl;
          }
        } else if (befehl === 'Tm') {
          var w2 = zahlen.filter(function (z) { return z.zahl !== undefined; });
          if (w2.length >= 6) {
            x = w2[w2.length - 2].zahl;
            y = w2[w2.length - 1].zahl;
          }
        } else if (befehl === 'Tj' || befehl === 'TJ' || befehl === "'" || befehl === '"') {
          var text = zahlen.filter(function (z) { return z.text !== undefined; })
            .map(function (z) { return z.text; }).join('');
          if (text.trim()) aus.push({ seite: seite, x: x, y: y, text: text });
        }
        zahlen = [];
        continue;
      }
      i++;
    }
    return aus;
  }

  /* ---- Nach aussen ------------------------------------------ */

  /* Alle Textstuecke des Dokuments, mit Seite und Position. */
  async function stuecke(puffer) {
    var daten = new Uint8Array(puffer);
    var aus = [];
    var seite = 0;
    for (var roh of streamsSammeln(daten)) {
      var klar = await entpacken(roh);
      var inhalt = zuText(klar || roh);
      // Bilder und Schriften enthalten keine Textoperatoren — die
      // Pruefung hier ist schneller als sie zu zerlegen.
      if (inhalt.indexOf('Tj') < 0 && inhalt.indexOf('TJ') < 0) continue;
      seite++;
      aus = aus.concat(stueckeAusInhalt(inhalt, seite));
    }
    return aus;
  }

  /* Textstuecke zu Zeilen zusammenfassen: alles, was auf
     derselben Hoehe steht, gehoert zusammen. */
  function zeilenAus(stueckeListe, spielraum) {
    var toleranz = spielraum || 2.5;
    var nachSeite = {};
    stueckeListe.forEach(function (s) {
      (nachSeite[s.seite] = nachSeite[s.seite] || []).push(s);
    });

    var aus = [];
    Object.keys(nachSeite).sort(function (a, b) { return a - b; }).forEach(function (seite) {
      var offen = [];
      nachSeite[seite].slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; }).forEach(function (s) {
        var passend = offen.filter(function (z) { return Math.abs(z.y - s.y) <= toleranz; })[0];
        if (!passend) { passend = { seite: +seite, y: s.y, teile: [] }; offen.push(passend); }
        passend.teile.push({ x: s.x, text: s.text });
      });
      offen.forEach(function (z) { z.teile.sort(function (a, b) { return a.x - b.x; }); });
      aus = aus.concat(offen);
    });
    return aus;
  }

  /* Ganzer Text, zeilenweise — fuer alles, was keine Tabelle ist. */
  async function text(puffer) {
    return zeilenAus(await stuecke(puffer)).map(function (z) {
      return z.teile.map(function (t) { return t.text; }).join(' ').replace(/\s+/g, ' ').trim();
    }).join('\n');
  }

  return { istPdf: istPdf, stuecke: stuecke, zeilenAus: zeilenAus, text: text };
})();
