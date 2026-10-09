"""Gedaechtnis: Gespraech, Langzeit, Ereignisse."""

from jarvis.core.memory import Memory, SettingsStore


def test_gespraech_wird_in_reihenfolge_gespeichert(database):
    memory = Memory(database)
    memory.add_message("42", "user", "Moin")
    memory.add_message("42", "assistant", "Moin, was brauchst du?")
    memory.add_message("42", "user", "Aufgabe anlegen")
    verlauf = memory.recent_messages("42", limit=10)
    assert [m["role"] for m in verlauf] == ["user", "assistant", "user"]
    assert verlauf[-1]["content"] == "Aufgabe anlegen"
    assert memory.get_state("42")["message_count"] == 3


def test_langzeitgedaechtnis_speichert_und_findet(database):
    memory = Memory(database)
    memory.remember("Lieblingscafe", "Elbgold in der Schanze", kind="vorliebe", importance=4)
    memory.remember("Telefonzeit", "Lieber vormittags telefonieren", kind="vorliebe")

    treffer = memory.search_memory("Cafe")
    assert treffer and "Elbgold" in treffer[0].value

    treffer = memory.search_memory("telefonieren")
    assert treffer and treffer[0].key == "Telefonzeit"

    assert any(e.key == "Lieblingscafe" for e in memory.important_memory())


def test_gleicher_schluessel_ueberschreibt(database):
    memory = Memory(database)
    memory.remember("Buero", "Hamburg Altona")
    memory.remember("Buero", "Hamburg Bahrenfeld")
    eintraege = [e for e in memory.list_memory() if e.key == "Buero"]
    assert len(eintraege) == 1
    assert eintraege[0].value == "Hamburg Bahrenfeld"


def test_loeschen_und_export(database):
    memory = Memory(database)
    memory.remember("Testwert", "weg damit")
    assert memory.forget(key="Testwert")
    assert not memory.forget(key="Testwert")

    memory.add_message("42", "user", "etwas")
    export = memory.export_all()
    assert "gedaechtnis" in export and "gespraeche" in export
    assert len(export["gespraeche"]) == 1


def test_zustand_und_rueckfrage(database):
    memory = Memory(database)
    memory.set_state("42", pending_question="Welche Uhrzeit?", pending_payload={"text": "Alex"})
    state = memory.get_state("42")
    assert state["pending_question"] == "Welche Uhrzeit?"
    assert state["pending_payload"]["text"] == "Alex"
    memory.clear_pending("42")
    assert memory.get_state("42")["pending_question"] == ""


def test_ereignisse_werden_protokolliert(database):
    memory = Memory(database)
    memory.remember_event("erinnerung_ausgeloest", "Alex anrufen", {"id": 1})
    memory.remember_event("anruf_fehler", "Nummer falsch", {"fehler": "ungueltig"}, ok=False)
    events = memory.recent_events()
    assert len(events) == 2
    assert events[0]["ok"] is False
    assert events[1]["detail"]["id"] == 1


def test_einstellungen(database):
    store = SettingsStore(database)
    assert store.get_bool("stumm", False) is False
    store.set("stumm", "true")
    assert store.get_bool("stumm", False) is True
    store.set("stumm", "false")
    assert store.get_bool("stumm", True) is False


def test_suche_findet_auch_gebeugte_formen(database):
    """Deutsch beugt: wer "telefonieren" sucht, meint auch "Telefoniert"."""
    memory = Memory(database)
    memory.remember("Telefonzeit", "Telefoniert lieber vormittags")
    memory.remember("Reinigung", "Reinigungskraefte kommen montags")
    memory.remember("Angebot", "Angebote immer mit Festpreis")

    assert memory.search_memory("telefonieren"), "gebeugte Form nicht gefunden"
    assert memory.search_memory("telefonierte")[0].key == "Telefonzeit"
    assert memory.search_memory("Reinigungskraft")[0].key == "Reinigung"
    assert memory.search_memory("Angebot")[0].key == "Angebot"


def test_suche_bleibt_trotzdem_treffsicher(database):
    memory = Memory(database)
    memory.remember("Buero", "Hamburg Bahrenfeld")
    memory.remember("Lager", "Wilhelmsburg")
    treffer = memory.search_memory("Bahrenfeld")
    assert len(treffer) == 1 and treffer[0].key == "Buero"
    assert memory.search_memory("Flugzeugbau") == []
