"""Tests der Messung.

Eine Messung, die Werte erfindet, waere schlimmer als gar keine. Geprueft wird
deshalb vor allem, dass Nichtmessbares als nicht messbar erscheint -- mit
Grund, nicht mit einer Null.
"""

import pytest

from jarvis import bench
from jarvis.config import Config


def konfig() -> Config:
    cfg = Config()
    cfg.llm.runtime = "none"
    cfg.stt.engine = "none"
    cfg.tts.engine = "none"
    return cfg


# -- Darstellung --------------------------------------------------------
def test_nicht_messbares_zeigt_keinen_wert():
    m = bench.Messung("Irgendwas", grund="nicht installiert")
    assert not m.messbar
    zeile = m.zeile()
    assert "--" in zeile
    assert "nicht installiert" in zeile
    # Keine erfundene Null.
    assert " 0 " not in zeile


def test_leere_messung_gilt_nicht_als_messbar():
    assert not bench.Messung("Leer").messbar


def test_messung_mit_werten_zeigt_median_und_spanne():
    m = bench.Messung("Test", werte=[10.0, 20.0, 30.0])
    zeile = m.zeile()
    assert "20" in zeile          # Median
    assert "n=3" in zeile
    assert "10–30" in zeile


def test_einzelwert_ohne_spanne():
    zeile = bench.Messung("Test", werte=[42.0]).zeile()
    assert "42" in zeile
    assert "n=" not in zeile


# -- Tonerzeugung -------------------------------------------------------
def test_ton_hat_die_richtige_laenge():
    audio = bench._ton(1.0, sample_rate=16000)
    assert len(audio) == 16000 * 2        # Int16


def test_ton_ist_nicht_still():
    from jarvis.speech.vad import rms
    assert rms(bench._ton(0.1)) > 0.05


# -- Einzelmessungen ----------------------------------------------------
def test_gedaechtnismessung_liefert_werte():
    messungen = bench.messe_gedaechtnis(konfig(), runden=5)
    assert len(messungen) == 3
    for m in messungen:
        assert m.messbar, f"{m.name}: {m.grund}"
        assert all(w > 0 for w in m.werte)


def test_zerlegungsmessung_nennt_den_anteil_am_block():
    """Diese Zahl entscheidet, ob die Dauerlast vertretbar ist."""
    messungen = bench.messe_zerlegung(konfig())
    pegel = messungen[0]
    assert pegel.messbar
    assert "% eines 30-ms-Blocks" in pegel.hinweis


def test_abschnittsmessung_liefert_werte():
    messungen = bench.messe_abschnitte(konfig())
    assert messungen[0].messbar


def test_werkzeugmessung_liefert_werte():
    assert bench.messe_werkzeuge(konfig())[0].messbar


# -- Ehrlichkeit bei fehlenden Bausteinen -------------------------------
def test_ohne_modell_kein_erfundener_wert():
    messungen = bench.messe_llm(konfig())
    assert len(messungen) == 3
    for m in messungen:
        assert not m.messbar
        assert "kein Sprachmodell" in m.grund


def test_ohne_whisper_kein_erfundener_wert():
    cfg = konfig()
    cfg.stt.engine = "whisper_cpp"
    cfg.stt.binary = "gibtsnicht-whisper"
    m = bench.messe_stt(cfg)[0]
    assert not m.messbar
    assert "nicht im Pfad" in m.grund


def test_ohne_sprachausgabe_kein_erfundener_wert():
    cfg = konfig()
    cfg.tts.engine = "piper"
    cfg.tts.voice_path = "/gibtsnicht/stimme.onnx"
    m = bench.messe_tts(cfg)[0]
    assert not m.messbar


# -- Gesamtbericht ------------------------------------------------------
def test_bericht_laeuft_ohne_installation_durch():
    bericht = bench.run(konfig(), mit_modell=True, mit_audio=True)
    assert "JARVIS -- Messung" in bericht
    assert "Gedaechtnis" in bericht
    assert "Arbeitsspeicher" in bericht


def test_bericht_erklaert_die_grenze_der_messung():
    """Die gemessene Whisper-Zeit ist nicht die Reaktionszeit im Gespraech --
    das muss dabeistehen, sonst wird die Zahl falsch verstanden."""
    bericht = bench.run(konfig(), mit_modell=False, mit_audio=False)
    assert "nicht die" in bericht and "Reaktionszeit im Gespraech" in bericht
    assert "letzte_latenz" in bericht


def test_bericht_nennt_fehlende_bausteine_mit_grund():
    bericht = bench.run(konfig(), mit_modell=True, mit_audio=True)
    assert "kein Sprachmodell konfiguriert" in bericht
