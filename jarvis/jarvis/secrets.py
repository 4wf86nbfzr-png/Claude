"""Zugangsdaten.

Reihenfolge der Quellen: Umgebungsvariable, dann macOS-Schluesselbund. In der
Konfigurationsdatei stehen keine Geheimnisse -- die wird bearbeitet,
weitergegeben und versehentlich eingecheckt.

Gelesene Werte werden gemerkt und an den Protokollfilter weitergegeben, damit
sie nicht in Protokolldateien auftauchen.
"""

from __future__ import annotations

import os
import platform
import subprocess

from .logging_setup import get_logger

log = get_logger("secrets")

#: Dienstname im Schluesselbund.
SERVICE = "jarvis"

#: Was bisher gelesen wurde -- fuer den Protokollfilter.
_seen: set[str] = set()


class SecretMissing(LookupError):
    """Das Geheimnis ist nicht hinterlegt. Nennt, wie man es hinterlegt."""

    def __init__(self, name: str) -> None:
        super().__init__(
            f"'{name}' ist nicht hinterlegt. Entweder als Umgebungsvariable "
            f"JARVIS_{name.upper()} setzen oder in den Schluesselbund legen:\n"
            f"  security add-generic-password -s {SERVICE} -a {name} -w"
        )
        self.name = name


def env_name(name: str) -> str:
    return f"JARVIS_{name.upper().replace('-', '_')}"


def get(name: str, *, required: bool = False) -> str | None:
    """Holt ein Geheimnis. ``required=True`` wirft ``SecretMissing``."""
    wert = os.environ.get(env_name(name))
    if wert:
        return _remember(wert)
    wert = _from_keychain(name)
    if wert:
        return _remember(wert)
    if required:
        raise SecretMissing(name)
    return None


def set_(name: str, value: str) -> bool:
    """Legt ein Geheimnis in den Schluesselbund. Nur auf macOS."""
    if platform.system() != "Darwin":
        log.warning("Schluesselbund gibt es nur auf macOS; '%s' nicht gespeichert.", name)
        return False
    try:
        subprocess.run(
            ["security", "add-generic-password", "-U", "-s", SERVICE, "-a", name,
             "-w", value],
            capture_output=True, text=True, timeout=10, check=True,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired,
            FileNotFoundError, OSError) as exc:
        log.error("Konnte '%s' nicht im Schluesselbund ablegen: %s", name, exc)
        return False
    _remember(value)
    return True


def delete(name: str) -> bool:
    if platform.system() != "Darwin":
        return False
    try:
        subprocess.run(
            ["security", "delete-generic-password", "-s", SERVICE, "-a", name],
            capture_output=True, text=True, timeout=10, check=True)
        return True
    except Exception:  # noqa: BLE001
        return False


def _from_keychain(name: str) -> str | None:
    if platform.system() != "Darwin":
        return None
    try:
        proc = subprocess.run(
            ["security", "find-generic-password", "-s", SERVICE, "-a", name, "-w"],
            capture_output=True, text=True, timeout=10, check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        log.debug("Schluesselbund nicht erreichbar: %s", exc)
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout.strip() or None


def _remember(value: str) -> str:
    if len(value) >= 6:
        _seen.add(value)
    return value


def known() -> list[str]:
    """Alle bisher gelesenen Geheimnisse -- fuer ``logging_setup.setup``."""
    return sorted(_seen)
