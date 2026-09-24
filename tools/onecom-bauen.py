#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Das Paket für one.com
=====================

one.com ist klassischer Webspace: Apache und PHP, kein Node. Das Paket für
Netlify passt dort nicht, und zwar an drei Stellen — jede davon wäre ein
stiller Fehler, keiner davon würde eine Meldung erzeugen.

1.  **Die Funktion läuft nicht.** `netlify/functions/formular.js` ist ein
    Node-Bündel von 2 MB. Apache liefert es als Datei aus, statt es
    auszuführen: der gesamte Serverteil läge unter
    `https://…/netlify/functions/formular.js` offen im Netz, und
    `/api/formular` gäbe es trotzdem nicht.

2.  **Netlify Forms gibt es nicht** — und das ist die gefährlichste der
    drei. `main.js` arbeitet eine Kette ab: erst `/api/formular`, dann
    `data-netlify="true"`, dann `mailto:`. Der zweite Schritt schickt
    einen POST auf die eigene Seitenadresse. Auf Netlify nimmt den ein
    Formularspeicher an; auf Apache antwortet dieselbe Adresse mit der
    HTML-Seite und **Status 200**. `main.js` liest 200 als Erfolg und
    zeigt „Vielen Dank für Ihre Anfrage" — für eine Anfrage, die nirgends
    angekommen ist. Deshalb fällt `data-netlify` hier aus dem Markup.

3.  **`netlify.toml` ist wirkungslos.** Die Adressen ohne `.html`, die
    Sicherheitskopfzeilen und die Fehlerseite stehen dort; auf Apache
    gehören sie in `.htaccess`.

Was dieses Skript daraus macht: denselben Inhalt, den Serverteil gegen
`api/formular.php` getauscht, `.htaccess` statt `netlify.toml`.

    python3 tools/onecom-bauen.py
    python3 tools/onecom-bauen.py --wurzel redesign --ziel herm-website-onecom.zip
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Was auf einem Apache-Webspace nichts zu suchen hat.
RAUS_ORDNER = {'netlify'}
RAUS_DATEIEN = {'netlify.toml', 'AENDERUNGEN.md', '_headers', '_redirects'}

