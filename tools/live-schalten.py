#!/usr/bin/env python3
"""Schaltet die Website vom Testbetrieb in den Live-Betrieb und zurueck.

Die Sperre gegen Suchmaschinen steht an achtzehn Stellen: in fuenfzehn
Seitenkoepfen als `<meta name="robots">`, in `robots.txt` und je einmal als
Kopfzeile in `vercel.json`, `netlify.toml` und `.htaccess`. Drei Sperren sind
richtig so — wer eine davon uebersieht, hat die Vorschau trotzdem noch
zugedeckt. Achtzehn Handgriffe am Tag des Live-Gangs sind es dagegen nicht.

    python3 tools/live-schalten.py --stand     # zeigt nur, wie es steht
    python3 tools/live-schalten.py --live      # freigeben
    python3 tools/live-schalten.py --test      # wieder sperren

Mehrfach ausfuehrbar: beim zweiten Lauf meldet es null Aenderungen.

Was das Skript NICHT tut: die Sitemap einreichen. Das geschieht einmalig in der
Google Search Console, und dafuer braucht es einen Menschen mit Zugang.
"""
import argparse
import glob
import os
import re
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPERRE = "noindex, nofollow, noarchive, nosnippet"
FREI = "index, follow, max-image-preview:large, max-snippet:-1"

ROBOTS_TEST = """# ============================================================
# TESTBETRIEB — VOR DEM LIVE-GANG ERSETZEN
# Solange diese Datei so aussieht, darf keine Suchmaschine
# irgendetwas von dieser Seite aufnehmen.
#
# Umschalten mit: python3 tools/live-schalten.py --live
# ============================================================
User-agent: *
Disallow: /
"""

ROBOTS_LIVE = """# ============================================================
# LIVE-BETRIEB
# Zurueck in den Testbetrieb: python3 tools/live-schalten.py --test
# ============================================================
User-agent: *
Allow: /
Disallow: /404.html

Sitemap: https://hermserviceteam.com/sitemap.xml
"""


def seiten():
    p = sorted(glob.glob(os.path.join(WURZEL, "*.html")))
    p += sorted(glob.glob(os.path.join(WURZEL, "dienstleistungen", "*.html")))
    return p


def kurz(pfad):
    return os.path.relpath(pfad, WURZEL)


def schreiben(pfad, neu, trocken):
    alt = open(pfad, encoding="utf-8").read()
    if alt == neu:
        return False
    if not trocken:
        open(pfad, "w", encoding="utf-8").write(neu)
    return True


def stand():
    """Wie steht es gerade? Gibt (frei, gesperrt) je Stelle zurueck."""
    zeilen = []
    for p in seiten():
        s = open(p, encoding="utf-8").read()
        m = re.search(r'<meta name="robots" content="([^"]*)"', s)
        wert = m.group(1) if m else "— keine Angabe —"
        zeilen.append((kurz(p), wert))
    r = open(os.path.join(WURZEL, "robots.txt"), encoding="utf-8").read()
    zeilen.append(("robots.txt", "Disallow: /" if "Disallow: /\n" in r or r.rstrip().endswith("Disallow: /") else "Allow: /"))
    # Achtung: beim Freigeben wird die Zeile auskommentiert, nicht geloescht.
    # Nach `SPERRE in s` zu suchen meldet sie deshalb weiterhin als gesetzt.
    # Massgeblich ist nur eine Zeile, die NICHT mit einem Kommentarzeichen
    # beginnt.
    for name in ("vercel.json", "netlify.toml", ".htaccess"):
        s = open(os.path.join(WURZEL, name), encoding="utf-8").read()
        aktiv = any("X-Robots-Tag" in z and not z.lstrip().startswith(("#", "//"))
                    for z in s.splitlines())
        zeilen.append((name, SPERRE if aktiv else "X-Robots-Tag aus"))
    return zeilen


