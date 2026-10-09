"""Der Agent: verbindet Gespraech, Modell, Werkzeuge, Aufgaben und Meldungen.

Ablauf einer Runde:

1. Aeusserung ins Kurzzeitgedaechtnis.
2. Nachrichten bauen (Systemtext, Fakten, offene Aufgaben, Fenster).
3. Modell fragen -- mit den Werkzeugen, die wirklich einsatzbereit sind.
4. Will das Modell ein Werkzeug: ausfuehren, Ergebnis zurueckgeben, erneut
   fragen. Hoechstens ``max_tool_rounds`` Runden, damit sich nichts aufhaengt.
5. Antworttext zurueckgeben und speichern.

Verlangt eine Aktion Bestaetigung, endet die Runde mit einer Rueckfrage. Die
Aktion wird gemerkt und erst bei ausdruecklicher Zustimmung ausgefuehrt -- der
Agent erteilt sich keine Freigabe selbst.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

from .config import Config
from .llm.client import Chunk, LLMCancelled, LLMError, ToolCall
from .llm.conversation import ConversationBuilder
from .logging_setup import get_logger
from .memory.db import Database
from .memory.store import KnowledgeStore, LongTermMemory, ShortTermMemory
from .notify.manager import NotificationManager, Priority
from .permissions import ConfirmationRequired, PermissionDenied
from .tasks.manager import Status, TaskManager
from .tools.registry import ToolError, ToolRegistry, ToolResult

log = get_logger("agent")

#: Worte, die als Zustimmung gelten.
#:
#: Hoeflichkeitsfloskeln stehen bewusst NICHT hier. "bitte", "gerne", "klar"
#: und "ok" kommen in ganz gewoehnlichen Saetzen vor: "Lies mir bitte die
#: Nachrichten vor" waere sonst die Zustimmung zu einer wartenden Loeschung.
#: Siehe _handle_confirmation -- dort muss die Aeusserung ausserdem *nur* aus
#: Zustimmung bestehen.
YES = {"ja", "jawohl", "jupp", "jep", "genau", "bestaetigt", "bestätigt",
       "einverstanden", "zustimmung", "mach", "machen", "los", "weiter"}

#: Ablehnung. Grosszuegiger als die Zustimmung -- im Zweifel lieber nicht tun.
NO = {"nein", "nicht", "stop", "stopp", "abbrechen", "lass", "lassen",
      "vergiss", "nee", "ne", "doch", "halt", "warte"}

#: Fuellwoerter, die neben einer Zustimmung stehen duerfen, ohne sie zu
#: entwerten: "Ja, bitte mach das" ist eine Zustimmung, "Lies mir bitte etwas
#: vor" nicht.
FUELLWORTE = {"bitte", "gerne", "gern", "klar", "ok", "okay", "schon", "doch",
              "mal", "dann", "das", "es", "so", "gut", "danke", "aber", "na",
              "also", "sicher", "unbedingt", "natuerlich", "natürlich"}

#: So lange gilt eine Rueckfrage. Danach verfaellt sie -- eine Zustimmung, die
#: drei Minuten spaeter kommt, bezieht sich wahrscheinlich auf etwas anderes.
CONFIRMATION_TIMEOUT = 90.0


@dataclass(slots=True)
class PendingAction:
    """Eine Aktion, die auf Zustimmung wartet."""

    tool: str
    arguments: dict
    description: str
    scope: str
    created_at: float

    def question(self) -> str:
        return f"{self.description} Soll ich das machen?"


@dataclass(slots=True)
class ToolRun:
    """Was ein Werkzeug tatsaechlich getan hat -- fuer Dashboard und Protokoll."""

    tool: str
    arguments: dict
    ok: bool
    message: str = ""
    verification: str = ""


@dataclass(slots=True)
class AgentReply:
    text: str = ""
    tool_runs: list[ToolRun] = field(default_factory=list)
    pending: PendingAction | None = None
    cancelled: bool = False
    error: str | None = None

    @property
    def needs_confirmation(self) -> bool:
        return self.pending is not None


class Agent:
    """Eine Gespraechsrunde pro Aufruf von ``respond``."""

    def __init__(self, config: Config, db: Database, llm, *,
                 registry: ToolRegistry | None = None,
                 notifications: NotificationManager | None = None,
                 session_id: str = "standard",
                 max_tool_rounds: int = 4,
                 clock=time.time) -> None:
        self.config = config
        self.db = db
        self.llm = llm
        self.tasks = TaskManager(db, clock=clock)
        self.long_term = LongTermMemory(db, clock=clock)
        self.knowledge = KnowledgeStore(db, clock=clock)
        self.short_term = ShortTermMemory(
            db, session_id, window=config.llm.history_turns, clock=clock)
        self.registry = registry or ToolRegistry(config.policy)
        self.notifications = notifications or NotificationManager(config.notify,
                                                                  clock=clock)
        self.conversation = ConversationBuilder(
            config.user_name, self.short_term, self.long_term, self.tasks)
        self.max_tool_rounds = max_tool_rounds
        self._clock = clock
        self.pending: PendingAction | None = None
        #: Wird gesetzt, wenn der Nutzer dazwischenspricht.
        self.cancel = threading.Event()

    # -- Gespraech ------------------------------------------------------
    def respond(self, user_text: str, *, on_text=None) -> AgentReply:
        """Beantwortet eine Aeusserung.

        ``on_text`` bekommt Textstuecke, sobald sie vom Modell kommen -- damit
        die Sprachausgabe nicht auf das Ende der Antwort warten muss.
        """
        user_text = user_text.strip()
        if not user_text:
            return AgentReply(text="")

        # Wartet eine Aktion auf Zustimmung, wird diese Aeusserung zuerst
        # als Antwort darauf gelesen.
        if self.pending is not None:
            entschieden = self._handle_confirmation(user_text)
            if entschieden is not None:
                return entschieden

        # Zuruecksetzen ist Absicht: hat der Nutzer die letzte Antwort
        # abgewuergt, darf dieses Abbruchsignal die neue Runde nicht sofort
        # wieder beenden. Innerhalb der Runde wirkt es weiter.
        self.cancel.clear()
        self.short_term.add("user", user_text)
        nachrichten = self.conversation.build()
        laeufe: list[ToolRun] = []

        for runde in range(self.max_tool_rounds + 1):
            try:
                antwort = self._ask(nachrichten, on_text=on_text)
            except LLMCancelled:
                log.info("Antwort abgebrochen, weil der Nutzer gesprochen hat.")
                return AgentReply(tool_runs=laeufe, cancelled=True)
            except LLMError as exc:
                log.error("Modellfehler: %s", exc)
                self.notifications.push(f"Das Sprachmodell antwortet nicht: {exc}",
                                        Priority.URGENT, dedupe_key="llm-fehler")
                return AgentReply(text=str(exc), tool_runs=laeufe, error=str(exc))

            if not antwort.tool_calls:
                text = antwort.text.strip()
                if text:
                    self.short_term.add("assistant", text)
                return AgentReply(text=text, tool_runs=laeufe)

            if runde == self.max_tool_rounds:
                # Das Modell dreht sich im Kreis. Lieber ehrlich abbrechen,
                # als endlos Werkzeuge aufzurufen.
                hinweis = ("Ich komme hier nicht weiter -- ich habe mehrfach "
                           "Werkzeuge aufgerufen, ohne zu einem Ergebnis zu kommen.")
                self.short_term.add("assistant", hinweis)
                return AgentReply(text=hinweis, tool_runs=laeufe)

            # Den Werkzeugwunsch in den Verlauf, damit das Modell weiss,
            # worauf sich das Ergebnis bezieht.
            nachrichten.append({
                "role": "assistant",
                "content": antwort.text,
                "tool_calls": [{"function": {"name": c.name, "arguments": c.arguments}}
                               for c in antwort.tool_calls],
            })
            for aufruf in antwort.tool_calls:
                ergebnis, lauf, wartend = self._run_tool(aufruf)
                laeufe.append(lauf)
                if wartend is not None:
                    self.pending = wartend
                    frage = wartend.question()
                    self.short_term.add("assistant", frage)
                    return AgentReply(text=frage, tool_runs=laeufe, pending=wartend)
                nachrichten.append({
                    "role": "tool",
                    "content": _tool_message(aufruf.name, ergebnis),
                })

        return AgentReply(tool_runs=laeufe)

    def _ask(self, nachrichten: list[dict], *, on_text=None):
        """Fragt das Modell und sammelt den Strom."""
        teile: list[str] = []
        aufrufe: list[ToolCall] = []
        for chunk in self.llm.chat(nachrichten,
                                   tools=self.registry.describe() or None,
                                   cancel=self.cancel):
            if chunk.text:
                teile.append(chunk.text)
                if on_text is not None:
                    on_text(chunk.text)
            aufrufe.extend(chunk.tool_calls)
        from .llm.client import Completion
        return Completion(text="".join(teile), tool_calls=aufrufe)

    # -- Werkzeuge ------------------------------------------------------
    def _run_tool(self, aufruf: ToolCall) -> tuple[ToolResult, ToolRun, PendingAction | None]:
        beschreibung = _describe(aufruf)
        try:
            ergebnis = self.registry.call(aufruf.name, aufruf.arguments)
        except ConfirmationRequired as exc:
            wartend = PendingAction(
                tool=aufruf.name, arguments=aufruf.arguments,
                description=exc.description, scope=exc.scope.value,
                created_at=self._clock(),
            )
            lauf = ToolRun(aufruf.name, aufruf.arguments, ok=False,
                           message="wartet auf Bestaetigung")
            return ToolResult(ok=False, message="wartet auf Bestaetigung"), lauf, wartend
        except PermissionDenied as exc:
            log.warning("Abgelehnt: %s", exc)
            self.notifications.push(str(exc), Priority.URGENT,
                                    dedupe_key=f"recht:{aufruf.name}")
            ergebnis = ToolResult(ok=False, message=str(exc))
        except ToolError as exc:
            # Fehlendes oder falsch aufgerufenes Werkzeug: das Modell bekommt
            # den Grund und kann es richtig machen oder es sein lassen.
            log.info("Werkzeugfehler: %s", exc)
            ergebnis = ToolResult(ok=False, message=str(exc))

        lauf = ToolRun(aufruf.name, aufruf.arguments, ok=ergebnis.ok,
                       message=ergebnis.message, verification=ergebnis.verification)
        log.info("Werkzeug %s -> %s", beschreibung, "ok" if ergebnis.ok else ergebnis.message)
        return ergebnis, lauf, None

    def _handle_confirmation(self, user_text: str) -> AgentReply | None:
        """Liest die Aeusserung als Zustimmung oder Ablehnung.

        Gibt ``None`` zurueck, wenn sie keines von beidem ist -- dann war es
        eine andere Aussage, die wartende Aktion verfaellt, und die Runde
        laeuft normal weiter. Das ist die sichere Richtung: im Zweifel wird
        nicht ausgefuehrt.
        """
        wartend = self.pending
        assert wartend is not None
        worte = {w.strip(".,!?;:").lower() for w in user_text.split()}

        # Abgelaufene Rueckfragen verfallen. Eine Zustimmung, die lange nach
        # der Frage kommt, meint vermutlich etwas anderes.
        if self._clock() - wartend.created_at > CONFIRMATION_TIMEOUT:
            log.info("Rueckfrage ist abgelaufen -- Aktion verfaellt.")
            self.pending = None
            return None

        if worte & NO:
            self.pending = None
            self.short_term.add("user", user_text)
            text = "Gut, dann lasse ich das."
            self.short_term.add("assistant", text)
            return AgentReply(text=text)

        # Zustimmung nur, wenn die Aeusserung *nichts anderes* enthaelt.
        # Ein einzelnes "ja" in einem Satz voller anderer Woerter ist keine
        # Zustimmung zu einer Loeschung -- das ist der Unterschied zwischen
        # "Ja, mach das" und "Ja, und lies mir die Nachrichten vor".
        nur_zustimmung = bool(worte & YES) and worte <= (YES | FUELLWORTE)

        if nur_zustimmung:
            self.pending = None
            self.short_term.add("user", user_text)
            try:
                ergebnis = self.registry.call(wartend.tool, wartend.arguments,
                                              confirmed=True)
            except (PermissionDenied, ToolError) as exc:
                text = f"Das ging nicht: {exc}"
                self.short_term.add("assistant", text)
                return AgentReply(text=text, error=str(exc))
            lauf = ToolRun(wartend.tool, wartend.arguments, ok=ergebnis.ok,
                           message=ergebnis.message, verification=ergebnis.verification)
            # Nennen, was tatsaechlich getan wurde -- ein blosses "Erledigt"
            # laesst den Nutzer im Unklaren, welche Aktion er bestaetigt hat.
            text = (f"Erledigt: {wartend.description}" if ergebnis.ok
                    else f"Das hat nicht geklappt: {ergebnis.message}")
            self.short_term.add("assistant", text)
            return AgentReply(text=text, tool_runs=[lauf])

        log.info("Keine klare Antwort auf die Rueckfrage -- Aktion verfaellt.")
        self.pending = None
        return None

    # -- Aufgaben, proaktiv ---------------------------------------------
    def announce_task_changes(self, before: dict[int, Status]) -> list[str]:
        """Vergleicht Aufgabenstatus und erzeugt Meldungen fuer echte Aenderungen.

        Grundlage ist der gespeicherte Status, nicht der Text des Modells.
        Formuliert ein Modell etwas als erledigt, ohne dass sich der Status
        geaendert hat, wird hier nichts gemeldet.
        """
        meldungen: list[str] = []
        for aufgabe in self.tasks.list(limit=200):
            vorher = before.get(aufgabe.id)
            if vorher is aufgabe.status:
                continue
            text, prio = _announcement(aufgabe, vorher)
            if text is None:
                continue
            note = self.notifications.push(
                text, prio, task_id=aufgabe.id,
                dedupe_key=f"aufgabe:{aufgabe.id}:{aufgabe.status.value}")
            if note is not None:
                meldungen.append(text)
        return meldungen

    def task_snapshot(self) -> dict[int, Status]:
        return {t.id: t.status for t in self.tasks.list(limit=200)}

    def status_sentence(self) -> str:
        """Ein Satz zum Stand -- fuer 'wie weit bist du?'."""
        offen = self.tasks.list(open_only=True)
        if not offen:
            return "Es ist nichts offen."
        laufend = [t for t in offen if t.status is Status.RUNNING]
        blockiert = [t for t in offen if t.status is Status.BLOCKED]
        teile = []
        if laufend:
            teile.append(f"{len(laufend)} laeuft" if len(laufend) == 1
                         else f"{len(laufend)} laufen")
        if blockiert:
            teile.append(f"{len(blockiert)} haengt" if len(blockiert) == 1
                         else f"{len(blockiert)} haengen")
        rest = len(offen) - len(laufend) - len(blockiert)
        if rest:
            teile.append(f"{rest} wartet" if rest == 1 else f"{rest} warten")
        satz = ", ".join(teile)
        if blockiert:
            satz += f". Bei '{blockiert[0].title}' fehlt: {blockiert[0].blocked_reason}"
        return satz

    def interrupt(self) -> None:
        """Bricht die laufende Antwort ab und verwirft wartende Ansagen."""
        self.cancel.set()
        self.notifications.interrupt()


def _announcement(aufgabe, vorher: Status | None) -> tuple[str | None, Priority]:
    """Welche Statusaenderung ist eine Ansage wert?"""
    if aufgabe.status is Status.DONE:
        return f"{aufgabe.title} ist erledigt.", Priority.IMPORTANT
    if aufgabe.status is Status.FAILED:
        return f"{aufgabe.title} ist fehlgeschlagen.", Priority.IMPORTANT
    if aufgabe.status is Status.BLOCKED:
        return (f"Bei {aufgabe.title} komme ich nicht weiter: "
                f"{aufgabe.blocked_reason}"), Priority.URGENT
    if aufgabe.status is Status.WAITING_EXTERNAL:
        return f"{aufgabe.title} wartet auf eine Antwort von aussen.", Priority.NOTABLE
    if aufgabe.status is Status.RUNNING and vorher is Status.BLOCKED:
        return f"{aufgabe.title} kann weiterlaufen.", Priority.NOTABLE
    # Anlegen und Starten sind keine Nachricht wert -- das hat der Nutzer
    # gerade selbst veranlasst.
    return None, Priority.INFO


def _describe(aufruf: ToolCall) -> str:
    args = ", ".join(f"{k}={v!r}" for k, v in aufruf.arguments.items())
    return f"{aufruf.name}({args})"


def _tool_message(name: str, ergebnis: ToolResult) -> str:
    """Was das Modell als Werkzeugergebnis sieht.

    Bei Misserfolg steht der Grund drin und ausdruecklich, dass nichts
    geschehen ist -- sonst formulieren kleine Modelle gern einen Erfolg.
    """
    if ergebnis.ok:
        kopf = f"{name} war erfolgreich."
        if ergebnis.value is not None:
            kopf += f" Ergebnis: {ergebnis.value}"
        if ergebnis.verification:
            kopf += f" Geprueft: {ergebnis.verification}"
        return kopf
    return (f"{name} ist NICHT ausgefuehrt worden. Grund: {ergebnis.message}. "
            "Sage das dem Nutzer und behaupte nicht, es sei geschehen.")
