# -*- coding: utf-8 -*-
"""Nachrichtenlage: echte Quellen, keine erfundenen Schlagzeilen."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone


from jarvis.core.news import Meldung, entdoppeln, hole_lage, lies_feed

RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Testschau</title>
  <item>
    <title>Hafen Hamburg meldet Rekordumschlag</title>
    <link>https://example.org/hafen</link>
    <description>&lt;p&gt;Mehr Container als je zuvor.&lt;/p&gt;</description>
    <pubDate>Mon, 12 Oct 2026 08:00:00 +0200</pubDate>
  </item>
  <item>
    <title>Zweite Meldung ohne Datum</title>
    <link>https://example.org/zwei</link>
  </item>
</channel></rss>"""

ATOM = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Neues Sprachmodell vorgestellt</title>
    <link href="https://example.org/ki"/>
    <summary>Ein Hersteller zeigt ein neues Modell.</summary>
    <updated>2026-10-12T06:30:00Z</updated>
  </entry>
</feed>"""


def test_rss_wird_gelesen():
    meldungen = lies_feed(RSS, quelle="Testschau", bereich="welt")
    assert len(meldungen) == 2
    erste = meldungen[0]
    assert erste.titel == "Hafen Hamburg meldet Rekordumschlag"
    assert erste.adresse == "https://example.org/hafen"
    assert erste.zusammenfassung == "Mehr Container als je zuvor."
    assert erste.zeitpunkt.year == 2026
    assert meldungen[1].zeitpunkt is None


def test_atom_wird_gelesen():
    meldungen = lies_feed(ATOM, quelle="Technikblatt", bereich="technik")
    assert meldungen[0].titel == "Neues Sprachmodell vorgestellt"
    assert meldungen[0].adresse == "https://example.org/ki"
    assert meldungen[0].zeitpunkt.tzinfo is not None


def test_kaputter_feed_wirft_nicht():
    assert lies_feed("kein xml", quelle="x", bereich="welt") == []
    assert lies_feed("", quelle="x", bereich="welt") == []


def test_dieselbe_meldung_aus_zwei_quellen_zaehlt_einmal():
    meldungen = [
        Meldung("Bundestag beschliesst neues Sicherheitsgesetz", "A", "welt"),
        Meldung("Bundestag beschliesst neues Sicherheitsgesetz heute", "B", "welt"),
        Meldung("Hafen Hamburg meldet Rekordumschlag", "C", "hamburg"),
    ]
    behalten = entdoppeln(meldungen)
    assert [m.quelle for m in behalten] == ["A", "C"]


def test_alte_meldungen_fliegen_raus(monkeypatch):
    jetzt = datetime(2026, 10, 12, 12, 0, tzinfo=timezone.utc)

    async def falscher_abruf(client, quelle, adresse, bereich):
        return [
            Meldung("Frisch von heute", quelle, bereich, zeitpunkt=jetzt - timedelta(hours=2)),
            Meldung("Von letzter Woche", quelle, bereich, zeitpunkt=jetzt - timedelta(days=7)),
        ]

    monkeypatch.setattr("jarvis.core.news._hole", falscher_abruf)
    lage = asyncio.run(hole_lage(("welt",), jetzt=jetzt))
    assert [m.titel for m in lage] == ["Frisch von heute"]


def test_keine_quelle_erreichbar_gibt_leere_liste(monkeypatch):
    async def faellt_aus(client, quelle, adresse, bereich):
        raise RuntimeError("kein Netz")

    monkeypatch.setattr("jarvis.core.news._hole", faellt_aus)
    assert asyncio.run(hole_lage(("welt",))) == []


# ------------------------------------------------------------------ Werkzeug
def test_werkzeug_meldet_ehrlich_wenn_nichts_geht(services, monkeypatch):
    async def nichts(*args, **kwargs):
        return []

    monkeypatch.setattr("jarvis.core.news.hole_lage", nichts)
    ergebnis = asyncio.run(services.toolkit.execute("nachrichtenlage", {}))
    assert not ergebnis.ok
    assert "erfinde dir dazu nichts" in ergebnis.text


def test_werkzeug_nennt_quelle_und_merkt_sich_die_lage(services, monkeypatch):
    async def lage(*args, **kwargs):
        return [Meldung("Neues Sprachmodell vorgestellt", "heise", "technik",
                        adresse="https://example.org/ki",
                        zeitpunkt=datetime.now(timezone.utc))]

    monkeypatch.setattr("jarvis.core.news.hole_lage", lage)
    ergebnis = asyncio.run(services.toolkit.execute("nachrichtenlage", {"bereich": "technik"}))
    assert ergebnis.ok
    assert "Neues Sprachmodell vorgestellt" in ergebnis.text and "heise" in ergebnis.text
    assert ergebnis.data["meldungen"][0]["adresse"] == "https://example.org/ki"
    assert services.nachrichtenlage


def test_meldung_erklaeren_nutzt_die_gemerkte_lage(services, monkeypatch):
    services.nachrichtenlage = [
        Meldung("Hafen Hamburg meldet Rekordumschlag", "NDR", "hamburg", adresse="")
    ]
    ergebnis = asyncio.run(
        services.toolkit.execute("meldung_erklaeren", {"stichwort": "Hafen"})
    )
    assert ergebnis.ok and "NDR" in ergebnis.text


def test_meldung_erklaeren_ohne_treffer(services):
    services.nachrichtenlage = [Meldung("Irgendwas", "A", "welt")]
    ergebnis = asyncio.run(
        services.toolkit.execute("meldung_erklaeren", {"stichwort": "Mondlandung"})
    )
    assert not ergebnis.ok
