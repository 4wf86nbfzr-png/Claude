"""macOS-Werkzeuge ueber AppleScript und kleine Systembefehle.

Bewusst AppleScript und `open` statt Bildschirmsteuerung: ein Klick auf eine
Koordinate bricht, sobald sich ein Fenster verschiebt, und laesst sich nicht
pruefen. AppleScript gibt einen Rueckgabewert -- daraus entsteht ein echter
Pruefvermerk.

Auf anderen Systemen werden dieselben Werkzeuge mit ``unavailable_reason``
angemeldet. Sie erscheinen dann nicht in ``registry.available()``, das Modell
sieht sie nicht, und ein direkter Aufruf nennt den Grund.

**Nicht auf macOS getestet** -- die AppleScript-Texte sind geschrieben, aber in
der Entwicklungsumgebung (Linux) nicht ausfuehrbar. Siehe README.
"""

from __future__ import annotations

import platform
import shutil
import subprocess

from ..logging_setup import get_logger
from ..permissions import Policy, Scope
from .registry import Param, Tool, ToolResult

log = get_logger("tools.mac")

IS_MACOS = platform.system() == "Darwin"
NICHT_MACOS = "nur auf macOS verfuegbar"

#: AppleScript darf nicht beliebig lange haengen -- ein Dialog in einer App
#: wuerde JARVIS sonst blockieren.
SCRIPT_TIMEOUT = 20.0


class AppleScriptError(RuntimeError):
    pass


