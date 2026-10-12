"""WhatsApp-Mitteilungen von macOS mitlesen.

macOS legt jede Mitteilung in einer SQLite-Datei ab
(``~/Library/Group Containers/group.com.apple.usernoted/db2/db``). Dort
stehen Absender und Vorschautext der WhatsApp-Nachrichten, die der Mac
angezeigt hat. Jarvis liest diese Datei nur -- er meldet sich nicht bei
WhatsApp an, verschickt nichts und kann die Nummer nicht gefaehrden.

Was das kann und was nicht -- ehrlich:

* Es kommt nur an, was in der Mitteilung steht. Lange Nachrichten sind
  abgeschnitten, und wenn in den Systemeinstellungen die Vorschau
  ausgeschaltet ist, steht dort nur "Neue Nachricht".
* WhatsApp Desktop muss laufen und Mitteilungen senden duerfen.
* Der Prozess braucht einmalig **Festplattenvollzugriff** (Systemeinstellungen
  → Datenschutz & Sicherheit → Festplattenvollzugriff → Terminal).
* Nachrichten, die eintreffen, waehrend Jarvis steht, sieht er beim naechsten
  Start nach -- solange die Mitteilung nicht weggeklickt wurde.

Die Datei wird **schreibgeschuetzt** geoeffnet (``mode=ro``) und ueber eine
Kopie gelesen, damit ein laufendes macOS nicht gestoert wird.
"""

from __future__ import annotations

import asyncio
import logging
import plistlib
import shutil
import sqlite3
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .base import Nachricht, NachrichtenQuelle

log = logging.getLogger(__name__)

STANDARD_DB = Path.home() / "Library/Group Containers/group.com.apple.usernoted/db2/db"
#: Mit diesen Kennungen meldet sich WhatsApp auf dem Mac (je nach Fassung).
WHATSAPP_IDS = ("whatsapp", "net.whatsapp", "desktop.whatsapp")
#: Apple rechnet Zeiten ab dem 1.1.2001.
APPLE_EPOCHE = datetime(2001, 1, 1, tzinfo=timezone.utc)


def apple_zeit(wert: Any) -> datetime:
    try:
        return APPLE_EPOCHE + timedelta(seconds=float(wert))
    except (TypeError, ValueError):
        return datetime.now(timezone.utc)


def lies_mitteilung(blob: bytes) -> dict[str, str]:
    """Holt Titel, Untertitel und Text aus dem Datensatz einer Mitteilung."""
    try:
        daten = plistlib.loads(blob)
    except Exception:  # pragma: no cover - fremde Fassung
        return {}
    inhalt = daten.get("req") if isinstance(daten, dict) else None
    if not isinstance(inhalt, dict):
        return {}
    return {
        "titel": str(inhalt.get("titl", "") or ""),
        "untertitel": str(inhalt.get("subt", "") or ""),
        "text": str(inhalt.get("body", "") or ""),
    }


