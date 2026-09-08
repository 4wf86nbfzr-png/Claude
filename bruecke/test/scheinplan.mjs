/* ============================================================
   Ein secplan-Doppel zum Ueben
   ------------------------------------------------------------
   Gegen das echte secplan.net kann hier niemand testen — dafuer
   braucht es einen Zugang. Also steht hier ein Programm, das sich
   benimmt wie so eine Anwendung: Anmeldung mit Sitzungskeks,
   Tagesplan als Tabelle, Schichtmaske mit Zeitfeldern, Speichern,
   und ein Knopf "Abgleichen", der die Schicht als erledigt
   markiert.

   Bewusst unfreundlich gebaut: nichtssagende Klassennamen, andere
   Feldnamen als man raten wuerde, Zeiten im Format "08:30". Wenn
   die Bruecke damit zurechtkommt, ohne dass ihr jemand Selektoren
   vorgibt, kommt sie auch mit einer echten Anwendung zurecht.

       node test/scheinplan.mjs [port]
   ============================================================ */
import http from 'node:http';

const BENUTZER = 'buero';
const PASSWORT = 'geheim';
const KEKS = 'sp_sitzung=1';

export function schichtenAnlegen() {
  return [
    { id: 'S1', datum: '2026-09-08', name: 'Kuehn-Adler, Ruth', nummer: '2027',
      planung: '123 FM - Sicherheit', von: '08:30', bis: '16:00', pause: '0', abgeglichen: false },
    { id: 'S2', datum: '2026-09-08', name: 'Sanchez, Luis', nummer: '1005',
      planung: '123 FM - Sicherheit', von: '19:00', bis: '02:00', pause: '0', abgeglichen: false },
    { id: 'S3', datum: '2026-09-08', name: 'Fett, Emily', nummer: '2850',
      planung: '125 FM - Hostessen', von: '10:30', bis: '20:00', pause: '0', abgeglichen: false },
    { id: 'S4', datum: '2026-09-07', name: 'Fett, Emily', nummer: '2850',
      planung: '125 FM - Hostessen', von: '09:00', bis: '17:00', pause: '30', abgeglichen: false }
  ];
}

const RAHMEN = (titel, inhalt) => `<!DOCTYPE html><html lang="de"><head>
<meta charset="utf-8"><title>${titel} · SchichtWeb</title>
<style>body{font-family:system-ui;margin:24px;color:#222}table{border-collapse:collapse}
td,th{border:1px solid #bbb;padding:6px 10px;font-size:14px}.q7{color:#080}</style>
</head><body><h1>SchichtWeb</h1>${inhalt}</body></html>`;

