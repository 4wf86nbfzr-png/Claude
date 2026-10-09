"""Tests der macOS-Werkzeuge.

Die AppleScript-Ausfuehrung selbst kann hier nicht laufen. Was geprueft wird:
die Abschottung von Nutzertext (AppleScript-Maskierung), die ehrliche
Nichtverfuegbarkeit und die Anmeldung nach Berechtigung.
"""

import platform

import pytest

from jarvis.permissions import Policy, Scope
from jarvis.tools import mac
from jarvis.tools.registry import ToolNotAvailable, ToolRegistry

MACOS = platform.system() == "Darwin"


def registry(tmp_path):
    policy = Policy(granted=frozenset(Scope), roots=(tmp_path.resolve(),),
                    allowed_apps=("Safari", "Notes"), auto_confirm=frozenset(Scope))
    reg = ToolRegistry(policy)
    mac.register(reg, policy)
    return reg


# -- AppleScript-Maskierung ---------------------------------------------
def test_einfacher_text():
    assert mac.quote("Hallo Welt") == '"Hallo Welt"'


def test_anfuehrungszeichen_wird_verkettet():
    """AppleScript kennt kein \\" -- daher Verkettung mit dem Begriff quote."""
    ergebnis = mac.quote('Er sagte "Moin"')
    assert '\\"' not in ergebnis
    assert ergebnis == '"Er sagte " & quote & "Moin" & quote & ""'


def test_backslash_wird_entfernt():
    """In AppleScript-Strings maskiert ein Backslash -- '\\t' waere ein Tabulator."""
    assert "\\" not in mac.quote("Pfad C:\\temp")


def test_ausbruchsversuch_bleibt_text():
    """Der Kern: Nutzertext darf das String-Literal nicht verlassen."""
    boesartig = 'x" & (do shell script "rm -rf ~") & "'
    ergebnis = mac.quote(boesartig)
    # Jedes Zeichen landet in einem String-Literal oder ist der Begriff 'quote'.
    # Es entsteht kein ausfuehrbarer Klammerausdruck ausserhalb der Literale.
    teile = ergebnis.split(" & quote & ")
    assert all(t.startswith('"') and t.endswith('"') for t in teile), ergebnis
    # Und der gefaehrliche Teil steckt in einem Literal.
    assert '"rm -rf ~"' in ergebnis


def test_zeilenumbruch_bleibt_im_literal():
    ergebnis = mac.quote("Zeile1\nZeile2")
    assert ergebnis.startswith('"') and ergebnis.endswith('"')


# -- Ehrliche Nichtverfuegbarkeit ---------------------------------------
@pytest.mark.skipif(MACOS, reason="laeuft auf macOS wirklich")
def test_auf_linux_nicht_einsatzbereit(tmp_path):
    reg = registry(tmp_path)
    with pytest.raises(ToolNotAvailable, match="nur auf macOS"):
        reg.call("notiz_anlegen", {"titel": "x", "inhalt": "y"})


@pytest.mark.skipif(MACOS, reason="laeuft auf macOS wirklich")
def test_nicht_einsatzbereite_werkzeuge_werden_nicht_angeboten(tmp_path):
    reg = registry(tmp_path)
    angeboten = {t.name for t in reg.available()}
    assert "notiz_anlegen" not in angeboten
    # Angemeldet sind sie trotzdem -- damit der Grund genannt werden kann.
    assert "notiz_anlegen" in {t.name for t in reg.all()}


@pytest.mark.skipif(MACOS, reason="laeuft auf macOS wirklich")
def test_applescript_wirft_mit_grund():
    with pytest.raises(mac.AppleScriptError, match="nur auf macOS"):
        mac.run_applescript('return "x"')


# -- Anmeldung und Freigaben --------------------------------------------
def test_alle_erwarteten_werkzeuge_sind_angemeldet(tmp_path):
    namen = {t.name for t in registry(tmp_path).all()}
    erwartet = {"programm_oeffnen", "programm_beenden", "notiz_anlegen",
                "notiz_lesen", "erinnerung_anlegen", "kalender_heute",
                "adresse_oeffnen", "mail_entwurf", "akku", "skript_ausfuehren"}
    assert erwartet <= namen


def test_ohne_app_control_keine_programmsteuerung(tmp_path):
    policy = Policy(granted=frozenset({Scope.READ}), roots=(tmp_path.resolve(),))
    reg = ToolRegistry(policy)
    mac.register(reg, policy)
    namen = {t.name for t in reg.all()}
    assert "programm_oeffnen" not in namen
    assert "programme_auflisten" in namen  # das ist nur Lesen


def test_mail_verschickt_nichts(tmp_path):
    """Der letzte Klick beim Versand gehoert dem Menschen."""
    werkzeug = [t for t in registry(tmp_path).all() if t.name == "mail_entwurf"][0]
    assert "Verschickt wird nichts" in werkzeug.description
    # Und es laeuft unter CREATE, nicht unter EXTERNAL -- es geht nichts raus.
    assert werkzeug.scope is Scope.CREATE


def test_nicht_freigegebenes_programm_wird_abgelehnt(tmp_path):
    from jarvis.permissions import PermissionDenied
    reg = registry(tmp_path)
    werkzeug = [t for t in reg.all() if t.name == "programm_oeffnen"][0]
    with pytest.raises(PermissionDenied, match="nicht in der Liste"):
        werkzeug.func(name="Terminal")


def test_nur_http_adressen(tmp_path):
    werkzeug = [t for t in registry(tmp_path).all() if t.name == "adresse_oeffnen"][0]
    res = werkzeug.func(url="file:///etc/passwd")
    assert not res.ok and "http" in res.message


def test_nicht_freigegebenes_skript_wird_abgelehnt(tmp_path):
    from jarvis.permissions import PermissionDenied
    werkzeug = [t for t in registry(tmp_path).all()
                if t.name == "skript_ausfuehren"][0]
    with pytest.raises(PermissionDenied, match="nicht als ausfuehrbares Skript"):
        werkzeug.func(pfad=str(tmp_path / "fremd.sh"))