def run_applescript(script: str, timeout: float = SCRIPT_TIMEOUT) -> str:
    """Fuehrt AppleScript aus und gibt die Ausgabe zurueck.

    Das Skript wird ueber die Standardeingabe uebergeben, nicht als Argument:
    so gibt es kein Laengenproblem und keine Shell dazwischen.
    """
    if not IS_MACOS:
        raise AppleScriptError(NICHT_MACOS)
    if shutil.which("osascript") is None:
        raise AppleScriptError("osascript nicht gefunden.")
    try:
        proc = subprocess.run(["osascript", "-"], input=script, capture_output=True,
                              text=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise AppleScriptError(
            f"AppleScript hat nach {timeout:.0f}s nicht geantwortet. "
            "Wartet die App auf eine Eingabe?") from exc
    except OSError as exc:
        raise AppleScriptError(str(exc)) from exc
    if proc.returncode != 0:
        fehler = (proc.stderr or "").strip()
        if "-1743" in fehler or "not allowed" in fehler.lower():
            raise AppleScriptError(
                "macOS hat die Steuerung verweigert. Unter Systemeinstellungen > "
                "Datenschutz & Sicherheit > Automation muss das Terminal (oder die "
                "App, die JARVIS startet) die App steuern duerfen."
            )
        raise AppleScriptError(fehler or f"osascript endete mit {proc.returncode}")
    return proc.stdout.strip()


def quote(text: str) -> str:
    """Setzt Text als AppleScript-String.

    AppleScript maskiert innerhalb von Strings mit Backslash: ``\\t`` waere ein
    Tabulator, ``\\"`` ein Anfuehrungszeichen. Backslashes werden deshalb
    entfernt (Verlust eines Zeichens ist hinnehmbar, ein Ausbruch nicht), und
    ein Anfuehrungszeichen wird zur Verkettung mit dem AppleScript-Begriff
    ``quote``. Damit landet Nutzertext immer *innerhalb* eines String-Literals
    und kann das Skript nicht verlassen.
    """
    sicher = text.replace("\\", "")
    teile = sicher.split('"')
    if len(teile) == 1:
        return f'"{sicher}"'
    return " & quote & ".join(f'"{t}"' for t in teile)


def register(registry, policy: Policy) -> None:
    """Meldet die macOS-Werkzeuge an."""
    grund = None if IS_MACOS else NICHT_MACOS

    # -- Programme ------------------------------------------------------
    def _app_open(name: str) -> ToolResult:
        policy.check_app(name)
        try:
            run_applescript(f'tell application {quote(name)} to activate')
            laeuft = run_applescript(
                f'tell application "System Events" to '
                f'(name of processes) contains {quote(name)}')
        except AppleScriptError as exc:
            return ToolResult(ok=False, message=str(exc))
        if laeuft != "true":
            return ToolResult(ok=False,
                              message=f"{name} wurde gestartet, laeuft aber nicht.")
        return ToolResult(ok=True, value=f"{name} laeuft",
                          verification=f"Prozessliste enthaelt {name}")

    def _app_quit(name: str) -> ToolResult:
        policy.check_app(name)
        try:
            run_applescript(f'tell application {quote(name)} to quit')
            laeuft = run_applescript(
                f'tell application "System Events" to '
                f'(name of processes) contains {quote(name)}')
        except AppleScriptError as exc:
            return ToolResult(ok=False, message=str(exc))
        if laeuft == "true":
            return ToolResult(ok=False, message=f"{name} laeuft noch -- "
                                                "vielleicht ein unges. Dokument offen?")
        return ToolResult(ok=True, value=f"{name} beendet",
                          verification=f"Prozessliste enthaelt {name} nicht mehr")

    def _apps_running() -> ToolResult:
        try:
            ausgabe = run_applescript(
                'tell application "System Events" to get name of '
                '(every process whose background only is false)')
        except AppleScriptError as exc:
            return ToolResult(ok=False, message=str(exc))
        return ToolResult(ok=True, value=ausgabe, verification="Prozessliste abgefragt")

    # -- Dateien im Finder ----------------------------------------------
    def _reveal(pfad: str) -> ToolResult:
        ziel = policy.check_path(pfad, Scope.READ)
        if not ziel.exists():
            return ToolResult(ok=False, message=f"{ziel} gibt es nicht.")
        try:
            subprocess.run(["open", "-R", str(ziel)], capture_output=True,
                           timeout=10, check=True)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired,
                FileNotFoundError, OSError) as exc:
            return ToolResult(ok=False, message=f"Finder liess sich nicht oeffnen: {exc}")
        return ToolResult(ok=True, value=str(ziel),
                          verification=f"open -R {ziel} ohne Fehler")

    def _open_file(pfad: str) -> ToolResult:
        ziel = policy.check_path(pfad, Scope.READ)
        if not ziel.exists():
            return ToolResult(ok=False, message=f"{ziel} gibt es nicht.")
        try:
            subprocess.run(["open", str(ziel)], capture_output=True,
                           timeout=10, check=True)
        except Exception as exc:  # noqa: BLE001
            return ToolResult(ok=False, message=f"{ziel} liess sich nicht oeffnen: {exc}")
        return ToolResult(ok=True, value=str(ziel), verification=f"open {ziel} ohne Fehler")

    # -- Notizen --------------------------------------------------------
    def _note_create(titel: str, inhalt: str) -> ToolResult:
        # Notes erwartet HTML im body; Zeilenumbrueche sonst verloren.
        koerper = inhalt.replace("&", "&amp;").replace("<", "&lt;").replace("\n", "<br>")
        script = (
            'tell application "Notes"\n'
            f'  set neu to make new note at folder "Notes" with properties '
            f'{{name:{quote(titel)}, body:{quote(koerper)}}}\n'
            '  return id of neu\n'
            'end tell'
        )
        try:
            kennung = run_applescript(script)
        except AppleScriptError as exc:
            return ToolResult(ok=False, message=str(exc))
        if not kennung:
            return ToolResult(ok=False, message="Notes hat keine Kennung zurueckgegeben.")
        return ToolResult(ok=True, value=kennung,
                          verification=f"Notiz angelegt, Kennung {kennung}")

    def _note_search(text: str) -> ToolResult:
        script = (
            'tell application "Notes"\n'
            f'  set treffer to every note whose name contains {quote(text)}\n'
            '  set namen to {}\n'
            '  repeat with n in treffer\n'
            '    set end of namen to name of n\n'
            '  end repeat\n'
            '  return namen\n'
            'end tell'
        )
        try:
            ausgabe = run_applescript(script)
        except AppleScriptError as exc:
            return ToolResult(ok=False, message=str(exc))
        return ToolResult(ok=True, value=ausgabe or "(nichts gefunden)",
                          verification=f"Notes nach '{text}' durchsucht")

    def _note_read(titel: str) -> ToolResult:
        script = (
            'tell application "Notes"\n'
            f'  set treffer to every note whose name is {quote(titel)}\n'
            '  if (count of treffer) is 0 then return "NICHT_GEFUNDEN"\n'
            '  return plaintext of item 1 of treffer\n'
            'end tell'
        )
        try:
            ausgabe = run_applescript(script)
        except AppleScriptError as exc:
            return ToolResult(ok=False, message=str(exc))
        if ausgabe == "NICHT_GEFUNDEN":
            return ToolResult(ok=False, message=f"Keine Notiz mit dem Titel '{titel}'.")
        return ToolResult(ok=True, value=ausgabe, verification=f"Notiz '{titel}' gelesen")

    # -- Erinnerungen ---------------------------------------------------
    def _reminder_create(titel: str, notiz: str = "") -> ToolResult:
        eigenschaften = f"{{name:{quote(titel)}"
        if notiz:
            eigenschaften += f", body:{quote(notiz)}"
        eigenschaften += "}"
        script = (
            'tell application "Reminders"\n'
            f'  set neu to make new reminder with properties {eigenschaften}\n'
            '  return id of neu\n'
            'end tell'
        )
        try:
            kennung = run_applescript(script)
        except AppleScriptError as exc:
            return ToolResult(ok=False, message=str(exc))
        return ToolResult(ok=True, value=kennung,
                          verification=f"Erinnerung angelegt, Kennung {kennung}")

    def _reminders_open() -> ToolResult:
        script = (
            'tell application "Reminders"\n'
            '  set offen to every reminder whose completed is false\n'
            '  set namen to {}\n'
            '  repeat with r in offen\n'
            '    set end of namen to name of r\n'
            '  end repeat\n'
            '  return namen\n'
            'end tell'
        )
        try:
            ausgabe = run_applescript(script)
        except AppleScriptError as exc:
            return ToolResult(ok=False, message=str(exc))
        return ToolResult(ok=True, value=ausgabe or "(keine offenen Erinnerungen)",
                          verification="Reminders abgefragt")

    # -- Kalender -------------------------------------------------------
    def _calendar_today() -> ToolResult:
        script = (
            'set heute to current date\n'
            'set stunde of heute to 0\n'
            'set minutes of heute to 0\n'
            'set seconds of heute to 0\n'
            'set morgen to heute + (1 * days)\n'
            'tell application "Calendar"\n'
            '  set zeilen to {}\n'
            '  repeat with k in calendars\n'
            '    repeat with e in (every event of k whose start date '
            '      is greater than or equal to heute and start date is less than morgen)\n'
            '      set end of zeilen to (summary of e) & " um " & '
            '        (time string of (start date of e))\n'
            '    end repeat\n'
            '  end repeat\n'
            '  return zeilen\n'
            'end tell'
        )
        try:
            ausgabe = run_applescript(script, timeout=40.0)
        except AppleScriptError as exc:
            return ToolResult(ok=False, message=str(exc))
        return ToolResult(ok=True, value=ausgabe or "(heute nichts im Kalender)",
                          verification="Kalender fuer heute abgefragt")

    # -- Browser --------------------------------------------------------
    def _open_url(url: str) -> ToolResult:
        if not url.startswith(("http://", "https://")):
            return ToolResult(ok=False,
                              message="Ich oeffne nur http- und https-Adressen.")
        try:
            subprocess.run(["open", url], capture_output=True, timeout=10, check=True)
        except Exception as exc:  # noqa: BLE001
            return ToolResult(ok=False, message=f"{url} liess sich nicht oeffnen: {exc}")
        return ToolResult(ok=True, value=url, verification=f"open {url} ohne Fehler")

    # -- E-Mail (Entwurf, kein Versand) ---------------------------------
    def _mail_draft(an: str, betreff: str, text: str) -> ToolResult:
        """Legt einen Entwurf an und oeffnet ihn -- verschickt wird nichts.

        Absichtlich: der Versand bleibt beim Nutzer. JARVIS schreibt vor, der
        letzte Klick gehoert dem Menschen.
        """
        script = (
            'tell application "Mail"\n'
            f'  set entwurf to make new outgoing message with properties '
            f'{{subject:{quote(betreff)}, content:{quote(text)}, visible:true}}\n'
            '  tell entwurf\n'
            f'    make new to recipient at end of to recipients '
            f'with properties {{address:{quote(an)}}}\n'
            '  end tell\n'
            '  activate\n'
            '  return "ENTWURF_OFFEN"\n'
            'end tell'
        )
        try:
            ausgabe = run_applescript(script)
        except AppleScriptError as exc:
            return ToolResult(ok=False, message=str(exc))
        if ausgabe != "ENTWURF_OFFEN":
            return ToolResult(ok=False, message=f"Mail antwortete unerwartet: {ausgabe}")
        return ToolResult(
            ok=True, value=f"Entwurf an {an}",
            verification="Entwurf in Mail geoeffnet, nicht verschickt -- "
                         "das Absenden bleibt bei dir")

    # -- Systemzustand --------------------------------------------------
    def _battery() -> ToolResult:
        try:
            proc = subprocess.run(["pmset", "-g", "batt"], capture_output=True,
                                  text=True, timeout=8, check=False)
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
            return ToolResult(ok=False, message=f"pmset nicht abfragbar: {exc}")
        if proc.returncode != 0:
            return ToolResult(ok=False, message=(proc.stderr or "").strip())
        return ToolResult(ok=True, value=proc.stdout.strip(),
                          verification="pmset -g batt abgefragt")

    def _notify(titel: str, text: str) -> ToolResult:
        """Mitteilung ins Benachrichtigungszentrum -- fuer Ruhezeiten, wenn
        JARVIS nicht sprechen soll."""
        script = (f'display notification {quote(text)} with title {quote(titel)}')
        try:
            run_applescript(script)
        except AppleScriptError as exc:
            return ToolResult(ok=False, message=str(exc))
        return ToolResult(ok=True, value=titel,
                          verification="Mitteilung an das Benachrichtigungszentrum")

    def _script_run(pfad: str) -> ToolResult:
        """Fuehrt ein ausdruecklich freigegebenes Skript aus."""
        ziel = policy.check_script(pfad)
        if not ziel.exists():
            return ToolResult(ok=False, message=f"{ziel} gibt es nicht.")
        try:
            proc = subprocess.run([str(ziel)], capture_output=True, text=True,
                                  timeout=120, check=False)
        except (subprocess.TimeoutExpired, OSError) as exc:
            return ToolResult(ok=False, message=f"{ziel}: {exc}")
        ausgabe = (proc.stdout or "").strip()[:4000]
        if proc.returncode != 0:
            return ToolResult(ok=False,
                              message=f"{ziel.name} endete mit {proc.returncode}: "
                                      f"{(proc.stderr or '').strip()[:500]}")
        return ToolResult(ok=True, value=ausgabe or "(keine Ausgabe)",
                          verification=f"{ziel.name} endete mit Rueckgabewert 0")

    werkzeuge = [
        ("programm_oeffnen", "Startet ein freigegebenes Programm.",
         Scope.APP_CONTROL, {"name": Param(str, description="App-Name, z.B. Safari")},
         _app_open),
        ("programm_beenden", "Beendet ein freigegebenes Programm.",
         Scope.APP_CONTROL, {"name": Param(str)}, _app_quit),
        ("programme_auflisten", "Nennt die laufenden Programme.",
         Scope.READ, {}, _apps_running),
        ("im_finder_zeigen", "Zeigt eine Datei im Finder.",
         Scope.READ, {"pfad": Param(str)}, _reveal),
        ("datei_oeffnen", "Oeffnet eine Datei mit dem Standardprogramm.",
         Scope.READ, {"pfad": Param(str)}, _open_file),
        ("notiz_anlegen", "Legt eine Notiz in der Notizen-App an.",
         Scope.CREATE, {"titel": Param(str), "inhalt": Param(str)}, _note_create),
        ("notiz_suchen", "Sucht Notizen nach einem Begriff im Titel.",
         Scope.READ, {"text": Param(str)}, _note_search),
        ("notiz_lesen", "Liest eine Notiz anhand ihres Titels.",
         Scope.READ, {"titel": Param(str)}, _note_read),
        ("erinnerung_anlegen", "Legt eine Erinnerung an.",
         Scope.CREATE, {"titel": Param(str),
                        "notiz": Param(str, required=False, default="")},
         _reminder_create),
        ("erinnerungen_offen", "Nennt die offenen Erinnerungen.",
         Scope.READ, {}, _reminders_open),
        ("kalender_heute", "Nennt die heutigen Termine.",
         Scope.READ, {}, _calendar_today),
        ("adresse_oeffnen", "Oeffnet eine Internetadresse im Browser.",
         Scope.APP_CONTROL, {"url": Param(str)}, _open_url),
        ("mail_entwurf", "Legt einen E-Mail-Entwurf an und oeffnet ihn. "
                         "Verschickt wird nichts.",
         Scope.CREATE, {"an": Param(str), "betreff": Param(str), "text": Param(str)},
         _mail_draft),
        ("akku", "Ladezustand und Netzbetrieb.", Scope.READ, {}, _battery),
        ("mitteilung_zeigen", "Zeigt eine Mitteilung auf dem Bildschirm.",
         Scope.CREATE, {"titel": Param(str), "text": Param(str)}, _notify),
        ("skript_ausfuehren", "Fuehrt ein freigegebenes Skript aus.",
         Scope.SYSTEM, {"pfad": Param(str)}, _script_run),
    ]

    for name, beschreibung, scope, params, funktion in werkzeuge:
        if not policy.allows(scope):
            continue
        registry.add(Tool(name=name, description=beschreibung, scope=scope,
                          params=params, func=funktion,
                          unavailable_reason=grund))