def umschalten(live, trocken):
    n = 0

    # 1) Die fuenfzehn Seitenkoepfe. Im Testbetrieb steht ein erklaerender
    #    Kommentar davor; er wandert mit, damit im Live-Betrieb nichts
    #    Irrefuehrendes stehen bleibt.
    kommentar_test = (
        "<!-- ============================================================\n"
        "     TESTBETRIEB — VOR DEM LIVE-GANG ENTFERNEN\n"
        "     Diese Zeile haelt Suchmaschinen von der internen Vorschau fern.\n"
        "     Solange sie hier steht, wird die Seite nicht indexiert.\n"
        "     Zusaetzlich sperrt robots.txt und der Header X-Robots-Tag.\n"
        "     Umschalten: python3 tools/live-schalten.py --live\n"
        "     ============================================================ -->\n"
    )
    kommentar_live = (
        "<!-- Freigegeben. Zurueck in den Testbetrieb:\n"
        "     python3 tools/live-schalten.py --test -->\n"
    )
    for p in seiten():
        s = open(p, encoding="utf-8").read()
        neu = s
        # Vorhandenen Kommentarblock samt Meta-Zeile in einem Zug ersetzen.
        muster = re.compile(
            r"(?:<!--[^>]*?(?:TESTBETRIEB|Freigegeben)[\s\S]*?-->\s*)?"
            r'<meta name="robots" content="[^"]*"\s*/?>'
        )
        ziel = (kommentar_live if live else kommentar_test) + \
               f'<meta name="robots" content="{FREI if live else SPERRE}" />'
        if muster.search(s):
            neu = muster.sub(lambda _: ziel, s, count=1)
        # Die 404-Seite bleibt immer auf noindex: eine Fehlerseite gehoert
        # in keinen Index, auch im Live-Betrieb nicht.
        if kurz(p) == "404.html":
            neu = re.sub(r'<meta name="robots" content="[^"]*"',
                         f'<meta name="robots" content="{SPERRE}"', neu, count=1)
        if schreiben(p, neu, trocken):
            n += 1
            print(f"  {kurz(p)}")

    # 2) robots.txt
    rp = os.path.join(WURZEL, "robots.txt")
    if schreiben(rp, ROBOTS_LIVE if live else ROBOTS_TEST, trocken):
        n += 1
        print("  robots.txt")

    # 3) Die drei Kopfzeilen-Dateien. Der Eintrag wird nicht geloescht,
    #    sondern auskommentiert — sonst muss ihn beim Zurueckschalten
    #    jemand aus dem Gedaechtnis wiederherstellen.
    #    In JSON gibt es keine Kommentare — dort muss der Eintrag wirklich
    #    raus und beim Zurueckschalten wieder hinein. Mit str.replace() waere
    #    das ein Selbstschuss: `s.replace("", block)` schiebt den Block
    #    zwischen JEDES Zeichen der Datei. Deshalb hier je eine eigene Regel
    #    fuer Entfernen und Einsetzen.
    json_block = ('        {\n          "key": "X-Robots-Tag",\n'
                  f'          "value": "{SPERRE}"\n        }},\n')
    p = os.path.join(WURZEL, "vercel.json")
    s = open(p, encoding="utf-8").read()
    if live:
        neu = re.sub(r'\s*\{\s*"key":\s*"X-Robots-Tag",\s*"value":\s*"[^"]*"\s*\},', "", s, count=1)
    else:
        # Angehaengt wird vor X-Content-Type-Options — dem ersten Eintrag der
        # inneren Liste. Der aeussere `"headers": [` waere der falsche Anker:
        # dort stehen Quellen, keine Kopfzeilen.
        neu = s if '"X-Robots-Tag"' in s else re.sub(
            r'( *)(\{\s*"key": "X-Content-Type-Options")',
            lambda m: json_block + m.group(1) + m.group(2), s, count=1)
    if schreiben(p, neu, trocken):
        n += 1
        print("  vercel.json")

    for name, test, frei in (
        ("netlify.toml",
         f'    X-Robots-Tag = "{SPERRE}"',
         f'    # X-Robots-Tag = "{SPERRE}"   # Live: aus'),
        (".htaccess",
         f'  Header set X-Robots-Tag "{SPERRE}"',
         f'  # Header set X-Robots-Tag "{SPERRE}"   # Live: aus'),
    ):
        p = os.path.join(WURZEL, name)
        s = open(p, encoding="utf-8").read()
        neu = s.replace(test, frei) if live else s.replace(frei, test)
        if schreiben(p, neu, trocken):
            n += 1
            print(f"  {name}")

    print(f"\n{n} Datei(en) {'zu aendern' if trocken else 'geaendert'}.")
    if live and not trocken:
        print("\nNoch von Hand:\n"
              "  · Sitemap in der Google Search Console einreichen\n"
              "  · Basic-Auth in .htaccess auskommentiert lassen (steht schon so da)")
    return n


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = a.add_mutually_exclusive_group(required=True)
    g.add_argument("--live", action="store_true", help="fuer Suchmaschinen freigeben")
    g.add_argument("--test", action="store_true", help="wieder sperren")
    g.add_argument("--stand", action="store_true", help="nur zeigen, wie es steht")
    a.add_argument("--trocken", action="store_true", help="nichts schreiben, nur melden")
    args = a.parse_args()

    if args.stand:
        for wo, was in stand():
            print(f"  {wo:44s} {was}")
        return 0
    return 0 if umschalten(args.live, args.trocken) >= 0 else 1


if __name__ == "__main__":
    sys.exit(main())