class MacMitteilungen(NachrichtenQuelle):
    name = "mac"

    def __init__(self, db_pfad: Path | str | None = None, *,
                 app_kennungen: tuple[str, ...] = WHATSAPP_IDS,
                 kanal: str = "whatsapp") -> None:
        self.db_pfad = Path(db_pfad) if db_pfad else STANDARD_DB
        self.app_kennungen = app_kennungen
        self.kanal = kanal
        #: Hoechste bereits gesehene Datensatznummer.
        self.letzte_id = 0

    # ------------------------------------------------------------------
    def verfuegbar(self) -> tuple[bool, str]:
        if not self.db_pfad.exists():
            return False, (
                f"Mitteilungsdatenbank nicht gefunden ({self.db_pfad}). "
                "Das gibt es nur auf macOS."
            )
        try:
            with self.db_pfad.open("rb") as datei:
                datei.read(16)
        except PermissionError:
            return False, (
                "Kein Zugriff auf die Mitteilungen. Systemeinstellungen → "
                "Datenschutz & Sicherheit → Festplattenvollzugriff → Terminal "
                "erlauben, danach Terminal neu starten."
            )
        except OSError as fehler:
            return False, f"Mitteilungen nicht lesbar: {fehler}"
        return True, f"Mitteilungen lesbar ({self.db_pfad})"

    def _lesen(self, limit: int) -> list[Nachricht]:
        """Liest die Datei ueber eine Kopie -- sie ist im Betrieb gesperrt."""
        with tempfile.TemporaryDirectory() as ordner:
            kopie = Path(ordner) / "mitteilungen.db"
            try:
                shutil.copy2(self.db_pfad, kopie)
                for zusatz in ("-wal", "-shm"):
                    quelle = Path(str(self.db_pfad) + zusatz)
                    if quelle.exists():
                        shutil.copy2(quelle, Path(str(kopie) + zusatz))
            except OSError as fehler:
                log.warning("Mitteilungen nicht kopierbar: %s", fehler)
                return []

            verbindung = sqlite3.connect(f"file:{kopie}?mode=ro", uri=True)
            verbindung.row_factory = sqlite3.Row
            try:
                return self._abfragen(verbindung, limit)
            except sqlite3.Error as fehler:
                log.warning("Mitteilungsdatenbank unlesbar: %s", fehler)
                return []
            finally:
                verbindung.close()

    def _abfragen(self, verbindung: sqlite3.Connection, limit: int) -> list[Nachricht]:
        muster = [f"%{kennung}%" for kennung in self.app_kennungen]
        bedingung = " OR ".join("LOWER(app.identifier) LIKE ?" for _ in muster)
        zeilen = verbindung.execute(
            "SELECT record.rec_id, record.data, record.delivered_date, app.identifier "
            "FROM record JOIN app ON app.app_id = record.app_id "
            f"WHERE record.rec_id > ? AND ({bedingung}) "
            "ORDER BY record.rec_id LIMIT ?",
            [self.letzte_id, *muster, limit],
        ).fetchall()

        nachrichten: list[Nachricht] = []
        for zeile in zeilen:
            self.letzte_id = max(self.letzte_id, int(zeile["rec_id"]))
            inhalt = lies_mitteilung(zeile["data"] or b"")
            if not inhalt:
                continue
            text = inhalt.get("text", "").strip()
            if not text:
                continue
            titel = inhalt.get("titel", "").strip()
            untertitel = inhalt.get("untertitel", "").strip()
            # In Gruppen steht der Gruppenname im Titel und der Absender
            # im Untertitel; bei Einzelchats ist der Untertitel leer.
            absender, gruppe = (untertitel, titel) if untertitel else (titel, "")
            nachrichten.append(Nachricht(
                extern_id=f"mac:{zeile['rec_id']}",
                absender=absender or "Unbekannt",
                gruppe=gruppe,
                text=text,
                empfangen_am=apple_zeit(zeile["delivered_date"]),
                kanal=self.kanal,
                quelle=self.name,
                extra={"app": zeile["identifier"]},
            ))
        return nachrichten

    def hoechste_id(self) -> int:
        """Aktuellen Stand setzen, ohne Altlasten zu melden."""
        with tempfile.TemporaryDirectory() as ordner:
            kopie = Path(ordner) / "mitteilungen.db"
            try:
                shutil.copy2(self.db_pfad, kopie)
            except OSError:
                return 0
            verbindung = sqlite3.connect(f"file:{kopie}?mode=ro", uri=True)
            try:
                wert = verbindung.execute("SELECT MAX(rec_id) FROM record").fetchone()
                return int(wert[0] or 0)
            except sqlite3.Error:
                return 0
            finally:
                verbindung.close()

    # ------------------------------------------------------------------
    async def neue(self, limit: int = 50) -> list[Nachricht]:
        ok, _ = self.verfuegbar()
        if not ok:
            return []
        return await asyncio.to_thread(self._lesen, limit)

    async def health(self) -> tuple[bool, str]:
        # Bewusst ohne ``neue()``: ein Probeabruf wuerde den Lesestand
        # weiterschieben und die Nachricht damit verschlucken.
        ok, hinweis = self.verfuegbar()
        if not ok:
            return False, hinweis
        return True, f"{hinweis}, Lesestand {self.letzte_id}"
