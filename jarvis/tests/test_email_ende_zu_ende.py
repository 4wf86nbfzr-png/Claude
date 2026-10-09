"""E-Mail vollstaendig: echter IMAP-Abruf, echter SMTP-Versand.

Gegen die Stellvertreter in ``stub_mail`` laufen die echten Clients aus der
Standardbibliothek. Damit wird geprueft, was Doppelgaenger nicht pruefen
koennen: Verbindung, Anmeldung, Suche, Abruf, Kopfzeilen-Dekodierung,
HTML-Entschlackung und der Versandweg.
"""

from __future__ import annotations

import asyncio

import pytest

from jarvis.adapters.email.imap_smtp import EmailAdapter
from jarvis.errors import CredentialsMissing, ExternalServiceError
from tests.stub_mail import ImapStub, SmtpStub, build_message

BENUTZER = "ich@example.org"
PASSWORT = "geheim"


def run(coroutine):
    return asyncio.run(coroutine)


@pytest.fixture
def imap():
    stub = ImapStub(port=8845, user=BENUTZER, password=PASSWORT)
    stub.start()
    yield stub
    stub.stop()


@pytest.fixture
def smtp():
    stub = SmtpStub(port=8846, user=BENUTZER, password=PASSWORT)
    stub.start()
    yield stub
    stub.stop()


@pytest.fixture
def postfach(imap, smtp):
    return EmailAdapter(
        imap_host="127.0.0.1", imap_port=imap.port, imap_user=BENUTZER,
        imap_password=PASSWORT, imap_ssl=False, imap_folder="INBOX",
        smtp_host="127.0.0.1", smtp_port=smtp.port, smtp_user=BENUTZER,
        smtp_password=PASSWORT, smtp_starttls=False, from_addr=BENUTZER,
        important_senders=["alex@example.org"],
        important_keywords=["personalplanung"],
        timeout=10.0,
    )


# --- Abrufen ------------------------------------------------------------------
def test_ungelesene_werden_geholt_und_eingestuft(postfach, imap):
    imap.add(build_message(
        from_addr="Alex Krapp <alex@example.org>", to_addr=BENUTZER,
        subject="Personalplanung November", body="Moin, passt Dienstag?",
    ))
    imap.add(build_message(
        from_addr="werbung@example.com", to_addr=BENUTZER,
        subject="Newsletter", body="Angebote der Woche", message_id="<m2@example.org>",
    ), unread=True)
    imap.add(build_message(
        from_addr="alt@example.org", to_addr=BENUTZER, subject="Gelesen",
        body="schon gelesen", message_id="<m3@example.org>",
    ), unread=False)

    nachrichten = run(postfach.fetch_unread(limit=10))

    # Nur die ungelesenen, neueste zuerst.
    assert len(nachrichten) == 2
    betreffs = [n.subject for n in nachrichten]
    assert "Personalplanung November" in betreffs and "Gelesen" not in betreffs

    wichtig = next(n for n in nachrichten if n.subject == "Personalplanung November")
    assert wichtig.from_addr == "alex@example.org"
    assert wichtig.from_name == "Alex Krapp"
    assert wichtig.important is True
    assert any("Absender" in grund for grund in wichtig.reasons)
    assert wichtig.date is not None and wichtig.date.strftime("%d.%m.") == "08.10."

    unwichtig = next(n for n in nachrichten if n.subject == "Newsletter")
    assert unwichtig.important is False


def test_kodierte_kopfzeilen_werden_entschluesselt(postfach, imap):
    imap.add(build_message(
        from_addr="Jörg Müller <joerg@example.org>", to_addr=BENUTZER,
        subject="Übergabe für Dienstag — dringend", body="Grüße",
    ))
    nachrichten = run(postfach.fetch_unread())
    assert nachrichten[0].subject == "Übergabe für Dienstag — dringend"
    assert nachrichten[0].from_name == "Jörg Müller"
    # "dringend" im Betreff macht sie wichtig, auch ohne hinterlegten Absender.
    assert nachrichten[0].important is True


