"""Kommandozeile.

``python3 -m jarvis.cli <befehl>``. Bewusst klein: Diagnose, Konfiguration
anlegen, Aufgaben und Gedaechtnis ansehen. Der Sprachbetrieb kommt mit dem
Befehl ``run``, sobald die Sprachpipeline steht.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__, doctor
from .config import Config, ConfigError, DEFAULT_CONFIG_PATH

CONFIG_TEMPLATE = '''\
# JARVIS -- Konfiguration
# Alle Werte sind optional; was fehlt, bekommt eine Vorgabe.
# Zugangsdaten gehoeren NICHT hierher, sondern in den Schluesselbund.

user_name = "Noah"
state_dir = "~/.local/state/jarvis"
log_level = "INFO"

[llm]
runtime = "ollama"
base_url = "http://127.0.0.1:11434"
# Auf Apple Silicon mit 16 GB+ eine gute Ausgangswahl; bei 8 GB
# "qwen2.5:3b-instruct-q4_K_M" nehmen. `jarvis doctor` sagt, was passt.
model = "qwen2.5:7b-instruct"
context_tokens = 8192
temperature = 0.4
history_turns = 20

[stt]
engine = "whisper_cpp"
binary = "whisper-cli"
model_path = "~/.local/share/jarvis/models/ggml-large-v3-turbo-q5_0.bin"
language = "de"
# Stille in Sekunden, nach der eine Aeusserung als beendet gilt.
silence_timeout = 0.8

[tts]
engine = "piper"
binary = "piper"
voice_path = "~/.local/share/jarvis/voices/de_DE-thorsten-high.onnx"
# Rueckfall, wenn Piper fehlt oder abstuerzt.
macos_voice = "Markus"
speed = 1.0

[wake]
engine = "openwakeword"
phrase = "hey jarvis"
threshold = 0.6
# So lange bleibt das Gespraech offen, ohne dass das Aktivierungswort
# wiederholt werden muss.
conversation_timeout = 25.0

[audio]
sample_rate = 16000
vad_threshold = 0.015

[notify]
# Ab welcher Dringlichkeit gesprochen wird:
# DEBUG, INFO, NOTABLE, IMPORTANT, URGENT
speak_threshold = "IMPORTANT"
min_gap_seconds = 20.0
quiet_hours = [22, 8]
silent = false

[permissions]
# Nicht hierarchisch: wer lesen darf, darf deshalb nicht loeschen.
# Moeglich: read, create, edit, delete, web, external, system, app_control
granted = ["read", "create", "edit", "web"]
# Stufen, bei denen die Rueckfrage entfaellt. Leer lassen ist die sichere Wahl --
# delete, external und system fragen sonst bei jeder Aktion nach.
auto_confirm = []
# Ausserhalb dieser Verzeichnisse liest und schreibt JARVIS nicht.
roots = ["~/Documents", "~/Desktop"]
allowed_apps = ["Safari", "Notes", "Reminders", "Calendar"]
# Absolute Pfade. Beliebige Shell-Befehle fuehrt JARVIS nicht aus.
allowed_scripts = []
'''


LAUNCHD_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.jarvis.assistent</string>
  <key>ProgramArguments</key>
  <array>
    <string>{python}</string>
    <string>-m</string>
    <string>jarvis.cli</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <!-- Nach einem Absturz neu starten, aber nicht in einer Schleife:
       ThrottleInterval haelt mindestens 20 s Abstand. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>20</integer>
  <key>WorkingDirectory</key>
  <string>{state_dir}</string>
  <key>StandardOutPath</key>
  <string>{log}</string>
  <key>StandardErrorPath</key>
  <string>{fehler}</string>
  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
"""


def cmd_doctor(args) -> int:
    cfg = _load(args)
    report = doctor.run(cfg)
    print(report.to_json() if args.json else report.to_text())
    # Rueckgabewert 1, wenn etwas fehlt -- fuer Skripte brauchbar.
    return 1 if report.problems else 0


