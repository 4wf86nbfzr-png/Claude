"""Tests fuer die Diagnose.

Die Diagnose darf nie behaupten, etwas sei in Ordnung, was sie nicht
pruefen konnte -- und sie darf nicht abstuerzen, wenn nichts installiert ist.
"""

from jarvis import doctor
from jarvis.config import Config
from jarvis.doctor import State


def test_diagnose_laeuft_ohne_installation_durch():
    report = doctor.run(Config())
    assert report.checks
    # Hier ist weder Ollama noch Whisper installiert; das muss gemeldet werden,
    # nicht uebersprungen.
    namen = {c.name for c in report.checks}
    assert {"Betriebssystem", "Python", "Berechtigungen"} <= namen


def test_fehlendes_nennt_einen_naechsten_schritt():
    report = doctor.run(Config())
    for check in report.problems:
        assert check.remedy or check.detail, f"{check.name} ohne Hinweis"


def test_nicht_macos_wird_als_eingeschraenkt_gemeldet():
    """Dieser Container ist Linux -- die Diagnose muss das sagen."""
    import platform
    checks = doctor.check_platform()
    os_check = checks[0]
    if platform.system() != "Darwin":
        assert os_check.state is State.DEGRADED
        assert "macOS" in os_check.remedy


def test_json_ausgabe_ist_vollstaendig():
    import json
    data = json.loads(doctor.run(Config()).to_json())
    assert data["checks"]
    for c in data["checks"]:
        assert set(c) == {"name", "state", "detail", "remedy"}


def test_abgeschaltete_komponenten_gelten_nicht_als_ok():
    cfg = Config()
    cfg.llm.runtime = "none"
    cfg.stt.engine = "none"
    cfg.tts.engine = "none"
    for check in (doctor.check_llm(cfg) + doctor.check_stt(cfg) + doctor.check_tts(cfg)):
        assert check.state is not State.OK
