"""Telefonie vollstaendig: Anruf rausgeben, Rueckruf verarbeiten, Gespraech fuehren.

Zwei echte Server sind beteiligt -- der Twilio-Stellvertreter (nimmt den Anruf
an) und der echte Jarvis-HTTP-Dienst (verarbeitet die Rueckrufe, signiert
geprueft). Es wird niemand angerufen und es entstehen keine Kosten.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta

import pytest

from jarvis.adapters.phone.twilio import TwilioPhone
from jarvis.db.database import utcnow
from jarvis.errors import ConfigError, CredentialsMissing, ExternalServiceError
from jarvis.server.http_server import JarvisHTTPServer
from tests.stub_twilio import TwilioStub

SID = "ACtest"
TOKEN = "testauthtoken"
OEFFENTLICH = "http://127.0.0.1:8844"


#: Alle ``run``-Aufrufe eines Tests teilen eine Schleife -- der HTTP-Client des
#: Telefonadapters haengt daran, und ein Wechsel mitten im Test waere kuenstlich.
_schleife: asyncio.AbstractEventLoop | None = None


@pytest.fixture(autouse=True)
def schleife():
    global _schleife
    _schleife = asyncio.new_event_loop()
    asyncio.set_event_loop(_schleife)
    yield _schleife
    _schleife.close()
    _schleife = None


def run(coroutine):
    assert _schleife is not None
    return _schleife.run_until_complete(coroutine)


@pytest.fixture
def twilio_stub():
    stub = TwilioStub(port=8843, account_sid=SID, auth_token=TOKEN)
    stub.start()
    yield stub
    stub.stop()


@pytest.fixture
def telefon(services, twilio_stub):
    geraet = TwilioPhone(
        SID, TOKEN, "+4940123456", services.db, my_number="+4915112345678",
        public_base_url=OEFFENTLICH, api_base=twilio_stub.base_url,
    )
    services.phone = geraet
    services.store.set("telefonie", "true")
    yield geraet
    run(geraet.close())


# --- Anruf rausgeben ---------------------------------------------------------
def test_erinnerungsanruf_wird_mit_ansage_und_tasten_abgesetzt(telefon, twilio_stub, services):
    ergebnis = run(telefon.call_reminder("Denk an die Personalplanung", reminder_id=7))

    assert ergebnis.sid.startswith("CA")
    anruf = twilio_stub.calls[0]
    assert anruf["To"] == "+4915112345678"
    assert anruf["From"] == "+4940123456"
    twiml = anruf["Twiml"]
    assert "Denk an die Personalplanung" in twiml
    assert 'language="de-DE"' in twiml
    assert "<Gather" in twiml and "erinnerung=7" in twiml
    assert anruf["StatusCallback"].endswith("/telefon/status")
    # Und im Protokoll steht, was passiert ist.
    protokoll = telefon.recent_calls()[0]
    assert protokoll["purpose"] == "erinnerung:7"
    assert protokoll["provider_sid"] == ergebnis.sid


def test_gespraech_uebergibt_an_den_eigenen_dienst(telefon, twilio_stub):
    run(telefon.call_conversation("Hallo, hier ist Jarvis."))
    anruf = twilio_stub.calls[0]
    assert anruf["Url"].startswith(f"{OEFFENTLICH}/telefon/gespraech")
    assert "Hallo" in urllib.parse.unquote_plus(anruf["Url"])
    assert "Twiml" not in anruf


def test_ohne_oeffentliche_adresse_kein_gespraech(services, twilio_stub):
    geraet = TwilioPhone(SID, TOKEN, "+4940123456", services.db,
                         my_number="+4915112345678", api_base=twilio_stub.base_url)
    with pytest.raises(ConfigError) as fehler:
        run(geraet.call_conversation("Hallo"))
    assert "PUBLIC_BASE_URL" in fehler.value.user_text()
    assert twilio_stub.calls == []
    run(geraet.close())


def test_derselbe_anruf_geht_nicht_zweimal_raus(telefon, twilio_stub):
    run(telefon.call_reminder("Einmal reicht", reminder_id=1))
    with pytest.raises(ExternalServiceError) as fehler:
        run(telefon.call_reminder("Einmal reicht", reminder_id=1))
    assert "wiederhole ihn nicht" in fehler.value.message
    assert len(twilio_stub.calls) == 1


def test_tageslimit_haelt(telefon, twilio_stub):
    telefon.daily_limit = 2
    run(telefon.call_reminder("A", reminder_id=1))
    run(telefon.call_reminder("B", reminder_id=2))
    with pytest.raises(ExternalServiceError) as fehler:
        run(telefon.call_reminder("C", reminder_id=3))
    assert "Tageslimit" in fehler.value.message
    assert len(twilio_stub.calls) == 2


def test_abgelehnte_zugangsdaten_werden_als_solche_gemeldet(telefon, twilio_stub):
    twilio_stub.fail_with = 401
    with pytest.raises(CredentialsMissing):
        run(telefon.call_reminder("Test", reminder_id=1))
    # Der Fehlversuch steht im Protokoll, damit man ihn sieht.
    assert telefon.recent_calls()[0]["status"] == "fehler"


def test_fehler_des_anbieters_wird_weitergegeben(telefon, twilio_stub):
    twilio_stub.fail_with = 400
    with pytest.raises(ExternalServiceError) as fehler:
        run(telefon.call_reminder("Test", reminder_id=1))
    assert "lehnt den Anruf ab" in fehler.value.message


def test_auflegen_und_zustand_abfragen(telefon, twilio_stub):
    ergebnis = run(telefon.call_reminder("Test", reminder_id=1))
    assert run(telefon.hangup(ergebnis.sid)) is True
    assert twilio_stub.updates and twilio_stub.updates[0][1]["Status"] == "completed"
    assert run(telefon.call_status(ergebnis.sid)) == "completed"


def test_zustandspruefung(telefon):
    ok, hinweis = run(telefon.health())
    assert ok and "Testkonto" in hinweis


# --- Rueckrufe: der echte HTTP-Dienst ----------------------------------------
@pytest.fixture
def dienst(services, telefon):
    services.settings.twilio_auth_token = TOKEN
    services.settings.public_base_url = OEFFENTLICH
    services.settings.http_host = "127.0.0.1"
    services.settings.http_port = 8844
    services.settings.http_api_token = "api-token"

    loop = asyncio.new_event_loop()
    thread = threading.Thread(target=loop.run_forever, daemon=True)
    thread.start()
    server = JarvisHTTPServer(services, loop)
    server.start()
    yield server
    server.stop()
    loop.call_soon_threadsafe(loop.stop)
    thread.join(timeout=3)


def signieren(pfad: str, felder: dict[str, str]) -> str:
    nutzlast = f"{OEFFENTLICH}{pfad}" + "".join(f"{k}{felder[k]}" for k in sorted(felder))
    return base64.b64encode(
        hmac.new(TOKEN.encode(), nutzlast.encode(), hashlib.sha1).digest()
    ).decode()


def rueckruf(pfad: str, felder: dict[str, str], *, signatur: str | None = None) -> str:
    anfrage = urllib.request.Request(
        f"{OEFFENTLICH}{pfad}",
        data=urllib.parse.urlencode(felder).encode(), method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Twilio-Signature": signatur if signatur is not None else signieren(pfad, felder),
        },
    )
    with urllib.request.urlopen(anfrage, timeout=15) as antwort:
        return antwort.read().decode()


def test_taste_eins_bestaetigt_die_erinnerung(dienst, services):
    erinnerung = services.reminders.create("Planung", utcnow() - timedelta(minutes=1))
    services.reminders.mark_triggered(erinnerung.id)

    antwort = rueckruf(f"/telefon/erinnerung-antwort?erinnerung={erinnerung.id}",
                       {"Digits": "1", "CallSid": "CA1"})

    assert "<Hangup/>" in antwort and "abgehakt" in antwort
    assert services.reminders.get(erinnerung.id).status == "bestaetigt"


def test_taste_zwei_verschiebt_die_erinnerung(dienst, services):
    erinnerung = services.reminders.create("Planung", utcnow() - timedelta(minutes=1))
    services.reminders.mark_triggered(erinnerung.id)

    antwort = rueckruf(f"/telefon/erinnerung-antwort?erinnerung={erinnerung.id}",
                       {"Digits": "2", "CallSid": "CA1"})

    assert "Minuten" in antwort
    aktuell = services.reminders.get(erinnerung.id)
    assert aktuell.status == "geplant" and aktuell.due_at > utcnow()


def test_falsche_signatur_wird_abgewiesen(dienst, services):
    erinnerung = services.reminders.create("Planung", utcnow() - timedelta(minutes=1))
    with pytest.raises(urllib.error.HTTPError) as fehler:
        rueckruf(f"/telefon/erinnerung-antwort?erinnerung={erinnerung.id}",
                 {"Digits": "1"}, signatur="gefaelscht")
    assert fehler.value.code == 403
    assert services.reminders.get(erinnerung.id).status == "geplant"


def test_gespraech_begruesst_und_hoert_zu(dienst, services):
    antwort = rueckruf("/telefon/gespraech", {"CallSid": "CAgespraech"})
    assert "<Gather" in antwort and 'input="speech"' in antwort
    assert 'language="de-DE"' in antwort
    assert "Jarvis" in antwort


def test_gespraech_fuehrt_werkzeuge_aus_und_antwortet_hoerbar(dienst, services):
    """Gesprochener Auftrag -> echtes Werkzeug -> vorgelesene Antwort."""
    from jarvis.ai.cloud import EchoProvider
    from jarvis.ai.provider import ModelReply, ToolInvocation
    provider = EchoProvider(scripted=[
        ModelReply(text="", tool_calls=[ToolInvocation(
            name="aufgabe_anlegen", arguments={"titel": "Dach reparieren"})]),
        ModelReply(text="Habe ich notiert: Dach reparieren."),
    ])
    services.models.primary = provider
    services.models.active = provider
    services.models.fallback = None

    antwort = rueckruf("/telefon/gespraech", {
        "CallSid": "CAgespraech", "SpeechResult": "Leg eine Aufgabe an: Dach reparieren",
    })

    assert "Habe ich notiert" in antwort
    assert "<Gather" in antwort                     # das Gespraech laeuft weiter
    assert services.tasks.list()[0].title == "Dach reparieren"
    # Der Gespraechsverlauf liegt am selben Ort wie der von Telegram.
    assert services.memory.message_count("telefon:CAgespraech") == 2


def test_markdown_wird_fuer_die_ansage_entfernt(dienst, services):
    from jarvis.ai.cloud import EchoProvider
    from jarvis.ai.provider import ModelReply
    provider = EchoProvider(scripted=[
        ModelReply(text="*Termine heute*\n• 14:00 Planung\n• 16:00 Einsatz")])
    services.models.primary = provider
    services.models.active = provider
    services.models.fallback = None

    antwort = rueckruf("/telefon/gespraech", {
        "CallSid": "CAansage", "SpeechResult": "Was steht heute an?"})

    assert "*" not in antwort and "•" not in antwort
    assert "14:00 Planung" in antwort


def test_bestaetigungspflichtiges_wird_am_telefon_nicht_ausgefuehrt(dienst, services):
    """Am Telefon gibt es keine Freigabe -- die Aktion wandert nach Telegram."""
    from jarvis.ai.cloud import EchoProvider
    from jarvis.ai.provider import ModelReply, ToolInvocation
    aufgabe = services.tasks.create("Nicht loeschen")
    provider = EchoProvider(scripted=[ModelReply(text="", tool_calls=[ToolInvocation(
        name="aufgabe_loeschen", arguments={"aufgabe": str(aufgabe.id)})])])
    services.models.primary = provider
    services.models.active = provider
    services.models.fallback = None

    antwort = rueckruf("/telefon/gespraech", {
        "CallSid": "CAschutz", "SpeechResult": f"Loesche Aufgabe {aufgabe.id}"})

    assert "Telegram" in antwort
    assert services.tasks.get(aufgabe.id) is not None
    assert services.permissions.open_requests() == []


def test_abschiedswort_beendet_das_gespraech(dienst, services):
    antwort = rueckruf("/telefon/gespraech", {
        "CallSid": "CAende", "SpeechResult": "Danke, tschuess"})
    assert "<Hangup/>" in antwort
    assert "<Gather" not in antwort


def test_gespraech_ist_begrenzt(dienst, services):
    services.db.execute(
        "INSERT INTO voice_session (call_sid, chat_id, state, turns, created_at, updated_at) "
        "VALUES ('CAlang', '', '{}', 99, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"
    )
    antwort = rueckruf("/telefon/gespraech", {
        "CallSid": "CAlang", "SpeechResult": "Und weiter?"})
    assert "<Hangup/>" in antwort
    assert "spaeter" in antwort


def test_statusrueckruf_wird_protokolliert(dienst, services, telefon):
    ergebnis = run(telefon.call_reminder("Test", reminder_id=1))
    rueckruf("/telefon/status", {"CallSid": ergebnis.sid, "CallStatus": "completed"})
    protokoll = telefon.recent_calls()[0]
    assert protokoll["status"] == "completed"
    assert any(e["kind"] == "anruf_beendet" for e in services.memory.recent_events())
