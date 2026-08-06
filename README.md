# HERM Service Team — Website

Statische Website (HTML/CSS/JS, kein Framework, kein Build-Schritt).
Stand: **interne Testfassung**. Sie ist technisch startklar, aber bewusst noch
gegen Suchmaschinen gesperrt und darf nicht auf die Live-Domain.

---

## Schnellstart

```bash
python3 -m http.server 8000     # oder: npx serve
# → http://localhost:8000
```

Ein Build ist nicht nötig. Was im Ordner liegt, ist die Website.

---

## Aufbau

```
index.html              Startseite
kontakt.html            Anfrageformular
jobs.html               Stellen, FAQ, Bewerbungsformular
team.html               Büroteam
galerie.html            Bildergalerie mit Lightbox
impressum.html          Pflichtangaben
datenschutz.html        Datenschutzerklärung
404.html                Fehlerseite
dienstleistungen/*.html sechs Leistungsseiten

assets/css/styles.css   einzige Design-Quelle (Tokens ganz oben)
assets/css/fonts.css    @font-face für die lokalen Schriften
assets/js/main.js       alle Interaktionen
assets/fonts/           Schriftdateien (woff2)
assets/img/             Fotos, je einmal als .jpg und .webp
assets/video/           Imagefilm + Untertitel

netlify.toml            Hosting-Konfiguration (Header, Adressen, Zwischenspeicher)
robots.txt              sperrt derzeit alles
sitemap.xml             für später
```

Gestaltungsregeln stehen in `CLAUDE.md`.

---

## Formulare

Zwei Formulare: **Anfrage** (`kontakt.html`) und **Bewerbung** (`jobs.html`).
Beide prüfen Pflichtfelder, melden Fehler am jeweiligen Feld, bestätigen den
Versand und wehren Bots ab (unsichtbares Zusatzfeld + Zeitprüfung).

Der Versandweg wird in dieser Reihenfolge gewählt (`assets/js/main.js`):

| Bedingung am `<form>` | Weg |
|---|---|
| `data-endpunkt="https://…"` | POST an diese Adresse (Formspree, eigenes Backend) |
| `data-netlify="true"` | Netlify Forms — POST auf `/`, ohne Zugangsschlüssel |
| keins von beidem | öffnet das Mailprogramm mit fertiger Nachricht |

Aktuell ist `data-netlify="true"` gesetzt. **Auf Netlify funktionieren die
Formulare damit sofort**, ohne dass irgendwo ein Schlüssel hinterlegt werden
muss. Nach dem ersten Deploy einmalig einstellen:

> Netlify → Site → **Forms** → *Form notifications* → *Email notification*
> * `anfrage` → **dispo@hermserviceteam.com**
> * `bewerbung` → **info@hermserviceteam.com**

Auf einem anderen Host: `data-netlify="true"` entfernen und stattdessen
`data-endpunkt="https://formspree.io/f/xxxxxxx"` setzen. Sonst ändert sich nichts.

Ohne Netlify und ohne Endpunkt bleibt der Mail-Weg — funktionsfähig, aber
nicht schön: der Absender muss die Mail selbst abschicken.

---

## Auf Netlify veröffentlichen (empfohlen)

1. netlify.com → **Add new site → Import an existing project** → GitHub →
   dieses Repository, Branch `claude/entpacken-demo-oeffnen-29f7th`.
2. Build command: **leer lassen.** Publish directory: **`.`**
   (`netlify.toml` setzt beides bereits.)
3. Deploy. Es entsteht eine Adresse wie `https://zufallsname.netlify.app`.
4. **Passwortschutz:** Site configuration → *Access & security* →
   *Visitor access* → **Password protection**. Danach ist die Vorschau nur
   mit Passwort erreichbar. Das ist eine Funktion des kostenpflichtigen
   Netlify-Tarifs (Pro).
   *Kostenlose Alternative:* Cloudflare Pages + Cloudflare Access
   (E-Mail-Freigabe für bis zu 50 Personen). Dann laufen die Formulare
   allerdings nicht mehr über Netlify Forms — dort wäre ein Endpunkt nötig.
5. Formular-Benachrichtigungen einstellen (siehe oben).

Die Sperre gegen Suchmaschinen wirkt dabei dreifach: `robots.txt`,
`<meta name="robots">` in jeder Seite und der Header `X-Robots-Tag` aus
`netlify.toml`.

---

## Vor dem Live-Gang

Diese Punkte müssen erledigt sein. Erst danach die Sperren lösen.

**Inhaltlich**

- [ ] Impressum vervollständigen: Handelsregisternummer, USt-IdNr., Behörde
      und Nummer der AÜG-Erlaubnis. Im Text als `bitte ergänzen` markiert.
- [ ] Datenschutzerklärung: Hoster mit Name und Anschrift eintragen,
      Auftragsverarbeitungsvertrag abschließen.
- [ ] Beide Rechtstexte anwaltlich prüfen lassen.
- [ ] Porträts von Maik Herm und Alexander Krapp ergänzen
      (`assets/img/team/`, Format wie die vorhandenen: 1000 × 1250).
- [ ] Echten Imagefilm einsetzen (siehe `CLAUDE.md`), Musik lizenzieren.

**Technisch**

- [ ] `robots.txt`: oberen Block löschen, unteren einkommentieren.
- [ ] In allen 14 Seiten den Block `TESTBETRIEB` samt
      `<meta name="robots" content="noindex, …">` entfernen.
- [ ] In `netlify.toml` die Zeile `X-Robots-Tag` entfernen.
- [ ] Domain verbinden, HTTPS-Zertifikat erzeugen lassen.
- [ ] `sitemap.xml` in der Google Search Console einreichen.
- [ ] Passwortschutz aufheben.

Suchbefehl für alle drei Sperren auf einmal:

```bash
grep -rn "TESTBETRIEB" . --include="*.html" --include="*.toml" --include="*.txt"
```

---

## Prüfungen

Die Testskripte liegen nicht im Repository; geprüft wurde vor der Übergabe:

- alle Links, Sprungmarken und Dateipfade auf 14 Seiten (841 Links)
- jeder Link und Knopf hat einen zugänglichen Namen
- Farbkontraste nach WCAG auf allen Seiten, auch bei geöffnetem Menü
- kein waagerechter Überlauf bei 320, 390, 768, 1280 und 1440 px
- Formulare: Pflichtfeldprüfung, Fehlermeldungen, Korrekturverhalten,
  Honigtopf, Übermittlung, Bestätigung — auf Desktop und Smartphone
- keine JavaScript-Fehler, keine fehlenden Dateien
- `prefers-reduced-motion` und Betrieb ohne JavaScript

---

## Was bewusst nicht drin ist

Keine Cookies, kein Tracking, keine Analyse-Werkzeuge, keine externen
Schriften, keine Social-Media-Plugins. Deshalb braucht die Seite auch kein
Cookie-Banner. Wer das ändert, muss die Datenschutzerklärung nachziehen.
