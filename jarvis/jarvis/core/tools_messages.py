"""Werkzeuge rund um eingegangene Nachrichten.

Damit kann Jarvis im Gespraech beantworten, was Telegram sonst nur ueber
Knoepfe zeigt: „Hat mir jemand geschrieben?", „Was war wichtig?", „Das
mit der Absage habe ich geklaert." Dieselben Funktionen nutzen der
Telefonassistent und das Dashboard -- es gibt keinen zweiten Bestand.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from .timeutil import format_local
from .toolkit import ToolResult, int_field, schema, text_field
from .triage import DRINGEND, IGNORIEREN, MELDEN

if TYPE_CHECKING:
    from .services import Services

log = logging.getLogger(__name__)

STUFEN = {"dringend": DRINGEND, "wichtig": MELDEN, "gemeldet": MELDEN,
          "geplauder": IGNORIEREN, "ignoriert": IGNORIEREN}


def register(services: "Services") -> None:
    tz = services.settings.tz
    speicher = services.messages

    def aus() -> ToolResult:
        return ToolResult.failure(
            "Es ist keine Nachrichtenquelle verbunden. "
            + (services.messenger_error or "MESSENGER_ENABLED=true setzen.")
        )

    async def nachrichten_liste(stufe: str = "", anzahl: int = 10) -> ToolResult:
        """Was ist hereingekommen?"""
        if services.messenger is None and not speicher.liste(limit=1):
            return aus()
        gewaehlt = STUFEN.get(stufe.strip().lower()) if stufe.strip() else None
        eintraege = speicher.liste(
            stufe=gewaehlt or (DRINGEND, MELDEN), limit=max(1, min(anzahl, 30)),
            nur_offene=True,
        )
        if not eintraege:
            return ToolResult.success(
                "Nichts Offenes. Entweder war nichts, oder du hast es schon abgehakt.",
                anzahl=0,
            )
        kopf = f"*{len(eintraege)} offene Nachricht(en)*"
        return ToolResult.success(
            kopf + "\n" + "\n".join(e.zeile(tz) for e in eintraege),
            anzahl=len(eintraege), ids=[e.id for e in eintraege],
        )

    services.toolkit.register(
        "nachrichten_liste",
        "Zeigt eingegangene WhatsApp-/Messenger-Nachrichten, die noch offen sind. "
        "Fuer Fragen wie 'Hat mir jemand geschrieben?' oder 'Was ist wichtig?'.",
        schema(stufe=text_field("'dringend', 'wichtig' oder leer fuer beides",
                                enum=["dringend", "wichtig", "geplauder"]),
               anzahl=int_field("Wie viele (Standard 10)")),
        nachrichten_liste, category="nachrichten",
    )

    async def nachricht_lesen(id: int) -> ToolResult:
        """Eine Nachricht im Volltext."""
        eintrag = speicher.holen(int(id))
        if eintrag is None:
            return ToolResult.failure(f"Eine Nachricht #{id} habe ich nicht.")
        wer = eintrag.absender + (f" (Gruppe {eintrag.gruppe})" if eintrag.gruppe else "")
        zustand = "erledigt" if eintrag.erledigt_am else eintrag.stufe
        return ToolResult.success(
            f"*#{eintrag.id} von {wer}*\n"
            f"_{format_local(eintrag.empfangen_am, tz)}, {zustand}_\n\n"
            f"{eintrag.text}\n\n"
            f"_Einstufung: {', '.join(eintrag.gruende) or 'ohne besonderen Grund'}_",
            id=eintrag.id, absender=eintrag.absender, stufe=eintrag.stufe,
            inhalt=eintrag.text,
        )

    services.toolkit.register(
        "nachricht_lesen",
        "Liest eine eingegangene Nachricht im Volltext vor (Nummer aus der Liste).",
        schema(id=int_field("Nummer der Nachricht", pflicht=True)),
        nachricht_lesen, category="nachrichten",
    )

    async def nachricht_erledigt(id: int) -> ToolResult:
        """Abhaken -- sie taucht dann nicht mehr auf."""
        eintrag = speicher.holen(int(id))
        if eintrag is None:
            return ToolResult.failure(f"Eine Nachricht #{id} habe ich nicht.")
        if not speicher.erledigt(int(id)):
            return ToolResult.success(f"Nachricht #{id} war schon abgehakt.", id=int(id))
        services.memory.remember_event(
            "nachricht_erledigt", eintrag.zeile(tz), {"id": eintrag.id}
        )
        return ToolResult.success(
            f"Abgehakt: #{id} von {eintrag.absender}.", id=int(id)
        )

    services.toolkit.register(
        "nachricht_erledigt",
        "Haken hinter eine gemeldete Nachricht setzen ('das mit der Absage habe ich geklaert').",
        schema(id=int_field("Nummer der Nachricht", pflicht=True)),
        nachricht_erledigt, category="nachrichten",
    )

    async def nachrichten_suchen(begriff: str, anzahl: int = 10) -> ToolResult:
        """Im Nachrichtenverlauf suchen."""
        if not begriff.strip():
            return ToolResult.failure("Wonach soll ich suchen?")
        treffer = speicher.suchen(begriff.strip(), limit=max(1, min(anzahl, 30)))
        if not treffer:
            return ToolResult.success(f"Zu '{begriff}' finde ich nichts.", anzahl=0)
        return ToolResult.success(
            f"*{len(treffer)} Treffer zu '{begriff}'*\n"
            + "\n".join(t.zeile(tz) for t in treffer),
            anzahl=len(treffer),
        )

    services.toolkit.register(
        "nachrichten_suchen",
        "Sucht in den eingegangenen Nachrichten nach Absender oder Inhalt.",
        schema(begriff=text_field("Suchbegriff", pflicht=True),
               anzahl=int_field("Wie viele Treffer")),
        nachrichten_suchen, category="nachrichten",
    )

    async def hintergrundbericht(stunden: int = 0) -> ToolResult:
        """Was war los, seit wir das letzte Mal gesprochen haben?"""
        from datetime import timedelta

        from ..db.database import utcnow
        seit = utcnow() - timedelta(hours=stunden) if stunden > 0 else None
        text, punkte = services.background_report(seit=seit)
        return ToolResult.success(text, punkte=punkte)

    services.toolkit.register(
        "hintergrundbericht",
        "Berichtet, was Jarvis im Hintergrund erledigt hat: Mails durchgesehen, "
        "Nachrichten gelesen und eingestuft, Erinnerungen zugestellt, Anrufe.",
        schema(stunden=int_field("Zeitraum in Stunden (0 = seit dem letzten Bericht)")),
        hintergrundbericht, category="nachrichten",
    )
