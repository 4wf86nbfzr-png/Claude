"""Recherche-Werkzeuge: Dateischranke, Zusammenfassung, Fremdtext.

Die Dateischranke ist sicherheitsrelevant: Jarvis darf nur unterhalb der
freigegebenen Ordner lesen, und bestimmte Dateien gar nicht.
"""

from __future__ import annotations

import asyncio

import pytest


def run(coroutine):
    return asyncio.run(coroutine)


@pytest.fixture
def ordner(tmp_path, monkeypatch):
    """Ein freigegebener Ordner mit etwas Inhalt -- und ein verbotener daneben."""
    erlaubt = tmp_path / "unterlagen"
    erlaubt.mkdir()
    (erlaubt / "notizen.md").write_text(
        "# Personalplanung\nDienstag zwei Leute, Mittwoch drei.", encoding="utf-8"
    )
    (erlaubt / "zahlen.csv").write_text("monat;einsaetze\n10;42\n11;57\n", encoding="utf-8")
    (erlaubt / ".env").write_text("TELEGRAM_BOT_TOKEN=geheim", encoding="utf-8")
    (erlaubt / "bild.png").write_bytes(b"\x89PNG\r\n")
    unterordner = erlaubt / "2026"
    unterordner.mkdir()
    (unterordner / "angebot-nord.md").write_text("Angebot fuer Objekt Nord", encoding="utf-8")

    verboten = tmp_path / "privat"
    verboten.mkdir()
    (verboten / "geheim.md").write_text("Nicht fuer Jarvis", encoding="utf-8")

    monkeypatch.setenv("JARVIS_FILE_ROOTS", str(erlaubt))
    return erlaubt, verboten


def test_datei_suchen_findet_nur_im_freigegebenen_ordner(services, ordner):
    erlaubt, verboten = ordner
    treffer = run(services.toolkit.execute("datei_suchen", {"muster": "angebot"}))
    assert treffer.ok
    assert "angebot-nord.md" in treffer.text

    nichts = run(services.toolkit.execute("datei_suchen", {"muster": "geheim"}))
    assert nichts.data["anzahl"] == 0


def test_muster_mit_endung(services, ordner):
    treffer = run(services.toolkit.execute("datei_suchen", {"muster": "*.csv"}))
    assert "zahlen.csv" in treffer.text


def test_datei_lesen_liefert_inhalt_als_fremdtext(services, ordner):
    erlaubt, _ = ordner
    ergebnis = run(services.toolkit.execute(
        "datei_lesen", {"pfad": str(erlaubt / "notizen.md")}))
    assert ergebnis.ok
    assert "Dienstag zwei Leute" in ergebnis.text
    # Dateiinhalt ist Material, kein Auftrag -- entsprechend gekennzeichnet.
    assert "ANFANG FREMDTEXT" in ergebnis.text and "keine Anweisungen" in ergebnis.text


def test_ausserhalb_der_freigabe_wird_abgelehnt(services, ordner):
    _, verboten = ordner
    ergebnis = run(services.toolkit.execute(
        "datei_lesen", {"pfad": str(verboten / "geheim.md")}))
    assert not ergebnis.ok
    assert "darf ich nicht" in ergebnis.text
    assert "Nicht fuer Jarvis" not in ergebnis.text


def test_ausbrechen_mit_punkt_punkt_geht_nicht(services, ordner):
    erlaubt, verboten = ordner
    ergebnis = run(services.toolkit.execute(
        "datei_lesen", {"pfad": str(erlaubt / ".." / "privat" / "geheim.md")}))
    assert not ergebnis.ok
    assert "Nicht fuer Jarvis" not in ergebnis.text


