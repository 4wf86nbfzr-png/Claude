"""Telegram -- die Hauptbedienung.

Direkt gegen die Bot-API (``httpx`` + Long Polling), ohne zusaetzliches
Framework: das haelt die Abhaengigkeiten klein und macht das Verhalten bei
Netzfehlern nachvollziehbar.

Wichtige Punkte:

* **Zugang**: nur die IDs aus ``TELEGRAM_ALLOWED_IDS``. Alles andere wird
  abgewiesen und protokolliert. Ist die Liste leer, kommt niemand rein.
* **Versatz** (``offset``) wird in der Datenbank gehalten -- nach einem
  Neustart wird keine Nachricht doppelt verarbeitet.
* **Antworten** gehen durch ``send``: zu lange Texte werden geteilt, und
  wenn Telegram das Markdown nicht mag, wird die Nachricht ohne
  Formatierung erneut gesendet statt verloren zu gehen.
* Befehle und Knoepfe rufen dieselben Werkzeuge wie das Sprachmodell.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import httpx

from ..core.agent import AgentReply
from ..core.timeutil import format_local
from ..db.database import iso, utcnow
from ..errors import JarvisError
from ..logging_setup import redact

log = logging.getLogger(__name__)

MAX_LENGTH = 3800
API = "https://api.telegram.org"

MAIN_MENU = [
    [("📋 Übersicht", "tool:tagesueberblick"), ("✅ Aufgaben", "menu:aufgaben")],
    [("📅 Kalender", "menu:kalender"), ("⏰ Erinnerungen", "menu:erinnerungen")],
    [("📬 E-Mail", "menu:email"), ("🧠 Gedächtnis", "menu:gedaechtnis")],
    [("📞 Telefonie", "menu:telefonie"), ("⚙️ System", "menu:system")],
    [("❓ Hilfe", "menu:hilfe")],
]

SUBMENUS: dict[str, tuple[str, list[list[tuple[str, str]]]]] = {
    "aufgaben": ("*Aufgaben*\nWas soll ich tun?", [
        [("Offene zeigen", "tool:aufgaben_liste")],
        [("Erledigte zeigen", "tool:aufgaben_liste:status=erledigt")],
        [("Neue Aufgabe", "eingabe:aufgabe")],
        [("Abschließen", "eingabe:aufgabe_fertig")],
        [("‹ Zurück", "menu:haupt")],
    ]),
    "kalender": ("*Kalender*", [
        [("Heute", "tool:termine_anzeigen")],
        [("Diese Woche", "tool:termine_anzeigen:tage=7")],
        [("Freie Zeiten heute", "tool:freie_zeiten")],
        [("Termin anlegen", "eingabe:termin")],
        [("‹ Zurück", "menu:haupt")],
    ]),
    "erinnerungen": ("*Erinnerungen*", [
        [("Anstehende", "tool:erinnerungen_liste")],
        [("Neue Erinnerung", "eingabe:erinnerung")],
        [("‹ Zurück", "menu:haupt")],
    ]),
    "email": ("*E-Mail*", [
        [("Ungelesene", "tool:email_ungelesen")],
        [("Nur wichtige", "tool:email_ungelesen:nur_wichtige=true")],
        [("Offene Entwürfe", "tool:entwuerfe_liste")],
        [("‹ Zurück", "menu:haupt")],
    ]),
    "gedaechtnis": ("*Gedächtnis*", [
        [("Alles anzeigen", "tool:gedaechtnis_liste")],
        [("Etwas merken", "eingabe:merken")],
        [("Gespräch vergessen", "aktion:verlauf_loeschen")],
        [("Daten exportieren", "aktion:export")],
        [("‹ Zurück", "menu:haupt")],
    ]),
    "telefonie": ("*Telefonie*", [
        [("Letzte Anrufe", "tool:anrufe_liste")],
        [("Anruf planen", "eingabe:anruf")],
        [("Einschalten", "aktion:telefonie_an"), ("Ausschalten", "aktion:telefonie_aus")],
        [("‹ Zurück", "menu:haupt")],
    ]),
    "system": ("*System*", [
        [("KI & Dienste prüfen", "tool:systemstatus")],
        [("Statusbericht", "tool:statusbericht")],
        [("Letzte Fehler", "aktion:fehler")],
        [("Hintergrundaufträge", "aktion:auftraege")],
        [("Sicherung jetzt", "aktion:sicherung")],
        [("Stumm an/aus", "aktion:stumm")],
        [("‹ Zurück", "menu:haupt")],
    ]),
}

#: Freitext-Eingaben, die nach einem Knopfdruck erwartet werden.
INPUT_PROMPTS = {
    "aufgabe": ("Was soll ich als Aufgabe anlegen?", "aufgabe_anlegen", "titel"),
    "aufgabe_fertig": ("Welche Aufgabe ist erledigt? (Nummer oder Stichwort)",
                       "aufgabe_abschliessen", "aufgabe"),
    "erinnerung": ("Woran und wann soll ich erinnern? "
                   "Zum Beispiel: Alex anrufen morgen 9:00", "", ""),
    "termin": ("Welcher Termin? Zum Beispiel: Zahnarzt morgen 14:00 für 45 Minuten", "", ""),
    "merken": ("Was soll ich mir dauerhaft merken?", "", ""),
    "anruf": ("Wann soll ich anrufen und was sagen? "
              "Zum Beispiel: morgen 8:30 an die Wochenplanung erinnern", "", ""),
}

HELP_TEXT = """\
*Jarvis -- Kurzanleitung*

