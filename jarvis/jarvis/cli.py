"""Kommandozeile.

``jarvis run`` ist der Normalfall; alles andere sind Handgriffe, die man
einmal braucht: Zustand pruefen, Google anmelden, Sicherung ziehen,
einen Satz testweise durch das System schicken.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import logging
import signal
import sys
from pathlib import Path

from .config import PROJECT_ROOT, Settings, load_env_file
from .db.database import Database, utcnow
from .db.migrations import current_version, migrate
from .errors import JarvisError
from .logging_setup import setup_logging

log = logging.getLogger("jarvis")

BANNER = r"""
     ┬  ┌─┐┬─┐┬  ┬┬┌─┐
     │  ├─┤├┬┘│  ││└─┐   persoenlicher Assistent
    └┘  ┴ ┴┴└─└──┘┴└─┘
"""


# --------------------------------------------------------------------- Betrieb
async def _run(settings: Settings, *, orb_oeffnen: bool = False) -> int:
    from .core.services import Services

    services = Services(settings)
    loop = asyncio.get_running_loop()
    stop = asyncio.Event()

    def request_stop(*_: object) -> None:
        log.info("Beenden angefordert -- fahre geordnet herunter")
        stop.set()

    for signal_name in ("SIGINT", "SIGTERM"):
        with contextlib.suppress(NotImplementedError, AttributeError):
            loop.add_signal_handler(getattr(signal, signal_name), request_stop)

    http_server = None
    bot = None
    bot_task = None
    try:
        await services.start()

        if settings.http_enabled:
            from .server.http_server import JarvisHTTPServer
            http_server = JarvisHTTPServer(services, loop)
            try:
                address = http_server.start()
                print(f"Dashboard und API: {address}")
                if settings.orb_enabled:
                    orb_adresse = address.rstrip("/") + "/orb"
                    if settings.http_api_token:
                        orb_adresse += "#token=" + settings.http_api_token
                    print(f"Jarvis zum Sprechen: {orb_adresse}")
                    print("  (Chrome oeffnen, Mikrofon erlauben, Orb anklicken)")
                    if orb_oeffnen:
                        _im_browser(orb_adresse)
            except JarvisError as exc:
                log.error("%s", exc.user_text())
                http_server = None

        if settings.telegram_token and settings.telegram_allowed_ids:
            from .adapters.telegram import TelegramBot
            bot = TelegramBot(services)
            bot_task = asyncio.create_task(bot.start(), name="jarvis-telegram")
            print("Telegram: Long Polling laeuft. Schreib dem Bot /start.")
        else:
            print(
                "Telegram ist noch nicht eingerichtet -- Hintergrunddienst und API laufen "
                "trotzdem.\nFehlt: "
                + ", ".join(
                    step.titel for step in settings.missing_setup() if step.blockierend
                )
            )

        for step in settings.missing_setup():
            marker = "!" if step.blockierend else "-"
            print(f"  {marker} {step.titel}: {step.was_tun}")

        print("\nLaeuft. Beenden mit Strg+C.\n")
        waiter = asyncio.create_task(stop.wait())
        pending = {waiter} | ({bot_task} if bot_task else set())
        while True:
            done, pending_tasks = await asyncio.wait(
                pending, return_when=asyncio.FIRST_COMPLETED
            )
            if waiter in done:
                break
            # Faellt der Telegram-Adapter aus, laufen Erinnerungen, Anrufe und
            # das Dashboard weiter -- das ist der Teil, der nicht ausfallen darf.
            if bot_task in done:
                error = None if bot_task.cancelled() else bot_task.exception()
                if error is not None:
                    log.error(
                        "Der Telegram-Adapter ist ausgefallen: %s. "
                        "Hintergrunddienst und API laufen weiter.", error,
                    )
                    print(
                        "\nTelegram ist ausgefallen (siehe Protokoll). "
                        "Erinnerungen und Dashboard laufen weiter.\n"
                    )
                bot_task = None
                pending = {waiter}
        waiter.cancel()
    finally:
        if bot is not None:
            await bot.stop()
        if bot_task is not None and not bot_task.done():
            bot_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await bot_task
        if http_server is not None:
            http_server.stop()
        await services.stop()
        print("Beendet.")
    return 0


# ---------------------------------------------------------------------- Pruefen
async def _doctor(settings: Settings) -> int:
    from .core.services import Services

    print(BANNER)
    services = Services(settings)
    try:
        states = await services.health()
        width = max(len(state.name) for state in states)
        problems = 0
        for state in states:
            if not state.configured:
                mark = "—"
            elif state.ok:
                mark = "✓"
            else:
                mark = "✗"
                problems += 1
            print(f" {mark}  {state.name.ljust(width)}  {state.detail}")

        missing = settings.missing_setup()
        if missing:
            print("\nNoch zu tun:")
            for step in missing:
                print(f" {'!' if step.blockierend else '-'} {step.titel}\n   {step.was_tun}")

        print(f"\nWerkzeuge: {len(services.toolkit.names())}")
        print(f"Auftragsarten: {', '.join(services.scheduler.known_kinds())}")
        print(f"Datenbank: {settings.db_path} (Schema {current_version(services.db)})")
        print(f"Zeitzone: {settings.timezone_name}")
        if problems:
            print(f"\n{problems} Baustein(e) brauchen Aufmerksamkeit.")
        else:
            print("\nAlles, was eingerichtet ist, funktioniert.")
        return 1 if any(
            not s.ok and s.configured and s.name in {"Datenbank", "Telegram"} for s in states
        ) else 0
    finally:
        await services.stop()


async def _ask(settings: Settings, text: str) -> int:
    """Einen Satz durch das echte System schicken -- ohne Telegram."""
    from .core.services import Services

    services = Services(settings)
    try:
        await services.scheduler.start()
        agent = services.build_agent()
        reply = await agent.handle("konsole", text, channel="dashboard")
        print("\n" + reply.text + "\n")
        if reply.tool_names:
            print(f"(Werkzeuge: {', '.join(reply.tool_names)})")
        if reply.needs_confirmation:
            print(f"(wartet auf Bestaetigung, Token {reply.confirmation_token})")
            print("Einloesen mit: jarvis bestaetigen " + reply.confirmation_token)
        return 0
    finally:
        await services.stop()


async def _confirm(settings: Settings, token: str) -> int:
    from .core.services import Services

    services = Services(settings)
    try:
        reply = await services.build_agent().confirm(token, chat_id="konsole")
        print(reply.text)
        return 0
    finally:
        await services.stop()


async def _lernen(settings: Settings, datei: str | None, probe: bool) -> int:
    """Gehirn-Datei einlesen."""
    from .core.brain import import_entries, parse_brain_file
    from .core.services import Services

    pfad = Path(datei).expanduser() if datei else (PROJECT_ROOT / "mein-gehirn.md")
    startfassung = PROJECT_ROOT / "mein-gehirn.start.md"
    # Die Startfassung ist schon ausgefuellt; die leere Vorlage ist der
    # Rueckfall, wenn es keine gibt.
    vorlage = startfassung if startfassung.exists() else (PROJECT_ROOT / "mein-gehirn.vorlage.md")
    if not pfad.exists() and datei is None and vorlage.exists():
        # Die persoenliche Fassung liegt ausserhalb der Versionsverwaltung,
        # damit eigene Eintraege keine Aktualisierung behindern.
        pfad.write_text(vorlage.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"\n{pfad.name} aus {vorlage.name} angelegt.")
        print("Durchlesen und ergaenzen:  open -e mein-gehirn.md")
        print("Danach erneut:     ./start.sh lernen\n")
        return 0
    if not pfad.exists():
        print(f"'{pfad}' gibt es nicht.")
        print("Die Vorlage liegt unter mein-gehirn.vorlage.md.")
        return 1

    gelesen = parse_brain_file(pfad.read_text(encoding="utf-8"))
    print(f"\n{pfad}\n")
    for eintrag in gelesen.entries:
        print(f"  {eintrag.line_text()[:110]}")
    if gelesen.skipped:
        print(f"\n{len(gelesen.skipped)} Zeile(n) uebersprungen (noch nicht ausgefuellt):")
        for hinweis in gelesen.skipped[:10]:
            print(f"  - {hinweis}")
        if len(gelesen.skipped) > 10:
            print(f"  ... und {len(gelesen.skipped) - 10} weitere")
    for warnung in gelesen.warnings:
        print(f"\n  Hinweis: {warnung}")

    if not gelesen.entries:
        print("\nNichts zu lernen.")
        if datei is None and startfassung.exists():
            print("Es gibt eine ausgefuellte Startfassung. Einlesen mit:")
            print("  ./start.sh lernen mein-gehirn.start.md")
        return 1
    if probe:
        print(f"\nProbe: {gelesen.count} Punkte waeren gelernt worden. "
              "Ohne --probe wird es uebernommen.")
        return 0

    services = Services(settings)
    try:
        ergebnis = import_entries(services.memory, gelesen.entries, source=pfad.name)
        print(f"\nGelernt: {ergebnis.summary()}.")
        for fehler in ergebnis.fehler:
            print(f"  Fehler: {fehler}")
        gesamt = len(services.memory.list_memory(limit=1000))
        print(f"Im Gedaechtnis stehen jetzt {gesamt} Punkte. "
              "Ansehen mit 'jarvis gehirn' oder in Telegram mit /gehirn.")
        return 0
    finally:
        await services.stop()


async def _gehirn(settings: Settings) -> int:
    """Zeigt, was im Langzeitgedaechtnis steht."""
    from .core.services import Services

    services = Services(settings)
    try:
        eintraege = services.memory.list_memory(limit=500)
        if not eintraege:
            print("Das Gedaechtnis ist leer. Fuelle mein-gehirn.md aus und "
                  "fuehre 'jarvis lernen' aus.")
            return 0
        namen = {"fakt": "WER ICH BIN / FAKTEN", "vorliebe": "VORLIEBEN",
                 "ablauf": "ABLAEUFE", "projekt": "PROJEKTE"}
        gruppen: dict[str, list] = {}
        for eintrag in eintraege:
            gruppen.setdefault(eintrag.kind, []).append(eintrag)
        for art, liste in gruppen.items():
            print(f"\n{namen.get(art, art.upper())}")
            for eintrag in sorted(liste, key=lambda e: -e.importance):
                marke = {5: "!!", 4: "! "}.get(eintrag.importance, "  ")
                print(f"  {marke} #{eintrag.id} {eintrag.key}: {eintrag.value[:90]}")
        print(f"\n{len(eintraege)} Punkte. Wichtig markiert (! oder !!): "
              f"{sum(1 for e in eintraege if e.importance >= 4)} -- "
              "die denkt Jarvis bei jeder Antwort mit.")
        return 0
    finally:
        await services.stop()


async def _tools(settings: Settings) -> int:
    from .core.services import Services

    services = Services(settings)
    try:
        for category, tools in services.toolkit.by_category().items():
            print(f"\n{category.upper()}")
            for tool in tools:
                print(f"  {tool.name:28} {tool.description.splitlines()[0]}")
        print(f"\n{len(services.toolkit.names())} Werkzeuge.")
        return 0
    finally:
        await services.stop()


# ----------------------------------------------------------------- Einzelteile
def _migrate(settings: Settings) -> int:
    database = Database(settings.db_path)
    before = current_version(database)
    applied = migrate(database, settings.backup_dir, settings.backup_keep)
    after = current_version(database)
    database.close()
    if applied:
        print(f"Migrationen {applied} angewandt: Schema {before} -> {after}.")
    else:
        print(f"Schema ist aktuell (Stand {after}).")
    return 0


def _backup(settings: Settings) -> int:
    database = Database(settings.db_path)
    target = database.backup(settings.backup_dir, keep=settings.backup_keep)
    database.close()
    print(f"Sicherung: {target}")
    return 0


def _restore(settings: Settings, source: str) -> int:
    path = Path(source).expanduser()
    if not path.exists():
        print(f"'{path}' gibt es nicht.")
        return 1
    answer = input(f"{settings.db_path} durch {path.name} ersetzen? [ja/nein] ").strip().lower()
    if answer not in {"ja", "j", "yes", "y"}:
        print("Abgebrochen.")
        return 1
    database = Database(settings.db_path)
    database.backup(settings.backup_dir, keep=settings.backup_keep)
    database.restore(path)
    print(f"Wiederhergestellt. Schema {current_version(database)}.")
    database.close()
    return 0


def _google_login(settings: Settings) -> int:
    from .adapters.calendar.google import GoogleTokenStore, run_oauth_flow

    store = GoogleTokenStore(settings.secrets_dir / "google_token.json")
    try:
        message = run_oauth_flow(
            settings.google_client_id, settings.google_client_secret, store
        )
    except JarvisError as exc:
        print(exc.user_text())
        return 1
    print(message)
    print("Nicht vergessen: CALENDAR_PROVIDER=google in der .env setzen.")
    return 0


def _export(settings: Settings, target: str | None) -> int:
    from .core.memory import Memory

    database = Database(settings.db_path)
    data = Memory(database).export_all()
    database.close()
    path = Path(target) if target else (
        settings.data_dir / "export" / f"jarvis-export-{utcnow():%Y%m%d-%H%M}.json"
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    print(f"Export: {path}")
    return 0


def _setup(settings: Settings) -> int:
    """Legt eine ``.env`` aus der Vorlage an und fragt das Noetigste ab."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    template = env_path.parent / ".env.example"
    if env_path.exists():
        print(f"{env_path} gibt es schon -- ich lasse sie unangetastet.")
    elif template.exists():
        env_path.write_text(template.read_text(encoding="utf-8"), encoding="utf-8")
        env_path.chmod(0o600)
        print(f"{env_path} aus der Vorlage angelegt (Rechte 600).")
    else:
        print("Keine Vorlage .env.example gefunden.")
        return 1

    print("\nZwei Angaben brauche ich von dir -- leer lassen und spaeter nachtragen geht auch.")
    token = input("Telegram-Bot-Token (von @BotFather): ").strip()
    chat_id = input("Deine Telegram-ID (z. B. ueber @userinfobot): ").strip()
    if token or chat_id:
        lines = env_path.read_text(encoding="utf-8").splitlines()
        out = []
        for line in lines:
            if token and line.startswith("TELEGRAM_BOT_TOKEN="):
                out.append(f"TELEGRAM_BOT_TOKEN={token}")
            elif chat_id and line.startswith("TELEGRAM_ALLOWED_IDS="):
                out.append(f"TELEGRAM_ALLOWED_IDS={chat_id}")
            else:
                out.append(line)
        env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
        print("Eingetragen.")
    print("\nWeiter mit: jarvis doctor   und dann   jarvis run")
    return 0