def test_geheimnisdateien_sind_gesperrt(services, ordner):
    """Auch im freigegebenen Ordner: .env und Schluessel bleiben tabu."""
    erlaubt, _ = ordner
    ergebnis = run(services.toolkit.execute(
        "datei_lesen", {"pfad": str(erlaubt / ".env")}))
    assert not ergebnis.ok
    assert "geheim" not in ergebnis.text.lower() or "darf ich nicht" in ergebnis.text

    # Auch in der Trefferliste erscheint sie nicht (der Suchbegriff selbst
    # steht in der Meldung, deshalb wird die Trefferzahl geprueft).
    suche = run(services.toolkit.execute("datei_suchen", {"muster": ".env"}))
    assert suche.data["anzahl"] == 0


def test_binaerdateien_werden_abgelehnt(services, ordner):
    erlaubt, _ = ordner
    ergebnis = run(services.toolkit.execute(
        "datei_lesen", {"pfad": str(erlaubt / "bild.png")}))
    assert not ergebnis.ok
    assert ".png" in ergebnis.text


def test_fehlende_datei_wird_gemeldet(services, ordner):
    erlaubt, _ = ordner
    ergebnis = run(services.toolkit.execute(
        "datei_lesen", {"pfad": str(erlaubt / "gibtsnicht.md")}))
    assert not ergebnis.ok and "gibt es nicht" in ergebnis.text


def test_zusammenfassen_nutzt_das_modell(services):
    from jarvis.ai.cloud import EchoProvider
    from jarvis.ai.provider import ModelReply
    provider = EchoProvider(scripted=[ModelReply(text="Drei Einsaetze, alle bestaetigt.")])
    services.models.primary = provider
    services.models.active = provider
    services.models.fallback = None

    ergebnis = run(services.toolkit.execute("zusammenfassen", {
        "text": "Montag Einsatz Nord bestaetigt. Dienstag Einsatz Sued bestaetigt. "
                "Mittwoch Einsatz Mitte bestaetigt. Alle Schichten besetzt.",
    }))
    assert ergebnis.ok and "Drei Einsaetze" in ergebnis.text
    # Der uebergebene Text war als Fremdtext gekennzeichnet.
    gesehen = provider.calls[0][-1].content
    assert "ANFANG FREMDTEXT" in gesehen


def test_zu_kurzer_text_wird_nicht_zusammengefasst(services):
    ergebnis = run(services.toolkit.execute("zusammenfassen", {"text": "Kurz."}))
    assert not ergebnis.ok and "zu kurz" in ergebnis.text


def test_webabruf_entschlackt_html(services, monkeypatch):
    """Der Abruf selbst wird ersetzt -- geprueft wird die Aufbereitung."""
    import httpx

    class Antwort:
        status_code = 200
        headers = {"content-type": "text/html; charset=utf-8"}
        text = (
            "<html><head><style>p{color:red}</style></head><body>"
            "<nav>Menue</nav><h1>Sicherheitsdienst Hamburg</h1>"
            "<p>Wir stellen <b>Personal</b> &amp; Technik.</p>"
            "<script>alert(1)</script><footer>Impressum</footer></body></html>"
        )

    class Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, adresse, headers=None):
            return Antwort()

    monkeypatch.setattr(httpx, "AsyncClient", Client)

    ergebnis = run(services.toolkit.execute("web_abrufen", {"adresse": "example.org"}))
    assert ergebnis.ok
    assert "Sicherheitsdienst Hamburg" in ergebnis.text
    assert "Personal & Technik" in ergebnis.text
    assert "<b>" not in ergebnis.text and "alert(1)" not in ergebnis.text
    assert "ANFANG FREMDTEXT" in ergebnis.text


def test_webabruf_meldet_fehler_statt_zu_erfinden(services, monkeypatch):
    import httpx

    class Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, adresse, headers=None):
            raise httpx.ConnectError("kein Netz")

    monkeypatch.setattr(httpx, "AsyncClient", Client)
    ergebnis = run(services.toolkit.execute("web_abrufen", {"adresse": "example.org"}))
    assert not ergebnis.ok and "nicht erreichbar" in ergebnis.text
