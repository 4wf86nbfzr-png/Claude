/* Dashboard: holt den Zustand und zeigt ihn an.
 *
 * Es rechnet nichts selbst. Alles, was hier steht, kommt vom Dienst -- sonst
 * koennte die Oberflaeche behaupten, eine Aufgabe sei fertig, obwohl der
 * Aufgabenmanager das nicht sagt.
 */

(function () {
  'use strict';

  const ZUSTAND_TEXT = {
    'untaetig':     'bereit',
    'zuhoeren':     'ich höre zu',
    'verarbeiten':  'einen Moment',
    'sprechen':     'ich spreche',
    'fehler':       'Störung',
    'ohne sprache': 'ohne Sprachsteuerung'
  };

  const el = (id) => document.getElementById(id);
  const kern = new ReactorCore(el('kern'));
  kern.starten();

  let ws = null;
  let wiederverbindeIn = 1000;

  /* -- Verbindung ----------------------------------------------------- */
  function verbinden() {
    const protokoll = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(protokoll + '//' + location.host + '/ws');

    ws.onopen = () => {
      wiederverbindeIn = 1000;
      el('verbindung').dataset.an = 'true';
    };

    ws.onclose = () => {
      el('verbindung').dataset.an = 'false';
      kern.setzen('fehler', 0, false);
      el('zustand').textContent = 'keine Verbindung';
      el('zustandZusatz').textContent = 'Läuft der Dienst noch?';
      // Mit Rueckstau wieder versuchen, statt den Server zu bestürmen.
      setTimeout(verbinden, wiederverbindeIn);
      wiederverbindeIn = Math.min(wiederverbindeIn * 2, 15000);
    };

    ws.onmessage = (ereignis) => {
      let daten;
      try { daten = JSON.parse(ereignis.data); } catch (e) { return; }
      if (daten.typ === 'status') { anzeigen(daten); }
      else if (daten.typ === 'antwort') { dialogZeile('Jarvis', daten.text); }
    };
  }

  /* -- Anzeige -------------------------------------------------------- */
  function anzeigen(d) {
    kern.setzen(d.zustand, d.pegel, d.spricht);

    el('zustand').textContent = ZUSTAND_TEXT[d.zustand] || d.zustand;
    el('modell').textContent = d.modell + (d.modell_bereit ? '' : ' — nicht bereit');
    el('laufzeit').textContent = laufzeit(d.laufzeit);

    let zusatz = '';
    if (d.rueckfrage) { zusatz = d.rueckfrage; }
    else if (d.letzter_fehler) { zusatz = d.letzter_fehler; }
    else if (!d.modell_bereit) { zusatz = d.modell_grund; }
    else if (d.letzte_latenz) { zusatz = 'Antwort nach ' + d.letzte_latenz + ' s'; }
    el('zustandZusatz').textContent = zusatz;

    el('aufgabenZahl').textContent = d.aufgaben_offen;
    aufgabenZeigen(d.aufgaben || []);
  }

  function laufzeit(sekunden) {
    const s = Math.floor(sekunden || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h) { return h + ' h ' + m + ' min'; }
    if (m) { return m + ' min'; }
    return s + ' s';
  }

  function aufgabenZeigen(aufgaben) {
    const liste = el('aufgaben');
    liste.textContent = '';
    if (!aufgaben.length) {
      liste.appendChild(leerzeile('Nichts offen.'));
      return;
    }
    aufgaben.forEach((a) => {
      const li = document.createElement('li');
      const marker = document.createElement('span');
      marker.className = 'marker';
      marker.dataset.status = a.status;
      const text = document.createElement('span');
      text.className = 'eintrag';
      const titel = document.createElement('span');
      titel.className = 'eintrag__titel';
      titel.textContent = a.titel;
      text.appendChild(titel);
      if (a.grund) {
        const grund = document.createElement('span');
        grund.className = 'eintrag__zusatz eintrag__zusatz--warn';
        grund.textContent = a.grund;
        text.appendChild(grund);
      }
      li.appendChild(marker);
      li.appendChild(text);
      liste.appendChild(li);
    });
  }

  function leerzeile(text) {
    const li = document.createElement('li');
    li.className = 'leer';
    li.textContent = text;
    return li;
  }

  /* -- Dialog --------------------------------------------------------- */
  function dialogZeile(wer, text, art) {
    if (!text) { return; }
    const dialog = el('dialog');
    const zeile = document.createElement('div');
    zeile.className = 'zeile' + (wer === 'Du' ? ' zeile--du' : '')
                    + (art === 'frage' ? ' zeile--frage' : '');
    const label = document.createElement('span');
    label.className = 'zeile__wer';
    label.textContent = wer;
    const p = document.createElement('p');
    p.className = 'zeile__text';
    p.textContent = text;   // textContent, nicht innerHTML -- Antworten sind Daten
    zeile.appendChild(label);
    zeile.appendChild(p);
    dialog.appendChild(zeile);
    dialog.scrollTop = dialog.scrollHeight;
  }

  /* -- Bedienung ------------------------------------------------------ */
  el('btnWecken').addEventListener('click', () => {
    fetch('/api/wake', { method: 'POST' }).catch(() => {});
  });

  el('btnStopp').addEventListener('click', () => {
    fetch('/api/interrupt', { method: 'POST' }).catch(() => {});
  });

  el('formular').addEventListener('submit', (ereignis) => {
    ereignis.preventDefault();
    const feld = el('text');
    const text = feld.value.trim();
    if (!text) { return; }
    dialogZeile('Du', text);
    feld.value = '';
    feld.disabled = true;
    fetch('/api/say', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.rueckfrage) { dialogZeile('Jarvis', d.rueckfrage, 'frage'); }
        else if (d.text) { dialogZeile('Jarvis', d.text); }
        (d.werkzeuge || []).forEach((w) => {
          if (!w.ok) { dialogZeile('Werkzeug', w.name + ': ' + w.meldung); }
        });
      })
      .catch(() => dialogZeile('Jarvis', 'Der Dienst antwortet nicht.'))
      .finally(() => { feld.disabled = false; feld.focus(); });
  });

  /* -- Langsamer Takt: Listen, die nicht jede Sekunde brauchen -------- */
  function nachladen() {
    fetch('/api/notifications').then((r) => r.json()).then((d) => {
      const liste = el('meldungen');
      liste.textContent = '';
      const meldungen = (d.meldungen || []).slice(0, 12);
      if (!meldungen.length) { liste.appendChild(leerzeile('Keine Meldungen.')); return; }
      meldungen.forEach((m) => {
        const li = document.createElement('li');
        const marker = document.createElement('span');
        marker.className = 'marker';
        marker.dataset.status = m.prioritaet === 'URGENT' ? 'blocked'
                              : (m.gesprochen ? 'done' : 'waiting');
        const text = document.createElement('span');
        text.className = 'eintrag';
        const haupt = document.createElement('span');
        haupt.className = 'eintrag__titel';
        haupt.textContent = m.text;
        text.appendChild(haupt);
        if (m.stumm_weil) {
          const zusatz = document.createElement('span');
          zusatz.className = 'eintrag__zusatz';
          zusatz.textContent = 'nicht gesprochen: ' + m.stumm_weil;
          text.appendChild(zusatz);
        }
        li.appendChild(marker);
        li.appendChild(text);
        liste.appendChild(li);
      });
    }).catch(() => {});

    fetch('/api/health').then((r) => r.json()).then((d) => {
      const liste = el('dienste');
      liste.textContent = '';
      const zeilen = [
        ['Sprachmodell', d.sprachmodell.ok, d.sprachmodell.grund],
        ['Werkzeuge', true, (d.werkzeuge.einsatzbereit || []).length + ' bereit']
      ];
      const sprache = d.sprache || {};
      [['Mikrofon', 'mikrofon'], ['Aktivierungswort', 'aktivierungswort'],
       ['Spracherkennung', 'spracherkennung'], ['Sprachausgabe', 'sprachausgabe']]
        .forEach(([label, schluessel]) => {
          const wert = sprache[schluessel];
          if (Array.isArray(wert)) { zeilen.push([label, wert[0], wert[1]]); }
          else if (sprache.grund) { zeilen.push([label, false, sprache.grund]); }
        });
      zeilen.forEach(([label, ok, grund]) => {
        const li = document.createElement('li');
        li.className = 'dienst';
        const name = document.createElement('span');
        name.textContent = label;
        const wert = document.createElement('span');
        wert.className = 'dienst__wert';
        wert.dataset.ok = String(!!ok);
        wert.textContent = grund || (ok ? 'bereit' : 'nicht bereit');
        li.appendChild(name);
        li.appendChild(wert);
        liste.appendChild(li);
      });
    }).catch(() => {});

    fetch('/api/log?limit=60').then((r) => r.json()).then((d) => {
      const pre = el('protokoll');
      pre.textContent = '';
      (d.zeilen || []).forEach((z) => {
        const zeit = new Date(z.time * 1000).toLocaleTimeString('de-DE');
        const zeile = document.createElement(
          z.level === 'ERROR' || z.level === 'CRITICAL' ? 'b' : 'span');
        zeile.textContent = zeit + '  ' + z.level.padEnd(7) + ' ' + z.message + '\n';
        pre.appendChild(zeile);
      });
      pre.scrollTop = pre.scrollHeight;
    }).catch(() => {});
  }

  verbinden();
  nachladen();
  setInterval(nachladen, 4000);
})();