def test_volltext_wird_nur_bei_bedarf_geholt(postfach, imap):
    imap.add(build_message(
        from_addr="alex@example.org", to_addr=BENUTZER, subject="Mit Text",
        body="Die erste Zeile.\nDie zweite Zeile.",
    ))
    ohne = run(postfach.fetch_unread(with_body=False))
    assert ohne[0].body == ""
    assert "HEADER.FIELDS" in " ".join(imap.commands)

    mit = run(postfach.fetch_unread(with_body=True))
    assert "Die zweite Zeile." in mit[0].body
    assert "Die erste Zeile." in mit[0].snippet


def test_html_nachricht_wird_lesbar_gemacht(postfach, imap):
    imap.add(build_message(
        from_addr="alex@example.org", to_addr=BENUTZER, subject="Nur HTML",
        body="Moin <b>Alex</b> &amp; Team", html=True,
    ))
    nachricht = run(postfach.fetch_recent(with_body=True))[0]
    assert "<b>" not in nachricht.body
    assert "Moin" in nachricht.body and "Team" in nachricht.body


def test_einzelne_nachricht_nach_kennung(postfach, imap):
    uid = imap.add(build_message(
        from_addr="alex@example.org", to_addr=BENUTZER, subject="Einzeln",
        body="Nur diese eine.",
    ))
    nachricht = run(postfach.fetch_one(str(uid)))
    assert nachricht is not None
    assert nachricht.subject == "Einzeln"
    assert "Nur diese eine." in nachricht.body
    assert run(postfach.fetch_one("999")) is None


def test_suche_nach_stichwort(postfach, imap):
    imap.add(build_message(from_addr="alex@example.org", to_addr=BENUTZER,
                           subject="Angebot Reinigung", body="Anbei das Angebot"))
    imap.add(build_message(from_addr="jan@example.org", to_addr=BENUTZER,
                           subject="Urlaubsantrag", body="Vom 3. bis 7.",
                           message_id="<m2@example.org>"))
    treffer = run(postfach.search("Angebot"))
    assert len(treffer) == 1
    assert treffer[0].subject == "Angebot Reinigung"


def test_leeres_postfach_ist_kein_fehler(postfach):
    assert run(postfach.fetch_unread()) == []


def test_zustandspruefung_zaehlt_ungelesene(postfach, imap):
    imap.add(build_message(from_addr="a@example.org", to_addr=BENUTZER,
                           subject="Eins", body="x"))
    imap.add(build_message(from_addr="b@example.org", to_addr=BENUTZER,
                           subject="Zwei", body="y", message_id="<m2@example.org>"),
             unread=False)
    ok, hinweis = run(postfach.health())
    assert ok
    assert "1 ungelesen" in hinweis and BENUTZER in hinweis


def test_abgelehnte_anmeldung_nennt_app_passwort(postfach, imap):
    imap.reject_login = True
    with pytest.raises(CredentialsMissing) as fehler:
        run(postfach.fetch_unread())
    assert "App-Passwort" in fehler.value.user_text()


def test_nicht_erreichbarer_server_wird_gemeldet(imap, smtp):
    postfach = EmailAdapter(
        imap_host="127.0.0.1", imap_port=8899, imap_user=BENUTZER,
        imap_password=PASSWORT, imap_ssl=False, timeout=2.0,
    )
    with pytest.raises(ExternalServiceError) as fehler:
        run(postfach.fetch_unread())
    assert "nicht erreichbar" in fehler.value.message


# --- Versenden ----------------------------------------------------------------
def test_versand_kommt_wirklich_an(postfach, smtp):
    run(postfach.send(
        "alex@example.org", "Rueckmeldung Personalplanung",
        "Moin Alex,\n\nDienstag passt.\n\nGruesse",
    ))
    assert smtp.received, "Der Stellvertreter hat nichts erhalten"
    absender, empfaenger, roh = smtp.received[0]
    assert absender == BENUTZER
    assert empfaenger == ["alex@example.org"]
    assert "Subject: Rueckmeldung Personalplanung" in roh
    assert "Dienstag passt." in roh


