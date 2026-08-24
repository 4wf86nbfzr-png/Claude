#!/usr/bin/env python3
"""Schreibt die strukturierten Daten je Seite aus dem, was auf der Seite steht.

Warum ein Werkzeug und nicht vierzehn Handgriffe: strukturierte Daten sind eine
zweite Fassung dessen, was ohnehin im Markup steht. Werden sie von Hand
gepflegt, laufen die beiden Fassungen auseinander, sobald jemand einen
Brotkrumen umbenennt, und Google meldet einen Fehler, den auf der Seite selbst
niemand sieht.

Deshalb liest dieses Skript die Quelle:

  BreadcrumbList  aus dem sichtbaren Brotkrumenpfad (.breadcrumb)
  FAQPage         aus den <details>/<summary> der Jobseite
  Service         aus Titel und Beschreibung der sechs Leistungsseiten

und legt das Ergebnis zwischen zwei Marken ab. Mehrfach ausfuehrbar: beim
zweiten Lauf meldet es null Aenderungen.

    python3 tools/strukturdaten.py
"""
import html
import json
import os
import re
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASIS = "https://hermserviceteam.com/"

ANFANG = "<!-- strukturdaten:anfang (tools/strukturdaten.py) -->"
ENDE = "<!-- strukturdaten:ende -->"

# Die sechs Leistungsseiten. Der Name ist der, der im Angebot der Startseite
# steht — nicht die Ueberschrift, die auch mal ein Satz sein darf.
LEISTUNGEN = {
    "dienstleistungen/gastro-personal.html": "Gastro-Personal",
    "dienstleistungen/sicherheit.html": "Veranstaltungsschutz",
    "dienstleistungen/promotion-hostess.html": "Hostessen & Promoter",
    "dienstleistungen/logistik.html": "Eventlogistik",
    "dienstleistungen/fahrservice.html": "Fahrservice",
    "dienstleistungen/reinigung.html": "Reinigung",
}


def text(roh):
    """Markup raus, Entitaeten aufloesen, Leerraum glaetten."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", "", roh))).strip()


def adresse(seite, ziel):
    """Ein Linkziel aus der Seite heraus in eine vollstaendige Adresse."""
    if ziel.startswith(("http://", "https://")):
        return ziel
    voll = os.path.normpath(os.path.join(os.path.dirname(seite), ziel))
    if voll == "index.html":
        return BASIS
    return BASIS + voll.replace(os.sep, "/")


def brotkrumen(seite, roh):
    m = re.search(r'<(?:div|nav) class="breadcrumb"[^>]*>(.*?)</(?:div|nav)>', roh, re.S)
    if not m:
        return None
    stufen = []
    # Home ist die Startseite; sie steht als Link da, hat aber keinen Namen,
    # der in einer Suchmaschine etwas bedeutet.
    for teil in re.finditer(r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>|<span[^>]*>(.*?)</span>', m.group(1), re.S):
        if teil.group(1) is not None:
            stufen.append((text(teil.group(2)), adresse(seite, teil.group(1))))
        else:
            stufen.append((text(teil.group(3)), adresse(seite, os.path.basename(seite))))
    if len(stufen) < 2:
        return None
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": n, "item": u}
            for i, (n, u) in enumerate(stufen)
        ],
    }


def fragen(roh):
    treffer = re.findall(r"<details[^>]*>\s*<summary[^>]*>(.*?)</summary>(.*?)</details>", roh, re.S)
    if not treffer:
        return None
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": text(f),
                "acceptedAnswer": {"@type": "Answer", "text": text(a)},
            }
            for f, a in treffer
        ],
    }


def leistung(seite, roh, name):
    besch = re.search(r'<meta\s+name="description"\s+content="(.*?)"', roh, re.S)
    return {
        "@context": "https://schema.org",
        "@type": "Service",
        "name": name,
        "serviceType": name,
        "url": BASIS + seite,
        "description": text(besch.group(1)) if besch else "",
        "provider": {
            "@type": "EmploymentAgency",
            "name": "HERM Service Team e.K.",
            "url": BASIS,
            "telephone": "+49-40-27075100",
            "address": {
                "@type": "PostalAddress",
                "streetAddress": "Gertigstraße 12–14",
                "postalCode": "22303",
                "addressLocality": "Hamburg",
                "addressCountry": "DE",
            },
        },
        "areaServed": [
            {"@type": "City", "name": "Hamburg"},
            {"@type": "Country", "name": "Deutschland"},
        ],
    }


def einsetzen(roh, block):
    """Block zwischen die Marken legen; sind sie noch nicht da, vor </head>."""
    neu = ANFANG + "\n" + block + "\n" + ENDE
    if ANFANG in roh:
        return re.sub(re.escape(ANFANG) + r".*?" + re.escape(ENDE), lambda _: neu, roh, flags=re.S)
    return roh.replace("</head>", neu + "\n</head>", 1)


def main():
    seiten = ["index.html", "dienstleistungen.html", "team.html", "galerie.html",
              "jobs.html", "kontakt.html", "impressum.html", "datenschutz.html"]
    seiten += list(LEISTUNGEN)

    geaendert = 0
    for seite in seiten:
        pfad = os.path.join(WURZEL, seite)
        if not os.path.exists(pfad):
            print("  fehlt:", seite)
            continue
        roh = open(pfad, encoding="utf-8").read()

        stuecke = []
        krumen = brotkrumen(seite, roh)
        if krumen:
            stuecke.append(krumen)
        if seite in LEISTUNGEN:
            stuecke.append(leistung(seite, roh, LEISTUNGEN[seite]))
        f = fragen(roh)
        if f:
            stuecke.append(f)

        if not stuecke:
            print(f"  {seite:52s} nichts abzuleiten")
            continue

        block = "\n".join(
            '<script type="application/ld+json">\n'
            + json.dumps(s, ensure_ascii=False, indent=2)
            + "\n</script>"
            for s in stuecke
        )
        neu = einsetzen(roh, block)
        if neu != roh:
            open(pfad, "w", encoding="utf-8").write(neu)
            geaendert += 1
        arten = ", ".join(s["@type"] for s in stuecke)
        print(f"  {'geaendert' if neu != roh else 'unveraendert':13s} {seite:52s} {arten}")

    print(f"\n{geaendert} Datei(en) geaendert.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
