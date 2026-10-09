"""Tests fuer Berechtigungen und Werkzeugausfuehrung."""

from pathlib import Path

import pytest

from jarvis.permissions import (
    ConfirmationRequired, PermissionDenied, Policy, Scope,
)
from jarvis.tools.registry import (
    ArgumentError, Param, ToolNotAvailable, ToolRegistry, ToolResult,
)


def policy(**kw) -> Policy:
    kw.setdefault("granted", frozenset({Scope.READ}))
    return Policy(**kw)


# -- Richtlinie ---------------------------------------------------------
def test_stufen_sind_nicht_hierarchisch():
    p = policy(granted=frozenset({Scope.READ}))
    assert p.allows(Scope.READ)
    assert not p.allows(Scope.DELETE)
    with pytest.raises(PermissionDenied, match="delete"):
        p.require(Scope.DELETE, "Datei loeschen")


def test_loeschen_braucht_bestaetigung():
    p = policy(granted=frozenset({Scope.DELETE}))
    with pytest.raises(ConfirmationRequired) as exc:
        p.require(Scope.DELETE, "alte Datei loeschen")
    assert exc.value.scope is Scope.DELETE
    # Mit ausdruecklicher Zustimmung laeuft dieselbe Aktion durch.
    p.require(Scope.DELETE, "alte Datei loeschen", confirmed=True)


def test_auto_confirm_hebt_rueckfrage_auf():
    p = policy(granted=frozenset({Scope.DELETE}), auto_confirm=frozenset({Scope.DELETE}))
    p.require(Scope.DELETE, "Papierkorb leeren")


def test_externer_versand_braucht_bestaetigung():
    p = policy(granted=frozenset({Scope.EXTERNAL}))
    with pytest.raises(ConfirmationRequired):
        p.require(Scope.EXTERNAL, "Mail an Kunden senden")


def test_richtlinie_ist_unveraenderlich():
    p = policy()
    with pytest.raises(Exception):
        p.granted = frozenset({Scope.SYSTEM})  # type: ignore[misc]


# -- Dateizugriff -------------------------------------------------------
def test_pfad_innerhalb_der_wurzel(tmp_path):
    p = policy(roots=(tmp_path.resolve(),))
    ziel = tmp_path / "unterordner" / "notiz.md"
    assert p.check_path(ziel, Scope.READ) == ziel.resolve()


def test_pfad_ausserhalb_wird_abgelehnt(tmp_path):
    p = policy(roots=((tmp_path / "erlaubt").resolve(),))
    (tmp_path / "erlaubt").mkdir()
    with pytest.raises(PermissionDenied, match="ausserhalb"):
        p.check_path(tmp_path / "geheim.txt", Scope.READ)


def test_punkt_punkt_fuehrt_nicht_heraus(tmp_path):
    """Klassischer Ausbruchsversuch -- resolve() muss ihn abfangen."""
    erlaubt = (tmp_path / "erlaubt")
    erlaubt.mkdir()
    p = policy(roots=(erlaubt.resolve(),))
    with pytest.raises(PermissionDenied):
        p.check_path(erlaubt / ".." / "geheim.txt", Scope.READ)


def test_ohne_freigegebene_wurzel_kein_dateizugriff():
    with pytest.raises(PermissionDenied, match="kein Verzeichnis freigegeben"):
        policy().check_path("/etc/passwd", Scope.READ)


def test_beliebige_skripte_sind_gesperrt(tmp_path):
    erlaubt = tmp_path / "backup.sh"
    erlaubt.touch()
    p = policy(allowed_scripts=(erlaubt.resolve(),))
    assert p.check_script(erlaubt) == erlaubt.resolve()
    with pytest.raises(PermissionDenied, match="nicht als ausfuehrbares Skript"):
        p.check_script(tmp_path / "fremd.sh")


def test_programme_nur_nach_muster():
    p = policy(allowed_apps=("Safari", "Notes", "Visual Studio *"))
    assert p.check_app("Visual Studio Code") == "Visual Studio Code"
    with pytest.raises(PermissionDenied):
        p.check_app("Terminal")


# -- Werkzeuge ----------------------------------------------------------
@pytest.fixture()
def registry():
    reg = ToolRegistry(policy(granted=frozenset({Scope.READ, Scope.DELETE})))

    @reg.register("zeit_lesen", "Gibt eine Zahl zurueck", Scope.READ,
                  {"faktor": Param(int, description="Multiplikator")})
    def _zeit(faktor: int) -> ToolResult:
        return ToolResult(ok=True, value=faktor * 2, verification=f"{faktor}*2 berechnet")

    @reg.register("kaputt", "Wirft immer", Scope.READ)
    def _kaputt() -> ToolResult:
        raise RuntimeError("Festplatte voll")

    @reg.register("nur_mac", "Braucht macOS", Scope.SYSTEM,
                  unavailable_reason="nur auf macOS verfuegbar")
    def _mac() -> ToolResult:
        return ToolResult(ok=True)

    return reg


def test_unbekanntes_werkzeug_nennt_was_es_gibt(registry):
    """JARVIS erfindet kein Ergebnis, sondern sagt, was fehlt."""
    with pytest.raises(ToolNotAvailable, match="habe ich nicht"):
        registry.call("mail_senden")


def test_nicht_einsatzbereites_werkzeug_nennt_grund(registry):
    with pytest.raises(ToolNotAvailable, match="nur auf macOS"):
        registry.call("nur_mac")


def test_nicht_einsatzbereite_werkzeuge_werden_nicht_angeboten(registry):
    names = {t.name for t in registry.available()}
    assert "nur_mac" not in names
    assert "zeit_lesen" in names


def test_fehlendes_argument(registry):
    with pytest.raises(ArgumentError, match="'faktor' fehlt"):
        registry.call("zeit_lesen", {})


def test_falscher_argumenttyp(registry):
    with pytest.raises(ArgumentError, match="muss int sein"):
        registry.call("zeit_lesen", {"faktor": "drei"})


def test_unbekanntes_argument(registry):
    with pytest.raises(ArgumentError, match="unbekannte Argumente"):
        registry.call("zeit_lesen", {"faktor": 2, "tempo": 9})


def test_erfolgreicher_aufruf_liefert_pruefvermerk(registry):
    res = registry.call("zeit_lesen", {"faktor": 21})
    assert res.ok and res.value == 42
    assert res.verification


def test_werkzeugfehler_schiesst_jarvis_nicht_ab(registry):
    res = registry.call("kaputt")
    assert not res.ok
    assert "Festplatte voll" in res.message


def test_argumentfehler_kommt_vor_der_rueckfrage():
    """Ein falsch verstandener Aufruf soll nicht als Freigabefrage erscheinen."""
    reg = ToolRegistry(policy(granted=frozenset({Scope.DELETE})))

    @reg.register("loeschen", "Loescht etwas", Scope.DELETE, {"pfad": Param(str)})
    def _del(pfad: str) -> ToolResult:
        return ToolResult(ok=True)

    with pytest.raises(ArgumentError):
        reg.call("loeschen", {})
    with pytest.raises(ConfirmationRequired):
        reg.call("loeschen", {"pfad": "/tmp/x"})