HTACCESS = r'''# ============================================================
# HERM Service Team — Konfiguration für one.com
# ------------------------------------------------------------
# Diese Datei gehört ins Wurzelverzeichnis der Website, also
# neben index.html. Sie ersetzt netlify.toml: Adressen ohne
# .html, Sicherheitskopfzeilen, Fehlerseite, Zwischenspeicher.
#
# Wenn etwas nicht geht, liegt es fast immer an einem Modul,
# das der Hoster nicht anbietet. Jeder Block steht deshalb in
# einem <IfModule> — ein fehlendes Modul führt dann nicht zu
# einem Fehler 500, sondern der Block wird übersprungen.
# ============================================================

# ---- Die Formularfunktion ----
# Die Website ruft /api/formular auf, genau wie auf Netlify und Vercel.
# Diese Zeile verbindet beides; im Browser besteht kein Unterschied.
# Sie muss VOR der allgemeinen Regel für Adressen ohne .html stehen.
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteRule ^api/formular/?$ api/formular.php [L]
</IfModule>

# ---- Die Zugangsdaten sind nicht abrufbar ----
# PHP führt die Datei ohnehin aus, statt sie auszuliefern — wer sie im
# Browser aufruft, sieht eine leere Seite. Diese Sperre ist die zweite
# Sicherung für den Fall, dass PHP auf dem Webspace einmal abgeschaltet
# ist: dann lieferte Apache den Quelltext als Text aus, samt Kennwort.
<IfModule mod_authz_core.c>
  <FilesMatch "^(konfiguration|smtp)\.php$">
    Require all denied
  </FilesMatch>
</IfModule>
<IfModule !mod_authz_core.c>
  <FilesMatch "^(konfiguration|smtp)\.php$">
    Order allow,deny
    Deny from all
  </FilesMatch>
</IfModule>

# ---- Sicherheit ----
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
  Header set Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=(), interest-cohort=()"
  # Nur bei echtem HTTPS setzen, sonst sperrt man eine noch nicht
  # umgestellte Domain selbst aus.
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains" "expr=%{HTTPS} == 'on'"
  # Die Seite lädt nichts von fremden Servern. 'unsafe-inline' ist nötig
  # für die Inline-Stile im Markup und die eine Zeile im <head>, die die
  # JS-Sperre aufhebt.
  Header set Content-Security-Policy "default-src 'self'; img-src 'self' data:; media-src 'self'; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'; base-uri 'self'; object-src 'none'"
</IfModule>

# ---- Dateitypen, die ältere Apache-Konfigurationen nicht kennen ----
# Ohne AddType für avif kommt die Datei als application/octet-stream an.
# Zusammen mit nosniff weiter oben darf der Browser sie dann nicht als
# Bild verwenden — und die halbe Website bliebe leer.
<IfModule mod_mime.c>
  AddType font/woff2  .woff2
  AddType video/webm  .webm
  AddType audio/webm  .weba
  AddType video/mp4   .mp4
  AddType audio/mp4   .m4a
  AddType image/webp  .webp
  AddType image/avif  .avif
  AddType text/vtt    .vtt
</IfModule>

# ---- Komprimierung ----
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript
  AddOutputFilterByType DEFLATE image/svg+xml text/xml text/plain application/json
</IfModule>

# ---- Zwischenspeicher ----
# Bilder, Schriften, Film und Musik ändern sich selten und tragen einen
# festen Namen: lange speichern. HTML immer frisch holen, sonst sieht das
# Büro im Test noch den Stand von gestern.
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpeg              "access plus 1 year"
  ExpiresByType image/webp              "access plus 1 year"
  ExpiresByType image/avif              "access plus 1 year"
  ExpiresByType image/png               "access plus 1 year"
  ExpiresByType font/woff2              "access plus 1 year"
  ExpiresByType video/webm              "access plus 1 year"
  ExpiresByType video/mp4               "access plus 1 year"
  ExpiresByType audio/webm              "access plus 1 year"
  ExpiresByType audio/mp4               "access plus 1 year"
  ExpiresByType text/css                "access plus 1 week"
  ExpiresByType application/javascript  "access plus 1 week"
  ExpiresByType text/html               "access plus 0 seconds"
</IfModule>

# ---- Fehlerseite ----
ErrorDocument 404 /404.html

# ---- Keine Verzeichnislisten ----
Options -Indexes

# ---- Adressen ohne .html ----
<IfModule mod_rewrite.c>
  RewriteEngine On

  # Adressen der bisherigen Website. Ohne diese beiden Zeilen liefe jeder
  # Treffer aus einer Suchmaschine darauf ins 404; 301 gibt die Bewertung
  # an die neue Adresse weiter.
  RewriteRule ^ueber-uns/?$ /team.html [R=301,L]
  RewriteRule ^news/?$ / [R=301,L]

  # Sonderfall: dienstleistungen.html liegt neben dem Ordner
  # dienstleistungen/. Die allgemeine Regel unten nimmt Verzeichnisse aus
  # (!-d) — ohne diese Zeile landete /dienstleistungen auf dem Ordner
  # statt auf der Übersichtsseite.
  RewriteRule ^dienstleistungen/?$ dienstleistungen.html [L]

  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_FILENAME}\.html -f
  RewriteRule ^(.*)$ $1.html [L]
</IfModule>
'''