# ------------------------------------------------------------------- Einstieg
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="jarvis", description="Jarvis -- persoenlicher KI-Assistent",
    )
    parser.add_argument("--env", help="Pfad zu einer anderen .env")
    parser.add_argument("--leise", action="store_true", help="keine Ausgaben auf der Konsole")
    sub = parser.add_subparsers(dest="befehl")

    sub.add_parser("run", help="Assistenten starten (Standard)")
    sub.add_parser("orb", help="Assistent starten und die Sprachoberflaeche oeffnen")
    sub.add_parser("doctor", help="Zustand aller Bausteine pruefen")
    sub.add_parser("selftest", help="Ganze Kette pruefen (eigene Datenbank, keine Anrufe)")
    sub.add_parser("setup", help=".env anlegen und Telegram-Daten abfragen")
    sub.add_parser("migrate", help="Datenbank auf den neuesten Stand bringen")
    sub.add_parser("backup", help="Sicherung schreiben")
    sub.add_parser("tools", help="Werkzeuge auflisten")
    sub.add_parser("gehirn", help="Zeigen, was Jarvis dauerhaft ueber dich weiss")

    lernen = sub.add_parser("lernen", help="Gehirn-Datei einlesen (Standard: mein-gehirn.md)")
    lernen.add_argument("datei", nargs="?")
    lernen.add_argument("--probe", action="store_true",
                        help="nur zeigen, was gelernt wuerde")
    sub.add_parser("google-login", help="Google-Kalender autorisieren")

    restore = sub.add_parser("restore", help="Sicherung wiederherstellen")
    restore.add_argument("datei")

    ask = sub.add_parser("ask", help="Einen Satz durch das System schicken")
    ask.add_argument("text", nargs="+")

    confirm = sub.add_parser("bestaetigen", help="Eine offene Bestaetigung einloesen")
    confirm.add_argument("token")

    export = sub.add_parser("export", help="Persoenliche Daten als JSON")
    export.add_argument("datei", nargs="?")

    return parser