export function starten(port = 8791, schichten = schichtenAnlegen()) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const angemeldet = (req.headers.cookie || '').includes(KEKS);

    const senden = (html, code = 200, kopf = {}) => {
      res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', ...kopf });
      res.end(html);
    };
    const koerper = () => new Promise((f) => {
      let d = '';
      req.on('data', (s) => { d += s; });
      req.on('end', () => f(new URLSearchParams(d)));
    });

    // ---- Anmeldung ----
    if (url.pathname === '/' || url.pathname === '/anmelden') {
      if (req.method === 'POST') {
        return koerper().then((f) => {
          if (f.get('kennung') === BENUTZER && f.get('kw') === PASSWORT) {
            return senden('', 302, { 'Set-Cookie': KEKS + '; Path=/', Location: '/uebersicht' });
          }
          senden(RAHMEN('Anmeldung', '<p class="q3">Zugangsdaten stimmen nicht.</p>' + FORMULAR));
        });
      }
      if (angemeldet) return senden('', 302, { Location: '/uebersicht' });
      return senden(RAHMEN('Anmeldung', FORMULAR));
    }

    if (!angemeldet) return senden('', 302, { Location: '/' });

    // ---- Uebersicht ----
    if (url.pathname === '/uebersicht') {
      return senden(RAHMEN('Uebersicht',
        '<p id="wer">Angemeldet als B&uuml;ro</p><p><a href="/tagesplan?d=2026-09-08">Tagesplan</a></p>'));
    }

    // ---- Tagesplan ----
    if (url.pathname === '/tagesplan') {
      const tag = url.searchParams.get('d') || '2026-09-08';
      const zeilen = schichten.filter((s) => s.datum === tag).map((s) => `
        <tr class="q4" data-schicht="${s.id}">
          <td class="q5">${s.planung}</td>
          <td class="q5">${s.name} (${s.nummer})</td>
          <td class="q5">${s.von}</td>
          <td class="q5">${s.bis}</td>
          <td class="q5">${s.abgeglichen ? '<span class="q7">abgeglichen</span>' : 'Nicht abgeglichen'}</td>
          <td><a class="q6" href="/dienst?s=${s.id}">&ouml;ffnen</a></td>
        </tr>`).join('');
      return senden(RAHMEN('Tagesplan', `<p id="wer">Angemeldet als B&uuml;ro</p>
        <h2>Tagesplan ${tag}</h2>
        <table id="q1"><tr><th>Planung</th><th>Mitarbeiter</th><th>von</th><th>bis</th><th>Status</th><th></th></tr>
        ${zeilen}</table>`));
    }

    // ---- Schichtmaske ----
    if (url.pathname === '/dienst') {
      const s = schichten.find((x) => x.id === url.searchParams.get('s'));
      if (!s) return senden(RAHMEN('Fehler', '<p>Unbekannter Dienst</p>'), 404);

      if (req.method === 'POST') {
        return koerper().then((f) => {
          if (f.get('was') === 'abgleichen') {
            s.abgeglichen = true;
          } else {
            s.von = f.get('zeit_a') || s.von;
            s.bis = f.get('zeit_b') || s.bis;
            s.pause = f.get('unterbrechung') || s.pause;
          }
          senden('', 302, { Location: '/dienst?s=' + s.id + '&ok=1' });
        });
      }

      const gemeldet = url.searchParams.get('ok') ? '<p class="q7" id="q9">Gespeichert.</p>' : '';
      return senden(RAHMEN('Dienst', `${gemeldet}
        <h2>Dienst ${s.id}</h2>
        <p>${s.name} (${s.nummer}) &middot; ${s.planung} &middot; ${s.datum}</p>
        <form method="post">
          <p><label>Beginn <input class="q2" name="zeit_a" value="${s.von}"></label></p>
          <p><label>Ende <input class="q2" name="zeit_b" value="${s.bis}"></label></p>
          <p><label>Pause (min) <input class="q2" name="unterbrechung" value="${s.pause}"></label></p>
          <p><button type="submit">Speichern</button></p>
        </form>
        <form method="post">
          <input type="hidden" name="was" value="abgleichen">
          <p><button type="submit">Abgleichen</button></p>
        </form>
        <p>Status: <b id="q8">${s.abgeglichen ? 'abgeglichen' : 'Nicht abgeglichen'}</b></p>
        <p><a href="/tagesplan?d=${s.datum}">zur&uuml;ck</a></p>`));
    }

    senden(RAHMEN('Nichts da', '<p>Nicht gefunden</p>'), 404);
  });

  return new Promise((fertig) => {
    server.listen(port, '127.0.0.1', () => fertig({ server, schichten, port }));
  });
}

const FORMULAR = `<form method="post" action="/anmelden">
  <p><label>Kennung <input class="q2" name="kennung" autocomplete="username"></label></p>
  <p><label>Kennwort <input class="q2" type="password" name="kw" autocomplete="current-password"></label></p>
  <p><button type="submit">Anmelden</button></p>
</form>`;

if (process.argv[1] && process.argv[1].endsWith('scheinplan.mjs')) {
  const port = Number(process.argv[2]) || 8791;
  await starten(port);
  console.log(`SchichtWeb (Doppel) laeuft auf http://127.0.0.1:${port}  —  ${BENUTZER} / ${PASSWORT}`);
}
