"""Zentrale Fehlertypen fuer Jarvis.

Grundregel: Fehler, die der Nutzer beheben kann (fehlende Zugangsdaten,
nicht erreichbares Modell), sind `JarvisError` mit einer verstaendlichen
deutschen Meldung. Alles andere ist ein Programmfehler und darf
durchschlagen, damit es im Log sichtbar wird.
"""

from __future__ import annotations


class JarvisError(Exception):
    """Fehler mit einer Meldung, die man dem Nutzer zeigen kann."""

    #: Kurzer, maschinenlesbarer Code (fuer Logs und Dashboard).
    code = "fehler"

    def __init__(self, message: str, *, hint: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.hint = hint

    def user_text(self) -> str:
        if self.hint:
            return f"{self.message}\n\n{self.hint}"
        return self.message


class ConfigError(JarvisError):
    """Eine Einstellung fehlt oder ist unbrauchbar."""

    code = "konfiguration"


class CredentialsMissing(JarvisError):
    """Ein Zugang ist noch nicht hinterlegt."""

    code = "zugangsdaten"


class ModelUnavailable(JarvisError):
    """Das Sprachmodell antwortet nicht."""

    code = "modell"


class PermissionDenied(JarvisError):
    """Die Aktion braucht eine Freigabe, die nicht vorliegt."""

    code = "berechtigung"


class ExternalServiceError(JarvisError):
    """Ein externer Dienst hat einen Fehler gemeldet."""

    code = "externer_dienst"


class ToolError(JarvisError):
    """Ein Werkzeug konnte den Auftrag nicht ausfuehren."""

    code = "werkzeug"


class NotConfirmed(JarvisError):
    """Eine bestaetigungspflichtige Aktion wurde nicht bestaetigt."""

    code = "unbestaetigt"
