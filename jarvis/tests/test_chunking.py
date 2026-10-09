"""Tests der Abschnittsbildung fuer die Sprachausgabe."""

import pytest

from jarvis.speech.chunking import ChunkConfig, SentenceBuffer


def buffer(**kw) -> SentenceBuffer:
    return SentenceBuffer(ChunkConfig(**kw))


def test_vollstaendiger_satz_wird_ausgegeben():
    b = buffer(first_min_chars=5)
    assert b.feed("Moin Noah, alles klar bei dir? ") == ["Moin Noah, alles klar bei dir?"]


def test_unvollstaendiger_satz_wartet():
    b = buffer(first_min_chars=5)
    assert b.feed("Moin Noah, ich ") == []
    assert b.flush() == "Moin Noah, ich"


def test_erster_abschnitt_darf_kurz_sein():
    """Er bestimmt, wie schnell JARVIS zu antworten beginnt."""
    b = buffer(first_min_chars=10, min_chars=100)
    erste = b.feed("Ja, klar doch. ")
    assert erste == ["Ja, klar doch."]
    # Der naechste muss laenger sein.
    assert b.feed("Kurz. ") == []


def test_zu_kurzer_erster_abschnitt_wartet_auch():
    b = buffer(first_min_chars=20)
    assert b.feed("Ja. ") == []


def test_mehrere_saetze_am_stueck():
    b = buffer(first_min_chars=5, min_chars=5)
    abschnitte = b.feed("Erstens das. Zweitens jenes. Drittens noch was. ")
    assert abschnitte == ["Erstens das.", "Zweitens jenes.", "Drittens noch was."]


def test_stueckweises_fuettern_wie_beim_streamen():
    b = buffer(first_min_chars=5, min_chars=5)
    gesammelt = []
    for stueck in ["Moin", " Noah", ", das", " passt.", " Und", " jetzt", " weiter."]:
        gesammelt.extend(b.feed(stueck))
    rest = b.flush()
    if rest:
        gesammelt.append(rest)
    assert gesammelt == ["Moin Noah, das passt.", "Und jetzt weiter."]


# -- Deutsche Fallen ----------------------------------------------------
@pytest.mark.parametrize("text,erwartet", [
    ("Das gilt z.B. fuer Gastro und Logistik gleichermassen. ",
     ["Das gilt z.B. fuer Gastro und Logistik gleichermassen."]),
    ("Es sind ca. 30 Leute im Einsatz an dem Abend. ",
     ["Es sind ca. 30 Leute im Einsatz an dem Abend."]),
    ("Am 1. Januar ist niemand im Buero erreichbar. ",
     ["Am 1. Januar ist niemand im Buero erreichbar."]),
    ("Das kostet 3.000 Euro pro Veranstaltung ungefaehr. ",
     ["Das kostet 3.000 Euro pro Veranstaltung ungefaehr."]),
    ("Dr. Schmidt hat heute Vormittag schon angerufen. ",
     ["Dr. Schmidt hat heute Vormittag schon angerufen."]),
    ("Frag mal M. Herm, der weiss das mit den Schichten. ",
     ["Frag mal M. Herm, der weiss das mit den Schichten."]),
])
def test_abkuerzungen_trennen_nicht(text, erwartet):
    assert buffer(first_min_chars=10, min_chars=10).feed(text) == erwartet


def test_abkuerzung_mitten_im_satz_mit_echtem_ende():
    b = buffer(first_min_chars=10, min_chars=10)
    abschnitte = b.feed("Das gilt z.B. hier. Und dort nicht mehr. ")
    assert abschnitte == ["Das gilt z.B. hier.", "Und dort nicht mehr."]


def test_fragezeichen_und_ausrufezeichen():
    b = buffer(first_min_chars=5, min_chars=5)
    assert b.feed("Wirklich?! Na gut dann. ") == ["Wirklich?!", "Na gut dann."]


def test_doppelpunkt_trennt():
    b = buffer(first_min_chars=5, min_chars=5)
    assert b.feed("Kurz zusammengefasst: es passt alles. ")[0].endswith(":")


def test_keine_trennung_mitten_in_einer_zahl():
    b = buffer(first_min_chars=5, min_chars=5)
    assert b.feed("Der Preis ist 1.500,50 Euro netto. ") == \
        ["Der Preis ist 1.500,50 Euro netto."]


# -- Notgrenze ----------------------------------------------------------
def test_sehr_langer_text_ohne_satzzeichen_wird_getrennt():
    """Sonst wartet die Sprachausgabe, bis das Modell fertig ist."""
    b = buffer(first_min_chars=10, min_chars=20, max_chars=80)
    text = "und dann noch das hier, und danach jenes, und weiter so ohne Ende " \
           "immer weiter und weiter ohne jeden Punkt dazwischen"
    abschnitte = b.feed(text)
    assert abschnitte
    assert all(len(a) <= 80 for a in abschnitte)


def test_notgrenze_trennt_nicht_mitten_im_wort():
    b = buffer(first_min_chars=5, min_chars=10, max_chars=40)
    text = "Personaldienstleistung Sicherheitsdienst Gastronomiepersonal Logistikhelfer"
    abschnitte = b.feed(text)
    for abschnitt in abschnitte:
        # Kein Abschnitt endet mitten in einem Wort.
        assert abschnitt == abschnitt.strip()
        assert not abschnitt.endswith("Personaldienstleistun")


def test_leerer_text_ergibt_nichts():
    b = buffer()
    assert b.feed("") == []
    assert b.feed("   \n ") == []
    assert b.flush() is None


def test_zuruecksetzen_verwirft_den_rest():
    """Nach einer Unterbrechung darf kein alter Satzrest nachkommen."""
    b = buffer(first_min_chars=3, min_chars=100)
    b.feed("Ein angefangener Satz")
    b.reset()
    assert b.flush() is None
    # Und der Zaehler beginnt neu: der erste Abschnitt darf wieder kurz sein,
    # sonst waere die Antwort nach einer Unterbrechung traege.
    assert b.feed("Ja. ") == ["Ja."]
