"""Telegram-Adapter: Zugang, Befehle, Knoepfe, Nachrichtenteilung.

Es wird nicht gegen die echte Bot-API gesprochen: ``_call`` wird ersetzt,
und die Tests pruefen, *was* gesendet worden waere.
"""

from __future__ import annotations

import asyncio

import pytest

from jarvis.adapters.telegram import TelegramBot


def run(coroutine):
    return asyncio.run(coroutine)


@pytest.fixture
def bot(services):
    instance = TelegramBot(services)
    instance.gesendet = []

    async def falsches_call(method, **payload):
        instance.gesendet.append((method, payload))
        if method == "getMe":
            return {"username": "jarvis_test_bot", "id": 1}
        return {"message_id": len(instance.gesendet)}

    instance._call = falsches_call
    return instance


def texte(bot) -> list[str]:
    return [p.get("text", "") for m, p in bot.gesendet if m == "sendMessage"]


def nachricht(text: str, user_id: int = 4711) -> dict:
    return {"update_id": 1, "message": {
        "message_id": 10, "chat": {"id": user_id}, "from": {"id": user_id, "first_name": "Test"},
        "text": text,
    }}


def knopf(daten: str, user_id: int = 4711) -> dict:
    return {"update_id": 2, "callback_query": {
        "id": "cb1", "data": daten, "from": {"id": user_id, "first_name": "Test"},
        "message": {"message_id": 11, "chat": {"id": user_id}},
    }}


# --- Zugang -------------------------------------------------------------------
def test_fremder_nutzer_wird_abgewiesen(bot, services):
    run(bot._dispatch(nachricht("Hallo", user_id=99999)))
    antworten = texte(bot)
    assert antworten and "persoenlich" in antworten[0]
    ereignisse = services.memory.recent_events(kind="zugriff_abgewiesen")
    assert len(ereignisse) == 1
    assert ereignisse[0]["ok"] is False
    # Und kein Gespraech wurde angelegt.
    assert services.memory.message_count("99999") == 0


def test_fremder_knopfdruck_wird_abgewiesen(bot, services):
    run(bot._dispatch(knopf("tool:aufgaben_liste", user_id=99999)))
    assert not texte(bot)
    assert any(m == "answerCallbackQuery" for m, _ in bot.gesendet)


def test_leere_erlaubnisliste_laesst_niemanden_rein(services):
    services.settings.telegram_allowed_ids = []
    instance = TelegramBot(services)
    assert instance.allowed == set()


def test_berechtigter_nutzer_wird_bedient(bot, services):
    from jarvis.ai.cloud import EchoProvider
    from jarvis.ai.provider import ModelReply
    provider = EchoProvider(scripted=[ModelReply(text="Moin, alles ruhig.")])
    services.models.primary = provider
    services.models.active = provider
    services.models.fallback = None

    run(bot._dispatch(nachricht("Moin")))
    assert "Moin, alles ruhig." in texte(bot)
    assert services.memory.message_count("4711") == 2


# --- Befehle ------------------------------------------------------------------
def test_hilfe_zeigt_die_befehle(bot):
    run(bot._dispatch(nachricht("/hilfe")))
    assert "/uebersicht" in texte(bot)[0]


def test_aufgabe_per_befehl(bot, services):
    run(bot._dispatch(nachricht("/neu Angebot fuer Alex schreiben")))
    assert any("Angebot fuer Alex schreiben" in t for t in texte(bot))
    assert services.tasks.list()[0].title == "Angebot fuer Alex schreiben"


def test_aufgabe_abschliessen_per_befehl(bot, services):
    aufgabe = services.tasks.create("Fertig machen")
    run(bot._dispatch(nachricht(f"/fertig {aufgabe.id}")))
    assert services.tasks.get(aufgabe.id).status == "erledigt"


def test_befehl_ohne_argument_fragt_nach(bot, services):
    run(bot._dispatch(nachricht("/neu")))
    assert bot._awaiting["4711"] == "aufgabe"
    # Die naechste Nachricht wird als Antwort darauf verstanden.
    run(bot._dispatch(nachricht("Lampen aufhaengen")))
    assert services.tasks.list()[0].title == "Lampen aufhaengen"
    assert "4711" not in bot._awaiting


def test_unbekannter_befehl(bot):
    run(bot._dispatch(nachricht("/zauber")))
    assert "kenne ich nicht" in texte(bot)[0]


def test_stumm_schaltet_um(bot, services):
    run(bot._dispatch(nachricht("/stumm")))
    assert services.notifier.muted is True
    assert services.store.get_bool("stumm", False) is True
    run(bot._dispatch(nachricht("/stumm")))
    assert services.notifier.muted is False


def test_vergessen_loescht_nur_den_verlauf(bot, services):
    services.memory.add_message("4711", "user", "alte Nachricht")
    services.memory.remember("Buero", "Hamburg", importance=5)
    run(bot._dispatch(nachricht("/vergessen")))
    assert services.memory.message_count("4711") == 0
    assert services.memory.get_memory_by_key("Buero") is not None


def test_abbrechen_verwirft_offene_rueckfragen(bot, services):
    services.permissions.request("email_senden", {"an": "x"}, summary="Mail", chat_id="4711")
    run(bot._dispatch(nachricht("/abbrechen")))
    assert services.permissions.open_requests("4711") == []


# --- Knoepfe ------------------------------------------------------------------
def test_menue_knopf_zeigt_untermenue(bot):
    run(bot._dispatch(knopf("menu:aufgaben")))
    gesendet = [p for m, p in bot.gesendet if m == "sendMessage"]
    assert "*Aufgaben*" in gesendet[-1]["text"]
    assert gesendet[-1]["reply_markup"]["inline_keyboard"]


