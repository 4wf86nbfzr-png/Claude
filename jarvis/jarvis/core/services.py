"""Das zentrale Jarvis-System.

Hier wird alles zusammengesteckt: Datenbank, Gedaechtnis, Aufgaben,
Erinnerungen, Hintergrunddienst, Berechtigungen, KI, Kalender, E-Mail,
Telefonie. Telegram, das Dashboard und der Telefonassistent sind nur
Zugaenge zu *diesem* Objekt -- sie haben keine eigene Logik und keinen
eigenen Datenbestand.

``Services.start()`` bringt den Hintergrunddienst hoch und legt die
wiederkehrenden Systemauftraege an. ``Services.stop()`` fahrt alles
geordnet herunter.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from ..adapters.calendar.base import CalendarAdapter
from ..adapters.calendar.caldav import CalDAVCalendar
from ..adapters.calendar.google import GoogleCalendar, GoogleTokenStore
from ..adapters.calendar.local import LocalCalendar
from ..adapters.voice.speech import SpeechRecognition, SpeechSynthesis
from ..ai.manager import ModelManager
from ..config import Settings
from ..db.database import Database, iso, parse_iso, utcnow
from ..db.migrations import current_version, migrate
from ..errors import CredentialsMissing, JarvisError
from ..logging_setup import attach_database_handler
from .jobs import Job, JobQueue, Scheduler
from .memory import Memory, SettingsStore
from .notifier import Notifier, PRIORITY_NORMAL, PRIORITY_URGENT
from .permissions import PermissionManager
from .tasks import ReminderStore, TaskStore
from .timeutil import format_local, in_quiet_hours, to_local, to_utc
from .toolkit import Toolkit

log = logging.getLogger(__name__)


@dataclass(slots=True)
class ComponentState:
    name: str
    ok: bool
    detail: str
    configured: bool = True

    @property
    def symbol(self) -> str:
        if not self.configured:
            return "—"
        return "✓" if self.ok else "✗"


class Services:
    def __init__(self, settings: Settings, *, console_logging: bool = True) -> None:
        self.settings = settings
        settings.ensure_dirs()

        self.db = Database(settings.db_path)
        applied = migrate(self.db, settings.backup_dir, settings.backup_keep)
        if applied:
            log.info("Datenbank auf Stand %s gebracht", current_version(self.db))
        attach_database_handler(self.db)

        self.memory = Memory(self.db)
        self.store = SettingsStore(self.db)
        self.tasks = TaskStore(self.db)
        self.reminders = ReminderStore(self.db)
        self.queue = JobQueue(self.db, settings.tz)
        self.scheduler = Scheduler(
            self.queue, tick_seconds=settings.scheduler_tick_seconds,
            on_error=self._note_scheduler_error,
        )
        self.permissions = PermissionManager(
            self.db, ttl_minutes=settings.confirmation_ttl_minutes,
            allow_shell=self.store.get_bool("allow_shell", False),
        )
        # ``store.get`` liefert None, wenn nichts gespeichert ist -- ein
        # gespeicherter leerer Wert bedeutet dagegen "keine Ruhezeit".
        gespeicherter_beginn = self.store.get("quiet_start")
        gespeichertes_ende = self.store.get("quiet_end")
        self.notifier = Notifier(
            self.db, settings.tz,
            quiet_start=(settings.quiet_hours_start if gespeicherter_beginn is None
                         else gespeicherter_beginn),
            quiet_end=(settings.quiet_hours_end if gespeichertes_ende is None
                       else gespeichertes_ende),
        )
        self.notifier.muted = self.store.get_bool("stumm", False)
        self.models = ModelManager(settings)
        self.toolkit = Toolkit(self.db)

        self.calendar: CalendarAdapter = self._build_calendar()
        self.email = None
        self.email_error: str = ""
        self._build_email()
        self.phone = None
        self.phone_error: str = ""
        self._build_phone()

        self.speech_out = SpeechSynthesis(
            settings.tts_engine, piper_binary=settings.piper_binary,
            piper_voice=settings.piper_voice, audio_dir=settings.data_dir / "audio",
        )
        self.speech_in = SpeechRecognition(
            settings.stt_engine, whisper_binary=settings.whisper_binary,
            model=settings.whisper_model,
        )

        self.agent = None          # wird in ``build_agent`` gesetzt
        self.started_at = utcnow()
        self.last_errors: list[str] = []
        self._register_jobs()

        from . import tools_builtin
        tools_builtin.register_all(self)

    # ---------------------------------------------------------------- Aufbau
    def _build_calendar(self) -> CalendarAdapter:
        provider = self.settings.calendar_provider
        try:
            if provider == "caldav":
                return CalDAVCalendar(
                    self.settings.caldav_url, self.settings.caldav_user,
                    self.settings.caldav_password, calendar=self.settings.caldav_calendar,
                )
            if provider == "google":
                if not (self.settings.google_client_id and self.settings.google_client_secret):
                    # Ohne Client-Daten kann gar nichts autorisiert werden -- dann
                    # lieber ehrlich der lokale Kalender als ein Anbieter, der
                    # bei jedem Zugriff scheitert.
                    raise CredentialsMissing(
                        "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET fehlen."
                    )
                return GoogleCalendar(
                    self.settings.google_client_id, self.settings.google_client_secret,
                    GoogleTokenStore(self.settings.secrets_dir / "google_token.json"),
                    calendar_id=self.settings.google_calendar_id,
                )
        except CredentialsMissing as exc:
            log.warning("Kalender '%s' nicht einsatzbereit: %s -- lokaler Kalender aktiv",
                        provider, exc.message)
        return LocalCalendar(self.db)

    def _build_email(self) -> None:
        if not self.settings.email_enabled:
            self.email_error = "E-Mail ist abgeschaltet (EMAIL_ENABLED=false)"
            return
        from ..adapters.email.imap_smtp import EmailAdapter
        try:
            self.email = EmailAdapter(
                imap_host=self.settings.imap_host, imap_port=self.settings.imap_port,
                imap_user=self.settings.imap_user, imap_password=self.settings.imap_password,
                imap_folder=self.settings.imap_folder, imap_ssl=self.settings.imap_ssl,
                smtp_host=self.settings.smtp_host,
                smtp_port=self.settings.smtp_port, smtp_user=self.settings.smtp_user,
                smtp_password=self.settings.smtp_password,
                smtp_starttls=self.settings.smtp_starttls, from_addr=self.settings.email_from,
                important_senders=self.settings.email_important_senders,
                important_keywords=self.settings.email_important_keywords,
            )
        except CredentialsMissing as exc:
            self.email_error = exc.message
            log.warning("E-Mail nicht einsatzbereit: %s", exc.message)

    def _build_phone(self) -> None:
        if not self.settings.phone_enabled:
            self.phone_error = "Telefonie ist abgeschaltet (PHONE_ENABLED=false)"
            return
        from ..adapters.phone.twilio import TwilioPhone
        try:
            self.phone = TwilioPhone(
                self.settings.twilio_account_sid, self.settings.twilio_auth_token,
                self.settings.twilio_from_number, self.db,
                my_number=self.settings.phone_my_number, voice=self.settings.phone_voice,
                language=self.settings.phone_language,
                public_base_url=self.settings.public_base_url,
                daily_limit=self.settings.phone_daily_limit,
                api_base=self.settings.twilio_api_base,
            )
        except JarvisError as exc:
            self.phone_error = exc.message
            log.warning("Telefonie nicht einsatzbereit: %s", exc.message)

    def build_agent(self) -> Any:
        """Erzeugt den Gespraechsfuehrer (spaet, damit Werkzeuge registriert sind)."""
        from .agent import Agent
        if self.agent is None:
            self.agent = Agent(self)
        return self.agent

    @property
    def phone_active(self) -> bool:
        return self.phone is not None and self.store.get_bool("telefonie", True)

    @property
    def owner_chat_id(self) -> str:
        stored = self.store.get("besitzer_chat")
        if stored:
            return stored
        return str(self.settings.telegram_allowed_ids[0]) if self.settings.telegram_allowed_ids else ""

    # ------------------------------------------------------- Hintergrunddienst
    def _register_jobs(self) -> None:
        self.scheduler.register("wachdienst", self._job_sweep)
        self.scheduler.register("erinnerung", self._job_reminder)
        self.scheduler.register("anruf", self._job_call)
        self.scheduler.register("email_pruefen", self._job_check_email)
        self.scheduler.register("sicherung", self._job_backup)
        self.scheduler.register("tagesueberblick", self._job_morning)
        self.scheduler.register("aufraeumen", self._job_cleanup)

    async def start(self) -> None:
        self.queue.recover_stuck()
        now = utcnow()

        # Der Wachdienst ist der Herzschlag: einmal pro Minute.
        self.queue.ensure_recurring(
            "wachdienst", run_at=now + timedelta(seconds=5), recurrence="alle:1:min"
        )
        if self.email is not None:
            interval = max(60, self.settings.email_poll_seconds)
            self.queue.ensure_recurring(
                "email_pruefen", run_at=now + timedelta(seconds=30),
                recurrence=f"alle:{max(1, interval // 60)}:min",
            )
        self.queue.ensure_recurring(
            "sicherung", run_at=self._next_local_time(3, 30), recurrence="taeglich"
        )
        self.queue.ensure_recurring(
            "aufraeumen", run_at=self._next_local_time(3, 45), recurrence="taeglich"
        )
        if self.settings.morning_briefing:
            try:
                hour, minute = (int(x) for x in self.settings.morning_briefing.split(":")[:2])
            except ValueError:
                hour, minute = 7, 30
            self.queue.ensure_recurring(
                "tagesueberblick", run_at=self._next_local_time(hour, minute),
                recurrence="taeglich",
            )
        await self.scheduler.start()
        self.memory.remember_event("system_start", "Jarvis gestartet", {
            "modell": f"{self.models.primary.name}/{self.models.primary.model}",
            "kalender": self.calendar.name,
            "email": bool(self.email), "telefonie": bool(self.phone),
        })

    async def stop(self) -> None:
        await self.scheduler.stop()
        self.memory.remember_event("system_stop", "Jarvis beendet")
        for component in (self.models, self.calendar, self.phone):
            if component is not None:
                try:
                    await component.close()
                except Exception:  # pragma: no cover
                    log.debug("Fehler beim Schliessen von %s", component, exc_info=True)
        self.db.close()

    def _next_local_time(self, hour: int, minute: int) -> datetime:
        local = to_local(utcnow(), self.settings.tz)
        candidate = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if candidate <= local:
            candidate += timedelta(days=1)
        return to_utc(candidate.replace(tzinfo=None), self.settings.tz)

    def _note_scheduler_error(self, kind: str, exc: Exception) -> None:
        message = f"{kind}: {type(exc).__name__}: {exc}"
        self.last_errors.append(message)
        del self.last_errors[:-20]

    # ---------------------------------------------------------- Auftragsarten
    async def _job_sweep(self, job: Job) -> str:
        """Herzschlag: faellige Erinnerungen, Eskalationen, Termine, Mahnungen."""
        notes: list[str] = []
        notes.append(f"erinnerungen={await self._sweep_reminders()}")
        notes.append(f"eskalationen={await self._sweep_escalations()}")
        notes.append(f"termine={await self._sweep_upcoming_events()}")
        notes.append(f"ueberfaellig={await self._sweep_overdue_tasks()}")
        notes.append(f"nachgeliefert={await self.notifier.flush_pending()}")
        return ", ".join(notes)

    async def _sweep_reminders(self) -> int:
        count = 0
        for reminder in self.reminders.due():
            # Idempotenz: ein Auftrag je Erinnerung und Faelligkeit.
            created = self.queue.enqueue(
                "erinnerung", payload={"erinnerung_id": reminder.id},
                idempotency_key=f"erinnerung:{reminder.id}:{iso(reminder.due_at)}",
                max_attempts=3,
            )
            if created is not None:
                # Sofort auf 'ausgeloest' setzen, damit der naechste Takt sie nicht erneut sieht.
                self.reminders.mark_triggered(reminder.id)
                count += 1
        return count

    async def _sweep_escalations(self) -> int:
        """Nicht bestaetigte Erinnerungen nach der Wartezeit per Anruf nachfassen."""
        if not self.phone_active:
            return 0
        count = 0
        for reminder in self.reminders.unconfirmed(self.settings.phone_retry_minutes):
            if not reminder.escalate_phone and reminder.channel == "telegram":
                continue
            created = self.queue.enqueue(
                "anruf",
                payload={"erinnerung_id": reminder.id, "text": reminder.text,
                         "versuch": reminder.attempts + 1},
                idempotency_key=f"eskalation:{reminder.id}:{reminder.attempts}",
                max_attempts=2,
            )
            if created is not None:
                self.db.execute(
                    "UPDATE reminder SET attempts = attempts + 1, updated_at = ? WHERE id = ?",
                    (iso(utcnow()), reminder.id),
                )
                count += 1
        return count

    async def _sweep_upcoming_events(self) -> int:
        """Termine, die in weniger als 30 Minuten beginnen, einmal melden."""
        now = utcnow()
        try:
            events = await self.calendar.list_events(now, now + timedelta(minutes=35))
        except JarvisError as exc:
            log.debug("Terminvorschau nicht moeglich: %s", exc.message)
            return 0
        count = 0
        for event in events:
            if event.all_day or event.start < now - timedelta(minutes=1):
                continue
            minutes = int((event.start - now).total_seconds() // 60)
            if minutes > 30:
                continue
            text = f"*Termin in {max(minutes, 1)} Minuten*\n{event.line(self.settings.tz)}"
            if await self.notifier.notify(
                f"termin:{event.uid}:{iso(event.start)}", text,
                kind="termin", priority=PRIORITY_NORMAL,
            ):
                count += 1
        return count

    async def _sweep_overdue_tasks(self) -> int:
        count = 0
        for task in self.tasks.overdue():
            due = task.due_at
            if due is None:
                continue
            text = (
                f"*Aufgabe ueberfaellig*\n#{task.id} {task.title}\n"
                f"faellig war {format_local(due, self.settings.tz)}"
            )
            if await self.notifier.notify(
                f"ueberfaellig:{task.id}:{iso(due)}", text, kind="aufgabe",
                priority=PRIORITY_NORMAL,
                keyboard={"buttons": [
                    (f"✓ #{task.id} erledigt", f"aufgabe_fertig:{task.id}"),
                    ("Später", f"aufgabe_spaeter:{task.id}"),
                ]},
            ):
                count += 1
        return count

    async def _job_reminder(self, job: Job) -> str:
        reminder_id = int(job.payload.get("erinnerung_id", 0))
        reminder = self.reminders.get(reminder_id)
        if reminder is None:
            return "Erinnerung existiert nicht mehr"
        if reminder.status in {"bestaetigt", "abgebrochen"}:
            return f"Erinnerung {reminder_id} war schon {reminder.status}"

        text = f"*Erinnerung*\n{reminder.text}"
        if reminder.task_id:
            task = self.tasks.get(reminder.task_id)
            if task:
                text += f"\n(zu Aufgabe #{task.id} {task.title})"
        delivered = False
        if reminder.channel in {"telegram", "beides"}:
            delivered = await self.notifier.notify(
                f"erinnerung:{reminder.id}:{iso(reminder.due_at)}", text,
                kind="erinnerung", priority=PRIORITY_URGENT, force=True,
                keyboard={"buttons": [
                    ("✓ Erledigt", f"erinnerung_ok:{reminder.id}"),
                    ("+15 Min", f"erinnerung_spaeter:{reminder.id}"),
                ]},
            )
        if reminder.channel in {"telefon", "beides"} and self.phone_active:
            self.queue.enqueue(
                "anruf", payload={"erinnerung_id": reminder.id, "text": reminder.text},
                idempotency_key=f"anruf:{reminder.id}:{iso(reminder.due_at)}", max_attempts=2,
            )
            delivered = True

        self.memory.remember_event(
            "erinnerung_ausgeloest", reminder.text,
            {"id": reminder.id, "kanal": reminder.channel, "zugestellt": delivered},
            ok=delivered,
        )
        following = self.reminders.reschedule_recurring(reminder, self.settings.tz)
        if following:
            return f"zugestellt, naechster Termin {format_local(following, self.settings.tz)}"
        if not delivered:
            raise JarvisError("Die Erinnerung konnte nicht zugestellt werden.")
        return "zugestellt"

    async def _job_call(self, job: Job) -> str:
        if not self.phone_active:
            return "Telefonie ist abgeschaltet -- kein Anruf"
        reminder_id = job.payload.get("erinnerung_id")
        text = str(job.payload.get("text") or "Du hast eine Erinnerung.")
        attempt = int(job.payload.get("versuch", 1))
        if attempt > self.settings.phone_max_attempts:
            return f"Maximale Anrufversuche ({self.settings.phone_max_attempts}) erreicht"
        result = await self.phone.call_reminder(
            text, reminder_id=int(reminder_id) if reminder_id else None
        )
        self.memory.remember_event(
            "anruf_gestartet", text[:200],
            {"sid": result.sid, "nummer": result.to_number, "versuch": attempt},
        )
        return f"Anruf {result.sid} ({result.status})"

    async def _job_check_email(self, job: Job) -> str:
        if self.email is None:
            return "E-Mail nicht verbunden"
        mails = await self.email.fetch_unread(limit=15, with_body=False)
        reported = 0
        for mail in mails:
            known = self.db.query_one(
                "SELECT id FROM email_seen WHERE folder = ? AND uid = ?",
                (self.settings.imap_folder, mail.uid),
            )
            if known:
                continue
            self.db.execute(
                "INSERT INTO email_seen (folder, uid, message_id, from_addr, subject, date, "
                "important, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT (folder, uid) DO NOTHING",
                (self.settings.imap_folder, mail.uid, mail.message_id, mail.from_addr,
                 mail.subject, mail.date.isoformat() if mail.date else "",
                 1 if mail.important else 0, iso(utcnow())),
            )
            if not mail.important:
                continue
            text = (
                f"*Neue wichtige Nachricht*\n"
                f"Von: {mail.from_name or mail.from_addr}\n"
                f"Betreff: {mail.subject or '(kein Betreff)'}\n"
                f"Grund: {', '.join(mail.reasons)}\n\n"
                "Soll ich sie zusammenfassen oder eine Antwort vorbereiten?"
            )
            if await self.notifier.notify(
                f"email:{mail.uid}", text, kind="email", priority=PRIORITY_NORMAL,
                keyboard={"buttons": [
                    ("Zusammenfassen", f"email_fassen:{mail.uid}"),
                    ("Antwort entwerfen", f"email_antwort:{mail.uid}"),
                ]},
            ):
                reported += 1
                self.db.execute(
                    "UPDATE email_seen SET notified_at = ? WHERE folder = ? AND uid = ?",
                    (iso(utcnow()), self.settings.imap_folder, mail.uid),
                )
        return f"{len(mails)} ungelesen, {reported} gemeldet"

    async def _job_backup(self, job: Job) -> str:
        target = self.db.backup(self.settings.backup_dir, keep=self.settings.backup_keep)
        self.store.set("letzte_sicherung", iso(utcnow()))
        self.memory.remember_event("sicherung", target.name)
        return target.name

    async def _job_morning(self, job: Job) -> str:
        overview = await self.daily_overview()
        sent = await self.notifier.notify(
            f"tagesueberblick:{to_local(utcnow(), self.settings.tz).date()}",
            "*Guten Morgen.*\n\n" + overview, kind="ueberblick", priority=PRIORITY_NORMAL,
        )
        return "gesendet" if sent else "unterdrueckt"

    async def _job_cleanup(self, job: Job) -> str:
        removed_jobs = self.queue.purge_old(days=30)
        removed_notifications = self.notifier.purge_old(days=30)
        removed_confirmations = self.permissions.purge_expired(days=7)
        pruned = 0
        chats = self.db.query("SELECT DISTINCT chat_id FROM conversation")
        for row in chats:
            pruned += self.memory.prune_conversation(row["chat_id"], keep=400)
        self.db.execute("DELETE FROM log WHERE created_at < ?", (iso(utcnow() - timedelta(days=30)),))
        return (f"Auftraege {removed_jobs}, Meldungen {removed_notifications}, "
                f"Bestaetigungen {removed_confirmations}, Nachrichten {pruned}")

    # ----------------------------------------------------------- Auswertungen
    async def daily_overview(self, day: datetime | None = None) -> str:
        """Der Ueberblick, den /uebersicht, das Briefing und das Telefon nutzen."""
        tz = self.settings.tz
        local = to_local(day or utcnow(), tz)
        start = to_utc(local.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None), tz)
        end = start + timedelta(days=1)

        lines: list[str] = []
        try:
            events = await self.calendar.list_events(start, end)
        except JarvisError as exc:
            events = []
            lines.append(f"_Kalender nicht erreichbar: {exc.message}_")
        now = utcnow()
        coming = [e for e in events if e.end >= now]
        if coming:
            lines.append("*Termine heute*")
            lines += [f"• {e.line(tz)}" for e in coming[:8]]
        else:
            lines.append("*Termine heute:* keine mehr.")

        open_tasks = self.tasks.list(limit=8)
        if open_tasks:
            lines.append("\n*Aufgaben*")
            lines += [f"{t.line(tz)}" for t in open_tasks]
        else:
            lines.append("\n*Aufgaben:* nichts offen.")

        reminders = [r for r in self.reminders.upcoming(limit=20)
                     if r.status == "geplant" and r.due_at <= end]
        if reminders:
            lines.append("\n*Erinnerungen heute*")
            lines += [f"• {r.line(tz)}" for r in reminders[:6]]

        overdue = self.tasks.overdue()
        if overdue:
            lines.append(f"\n_{len(overdue)} Aufgabe(n) ueberfaellig._")

        if self.email is not None:
            unread = int(self.db.scalar(
                "SELECT COUNT(*) FROM email_seen WHERE important = 1 AND notified_at IS NOT NULL "
                "AND created_at >= ?", (iso(utcnow() - timedelta(days=1)),)
            ) or 0)
            if unread:
                lines.append(f"\n_{unread} wichtige E-Mail(s) in den letzten 24 Stunden._")
        return "\n".join(lines)

    async def health(self) -> list[ComponentState]:
        """Zustand aller Bausteine -- fuer ``jarvis doctor``, /system und das Dashboard."""
        states: list[ComponentState] = []

        version = current_version(self.db)
        states.append(ComponentState("Datenbank", True, f"Schema {version}, {self.settings.db_path}"))

        model = await self.models.health()
        states.append(ComponentState(
            "KI-Modell", bool(model.get("erreichbar")),
            f"{model.get('anbieter')}/{model.get('modell')}: {model.get('hinweis')}",
        ))

        states.append(ComponentState(
            "Telegram", bool(self.settings.telegram_token and self.settings.telegram_allowed_ids),
            "Token und autorisierte ID vorhanden"
            if self.settings.telegram_token and self.settings.telegram_allowed_ids
            else "TELEGRAM_BOT_TOKEN oder TELEGRAM_ALLOWED_IDS fehlt",
        ))

        pending = len(self.queue.pending())
        failed = len(self.queue.failed())
        states.append(ComponentState(
            "Hintergrunddienst", self.scheduler.last_tick is not None or self.scheduler.ticks == 0,
            f"{pending} geplant, {failed} fehlgeschlagen, letzter Takt "
            + (format_local(self.scheduler.last_tick, self.settings.tz)
               if self.scheduler.last_tick else "noch keiner"),
        ))

        try:
            calendar_ok, calendar_detail = await self.calendar.health()
        except JarvisError as exc:
            calendar_ok, calendar_detail = False, exc.message
        states.append(ComponentState(f"Kalender ({self.calendar.name})", calendar_ok, calendar_detail))

        if self.email is not None:
            try:
                email_ok, email_detail = await self.email.health()
            except JarvisError as exc:
                email_ok, email_detail = False, exc.message
            states.append(ComponentState("E-Mail", email_ok, email_detail))
        else:
            states.append(ComponentState("E-Mail", False, self.email_error, configured=False))

        if self.phone is not None:
            try:
                phone_ok, phone_detail = await self.phone.health()
            except JarvisError as exc:
                phone_ok, phone_detail = False, exc.message
            if not self.store.get_bool("telefonie", True):
                phone_detail += " (im Chat abgeschaltet)"
            states.append(ComponentState("Telefonie", phone_ok, phone_detail))
        else:
            states.append(ComponentState("Telefonie", False, self.phone_error, configured=False))

        states.append(ComponentState(
            "Sprache", True, f"{self.speech_out.describe()}; {self.speech_in.describe()}"
        ))

        last_backup = self.store.get("letzte_sicherung")
        states.append(ComponentState(
            "Sicherung", bool(last_backup),
            format_local(parse_iso(last_backup), self.settings.tz) if last_backup
            else "noch keine (laeuft taeglich um 03:30)",
        ))
        return states

    def recent_log(self, limit: int = 15) -> list[dict[str, Any]]:
        rows = self.db.query(
            "SELECT level, logger, message, created_at FROM log ORDER BY id DESC LIMIT ?", (limit,)
        )
        return [dict(r) for r in rows]

    def status_snapshot(self) -> dict[str, Any]:
        """Kompakter Zustand fuer das Dashboard (ohne Netzzugriffe)."""
        tz = self.settings.tz
        return {
            "zeitpunkt": iso(utcnow()),
            "gestartet": iso(self.started_at),
            "laufzeit_minuten": int((utcnow() - self.started_at).total_seconds() // 60),
            "modell": {
                "anbieter": self.models.active.name, "modell": self.models.active.model,
                "ersatzbetrieb": self.models.degraded, "letzter_fehler": self.models.last_error,
            },
            "aufgaben": self.tasks.counts(),
            "auftraege": self.queue.counts(),
            "erinnerungen": {
                "geplant": int(self.db.scalar(
                    "SELECT COUNT(*) FROM reminder WHERE status = 'geplant'") or 0),
                "offen_unbestaetigt": int(self.db.scalar(
                    "SELECT COUNT(*) FROM reminder WHERE status = 'ausgeloest'") or 0),
            },
            "gedaechtnis": int(self.db.scalar("SELECT COUNT(*) FROM memory") or 0),
            "kalender": self.calendar.name,
            "email_verbunden": self.email is not None,
            "telefonie_aktiv": self.phone_active,
            "stumm": self.notifier.muted,
            "ruhezeit": in_quiet_hours(
                utcnow(), tz, self.notifier.quiet_start, self.notifier.quiet_end
            ),
            "letzte_sicherung": self.store.get("letzte_sicherung", ""),
            "letzter_takt": iso(self.scheduler.last_tick) if self.scheduler.last_tick else "",
            "fehler_zuletzt": self.last_errors[-5:],
        }