LIESMICH = '''HERM Service Team — Website für one.com
=======================================

SO WIRD SIE HOCHGELADEN

1. Im Kundenmenü von one.com den Dateimanager öffnen.
2. In den Ordner wechseln, der die Website trägt. Bei one.com heißt er
   in aller Regel "public_html" oder "www".
3. Den GESAMTEN Inhalt dieses Pakets dorthin hochladen — also index.html,
   404.html, .htaccess, die Ordner assets/, api/, dienstleistungen/ und
   die übrigen Dateien.

   Der Dateimanager von one.com kann eine ZIP-Datei entpacken: hochladen,
   Rechtsklick, "Extrahieren". Das ist schneller als 200 Einzeldateien.

4. Prüfen, dass .htaccess wirklich oben liegt. Dateien mit einem Punkt am
   Anfang blendet mancher Dateimanager aus; im one.com-Dateimanager gibt
   es dafür oben rechts einen Schalter "Versteckte Dateien anzeigen".
   OHNE DIESE DATEI gibt es keine Adressen ohne .html, keine Fehlerseite
   und kein funktionierendes Formular.


DAMIT DAS FORMULAR MAILS VERSCHICKT

Eine einzige Datei bearbeiten: api/konfiguration.php

Dort stehen fünf leere Felder. Einzutragen sind die Zugangsdaten des
Postfachs, ÜBER DAS versendet werden soll. Bei one.com stehen sie im
Kundenmenü unter "E-Mail" und lauten in aller Regel:

    SMTP_HOST   send.one.com
    SMTP_PORT   465
    SMTP_USER   die vollständige Adresse des Postfachs
    SMTP_PASS   das Kennwort dieses Postfachs

Die Empfängerfelder können leer bleiben: dann gehen Personalanfragen und
Bewerbungen an info@hermserviceteam.com.

Solange die Felder leer sind, verschickt das Formular nichts und sagt das
auch — es zeigt kein falsches "Danke".


WAS AUF one.com ANDERS IST ALS AUF NETLIFY

· Der PDF-Beleg und der Angebotsentwurf als Word-Datei entfallen. Die
  beiden entstehen in einer Node-Funktion, und Node gibt es auf
  klassischem Webspace nicht. Jede Angabe aus dem Formular steht
  stattdessen im Text der Mail.

· Der Bestandskundenbereich auf der Kontaktseite bleibt verborgen. Er
  braucht eine Datenbank; ohne sie zeigt die Seite ihn gar nicht erst an.
  Das ist so gebaut und kein Fehler.

· Alles Übrige ist unverändert: alle sechzehn Seiten, der
  Hintergrundfilm, die Musik am Tonschalter, die Galerie, die Bewegung.


WENN ETWAS NICHT GEHT

· Seite lädt, aber ohne Bilder und Schriften
  → .htaccess fehlt oder liegt im falschen Ordner.

· Formular meldet "Das Absenden hat nicht geklappt"
  → in api/konfiguration.php stimmt eine der vier SMTP-Angaben nicht.
     Die genaue Meldung des Mailservers steht im Fehlerprotokoll von PHP;
     bei one.com im Kundenmenü unter "Fehlerprotokoll" oder als Datei
     error_log neben api/formular.php.

· Adressen ohne .html führen ins Leere
  → mod_rewrite ist nicht aktiv. Dann bleiben die Seiten unter ihrer
     vollen Adresse erreichbar (/kontakt.html statt /kontakt); die
     Website funktioniert, nur die kurzen Adressen nicht.
'''


