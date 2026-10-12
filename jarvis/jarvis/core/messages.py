"""Nachrichtenspeicher und Einstufungslauf.

Haelt die eingegangenen Nachrichten (WhatsApp und was sonst andockt),
stuft neue ein und sagt, was gemeldet oder angerufen werden muss. Der
Speicher ist dieselbe Datenbank wie alles andere -- Telegram, Dashboard und
Telefon sehen denselben Stand.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any
from zoneinfo import ZoneInfo

from ..db.database import Database, iso, parse_iso, utcnow
from .timeutil import format_local
from .triage import DRINGEND, IGNORIEREN, MELDEN, Einstufung

if TYPE_CHECKING:
    from ..adapters.messenger.base import Nachricht

log = logging.getLogger(__name__)


@dataclass(slots=True)
class GespeicherteNachricht:
    id: int
    kanal: str
    absender: str
    gruppe: str
    text: str
    empfangen_am: datetime
    stufe: str
    gruende: list[str]
    gemeldet_am: datetime | None
    erledigt_am: datetime | None

    def zeile(self, tz: ZoneInfo) -> str:
        marke = {DRINGEND: "🔴", MELDEN: "•", IGNORIEREN: "·"}.get(self.stufe, "•")
        wer = self.absender + (f" ({self.gruppe})" if self.gruppe else "")
        auszug = " ".join(self.text.split())[:120]
        return f"{marke} #{self.id} {wer} — {auszug}  _{format_local(self.empfangen_am, tz)}_"


def _zu_objekt(zeile) -> GespeicherteNachricht:
    try:
        gruende = json.loads(zeile["gruende"] or "[]")
    except json.JSONDecodeError:
        gruende = []
    return GespeicherteNachricht(
        id=zeile["id"], kanal=zeile["kanal"], absender=zeile["absender"],
        gruppe=zeile["gruppe"], text=zeile["text"],
        empfangen_am=parse_iso(zeile["empfangen_am"]) or utcnow(),
        stufe=zeile["stufe"], gruende=gruende,
        gemeldet_am=parse_iso(zeile["gemeldet_am"]),
        erledigt_am=parse_iso(zeile["erledigt_am"]),
    )


class NachrichtenSpeicher:
    def __init__(self, database: Database) -> None:
        self.db = database

    # --- Ablegen ----------------------------------------------------------
    def ablegen(self, nachricht: "Nachricht") -> int | None:
        """Legt eine Nachricht ab. ``None``, wenn sie schon bekannt ist."""
        cursor = self.db.execute(
            "INSERT INTO nachricht (kanal, quelle, extern_id, absender, gruppe, text, "
            "empfangen_am, stufe, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'offen', ?) "
            "ON CONFLICT (kanal, extern_id) DO NOTHING",
            (nachricht.kanal, nachricht.quelle, nachricht.extern_id,
             nachricht.absender[:200], nachricht.gruppe[:200], nachricht.text[:4000],
             iso(nachricht.empfangen_am), iso(utcnow())),
        )
        return int(cursor.lastrowid or 0) if cursor.rowcount else None

    def offene_id(self, kanal: str, extern_id: str) -> int | None:
        """Nummer einer bereits abgelegten, noch nicht eingestuften Nachricht.

        Die Bruecke schreibt direkt in dieselbe Tabelle -- ``ablegen`` meldet
        dann "kenne ich schon". Eingestuft werden muss sie trotzdem.
        """
        zeile = self.db.query_one(
            "SELECT id FROM nachricht WHERE kanal = ? AND extern_id = ? AND stufe = 'offen'",
            (kanal, extern_id),
        )
        return int(zeile["id"]) if zeile else None

    def einstufen(self, nachricht_id: int, einstufung: Einstufung) -> None:
        self.db.update("nachricht", nachricht_id, {
            "stufe": einstufung.stufe,
            "gruende": json.dumps(einstufung.gruende, ensure_ascii=False),
        })

    def gemeldet(self, nachricht_id: int) -> None:
        self.db.update("nachricht", nachricht_id, {"gemeldet_am": iso(utcnow())})

    def erledigt(self, nachricht_id: int) -> bool:
        cursor = self.db.execute(
            "UPDATE nachricht SET erledigt_am = ? WHERE id = ? AND erledigt_am IS NULL",
            (iso(utcnow()), nachricht_id),
        )
        return bool(cursor.rowcount)

    # --- Abfragen ---------------------------------------------------------
    def holen(self, nachricht_id: int) -> GespeicherteNachricht | None:
        zeile = self.db.query_one("SELECT * FROM nachricht WHERE id = ?", (nachricht_id,))
        return _zu_objekt(zeile) if zeile else None

    def liste(
        self, *, stufe: str | tuple[str, ...] | None = None, limit: int = 20,
        nur_offene: bool = False, seit: datetime | None = None,
    ) -> list[GespeicherteNachricht]:
        bedingungen: list[str] = []
        werte: list[Any] = []
        if stufe:
            stufen = (stufe,) if isinstance(stufe, str) else tuple(stufe)
            bedingungen.append("stufe IN (" + ",".join("?" for _ in stufen) + ")")
            werte.extend(stufen)
        if nur_offene:
            bedingungen.append("erledigt_am IS NULL")
        if seit:
            bedingungen.append("empfangen_am >= ?")
            werte.append(iso(seit))
        where = f"WHERE {' AND '.join(bedingungen)}" if bedingungen else ""
        werte.append(limit)
        zeilen = self.db.query(
            f"SELECT * FROM nachricht {where} ORDER BY empfangen_am DESC LIMIT ?", werte
        )
        return [_zu_objekt(z) for z in zeilen]

    def offene_dringende(self) -> list[GespeicherteNachricht]:
        return self.liste(stufe=DRINGEND, nur_offene=True, limit=20)

    def zaehlen(self, seit: datetime) -> dict[str, int]:
        zeilen = self.db.query(
            "SELECT stufe, COUNT(*) AS n FROM nachricht WHERE empfangen_am > ? GROUP BY stufe",
            (iso(seit),),
        )
        return {z["stufe"]: z["n"] for z in zeilen}

    def suchen(self, begriff: str, limit: int = 10) -> list[GespeicherteNachricht]:
        muster = f"%{begriff}%"
        zeilen = self.db.query(
            "SELECT * FROM nachricht WHERE absender LIKE ? OR text LIKE ? OR gruppe LIKE ? "
            "ORDER BY empfangen_am DESC LIMIT ?",
            (muster, muster, muster, limit),
        )
        return [_zu_objekt(z) for z in zeilen]

    def aufraeumen(self, tage: int = 30) -> int:
        cursor = self.db.execute(
            "DELETE FROM nachricht WHERE empfangen_am < ? AND stufe = 'ignoriert'",
            (iso(utcnow() - timedelta(days=tage)),),
        )
        return cursor.rowcount or 0
