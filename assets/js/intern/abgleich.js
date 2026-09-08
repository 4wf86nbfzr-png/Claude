/* ============================================================
   HERM SERVICE TEAM — Schichtabgleich, Oberflaeche
   ------------------------------------------------------------
   Der Morgenlauf des Bueros: Dienstplan von gestern laden,
   Zeitliste einlesen, Abweichungen ansehen, freigeben.
   Rechnen tut kern.js — hier steht nur Bedienung.

   Die Seite laeuft auch ohne die Bruecke. Dann werden Dateien
   von Hand abgelegt und am Ende faellt eine CSV heraus statt
   einer Uebertragung. Alles andere ist gleich.
   ============================================================ */
(function () {
  'use strict';

  var K = globalThis.HSTAbgleich;
  var $ = function (s, w) { return (w || document).querySelector(s); };
  var $$ = function (s, w) { return Array.prototype.slice.call((w || document).querySelectorAll(s)); };

  /* ---- Kleiner Speicher, der auch unter file:// nicht abstuerzt --- */
  function merken() {}
  merken.laden = function (name, ersatz) {
    try {
      var w = localStorage.getItem('hst.abgleich.' + name);
      return w ? JSON.parse(w) : ersatz;
    } catch (e) { return ersatz; }
  };
  merken.sichern = function (name, wert) {
    try { localStorage.setItem('hst.abgleich.' + name, JSON.stringify(wert)); } catch (e) {}
  };

  /* ---- Zustand ------------------------------------------------ */
  var Z = {
    datum: K.heuteIso(-1),
    soll: [],
    personen: [],
    ist: [],
    ergebnis: null,
    entscheidungen: {},     // ueberlebt ein Neuberechnen
    filter: 'offen',
    aktiv: -1,
    rohtext: '',
    aliase: merken.laden('aliase', {}),
    regeln: merken.laden('regeln', {}),
    bearbeiter: merken.laden('bearbeiter', ''),
    bruecke: { an: false, basis: '', token: '', konfig: null }
  };

  /* ============================================================
     Meldungen
     ============================================================ */
  function meldung(art, text, dauerhaft) {
    var kasten = document.createElement('div');
    kasten.className = 'meldung';
    kasten.setAttribute('data-art', art);
    kasten.innerHTML = text;
    $('#meldungen').appendChild(kasten);
    if (!dauerhaft && art === 'gut') {
      setTimeout(function () { kasten.remove(); }, 6000);
    }
    return kasten;
  }
  function meldungenLeeren() { $('#meldungen').innerHTML = ''; }

  function schreibe(zielId, art, text) {
    var ziel = $(zielId);
    ziel.innerHTML = '';
    if (!text) return;
    var k = document.createElement('div');
    k.className = 'meldung';
    k.setAttribute('data-art', art);
    k.innerHTML = text;
    ziel.appendChild(k);
  }

  /* ============================================================
     Bruecke — der kleine Dienst auf dem Buerorechner
     ============================================================ */
  var Bruecke = {
    basis: function () {
      // Wird die Seite von der Bruecke selbst ausgeliefert, ist es
      // dieselbe Adresse — sonst der uebliche Port auf diesem Rechner.
      if (location.protocol === 'http:' || location.protocol === 'https:') {
        if (location.port === '8770') return '';
        var vor = merken.laden('bruecke', null);
        if (vor) return vor;
      }
      return 'http://127.0.0.1:8770';
    },
    schluessel: function () {
      var ausUrl = new URLSearchParams(location.search).get('t');
      if (ausUrl) { merken.sichern('token', ausUrl); return ausUrl; }
      return merken.laden('token', '');
    },
    adresse: function (pfad) {
      var t = Bruecke.schluessel();
      return Bruecke.basis() + pfad + (pfad.indexOf('?') >= 0 ? '&' : '?') + 't=' + encodeURIComponent(t);
    },
    hole: function (pfad) {
      return fetch(Bruecke.adresse(pfad), { cache: 'no-store' }).then(pruefeAntwort);
    },
    schicke: function (pfad, koerper) {
      return fetch(Bruecke.adresse(pfad), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(koerper)
      }).then(pruefeAntwort);
    },
    pruefen: function () {
      setDraht('suche', 'Br&uuml;cke wird gesucht');
      return Bruecke.hole('/api/stand').then(function (stand) {
        Z.bruecke.an = true;
        Z.bruecke.konfig = stand;
        setDraht('an', 'Br&uuml;cke verbunden' + (stand.modus ? ' &middot; ' + stand.modus : ''));
        return stand;
      }).catch(function (fehler) {
        Z.bruecke.an = false;
        setDraht('aus', 'ohne Br&uuml;cke');
        return null;
      });
    }
  };

  function pruefeAntwort(antwort) {
    if (!antwort.ok) {
      return antwort.text().then(function (t) {
        throw new Error('Br&uuml;cke antwortet ' + antwort.status + (t ? ': ' + t.slice(0, 200) : ''));
      });
    }
    return antwort.json();
  }

  function setDraht(stand, text) {
    $('#draht').setAttribute('data-stand', stand);
    $('#drahtText').innerHTML = text;
  }

  /* ============================================================
     Dateien einlesen
     ============================================================ */
  function textAusDatei(datei) {
    return new Promise(function (fertig, daneben) {
      var leser = new FileReader();
      leser.onload = function () { fertig(String(leser.result)); };
      leser.onerror = function () { daneben(new Error('Datei nicht lesbar')); };
      leser.readAsText(datei, 'utf-8');
    });
  }

  function datenAusDatei(datei) {
    return new Promise(function (fertig, daneben) {
      var leser = new FileReader();
      leser.onload = function () { fertig(String(leser.result)); };
      leser.onerror = function () { daneben(new Error('Datei nicht lesbar')); };
      leser.readAsDataURL(datei);
    });
  }

  /* Bild oder PDF: die Texterkennung sitzt in der Bruecke, damit
     im Browser kein 30-MB-Paket geladen werden muss und das Ergebnis
     fuer alle Arbeitsplaetze gleich ausfaellt. */
  function scannen(datei) {
    if (!Z.bruecke.an) {
      return Promise.reject(new Error(
        'Zum Scannen von Fotos und PDF muss die Br&uuml;cke laufen ' +
        '(<code>npm start</code> im Ordner <code>bruecke/</code>). ' +
        'Solange: das Bild dient als Vorlage, die Zeiten daneben eintippen.'));
    }
    var kasten = meldung('info', 'Zeitliste wird gelesen &hellip;', true);
    return datenAusDatei(datei).then(function (daten) {
      return Bruecke.schicke('/api/scannen', { name: datei.name, daten: daten });
    }).then(function (antwort) {
      kasten.remove();
      return antwort;
    }).catch(function (f) { kasten.remove(); throw f; });
  }

  /* ============================================================
     Soll (secplan) setzen
     ============================================================ */
  function sollSetzen(liste, herkunft) {
    Z.soll = liste || [];
    Z.personen = personenAus(Z.soll);
    if (!Z.soll.length) {
      schreibe('#sollStand', 'warnung', 'Keine Schichten erkannt. Erwartet werden Spalten wie ' +
        '<b>Datum, Mitarbeiter, von, bis, Pause</b> &ndash; oder Zeilen mit Name und zwei Uhrzeiten.');
      return;
    }
    var tage = {};
    Z.soll.forEach(function (s) { if (s.datum) tage[s.datum] = true; });
    var tageListe = Object.keys(tage);
    if (tageListe.length === 1 && tageListe[0] !== Z.datum) {
      Z.datum = tageListe[0];
      $('#datum').value = Z.datum;
    }
    schreibe('#sollStand', 'gut', '<b>' + Z.soll.length + ' geplante Schichten</b> f&uuml;r ' +
      K.datumDeutsch(Z.datum) + ' &middot; ' + Z.personen.length + ' Personen &middot; Quelle: ' + herkunft);
    rechnen();
  }

  function personenAus(soll) {
    var karte = {};
    soll.forEach(function (s) {
      var p = s.mitarbeiter;
      if (p && !karte[p.id]) karte[p.id] = p;
    });
    return Object.keys(karte).map(function (k) { return karte[k]; });
  }

  function sollAusText(text, herkunft) {
    var liste = K.sollAusCsv(text);
    if (!liste.length) {
      // Kein CSV: dann als freie Zeilen lesen und daraus einen Plan bauen.
      var gelesen = K.zeitlisteLesen(text, { quelle: 'plan', datum: Z.datum });
      liste = gelesen.zeilen.map(function (z, i) {
        return {
          id: 's' + i, datum: z.datum || Z.datum, einsatz: z.bemerkung || '',
          mitarbeiter: { id: 'p' + K.normalisiere(z.rohname).replace(/ /g, '-'),
                         name: z.rohname, personalnummer: z.personalnummer || '' },
          beginn: z.beginn, ende: z.ende, pause: z.pause || 0
        };
      });
    }
    sollSetzen(liste, herkunft);
  }

  /* ============================================================
     Ist setzen
     ============================================================ */
  function istHinzufuegen(zeilen, herkunft, verworfen) {
    if (!zeilen || !zeilen.length) {
      schreibe('#istStand', 'warnung', 'Aus dieser Quelle liess sich keine Zeile lesen. ' +
        'Gebraucht wird pro Person ein Name und zwei Uhrzeiten.');
      return;
    }
    Z.ist = Z.ist.concat(zeilen);
    var text = '<b>' + zeilen.length + ' Zeilen</b> gelesen (' + herkunft + ').';
    if (verworfen && verworfen.length) {
      text += ' <b>' + verworfen.length + '</b> Zeilen ohne zwei Uhrzeiten wurden &uuml;bergangen &ndash; ' +
              'sie stehen unten im Rohtext, falls dort doch etwas fehlt.';
    }
    schreibe('#istStand', 'gut', text);
    rechnen();
  }

  function istAusText(text, herkunft) {
    Z.rohtext = text;
    rohschauZeigen(text);
    var gelesen = K.zeitlisteLesen(text, { quelle: 'liste', datum: Z.datum });
    istHinzufuegen(gelesen.zeilen, herkunft, gelesen.verworfen);
  }

  function rohschauZeigen(text) {
    var s = $('#rohschau');
    if (!text) { s.hidden = true; return; }
    s.hidden = false;
    s.textContent = text.length > 6000 ? text.slice(0, 6000) + '\n…' : text;
  }

  /* Alles lief wie geplant — der haeufigste Fall bei kleinen Einsaetzen. */
  function alsGeplantUebernehmen() {
    if (!Z.soll.length) { meldung('warnung', 'Erst den Dienstplan laden.'); return; }
    Z.ist = Z.soll.map(function (s) {
      return { rohname: s.mitarbeiter.name, beginn: s.beginn, ende: s.ende,
               pause: s.pause || 0, datum: s.datum, quelle: 'wie geplant' };
    });
    schreibe('#istStand', 'gut', 'Alle ' + Z.ist.length + ' Schichten als <b>planm&auml;ssig</b> gesetzt. ' +
      'Einzelne Abweichungen lassen sich unten trotzdem eintragen.');
    rechnen();
  }

  /* ============================================================
     Rechnen und Zeichnen
     ============================================================ */
  function schluesselFuer(z) {
    return (z.schichtId || 'x') + '|' + K.normalisiere(z.name) + '|' + (z.ist ? z.ist.zeile : 'o');
  }

  function rechnen() {
    if (!Z.soll.length && !Z.ist.length) { $('#s-tafel').hidden = true; $('#freigabe').hidden = true; return; }
    Z.ergebnis = K.abgleichen(Z.soll, Z.ist, Z.personen.length ? Z.personen : null, Z.regeln, Z.aliase);

    // Bereits getroffene Entscheidungen wieder aufsetzen, damit ein
    // geaenderter Regelsatz nicht die halbe Stunde Arbeit wegwirft.
    Z.ergebnis.zeilen.forEach(function (z) {
      var e = Z.entscheidungen[schluesselFuer(z)];
      if (!e) return;
      if (e.vorschlag) z.vorschlag = e.vorschlag;
      if (e.notiz) z.notiz = e.notiz;
      if (e.person) { z.person = e.person; z.name = e.person.name; if (z.status === 'unklar') z.status = 'zusatz'; }
      z.freigegeben = !!e.freigegeben;
    });

    $('#s-tafel').hidden = false;
    $('#freigabe').hidden = false;
    zeichnen();
  }

  function entscheidungMerken(z) {
    Z.entscheidungen[schluesselFuer(z)] = {
      freigegeben: z.freigegeben, vorschlag: z.vorschlag, notiz: z.notiz, person: z.person
    };
  }

  var STAND_TEXT = {
    passt: 'passt', abweichung: 'Abweichung', fehlt: 'fehlt', zusatz: 'zus&auml;tzlich',
    unklar: 'Name unklar', pruefen: 'pr&uuml;fen'
  };

  var FILTER = [
    ['offen', 'Zu tun'],
    ['unklar', 'Name unklar'],
    ['abweichung', 'Abweichung'],
    ['fehlt', 'fehlt'],
    ['zusatz', 'zus&auml;tzlich'],
    ['passt', 'passt'],
    ['alle', 'Alle']
  ];

  function sichtbare() {
    var alle = Z.ergebnis ? Z.ergebnis.zeilen : [];
    if (Z.filter === 'alle') return alle;
    if (Z.filter === 'offen') return alle.filter(function (z) { return !z.freigegeben; });
    return alle.filter(function (z) { return z.status === Z.filter; });
  }

  function zeichnen() {
    var k = K.kennzahlen(Z.ergebnis.zeilen);

    $('#kennzahlen').innerHTML = [
      kennzahl(k.gesamt, 'Schichten'),
      kennzahl(k.offen, 'offen'),
      kennzahl(k.abweichung + k.pruefen, 'Abweichungen'),
      kennzahl(k.fehlt, 'ohne Zeit'),
      kennzahl(k.unklar, 'Name unklar'),
      kennzahl(K.stundenText(k.sollMinuten), 'geplant'),
      kennzahl(K.stundenText(k.istMinuten), 'gerechnet'),
      kennzahl((k.diffMinuten > 0 ? '+' : '') + K.stundenText(k.diffMinuten), 'Differenz')
    ].join('');

    $('#filter').innerHTML = FILTER.map(function (f) {
      var zahl = f[0] === 'alle' ? k.gesamt
               : f[0] === 'offen' ? k.offen
               : (k[f[0]] || 0);
      return '<button class="filter__chip" type="button" data-filter="' + f[0] + '" ' +
             'aria-pressed="' + (Z.filter === f[0] ? 'true' : 'false') + '">' +
             f[1] + '<b>' + zahl + '</b></button>';
    }).join('');

    var koerper = $('#tafelKoerper');
    koerper.innerHTML = '';
    var liste = sichtbare();
    if (!liste.length) {
      koerper.innerHTML = '<tr><td colspan="8" style="padding:26px 0;color:var(--muted)">' +
        (Z.filter === 'offen' ? 'Nichts mehr offen &ndash; der Tag kann freigegeben werden.'
                              : 'Keine Zeile in dieser Ansicht.') + '</td></tr>';
    }
    liste.forEach(function (z, i) { koerper.appendChild(zeileZeichnen(z, i)); });

    var frei = Z.ergebnis.zeilen.filter(function (z) { return z.freigegeben; });
    $('#freigabeText').innerHTML =
      '<b>' + frei.length + '</b> von ' + k.gesamt + ' Schichten freigegeben' +
      (k.offen ? ' &middot; <b>' + k.offen + '</b> noch offen' : ' &middot; vollst&auml;ndig') +
      ' &middot; ' + K.datumDeutsch(Z.datum);
  }

  function kennzahl(wert, was) {
    return '<div class="kennzahl"><b>' + wert + '</b><span>' + was + '</span></div>';
  }

  function zeitSpanne(t) {
    if (!t || t.beginn === null || t.beginn === undefined) return '<span class="z-zeit z-zeit--blass">&ndash;</span>';
    var netto = K.dauer(t.beginn, t.ende) - (t.pause || 0);
    return '<span class="z-zeit">' + K.zeitAusMinuten(t.beginn) + '&thinsp;&ndash;&thinsp;' +
      K.zeitAusMinuten(t.ende) + '</span><span class="z-roh">' +
      (t.pause ? t.pause + ' min Pause &middot; ' : '') + K.stundenText(netto) + '</span>';
  }

  function zeileZeichnen(z, index) {
    var tr = document.createElement('tr');
    tr.setAttribute('data-id', z.id);
    tr.setAttribute('data-frei', z.freigegeben ? 'ja' : 'nein');
    tr.setAttribute('data-aktiv', index === Z.aktiv ? 'ja' : 'nein');

    /* 1 Stand */
    var td1 = zelle(tr, 'Stand');
    td1.innerHTML = '<span class="stand" data-s="' + z.status + '">' + STAND_TEXT[z.status] + '</span>';

    /* 2 Mitarbeiter */
    var td2 = zelle(tr, 'Mitarbeiter');
    if (z.status === 'unklar') {
      var wahl = '<select class="wahlfeld" data-tun="zuordnen"><option value="">Wer war das?</option>' +
        Z.personen.map(function (p) {
          return '<option value="' + p.id + '">' + sicher(p.name) + '</option>';
        }).join('') + '</select>';
      td2.innerHTML = '<span class="z-name">' + sicher(z.rohname) + '</span>' +
        '<span class="z-roh">so stand es auf der Liste</span>' + wahl;
    } else {
      var merkerHtml = '';
      if (z.zuordnung && z.zuordnung.grund && z.zuordnung.grund !== 'sicher') {
        merkerHtml = '<span class="merker" data-art="' + z.zuordnung.grund + '">' +
          (z.zuordnung.grund === 'vorschlag' ? 'nur &auml;hnlich'
           : z.zuordnung.grund === 'alias' ? 'gemerkt'
           : z.zuordnung.grund === 'personalnummer' ? 'Pers.-Nr.' : z.zuordnung.grund) + '</span>';
      }
      td2.innerHTML = '<span class="z-name">' + sicher(z.name) + '</span>' + merkerHtml +
        (z.rohname && K.normalisiere(z.rohname) !== K.normalisiere(z.name)
          ? '<span class="z-roh">Liste: ' + sicher(z.rohname) + '</span>' : '');
    }

    /* 3 Einsatz */
    zelle(tr, 'Einsatz').innerHTML = '<span class="z-einsatz">' + (sicher(z.einsatz) || '&ndash;') + '</span>';

    /* 4 Geplant */
    zelle(tr, 'Geplant').innerHTML = zeitSpanne(z.soll);

    /* 5 Gelaufen */
    zelle(tr, 'Gelaufen').innerHTML = z.ist ? zeitSpanne(z.ist)
      : '<span class="z-zeit z-zeit--blass">keine Zeit gemeldet</span>';

    /* 6 Differenz */
    var td6 = zelle(tr, 'Differenz');
    if (z.diffDauer === null || z.diffDauer === undefined) {
      td6.innerHTML = '<span class="z-zeit z-zeit--blass">&ndash;</span>';
    } else {
      var klasse = z.diffDauer > 0 ? 'z-diff--plus' : z.diffDauer < 0 ? 'z-diff--minus' : '';
      td6.innerHTML = '<span class="z-diff ' + klasse + '">' +
        (z.diffDauer > 0 ? '+' : '') + K.stundenText(z.diffDauer) + '</span>' +
        '<span class="z-roh">' + minutenText(z.diffBeginn, 'Beginn') + ' &middot; ' +
        minutenText(z.diffEnde, 'Ende') + '</span>';
    }

    /* 7 Uebernehmen (bearbeitbar) */
    var td7 = zelle(tr, 'Übernehmen');
    td7.className = 'z-uebernehmen';
    if (z.status === 'fehlt' && !z.freigegeben) {
      td7.innerHTML = '<span class="z-zeit z-zeit--blass">Entscheidung n&ouml;tig</span>';
    } else {
      td7.innerHTML =
        '<input class="zeitfeld" data-tun="beginn" value="' + K.zeitAusMinuten(z.vorschlag.beginn) + '" inputmode="numeric" aria-label="Beginn" /> ' +
        '<input class="zeitfeld" data-tun="ende" value="' + K.zeitAusMinuten(z.vorschlag.ende) + '" inputmode="numeric" aria-label="Ende" /> ' +
        '<input class="zeitfeld pausenfeld" data-tun="pause" value="' + (z.vorschlag.pause || 0) + '" inputmode="numeric" aria-label="Pause in Minuten" />';
    }

    /* 8 Aktionen */
    var td8 = zelle(tr, 'Aktion');
    var knoepfe = [];
    if (z.freigegeben) {
      knoepfe.push('<button class="knopf knopf--klein" data-tun="zurueck" type="button">zur&uuml;cknehmen</button>');
    } else {
      if (z.status === 'fehlt') {
        knoepfe.push('<button class="knopf knopf--klein" data-tun="wieGeplant" type="button">war da, wie geplant</button>');
        knoepfe.push('<button class="knopf knopf--klein knopf--warn" data-tun="ausfall" type="button">Ausfall</button>');
      } else if (z.status !== 'unklar') {
        knoepfe.push('<button class="knopf knopf--klein" data-tun="uebernehmen" type="button">&uuml;bernehmen</button>');
        if (z.soll) knoepfe.push('<button class="knopf knopf--klein" data-tun="wieGeplant" type="button">wie geplant</button>');
      }
    }
    td8.innerHTML = '<span class="z-tun">' + knoepfe.join('') + '</span>';

    tr.addEventListener('click', function () { Z.aktiv = index; markiereAktiv(); });
    return tr;
  }

  function zelle(tr, name) {
    var td = document.createElement('td');
    td.setAttribute('data-spalte', name);
    tr.appendChild(td);
    return td;
  }

  function minutenText(min, was) {
    if (min === null || min === undefined) return was + ' &ndash;';
    if (min === 0) return was + ' p&uuml;nktlich';
    return was + ' ' + (min > 0 ? '+' : '') + min + ' min';
  }

  function sicher(text) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function markiereAktiv() {
    $$('#tafelKoerper tr').forEach(function (tr, i) {
      tr.setAttribute('data-aktiv', i === Z.aktiv ? 'ja' : 'nein');
    });
    var tr = $$('#tafelKoerper tr')[Z.aktiv];
    if (tr && tr.scrollIntoView) tr.scrollIntoView({ block: 'nearest' });
  }

  function zeileZu(el) {
    var tr = el.closest ? el.closest('tr') : null;
    if (!tr) return null;
    var id = tr.getAttribute('data-id');
    return Z.ergebnis.zeilen.filter(function (z) { return z.id === id; })[0] || null;
  }

  /* ============================================================
     Entscheidungen
     ============================================================ */
  function uebernehmen(z) {
    if (!z || z.vorschlag.beginn === null) return;
    z.freigegeben = true;
    entscheidungMerken(z);
    zeichnen();
  }

  function wieGeplant(z) {
    if (!z || !z.soll) return;
    z.vorschlag = { beginn: z.soll.beginn, ende: z.soll.ende, pause: z.soll.pause || 0 };
    z.freigegeben = true;
    z.notiz = z.status === 'fehlt' ? 'ohne Zeitliste als planm&auml;ssig best&auml;tigt' : z.notiz;
    entscheidungMerken(z);
    zeichnen();
  }

  function ausfall(z) {
    if (!z) return;
    var grund = prompt('Was war der Grund? (steht sp&auml;ter im Protokoll)', z.notiz || 'nicht erschienen');
    if (grund === null) return;
    z.notiz = grund;
    z.freigegeben = true;
    entscheidungMerken(z);
    zeichnen();
  }

  function zurueck(z) {
    if (!z) return;
    z.freigegeben = false;
    entscheidungMerken(z);
    zeichnen();
  }

  function zuordnen(z, personId) {
    var person = Z.personen.filter(function (p) { return String(p.id) === String(personId); })[0];
    if (!person) return;
    // Die Zuordnung wird gemerkt: beim naechsten Mal erkennt die
    // Oberflaeche denselben handschriftlichen Namen von allein.
    Z.aliase[K.normalisiere(z.rohname)] = person.id;
    merken.sichern('aliase', Z.aliase);
    rechnen();
    meldung('gut', '&bdquo;' + sicher(z.rohname) + '&ldquo; wird ab jetzt ' + sicher(person.name) + ' zugeordnet.');
  }

  /* ============================================================
     Freigabe
     ============================================================ */
  function alleSichtbaren() {
    var liste = sichtbare().filter(function (z) {
      return !z.freigegeben && z.status !== 'unklar' && z.status !== 'fehlt' && z.vorschlag.beginn !== null;
    });
    if (!liste.length) { meldung('info', 'In dieser Ansicht ist nichts mehr zu &uuml;bernehmen.'); return; }
    if (!confirm(liste.length + ' Schichten so &uuml;bernehmen, wie sie unten stehen?')) return;
    liste.forEach(function (z) { z.freigegeben = true; entscheidungMerken(z); });
    zeichnen();
  }

  function csvSichern() {
    var frei = Z.ergebnis.zeilen.filter(function (z) { return z.freigegeben; });
    if (!frei.length) { meldung('warnung', 'Noch nichts freigegeben.'); return; }
    var csv = K.csvSchreiben(frei);
    herunterladen('abgleich-' + Z.datum + '.csv', csv, 'text/csv;charset=utf-8');
    meldung('gut', 'CSV gesichert. Sie l&auml;sst sich in secplan importieren oder an die Lohnbuchhaltung weitergeben.');
  }

  function herunterladen(name, inhalt, art) {
    var blob = new Blob(['﻿' + inhalt], { type: art });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function freigeben() {
    if (!Z.bearbeiter) {
      meldung('warnung', 'Bitte oben rechts eintragen, wer freigibt &ndash; das steht so im Protokoll.');
      $('#bearbeiter').focus();
      return;
    }
    var paket = K.freigabePaket(Z.ergebnis.zeilen, Z.datum, Z.bearbeiter);
    var offen = Z.ergebnis.zeilen.filter(function (z) { return !z.freigegeben; }).length;

    if (!paket.schichten.length && !paket.ausfaelle.length) {
      meldung('warnung', 'Es ist nichts freigegeben.');
      return;
    }
    var frage = paket.schichten.length + ' Schichten und ' + paket.ausfaelle.length +
      ' Ausf&auml;lle nach secplan &uuml;bertragen' +
      (offen ? '\n\nAchtung: ' + offen + ' Zeilen sind noch offen und bleiben unangetastet.' : '') + '\n\nFortfahren?';
    if (!confirm(frage)) return;

    if (!Z.bruecke.an) {
      herunterladen('freigabe-' + Z.datum + '.json', JSON.stringify(paket, null, 2), 'application/json');
      csvSichern();
      meldung('info', 'Ohne laufende Br&uuml;cke wurde die Freigabe als Datei gesichert. ' +
        'Mit laufender Br&uuml;cke (<code>npm start</code> in <code>bruecke/</code>) tr&auml;gt sie sich selbst in secplan ein.', true);
      return;
    }

    var kasten = meldung('info', '&Uuml;bertragung l&auml;uft &hellip;', true);
    Bruecke.schicke('/api/freigabe', paket).then(function (antwort) {
      kasten.remove();
      merken.sichern('zuletztUebertragen', Z.datum);
      if (antwort.probelauf) {
        meldung('warnung', '<b>Probelauf</b>: ' + antwort.uebertragen + ' Schichten w&auml;ren &uuml;bertragen worden. ' +
          'In <code>bruecke/konfig.json</code> steht <code>"probelauf": true</code> &ndash; auf <code>false</code> setzen, ' +
          'sobald die Zuordnung stimmt.', true);
      } else {
        meldung('gut', '<b>' + antwort.uebertragen + ' Schichten</b> in secplan eingetragen' +
          (antwort.fehler && antwort.fehler.length ? ', <b>' + antwort.fehler.length + '</b> nicht &ndash; siehe Protokoll.' : '.'), true);
      }
      if (antwort.fehler && antwort.fehler.length) {
        meldung('fehler', antwort.fehler.map(function (f) {
          return sicher(f.name + ': ' + f.grund);
        }).join('<br />'), true);
      }
    }).catch(function (f) {
      kasten.remove();
      meldung('fehler', 'Die &Uuml;bertragung ist gescheitert: ' + sicher(f.message) +
        '<br />Die Freigabe ist nicht verloren &ndash; mit <b>Als CSV sichern</b> l&auml;sst sie sich von Hand einspielen.', true);
    });
  }

  /* ============================================================
     Tagespaket und Benachrichtigung
     ============================================================ */
  function tagespaketLaden(still) {
    if (!Z.bruecke.an) {
      if (!still) meldung('warnung', 'Die Br&uuml;cke l&auml;uft nicht. Dienstplan bitte als Datei ablegen.');
      return Promise.resolve(null);
    }
    return Bruecke.hole('/api/tagespaket?tag=' + Z.datum).then(function (paket) {
      if (!paket || !paket.soll || !paket.soll.length) {
        if (!still) schreibe('#sollStand', 'warnung', 'F&uuml;r ' + K.datumDeutsch(Z.datum) +
          ' liegt kein Tagespaket vor. Entweder gab es keine Schichten, oder der Morgenlauf ist noch nicht durch.');
        return null;
      }
      sollSetzen(paket.soll, 'Br&uuml;cke, Stand ' + (paket.erzeugt || '').slice(0, 16).replace('T', ' '));
      if (paket.ist && paket.ist.length) {
        istHinzufuegen(paket.ist, 'Schnellerfassung vom Einsatz', []);
      }
      return paket;
    }).catch(function (f) {
      if (!still) meldung('fehler', sicher(f.message));
      return null;
    });
  }

  function benachrichtigungEinrichten() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;
    var k = meldung('info', 'Diese Ansicht kann Sie morgens erinnern, sobald der Dienstplan von gestern bereitliegt. ' +
      '<button class="knopf knopf--klein" id="erinnernAn" type="button" style="margin-left:8px">Erinnerung einschalten</button>', true);
    $('#erinnernAn').addEventListener('click', function () {
      Notification.requestPermission().then(function (stand) {
        k.remove();
        if (stand === 'granted') meldung('gut', 'Erinnerung ist an. Die Mail vom Morgenlauf kommt unabh&auml;ngig davon.');
      });
    });
  }

  function aufNeuesPaketHorchen() {
    setInterval(function () {
      if (!Z.bruecke.an) { Bruecke.pruefen(); return; }
      Bruecke.hole('/api/stand').then(function (stand) {
        if (!stand || !stand.letztesPaket) return;
        var gesehen = merken.laden('gesehen', '');
        if (stand.letztesPaket !== gesehen) {
          merken.sichern('gesehen', stand.letztesPaket);
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Schichtabgleich', {
              body: 'Der Dienstplan für ' + K.datumDeutsch(stand.letztesPaket) + ' liegt bereit.',
              icon: '../assets/logo/apple-touch-icon.png'
            });
          }
          meldung('info', 'Neues Tagespaket f&uuml;r <b>' + K.datumDeutsch(stand.letztesPaket) + '</b> liegt bereit.');
        }
      }).catch(function () { Z.bruecke.an = false; setDraht('aus', 'ohne Br&uuml;cke'); });
    }, 5 * 60 * 1000);
  }

  /* ============================================================
     Verdrahtung
     ============================================================ */
  function ablageVerdrahten(ablageId, dateiId, verarbeiten) {
    var ablage = $(ablageId), feld = $(dateiId);
    ablage.addEventListener('click', function (e) { if (e.target !== feld) feld.click(); });
    ablage.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); feld.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (n) {
      ablage.addEventListener(n, function (e) { e.preventDefault(); ablage.classList.add('hover'); });
    });
    ['dragleave', 'drop'].forEach(function (n) {
      ablage.addEventListener(n, function (e) { e.preventDefault(); ablage.classList.remove('hover'); });
    });
    ablage.addEventListener('drop', function (e) {
      var dateien = e.dataTransfer && e.dataTransfer.files;
      if (dateien && dateien.length) Array.prototype.forEach.call(dateien, verarbeiten);
    });
    feld.addEventListener('change', function () {
      Array.prototype.forEach.call(feld.files, verarbeiten);
      feld.value = '';
    });
  }

  function sollDatei(datei) {
    textAusDatei(datei).then(function (text) {
      if (/^\s*[{[]/.test(text)) {
        var paket = JSON.parse(text);
        if (paket.soll) { sollSetzen(paket.soll, 'Datei ' + datei.name); return; }
      }
      sollAusText(text, 'Datei ' + datei.name);
    }).catch(function (f) { schreibe('#sollStand', 'fehler', sicher(f.message)); });
  }

  function istDatei(datei) {
    var typ = (datei.type || '') + ' ' + datei.name.toLowerCase();

    if (/image\//.test(datei.type)) {
      belegZeigen(datei);
      scannen(datei).then(function (a) {
        rohschauZeigen(a.text || '');
        var gelesen = K.zeitlisteLesen(a.text || '', { quelle: 'ocr', datum: Z.datum });
        istHinzufuegen(gelesen.zeilen, 'Foto ' + datei.name + ' (Texterkennung)', gelesen.verworfen);
        meldung('warnung', 'Aus einem Foto gelesene Zeiten sind ein <b>Vorschlag</b>. ' +
          'Bitte die Spalte &bdquo;Gelaufen&ldquo; gegen den Zettel halten, bevor Sie freigeben.', true);
      }).catch(function (f) {
        schreibe('#istStand', 'warnung', f.message);
      });
      return;
    }

    if (/pdf/.test(typ)) {
      scannen(datei).then(function (a) {
        rohschauZeigen(a.text || '');
        var gelesen = K.zeitlisteLesen(a.text || '', { quelle: a.weg === 'ocr' ? 'ocr' : 'pdf', datum: Z.datum });
        istHinzufuegen(gelesen.zeilen, 'PDF ' + datei.name, gelesen.verworfen);
      }).catch(function (f) { schreibe('#istStand', 'warnung', f.message); });
      return;
    }

    textAusDatei(datei).then(function (text) {
      if (/\.json$/.test(datei.name) || /^\s*[{[]/.test(text)) {
        var paket = JSON.parse(text);
        var zeilen = paket.zeilen || paket.ist || (Array.isArray(paket) ? paket : null);
        if (zeilen) {
          rohschauZeigen('');
          istHinzufuegen(zeilen, 'Schnellerfassung ' + datei.name, []);
          return;
        }
      }
      istAusText(text, 'Datei ' + datei.name);
    }).catch(function (f) { schreibe('#istStand', 'fehler', sicher(f.message)); });
  }

  function belegZeigen(datei) {
    var url = URL.createObjectURL(datei);
    $('#belegBereich').innerHTML = '<figure class="beleg"><img src="' + url + '" alt="Zeitliste ' +
      sicher(datei.name) + '" /></figure>';
  }

  function regelnLesen() {
    Z.regeln = {
      toleranzMin: parseInt($('#rToleranz').value, 10),
      raster: parseInt($('#rRaster').value, 10),
      rundung: $('#rRundung').value,
      pauseAutomatisch: $('#rPause').checked
    };
    merken.sichern('regeln', Z.regeln);
    if (Z.ergebnis) rechnen();
  }

  function regelnZeigen() {
    var r = K.regelnMitStandard(Z.regeln);
    $('#rToleranz').value = r.toleranzMin;
    $('#rRaster').value = r.raster;
    $('#rRundung').value = r.rundung;
    $('#rPause').checked = !!r.pauseAutomatisch;
  }

  function erfassungLink() {
    var grund = Z.bruecke.an && Bruecke.basis()
      ? Bruecke.basis() + '/intern/erfassung.html'
      : location.href.replace(/abgleich\.html.*$/, 'erfassung.html');
    var url = grund + '?tag=' + Z.datum + (Z.bruecke.an ? '&t=' + encodeURIComponent(Bruecke.schluessel()) : '');
    var kasten = meldung('info', 'Link f&uuml;r den Schichtleiter (nur im B&uuml;ronetz erreichbar):<br />' +
      '<code style="user-select:all;word-break:break-all">' + sicher(url) + '</code>', true);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        kasten.innerHTML += '<br /><b>In die Zwischenablage kopiert.</b>';
      }).catch(function () {});
    }
  }

  /* ---- Start -------------------------------------------------- */
  function start() {
    if (!K) { document.body.innerHTML = '<p style="padding:40px">kern.js wurde nicht geladen.</p>'; return; }

    var ausUrl = new URLSearchParams(location.search).get('tag');
    Z.datum = ausUrl || K.heuteIso(-1);
    $('#datum').value = Z.datum;
    $('#bearbeiter').value = Z.bearbeiter;
    regelnZeigen();

    $('#datum').addEventListener('change', function () {
      Z.datum = this.value; Z.ist = []; Z.entscheidungen = {};
      rohschauZeigen(''); $('#belegBereich').innerHTML = ''; meldungenLeeren();
      tagespaketLaden(true);
    });
    $('#tagZurueck').addEventListener('click', function () { tagVerschieben(-1); });
    $('#tagVor').addEventListener('click', function () { tagVerschieben(1); });
    $('#tagGestern').addEventListener('click', function () {
      $('#datum').value = K.heuteIso(-1);
      $('#datum').dispatchEvent(new Event('change'));
    });
    $('#bearbeiter').addEventListener('change', function () {
      Z.bearbeiter = this.value.trim();
      merken.sichern('bearbeiter', Z.bearbeiter);
    });

    ablageVerdrahten('#ablageSoll', '#dateiSoll', sollDatei);
    ablageVerdrahten('#ablageIst', '#dateiIst', istDatei);

    $('#sollVonBruecke').addEventListener('click', function () { tagespaketLaden(false); });
    $('#istAusText').addEventListener('click', function () {
      var text = $('#istText').value.trim();
      if (!text) { meldung('warnung', 'Erst Zeilen einf&uuml;gen.'); return; }
      istAusText(text, 'eingef&uuml;gter Text');
    });
    $('#istLeeren').addEventListener('click', function () {
      Z.ist = []; Z.entscheidungen = {}; rohschauZeigen(''); $('#belegBereich').innerHTML = '';
      schreibe('#istStand', 'info', 'Ist-Zeiten zur&uuml;ckgesetzt.');
      rechnen();
    });
    $('#alsGeplant').addEventListener('click', alsGeplantUebernehmen);
    $('#erfassungLink').addEventListener('click', erfassungLink);

    $('#filter').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-filter]');
      if (!chip) return;
      Z.filter = chip.getAttribute('data-filter');
      Z.aktiv = -1;
      zeichnen();
    });

    $('#tafelKoerper').addEventListener('click', function (e) {
      var knopf = e.target.closest('[data-tun]');
      if (!knopf || knopf.tagName === 'INPUT' || knopf.tagName === 'SELECT') return;
      var z = zeileZu(knopf);
      if (!z) return;
      var tun = knopf.getAttribute('data-tun');
      if (tun === 'uebernehmen') uebernehmen(z);
      else if (tun === 'wieGeplant') wieGeplant(z);
      else if (tun === 'ausfall') ausfall(z);
      else if (tun === 'zurueck') zurueck(z);
    });

    $('#tafelKoerper').addEventListener('change', function (e) {
      var feld = e.target;
      var tun = feld.getAttribute && feld.getAttribute('data-tun');
      if (!tun) return;
      var z = zeileZu(feld);
      if (!z) return;
      if (tun === 'zuordnen') { zuordnen(z, feld.value); return; }
      if (tun === 'pause') {
        z.vorschlag.pause = Math.max(0, parseInt(feld.value, 10) || 0);
      } else {
        var min = K.minutenAusZeit(feld.value);
        if (min === null) { feld.value = K.zeitAusMinuten(z.vorschlag[tun]); meldung('warnung', 'Das war keine Uhrzeit.'); return; }
        z.vorschlag[tun] = min;
      }
      entscheidungMerken(z);
      zeichnen();
    });

    ['#rToleranz', '#rRaster', '#rRundung', '#rPause'].forEach(function (s) {
      $(s).addEventListener('change', regelnLesen);
    });

    $('#alleGruen').addEventListener('click', alleSichtbaren);
    $('#csvLaden').addEventListener('click', csvSichern);
    $('#freigeben').addEventListener('click', freigeben);

    document.addEventListener('keydown', function (e) {
      var t = e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      var liste = sichtbare();
      if (!liste.length) return;
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); Z.aktiv = Math.min(liste.length - 1, Z.aktiv + 1); markiereAktiv(); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); Z.aktiv = Math.max(0, Z.aktiv - 1); markiereAktiv(); }
      else if (Z.aktiv >= 0 && liste[Z.aktiv]) {
        var z = liste[Z.aktiv];
        if (e.key === 'Enter') { e.preventDefault(); z.status === 'fehlt' ? wieGeplant(z) : uebernehmen(z); }
        else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); wieGeplant(z); }
        else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); ausfall(z); }
        else if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); zurueck(z); }
      }
    });

    // Ungespeichertes nicht verlieren.
    window.addEventListener('beforeunload', function (e) {
      var offen = Z.ergebnis && Z.ergebnis.zeilen.some(function (z) { return z.freigegeben; });
      var uebertragen = merken.laden('zuletztUebertragen', '') === Z.datum;
      if (offen && !uebertragen) { e.preventDefault(); e.returnValue = ''; }
    });

    Bruecke.pruefen().then(function (stand) {
      if (stand) tagespaketLaden(true);
      else meldung('info', 'Die Br&uuml;cke l&auml;uft gerade nicht &ndash; das Werkzeug funktioniert trotzdem: ' +
        'Dienstplan und Zeitliste als Datei ablegen, am Ende f&auml;llt eine CSV heraus. ' +
        'Mit Br&uuml;cke geht beides von selbst.', true);
      benachrichtigungEinrichten();
      aufNeuesPaketHorchen();
    });
  }

  function tagVerschieben(tage) {
    var d = new Date(Z.datum + 'T12:00:00');
    d.setDate(d.getDate() + tage);
    $('#datum').value = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    $('#datum').dispatchEvent(new Event('change'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