def bauen(wurzel: str, ziel: str, onecom_teile: str) -> int:
    if not os.path.isdir(wurzel):
        print(f'Ordner nicht gefunden: {wurzel}', file=sys.stderr)
        return 1

    buehne = tempfile.mkdtemp(prefix='onecom-')
    baum = os.path.join(buehne, 'site')
    os.makedirs(baum)

    # --- Spiegeln, ohne das, was Apache nicht braucht ---------------------
    #  Gespiegelt und DANN verändert, nicht beim Kopieren gefiltert: was ins
    #  Paket soll, liegt so vorher vollständig da, und ausgelassen wird nur,
    #  was ausdrücklich auf der Liste steht.
    kopiert = 0
    for ordner, unter, dateien in os.walk(wurzel):
        rel = os.path.relpath(ordner, wurzel)
        if rel == '.':
            rel = ''
        unter[:] = [u for u in unter if u not in RAUS_ORDNER and not u.startswith('.')]
        os.makedirs(os.path.join(baum, rel), exist_ok=True)
        for d in dateien:
            if d in RAUS_DATEIEN:
                continue
            shutil.copy2(os.path.join(ordner, d), os.path.join(baum, rel, d))
            kopiert += 1
    print(f'→ {kopiert} Dateien gespiegelt')

    # --- Der Serverteil ---------------------------------------------------
    os.makedirs(os.path.join(baum, 'api'), exist_ok=True)
    for d in ('formular.php', 'smtp.php', 'konfiguration.php'):
        shutil.copy2(os.path.join(onecom_teile, d), os.path.join(baum, 'api', d))
    print('→ api/formular.php, api/smtp.php, api/konfiguration.php eingesetzt')

    # Die Konfiguration muss leer ausgeliefert werden. Wer hier einmal
    # versehentlich mit ausgefüllten Feldern baut, verteilt ein Kennwort.
    konf = open(os.path.join(baum, 'api', 'konfiguration.php'), encoding='utf-8').read()
    gefuellt = [z.strip() for z in konf.splitlines()
                if re.match(r"\s*'(SMTP_PASS|SMTP_USER|SMTP_HOST)'\s*=>\s*'[^']+'", z)]
    if gefuellt:
        print('   ABBRUCH: in konfiguration.php stehen Zugangsdaten:', file=sys.stderr)
        for z in gefuellt:
            print('     ' + re.sub(r"=>\s*'[^']*'", "=> '…'", z), file=sys.stderr)
        return 1

    # --- .htaccess und Liesmich ------------------------------------------
    with open(os.path.join(baum, '.htaccess'), 'w', encoding='utf-8') as f:
        f.write(HTACCESS)
    with open(os.path.join(baum, 'LIESMICH.txt'), 'w', encoding='utf-8') as f:
        f.write(LIESMICH)
    print('→ .htaccess und LIESMICH.txt geschrieben')

    # --- Den Netlify-Auffangweg aus dem Markup nehmen ---------------------
    #  Siehe Punkt 2 im Kopf dieser Datei: auf Apache meldet er Erfolg für
    #  eine Anfrage, die niemand bekommen hat.
    n = 0
    for ordner, _, dateien in os.walk(baum):
        for d in dateien:
            if not d.endswith('.html'):
                continue
            p = os.path.join(ordner, d)
            s = open(p, encoding='utf-8').read()
            neu = re.sub(r'\s*data-netlify="true"', '', s)
            neu = re.sub(r'\s*netlify-honeypot="[^"]*"', '', neu)
            if neu != s:
                open(p, 'w', encoding='utf-8').write(neu)
                n += 1
    print(f'→ data-netlify aus {n} Seiten genommen')

    # --- Packen -----------------------------------------------------------
    ziel_abs = os.path.abspath(ziel)
    if os.path.exists(ziel_abs):
        os.remove(ziel_abs)
    # `zip -r .` nimmt auch Punktdateien mit, und genau die .htaccess
    # braucht das Paket.
    subprocess.run(['zip', '-qr', ziel_abs, '.'], cwd=baum, check=True)

    # --- Prüfen ------------------------------------------------------------
    import zipfile
    z = zipfile.ZipFile(ziel_abs)
    namen = set(z.namelist())

    fehlt = [p for p in ('.htaccess', 'index.html', 'api/formular.php',
                         'api/smtp.php', 'api/konfiguration.php', 'LIESMICH.txt')
             if p not in namen]
    ueberzaehlig = sorted(x for x in namen
                          if x.startswith('netlify') or x.endswith('netlify.toml'))
    rest = sorted(x for x in namen if 'data-netlify' in x)

    # Jede Adresse aus dem Markup muss im Paket liegen.
    import posixpath
    ATTR = (r'(?:src|srcset|href|data-gross|data-quer-mp4|data-quer-webm'
            r'|data-hoch-mp4|data-hoch-webm|data-musik-webm|data-musik-m4a)')
    tot = set()
    for name in sorted(x for x in namen if x.endswith('.html')):
        s = z.read(name).decode('utf-8', 'replace')
        basis = posixpath.dirname(name)
        for m in re.finditer(ATTR + r'="([^"]+)"', s):
            for teil in m.group(1).split(','):
                adr = teil.strip().split(' ')[0]
                if not adr or adr.startswith(('http', '#', 'mailto:', 'tel:',
                                              'data:', 'R0lGOD', '…', '/api/')):
                    continue
                p = posixpath.normpath(posixpath.join(basis, adr))
                if p not in namen:
                    tot.add((name, p))

    mb = os.path.getsize(ziel_abs) / 1024 / 1024
    print(f'\nFertig: {ziel}  ({mb:.1f} MB, {len(namen)} Einträge)')
    print(f'   fehlende Pflichtdateien:      {fehlt or "keine"}')
    print(f'   Netlify-Reste im Paket:       {ueberzaehlig or "keine"}')
    print(f'   tote Bildadressen im Markup:  {len(tot)}')
    for a, b in sorted(tot)[:10]:
        print(f'     {a} → {b}')

    shutil.rmtree(buehne, ignore_errors=True)
    return 1 if (fehlt or ueberzaehlig or tot or rest) else 0


def main() -> int:
    a = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument('--wurzel', default=os.path.join(WURZEL, 'redesign'),
                   help='der Ordner mit der Website (Vorgabe: redesign/)')
    a.add_argument('--ziel', default=os.path.join(WURZEL, 'herm-website-onecom.zip'))
    a.add_argument('--teile', default=os.path.join(WURZEL, 'tools', 'onecom'),
                   help='wo formular.php, smtp.php und konfiguration.php liegen')
    args = a.parse_args()
    return bauen(args.wurzel, args.ziel, args.teile)


if __name__ == '__main__':
    sys.exit(main())
