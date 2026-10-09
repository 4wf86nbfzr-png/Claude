"""Werkzeuge: Aufgaben, Erinnerungen, Gedaechtnis, Status.

Alle Werkzeuge liefern ``ToolResult``. Was eine Bestaetigung braucht, legt
sie ueber ``services.permissions.request`` an und gibt das Token zurueck --
ausgefuehrt wird erst nach dem Tastendruck, siehe ``confirmed``.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from ..db.database import iso, utcnow
from .tasks import OPEN_STATES, STATUS_CANCELLED, STATUS_DONE, STATUS_RUNNING, priority_label
from .timeutil import (
    describe_recurrence, format_local, is_vague_time, parse_recurrence, parse_when,
)
from .toolkit import ToolResult, bool_field, int_field, schema, text_field

if TYPE_CHECKING:
    from .services import Services

log = logging.getLogger(__name__)

#: Aktion -> Funktion, die nach der Bestaetigung laeuft.
CONFIRMED_ACTIONS: dict[str, Any] = {}


def confirmed(action: str):
    """Dekorator: registriert die Ausfuehrung einer bestaetigungspflichtigen Aktion."""
    def decorator(function):
        CONFIRMED_ACTIONS[action] = function
        return function
    return decorator


def register_all(services: "Services") -> None:
    register_tasks(services)
    register_reminders(services)
    register_memory(services)
    register_status(services)

    from . import tools_calendar, tools_email, tools_phone, tools_research
    tools_calendar.register(services)
    tools_email.register(services)
    tools_phone.register(services)
    tools_research.register(services)

    services.confirmed_actions = CONFIRMED_ACTIONS


# ---------------------------------------------------------------- Aufgaben
def register_tasks(services: "Services") -> None:
    tz = services.settings.tz
    tasks = services.tasks

    async def aufgabe_anlegen(
        titel: str, notizen: str = "", prioritaet: str = "", faellig: str = "",
        projekt: str = "", haengt_an: int | None = None,
    ) -> ToolResult:
        when = parse_when(faellig, tz) if faellig else None
        if faellig and when is None:
            return ToolResult.failure(
                f"Die Zeitangabe '{faellig}' verstehe ich nicht. "
                "Bitte so etwas wie 'morgen 14:00' oder '2026-11-05'."
            )
        task = tasks.create(
            titel, notes=notizen, priority=prioritaet or 3, due_at=when,
            project=projekt, depends_on=haengt_an,
        )
        services.memory.remember_event("aufgabe_angelegt", task.title, {"id": task.id})
        return ToolResult.success(
            f"Aufgabe #{task.id} angelegt: {task.title}"
            + (f" (faellig {format_local(task.due_at, tz)})" if task.due_at else ""),
            id=task.id, titel=task.title,
            faellig=format_local(task.due_at, tz) if task.due_at else "",
            prioritaet=priority_label(task.priority),
        )

    services.toolkit.register(
        "aufgabe_anlegen",
        "Legt eine Aufgabe an. Fuer alles, was erledigt werden soll.",
        schema(
            titel=text_field("Worum geht es (kurz, als Handlung formuliert)", pflicht=True),
            notizen=text_field("Zusaetzliche Einzelheiten"),
            prioritaet=text_field("hoch, normal oder niedrig", enum=["hoch", "normal", "niedrig"]),
            faellig=text_field("Wann faellig, z. B. 'morgen 14:00' oder '2026-11-05T09:00'"),
            projekt=text_field("Projekt oder Bereich, falls zutreffend"),
            haengt_an=int_field("Nummer der Aufgabe, die vorher fertig sein muss"),
        ),
        aufgabe_anlegen, category="aufgaben",
    )

    async def aufgaben_liste(
        status: str = "offen", limit: int = 15, projekt: str = "", suche: str = "",
    ) -> ToolResult:
        mapping = {
            "offen": OPEN_STATES, "alle": None, "erledigt": (STATUS_DONE,),
            "laeuft": (STATUS_RUNNING,), "abgebrochen": (STATUS_CANCELLED,),
        }
        found = tasks.list(
            status=mapping.get(status, OPEN_STATES), limit=max(1, min(50, limit)),
            project=projekt or None, search=suche or None,
        )
        if not found:
            return ToolResult.success("Keine passenden Aufgaben.", anzahl=0, aufgaben=[])
        lines = [task.line(tz) for task in found]
        return ToolResult.success(
            "\n".join(lines), anzahl=len(found),
            aufgaben=[{"id": t.id, "titel": t.title, "status": t.status,
                       "prioritaet": priority_label(t.priority),
                       "faellig": format_local(t.due_at, tz) if t.due_at else ""}
                      for t in found],
        )

    services.toolkit.register(
        "aufgaben_liste",
        "Zeigt Aufgaben. Standard sind die offenen.",
        schema(
            status=text_field("offen, laeuft, erledigt, abgebrochen oder alle",
                              enum=["offen", "laeuft", "erledigt", "abgebrochen", "alle"]),
            limit=int_field("Wie viele hoechstens (Standard 15)"),
            projekt=text_field("Nur dieses Projekt"),
            suche=text_field("Nur Aufgaben, die dieses Wort enthalten"),
        ),
        aufgaben_liste, category="aufgaben",
    )

    async def aufgabe_aendern(
        aufgabe: str, titel: str = "", notizen: str = "", prioritaet: str = "",
        faellig: str = "", status: str = "", ergebnis: str = "",
    ) -> ToolResult:
        found = tasks.find(aufgabe)
        if not found:
            return ToolResult.failure(f"Keine Aufgabe zu '{aufgabe}' gefunden.")
        if len(found) > 1:
            return ToolResult.failure(
                "Das passt auf mehrere Aufgaben. Welche meinst du?\n"
                + "\n".join(t.line(tz) for t in found[:5]),
                mehrdeutig=[t.id for t in found[:5]],
            )
        task = found[0]
        when = parse_when(faellig, tz) if faellig else None
        if faellig and when is None:
            return ToolResult.failure(f"Die Zeitangabe '{faellig}' verstehe ich nicht.")
        status_map = {
            "offen": "offen", "laeuft": STATUS_RUNNING, "in arbeit": STATUS_RUNNING,
            "erledigt": STATUS_DONE, "fertig": STATUS_DONE, "abgebrochen": STATUS_CANCELLED,
        }
        updated = tasks.update(
            task.id, title=titel or None, notes=notizen or None,
            priority=prioritaet or None, due_at=when,
            status=status_map.get(status.lower()) if status else None,
            result=ergebnis or None,
        )
        assert updated is not None
        services.memory.remember_event("aufgabe_geaendert", updated.title, {"id": updated.id})
        return ToolResult.success(f"Geaendert: {updated.line(tz)}", id=updated.id)

    services.toolkit.register(
        "aufgabe_aendern",
        "Aendert eine Aufgabe: Titel, Prioritaet, Faelligkeit, Status oder Notizen.",
        schema(
            aufgabe=text_field("Nummer (z. B. '#4') oder Stichwort der Aufgabe", pflicht=True),
            titel=text_field("Neuer Titel"),
            notizen=text_field("Neue Notizen"),
            prioritaet=text_field("hoch, normal oder niedrig"),
            faellig=text_field("Neue Faelligkeit"),
            status=text_field("offen, laeuft, erledigt oder abgebrochen"),
            ergebnis=text_field("Was dabei herausgekommen ist"),
        ),
        aufgabe_aendern, category="aufgaben",
    )

    async def aufgabe_abschliessen(aufgabe: str, ergebnis: str = "") -> ToolResult:
        found = tasks.find(aufgabe)
        if not found:
            return ToolResult.failure(f"Keine Aufgabe zu '{aufgabe}' gefunden.")
        if len(found) > 1:
            return ToolResult.failure(
                "Mehrere Aufgaben passen. Welche?\n" + "\n".join(t.line(tz) for t in found[:5])
            )
        task = tasks.complete(found[0].id, ergebnis)
        assert task is not None
        services.memory.remember_event("aufgabe_erledigt", task.title, {"id": task.id})
        follow_ups = tasks.list(status=OPEN_STATES, limit=5)
        freed = [t for t in follow_ups if t.depends_on == task.id]
        text = f"Aufgabe #{task.id} ist erledigt: {task.title}"
        if freed:
            text += "\nDamit ist jetzt moeglich: " + ", ".join(f"#{t.id} {t.title}" for t in freed)
        return ToolResult.success(text, id=task.id)

    services.toolkit.register(
        "aufgabe_abschliessen", "Setzt eine Aufgabe auf erledigt.",
        schema(
            aufgabe=text_field("Nummer oder Stichwort", pflicht=True),
            ergebnis=text_field("Was dabei herausgekommen ist"),
        ),
        aufgabe_abschliessen, category="aufgaben",
    )

    async def aufgaben_planen(schritte: list[str] | str, projekt: str = "", faellig: str = "") -> ToolResult:
        """Zerlegt einen groesseren Auftrag in einzelne Aufgaben."""
        if isinstance(schritte, str):
            parts = [s.strip(" -•\t") for s in schritte.replace(";", "\n").split("\n")]
        else:
            parts = [str(s).strip() for s in schritte]
        parts = [p for p in parts if p]
        if not parts:
            return ToolResult.failure("Es waren keine Schritte dabei.")
        when = parse_when(faellig, tz) if faellig else None
        created = []
        previous: int | None = None
        for index, step in enumerate(parts[:12]):
            task = tasks.create(
                step, project=projekt, due_at=when if index == len(parts) - 1 else None,
                priority=2 if index == 0 else 3, depends_on=previous,
            )
            created.append(task)
            previous = task.id
        services.memory.remember_event(
            "plan_angelegt", projekt or parts[0], {"anzahl": len(created)}
        )
        return ToolResult.success(
            f"{len(created)} Schritte angelegt:\n" + "\n".join(t.line(tz) for t in created),
            ids=[t.id for t in created],
        )

    services.toolkit.register(
        "aufgaben_planen",
        "Zerlegt einen groesseren Auftrag in einzelne, aufeinander aufbauende Aufgaben.",
        {
            "type": "object",
            "properties": {
                "schritte": {
                    "type": "array", "items": {"type": "string"},
                    "description": "Die einzelnen Schritte in der richtigen Reihenfolge",
                },
                "projekt": {"type": "string", "description": "Name des Vorhabens"},
                "faellig": {"type": "string", "description": "Wann alles fertig sein soll"},
            },
            "required": ["schritte"],
        },
        aufgaben_planen, category="aufgaben",
    )

    @confirmed("aufgabe_loeschen")
    async def _execute_delete_task(services: "Services", payload: dict[str, Any]) -> ToolResult:
        task_id = int(payload.get("id", 0))
        task = services.tasks.get(task_id)
        if task is None:
            return ToolResult.failure("Die Aufgabe gibt es nicht mehr.")
        services.tasks.delete(task_id)
        services.memory.remember_event("aufgabe_geloescht", task.title, {"id": task_id})
        return ToolResult.success(f"Aufgabe #{task_id} ({task.title}) ist geloescht.")

    async def aufgabe_loeschen(aufgabe: str, chat_id: str = "") -> ToolResult:
        found = tasks.find(aufgabe)
        if not found:
            return ToolResult.failure(f"Keine Aufgabe zu '{aufgabe}' gefunden.")
        task = found[0]
        request = services.permissions.request(
            "aufgabe_loeschen", {"id": task.id},
            summary=f"Aufgabe #{task.id} „{task.title}“ endgueltig loeschen",
            chat_id=chat_id,
        )
        return ToolResult(
            ok=True,
            text=f"Soll ich Aufgabe #{task.id} ({task.title}) wirklich loeschen? "
                 "Das kann ich nicht zuruecknehmen.",
            confirmation_token=request.token,
            buttons=[("Ja, loeschen", f"bestaetigen:{request.token}"),
                     ("Abbrechen", f"ablehnen:{request.token}")],
        )

    services.toolkit.register(
        "aufgabe_loeschen",
        "Loescht eine Aufgabe endgueltig. Fragt vorher nach. "
        "Normalerweise ist 'aufgabe_abschliessen' das Richtige.",
        schema(aufgabe=text_field("Nummer oder Stichwort", pflicht=True)),
        aufgabe_loeschen, action="aufgabe_loeschen", category="aufgaben",
    )


# ------------------------------------------------------------ Erinnerungen
def register_reminders(services: "Services") -> None:
    tz = services.settings.tz
    reminders = services.reminders

    async def erinnerung_anlegen(
        text: str, wann: str, wiederholung: str = "", kanal: str = "telegram",
        aufgabe: int | None = None, anruf_bei_ausbleiben: bool = False, chat_id: str = "",
    ) -> ToolResult:
        when = parse_when(wann, tz)
        if when is None:
            return ToolResult.failure(
                f"Die Zeitangabe '{wann}' verstehe ich nicht. Bitte eine Uhrzeit nennen, "
                "z. B. 'morgen 8:30' oder 'in 20 Minuten'."
            )
        if when <= utcnow() - timedelta(minutes=1):
            return ToolResult.failure(
                f"{format_local(when, tz)} liegt in der Vergangenheit. Wann genau denn?"
            )
        if is_vague_time(wann) and not wiederholung:
            # Ungefaehre Angabe: Jarvis legt an, nennt aber die gewaehlte Uhrzeit,
            # damit man sie korrigieren kann. Besser als eine Rueckfrage zu erzwingen.
            hint = f" Ich habe {format_local(when, tz)} eingetragen -- sag Bescheid, wenn es anders passt."
        else:
            hint = ""

        recurrence = parse_recurrence(wiederholung)
        kanal = kanal if kanal in {"telegram", "telefon", "beides"} else "telegram"
        if kanal in {"telefon", "beides"} and not services.phone_active:
            return ToolResult.failure(
                "Telefonische Erinnerungen gehen nicht: Telefonie ist nicht aktiv. "
                "Soll ich sie als Telegram-Erinnerung anlegen?"
            )
        reminder = reminders.create(
            text, when, recurrence=recurrence, channel=kanal,
            task_id=aufgabe, chat_id=chat_id or services.owner_chat_id,
            escalate_phone=bool(anruf_bei_ausbleiben) and services.phone_active,
            max_attempts=services.settings.phone_max_attempts if anruf_bei_ausbleiben else 1,
        )
        services.memory.remember_event(
            "erinnerung_angelegt", reminder.text,
            {"id": reminder.id, "faellig": iso(when), "kanal": kanal},
        )
        extra = f", {describe_recurrence(recurrence)}" if recurrence else ""
        kanal_text = {"telegram": "", "telefon": " per Anruf", "beides": " per Telegram und Anruf"}[kanal]
        return ToolResult.success(
            f"Erinnerung #{reminder.id} steht: {format_local(when, tz)}{extra}{kanal_text}.{hint}",
            id=reminder.id, faellig=format_local(when, tz), wiederholung=recurrence,
        )

    services.toolkit.register(
        "erinnerung_anlegen",
        "Legt eine Erinnerung an, einmalig oder wiederkehrend, per Telegram oder Anruf.",
        schema(
            text=text_field("Woran erinnert werden soll", pflicht=True),
            wann=text_field("Zeitpunkt, z. B. 'morgen 8:30', 'in 10 Minuten', "
                            "'2026-11-05T09:00'", pflicht=True),
            wiederholung=text_field("taeglich, wochentags, 'jeden Montag', 'monatlich am 5'"),
            kanal=text_field("telegram, telefon oder beides",
                             enum=["telegram", "telefon", "beides"]),
            aufgabe=int_field("Nummer der zugehoerigen Aufgabe"),
            anruf_bei_ausbleiben=bool_field(
                "Anrufen, wenn die Erinnerung nicht bestaetigt wird"),
        ),
        erinnerung_anlegen, category="erinnerungen",
    )

    async def erinnerungen_liste(limit: int = 15, auch_erledigte: bool = False) -> ToolResult:
        found = reminders.upcoming(limit=max(1, min(50, limit)), include_done=auch_erledigte)
        if not found:
            return ToolResult.success("Keine Erinnerungen vorgemerkt.", anzahl=0)
        return ToolResult.success(
            "\n".join(r.line(tz) for r in found), anzahl=len(found),
            erinnerungen=[{"id": r.id, "text": r.text, "faellig": format_local(r.due_at, tz),
                           "status": r.status, "wiederholung": r.recurrence} for r in found],
        )

    services.toolkit.register(
        "erinnerungen_liste", "Zeigt die anstehenden Erinnerungen.",
        schema(limit=int_field("Wie viele hoechstens"),
               auch_erledigte=bool_field("Auch bestaetigte und abgebrochene zeigen")),
        erinnerungen_liste, category="erinnerungen",
    )

    async def erinnerung_verschieben(erinnerung: str, neu: str) -> ToolResult:
        found = reminders.find(erinnerung)
        if not found:
            return ToolResult.failure(f"Keine Erinnerung zu '{erinnerung}' gefunden.")
        if len(found) > 1:
            return ToolResult.failure(
                "Mehrere passen. Welche?\n" + "\n".join(r.line(tz) for r in found[:5])
            )
        when = parse_when(neu, tz)
        if when is None:
            return ToolResult.failure(f"Die Zeitangabe '{neu}' verstehe ich nicht.")
        updated = reminders.snooze(found[0].id, when)
        assert updated is not None
        services.memory.remember_event(
            "erinnerung_verschoben", updated.text, {"id": updated.id, "neu": iso(when)}
        )
        return ToolResult.success(
            f"Erinnerung #{updated.id} liegt jetzt auf {format_local(when, tz)}.", id=updated.id
        )

    services.toolkit.register(
        "erinnerung_verschieben", "Verschiebt eine Erinnerung auf einen neuen Zeitpunkt.",
        schema(erinnerung=text_field("Nummer oder Stichwort", pflicht=True),
               neu=text_field("Neuer Zeitpunkt", pflicht=True)),
        erinnerung_verschieben, category="erinnerungen",
    )

    async def erinnerung_abbrechen(erinnerung: str) -> ToolResult:
        found = reminders.find(erinnerung)
        if not found:
            return ToolResult.failure(f"Keine Erinnerung zu '{erinnerung}' gefunden.")
        updated = reminders.cancel(found[0].id)
        assert updated is not None
        services.memory.remember_event("erinnerung_abgebrochen", updated.text, {"id": updated.id})
        return ToolResult.success(f"Erinnerung #{updated.id} ist abgesagt.", id=updated.id)

    services.toolkit.register(
        "erinnerung_abbrechen", "Sagt eine Erinnerung ab.",
        schema(erinnerung=text_field("Nummer oder Stichwort", pflicht=True)),
        erinnerung_abbrechen, category="erinnerungen",
    )

    async def erinnerung_bestaetigen(erinnerung: str) -> ToolResult:
        found = reminders.find(erinnerung)
        if not found:
            return ToolResult.failure(f"Keine Erinnerung zu '{erinnerung}' gefunden.")
        updated = reminders.confirm(found[0].id)
        assert updated is not None
        return ToolResult.success(f"Notiert, Erinnerung #{updated.id} ist erledigt.", id=updated.id)

    services.toolkit.register(
        "erinnerung_bestaetigen", "Bestaetigt eine ausgeloeste Erinnerung als erledigt.",
        schema(erinnerung=text_field("Nummer oder Stichwort", pflicht=True)),
        erinnerung_bestaetigen, category="erinnerungen",
    )


# -------------------------------------------------------------- Gedaechtnis
def register_memory(services: "Services") -> None:
    memory = services.memory

    async def gedaechtnis_merken(
        schluessel: str, wert: str, art: str = "fakt", wichtigkeit: int = 3,
    ) -> ToolResult:
        try:
            entry = memory.remember(
                schluessel, wert, kind=art or "fakt", importance=wichtigkeit or 3
            )
        except ValueError as exc:
            return ToolResult.failure(str(exc))
        return ToolResult.success(f"Gemerkt: {entry.key} = {entry.value}", id=entry.id)

    services.toolkit.register(
        "gedaechtnis_merken",
        "Merkt sich eine Information dauerhaft (Vorliebe, Ablauf, Fakt, Projekt). "
        "Gleicher Schluessel ueberschreibt den alten Wert.",
        schema(
            schluessel=text_field("Kurzer, eindeutiger Name, z. B. 'Lieblingscafe'", pflicht=True),
            wert=text_field("Die Information selbst", pflicht=True),
            art=text_field("fakt, vorliebe, ablauf oder projekt",
                           enum=["fakt", "vorliebe", "ablauf", "projekt"]),
            wichtigkeit=int_field("1 (nebensaechlich) bis 5 (immer mitdenken)"),
        ),
        gedaechtnis_merken, category="gedaechtnis",
    )

    async def gedaechtnis_suchen(frage: str, limit: int = 6) -> ToolResult:
        hits = memory.search_memory(frage, limit=max(1, min(20, limit)))
        if not hits:
            return ToolResult.success(
                f"Zu '{frage}' habe ich nichts gespeichert.", anzahl=0, treffer=[]
            )
        return ToolResult.success(
            "\n".join(hit.line() for hit in hits), anzahl=len(hits),
            treffer=[{"id": h.id, "schluessel": h.key, "wert": h.value} for h in hits],
        )

    services.toolkit.register(
        "gedaechtnis_suchen",
        "Sucht im Langzeitgedaechtnis. Immer benutzen, statt zu raten.",
        schema(frage=text_field("Wonach gesucht wird", pflicht=True),
               limit=int_field("Wie viele Treffer hoechstens")),
        gedaechtnis_suchen, category="gedaechtnis",
    )

    async def gedaechtnis_liste(art: str = "", limit: int = 30) -> ToolResult:
        entries = memory.list_memory(kind=art or None, limit=max(1, min(100, limit)))
        if not entries:
            return ToolResult.success("Das Gedaechtnis ist leer.", anzahl=0)
        return ToolResult.success(
            "\n".join(entry.line() for entry in entries), anzahl=len(entries)
        )

    services.toolkit.register(
        "gedaechtnis_liste", "Listet gespeicherte Informationen auf.",
        schema(art=text_field("Nur diese Art", enum=["fakt", "vorliebe", "ablauf", "projekt"]),
               limit=int_field("Wie viele hoechstens")),
        gedaechtnis_liste, category="gedaechtnis",
    )

    async def gedaechtnis_loeschen(schluessel: str = "", id: int | None = None) -> ToolResult:
        if not schluessel and id is None:
            return ToolResult.failure("Bitte Schluessel oder Nummer angeben.")
        removed = memory.forget(memory_id=id, key=schluessel or None)
        if not removed:
            return ToolResult.failure("Dazu war nichts gespeichert.")
        return ToolResult.success("Geloescht.")

    services.toolkit.register(
        "gedaechtnis_loeschen", "Loescht einen Eintrag aus dem Langzeitgedaechtnis.",
        schema(schluessel=text_field("Name des Eintrags"), id=int_field("Nummer des Eintrags")),
        gedaechtnis_loeschen, category="gedaechtnis",
    )

    async def gedaechtnis_korrigieren(schluessel: str, neuer_wert: str) -> ToolResult:
        existing = memory.get_memory_by_key(schluessel)
        if existing is None:
            return ToolResult.failure(
                f"'{schluessel}' ist nicht gespeichert. Soll ich es neu anlegen?"
            )
        entry = memory.remember(
            schluessel, neuer_wert, kind=existing.kind, importance=existing.importance
        )
        return ToolResult.success(
            f"Korrigiert: {entry.key}\nvorher: {existing.value}\njetzt: {entry.value}", id=entry.id
        )

    services.toolkit.register(
        "gedaechtnis_korrigieren", "Berichtigt einen gespeicherten Eintrag.",
        schema(schluessel=text_field("Name des Eintrags", pflicht=True),
               neuer_wert=text_field("Der richtige Wert", pflicht=True)),
        gedaechtnis_korrigieren, category="gedaechtnis",
    )


# ------------------------------------------------------------------ Status
def register_status(services: "Services") -> None:
    tz = services.settings.tz

    async def tagesueberblick(tag: str = "") -> ToolResult:
        when = parse_when(tag, tz, default_time=None) if tag else utcnow()
        overview = await services.daily_overview(when)
        return ToolResult.success(overview)

    services.toolkit.register(
        "tagesueberblick",
        "Ueberblick: Termine, Aufgaben und Erinnerungen eines Tages. "
        "Fuer Fragen wie 'Was steht heute noch an?'.",
        schema(tag=text_field("Welcher Tag (Standard heute), z. B. 'morgen'")),
        tagesueberblick, category="status",
    )

    async def systemstatus() -> ToolResult:
        states = await services.health()
        lines = [f"{state.symbol} {state.name}: {state.detail}" for state in states]
        snapshot = services.status_snapshot()
        return ToolResult.success("\n".join(lines), **snapshot)

    services.toolkit.register(
        "systemstatus",
        "Prueft, was laeuft: KI-Modell, Hintergrunddienst, Kalender, E-Mail, Telefonie.",
        schema(), systemstatus, category="status",
    )

    async def statusbericht(zeitraum: str = "heute") -> ToolResult:
        """Was wurde erledigt, was ist offen, was ist schiefgegangen."""
        since = parse_when(zeitraum, tz) or (utcnow() - timedelta(days=1))
        if since > utcnow():
            since = utcnow() - timedelta(days=1)
        done = services.db.query(
            "SELECT id, title, completed_at FROM task WHERE status = 'erledigt' "
            "AND completed_at >= ? ORDER BY completed_at DESC LIMIT 20",
            (iso(since),),
        )
        events = services.memory.recent_events(limit=40)
        failures = [e for e in events if not e["ok"]]
        open_tasks = services.tasks.list(limit=10)
        lines = [f"*Bericht seit {format_local(since, tz)}*", ""]
        lines.append(f"Erledigt: {len(done)}")
        lines += [f"✓ #{row['id']} {row['title']}" for row in done[:8]]
        lines.append(f"\nOffen: {len(open_tasks)}")
        lines += [task.line(tz) for task in open_tasks[:8]]
        if failures:
            lines.append(f"\nFehlgeschlagen: {len(failures)}")
            lines += [f"✗ {f['kind']}: {f['subject']}" for f in failures[:5]]
        failed_jobs = services.queue.failed(limit=5)
        if failed_jobs:
            lines.append("\nAuftraege mit Fehler:")
            lines += [f"✗ {job.kind}: {job.last_error[:120]}" for job in failed_jobs]
        return ToolResult.success("\n".join(lines), erledigt=len(done), offen=len(open_tasks))

    services.toolkit.register(
        "statusbericht",
        "Bericht: was erledigt wurde, was offen ist, was fehlgeschlagen ist.",
        schema(zeitraum=text_field("Ab wann, z. B. 'heute', 'in 7 tagen' rueckwaerts gedacht")),
        statusbericht, category="status",
    )