def test_werkzeug_knopf_mit_argumenten(bot, services):
    services.tasks.create("Erledigt", priority="hoch")
    services.tasks.complete(services.tasks.list()[0].id)
    run(bot._dispatch(knopf("tool:aufgaben_liste:status=erledigt")))
    assert any("Erledigt" in t for t in texte(bot))


def test_erinnerung_knopf_bestaetigt(bot, services):
    from datetime import timedelta
    from jarvis.db.database import utcnow
    reminder = services.reminders.create("Test", utcnow() - timedelta(minutes=1))
    services.reminders.mark_triggered(reminder.id)
    run(bot._dispatch(knopf(f"erinnerung_ok:{reminder.id}")))
    assert services.reminders.get(reminder.id).status == "bestaetigt"


def test_erinnerung_knopf_verschiebt(bot, services):
    from datetime import timedelta
    from jarvis.db.database import utcnow
    reminder = services.reminders.create("Test", utcnow() - timedelta(minutes=1))
    run(bot._dispatch(knopf(f"erinnerung_spaeter:{reminder.id}")))
    aktuell = services.reminders.get(reminder.id)
    assert aktuell.status == "geplant"
    assert aktuell.due_at > utcnow()


def test_bestaetigungsknopf_fuehrt_die_aktion_aus(bot, services):
    aufgabe = services.tasks.create("Weg damit")
    anfrage = run(services.toolkit.execute(
        "aufgabe_loeschen", {"aufgabe": str(aufgabe.id)}, chat_id="4711"
    ))
    run(bot._dispatch(knopf(f"bestaetigen:{anfrage.confirmation_token}")))
    assert services.tasks.get(aufgabe.id) is None


def test_ablehnungsknopf_fuehrt_nichts_aus(bot, services):
    aufgabe = services.tasks.create("Bleibt")
    anfrage = run(services.toolkit.execute(
        "aufgabe_loeschen", {"aufgabe": str(aufgabe.id)}, chat_id="4711"
    ))
    run(bot._dispatch(knopf(f"ablehnen:{anfrage.confirmation_token}")))
    assert services.tasks.get(aufgabe.id) is not None


# --- Zustellung ---------------------------------------------------------------
def test_lange_nachrichten_werden_geteilt(bot):
    lang = "\n".join(f"Zeile {i} mit etwas Text dran" for i in range(400))
    run(bot.send("4711", lang))
    stuecke = [p["text"] for m, p in bot.gesendet if m == "sendMessage"]
    assert len(stuecke) > 1
    assert all(len(stueck) <= 3800 for stueck in stuecke)
    assert "Zeile 399" in stuecke[-1]


def test_knoepfe_nur_an_der_letzten_nachricht(bot):
    lang = "x" * 9000
    run(bot.send("4711", lang, buttons=[("Test", "tool:aufgaben_liste")]))
    gesendet = [p for m, p in bot.gesendet if m == "sendMessage"]
    assert "reply_markup" not in gesendet[0]
    assert "reply_markup" in gesendet[-1]


def test_proaktive_meldung_geht_an_den_besitzer(bot, services):
    services.store.set("besitzer_chat", "4711")
    services.notifier.set_sender(bot._notify)
    services.notifier.quiet_start = services.notifier.quiet_end = ""
    assert run(services.notifier.notify("test:1", "Eine Meldung")) is True
    assert "Eine Meldung" in texte(bot)


def test_versatz_wird_gespeichert(bot, services):
    bot._offset = 0
    services.store.set("telegram_offset", "140")
    neuer = TelegramBot(services)
    assert neuer._offset == 140


# --- Ausfallsicherheit --------------------------------------------------------
def test_netzaussetzer_beim_start_wird_wiederholt(services, monkeypatch):
    """Ein Aussetzer darf den Bot nicht kosten -- er versucht es erneut."""
    from jarvis.errors import JarvisError

    instance = TelegramBot(services)
    versuche = {"n": 0}

    async def flatterhaft(method, **payload):
        if method == "getMe":
            versuche["n"] += 1
            if versuche["n"] < 3:
                raise JarvisError("Telegram nicht erreichbar: ProxyError")
            return {"username": "jarvis_test_bot", "id": 1}
        return {}

    instance._call = flatterhaft
    monkeypatch.setattr("asyncio.wait_for", _sofort_weiter)

    async def nur_start():
        # Die Abrufschleife wird nicht betreten, der Start reicht fuer den Test.
        instance._poll_loop = _nichts_tun
        await instance.start()

    run(nur_start())
    assert versuche["n"] == 3
    assert instance.me["username"] == "jarvis_test_bot"


def test_abgelehnter_token_wird_nicht_wiederholt(services, monkeypatch):
    from jarvis.errors import JarvisError

    instance = TelegramBot(services)
    versuche = {"n": 0}

    async def abgelehnt(method, **payload):
        versuche["n"] += 1
        raise JarvisError("Telegram lehnt den Token ab.")

    instance._call = abgelehnt
    with pytest.raises(JarvisError):
        run(instance.start())
    assert versuche["n"] == 1


async def _sofort_weiter(awaitable, timeout=None):
    """Ersetzt das Warten zwischen den Versuchen, damit der Test schnell bleibt."""
    if hasattr(awaitable, "close"):
        awaitable.close()
    raise asyncio.TimeoutError


async def _nichts_tun():
    return None
