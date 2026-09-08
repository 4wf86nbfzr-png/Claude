/* ============================================================
   HERM SERVICE TEAM — Schnellerfassung
   ------------------------------------------------------------
   Fuer Einsaetze, bei denen keine Zeitliste gefuehrt wurde.
   Der Schichtleiter bekommt einen Link aufs Handy, sieht die
   geplante Crew und bestaetigt pro Person. Was hier entsteht,
   ist genau das, was die Abgleich-Oberflaeche sonst aus einer
   Liste liest — nur eben ohne Zettel.

   Grundhaltung: der Normalfall („war wie geplant da") ist ein
   Fingertipp. Alles andere darf laenger dauern.
   ============================================================ */
(function () {
  'use strict';

  var K = globalThis.HSTAbgleich;
  var $ = function (s, w) { return (w || document).querySelector(s); };

  var Z = {
    tag: null,
    token: '',
    basis: '',
    soll: [],
    einsatz: '',      // '' = alle
    stand: {},        // schichtId -> { zustand:'plan'|'anders'|'ausfall', beginn, ende, pause }
    bruecke: false
  };

  function speichern() {
    try { localStorage.setItem('hst.erfassung.' + Z.tag, JSON.stringify(Z.stand)); } catch (e) {}
  }
  function laden() {
    try {
      var w = localStorage.getItem('hst.erfassung.' + Z.tag);
      if (w) Z.stand = JSON.parse(w);
    } catch (e) {}
  }

  function meldung(art, text, bleibt) {
    var k = document.createElement('div');
    k.className = 'meldung';
    k.setAttribute('data-art', art);
    k.innerHTML = text;
    $('#meldungen').appendChild(k);
    if (!bleibt) setTimeout(function () { k.remove(); }, 6000);
    return k;
  }

  function setDraht(stand, text) {
    $('#draht').setAttribute('data-stand', stand);
    $('#drahtText').textContent = text;
  }

  function adresse(pfad) {
    return Z.basis + pfad + (pfad.indexOf('?') >= 0 ? '&' : '?') + 't=' + encodeURIComponent(Z.token);
  }

  /* ---- Laden --------------------------------------------------- */
  function planLaden() {
    // Weg 1: die Bruecke kennt den Tag.
    return fetch(adresse('/api/tagespaket?tag=' + Z.tag), { cache: 'no-store' })
      .then(function (a) { if (!a.ok) throw new Error('Antwort ' + a.status); return a.json(); })
      .then(function (paket) {
        Z.bruecke = true;
        setDraht('an', 'verbunden');
        Z.soll = paket.soll || [];
        aufbauen();
      })
      .catch(function () {
        Z.bruecke = false;
        setDraht('aus', 'offline');
        // Weg 2: der Plan steckt im Link (fuer Handys ausserhalb des Bueronetzes).
        var ausHash = new URLSearchParams(location.hash.slice(1)).get('plan');
        if (ausHash) {
          try {
            Z.soll = JSON.parse(decodeURIComponent(escape(atob(ausHash))));
            aufbauen();
            return;
          } catch (e) {}
        }
        meldung('fehler', 'Der Dienstplan l&auml;sst sich gerade nicht laden. ' +
          'Bitte im B&uuml;ronetz (WLAN) erneut &ouml;ffnen &ndash; oder die Zeiten telefonisch durchgeben.', true);
        $('#stand').innerHTML = 'kein Plan geladen';
      });
  }

  function aufbauen() {
    if (!Z.soll.length) {
      meldung('warnung', 'F&uuml;r diesen Tag sind keine Schichten geplant.', true);
      return;
    }
    laden();

    $('#tagText').textContent = K.datumDeutsch(Z.tag);

    var einsaetze = [];
    Z.soll.forEach(function (s) {
      var e = s.einsatz || 'Ohne Bezeichnung';
      if (einsaetze.indexOf(e) < 0) einsaetze.push(e);
    });
    var wahl = $('#einsatzWahl');
    wahl.innerHTML = (einsaetze.length > 1 ? '<option value="">alle Eins&auml;tze</option>' : '') +
      einsaetze.map(function (e) { return '<option value="' + sicher(e) + '">' + sicher(e) + '</option>'; }).join('');
    if (einsaetze.length === 1) Z.einsatz = einsaetze[0];
    var vorgabe = new URLSearchParams(location.search).get('einsatz');
    if (vorgabe && einsaetze.indexOf(vorgabe) >= 0) Z.einsatz = vorgabe;
    wahl.value = Z.einsatz;
    $('#einsatzZeile').hidden = einsaetze.length <= 1;

    zeichnen();
  }

  function gefiltert() {
    return Z.soll.filter(function (s) {
      return !Z.einsatz || (s.einsatz || 'Ohne Bezeichnung') === Z.einsatz;
    });
  }

  /* ---- Zeichnen ------------------------------------------------ */
  function zeichnen() {
    var liste = gefiltert();
    $('#einsatzTitel').textContent = Z.einsatz || (liste.length + ' Schichten');

    var ul = $('#crew');
    ul.innerHTML = '';
    liste.forEach(function (s) {
      ul.appendChild(kraftZeichnen(s));
    });

    var offen = liste.filter(function (s) { return !Z.stand[s.id]; }).length;
    $('#stand').innerHTML = offen
      ? '<b>' + offen + '</b> von ' + liste.length + ' noch offen'
      : '<b>Alle ' + liste.length + '</b> gemeldet &ndash; bitte absenden.';
    $('#absenden').disabled = liste.length === 0;
  }

  function kraftZeichnen(s) {
    var e = Z.stand[s.id] || null;
    var li = document.createElement('li');
    li.className = 'kraft';
    li.setAttribute('data-id', s.id);
    if (e) li.setAttribute('data-zustand', e.zustand);

    var kopf = '<div class="kraft__kopf">' +
      '<span class="kraft__name">' + sicher(s.mitarbeiter.name) + '</span>' +
      '<span class="kraft__plan">geplant ' + K.zeitAusMinuten(s.beginn) + '&ndash;' + K.zeitAusMinuten(s.ende) +
      (s.pause ? ' &middot; ' + s.pause + ' min Pause' : '') + '</span></div>';

    var wahl = '<div class="kraft__wahl">' +
      knopf('plan', 'war wie geplant da', e) +
      knopf('anders', 'andere Zeit', e) +
      knopf('ausfall', 'nicht da', e) +
      '</div>';

    var zeiten = '';
    if (e && e.zustand === 'anders') {
      zeiten = '<div class="kraft__zeiten">' +
        stellrad('beginn', 'Von', e.beginn) +
        stellrad('ende', 'Bis', e.ende) +
        '<div><label for="pause-' + s.id + '">Pause min</label>' +
        '<input class="zeitfeld pausenfeld" id="pause-' + s.id + '" data-tun="pause" inputmode="numeric" value="' + (e.pause || 0) + '" /></div>' +
        '<div style="align-self:end;color:var(--muted);font-size:.8rem">' +
        K.stundenText(K.dauer(e.beginn, e.ende) - (e.pause || 0)) + '</div></div>';
    }

    li.innerHTML = kopf + wahl + zeiten;
    return li;
  }

  function knopf(zustand, text, e) {
    var an = e && e.zustand === zustand;
    return '<button class="knopf knopf--klein' + (zustand === 'ausfall' ? ' knopf--warn' : '') +
      '" type="button" data-tun="zustand" data-wert="' + zustand + '" aria-pressed="' + (an ? 'true' : 'false') + '">' +
      text + '</button>';
  }

  function stellrad(feld, beschriftung, minuten) {
    return '<div><label>' + beschriftung + '</label><span class="stellrad">' +
      '<button type="button" data-tun="stell" data-feld="' + feld + '" data-schritt="-15" aria-label="' + beschriftung + ' 15 Minuten frueher">&minus;</button>' +
      '<input class="zeitfeld" data-tun="zeit" data-feld="' + feld + '" inputmode="numeric" value="' + K.zeitAusMinuten(minuten) + '" aria-label="' + beschriftung + '" />' +
      '<button type="button" data-tun="stell" data-feld="' + feld + '" data-schritt="15" aria-label="' + beschriftung + ' 15 Minuten spaeter">+</button>' +
      '</span></div>';
  }

  function sicher(t) {
    return String(t === null || t === undefined ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function schichtZu(el) {
    var li = el.closest('.kraft');
    if (!li) return null;
    var id = li.getAttribute('data-id');
    return Z.soll.filter(function (s) { return String(s.id) === String(id); })[0] || null;
  }

  /* ---- Bedienen ------------------------------------------------ */
  function zustandSetzen(s, zustand) {
    if (zustand === 'plan') {
      Z.stand[s.id] = { zustand: 'plan', beginn: s.beginn, ende: s.ende, pause: s.pause || 0 };
    } else if (zustand === 'ausfall') {
      Z.stand[s.id] = { zustand: 'ausfall' };
    } else {
      var vorher = Z.stand[s.id];
      Z.stand[s.id] = {
        zustand: 'anders',
        beginn: vorher && vorher.beginn !== undefined ? vorher.beginn : s.beginn,
        ende: vorher && vorher.ende !== undefined ? vorher.ende : s.ende,
        pause: vorher && vorher.pause !== undefined ? vorher.pause : (s.pause || 0)
      };
    }
    speichern();
    zeichnen();
  }

  /* ---- Absenden ------------------------------------------------ */
  function paketBauen() {
    var liste = gefiltert();
    var ist = [], ausfaelle = [];
    liste.forEach(function (s) {
      var e = Z.stand[s.id];
      if (!e) return;
      if (e.zustand === 'ausfall') {
        ausfaelle.push({ schichtId: s.id, name: s.mitarbeiter.name, datum: s.datum || Z.tag,
                         grund: 'vom Schichtleiter als Ausfall gemeldet' });
        return;
      }
      ist.push({
        rohname: s.mitarbeiter.name,
        personalnummer: s.mitarbeiter.personalnummer || '',
        beginn: e.beginn, ende: e.ende, pause: e.pause || 0,
        datum: s.datum || Z.tag,
        quelle: 'erfassung',
        bemerkung: e.zustand === 'plan' ? 'wie geplant best&auml;tigt' : 'vom Schichtleiter korrigiert'
      });
    });
    return {
      tag: Z.tag,
      einsatz: Z.einsatz,
      melder: $('#melder').value.trim(),
      bemerkung: $('#bemerkung').value.trim(),
      erzeugt: new Date().toISOString(),
      zeilen: ist,
      ausfaelle: ausfaelle
    };
  }

  function absenden() {
    var liste = gefiltert();
    var offen = liste.filter(function (s) { return !Z.stand[s.id]; });
    if (offen.length && !confirm(offen.length + ' Personen sind noch nicht gemeldet. Trotzdem senden?')) return;
    if (!$('#melder').value.trim()) {
      meldung('warnung', 'Bitte kurz den eigenen Namen eintragen &ndash; das B&uuml;ro muss wissen, wer gemeldet hat.');
      $('#melder').focus();
      return;
    }
    var paket = paketBauen();
    if (!paket.zeilen.length && !paket.ausfaelle.length) { meldung('warnung', 'Es ist noch nichts eingetragen.'); return; }

    $('#absenden').disabled = true;

    if (!Z.bruecke) { ersatzweg(paket); return; }

    fetch(adresse('/api/erfassung'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paket)
    }).then(function (a) {
      if (!a.ok) throw new Error('Antwort ' + a.status);
      return a.json();
    }).then(function () {
      meldung('gut', '<b>Danke &ndash; ist beim B&uuml;ro.</b> Morgen fr&uuml;h liegt es dort im Abgleich.', true);
      $('#absenden').textContent = 'gesendet';
    }).catch(function () {
      $('#absenden').disabled = false;
      ersatzweg(paket);
    });
  }

  /* Ohne Verbindung: als Mail rausgeben. Lieber ein umstaendlicher
     Weg, der funktioniert, als eine Meldung, die nur bedauert. */
  function ersatzweg(paket) {
    var zeilen = paket.zeilen.map(function (z) {
      return z.rohname + '  ' + K.zeitAusMinuten(z.beginn) + '-' + K.zeitAusMinuten(z.ende) +
             (z.pause ? '  ' + z.pause + ' min Pause' : '');
    });
    paket.ausfaelle.forEach(function (a) { zeilen.push(a.name + '  AUSFALL'); });
    var text = 'Zeiten ' + K.datumDeutsch(paket.tag) + (paket.einsatz ? ' – ' + paket.einsatz : '') + '\n' +
      'Gemeldet von: ' + paket.melder + '\n\n' + zeilen.join('\n') +
      (paket.bemerkung ? '\n\nBemerkung: ' + paket.bemerkung : '') + '\n';
    var url = 'mailto:dispo@hermserviceteam.com?subject=' +
      encodeURIComponent('Zeiten ' + paket.tag + (paket.einsatz ? ' – ' + paket.einsatz : '')) +
      '&body=' + encodeURIComponent(text);
    meldung('warnung', 'Keine Verbindung ins B&uuml;ronetz. Die Meldung wird als <b>E-Mail</b> ge&ouml;ffnet &ndash; ' +
      'einmal senden, dann ist sie durch.', true);
    location.href = url;
    $('#absenden').disabled = false;
  }

  /* ---- Start --------------------------------------------------- */
  function start() {
    var p = new URLSearchParams(location.search);
    Z.tag = p.get('tag') || K.heuteIso(0);
    Z.token = p.get('t') || '';
    Z.basis = (location.port === '8770' || location.protocol === 'file:') ? '' : location.origin;
    if (location.protocol === 'file:') Z.basis = 'http://127.0.0.1:8770';

    try {
      var gemerkt = localStorage.getItem('hst.erfassung.melder');
      if (gemerkt) $('#melder').value = gemerkt;
    } catch (e) {}
    $('#melder').addEventListener('change', function () {
      try { localStorage.setItem('hst.erfassung.melder', this.value.trim()); } catch (e) {}
    });

    $('#einsatzWahl').addEventListener('change', function () { Z.einsatz = this.value; zeichnen(); });

    $('#alleGeplant').addEventListener('click', function () {
      gefiltert().forEach(function (s) {
        Z.stand[s.id] = { zustand: 'plan', beginn: s.beginn, ende: s.ende, pause: s.pause || 0 };
      });
      speichern();
      zeichnen();
    });

    $('#crew').addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-tun]');
      if (!el || el.tagName === 'INPUT') return;
      var s = schichtZu(el);
      if (!s) return;
      if (el.getAttribute('data-tun') === 'zustand') {
        zustandSetzen(s, el.getAttribute('data-wert'));
      } else if (el.getAttribute('data-tun') === 'stell') {
        var e = Z.stand[s.id];
        if (!e || e.zustand !== 'anders') return;
        var feld = el.getAttribute('data-feld');
        e[feld] = ((e[feld] + parseInt(el.getAttribute('data-schritt'), 10)) % 1440 + 1440) % 1440;
        speichern();
        zeichnen();
      }
    });

    $('#crew').addEventListener('change', function (ev) {
      var el = ev.target;
      var tun = el.getAttribute && el.getAttribute('data-tun');
      if (!tun) return;
      var s = schichtZu(el);
      var e = s && Z.stand[s.id];
      if (!e) return;
      if (tun === 'pause') e.pause = Math.max(0, parseInt(el.value, 10) || 0);
      if (tun === 'zeit') {
        var min = K.minutenAusZeit(el.value);
        if (min === null) { meldung('warnung', 'Das war keine Uhrzeit.'); zeichnen(); return; }
        e[el.getAttribute('data-feld')] = min;
      }
      speichern();
      zeichnen();
    });

    $('#absenden').addEventListener('click', absenden);

    setDraht('suche', 'verbinde');
    planLaden();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