def _im_browser(adresse: str) -> None:
    """Oeffnet die Oberflaeche -- in Chrome, weil nur der die Spracheingabe kann."""
    import subprocess
    if sys.platform == "darwin":
        for versuch in (["open", "-a", "Google Chrome", adresse], ["open", adresse]):
            if subprocess.run(versuch, capture_output=True).returncode == 0:
                return
        return
    import webbrowser
    webbrowser.open(adresse)


MIN_PYTHON = (3, 11)


def check_python() -> str:
    """Zu altes Python freundlich abfangen.

    macOS bringt ab Werk ein aelteres Python mit; der Fehler waere sonst ein
    Syntaxfehler mitten im Programm, was niemandem weiterhilft.
    """
    if sys.version_info[:2] >= MIN_PYTHON:
        return ""
    ist = ".".join(str(teil) for teil in sys.version_info[:3])
    soll = ".".join(str(teil) for teil in MIN_PYTHON)
    return (
        f"Jarvis braucht Python {soll} oder neuer, hier laeuft {ist}.\n"
        f"  macOS:  brew install python@3.12  (danach ./start.sh erneut)\n"
        f"  Ubuntu: sudo apt install python3.12 python3.12-venv\n"
        f"  Pfad pruefen: which -a python3"
    )


def main(argv: list[str] | None = None) -> int:
    hinweis = check_python()
    if hinweis:
        print(hinweis)
        return 1
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.env:
        load_env_file(Path(args.env).expanduser())
    settings = Settings.load()
    settings.ensure_dirs()
    setup_logging(settings.data_dir, settings.log_level, console=not args.leise)

    command = args.befehl or "run"
    try:
        if command == "run":
            print(BANNER)
            return asyncio.run(_run(settings))
        if command == "orb":
            print(BANNER)
            return asyncio.run(_run(settings, orb_oeffnen=True))
        if command == "doctor":
            return asyncio.run(_doctor(settings))
        if command == "selftest":
            from .selftest import run_selftest
            return asyncio.run(run_selftest(settings))
        if command == "ask":
            return asyncio.run(_ask(settings, " ".join(args.text)))
        if command == "bestaetigen":
            return asyncio.run(_confirm(settings, args.token))
        if command == "tools":
            return asyncio.run(_tools(settings))
        if command == "lernen":
            return asyncio.run(_lernen(settings, args.datei, args.probe))
        if command == "gehirn":
            return asyncio.run(_gehirn(settings))
        if command == "setup":
            return _setup(settings)
        if command == "migrate":
            return _migrate(settings)
        if command == "backup":
            return _backup(settings)
        if command == "restore":
            return _restore(settings, args.datei)
        if command == "google-login":
            return _google_login(settings)
        if command == "export":
            return _export(settings, args.datei)
    except KeyboardInterrupt:
        print("\nAbgebrochen.")
        return 130
    except JarvisError as exc:
        print(f"\nFehler: {exc.user_text()}")
        return 1
    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
