"""Der Selbsttest selbst -- er muss durchlaufen und ehrlich melden."""

from __future__ import annotations

import asyncio

from jarvis.selftest import Selbsttest


def test_selbsttest_laeuft_vollstaendig_durch(settings, capsys):
    ergebnis = asyncio.run(Selbsttest(settings).lauf())

    assert ergebnis.bestanden, [f"{p.name}: {p.hinweis}" for p in ergebnis.fehler]
    assert len(ergebnis.pruefungen) >= 12
    namen = {p.name for p in ergebnis.pruefungen}
    for pflicht in ("Erinnerung wird ausgeloest", "Keine doppelte Ausfuehrung",
                    "Bestaetigung schuetzt Loeschung", "Neustart verliert nichts"):
        assert pflicht in namen

    ausgabe = capsys.readouterr().out
    assert "Alle" in ausgabe and "bestanden" in ausgabe


def test_selbsttest_laesst_den_echtbetrieb_unberuehrt(settings):
    """Er arbeitet in einer eigenen Datenbank und raeumt sie wieder weg."""
    from jarvis.core.services import Services

    echt = Services(settings)
    try:
        echt.tasks.create("Echte Aufgabe, nicht anfassen")
        echt.memory.remember("Echt", "bleibt")
    finally:
        asyncio.run(echt.stop())

    asyncio.run(Selbsttest(settings).lauf())

    danach = Services(settings)
    try:
        titel = [t.title for t in danach.tasks.list()]
        assert titel == ["Echte Aufgabe, nicht anfassen"]
        assert danach.memory.get_memory_by_key("Echt") is not None
        # Der Selbsttest-Ordner ist wieder weg.
        assert not (settings.data_dir / "selftest").exists()
    finally:
        asyncio.run(danach.stop())


def test_fehlgeschlagene_pruefung_wird_gemeldet(settings):
    """Eine Pruefung, die scheitert, darf nicht stillschweigend durchgehen."""
    test = Selbsttest(settings)

    async def kaputt() -> str:
        raise AssertionError("absichtlich schiefgegangen")

    async def lauf() -> None:
        await test.pruefe("Absicht", kaputt)

    asyncio.run(lauf())
    assert not test.ergebnis.bestanden
    assert test.ergebnis.fehler[0].hinweis == "absichtlich schiefgegangen"