def cmd_config_init(args) -> int:
    ziel = Path(args.path).expanduser() if args.path else DEFAULT_CONFIG_PATH
    if ziel.exists() and not args.force:
        print(f"{ziel} gibt es schon. Mit --force ueberschreiben.", file=sys.stderr)
        return 1
    ziel.parent.mkdir(parents=True, exist_ok=True)
    ziel.write_text(CONFIG_TEMPLATE, "utf-8")
    print(f"Vorlage geschrieben: {ziel}")
    print("Bitte [permissions] roots pruefen -- dort entscheidet sich, "
          "was JARVIS lesen darf.")
    return 0


def cmd_config_show(args) -> int:
    import json
    print(json.dumps(_load(args).to_dict(), indent=2, ensure_ascii=False))
    return 0


def cmd_tasks(args) -> int:
    from .memory.db import Database
    from .tasks.manager import TaskManager

    cfg = _load(args)
    with Database(cfg.db_path) as db:
        tm = TaskManager(db)
        aufgaben = tm.list(open_only=not args.all)
        if not aufgaben:
            print("Keine offenen Aufgaben." if not args.all else "Keine Aufgaben.")
            return 0
        for t in aufgaben:
            print(f"#{t.id:<4} {t.summary()}")
        bericht = tm.status_report()
        if bericht:
            print("\n" + ", ".join(f"{k}: {v}" for k, v in sorted(bericht.items())))
    return 0


def cmd_memory(args) -> int:
    from .memory.db import Database
    from .memory.store import LongTermMemory

    cfg = _load(args)
    with Database(cfg.db_path) as db:
        ltm = LongTermMemory(db)
        if args.forget is not None:
            ltm.forget(args.forget)
            print(f"Fakt {args.forget} geloescht.")
            return 0
        fakten = ltm.all()
        if not fakten:
            print("Das Langzeitgedaechtnis ist leer.")
            return 0
        for f in fakten:
            print(f"#{f.id:<4} {f.as_sentence()}")
    return 0



def cmd_run(args) -> int:
    """Startet JARVIS: Sprache, Dashboard, Hintergrunddienste."""
    from .runtime import AlreadyRunning, JarvisRuntime

    cfg = _load(args)
    runtime = JarvisRuntime(cfg, with_voice=not args.ohne_sprache)
    try:
        runtime.setup()
    except AlreadyRunning as exc:
        print(exc, file=sys.stderr)
        return 3

    if args.ohne_dashboard:
        runtime.run_forever()
        return 0

    try:
        import uvicorn

        from .dashboard.server import create_app
    except ImportError as exc:
        print(f"Das Dashboard braucht fastapi und uvicorn ({exc}).\n"
              "Installieren: pip install 'jarvis[dashboard]'\n"
              "Oder ohne Dashboard starten: jarvis run --ohne-dashboard",
              file=sys.stderr)
        runtime.shutdown()
        return 4

    app = create_app(runtime)
    runtime.start()
    print(f"JARVIS laeuft. Dashboard: http://{cfg.dashboard_host}:{cfg.dashboard_port}")
    try:
        uvicorn.run(app, host=cfg.dashboard_host, port=cfg.dashboard_port,
                    log_level="warning", access_log=False)
    finally:
        runtime.shutdown()
    return 0


def cmd_ask(args) -> int:
    """Eine einzelne Frage ohne Sprache -- zum Pruefen der Modellanbindung."""
    from .runtime import AlreadyRunning, JarvisRuntime

    cfg = _load(args)
    runtime = JarvisRuntime(cfg, with_voice=False)
    try:
        runtime.setup()
    except AlreadyRunning as exc:
        print(exc, file=sys.stderr)
        return 3
    try:
        antwort = runtime.agent.respond(" ".join(args.text))
        if antwort.error:
            print(f"Fehler: {antwort.error}", file=sys.stderr)
        for lauf in antwort.tool_runs:
            zeichen = "+" if lauf.ok else "-"
            print(f"  [{zeichen}] {lauf.tool}: "
                  f"{lauf.verification or lauf.message}", file=sys.stderr)
        print(antwort.text)
        return 1 if antwort.error else 0
    finally:
        runtime.shutdown()