Du kannst einfach schreiben, wie du sprichst:
• „Erinnere mich morgen um 8 Uhr daran, Alex anzurufen"
• „Was steht heute noch an?"
• „Leg mir drei Aufgaben für morgen an: ..."
• „Verschiebe den Zahnarzttermin auf nächste Woche"
• „Merk dir, dass ich lieber vormittags telefoniere"

*Befehle*
/start — Menü und Einrichtungsstand
/menu — Menü öffnen
/uebersicht — Termine, Aufgaben, Erinnerungen für heute
/aufgaben — offene Aufgaben
/neu <Text> — Aufgabe anlegen
/fertig <Nr> — Aufgabe abschließen
/erinnerungen — anstehende Erinnerungen
/erinnere <Text> <Zeit> — Erinnerung anlegen
/termine [tage] — Kalender
/mail — ungelesene E-Mails
/merken <Text> — ins Gedächtnis
/weisst <Frage> — im Gedächtnis suchen
/status — Zustand aller Dienste
/stumm — Benachrichtigungen an/aus
/telefonie <an|aus> — Anrufe erlauben
/vergessen — Gesprächsverlauf löschen
/export — persönliche Daten als Datei
/abbrechen — offene Rückfrage verwerfen
/hilfe — dieser Text

*Was Bestätigung braucht*
E-Mails senden, Termine löschen oder verschieben, Aufgaben löschen und
Anrufe starten. Dafür erscheinen Knöpfe; ohne Tastendruck passiert nichts.
"""

BOT_COMMANDS = [
    ("start", "Menü und Einrichtungsstand"),
    ("menu", "Menü öffnen"),
    ("uebersicht", "Was heute ansteht"),
    ("aufgaben", "Offene Aufgaben"),
    ("neu", "Aufgabe anlegen"),
    ("fertig", "Aufgabe abschließen"),
    ("erinnerungen", "Anstehende Erinnerungen"),
    ("erinnere", "Erinnerung anlegen"),
    ("termine", "Kalender ansehen"),
    ("mail", "Ungelesene E-Mails"),
    ("merken", "Etwas ins Gedächtnis legen"),
    ("weisst", "Im Gedächtnis suchen"),
    ("status", "Zustand der Dienste"),
    ("stumm", "Benachrichtigungen an/aus"),
    ("telefonie", "Anrufe erlauben oder sperren"),
    ("vergessen", "Gesprächsverlauf löschen"),
    ("export", "Persönliche Daten exportieren"),
    ("abbrechen", "Offene Rückfrage verwerfen"),
    ("hilfe", "Kurzanleitung"),
]


@dataclass(slots=True)
class Incoming:
    chat_id: str
    user_id: int
    text: str
    message_id: int
    callback_id: str = ""
    callback_data: str = ""
    name: str = ""


class TelegramBot:
    def __init__(self, services: Any) -> None:
        self.services = services
        self.settings = services.settings
        self.token = self.settings.telegram_token
        self.allowed = set(self.settings.telegram_allowed_ids)
        self.agent = services.build_agent()
        self._client: httpx.AsyncClient | None = None
        self._stop = asyncio.Event()
        self._offset = int(services.store.get("telegram_offset", "0") or 0)
        self.me: dict[str, Any] = {}
        self._awaiting: dict[str, str] = {}      # chat_id -> erwartete Eingabeart
        self.running = False

    # ------------------------------------------------------------- Transport
    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.settings.telegram_poll_timeout + 15)
            )
        return self._client

    async def _call(self, method: str, **payload: Any) -> dict[str, Any]:
        url = f"{API}/bot{self.token}/{method}"
        try:
            response = await self._http().post(url, json=payload)
        except httpx.HTTPError as exc:
            raise JarvisError(f"Telegram nicht erreichbar: {type(exc).__name__}") from exc
        data = response.json() if response.content else {}
        if not data.get("ok"):
            description = str(data.get("description", response.text))[:300]
            if response.status_code == 401:
                raise JarvisError(
                    "Telegram lehnt den Token ab.",
                    hint="TELEGRAM_BOT_TOKEN pruefen (von @BotFather).",
                )
            raise JarvisError(f"Telegram meldet: {description}")
        return data.get("result", {})

    # -------------------------------------------------------------- Senden
    @staticmethod
    def keyboard(rows: list[list[tuple[str, str]]]) -> dict[str, Any]:
        return {"inline_keyboard": [
            [{"text": label, "callback_data": data[:64]} for label, data in row] for row in rows
        ]}

    async def send(
        self, chat_id: str, text: str, *, buttons: list[tuple[str, str]] | None = None,
        rows: list[list[tuple[str, str]]] | None = None, markdown: bool = True,
    ) -> bool:
        """Sendet eine Nachricht; teilt zu lange Texte und raeumt Markdown auf."""
        if not text.strip():
            return False
        keyboard = None
        if rows:
            keyboard = self.keyboard(rows)
        elif buttons:
            keyboard = self.keyboard([[b] for b in buttons])

        chunks = self._split(text)
        sent_any = False
        for index, chunk in enumerate(chunks):
            payload: dict[str, Any] = {
                "chat_id": chat_id, "text": chunk,
                "disable_web_page_preview": True,
            }
            if markdown:
                payload["parse_mode"] = "Markdown"
            if keyboard and index == len(chunks) - 1:
                payload["reply_markup"] = keyboard
            try:
                await self._call("sendMessage", **payload)
                sent_any = True
            except JarvisError as exc:
                if markdown and "parse" in str(exc).lower():
                    # Telegram mag das Markdown nicht -- dann eben unformatiert.
                    payload.pop("parse_mode", None)
                    try:
                        await self._call("sendMessage", **payload)
                        sent_any = True
                        continue
                    except JarvisError as inner:
                        log.error("Nachricht nicht zustellbar: %s", inner)
                else:
                    log.error("Nachricht nicht zustellbar: %s", exc)
        return sent_any

    @staticmethod
    def _split(text: str) -> list[str]:
        if len(text) <= MAX_LENGTH:
            return [text]
        chunks: list[str] = []
        remaining = text
        while len(remaining) > MAX_LENGTH:
            cut = remaining.rfind("\n", 0, MAX_LENGTH)
            if cut < MAX_LENGTH // 2:
                cut = remaining.rfind(" ", 0, MAX_LENGTH)
            if cut < MAX_LENGTH // 2:
                cut = MAX_LENGTH
            chunks.append(remaining[:cut])
            remaining = remaining[cut:].lstrip()
        if remaining:
            chunks.append(remaining)
        return chunks

    async def typing(self, chat_id: str) -> None:
        try:
            await self._call("sendChatAction", chat_id=chat_id, action="typing")
        except JarvisError:
            pass

    async def send_document(self, chat_id: str, path: Any, caption: str = "") -> bool:
        url = f"{API}/bot{self.token}/sendDocument"
        try:
            with open(path, "rb") as handle:
                response = await self._http().post(
                    url, data={"chat_id": chat_id, "caption": caption[:900]},
                    files={"document": (getattr(path, "name", "datei"), handle)},
                )
        except (OSError, httpx.HTTPError) as exc:
            log.error("Datei nicht gesendet: %s", exc)
            return False
        return bool(response.json().get("ok"))

    # ---------------------------------------------------------------- Betrieb
    async def start(self) -> None:
        # Ein Netzaussetzer beim Start darf den Bot nicht kosten; ein abgelehnter
        # Token dagegen wird nicht schoengeredet, da hilft kein Wiederholen.
        for versuch in range(1, 6):
            try:
                self.me = await self._call("getMe")
                break
            except JarvisError as exc:
                if "Token" in str(exc):
                    raise
                if versuch == 5:
                    raise
                wartezeit = min(2 ** versuch, 30)
                log.warning(
                    "Telegram beim Start nicht erreichbar (%s/5): %s -- neuer Versuch in %ss",
                    versuch, exc, wartezeit,
                )
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=wartezeit)
                    return
                except (TimeoutError, asyncio.TimeoutError):
                    continue
        log.info("Telegram-Bot @%s ist bereit", self.me.get("username", "?"))
        try:
            await self._call("setMyCommands", commands=[
                {"command": name, "description": description}
                for name, description in BOT_COMMANDS
            ])
        except JarvisError as exc:
            log.warning("Befehlsliste nicht gesetzt: %s", exc)
        self.services.notifier.set_sender(self._notify)
        self.running = True

        for chat_id in (str(i) for i in self.settings.telegram_allowed_ids[:1]):
            self.services.store.set("besitzer_chat", chat_id)
            await self._send_startup_notice(chat_id)

        await self.services.notifier.flush_pending()
        self._stop.clear()
        await self._poll_loop()

    async def stop(self) -> None:
        self._stop.set()
        self.running = False
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _notify(self, text: str, keyboard: dict[str, Any] | None = None) -> bool:
        """Zustellweg fuer proaktive Meldungen (vom Notifier gesetzt)."""
        chat_id = self.services.owner_chat_id
        if not chat_id:
            return False
        buttons = (keyboard or {}).get("buttons") if keyboard else None
        return await self.send(chat_id, text, buttons=buttons)

    async def _send_startup_notice(self, chat_id: str) -> None:
        missing = self.settings.missing_setup()
        blocking = [step for step in missing if step.blockierend]
        lines = ["*Jarvis ist gestartet.*"]
        if not missing:
            lines.append("Alles eingerichtet.")
        else:
            lines.append("Offen ist noch:")
            lines += [f"• {step.titel} — {step.was_tun}" for step in missing[:6]]
        if not blocking:
            lines.append("\nSchreib einfach los oder tippe /menu.")
        await self.send(chat_id, "\n".join(lines), rows=MAIN_MENU)

    async def _poll_loop(self) -> None:
        failures = 0
        while not self._stop.is_set():
            try:
                updates = await self._call(
                    "getUpdates", offset=self._offset,
                    timeout=self.settings.telegram_poll_timeout,
                    allowed_updates=["message", "callback_query"],
                )
                failures = 0
            except JarvisError as exc:
                failures += 1
                wait = min(2 ** min(failures, 6), 60)
                log.warning("Abruf fehlgeschlagen (%s), neuer Versuch in %ss", exc, wait)
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=wait)
                except (TimeoutError, asyncio.TimeoutError):
                    pass
                continue

            for update in updates:
                self._offset = max(self._offset, int(update.get("update_id", 0)) + 1)
                self.services.store.set("telegram_offset", str(self._offset))
                try:
                    await self._dispatch(update)
                except Exception as exc:  # pragma: no cover - Bot darf nicht sterben
                    log.exception("Nachricht konnte nicht verarbeitet werden: %s", exc)

    # ------------------------------------------------------------ Verteilung
    async def _dispatch(self, update: dict[str, Any]) -> None:
        incoming = self._parse(update)
        if incoming is None:
            return
        if incoming.user_id not in self.allowed:
            log.warning(
                "Abgewiesen: Nutzer %s (%s) aus Chat %s",
                incoming.user_id, redact(incoming.name), incoming.chat_id,
            )
            self.services.memory.remember_event(
                "zugriff_abgewiesen", f"Nutzer {incoming.user_id}",
                {"name": incoming.name, "chat": incoming.chat_id}, ok=False,
            )
            if incoming.callback_id:
                await self._answer_callback(incoming.callback_id, "Kein Zugriff.")
            else:
                await self.send(
                    incoming.chat_id,
                    "Dieser Assistent ist persoenlich und nimmt nur Nachrichten "
                    "von seinem Besitzer an.",
                    markdown=False,
                )
            return

        if incoming.callback_data:
            await self._handle_callback(incoming)
            return
        await self._handle_message(incoming)

    @staticmethod
    def _parse(update: dict[str, Any]) -> Incoming | None:
        if "callback_query" in update:
            query = update["callback_query"]
            message = query.get("message") or {}
            user = query.get("from") or {}
            return Incoming(
                chat_id=str((message.get("chat") or {}).get("id", user.get("id", ""))),
                user_id=int(user.get("id", 0)), text="",
                message_id=int(message.get("message_id", 0)),
                callback_id=str(query.get("id", "")),
                callback_data=str(query.get("data", "")),
                name=user.get("first_name", ""),
            )
        message = update.get("message") or update.get("edited_message")
        if not message:
            return None
        user = message.get("from") or {}
        text = message.get("text") or message.get("caption") or ""
        if not text and message.get("voice"):
            text = "[Sprachnachricht]"
        return Incoming(
            chat_id=str((message.get("chat") or {}).get("id", "")),
            user_id=int(user.get("id", 0)), text=text,
            message_id=int(message.get("message_id", 0)),
            name=user.get("first_name", ""),
        )

    async def _answer_callback(self, callback_id: str, text: str = "") -> None:
        try:
            await self._call("answerCallbackQuery", callback_query_id=callback_id, text=text[:190])
        except JarvisError:
            pass

    # ------------------------------------------------------------- Nachrichten
    async def _handle_message(self, incoming: Incoming) -> None:
        text = incoming.text.strip()
        if not text:
            return
        if text == "[Sprachnachricht]":
            await self.send(
                incoming.chat_id,
                "Sprachnachrichten kann ich hier noch nicht auswerten. "
                "Schreib es mir kurz, oder lass uns telefonieren (/telefonie).",
            )
            return

        if text.startswith("/"):
            await self._handle_command(incoming, text)
            return

        expected = self._awaiting.pop(incoming.chat_id, "")
        if expected:
            prompt, tool, argument = INPUT_PROMPTS.get(expected, ("", "", ""))
            if tool and argument:
                await self.typing(incoming.chat_id)
                reply = await self.agent.run_tool_directly(
                    tool, {argument: text}, chat_id=incoming.chat_id
                )
                await self._deliver(incoming.chat_id, reply)
                return
            # Ohne festes Werkzeug uebernimmt der Agent -- er erkennt die Absicht.

        await self.typing(incoming.chat_id)
        reply = await self.agent.handle(incoming.chat_id, text)
        await self._deliver(incoming.chat_id, reply)

    async def _deliver(self, chat_id: str, reply: AgentReply) -> None:
        rows = [[button] for button in reply.buttons] if reply.buttons else None
        if not rows and not reply.needs_confirmation:
            rows = [[("‹ Menü", "menu:haupt")]] if reply.tool_names else None
        await self.send(chat_id, reply.text, rows=rows)

    # --------------------------------------------------------------- Befehle
    async def _handle_command(self, incoming: Incoming, text: str) -> None:
        chat_id = incoming.chat_id
        command, _, argument = text.partition(" ")
        command = command.lstrip("/").split("@")[0].lower()
        argument = argument.strip()
        agent = self.agent

        async def tool(name: str, **arguments: Any) -> None:
            await self.typing(chat_id)
            reply = await agent.run_tool_directly(name, arguments, chat_id=chat_id)
            await self._deliver(chat_id, reply)

        if command in {"start", "menu"}:
            if command == "start":
                await self._send_startup_notice(chat_id)
            else:
                await self.send(chat_id, "*Menü*", rows=MAIN_MENU)
        elif command in {"hilfe", "help"}:
            await self.send(chat_id, HELP_TEXT, rows=[[("‹ Menü", "menu:haupt")]])
        elif command in {"uebersicht", "heute"}:
            await tool("tagesueberblick")
        elif command == "aufgaben":
            await tool("aufgaben_liste", status="offen")
        elif command == "neu":
            if not argument:
                self._awaiting[chat_id] = "aufgabe"
                await self.send(chat_id, INPUT_PROMPTS["aufgabe"][0])
            else:
                await tool("aufgabe_anlegen", titel=argument)
        elif command == "fertig":
            if not argument:
                self._awaiting[chat_id] = "aufgabe_fertig"
                await self.send(chat_id, INPUT_PROMPTS["aufgabe_fertig"][0])
            else:
                await tool("aufgabe_abschliessen", aufgabe=argument)
        elif command == "erinnerungen":
            await tool("erinnerungen_liste")
        elif command in {"erinnere", "erinnerung"}:
            if not argument:
                self._awaiting[chat_id] = "erinnerung"
                await self.send(chat_id, INPUT_PROMPTS["erinnerung"][0])
            else:
                # Der Agent trennt Text und Zeit zuverlaessiger als eine Regel.
                await self.typing(chat_id)
                reply = await agent.handle(chat_id, f"Erinnere mich: {argument}")
                await self._deliver(chat_id, reply)
        elif command == "termine":
            days = int(argument) if argument.isdigit() else 1
            await tool("termine_anzeigen", zeitraum="heute", tage=days)
        elif command in {"mail", "email"}:
            await tool("email_ungelesen")
        elif command == "merken":
            if not argument:
                self._awaiting[chat_id] = "merken"
                await self.send(chat_id, INPUT_PROMPTS["merken"][0])
            else:
                await self.typing(chat_id)
                reply = await agent.handle(chat_id, f"Merk dir bitte: {argument}")
                await self._deliver(chat_id, reply)
        elif command in {"weisst", "wusstest", "gedaechtnis"}:
            await tool("gedaechtnis_suchen", frage=argument or "alles")
        elif command == "status":
            await tool("systemstatus")
        elif command == "stumm":
            muted = not self.services.notifier.muted
            self.services.notifier.muted = muted
            self.services.store.set("stumm", "true" if muted else "false")
            await self.send(chat_id, (
                "Still. Ich melde nur noch Dringendes." if muted
                else "Ich melde mich wieder normal."
            ))
        elif command == "telefonie":
            wanted = argument.lower() in {"an", "ein", "on", "true", "ja"}
            if argument:
                await tool("telefonie_schalten", an=wanted)
            else:
                state = "an" if self.services.phone_active else "aus"
                await self.send(chat_id, f"Telefonie ist {state}. (/telefonie an | aus)")
        elif command in {"vergessen", "verlauf"}:
            count = self.services.memory.clear_conversation(chat_id)
            await self.send(chat_id, f"Gesprächsverlauf gelöscht ({count} Nachrichten). "
                                     "Das Langzeitgedächtnis bleibt.")
        elif command == "export":
            await self._export(chat_id)
        elif command in {"abbrechen", "nein"}:
            open_requests = self.services.permissions.open_requests(chat_id)
            if not open_requests:
                await self.send(chat_id, "Es ist nichts offen.")
            else:
                for request in open_requests:
                    self.services.permissions.reject(request.token)
                self.services.memory.clear_pending(chat_id)
                await self.send(chat_id, f"{len(open_requests)} Rückfrage(n) verworfen.")
        else:
            await self.send(
                chat_id,
                f"Den Befehl /{command} kenne ich nicht. /hilfe zeigt alle.",
                rows=[[("‹ Menü", "menu:haupt")]],
            )

    async def _export(self, chat_id: str) -> None:
        import json
        from pathlib import Path
        data = self.services.memory.export_all()
        target = Path(self.settings.data_dir) / "export" / f"jarvis-export-{utcnow():%Y%m%d-%H%M}.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str),
                          encoding="utf-8")
        sent = await self.send_document(
            chat_id, target,
            caption="Alle gespeicherten Daten. Zugangsdaten sind nicht enthalten.",
        )
        if not sent:
            await self.send(chat_id, f"Export liegt unter `{target}`.")

    # ---------------------------------------------------------------- Knoepfe
    async def _handle_callback(self, incoming: Incoming) -> None:
        data = incoming.callback_data
        chat_id = incoming.chat_id
        await self._answer_callback(incoming.callback_id)
        kind, _, rest = data.partition(":")

        if kind == "menu":
            if rest in {"haupt", ""}:
                await self.send(chat_id, "*Menü*", rows=MAIN_MENU)
            elif rest == "hilfe":
                await self.send(chat_id, HELP_TEXT, rows=[[("‹ Menü", "menu:haupt")]])
            elif rest in SUBMENUS:
                title, rows = SUBMENUS[rest]
                await self.send(chat_id, title, rows=rows)
            return

        if kind == "tool":
            name, _, arguments_raw = rest.partition(":")
            arguments: dict[str, Any] = {}
            for pair in arguments_raw.split(","):
                if "=" in pair:
                    key, _, value = pair.partition("=")
                    arguments[key.strip()] = value.strip()
            await self.typing(chat_id)
            reply = await self.agent.run_tool_directly(name, arguments, chat_id=chat_id)
            await self._deliver(chat_id, reply)
            return

        if kind == "eingabe":
            prompt = INPUT_PROMPTS.get(rest, ("Was genau?", "", ""))[0]
            self._awaiting[chat_id] = rest
            await self.send(chat_id, prompt)
            return

        if kind == "bestaetigen":
            await self.typing(chat_id)
            reply = await self.agent.confirm(rest, chat_id=chat_id)
            await self._deliver(chat_id, reply)
            return

        if kind == "ablehnen":
            reply = await self.agent.reject(rest)
            self.services.memory.clear_pending(chat_id)
            await self.send(chat_id, reply.text)
            return

        if kind == "aufgabe_fertig":
            reply = await self.agent.run_tool_directly(
                "aufgabe_abschliessen", {"aufgabe": rest}, chat_id=chat_id
            )
            await self._deliver(chat_id, reply)
            return

        if kind == "aufgabe_spaeter":
            when = utcnow() + timedelta(days=1)
            reply = await self.agent.run_tool_directly(
                "aufgabe_aendern", {"aufgabe": rest, "faellig": iso(when)}, chat_id=chat_id
            )
            await self._deliver(chat_id, reply)
            return

        if kind == "erinnerung_ok":
            reminder = self.services.reminders.confirm(int(rest)) if rest.isdigit() else None
            await self.send(
                chat_id,
                f"Notiert, #{rest} ist erledigt." if reminder else "Die Erinnerung ist weg.",
            )
            return

        if kind == "erinnerung_spaeter":
            if rest.isdigit():
                updated = self.services.reminders.snooze(
                    int(rest), utcnow() + timedelta(minutes=15)
                )
                await self.send(chat_id, (
                    f"Ich melde mich wieder um "
                    f"{format_local(updated.due_at, self.settings.tz)}."
                    if updated else "Die Erinnerung ist weg."
                ))
            return

        if kind == "email_fassen":
            await self.typing(chat_id)
            reply = await self.agent.run_tool_directly(
                "email_lesen", {"uid": rest, "zusammenfassen": True}, chat_id=chat_id
            )
            await self.send(chat_id, reply.text, rows=[
                [("Antwort entwerfen", f"email_antwort:{rest}")], [("‹ Menü", "menu:haupt")]
            ])
            return

        if kind == "email_antwort":
            await self.typing(chat_id)
            reply = await self.agent.run_tool_directly(
                "email_antwort_entwerfen", {"uid": rest}, chat_id=chat_id
            )
            await self._deliver(chat_id, reply)
            return

        if kind == "aktion":
            await self._handle_action(chat_id, rest)
            return

        log.debug("Unbekannter Knopf: %s", data)

    async def _handle_action(self, chat_id: str, action: str) -> None:
        services = self.services
        if action == "fehler":
            entries = services.recent_log(limit=12)
            if not entries:
                await self.send(chat_id, "Keine Fehler protokolliert. Gut so.")
                return
            lines = [
                f"`{e['created_at'][5:16].replace('T', ' ')}` {e['level']} "
                f"{e['message'][:160]}"
                for e in entries
            ]
            await self.send(chat_id, "*Letzte Meldungen*\n" + "\n".join(lines))
        elif action == "auftraege":
            pending = services.queue.pending(limit=10)
            failed = services.queue.failed(limit=5)
            lines = ["*Hintergrundaufträge*"]
            lines += [
                f"• {job.kind} — {format_local(job.run_at, self.settings.tz)}"
                for job in pending
            ] or ["(nichts geplant)"]
            if failed:
                lines.append("\n*Fehlgeschlagen*")
                lines += [f"✗ {job.kind}: {job.last_error[:120]}" for job in failed]
            await self.send(chat_id, "\n".join(lines))
        elif action == "sicherung":
            target = services.db.backup(self.settings.backup_dir, keep=self.settings.backup_keep)
            services.store.set("letzte_sicherung", iso(utcnow()))
            await self.send(chat_id, f"Sicherung geschrieben: `{target.name}`")
        elif action == "stumm":
            services.notifier.muted = not services.notifier.muted
            services.store.set("stumm", "true" if services.notifier.muted else "false")
            await self.send(chat_id, (
                "Still. Nur Dringendes." if services.notifier.muted
                else "Ich melde mich wieder normal."
            ))
        elif action == "telefonie_an":
            reply = await self.agent.run_tool_directly(
                "telefonie_schalten", {"an": True}, chat_id=chat_id
            )
            await self.send(chat_id, reply.text)
        elif action == "telefonie_aus":
            reply = await self.agent.run_tool_directly(
                "telefonie_schalten", {"an": False}, chat_id=chat_id
            )
            await self.send(chat_id, reply.text)
        elif action == "verlauf_loeschen":
            count = services.memory.clear_conversation(chat_id)
            await self.send(chat_id, f"Verlauf gelöscht ({count} Nachrichten).")
        elif action == "export":
            await self._export(chat_id)
        else:
            await self.send(chat_id, "Diese Aktion kenne ich nicht.")
