# -*- coding: utf-8 -*-
"""Werkzeuge fuer die Nachrichtenlage.

Alles hier beruht auf abgerufenen Quellen. Gibt es keine, sagt Jarvis das --
er erfindet keine Schlagzeile. Jede Meldung behaelt Quelle und Zeitpunkt,
damit man nachsehen kann.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from . import news
from .news import BEREICHE, QUELLEN
from .timeutil import format_local
from .toolkit import ToolResult, int_field, schema, text_field

if TYPE_CHECKING:
    from .services import Services

log = logging.getLogger(__name__)

BEREICHSNAMEN = {
    "welt": "Welt und Deutschland", "wirtschaft": "Wirtschaft",
    "technik": "Technik und KI", "hamburg": "Hamburg",
}


def _wann(meldung, tz) -> str:
    if meldung.zeitpunkt is None:
        return ""
    alter = datetime.now(timezone.utc) - meldung.zeitpunkt
    stunden = int(alter.total_seconds() // 3600)
    if stunden < 1:
        return "gerade eben"
    if stunden < 10:
        return f"vor {stunden} Stunden"
    return format_local(meldung.zeitpunkt, tz)


def register(services: "Services") -> None:
    tz = services.settings.tz

    async def nachrichtenlage(bereich: str = "", anzahl: int = 3) -> ToolResult:
        """Was gerade passiert -- aus echten Quellen."""
        gewaehlt = tuple(
            b for b in BEREICHE if not bereich.strip() or b in bereich.strip().lower()
        ) or BEREICHE
        meldungen = await news.hole_lage(gewaehlt, je_bereich=max(1, min(anzahl, 8)))
        services.nachrichtenlage = meldungen
        if not meldungen:
            return ToolResult.failure(
                "Ich komme gerade an keine Nachrichtenquelle heran "
                f"({', '.join(q for b in gewaehlt for q, _ in QUELLEN.get(b, []))}). "
                "Ich erfinde dir dazu nichts."
            )
        zeilen: list[str] = []
        letzter = ""
        for meldung in meldungen:
            if meldung.bereich != letzter:
                letzter = meldung.bereich
                zeilen.append(f"\n*{BEREICHSNAMEN.get(letzter, letzter.capitalize())}*")
            wann = _wann(meldung, tz)
            zeilen.append(f"• {meldung.titel} _({meldung.quelle}{', ' + wann if wann else ''})_")
        return ToolResult.success(
            "\n".join(zeilen).strip(), anzahl=len(meldungen),
            meldungen=[m.als_json() for m in meldungen],
        )

    services.toolkit.register(
        "nachrichtenlage",
        "Holt aktuelle Schlagzeilen aus echten Quellen (tagesschau, heise, NDR Hamburg). "
        "Fuer 'Was ist heute passiert?', 'Neues aus der KI-Branche', 'Was gibt es in Hamburg?'.",
        schema(bereich=text_field("welt, wirtschaft, technik oder hamburg (leer = alles)",
                                  enum=list(BEREICHE)),
               anzahl=int_field("Meldungen je Bereich (Standard 3)")),
        nachrichtenlage, category="recherche", timeout=45.0,
    )

    async def meldung_erklaeren(stichwort: str) -> ToolResult:
        """Holt den Artikel zu einer Meldung und fasst ihn zusammen."""
        gemerkt = getattr(services, "nachrichtenlage", []) or []
        if not gemerkt:
            ergebnis = await nachrichtenlage()
            if not ergebnis.ok:
                return ergebnis
            gemerkt = getattr(services, "nachrichtenlage", [])
        begriff = stichwort.strip().lower()
        treffer = next(
            (m for m in gemerkt if begriff and begriff in m.titel.lower()),
            gemerkt[0] if not begriff else None,
        )
        if treffer is None:
            return ToolResult.failure(
                f"Zu '{stichwort}' habe ich keine Meldung in der aktuellen Lage."
            )
        if not treffer.adresse:
            return ToolResult.success(
                f"*{treffer.titel}*\n{treffer.zusammenfassung}\n_Quelle: {treffer.quelle}_"
            )
        geholt = await services.toolkit.execute(
            "web_abrufen", {"adresse": treffer.adresse}, channel="intern"
        )
        if not geholt.ok:
            return ToolResult.success(
                f"*{treffer.titel}*\n{treffer.zusammenfassung}\n"
                f"_Quelle: {treffer.quelle}, vollstaendiger Artikel nicht abrufbar_"
            )
        gefasst = await services.toolkit.execute(
            "zusammenfassen", {"text": geholt.text, "laenge": "kurz"}, channel="intern"
        )
        inhalt = gefasst.text if gefasst.ok else treffer.zusammenfassung
        return ToolResult.success(
            f"*{treffer.titel}*\n{inhalt}\n_Quelle: {treffer.quelle} — {treffer.adresse}_"
        )

    services.toolkit.register(
        "meldung_erklaeren",
        "Erklaert eine Meldung aus der Nachrichtenlage genauer (holt den Artikel).",
        schema(stichwort=text_field("Stichwort aus der Schlagzeile")),
        meldung_erklaeren, category="recherche", timeout=90.0,
    )
