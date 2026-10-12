"""Eingehende Nachrichten aus Messengern.

Jarvis liest WhatsApp nicht selbst -- er bekommt Nachrichten aus einer
*Quelle*. Das ist bewusst getrennt, weil es mehrere Wege gibt und jeder
seine Haken hat:

* ``MacMitteilungen`` liest die Mitteilungen mit, die WhatsApp Desktop auf
  dem Mac anzeigt. Rein lokal, kein Zugriff auf WhatsApp selbst, kein
  Risiko fuer die Nummer -- dafuer nur das, was in der Mitteilung steht.
* ``Bruecke`` nimmt Nachrichten ueber den HTTP-Dienst entgegen. Damit laesst
  sich jede Anbindung andocken (offizielle WhatsApp-Business-API, ein
  eigener Dienst, ein anderer Messenger), ohne Jarvis zu aendern.

Beide liefern ``Nachricht``. Was danach passiert -- einstufen, melden,
anrufen -- steht in ``core.triage`` und ist von der Quelle unabhaengig.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(slots=True)
class Nachricht:
    """Eine eingegangene Nachricht, unabhaengig vom Kanal."""

    extern_id: str
    absender: str
    text: str
    empfangen_am: datetime
    kanal: str = "whatsapp"
    quelle: str = ""
    gruppe: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    def zeile(self) -> str:
        wer = self.absender or "Unbekannt"
        if self.gruppe:
            wer = f"{wer} in {self.gruppe}"
        auszug = " ".join(self.text.split())[:160]
        return f"{wer}: {auszug}"


class NachrichtenQuelle:
    """Basis aller Quellen."""

    name = "basis"

    async def neue(self, limit: int = 50) -> list[Nachricht]:
        """Liefert Nachrichten, die seit dem letzten Abruf dazugekommen sind."""
        raise NotImplementedError

    async def health(self) -> tuple[bool, str]:
        raise NotImplementedError

    async def close(self) -> None:
        return None