def test_antwort_bezieht_sich_auf_die_vorlage(postfach, smtp):
    run(postfach.send("alex@example.org", "Re: Planung", "Passt.",
                      in_reply_to="<urspruenglich@example.org>"))
    _, _, roh = smtp.received[0]
    assert "In-Reply-To: <urspruenglich@example.org>" in roh
    assert "References: <urspruenglich@example.org>" in roh


def test_umlaute_im_versand(postfach, smtp):
    run(postfach.send("alex@example.org", "Übergabe", "Grüße aus Hamburg, schönen Tag."))
    _, _, roh = smtp.received[0]
    # Aus Bytes lesen, nicht aus str: eine 8-Bit-Nachricht aus einer
    # Zeichenkette zu parsen ist in Python verlustbehaftet.
    import email
    import email.policy
    nachricht = email.message_from_bytes(roh.encode("utf-8"), policy=email.policy.default)
    assert nachricht["Subject"] == "Übergabe"
    assert "Grüße aus Hamburg" in nachricht.get_content()
    assert nachricht.get_content_charset() == "utf-8"


def test_abgelehnte_anmeldung_beim_senden(postfach, smtp):
    smtp.reject_auth = True
    with pytest.raises(CredentialsMissing) as fehler:
        run(postfach.send("alex@example.org", "Test", "Text"))
    assert "Senden" in fehler.value.message
    assert smtp.received == []


def test_abgelehnte_nachricht_wird_nicht_als_erfolg_verbucht(postfach, smtp):
    smtp.reject_data = True
    with pytest.raises(ExternalServiceError):
        run(postfach.send("alex@example.org", "Test", "Text"))
    assert smtp.received == []


# --- Zusammenspiel mit Jarvis -------------------------------------------------
def test_werkzeuge_und_hintergrunddienst_arbeiten_mit_dem_echten_postfach(
    services, postfach, imap, smtp,
):
    """Von der Postfachpruefung bis zum bestaetigten Versand -- echte Verbindungen."""
    services.email = postfach
    services.notifier.quiet_start = services.notifier.quiet_end = ""
    gemeldet: list[str] = []

    async def sender(text, keyboard=None):
        gemeldet.append(text)
        return True

    services.notifier.set_sender(sender)

    imap.add(build_message(
        from_addr="Alex Krapp <alex@example.org>", to_addr=BENUTZER,
        subject="Personalplanung November", body="Moin, brauchst du Dienstag Leute?",
    ))

    # 1) Der Hintergrunddienst findet die wichtige Nachricht und meldet sie.
    bericht = run(services._job_check_email(type("J", (), {"payload": {}})()))
    assert "1 gemeldet" in bericht
    assert any("Personalplanung November" in text for text in gemeldet)
    # Ein zweiter Durchlauf meldet sie nicht erneut.
    assert "0 gemeldet" in run(services._job_check_email(type("J", (), {"payload": {}})()))

    # 2) Das Werkzeug listet sie auf.
    liste = run(services.toolkit.execute("email_ungelesen", {"nur_wichtige": True}))
    assert liste.ok and "Personalplanung" in liste.text

    # 3) Entwurf schreiben (das Ersatzmodell liefert den Text).
    entwurf = run(services.toolkit.execute(
        "email_antwort_entwerfen", {"uid": "1", "inhalt": "Dienstag passt, zwei Leute."}
    ))
    assert entwurf.ok and entwurf.data["an"] == "alex@example.org"
    assert entwurf.data["betreff"].startswith("Re: Personalplanung")

    # 4) Senden verlangt eine Bestaetigung ...
    anfrage = run(services.toolkit.execute(
        "email_senden", {"entwurf": entwurf.data["id"]}, chat_id="42"
    ))
    assert anfrage.confirmation_token
    assert smtp.received == []

    # 5) ... und erst danach geht sie wirklich raus.
    ergebnis = run(services.build_agent().confirm(anfrage.confirmation_token, chat_id="42"))
    assert "Versendet" in ergebnis.text
    absender, empfaenger, roh = smtp.received[0]
    assert empfaenger == ["alex@example.org"]
    assert "Re: Personalplanung November" in roh
