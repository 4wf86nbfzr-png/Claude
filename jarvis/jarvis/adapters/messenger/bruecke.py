"""Nachrichten, die von aussen hereingereicht werden.

Der HTTP-Dienst nimmt sie unter ``POST /nachricht/eingang`` entgegen und
legt sie hier ab; ``neue()`` holt, was noch nicht eingestuft wurde. Damit
laesst sich jede Anbindung andocken, ohne Jarvis zu aendern: die
offizielle WhatsApp-Business-Schnittstelle, ein eigener Dienst, Signal,
SMS -- was auch immer POSTen kann.
"""

from __future__ import annotations

import logging
from datetime import datetime

from ...db.database import Database, iso, parse_iso, utcnow
from .base import Nachricht, NachrichtenQuelle

log = logging.getLogger(__name__)


class Bruecke(NachrichtenQuelle):
    name = "bruecke"

    def __init__(self, database: Database) -> None:
        self.db = database

    # --- Eingang ----------------------------------------------------------
    def annehmen(
        self, *, absender: str, text: str, extern_id: str = "", gruppe: str = "",
        kanal: str = "whatsapp", empfangen_am: datetime | None = None,
    ) -> int | None:
        """Nimmt eine Nachricht an. ``None``, wenn sie schon bekannt ist."""
        text = (text or "").strip()
        if not text:
            return None
        zeitpunkt = empfangen_am or utcnow()
        kennung = extern_id.strip() or f"bruecke:{absender}:{iso(zeitpunkt)}:{hash(text) & 0xffff}"
        cursor = self.db.execute(
            "INSERT INTO nachricht (kanal, quelle, extern_id, absender, gruppe, text, "
            "empfangen_am, stufe, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'offen', ?) "
            "ON CONFLICT (kanal, extern_id) DO NOTHING",
            (kanal, self.name, kennung, absender.strip()[:200], gruppe.strip()[:200],
             text[:4000], iso(zeitpunkt), iso(utcnow())),
        )
        if not cursor.rowcount:
            return None
        return int(cursor.lastrowid or 0)

    # --- Abholen ----------------------------------------------------------
    async def neue(self, limit: int = 50) -> list[Nachricht]:
        zeilen = self.db.query(
            "SELECT * FROM nachricht WHERE quelle = ? AND stufe = 'offen' "
            "ORDER BY empfangen_am LIMIT ?",
            (self.name, limit),
        )
        return [
            Nachricht(
                extern_id=zeile["extern_id"], absender=zeile["absender"],
                gruppe=zeile["gruppe"], text=zeile["text"],
                empfangen_am=parse_iso(zeile["empfangen_am"]) or utcnow(),
                kanal=zeile["kanal"], quelle=self.name,
            )
            for zeile in zeilen
        ]

    async def health(self) -> tuple[bool, str]:
        offen = int(self.db.scalar(
            "SELECT COUNT(*) FROM nachricht WHERE quelle = ? AND stufe = 'offen'",
            (self.name,),
        ) or 0)
        gesamt = int(self.db.scalar(
            "SELECT COUNT(*) FROM nachricht WHERE quelle = ?", (self.name,)
        ) or 0)
        if not gesamt:
            return True, (
                "Bruecke bereit, bisher nichts empfangen "
                "(POST /nachricht/eingang)"
            )
        return True, f"Bruecke: {gesamt} Nachrichten empfangen, {offen} offen"
