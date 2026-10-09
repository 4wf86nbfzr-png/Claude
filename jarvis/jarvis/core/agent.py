"""Gespraechsfuehrung.

Der Agent nimmt eine Nachricht (egal woher: Telegram, Telefon, Dashboard),
baut den Kontext, fragt das Modell, fuehrt die gewuenschten Werkzeuge aus,
gibt dem Modell deren Ergebnis und liefert am Ende die Antwort.

Drei Dinge, die hier bewusst so geloest sind:

* **Kontext bleibt klein.** Die letzten ``ai_context_messages`` Nachrichten,
  eine laufende Zusammenfassung und die als wichtig markierten
  Gedaechtniseintraege. Der uebrige Bestand wird nur auf Nachfrage geholt.
* **Werkzeugergebnisse gehen zurueck ins Modell**, damit die Antwort auf dem
  tatsaechlichen Ergebnis beruht und nicht auf einer Annahme. Liefert das
  Modell danach keinen Text, wird das Werkzeugergebnis selbst gezeigt --
  besser eine nuechterne Tatsache als eine erfundene Bestaetigung.
* **Bestaetigungen unterbrechen den Ablauf.** Verlangt ein Werkzeug eine
  Freigabe, endet die Runde mit der Rueckfrage; ausgefuehrt wird erst beim
  Tastendruck (``confirm``).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from ..ai.prompt import SUMMARY_PROMPT, build_system_prompt
from ..ai.provider import ChatMessage, ToolInvocation
from ..errors import JarvisError, ModelUnavailable
from .timeutil import format_local
from .toolkit import ToolResult

if TYPE_CHECKING:
    from .services import Services

log = logging.getLogger(__name__)

SUMMARIZE_EVERY = 24


@dataclass(slots=True)
class AgentReply:
    text: str
    buttons: list[tuple[str, str]] = field(default_factory=list)
    confirmation_token: str = ""
    tool_names: list[str] = field(default_factory=list)
    degraded: bool = False

    @property
    def needs_confirmation(self) -> bool:
        return bool(self.confirmation_token)


class Agent:
    def __init__(self, services: "Services") -> None:
        self.services = services
        self.settings = services.settings
        self._summary_tasks: set[asyncio.Task] = set()

    # ------------------------------------------------------------------ API
    async def handle(
        self, chat_id: str, text: str, *, channel: str = "telegram",
        store_user_message: bool = True,
    ) -> AgentReply:
        services = self.services
        text = (text or "").strip()
        if not text:
            return AgentReply(text="Da war keine Nachricht dabei.")

        if store_user_message:
            services.memory.add_message(chat_id, "user", text, channel=channel)

        messages = self._build_context(chat_id, text, channel=channel)
        tools = services.toolkit.specs()
        used_tools: list[str] = []
        pending_confirmation = ""
        buttons: list[tuple[str, str]] = []
        last_tool_text = ""

        for round_number in range(1, self.settings.ai_max_tool_rounds + 1):
            try:
                reply = await services.models.chat(messages, tools=tools)
            except ModelUnavailable as exc:
                log.error("Kein Modell erreichbar: %s", exc.message)
                if last_tool_text:
                    # Das Werkzeug hat gearbeitet -- das Ergebnis darf nicht verloren gehen.
                    return self._finish(chat_id, last_tool_text, buttons, pending_confirmation,
                                        used_tools, channel, degraded=True)
                return AgentReply(
                    text=(
                        "Das Sprachmodell antwortet gerade nicht. "
                        f"({exc.hint or exc.message})\n\n"
                        "Befehle wie /uebersicht, /aufgaben und /erinnerungen laufen weiter."
                    ),
                    degraded=True,
                )

            if not reply.wants_tools:
                answer = reply.text.strip()
                if services.models.degraded and last_tool_text:
                    # Das Ersatzmodell kann den Werkzeugbefund nicht formulieren.
                    # Dann ist die nuechterne Tatsache besser als eine Floskel.
                    answer = (
                        last_tool_text
                        + "\n\n_(Das Sprachmodell ist gerade nicht erreichbar -- "
                        "das ist das unformatierte Ergebnis.)_"
                    )
                answer = answer or last_tool_text or "Dazu habe ich gerade keine Antwort."
                return self._finish(chat_id, answer, buttons, pending_confirmation,
                                    used_tools, channel, degraded=services.models.degraded)

            messages.append(ChatMessage(
                role="assistant", content=reply.text, tool_calls=reply.tool_calls
            ))
            for call in reply.tool_calls:
                result = await self._run_tool(call, chat_id=chat_id, channel=channel)
                used_tools.append(call.name)
                last_tool_text = result.text
                if result.confirmation_token:
                    pending_confirmation = result.confirmation_token
                    buttons = result.buttons
                    # Hier endet die Runde: die Antwort ist die Rueckfrage selbst.
                    return self._finish(chat_id, result.text, buttons, pending_confirmation,
                                        used_tools, channel)
                if result.buttons:
                    buttons = result.buttons
                messages.append(ChatMessage(
                    role="tool", content=result.for_model(),
                    tool_name=call.name, tool_call_id=call.call_id or call.name,
                ))

        # Zu viele Runden: das Ergebnis des letzten Werkzeugs ist immer noch brauchbar.
        log.warning("Werkzeuggrenze (%s Runden) erreicht", self.settings.ai_max_tool_rounds)
        return self._finish(
            chat_id,
            last_tool_text or "Ich bin da gerade nicht weitergekommen -- bitte noch einmal anders.",
            buttons, pending_confirmation, used_tools, channel,
        )

    async def confirm(self, token: str, *, chat_id: str = "") -> AgentReply:
        """Loest eine Bestaetigung ein und fuehrt die Aktion wirklich aus."""
        services = self.services
        try:
            confirmation = services.permissions.consume(token)
        except JarvisError as exc:
            return AgentReply(text=exc.user_text())

        handler = getattr(services, "confirmed_actions", {}).get(confirmation.action)
        if handler is None:
            log.error("Keine Ausfuehrung fuer bestaetigte Aktion '%s'", confirmation.action)
            return AgentReply(text=f"Fuer '{confirmation.action}' fehlt die Ausfuehrung.")
        try:
            result: ToolResult = await handler(services, confirmation.payload)
        except JarvisError as exc:
            result = ToolResult.failure(exc.user_text())
        except Exception as exc:  # pragma: no cover
            log.exception("Bestaetigte Aktion %s fehlgeschlagen", confirmation.action)
            result = ToolResult.failure(f"Die Aktion ist fehlgeschlagen: {type(exc).__name__}: {exc}")

        services.memory.remember_event(
            "bestaetigte_aktion", confirmation.action,
            {"erfolg": result.ok, "ergebnis": result.text[:300]}, ok=result.ok,
        )
        if chat_id:
            services.memory.add_message(chat_id, "assistant", result.text)
        return AgentReply(text=result.text, tool_names=[confirmation.action])

    async def reject(self, token: str) -> AgentReply:
        confirmation = self.services.permissions.reject(token)
        if confirmation is None:
            return AgentReply(text="Diese Rueckfrage kenne ich nicht mehr.")
        return AgentReply(text=f"Gut, ich lasse es: {confirmation.summary}")

    async def run_tool_directly(
        self, name: str, arguments: dict[str, Any] | None = None, *, chat_id: str = "",
    ) -> AgentReply:
        """Fuer Knoepfe und Befehle: Werkzeug ohne Modellumweg aufrufen."""
        result = await self.services.toolkit.execute(
            name, arguments or {}, chat_id=chat_id, channel="telegram"
        )
        return AgentReply(
            text=result.text, buttons=result.buttons,
            confirmation_token=result.confirmation_token, tool_names=[name],
        )

    # --------------------------------------------------------------- Inneres
    async def _run_tool(
        self, call: ToolInvocation, *, chat_id: str, channel: str
    ) -> ToolResult:
        log.info("Werkzeug %s mit %s", call.name, list(call.arguments)[:6])
        return await self.services.toolkit.execute(
            call.name, call.arguments, chat_id=chat_id, channel=channel
        )

    def _build_context(self, chat_id: str, text: str, *, channel: str) -> list[ChatMessage]:
        services = self.services
        state = services.memory.get_state(chat_id)

        state_lines: list[str] = []
        if state.get("summary"):
            state_lines.append("Bisher: " + state["summary"].replace("\n", " ")[:1200])
        if state.get("topic"):
            state_lines.append(f"Thema: {state['topic']}")
        if state.get("pending_question"):
            state_lines.append(
                f"Du hattest gefragt: {state['pending_question']} -- die Nachricht "
                "ist womoeglich die Antwort darauf."
            )
        open_requests = services.permissions.open_requests(chat_id)
        if open_requests:
            state_lines.append(
                "Offene Rueckfrage: " + open_requests[0].summary
                + " (wartet auf Bestaetigung)"
            )
        open_tasks = services.tasks.list(limit=5)
        if open_tasks:
            state_lines.append(
                "Offene Aufgaben: "
                + "; ".join(f"#{t.id} {t.title}" for t in open_tasks)
            )
        due_reminders = [
            r for r in services.reminders.upcoming(limit=5) if r.status == "geplant"
        ]
        if due_reminders:
            state_lines.append(
                "Naechste Erinnerungen: "
                + "; ".join(
                    f"#{r.id} {r.text} ({format_local(r.due_at, self.settings.tz)})"
                    for r in due_reminders[:3]
                )
            )

        system = build_system_prompt(
            tz=self.settings.tz,
            owner=services.store.get("besitzer_name", "dir") or "dir",
            tool_lines=services.toolkit.descriptions(),
            memory_lines=[entry.line() for entry in services.memory.important_memory(10)],
            state_lines=state_lines, channel=channel,
            native_tools=services.models.active.supports_native_tools,
        )

        messages = [ChatMessage(role="system", content=system)]
        history = services.memory.recent_messages(chat_id, limit=self.settings.ai_context_messages)
        # Die gerade gespeicherte Nachricht steht schon im Verlauf -- nicht doppeln.
        if history and history[-1]["role"] == "user" and history[-1]["content"] == text:
            history = history[:-1]
        for entry in history:
            role = entry["role"]
            if role not in {"user", "assistant"}:
                continue
            if not entry["content"]:
                continue
            messages.append(ChatMessage(role=role, content=entry["content"]))
        messages.append(ChatMessage(role="user", content=text))
        return messages

    def _finish(
        self, chat_id: str, text: str, buttons: list[tuple[str, str]], token: str,
        tools: list[str], channel: str, *, degraded: bool = False,
    ) -> AgentReply:
        services = self.services
        services.memory.add_message(chat_id, "assistant", text, channel=channel)
        if token:
            services.memory.set_state(chat_id, pending_question=text[:400])
        else:
            services.memory.clear_pending(chat_id)

        count = services.memory.get_state(chat_id).get("message_count", 0)
        if count and count % SUMMARIZE_EVERY == 0:
            self._schedule_summary(chat_id)
        return AgentReply(
            text=text, buttons=buttons, confirmation_token=token,
            tool_names=tools, degraded=degraded,
        )

    def _schedule_summary(self, chat_id: str) -> None:
        task = asyncio.create_task(self._summarize(chat_id))
        self._summary_tasks.add(task)
        task.add_done_callback(self._summary_tasks.discard)

    async def _summarize(self, chat_id: str) -> None:
        """Verdichtet den Verlauf, damit der Kontext nicht mitwaechst."""
        services = self.services
        history = services.memory.recent_messages(chat_id, limit=40)
        if len(history) < 8:
            return
        transcript = "\n".join(
            f"{'Ich' if m['role'] == 'user' else 'Jarvis'}: {m['content'][:500]}"
            for m in history if m["role"] in {"user", "assistant"}
        )
        previous = services.memory.get_state(chat_id).get("summary", "")
        try:
            reply = await services.models.chat([
                ChatMessage(role="system", content=SUMMARY_PROMPT),
                ChatMessage(role="user", content=(
                    (f"Bisherige Zusammenfassung:\n{previous}\n\n" if previous else "")
                    + f"Neuer Verlauf:\n{transcript}"
                )),
            ], temperature=0.2, max_tokens=500)
        except JarvisError as exc:
            log.debug("Zusammenfassung nicht moeglich: %s", exc)
            return
        summary = reply.text.strip()
        if summary:
            services.memory.set_state(chat_id, summary=summary[:3000])
            log.info("Gespraechszusammenfassung aktualisiert (%s Zeichen)", len(summary))
