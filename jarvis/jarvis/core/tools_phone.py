"""Telefonie-Werkzeuge.

Ein Anruf kostet Geld und klingelt beim Nutzer -- deshalb Stufe 2. Fuer
geplante Erinnerungsanrufe reicht dagegen die normale Erinnerung mit
``kanal='telefon'``: der Nutzer hat den Zeitpunkt ja selbst genannt.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from ..db.database import iso
from ..errors import JarvisError
from .timeutil import format_local, parse_recurrence, parse_when
from .toolkit import ToolResult, bool_field, schema, text_field
from .tools_builtin import confirmed

if TYPE_CHECKING:
    from .services import Services

log = logging.getLogger(__name__)


def register(services: "Services") -> None:
    tz = services.settings.tz

    def unavailable() -> ToolResult:
        return ToolResult.failure(
            "Telefonie ist nicht aktiv. "
            + (services.phone_error or "Mit /telefonie an einschalten.")
        )

    async def anruf_planen(
        text: str, wann: str, wiederholung: str = "", chat_id: str = "",
    ) -> ToolResult:
        """Erinnerungsanruf zu einem Zeitpunkt -- laeuft ueber die Erinnerung."""
        if not services.phone_active:
            return unavailable()
        when = parse_when(wann, tz)
        if when is None:
            return ToolResult.failure(
                f"Die Zeitangabe '{wann}' verstehe ich nicht. Bitte eine Uhrzeit nennen."
            )
        reminder = services.reminders.create(
            text, when, recurrence=parse_recurrence(wiederholung), channel="telefon",
            chat_id=chat_id or services.owner_chat_id,
            max_attempts=services.settings.phone_max_attempts,
        )
        services.memory.remember_event(
            "anruf_geplant", text, {"erinnerung": reminder.id, "faellig": iso(when)}
        )
        return ToolResult.success(
            f"Ich rufe dich {format_local(when, tz)} an"
            + (f" ({wiederholung})" if wiederholung else "")
            + f" und sage: „{text}“. (Erinnerung #{reminder.id})",
            id=reminder.id,
        )

    services.toolkit.register(
        "anruf_planen",
        "Plant einen Erinnerungsanruf ('Ruf mich morgen um 8:30 an und erinnere mich an X').",
        schema(text=text_field("Was am Telefon gesagt werden soll", pflicht=True),
               wann=text_field("Wann angerufen wird", pflicht=True),
               wiederholung=text_field("z. B. 'jeden Montag'")),
        anruf_planen, category="telefonie",
    )

    async def anruf_jetzt(text: str = "", gespraech: bool = False, chat_id: str = "") -> ToolResult:
        """Sofortiger Anruf -- braucht eine Bestaetigung."""
        if not services.phone_active:
            return unavailable()
        if gespraech and not services.settings.public_base_url:
            return ToolResult.failure(
                "Ein Gespraech braucht eine oeffentlich erreichbare Rueckadresse "
                "(PUBLIC_BASE_URL). Ansagen gehen aber."
            )
        request = services.permissions.request(
            "anruf_starten", {"text": text, "gespraech": bool(gespraech)},
            summary=("Gespraech mit Jarvis anrufen" if gespraech
                     else f"Anruf mit der Ansage '{text[:80]}'"),
            chat_id=chat_id,
        )
        return ToolResult(
            ok=True,
            text=("Ich rufe dich jetzt an, damit wir sprechen koennen. In Ordnung?"
                  if gespraech else f"Ich rufe dich jetzt an und sage: „{text}“. In Ordnung?"),
            confirmation_token=request.token,
            buttons=[("Ja, anrufen", f"bestaetigen:{request.token}"),
                     ("Abbrechen", f"ablehnen:{request.token}")],
        )

    services.toolkit.register(
        "anruf_jetzt",
        "Ruft sofort an -- mit Ansage oder als Gespraech. Fragt vorher nach.",
        schema(text=text_field("Die Ansage (bei einem Gespraech der Einstiegssatz)"),
               gespraech=bool_field("true fuer ein echtes Gespraech statt einer Ansage")),
        anruf_jetzt, action="anruf_starten", category="telefonie",
    )

    @confirmed("anruf_starten")
    async def _execute_call(services: "Services", payload: dict[str, Any]) -> ToolResult:
        if not services.phone_active:
            return ToolResult.failure("Telefonie ist inzwischen abgeschaltet.")
        text = str(payload.get("text") or "Du wolltest mit mir sprechen.")
        try:
            if payload.get("gespraech"):
                result = await services.phone.call_conversation(text)
            else:
                result = await services.phone.call_reminder(text)
        except JarvisError as exc:
            services.memory.remember_event("anruf_fehler", text[:120], {"fehler": exc.message},
                                           ok=False)
            return ToolResult.failure(f"Der Anruf kam nicht zustande: {exc.message}")
        services.memory.remember_event(
            "anruf_gestartet", text[:120], {"sid": result.sid, "nummer": result.to_number}
        )
        return ToolResult.success(
            f"Es klingelt ({result.status}). Nummer {result.to_number}.", sid=result.sid
        )

    async def telefonie_schalten(an: bool) -> ToolResult:
        if services.phone is None and an:
            return ToolResult.failure(
                "Telefonie ist nicht konfiguriert. " + (services.phone_error or "")
            )
        services.store.set("telefonie", "true" if an else "false")
        return ToolResult.success(
            "Telefonie ist eingeschaltet." if an
            else "Telefonie ist aus. Es gehen keine Anrufe mehr raus."
        )

    services.toolkit.register(
        "telefonie_schalten", "Schaltet Telefonie ganz ein oder aus.",
        schema(an=bool_field("true = ein, false = aus")), telefonie_schalten,
        category="telefonie",
    )

    async def anrufe_liste() -> ToolResult:
        if services.phone is None:
            return unavailable()
        calls = services.phone.recent_calls(limit=10)
        if not calls:
            return ToolResult.success("Noch keine Anrufe.", anzahl=0)
        lines = [
            f"• {call['created_at'][:16].replace('T', ' ')} {call['to_number']} "
            f"— {call['purpose']} ({call['status']})"
            + (f" Fehler: {call['error'][:60]}" if call["error"] else "")
            for call in calls
        ]
        return ToolResult.success("\n".join(lines), anzahl=len(calls))

    services.toolkit.register(
        "anrufe_liste", "Zeigt die letzten Anrufe mit Ergebnis.",
        schema(), anrufe_liste, category="telefonie",
    )
