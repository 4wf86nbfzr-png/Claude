/**
 * `pnpm configure:gateway` - fuehrt durch die Telefonie-Einrichtung.
 *
 * Es gibt zwei Wege zu einer Rufnummer, die Asterisk annehmen kann:
 *
 *   a) eigene SIM in einem GSM/VoLTE-Gateway im eigenen Netz
 *   b) eine Rufnummer bei einem VoIP-Anbieter (SIP-Trunk)
 *
 * Fuer Jarvis sind beide gleichwertig - der Adapter sieht in beiden Faellen
 * nur einen SIP-Trunk. Der Unterschied liegt woanders: bei (b) laeuft das
 * Gespraech ueber einen fremden Anbieter, der die Verbindungsdaten sieht.
 * Deshalb fragt dieses Skript den Weg ab, statt ihn zu raten.
 *
 * Es werden keine Zugangsdaten erfunden. Was vom Gateway bzw. vom Anbieter
 * kommt, steht als "BITTE-EINTRAGEN" in der Datei. Am Ende entstehen die
 * Asterisk-Konfigurationsdateien unter `infra/asterisk/erzeugt/` - dort
 * kannst du sie ansehen, bevor sie irgendwo hinkopiert werden. Dieses Skript
 * kopiert nichts nach /etc.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadDotEnv } from '../apps/orchestrator/src/config.js';
import { createPrompt } from './lib/prompt.js';

const ZIEL = 'infra/asterisk/erzeugt';

type Weg = 'gateway' | 'voip';

interface Antworten {
  readonly weg: Weg;
  /** IP des Gateways im Heimnetz bzw. Registrar-Hostname des Anbieters. */
  readonly trunkHost: string;
  readonly trunkPort: string;
  readonly sipUser: string;
  /** SIP-Domain: beim Gateway dessen Adresse, beim Anbieter dessen Domain. */
  readonly sipRealm: string;
  readonly jarvisNummer: string;
  readonly noahNummer: string;
  readonly ariUser: string;
  readonly ariHost: string;
  readonly ariPort: string;
}

const EINLEITUNG: Record<Weg, string> = {
  gateway: `
Weg A - eigene SIM im eigenen Gateway.

1. Ein zweites Handy funktioniert dafuer NICHT: ein Handy ist kein SIP-Trunk.
   Es kann Anrufe weder an Asterisk uebergeben noch von dort entgegennehmen.
   Die SIM muss aus dem Handy in das Gateway.

2. Das Geraet braucht VoLTE. Reine 2G-Gateways sind in Deutschland nicht mehr
   brauchbar, weil die Netze abgeschaltet wurden.

3. Pruefe vor dem Einlegen der SIM die AGB des Mobilfunktarifs. Manche Tarife
   untersagen den Betrieb in "GSM-Gateways" ausdruecklich.

Kriterien fuer den Kauf: docs/gateway-kaufberatung.md
`,
  voip: `
Weg B - Rufnummer bei einem VoIP-Anbieter.

1. Der Tarif muss SIP-Zugangsdaten fuer die EIGENE Telefonanlage herausgeben.
   Ein Tarif, der nur mit der App oder einem bestimmten Telefon des Anbieters
   laeuft, ist unbrauchbar.

2. DTMF muss nach RFC 2833 / RFC 4733 uebertragen werden. Ohne zuverlaessiges
   DTMF gibt es keine Freigabe-PIN und damit keinen Versand.

3. Ausgehende Anrufe muessen erlaubt sein und meist vorher aufgeladen werden.
   Ein Anschluss, der nur eingehend kann, kann dich nicht zurueckrufen.

4. Ehrlich gesagt: der Anbieter sieht, wann du mit Jarvis telefonierst - den
   Inhalt nicht, aber die Verbindungsdaten. Das ist der Preis dafuer, dass es
   ohne Hardware und ohne Wartezeit losgeht.

Auswahl und Anmeldung: docs/voip-nummer.md
`,
};

