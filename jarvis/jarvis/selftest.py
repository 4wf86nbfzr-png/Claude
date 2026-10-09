"""Selbsttest: prueft die ganze Kette auf dem Rechner, auf dem Jarvis laeuft.

Anders als ``doctor`` (fragt nur Zustaende ab) *tut* der Selbsttest etwas:
legt eine Aufgabe an, plant eine Erinnerung in die Vergangenheit, laesst den
Hintergrunddienst sie ausloesen, prueft die Zustellung, loest eine
Bestaetigung ein und raeumt hinterher alles wieder weg.

Alles passiert in einer eigenen Datenbank unter ``data/selftest/`` -- der
Echtbetrieb wird nicht angefasst. Es werden keine Anrufe gefuehrt, keine
E-Mails versendet und keine externen Dienste geaendert.
"""

from __future__ import annotations

import logging
import shutil
import time
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from .config import Settings
from .db.database import utcnow
from .db.migrations import current_version

log = logging.getLogger(__name__)


@dataclass(slots=True)
class Pruefung:
    name: str
    ok: bool
    hinweis: str = ""
    dauer_ms: int = 0

    @property
    def zeichen(self) -> str:
        return "✓" if self.ok else "✗"


@dataclass(slots=True)
class Ergebnis:
    pruefungen: list[Pruefung] = field(default_factory=list)

    @property
    def fehler(self) -> list[Pruefung]:
        return [p for p in self.pruefungen if not p.ok]

    @property
    def bestanden(self) -> bool:
        return not self.fehler