def cmd_install_service(args) -> int:
    """Schreibt eine launchd-Datei, damit JARVIS beim Anmelden startet."""
    import platform

    if platform.system() != "Darwin":
        print("launchd gibt es nur auf macOS.", file=sys.stderr)
        return 2
    cfg = _load(args)
    python = Path(sys.executable).resolve()
    ziel = Path("~/Library/LaunchAgents/com.jarvis.assistent.plist").expanduser()
    inhalt = LAUNCHD_TEMPLATE.format(
        python=python,
        state_dir=cfg.state_dir,
        log=cfg.state_dir / "launchd.log",
        fehler=cfg.state_dir / "launchd-fehler.log",
    )
    if ziel.exists() and not args.force:
        print(f"{ziel} gibt es schon. Mit --force ueberschreiben.", file=sys.stderr)
        return 1
    ziel.parent.mkdir(parents=True, exist_ok=True)
    ziel.write_text(inhalt, "utf-8")
    print(f"Geschrieben: {ziel}\n\n"
          "Aktivieren:\n"
          f"  launchctl load -w {ziel}\n"
          "Beenden:\n"
          f"  launchctl unload {ziel}\n"
          "Zustand:\n"
          "  launchctl list | grep jarvis")
    return 0


def _load(args) -> Config:
    try:
        return Config.load(args.config)
    except ConfigError as exc:
        print(f"Konfigurationsfehler: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="jarvis", description="JARVIS -- persoenlicher Assistent")
    p.add_argument("--version", action="version", version=f"JARVIS {__version__}")
    p.add_argument("-c", "--config", help="Pfad zur Konfiguration")
    sub = p.add_subparsers(dest="befehl", required=True)

    d = sub.add_parser("doctor", help="prueft Hardware, Modelle, Audio, Rechte")
    d.add_argument("--json", action="store_true", help="Ausgabe zum Weitergeben")
    d.set_defaults(func=cmd_doctor)

    ci = sub.add_parser("config-init", help="schreibt eine Konfigurationsvorlage")
    ci.add_argument("path", nargs="?", help="Zielpfad")
    ci.add_argument("--force", action="store_true")
    ci.set_defaults(func=cmd_config_init)

    cs = sub.add_parser("config-show", help="zeigt die geltende Konfiguration")
    cs.set_defaults(func=cmd_config_show)

    t = sub.add_parser("tasks", help="zeigt Aufgaben")
    t.add_argument("--all", action="store_true", help="auch abgeschlossene")
    t.set_defaults(func=cmd_tasks)

    m = sub.add_parser("memory", help="zeigt oder loescht gespeicherte Fakten")
    m.add_argument("--forget", type=int, metavar="ID", help="Fakt endgueltig loeschen")
    m.set_defaults(func=cmd_memory)

    r = sub.add_parser("run", help="startet JARVIS mit Sprache und Dashboard")
    r.add_argument("--ohne-sprache", action="store_true",
                   help="nur Dashboard und Werkzeuge, kein Mikrofon")
    r.add_argument("--ohne-dashboard", action="store_true",
                   help="nur Sprache, keine Oberflaeche")
    r.set_defaults(func=cmd_run)

    a = sub.add_parser("ask", help="eine Frage ohne Sprache stellen")
    a.add_argument("text", nargs="+", help="die Frage")
    a.set_defaults(func=cmd_ask)

    si = sub.add_parser("install-service",
                        help="richtet den Start beim Anmelden ein (launchd)")
    si.add_argument("--force", action="store_true")
    si.set_defaults(func=cmd_install_service)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
