"""Stellt das Werkzeugverzeichnis zusammen.

Eine Stelle, an der alles zusammenlaeuft -- damit nicht jeder Einstiegspunkt
seine eigene Auswahl trifft und sich die Faehigkeiten auseinanderlaufen.
"""

from __future__ import annotations

from ..config import Config
from ..logging_setup import get_logger
from ..permissions import Scope
from . import files, mac, web
from .registry import Param, Tool, ToolRegistry, ToolResult

log = get_logger("tools")


def build_registry(config: Config, *, agent=None) -> ToolRegistry:
    """Baut das Verzeichnis fuer eine Konfiguration.

    ``agent`` wird fuer die Werkzeuge gebraucht, die auf Gedaechtnis und
    Aufgaben zugreifen. Ohne Agent werden sie weggelassen.
    """
    registry = ToolRegistry(config.policy)
    files.register(registry, config.policy)
    mac.register(registry, config.policy)
    web.register(registry, config.policy)
    if agent is not None:
        register_self_tools(registry, agent)
    verfuegbar = registry.available()
    log.info("%d Werkzeuge angemeldet, %d davon einsatzbereit",
             len(registry.all()), len(verfuegbar))
    return registry


def register_self_tools(registry: ToolRegistry, agent) -> None:
    """Werkzeuge, mit denen JARVIS sein eigenes Gedaechtnis und seine Aufgaben
    fuehrt.

    Diese stehen unter ``READ``/``CREATE``, nicht unter ``SYSTEM``: sie wirken
    nur innerhalb von JARVIS und beruehren nichts am Rechner.
    """

    def _remember(thema: str, aussage: str, wert: str) -> ToolResult:
        from ..memory.store import Contradiction
        try:
            fakt = agent.long_term.remember(thema, aussage, wert, source="Gespraech")
        except Contradiction as exc:
            return ToolResult(
                ok=False,
                message=f"Das widerspricht dem, was gespeichert ist: {exc} "
                        "Frag nach, was gilt, und speichere es dann mit "
                        "'fakt_korrigieren'.")
        return ToolResult(ok=True, value=fakt.as_sentence(),
                          verification=f"Fakt {fakt.id} gespeichert")

    def _correct(thema: str, aussage: str, wert: str) -> ToolResult:
        fakt = agent.long_term.remember(thema, aussage, wert, source="Gespraech",
                                        force=True)
        return ToolResult(ok=True, value=fakt.as_sentence(),
                          verification=f"Fakt {fakt.id} ersetzt, alter Wert als "
                                       "ueberholt vermerkt")

    def _recall(thema: str) -> ToolResult:
        fakten = agent.long_term.about(thema)
        if not fakten:
            return ToolResult(ok=True, value=f"Zu '{thema}' ist nichts gespeichert.",
                              verification="Langzeitgedaechtnis abgefragt")
        return ToolResult(ok=True,
                          value="\n".join(f.as_sentence() for f in fakten),
                          verification=f"{len(fakten)} Fakt(en) zu '{thema}'")

    def _knowledge_search(anfrage: str) -> ToolResult:
        treffer = agent.knowledge.search(anfrage)
        if not treffer:
            return ToolResult(ok=True, value="(nichts gefunden)",
                              verification=f"Wissensspeicher nach '{anfrage}' durchsucht")
        return ToolResult(
            ok=True,
            value="\n\n".join(f"{t['title']}: {t['auszug']}" for t in treffer),
            verification=f"{len(treffer)} Treffer im Wissensspeicher")

    def _knowledge_add(titel: str, inhalt: str) -> ToolResult:
        kennung = agent.knowledge.add(titel, inhalt, source="Gespraech")
        return ToolResult(ok=True, value=str(kennung),
                          verification=f"Notiz {kennung} im Wissensspeicher abgelegt")

    def _task_create(titel: str, einzelheiten: str = "") -> ToolResult:
        aufgabe = agent.tasks.create(titel, detail=einzelheiten)
        return ToolResult(ok=True, value=f"#{aufgabe.id} {aufgabe.title}",
                          verification=f"Aufgabe {aufgabe.id} angelegt, Status "
                                       f"{aufgabe.status.value}")

    def _task_steps(aufgabe_id: int, schritte: str) -> ToolResult:
        """Zerlegt eine Aufgabe. Schritte durch Semikolon getrennt --
        Listen uebergeben kleine Modelle unzuverlaessig."""
        teile = [s.strip() for s in schritte.split(";") if s.strip()]
        if not teile:
            return ToolResult(ok=False, message="Keine Schritte angegeben.")
        unter = agent.tasks.plan_steps(int(aufgabe_id), teile)
        return ToolResult(ok=True,
                          value="\n".join(f"#{t.id} {t.title}" for t in unter),
                          verification=f"{len(unter)} Teilschritte angelegt")

    def _task_list() -> ToolResult:
        offen = agent.tasks.list(open_only=True)
        if not offen:
            return ToolResult(ok=True, value="Es ist nichts offen.",
                              verification="Aufgabenliste abgefragt")
        return ToolResult(ok=True,
                          value="\n".join(f"#{t.id} {t.summary()}" for t in offen),
                          verification=f"{len(offen)} offene Aufgabe(n)")

    def _task_start(aufgabe_id: int) -> ToolResult:
        aufgabe = agent.tasks.start(int(aufgabe_id))
        return ToolResult(ok=True, value=aufgabe.summary(),
                          verification=f"Aufgabe {aufgabe.id} auf "
                                       f"{aufgabe.status.value} gesetzt")

    def _task_done(aufgabe_id: int, ergebnis: str, pruefung: str) -> ToolResult:
        """Erledigt eine Aufgabe. ``pruefung`` muss beschreiben, *wie* das
        Ergebnis geprueft wurde -- ein leerer Vermerk wird abgelehnt."""
        from ..tasks.manager import TaskError
        try:
            aufgabe = agent.tasks.complete(int(aufgabe_id), ergebnis, pruefung)
        except TaskError as exc:
            return ToolResult(ok=False, message=str(exc))
        return ToolResult(ok=True, value=aufgabe.summary(),
                          verification=f"Aufgabe {aufgabe.id} erledigt, "
                                       f"Pruefvermerk: {aufgabe.verification}")

    def _task_block(aufgabe_id: int, grund: str) -> ToolResult:
        from ..tasks.manager import TaskError
        try:
            aufgabe = agent.tasks.block(int(aufgabe_id), grund)
        except TaskError as exc:
            return ToolResult(ok=False, message=str(exc))
        return ToolResult(ok=True, value=aufgabe.summary(),
                          verification=f"Aufgabe {aufgabe.id} blockiert: {grund}")

    def _task_fail(aufgabe_id: int, grund: str) -> ToolResult:
        from ..tasks.manager import TaskError
        try:
            aufgabe = agent.tasks.fail(int(aufgabe_id), grund)
        except TaskError as exc:
            return ToolResult(ok=False, message=str(exc))
        return ToolResult(ok=True, value=aufgabe.summary(),
                          verification=f"Aufgabe {aufgabe.id} als fehlgeschlagen "
                                       f"vermerkt: {grund}")

    eigene = [
        ("fakt_merken", "Speichert eine dauerhaft wichtige Information.",
         Scope.READ, {"thema": Param(str, description="Worum es geht, z.B. 'Noah'"),
                      "aussage": Param(str, description="Welche Eigenschaft"),
                      "wert": Param(str, description="Der Wert")}, _remember),
        ("fakt_korrigieren", "Ersetzt einen gespeicherten Fakt durch einen neuen Wert.",
         Scope.READ, {"thema": Param(str), "aussage": Param(str), "wert": Param(str)},
         _correct),
        ("fakt_abfragen", "Nennt, was zu einem Thema gespeichert ist.",
         Scope.READ, {"thema": Param(str)}, _recall),
        ("wissen_suchen", "Durchsucht abgelegte Notizen und Dokumente.",
         Scope.READ, {"anfrage": Param(str)}, _knowledge_search),
        ("wissen_ablegen", "Legt eine Notiz im Wissensspeicher ab.",
         Scope.READ, {"titel": Param(str), "inhalt": Param(str)}, _knowledge_add),
        ("aufgabe_anlegen", "Legt eine Aufgabe an.",
         Scope.READ, {"titel": Param(str),
                      "einzelheiten": Param(str, required=False, default="")},
         _task_create),
        ("aufgabe_zerlegen", "Legt Teilschritte zu einer Aufgabe an, "
                             "getrennt durch Semikolon.",
         Scope.READ, {"aufgabe_id": Param(int), "schritte": Param(str)}, _task_steps),
        ("aufgaben_offen", "Nennt die offenen Aufgaben mit Status.",
         Scope.READ, {}, _task_list),
        ("aufgabe_beginnen", "Setzt eine Aufgabe auf 'laeuft'.",
         Scope.READ, {"aufgabe_id": Param(int)}, _task_start),
        ("aufgabe_erledigt", "Schliesst eine Aufgabe ab. Braucht einen Pruefvermerk, "
                             "der beschreibt, wie das Ergebnis geprueft wurde.",
         Scope.READ, {"aufgabe_id": Param(int), "ergebnis": Param(str),
                      "pruefung": Param(str, description="Wie wurde es geprueft?")},
         _task_done),
        ("aufgabe_blockiert", "Haelt eine Aufgabe an, weil etwas fehlt.",
         Scope.READ, {"aufgabe_id": Param(int), "grund": Param(str)}, _task_block),
        ("aufgabe_gescheitert", "Vermerkt eine Aufgabe als fehlgeschlagen.",
         Scope.READ, {"aufgabe_id": Param(int), "grund": Param(str)}, _task_fail),
    ]

    for name, beschreibung, scope, params, funktion in eigene:
        registry.add(Tool(name=name, description=beschreibung, scope=scope,
                          params=params, func=funktion))