async function main(): Promise<void> {
  const env = { ...loadDotEnv(), ...process.env } as Record<string, string>;
  const prompt = await createPrompt();
  const frage = (text: string, vorgabe = ''): Promise<string> => prompt.frage(text, vorgabe);

  console.log('\n' + '='.repeat(72));
  console.log('Jarvis Pro - Telefonie einrichten');
  console.log('='.repeat(72));
  console.log(`
Jarvis braucht eine Rufnummer, die eine Telefonanlage annehmen kann. Dafuer
gibt es zwei Wege. Fuer die Software sind sie gleichwertig - du kannst
spaeter wechseln, ohne eine Zeile Code zu aendern.

  A) Eigene SIM in einem GSM/VoLTE-Gateway
     Deine Nummer, deine Hardware, kein Dritter dazwischen.
     Braucht ein Geraet (Kauf) und ein paar Tage Einrichtung.

  B) Rufnummer bei einem VoIP-Anbieter (SIP-Trunk)
     Heute noch einsatzbereit, keine Hardware.
     Der Anbieter sieht die Verbindungsdaten deiner Gespraeche.
`);

  const wahl = (await frage('Welcher Weg? A oder B', 'B')).trim().toUpperCase();
  const weg: Weg = wahl.startsWith('A') ? 'gateway' : 'voip';
  console.log(EINLEITUNG[weg]);

  const gateway = weg === 'gateway';
  const a: Antworten = {
    weg,
    trunkHost: await frage(
      gateway ? 'IP-Adresse des Gateways im Heimnetz' : 'SIP-Server / Registrar des Anbieters',
      gateway ? '192.168.1.50' : 'BITTE-EINTRAGEN',
    ),
    trunkPort: await frage('SIP-Port', '5060'),
    sipUser: await frage(
      gateway ? 'SIP-Benutzername auf dem Gateway' : 'SIP-Benutzername (vom Anbieter vergeben)',
      gateway ? 'jarvis' : 'BITTE-EINTRAGEN',
    ),
    sipRealm: await frage(
      gateway ? 'SIP-Realm bzw. Domain des Gateways' : 'SIP-Domain des Anbieters',
      gateway ? '192.168.1.50' : 'BITTE-EINTRAGEN',
    ),
    jarvisNummer: await frage(
      gateway ? 'Rufnummer der Jarvis-SIM (E.164)' : 'Rufnummer von Jarvis beim Anbieter (E.164)',
      env['JARVIS_SIM_PHONE_E164'] ?? '',
    ),
    noahNummer: await frage('Rufnummer von Noah (E.164)', env['JARVIS_OWNER_PHONE_E164'] ?? ''),
    ariUser: await frage('ARI-Benutzername', env['ARI_USER'] ?? 'jarvis'),
    ariHost: await frage('Host, auf dem Jarvis Audio annimmt', env['ARI_AUDIOSOCKET_HOST'] ?? '127.0.0.1'),
    ariPort: await frage('Port dafuer', env['ARI_AUDIOSOCKET_PORT'] ?? '41000'),
  };
  prompt.close();

  mkdirSync(ZIEL, { recursive: true });

  const kopf = (datei: string): string =>
    [
      `; ${datei}`,
      `; Erzeugt von "pnpm configure:gateway" am ${new Date().toISOString()}.`,
      `; Weg: ${a.weg === 'gateway' ? 'eigene SIM im GSM/VoLTE-Gateway' : 'Rufnummer bei einem VoIP-Anbieter'}`,
      ';',
      '; PLATZHALTER-DATEI. Vor dem Einsatz durchlesen.',
      '; Alles, was mit "BITTE-EINTRAGEN" markiert ist, kommt vom Gateway bzw.',
      '; vom Anbieter oder aus dem Schluesselbund und steht bewusst nicht hier.',
      ';',
    ].join('\n');

  // Der Trunk heisst in beiden Faellen gleich. So bleibt der Rufnummernplan
  // identisch, und ein Wechsel des Weges beruehrt nur diese eine Datei.
  const TRUNK = 'jarvis-trunk';

  // Beim Gateway kommt der Anruf von einer festen IP im eigenen Netz - die
  // laesst sich hart pruefen. Beim Anbieter kann die IP wechseln; dort
  // ordnet die Registrierung (line = yes) den eingehenden Anruf zu, und
  // "match" mit dem Hostnamen ist nur die zweite Spur.
  const zuordnung = gateway
    ? `[${TRUNK}]
type = identify
endpoint = ${TRUNK}
match = ${a.trunkHost}
`
    : `[${TRUNK}]
type = identify
endpoint = ${TRUNK}
; Hostnamen loest Asterisk beim Laden auf, nicht bei jedem Anruf. Wenn der
; Anbieter seine Adressen aendert, braucht es ein "pjsip reload". Die
; eigentliche Zuordnung eingehender Anrufe macht "line = yes" oben.
match = ${a.trunkHost}
`;

  const natHinweis = gateway
    ? ''
    : `
; ---------------------------------------------------------------------------
; NAT
;
; Der Anbieter steht ausserhalb deines Routers. Ohne die folgenden Angaben
; kommt der Ruf zustande, aber es ist nichts zu hoeren ("Einwegaudio") -
; der haeufigste Fehler bei SIP-Trunks hinter einem Heimrouter.
;
; BITTE-EINTRAGEN: oeffentliche Adresse bzw. DynDNS-Name deines Anschlusses.
; Bei fester IP kann auch die IP stehen.
; ---------------------------------------------------------------------------
; In [transport-udp] ergaenzen, sobald der Name bekannt ist:
;   external_media_address = BITTE-EINTRAGEN
;   external_signaling_address = BITTE-EINTRAGEN
;   local_net = 192.168.0.0/16
;   local_net = 10.0.0.0/8
`;

  writeFileSync(
    `${ZIEL}/pjsip.conf`,
    `${kopf('pjsip.conf')}
; ---------------------------------------------------------------------------
; Transport
; ---------------------------------------------------------------------------
[transport-udp]
type = transport
protocol = udp
bind = 0.0.0.0:5060
${natHinweis}
; ---------------------------------------------------------------------------
; Der einzige Trunk nach draussen
;
; Es gibt bewusst nur diesen einen. Jarvis soll ueber genau eine Nummer
; erreichbar sein und ueber genau diesen Weg hinaustelefonieren.
; ---------------------------------------------------------------------------
[${TRUNK}]
type = registration
transport = transport-udp
outbound_auth = ${TRUNK}-auth
server_uri = sip:${a.sipRealm}:${a.trunkPort}
client_uri = sip:${a.sipUser}@${a.sipRealm}
retry_interval = 60
forbidden_retry_interval = 600
expiration = 3600
${
  gateway
    ? ''
    : `; Bindet eingehende Anrufe an diesen Endpunkt - unabhaengig davon, von
; welcher IP des Anbieters sie kommen.
line = yes
endpoint = ${TRUNK}
`
}
[${TRUNK}-auth]
type = auth
auth_type = userpass
username = ${a.sipUser}
; BITTE-EINTRAGEN: das SIP-Passwort ${gateway ? 'vom Gateway' : 'vom Anbieter'}.
; Es gehoert NICHT in diese Datei, solange sie im Repository liegt.
; Empfehlung: die Datei nach /etc/asterisk kopieren und dort eintragen,
; mit Dateirechten 0640 und Eigentuemer asterisk.
password = BITTE-EINTRAGEN

[${TRUNK}]
type = aor
contact = sip:${gateway ? `${a.sipUser}@` : ''}${a.trunkHost}:${a.trunkPort}
qualify_frequency = 30

[${TRUNK}]
type = endpoint
transport = transport-udp
context = jarvis-eingehend
; A-law: der Standard in Deutschland. Ohne diese Beschraenkung handelt
; Asterisk unter Umstaenden einen Codec aus, den die Gegenstelle nicht kann.
disallow = all
allow = alaw
allow = ulaw
outbound_auth = ${TRUNK}-auth
aors = ${TRUNK}
from_user = ${a.sipUser}
from_domain = ${a.sipRealm}
${
  gateway
    ? ''
    : `; Manche Anbieter erwarten hier statt des Benutzernamens die Rufnummer
; (${a.jarvisNummer || 'deine Jarvis-Nummer'}), teils ohne fuehrendes Plus. Wenn ausgehende Anrufe mit
; 403 abgelehnt werden, ist das der erste Punkt zum Ausprobieren.
`
}
; DTMF als RFC-4733-Ereignisse. Inband-Toene ueberstehen die Codec-Wandlung
; nicht zuverlaessig - und ohne zuverlaessiges DTMF gibt es keine Freigabe.
dtmf_mode = rfc4733
direct_media = no
force_rport = yes
rewrite_contact = yes
${gateway ? '' : 'rtp_symmetric = yes\n'}
${zuordnung}`,
  );

  writeFileSync(
    `${ZIEL}/extensions.conf`,
    `${kopf('extensions.conf')}
[general]
static = yes
writeprotect = yes

; ---------------------------------------------------------------------------
; Eingehende Anrufe
;
; ALLES geht nach Stasis, also in die Jarvis-Anwendung. Es gibt bewusst keine
; Voicemail, keine Weiterleitung und kein Menue: was Jarvis nicht selbst
; annimmt, soll gar nicht erst erreichbar sein.
;
; Die Pruefung, WER anruft, passiert nicht hier, sondern in der Anwendung -
; zusammen mit der PIN. Eine Filterung allein nach Caller-ID waere zu
; schwach, weil sie sich faelschen laesst.
; ---------------------------------------------------------------------------
[jarvis-eingehend]
exten => _X.,1,NoOp(Eingehender Anruf von \${CALLERID(num)} an \${EXTEN})
 same => n,Answer()
 same => n,Stasis(${env['ARI_APP'] ?? 'jarvis'})
 same => n,Hangup()

exten => s,1,NoOp(Eingehender Anruf ohne Nummer)
 same => n,Answer()
 same => n,Stasis(${env['ARI_APP'] ?? 'jarvis'})
 same => n,Hangup()

; ---------------------------------------------------------------------------
; Ausgehende Anrufe
;
; Es gibt genau EINEN erlaubten Weg nach draussen, und der fuehrt zu Noahs
; Nummer. Der Kontext nimmt keine andere Nummer entgegen - selbst wenn in der
; Anwendung etwas schiefginge, koennte hier niemand sonst angerufen werden.
; Das ist die zweite Sicherung hinter der Allowlist im Code.
; ---------------------------------------------------------------------------
[jarvis-ausgehend]
exten => ${a.noahNummer},1,NoOp(Jarvis ruft den Eigentuemer)
 same => n,Set(CALLERID(num)=${a.jarvisNummer})
${
  gateway
    ? ''
    : `; Falls der Anbieter das fuehrende Plus nicht annimmt, in der Dial-Zeile
; darunter die Zielnummer in nationaler bzw. 00-Schreibweise fest eintragen
; statt \${EXTEN} zu verwenden. Die Allowlist im Code prueft weiterhin E.164.
`
} same => n,Dial(PJSIP/\${EXTEN}@${TRUNK},45)
 same => n,Hangup()

exten => _X.,1,NoOp(ABGELEHNT: Anruf an \${EXTEN} ist nicht erlaubt)
 same => n,Hangup(21)
`,
  );

  writeFileSync(
    `${ZIEL}/ari.conf`,
    `${kopf('ari.conf')}
[general]
enabled = yes
pretty = no
; Nur lokal erreichbar. ARI hat vollen Zugriff auf die Telefonanlage und
; gehoert unter keinen Umstaenden ins offene Netz.
allowed_origins = http://localhost:8088

[${a.ariUser}]
type = user
read_only = no
; BITTE-EINTRAGEN: dasselbe Passwort, das im Schluesselbund unter
; "ari-password" liegt. Es steht bewusst nicht in dieser Datei.
password = BITTE-EINTRAGEN
password_format = plain
`,
  );

  writeFileSync(
    `${ZIEL}/http.conf`,
    `${kopf('http.conf')}
[general]
enabled = yes
; Ausschliesslich auf localhost. Wer ARI von aussen erreichbar macht, gibt
; die Telefonanlage her.
bindaddr = 127.0.0.1
bindport = 8088
`,
  );

  writeFileSync(
    `${ZIEL}/modules-hinweis.txt`,
    `Benoetigte Asterisk-Module

  res_ari.so, res_ari_channels.so, res_ari_bridges.so, res_ari_events.so
  res_stasis.so
  res_audiosocket.so      <- fuer die Audio-Uebergabe an Jarvis
  chan_pjsip.so
  codec_alaw.so, codec_ulaw.so
  res_rtp_asterisk.so

Pruefen mit:
  asterisk -rx "module show like ari"
  asterisk -rx "module show like audiosocket"

Fehlt res_audiosocket, ist Asterisk ohne dieses Modul gebaut worden.
Dann hilft nur ein Paket bzw. Build, der es enthaelt.

Jarvis nimmt das Audio auf ${a.ariHost}:${a.ariPort} entgegen
(ARI_AUDIOSOCKET_HOST / ARI_AUDIOSOCKET_PORT in .env).

WICHTIG: Die Parameter des externalMedia-Aufrufs haben sich zwischen den
Asterisk-Versionen veraendert. Bitte gegen die Dokumentation der bei dir
INSTALLIERTEN Version pruefen. Der Adapter in
apps/telephony/src/asterisk.ts ist gegen die Protokollbeschreibung
geschrieben und noch nie gegen eine laufende Anlage getestet
(siehe docs/api-annahmen.md, Abschnitt Asterisk).
`,
  );

  console.log('\n' + '='.repeat(72));
  console.log('Konfigurationsvorlagen erzeugt');
  console.log('='.repeat(72));
  console.log(`Sie liegen unter ${ZIEL}/ und wurden NICHT nach /etc kopiert.\n`);
  console.log(`  pjsip.conf            Trunk ${gateway ? 'zum Gateway' : 'zum VoIP-Anbieter'}`);
  console.log('  extensions.conf       Rufnummernplan (nur Noahs Nummer waehlbar)');
  console.log('  ari.conf              Zugang der Anwendung zur Telefonanlage');
  console.log('  http.conf             nur localhost');
  console.log('  modules-hinweis.txt   welche Module gebraucht werden');
  console.log(`
Naechste Schritte:

  1. Die Dateien durchlesen. Ueberall, wo BITTE-EINTRAGEN steht, gehoert ein
     Wert ${gateway ? 'vom Gateway' : 'vom Anbieter'} hin.
  2. ARI-Passwort in den Schluesselbund legen:
       ${
         process.platform === 'darwin'
           ? 'security add-generic-password -U -s de.hermservice.jarvis-pro -a ari-password -w'
           : 'secret-tool store --label "jarvis ari-password" service de.hermservice.jarvis-pro account ari-password'
       }
  3. Dateien nach /etc/asterisk kopieren, Rechte 0640, Eigentuemer asterisk.
  4. asterisk -rx "core reload"
  5. Verbindung pruefen:
       asterisk -rx "pjsip show registrations"   -> erwartet: Registered
       asterisk -rx "pjsip show endpoints"       -> erwartet: Avail
  6. Erst danach in .env JARVIS_MODE auf dry-run stellen.
${
  gateway
    ? ''
    : `
  Wenn der Ruf zustande kommt, aber nichts zu hoeren ist, fehlen die
  NAT-Angaben in [transport-udp]. Sie stehen oben in pjsip.conf als
  Kommentar bereit.
`
}
Solange nichts davon steht: "pnpm simulate:call" tut es auch.
`);
}

void main();
