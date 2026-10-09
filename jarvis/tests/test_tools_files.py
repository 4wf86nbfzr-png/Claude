"""Tests der Dateiwerkzeuge -- plattformunabhaengig und damit hier echt pruefbar."""

import pytest

from jarvis.permissions import Policy, Scope
from jarvis.tools import files
from jarvis.tools.registry import ToolRegistry


@pytest.fixture()
def werkstatt(tmp_path):
    """Ein freigegebener Ordner mit etwas Inhalt."""
    (tmp_path / "notizen.md").write_text("Moin\nDresscode schwarz\n", "utf-8")
    (tmp_path / "bild.png").write_bytes(b"\x89PNG\x00\x01")
    unter = tmp_path / "projekte"
    unter.mkdir()
    (unter / "angebot-halle45.txt").write_text("Gastro, 12 Leute\n", "utf-8")
    (tmp_path / ".versteckt").write_text("x", "utf-8")
    policy = Policy(granted=frozenset(Scope), roots=(tmp_path.resolve(),),
                    auto_confirm=frozenset({Scope.DELETE}))
    reg = ToolRegistry(policy)
    files.register(reg, policy)
    return reg, tmp_path


# -- Lesen --------------------------------------------------------------
def test_datei_lesen(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("datei_lesen", {"pfad": str(tmp / "notizen.md")})
    assert res.ok and "Dresscode" in res.value
    assert "gelesen" in res.verification


def test_fehlende_datei_wird_gemeldet(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("datei_lesen", {"pfad": str(tmp / "gibtsnicht.md")})
    assert not res.ok and "gibt es nicht" in res.message


def test_binaerdatei_wird_nicht_gelesen(werkstatt):
    """Steuerzeichen haben im Modellkontext nichts zu suchen."""
    reg, tmp = werkstatt
    res = reg.call("datei_lesen", {"pfad": str(tmp / "bild.png")})
    assert not res.ok and "nicht nach Text" in res.message


def test_ordner_statt_datei_verweist_weiter(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("datei_lesen", {"pfad": str(tmp / "projekte")})
    assert not res.ok and "ordner_auflisten" in res.message


def test_lesen_wird_begrenzt(werkstatt):
    reg, tmp = werkstatt
    gross = tmp / "gross.txt"
    gross.write_text("x" * 5000, "utf-8")
    res = reg.call("datei_lesen", {"pfad": str(gross), "max_zeichen": 100})
    assert res.ok
    assert "gekuerzt" in res.value
    assert len(res.value) < 300


def test_pfad_ausserhalb_wird_abgelehnt(werkstatt, tmp_path_factory):
    from jarvis.permissions import PermissionDenied
    reg, _ = werkstatt
    fremd = tmp_path_factory.mktemp("fremd") / "geheim.txt"
    fremd.write_text("geheim", "utf-8")
    with pytest.raises(PermissionDenied, match="ausserhalb"):
        reg.call("datei_lesen", {"pfad": str(fremd)})


# -- Auflisten und Suchen -----------------------------------------------
def test_ordner_auflisten_zeigt_ordner_zuerst(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("ordner_auflisten", {"pfad": str(tmp)})
    zeilen = res.value.splitlines()
    assert zeilen[0] == "[Ordner] projekte"
    assert "notizen.md" in res.value


def test_versteckte_dateien_bleiben_aus(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("ordner_auflisten", {"pfad": str(tmp)})
    assert ".versteckt" not in res.value


def test_muster_filtert(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("ordner_auflisten", {"pfad": str(tmp), "muster": "*.md"})
    assert "notizen.md" in res.value and "bild.png" not in res.value


def test_datei_suchen_rekursiv(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("datei_suchen", {"pfad": str(tmp), "muster": "*halle45*"})
    assert res.ok and "angebot-halle45.txt" in res.value


def test_text_suchen_findet_zeile(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("text_suchen", {"pfad": str(tmp), "text": "dresscode"})
    assert res.ok and "notizen.md:2" in res.value


def test_text_suchen_ohne_treffer(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("text_suchen", {"pfad": str(tmp), "text": "zebrastreifen"})
    assert res.ok and res.value == "(nicht gefunden)"


# -- Schreiben ----------------------------------------------------------
def test_datei_schreiben_und_nachlesen(werkstatt):
    reg, tmp = werkstatt
    ziel = tmp / "neu" / "liste.txt"
    res = reg.call("datei_schreiben", {"pfad": str(ziel), "inhalt": "Zeile\n"})
    assert res.ok
    assert ziel.read_text("utf-8") == "Zeile\n"
    # Der Pruefvermerk beruht auf dem Nachlesen, nicht auf dem Schreibaufruf.
    assert "nachgelesen" in res.verification


def test_schreiben_ueberschreibt_nicht(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("datei_schreiben",
                   {"pfad": str(tmp / "notizen.md"), "inhalt": "weg damit"})
    assert not res.ok and "gibt es schon" in res.message
    assert "Moin" in (tmp / "notizen.md").read_text("utf-8")


def test_anhaengen(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("datei_anhaengen",
                   {"pfad": str(tmp / "notizen.md"), "inhalt": "Nachtrag\n"})
    assert res.ok and "gewachsen" in res.verification
    assert (tmp / "notizen.md").read_text("utf-8").endswith("Nachtrag\n")


def test_aendern_bei_eindeutiger_stelle(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("datei_aendern", {"pfad": str(tmp / "notizen.md"),
                                     "suchen": "schwarz", "ersetzen": "dunkelblau"})
    assert res.ok
    assert "dunkelblau" in (tmp / "notizen.md").read_text("utf-8")


def test_aendern_bei_mehrfacher_stelle_tut_nichts(werkstatt):
    """Sonst trifft die Aenderung die falsche Stelle."""
    reg, tmp = werkstatt
    datei = tmp / "mehrfach.txt"
    datei.write_text("Hamburg\nHamburg\n", "utf-8")
    res = reg.call("datei_aendern", {"pfad": str(datei), "suchen": "Hamburg",
                                     "ersetzen": "Bremen"})
    assert not res.ok and "2-mal" in res.message
    assert datei.read_text("utf-8") == "Hamburg\nHamburg\n"


def test_aendern_ohne_treffer(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("datei_aendern", {"pfad": str(tmp / "notizen.md"),
                                     "suchen": "gibtsnicht", "ersetzen": "x"})
    assert not res.ok and "steht nicht" in res.message


# -- Loeschen -----------------------------------------------------------
def test_loeschen_prueft_dass_die_datei_weg_ist(werkstatt):
    reg, tmp = werkstatt
    ziel = tmp / "weg.txt"
    ziel.write_text("x", "utf-8")
    res = reg.call("datei_loeschen", {"pfad": str(ziel)})
    assert res.ok and "existiert nicht mehr" in res.verification
    assert not ziel.exists()


def test_ordner_wird_nicht_geloescht(werkstatt):
    reg, tmp = werkstatt
    res = reg.call("datei_loeschen", {"pfad": str(tmp / "projekte")})
    assert not res.ok and "Ordner loesche ich nicht" in res.message
    assert (tmp / "projekte").exists()


def test_loeschen_fragt_ohne_auto_confirm(tmp_path):
    from jarvis.permissions import ConfirmationRequired
    datei = tmp_path / "x.txt"
    datei.write_text("x", "utf-8")
    policy = Policy(granted=frozenset(Scope), roots=(tmp_path.resolve(),))
    reg = ToolRegistry(policy)
    files.register(reg, policy)
    with pytest.raises(ConfirmationRequired):
        reg.call("datei_loeschen", {"pfad": str(datei)})
    assert datei.exists()


# -- Anmeldung nach Berechtigung ----------------------------------------
def test_ohne_schreibrecht_kein_schreibwerkzeug(tmp_path):
    """Was nicht erlaubt ist, sieht das Modell gar nicht."""
    policy = Policy(granted=frozenset({Scope.READ}), roots=(tmp_path.resolve(),))
    reg = ToolRegistry(policy)
    files.register(reg, policy)
    namen = {t.name for t in reg.all()}
    assert "datei_lesen" in namen
    assert "datei_schreiben" not in namen
    assert "datei_loeschen" not in namen
