-- ===========================================================================
--  Der Bestandskundenbereich — Schema
-- ---------------------------------------------------------------------------
--  Die Website war bis hierher vollstaendig zustandslos: statische Dateien
--  plus eine Funktion, die eine Mail verschickt. Ein Bestandskundenkonto
--  laesst sich so nicht bauen — Passwoerter, Sitzungen, Passkeys und
--  Anfragen muessen irgendwo liegen, und zwar serverseitig.
--
--  Gewaehlt ist PostgreSQL, angesprochen ueber DATABASE_URL. Das laeuft bei
--  Neon, Supabase, Vercel Postgres und jedem verwalteten Postgres, und es
--  bindet den Betrieb an keinen Anbieter.
--
--  Grundsaetze, die im ganzen Schema durchgehalten werden:
--
--  * **Nur was gebraucht wird.** Kein Feld steht hier, das nicht in einer
--    Anfrage oder in der Anmeldung vorkommt. Was der Betrieb nicht braucht,
--    darf er nach der DSGVO auch nicht speichern.
--  * **Kein Geheimnis im Klartext.** Passwoerter liegen als scrypt-Hash,
--    Sitzungsmarken und Reset-Marken nur als SHA-256 ihres Wertes. Wer die
--    Datenbank liest, kann sich damit nicht anmelden.
--  * **Loeschen muss gehen.** Alles haengt ueber ON DELETE CASCADE am
--    Kunden. Ein Loeschauftrag ist damit eine Zeile.
--  * **Zeiten immer mit Zone** (timestamptz). Ein Einsatz von 16 bis 23 Uhr
--    ist dagegen eine Ortszeit ohne Zone: er findet um 16 Uhr statt, egal
--    was die Sommerzeit macht. Deshalb dort date und time.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS schema_stand (
  version     integer PRIMARY KEY,
  angewandt   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
--  Kunden
-- ---------------------------------------------------------------------------
--  `anmeldename` ist die Anmeldung, `email` der Weg fuer die Bestaetigung und
--  fuer „Passwort vergessen". Beide sind eindeutig, beide werden in
--  Kleinschreibung verglichen — sonst meldet sich derselbe Mensch morgen mit
--  „Firma-Muster" an und bekommt ein zweites Konto.
CREATE TABLE IF NOT EXISTS kunden (
  id                bigserial PRIMARY KEY,
  kundennummer      text        NOT NULL UNIQUE,
  firma             text        NOT NULL,
  anmeldename       text        NOT NULL UNIQUE,
  email             text        NOT NULL UNIQUE,
  passwort_hash     text        NOT NULL,
  -- Rechnungsanschrift
  strasse           text        NOT NULL DEFAULT '',
  hausnummer        text        NOT NULL DEFAULT '',
  plz               text        NOT NULL DEFAULT '',
  ort               text        NOT NULL DEFAULT '',
  ustid             text        NOT NULL DEFAULT '',
  -- Wer die Anfrage stellt, wenn niemand anderes ausgewaehlt wird
  telefon           text        NOT NULL DEFAULT '',
  aktiv             boolean     NOT NULL DEFAULT true,
  angelegt          timestamptz NOT NULL DEFAULT now(),
  geaendert         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kunden_anmeldename_idx ON kunden (lower(anmeldename));
CREATE INDEX IF NOT EXISTS kunden_email_idx       ON kunden (lower(email));

-- ---------------------------------------------------------------------------
--  Ansprechpartner
-- ---------------------------------------------------------------------------
--  Ein Kunde hat oft mehrere: Einkauf stellt die Anfrage, die Projektleitung
--  steht vor Ort. Genau einer ist `haupt` und wird vorausgewaehlt.
CREATE TABLE IF NOT EXISTS kunden_ansprechpartner (
  id           bigserial PRIMARY KEY,
  kunde_id     bigint  NOT NULL REFERENCES kunden(id) ON DELETE CASCADE,
  vorname      text    NOT NULL,
  nachname     text    NOT NULL,
  position     text    NOT NULL DEFAULT '',
  email        text    NOT NULL DEFAULT '',
  telefon      text    NOT NULL DEFAULT '',
  haupt        boolean NOT NULL DEFAULT false,
  angelegt     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ansprechpartner_kunde_idx ON kunden_ansprechpartner (kunde_id);
-- Hoechstens ein Hauptansprechpartner je Kunde — von der Datenbank erzwungen,
-- nicht von der Anwendung. Eine Regel, die nur im Code steht, gilt genau so
-- lange, bis jemand einen zweiten Weg in die Tabelle findet.
CREATE UNIQUE INDEX IF NOT EXISTS ansprechpartner_ein_haupt
  ON kunden_ansprechpartner (kunde_id) WHERE haupt;

-- ---------------------------------------------------------------------------
--  Sitzungen
-- ---------------------------------------------------------------------------
--  Im Keks steht eine zufaellige Marke; hier liegt nur ihr SHA-256. Wer diese
--  Tabelle liest, kann sich damit nicht anmelden — genau wie beim Passwort.
CREATE TABLE IF NOT EXISTS sitzungen (
  id            bigserial PRIMARY KEY,
  marke_hash    text        NOT NULL UNIQUE,
  kunde_id      bigint      NOT NULL REFERENCES kunden(id) ON DELETE CASCADE,
  angelegt      timestamptz NOT NULL DEFAULT now(),
  gesehen       timestamptz NOT NULL DEFAULT now(),
  laeuft_ab     timestamptz NOT NULL,
  -- Fuer die Pruefspur und fuer „von welchem Geraet war das?"
  kennung       text        NOT NULL DEFAULT '',
  ip            inet
);
CREATE INDEX IF NOT EXISTS sitzungen_kunde_idx ON sitzungen (kunde_id);
CREATE INDEX IF NOT EXISTS sitzungen_ablauf_idx ON sitzungen (laeuft_ab);

-- ---------------------------------------------------------------------------
--  Passkeys (WebAuthn / FIDO2)
-- ---------------------------------------------------------------------------
--  Der oeffentliche Schluessel ist oeffentlich; er darf hier liegen. Der
--  private verlaesst das Geraet nie — das ist der ganze Sinn des Verfahrens.
--  `zaehler` schuetzt gegen geklonte Authentifikatoren.
CREATE TABLE IF NOT EXISTS passkeys (
  id             bigserial PRIMARY KEY,
  kunde_id       bigint      NOT NULL REFERENCES kunden(id) ON DELETE CASCADE,
  credential_id  text        NOT NULL UNIQUE,   -- base64url
  public_key     bytea       NOT NULL,
  zaehler        bigint      NOT NULL DEFAULT 0,
  transports     text        NOT NULL DEFAULT '',
  geraet         text        NOT NULL DEFAULT '',
  angelegt       timestamptz NOT NULL DEFAULT now(),
  zuletzt        timestamptz
);
CREATE INDEX IF NOT EXISTS passkeys_kunde_idx ON passkeys (kunde_id);

-- Die Aufgabe (Challenge) einer laufenden Passkey-Anmeldung. Sie MUSS
-- serverseitig liegen: kaeme sie aus dem Browser zurueck, koennte der
-- Angreifer sie selbst waehlen, und die ganze Signatur waere wertlos.
CREATE TABLE IF NOT EXISTS passkey_aufgaben (
  id          bigserial PRIMARY KEY,
  marke_hash  text        NOT NULL UNIQUE,
  aufgabe     text        NOT NULL,
  kunde_id    bigint      REFERENCES kunden(id) ON DELETE CASCADE,
  zweck       text        NOT NULL CHECK (zweck IN ('anmeldung','einrichtung')),
  laeuft_ab   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS aufgaben_ablauf_idx ON passkey_aufgaben (laeuft_ab);

-- ---------------------------------------------------------------------------
--  Marken fuer „Passwort vergessen"
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reset_marken (
  id          bigserial PRIMARY KEY,
  marke_hash  text        NOT NULL UNIQUE,
  kunde_id    bigint      NOT NULL REFERENCES kunden(id) ON DELETE CASCADE,
  angelegt    timestamptz NOT NULL DEFAULT now(),
  laeuft_ab   timestamptz NOT NULL,
  benutzt     timestamptz
);
CREATE INDEX IF NOT EXISTS reset_kunde_idx ON reset_marken (kunde_id);

-- ---------------------------------------------------------------------------
--  Anfragen
-- ---------------------------------------------------------------------------
--  `status` ist heute immer 'eingegangen'. Die uebrigen Werte stehen schon in
--  der Pruefung, damit ein spaeterer Bearbeitungsstand keine Migration der
--  vorhandenen Zeilen braucht.
CREATE TABLE IF NOT EXISTS anfragen (
  id              bigserial PRIMARY KEY,
  anfragenummer   text        NOT NULL UNIQUE,
  kunde_id        bigint      NOT NULL REFERENCES kunden(id) ON DELETE CASCADE,
  ansprechpartner_id bigint   REFERENCES kunden_ansprechpartner(id) ON DELETE SET NULL,
  projekt         text        NOT NULL,
  einsatzort      text        NOT NULL,
  adresse         text        NOT NULL DEFAULT '',
  hinweise        text        NOT NULL DEFAULT '',
  status          text        NOT NULL DEFAULT 'eingegangen'
                  CHECK (status IN ('eingegangen','in_pruefung','rueckfrage','bestaetigt','abgeschlossen')),
  -- Der Schluessel gegen Doppelabsenden: derselbe Wert wird nur einmal
  -- angenommen (siehe UNIQUE-Index unten).
  vorgangsschluessel text,
  eingegangen     timestamptz NOT NULL DEFAULT now(),
  -- Wurde die Disposition benachrichtigt? Der Mailversand darf die
  -- Speicherung nicht gefaehrden, deshalb steht er hier als eigener Stand.
  mail_disposition text       NOT NULL DEFAULT 'offen'
                   CHECK (mail_disposition IN ('offen','zugestellt','fehler')),
  mail_kunde       text       NOT NULL DEFAULT 'offen'
                   CHECK (mail_kunde IN ('offen','zugestellt','fehler','aus'))
);
CREATE INDEX IF NOT EXISTS anfragen_kunde_idx ON anfragen (kunde_id, eingegangen DESC);
CREATE UNIQUE INDEX IF NOT EXISTS anfragen_vorgang_idx
  ON anfragen (kunde_id, vorgangsschluessel) WHERE vorgangsschluessel IS NOT NULL;

-- Eine Position ist: so viele Leute dieser Art, an diesem Tag, von wann bis
-- wann. Ein mehrtaegiger Einsatz ist damit einfach eine Position je Tag —
-- das braucht keine eigene Tabelle und keine Wiederholungsregel.
CREATE TABLE IF NOT EXISTS anfrage_positionen (
  id           bigserial PRIMARY KEY,
  anfrage_id   bigint  NOT NULL REFERENCES anfragen(id) ON DELETE CASCADE,
  reihenfolge  integer NOT NULL DEFAULT 0,
  art          text    NOT NULL,          -- Schluessel aus der Personalliste
  art_name     text    NOT NULL,          -- wie er zum Zeitpunkt der Anfrage hiess
  anzahl       integer NOT NULL CHECK (anzahl > 0 AND anzahl <= 999),
  datum        date    NOT NULL,
  von          time    NOT NULL,
  bis          time    NOT NULL,
  -- Ein Einsatz von 16:00 bis 00:30 endet am naechsten Tag. Ohne dieses Feld
  -- muesste man aus „bis < von" raten, und bei „von 10 bis 10" ginge das
  -- Raten schief.
  ueber_nacht  boolean NOT NULL DEFAULT false,
  hinweis      text    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS positionen_anfrage_idx ON anfrage_positionen (anfrage_id, reihenfolge);

-- ---------------------------------------------------------------------------
--  Anmeldeversuche — die Grundlage fuer Rate Limiting und Sperre
-- ---------------------------------------------------------------------------
--  In einer Funktion ohne eigenen Speicher (Vercel, Netlify) gibt es kein
--  gemeinsames Gedaechtnis zwischen zwei Aufrufen. Ein Zaehler im Prozess
--  waere deshalb wirkungslos: der naechste Versuch landet in einer anderen
--  Instanz. Er muss in die Datenbank.
CREATE TABLE IF NOT EXISTS login_versuche (
  id          bigserial PRIMARY KEY,
  kennung     text        NOT NULL,        -- lower(anmeldename) oder 'ip:<adresse>'
  gelungen    boolean     NOT NULL,
  zeitpunkt   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS versuche_kennung_idx ON login_versuche (kennung, zeitpunkt DESC);

-- ---------------------------------------------------------------------------
--  Pruefspur
-- ---------------------------------------------------------------------------
--  Was passiert ist, nicht was gesagt wurde. Hier steht NIE ein Passwort,
--  eine Sitzungsmarke oder ein Reset-Link — auch nicht gehasht.
CREATE TABLE IF NOT EXISTS pruefspur (
  id         bigserial PRIMARY KEY,
  kunde_id   bigint      REFERENCES kunden(id) ON DELETE SET NULL,
  ereignis   text        NOT NULL,
  einzelheit text        NOT NULL DEFAULT '',
  ip         inet,
  zeitpunkt  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pruefspur_kunde_idx ON pruefspur (kunde_id, zeitpunkt DESC);
CREATE INDEX IF NOT EXISTS pruefspur_zeit_idx  ON pruefspur (zeitpunkt DESC);

-- ---------------------------------------------------------------------------
--  Der Zaehler fuer die Anfragenummern
-- ---------------------------------------------------------------------------
--  HST-A-2026-00184: Jahr plus laufende Nummer. Ein Sequenzobjekt je Jahr
--  waere eine Tabelle voller Sequenzen; eine Zeile mit SELECT ... FOR UPDATE
--  ist einfacher und in derselben Transaktion sicher.
CREATE TABLE IF NOT EXISTS nummernkreis (
  bereich  text    PRIMARY KEY,     -- z. B. 'anfrage-2026'
  stand    integer NOT NULL DEFAULT 0
);

INSERT INTO schema_stand (version) VALUES (1) ON CONFLICT DO NOTHING;
