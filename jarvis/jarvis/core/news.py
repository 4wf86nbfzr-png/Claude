# -*- coding: utf-8 -*-
"""Nachrichtenlage aus echten Quellen.

Erfundene Schlagzeilen sind schlimmer als keine. Deshalb holt dieser
Baustein die Meldungen aus den RSS-Feeds etablierter Redaktionen: kein
Schluessel, kein Konto, keine Abhaengigkeit von einem Anbieter, der
morgen abschaltet. Jede Meldung behaelt Quelle, Zeitpunkt und Adresse --
nur dann kann Jarvis sie nennen, ohne zu raten.

Wenn keine Quelle erreichbar ist, kommt eine leere Liste zurueck. Die
Oberflaeche sagt das dann offen, statt etwas zu behaupten.
"""

from __future__ import annotations

import asyncio
import html
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from xml.etree import ElementTree

import httpx

log = logging.getLogger(__name__)

#: Bereich -> (Anzeigename, Adresse). Bewusst wenige, dafuer verlaessliche.
QUELLEN: dict[str, list[tuple[str, str]]] = {
    "welt": [
        ("tagesschau", "https://www.tagesschau.de/xml/rss2"),
        ("Deutschlandfunk", "https://www.deutschlandfunk.de/nachrichten-100.rss"),
    ],
    "wirtschaft": [
        ("tagesschau Wirtschaft", "https://www.tagesschau.de/wirtschaft/index~rss2.xml"),
    ],
    "technik": [
        ("heise", "https://www.heise.de/rss/heise-atom.xml"),
        ("Golem", "https://rss.golem.de/rss.php?feed=RSS2.0"),
    ],
    "hamburg": [
        ("NDR Hamburg", "https://www.ndr.de/nachrichten/hamburg/index-rss.xml"),
    ],
}

BEREICHE = tuple(QUELLEN)
TAGS = re.compile(r"<[^>]+>")


@dataclass(slots=True)
class Meldung:
    titel: str
    quelle: str
    bereich: str
    adresse: str = ""
    zusammenfassung: str = ""
    zeitpunkt: datetime | None = None

    def alter(self, jetzt: datetime) -> timedelta | None:
        return None if self.zeitpunkt is None else jetzt - self.zeitpunkt

    def zeile(self) -> str:
        return f"{self.titel} ({self.quelle})"

    def als_json(self) -> dict[str, Any]:
        return {
            "titel": self.titel, "quelle": self.quelle, "bereich": self.bereich,
            "adresse": self.adresse, "zusammenfassung": self.zusammenfassung,
            "zeitpunkt": self.zeitpunkt.isoformat() if self.zeitpunkt else "",
        }


def _text(element: ElementTree.Element | None) -> str:
    if element is None or not (element.text or ""):
        return ""
    return html.unescape(TAGS.sub(" ", element.text)).strip()


def _zeitpunkt(roh: str) -> datetime | None:
    roh = roh.strip()
    if not roh:
        return None
    try:
        zeit = parsedate_to_datetime(roh)
    except (TypeError, ValueError):
        try:
            zeit = datetime.fromisoformat(roh.replace("Z", "+00:00"))
        except ValueError:
            return None
    if zeit is None:
        return None
    return zeit if zeit.tzinfo else zeit.replace(tzinfo=timezone.utc)


def lies_feed(inhalt: str, *, quelle: str, bereich: str) -> list[Meldung]:
    """Liest RSS 2.0 und Atom. Faellt nie um -- Unlesbares wird ausgelassen."""
    try:
        wurzel = ElementTree.fromstring(inhalt)
    except ElementTree.ParseError as fehler:
        log.debug("Feed von %s unlesbar: %s", quelle, fehler)
        return []

    atom = "{http://www.w3.org/2005/Atom}"
    eintraege = wurzel.findall(".//item") or wurzel.findall(f".//{atom}entry")
    meldungen: list[Meldung] = []
    for eintrag in eintraege:
        titel = _text(eintrag.find("title")) or _text(eintrag.find(f"{atom}title"))
        if not titel:
            continue
        adresse = _text(eintrag.find("link"))
        if not adresse:
            verweis = eintrag.find(f"{atom}link")
            adresse = (verweis.get("href", "") if verweis is not None else "")
        beschreibung = (_text(eintrag.find("description"))
                        or _text(eintrag.find(f"{atom}summary")))
        roh_zeit = (_text(eintrag.find("pubDate")) or _text(eintrag.find(f"{atom}updated"))
                    or _text(eintrag.find(f"{atom}published")))
        meldungen.append(Meldung(
            titel=" ".join(titel.split()), quelle=quelle, bereich=bereich,
            adresse=adresse.strip(),
            zusammenfassung=" ".join(beschreibung.split())[:400],
            zeitpunkt=_zeitpunkt(roh_zeit),
        ))
    return meldungen


def _schluessel(titel: str) -> frozenset[str]:
    """Grobe Inhaltsmarke, um dieselbe Meldung aus zwei Quellen zu erkennen."""
    woerter = re.findall(r"\w{4,}", titel.lower())
    return frozenset(woerter[:8])


def entdoppeln(meldungen: list[Meldung]) -> list[Meldung]:
    """Dieselbe Meldung aus drei Quellen ist eine Meldung."""
    behalten: list[Meldung] = []
    marken: list[frozenset[str]] = []
    for meldung in meldungen:
        marke = _schluessel(meldung.titel)
        if any(marke and alt and len(marke & alt) >= max(2, min(len(marke), len(alt)) // 2)
               for alt in marken):
            continue
        marken.append(marke)
        behalten.append(meldung)
    return behalten


async def _hole(client: httpx.AsyncClient, quelle: str, adresse: str,
                bereich: str) -> list[Meldung]:
    try:
        antwort = await client.get(adresse, headers={"User-Agent": "Jarvis/1.0 (persoenlich)"})
        if antwort.status_code >= 400:
            log.info("Feed %s antwortet %s", quelle, antwort.status_code)
            return []
        return lies_feed(antwort.text, quelle=quelle, bereich=bereich)
    except httpx.HTTPError as fehler:
        log.info("Feed %s nicht erreichbar: %s", quelle, fehler)
        return []


async def hole_lage(
    bereiche: tuple[str, ...] = BEREICHE, *, je_bereich: int = 4,
    hoechstalter_stunden: int = 24, jetzt: datetime | None = None,
) -> list[Meldung]:
    """Holt die aktuelle Lage. Leere Liste heisst: nichts erreichbar."""
    jetzt = jetzt or datetime.now(timezone.utc)
    auftraege = []
    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
        for bereich in bereiche:
            for quelle, adresse in QUELLEN.get(bereich, []):
                auftraege.append(_hole(client, quelle, adresse, bereich))
        ergebnisse = await asyncio.gather(*auftraege, return_exceptions=True)

    nach_bereich: dict[str, list[Meldung]] = {}
    for ergebnis in ergebnisse:
        if isinstance(ergebnis, BaseException):
            continue
        for meldung in ergebnis:
            alter = meldung.alter(jetzt)
            if alter is not None and alter > timedelta(hours=hoechstalter_stunden):
                continue
            nach_bereich.setdefault(meldung.bereich, []).append(meldung)

    lage: list[Meldung] = []
    for bereich in bereiche:
        gefunden = nach_bereich.get(bereich, [])
        gefunden.sort(key=lambda m: m.zeitpunkt or datetime.min.replace(tzinfo=timezone.utc),
                      reverse=True)
        lage.extend(entdoppeln(gefunden)[:je_bereich])
    return lage