class Selbsttest:
    def __init__(self, settings: Settings) -> None:
        # Eigenes Datenverzeichnis: der Echtbetrieb bleibt unberuehrt.
        self.ordner = settings.data_dir / "selftest"
        self.settings = Settings.load()
        self.settings.data_dir = self.ordner
        self.settings.http_enabled = False
        self.settings.morning_briefing = ""
        self.settings.scheduler_tick_seconds = 5
        # Das Sprachmodell wird nicht gebraucht: geprueft wird die Mechanik.
        self.settings.ai_provider = "echo"
        self.settings.email_enabled = False
        self.settings.phone_enabled = False
        self.settings.calendar_provider = "local"
        self.ergebnis = Ergebnis()
        self.zugestellt: list[str] = []

    # ------------------------------------------------------------------
    async def pruefe(self, name: str, aufgabe) -> bool:
        start = time.monotonic()
        try:
            hinweis = await aufgabe()
            ok = True
        except AssertionError as fehler:
            hinweis = str(fehler) or "Erwartung nicht erfuellt"
            ok = False
        except Exception as fehler:  # noqa: BLE001 - der Test soll alles fangen
            hinweis = f"{type(fehler).__name__}: {fehler}"
            ok = False
        dauer = int((time.monotonic() - start) * 1000)
        self.ergebnis.pruefungen.append(Pruefung(name, ok, hinweis or "", dauer))
        print(f" {'✓' if ok else '✗'}  {name.ljust(42)} {hinweis or ''}")
        return ok

    async def lauf(self) -> Ergebnis:
        from .core.services import Services

        if self.ordner.exists():
            shutil.rmtree(self.ordner)
        self.settings.ensure_dirs()
        print("\nSelbsttest -- eigene Datenbank unter", self.ordner, "\n")

        dienste = Services(self.settings)
        try:
            await self._pruefungen(dienste)
        finally:
            await dienste.stop()
            shutil.rmtree(self.ordner, ignore_errors=True)

        print()
        if self.ergebnis.bestanden:
            print(f"Alle {len(self.ergebnis.pruefungen)} Pruefungen bestanden.")
        else:
            print(f"{len(self.ergebnis.fehler)} von {len(self.ergebnis.pruefungen)} "
                  "Pruefungen fehlgeschlagen:")
            for pruefung in self.ergebnis.fehler:
                print(f"  ✗ {pruefung.name}: {pruefung.hinweis}")
        return self.ergebnis

    # ------------------------------------------------------------------
    async def _pruefungen(self, dienste: Any) -> None:
        async def sender(text: str, keyboard: dict | None = None) -> bool:
            self.zugestellt.append(text)
            return True

        dienste.notifier.set_sender(sender)
        dienste.notifier.quiet_start = dienste.notifier.quiet_end = ""

        await self.pruefe("Datenbank angelegt und migriert", lambda: self._datenbank(dienste))
        await self.pruefe("Werkzeuge vollstaendig registriert", lambda: self._werkzeuge(dienste))
        await self.pruefe("Aufgabe anlegen und abschliessen", lambda: self._aufgabe(dienste))
        await self.pruefe("Gedaechtnis merkt und findet", lambda: self._gedaechtnis(dienste))
        await self.pruefe("Termin anlegen und nachlesen", lambda: self._termin(dienste))
        await self.pruefe("Erinnerung wird ausgeloest", lambda: self._erinnerung(dienste))
        await self.pruefe("Keine doppelte Ausfuehrung", lambda: self._doppelt(dienste))
        await self.pruefe("Wiederkehrende Erinnerung rueckt nach",
                          lambda: self._wiederholung(dienste))
        await self.pruefe("Bestaetigung schuetzt Loeschung", lambda: self._bestaetigung(dienste))
        await self.pruefe("Gespraech laeuft durch den Agenten", lambda: self._agent(dienste))
        await self.pruefe("Tagesueberblick nennt echte Daten", lambda: self._ueberblick(dienste))
        await self.pruefe("Sicherung schreibt und haelt", lambda: self._sicherung(dienste))
        await self.pruefe("Neustart verliert nichts", lambda: self._neustart(dienste))
        await self.pruefe("Zustandsbericht vollstaendig", lambda: self._zustand(dienste))

    # --- die einzelnen Pruefungen ---------------------------------------
    async def _datenbank(self, dienste: Any) -> str:
        stand = current_version(dienste.db)
        assert stand > 0, "Kein Schema angelegt"
        tabellen = dienste.db.query(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
        assert len(tabellen) >= 20, f"nur {len(tabellen)} Tabellen"
        return f"Schema {stand}, {len(tabellen)} Tabellen"

    async def _werkzeuge(self, dienste: Any) -> str:
        namen = dienste.toolkit.names()
        assert len(namen) >= 30, f"nur {len(namen)} Werkzeuge"
        for pflicht in ("aufgabe_anlegen", "erinnerung_anlegen", "termine_anzeigen",
                        "gedaechtnis_merken", "tagesueberblick", "systemstatus"):
            assert pflicht in namen, f"{pflicht} fehlt"
        return f"{len(namen)} Werkzeuge"

    async def _aufgabe(self, dienste: Any) -> str:
        angelegt = await dienste.toolkit.execute(
            "aufgabe_anlegen", {"titel": "Selbsttest-Aufgabe", "prioritaet": "hoch"}
        )
        assert angelegt.ok, angelegt.text
        nummer = angelegt.data["id"]
        offen = await dienste.toolkit.execute("aufgaben_liste", {})
        assert "Selbsttest-Aufgabe" in offen.text, "Aufgabe nicht in der Liste"
        fertig = await dienste.toolkit.execute(
            "aufgabe_abschliessen", {"aufgabe": str(nummer)}
        )
        assert fertig.ok, fertig.text
        assert dienste.tasks.get(nummer).status == "erledigt"
        return f"Aufgabe #{nummer}"

    async def _gedaechtnis(self, dienste: Any) -> str:
        await dienste.toolkit.execute("gedaechtnis_merken", {
            "schluessel": "Selbsttest", "wert": "Telefoniert lieber vormittags",
            "wichtigkeit": 5,
        })
        gefunden = await dienste.toolkit.execute(
            "gedaechtnis_suchen", {"frage": "telefonieren"}
        )
        assert "vormittags" in gefunden.text, "Eintrag nicht gefunden"
        assert any(e.key == "Selbsttest" for e in dienste.memory.important_memory())
        return "merken, suchen, einstufen"

    async def _termin(self, dienste: Any) -> str:
        angelegt = await dienste.toolkit.execute("termin_anlegen", {
            "titel": "Selbsttest-Termin", "beginn": "in 3 stunden", "dauer_minuten": 30,
        })
        assert angelegt.ok, angelegt.text
        kennung = angelegt.data["uid"]
        # Entscheidend: der Termin kommt aus der Quelle zurueck.
        nachgelesen = await dienste.calendar.get_event(kennung)
        assert nachgelesen is not None, "Termin nicht nachlesbar"
        assert nachgelesen.title == "Selbsttest-Termin"
        assert await dienste.calendar.delete_event(kennung), "Loeschen nicht bestaetigt"
        return f"Kalender '{dienste.calendar.name}'"

    async def _erinnerung(self, dienste: Any) -> str:
        self.zugestellt.clear()
        erinnerung = dienste.reminders.create(
            "Selbsttest-Erinnerung", utcnow() - timedelta(minutes=1)
        )
        await dienste._sweep_reminders()
        await dienste.scheduler.tick()
        assert any("Selbsttest-Erinnerung" in t for t in self.zugestellt), \
            "Erinnerung wurde nicht zugestellt"
        zustand = dienste.reminders.get(erinnerung.id).status
        assert zustand in {"ausgeloest", "bestaetigt"}, f"Zustand {zustand}"
        dienste.reminders.delete(erinnerung.id)
        return "ausgeloest und zugestellt"

    async def _doppelt(self, dienste: Any) -> str:
        self.zugestellt.clear()
        erinnerung = dienste.reminders.create(
            "Selbsttest-Einmalig", utcnow() - timedelta(minutes=1)
        )
        for _ in range(3):
            await dienste._sweep_reminders()
            await dienste.scheduler.tick()
        treffer = [t for t in self.zugestellt if "Selbsttest-Einmalig" in t]
        assert len(treffer) == 1, f"{len(treffer)} Zustellungen statt einer"
        dienste.reminders.delete(erinnerung.id)
        return "genau eine Zustellung bei drei Durchlaeufen"

    async def _wiederholung(self, dienste: Any) -> str:
        erinnerung = dienste.reminders.create(
            "Selbsttest-Woechentlich", utcnow() - timedelta(minutes=1),
            recurrence="woechentlich:mo",
        )
        await dienste._sweep_reminders()
        await dienste.scheduler.tick()
        aktuell = dienste.reminders.get(erinnerung.id)
        assert aktuell.status == "geplant", f"Zustand {aktuell.status}"
        assert aktuell.due_at > utcnow(), "Naechster Termin liegt nicht in der Zukunft"
        dienste.reminders.delete(erinnerung.id)
        return "naechster Termin steht"

    async def _bestaetigung(self, dienste: Any) -> str:
        aufgabe = dienste.tasks.create("Selbsttest-Loeschkandidat")
        anfrage = await dienste.toolkit.execute(
            "aufgabe_loeschen", {"aufgabe": str(aufgabe.id)}, chat_id="selbsttest"
        )
        assert anfrage.confirmation_token, "Keine Bestaetigung angefordert"
        assert dienste.tasks.get(aufgabe.id) is not None, \
            "Ohne Bestaetigung schon geloescht"
        await dienste.build_agent().confirm(anfrage.confirmation_token)
        assert dienste.tasks.get(aufgabe.id) is None, "Nach Bestaetigung nicht geloescht"
        # Ein zweites Einloesen desselben Tokens muss scheitern.
        nochmal = await dienste.build_agent().confirm(anfrage.confirmation_token)
        assert "schon" in nochmal.text or "kenne" in nochmal.text, nochmal.text
        return "Einmal-Token haelt"

    async def _agent(self, dienste: Any) -> str:
        from .ai.provider import ModelReply, ToolInvocation
        from .ai.cloud import EchoProvider

        provider = EchoProvider(scripted=[
            ModelReply(text="", tool_calls=[ToolInvocation(
                name="aufgabe_anlegen", arguments={"titel": "Selbsttest ueber den Agenten"})]),
            ModelReply(text="Ist notiert."),
        ])
        vorher = dienste.models.primary
        dienste.models.primary = provider
        dienste.models.active = provider
        dienste.models.fallback = None
        try:
            antwort = await dienste.build_agent().handle(
                "selbsttest", "Leg mir das bitte an"
            )
            assert antwort.text == "Ist notiert.", antwort.text
            assert "aufgabe_anlegen" in antwort.tool_names
            assert any(t.title == "Selbsttest ueber den Agenten"
                       for t in dienste.tasks.list()), "Aufgabe fehlt"
            # Werkzeugergebnis muss dem Modell vorgelegen haben.
            assert any(m.role == "tool" for m in provider.calls[-1]), \
                "Werkzeugergebnis ging nicht ans Modell"
        finally:
            dienste.models.primary = vorher
            dienste.models.active = vorher
        return "Nachricht -> Werkzeug -> Antwort"

    async def _ueberblick(self, dienste: Any) -> str:
        dienste.tasks.create("Selbsttest-Ueberblick", priority="hoch")
        ueberblick = await dienste.daily_overview()
        assert "Selbsttest-Ueberblick" in ueberblick, "Aufgabe fehlt im Ueberblick"
        return f"{len(ueberblick.splitlines())} Zeilen"

    async def _sicherung(self, dienste: Any) -> str:
        datei = dienste.db.backup(self.settings.backup_dir, keep=2)
        assert datei.exists() and datei.stat().st_size > 0, "Sicherung ist leer"
        for _ in range(3):
            dienste.db.backup(self.settings.backup_dir, keep=2)
        vorhanden = list(self.settings.backup_dir.glob("jarvis-*.sqlite3"))
        assert len(vorhanden) <= 2, f"{len(vorhanden)} Sicherungen trotz Grenze 2"
        return f"{datei.name}, Grenze haelt"

    async def _neustart(self, dienste: Any) -> str:
        from .core.services import Services

        erinnerung = dienste.reminders.create(
            "Selbsttest-Neustart", utcnow() + timedelta(hours=5)
        )
        auftrag = dienste.queue.enqueue(
            "sicherung", run_at=utcnow() + timedelta(hours=2),
            idempotency_key="selbsttest-neustart",
        )
        # Den Hintergrunddienst anhalten reicht: geprueft wird, ob ein *neuer*
        # Dienst auf derselben Datenbank alles wiederfindet. Die Verbindung des
        # ersten bleibt offen, sonst stehen die folgenden Pruefungen ohne da.
        await dienste.scheduler.stop()

        zweiter = Services(self.settings)
        try:
            wieder = zweiter.reminders.get(erinnerung.id)
            assert wieder is not None, "Erinnerung nach Neustart verschwunden"
            assert wieder.status == "geplant", f"Zustand {wieder.status}"
            assert any(j.kind == "sicherung" for j in zweiter.queue.pending()), \
                "Auftrag nach Neustart verschwunden"
            zweiter.reminders.delete(erinnerung.id)
            if auftrag is not None:
                zweiter.queue.cancel(auftrag.id)
        finally:
            await zweiter.stop()

        await dienste.scheduler.start()
        return "Erinnerung und Auftrag ueberlebt"

    async def _zustand(self, dienste: Any) -> str:
        zustaende = await dienste.health()
        namen = {z.name for z in zustaende}
        for pflicht in ("Datenbank", "KI-Modell", "Telegram", "Hintergrunddienst"):
            assert pflicht in namen, f"{pflicht} fehlt im Bericht"
        schnappschuss = dienste.status_snapshot()
        for schluessel in ("modell", "aufgaben", "auftraege", "erinnerungen"):
            assert schluessel in schnappschuss, f"{schluessel} fehlt"
        return f"{len(zustaende)} Bausteine gemeldet"


async def run_selftest(settings: Settings) -> int:
    ergebnis = await Selbsttest(settings).lauf()
    return 0 if ergebnis.bestanden else 1
