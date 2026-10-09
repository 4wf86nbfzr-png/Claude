"""Tests fuer die Konfiguration.

Wichtig ist vor allem, dass ein Tippfehler auffaellt, statt still zu
verpuffen -- eine wirkungslose Einstellung ist schwerer zu finden als ein
Fehler beim Start.
"""

import pytest

from jarvis.cli import CONFIG_TEMPLATE
from jarvis.config import Config, ConfigError
from jarvis.notify.manager import Priority
from jarvis.permissions import Scope


def write(tmp_path, text: str):
    p = tmp_path / "config.toml"
    p.write_text(text, "utf-8")
    return p


def test_fehlende_datei_ergibt_vorgaben(tmp_path):
    cfg = Config.load(tmp_path / "gibtsnicht.toml")
    assert cfg.llm.runtime == "ollama"
    assert cfg.policy.granted == frozenset({Scope.READ})


def test_vorlage_ist_gueltig(tmp_path):
    """Die Vorlage aus config-init muss sich selbst wieder laden lassen."""
    cfg = Config.load(write(tmp_path, CONFIG_TEMPLATE))
    assert cfg.user_name == "Noah"
    assert cfg.wake.phrase == "hey jarvis"
    assert Scope.EDIT in cfg.policy.granted
    assert Scope.DELETE not in cfg.policy.granted
    assert cfg.notify.speak_threshold is Priority.IMPORTANT


def test_unbekannter_abschnitt_faellt_auf(tmp_path):
    with pytest.raises(ConfigError, match="Unbekannte Abschnitte"):
        Config.load(write(tmp_path, "[sprachausgabe]\nengine = 'piper'\n"))


def test_tippfehler_im_schluessel_faellt_auf(tmp_path):
    with pytest.raises(ConfigError, match="unbekannte Schluessel"):
        Config.load(write(tmp_path, "[llm]\nmodell = 'qwen'\n"))


def test_ungueltiges_toml_nennt_die_datei(tmp_path):
    with pytest.raises(ConfigError, match="kein gueltiges TOML"):
        Config.load(write(tmp_path, "[llm\n"))


def test_unbekannte_schwelle_nennt_die_moeglichkeiten(tmp_path):
    with pytest.raises(ConfigError, match="IMPORTANT"):
        Config.load(write(tmp_path, "[notify]\nspeak_threshold = 'sehr laut'\n"))


def test_ruhezeit_braucht_zwei_werte(tmp_path):
    with pytest.raises(ConfigError, match="zwei Stunden"):
        Config.load(write(tmp_path, "[notify]\nquiet_hours = [22]\n"))


def test_berechtigungen_werden_uebernommen(tmp_path):
    cfg = Config.load(write(tmp_path, """
[permissions]
granted = ["read", "delete"]
auto_confirm = ["delete"]
roots = ["~/Documents"]
allowed_apps = ["Safari"]
"""))
    assert cfg.policy.allows(Scope.DELETE)
    assert not cfg.policy.needs_confirmation(Scope.DELETE)
    assert cfg.policy.roots and cfg.policy.roots[0].is_absolute()


def test_unbekannte_stufe_faellt_auf(tmp_path):
    with pytest.raises(ValueError):
        Config.load(write(tmp_path, "[permissions]\ngranted = ['alles']\n"))


def test_rundlauf_dict(tmp_path):
    original = Config.load(write(tmp_path, CONFIG_TEMPLATE))
    wieder = Config.from_dict(original.to_dict())
    assert wieder.to_dict() == original.to_dict()
