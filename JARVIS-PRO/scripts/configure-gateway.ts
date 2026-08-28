/**
 * `pnpm configure:gateway` - fuehrt durch die Telefonie-Einrichtung.
 *
 * Es werden keine Zugangsdaten erfunden. Was vom gekauften Gateway kommt,
 * steht hier als Platzhalter und wird ausdruecklich als "von dir einzutragen"
 * markiert. Am Ende entstehen die Asterisk-Konfigurationsdateien unter
 * `infra/asterisk/erzeugt/` - dort kannst du sie ansehen, bevor sie irgendwo
 * hinkopiert werden. Dieses Skript kopiert nichts nach /etc.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadDotEnv } from '../apps/orchestrator/src/config.js';
import { createPrompt } from './lib/prompt.js';

const ZIEL = 'infra/asterisk/erzeugt';

interface Antworten {
  gatewayIp: string;
  gatewayPort: string;
  sipUser: string;
  sipRealm: string;
  jarvisNummer: string;
  noahNummer: string;
  ariUser: string;
  audioSocketHost: string;
  audioSocketPort: string;
}

async function main(): Promise<void> {
  const env = { ...loadDotEnv(), ...process.env } as Record<string, string>;
  const prompt = await createPrompt();

  console.log('\n' + '='.repeat(72));
  console.log('Jarvis Pro - Telefonie einrichten');
  console.log('='.repeat(72));
  console.log(`
Bevor es losgeht, drei Punkte, die ueber alles Weitere entscheiden:

1. Jarvis braucht eine eigene SIM-Karte in einem GSM- oder VoLTE-Gateway,
   das SIP spricht. Ein zweites Handy funktioniert dafuer NICHT: ein Handy
   ist kein SIP-Trunk. Es kann Anrufe weder an Asterisk uebergeben noch von
   dort entgegennehmen. Die SIM muss aus dem Handy in das Gateway.

2. Das Gateway muss zum deutschen Netz des jeweiligen Anbieters passen.
   Reine 2G-Gateways sind in Deutschland nicht mehr brauchbar, weil die
   Netze abgeschaltet wurden. Gebraucht wird ein Geraet mit VoLTE.

3. Die Zugangsdaten kommen vom Geraet, nicht von mir. Ich trage sie hier
   als Platzhalter ein und markiere sie.
`);

  const frage = (text: string, vorgabe = ''): Promise<string> => prompt.frage(text, vorgabe);

  const a: Antworten = {
    gatewayIp: await frage('IP-Adresse des Gateways im Heimnetz', '192.168.1.50'),
    gatewayPort: await frage('SIP-Port des Gateways', '5060'),
    sipUser: await frage('SIP-Benutzername auf dem Gateway', 'jarvis'),
    sipRealm: await frage('SIP-Realm bzw. Domain des Gateways', '192.168.1.50'),
    jarvisNummer: await frage('Rufnummer der Jarvis-SIM (E.164)', env['JARVIS_SIM_PHONE_E164'] ?? ''),
    noahNummer: await frage('Rufnummer von Noah (E.164)', env['JARVIS_OWNER_PHONE_E164'] ?? ''),
    ariUser: await frage('ARI-Benutzername', env['ARI_USER'] ?? 'jarvis'),
    audioSocketHost: await frage('Host, auf dem Jarvis Audio annimmt', env['ARI_AUDIOSOCKET_HOST'] ?? '127.0.0.1'),
    audioSocketPort: await frage('Port dafuer', env['ARI_AUDIOSOCKET_PORT'] ?? '41000'),
  };
  prompt.close();

  mkdirSync(ZIEL, { recursive: true });

  const kopf = (datei: string): string =>
    [
      `; ${datei}`,
      `; Erzeugt von "pnpm configure:gateway" am ${new Date().toISOString()}.`,
      ';',
      '; PLATZHALTER-DATEI. Vor dem Einsatz durchlesen.',
      '; Alles, was mit "BITTE-EINTRAGEN" markiert ist, kommt vom Gateway',
      '; bzw. aus dem Schluesselbund und steht bewusst nicht hier.',
      ';',
    ].join('\n');

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

; ---------------------------------------------------------------------------
; Trunk zum GSM/VoLTE-Gateway
;
; Das Gateway ist die einzige Verbindung nach draussen. Es gibt bewusst
; keinen zweiten Trunk und keine Registrierung bei einem VoIP-Anbieter -
; Jarvis soll ausschliesslich ueber die eigene SIM erreichbar sein.
; ---------------------------------------------------------------------------
[gsm-gateway]
type = registration
transport = transport-udp
outbound_auth = gsm-gateway-auth
server_uri = sip:${a.sipRealm}:${a.gatewayPort}
client_uri = sip:${a.sipUser}@${a.sipRealm}
retry_interval = 60
forbidden_retry_interval = 600
expiration = 3600

[gsm-gateway-auth]
type = auth
auth_type = userpass
username = ${a.sipUser}
; BITTE-EINTRAGEN: das Passwort steht auf dem Gateway.
; Es gehoert NICHT in diese Datei, wenn sie im Repository liegt.
; Empfehlung: diese Datei nach /etc/asterisk kopieren und dort eintragen,
; mit Dateirechten 0640 und Eigentuemer asterisk.
password = BITTE-EINTRAGEN

[gsm-gateway]
type = aor
contact = sip:${a.sipUser}@${a.gatewayIp}:${a.gatewayPort}
qualify_frequency = 30

[gsm-gateway]
type = endpoint
transport = transport-udp
context = jarvis-eingehend
; A-law: der Standard in Deutschland. Ohne diese Beschraenkung handelt
; Asterisk unter Umstaenden einen Codec aus, den das Gateway nicht kann.
disallow = all
allow = alaw
allow = ulaw
outbound_auth = gsm-gateway-auth
aors = gsm-gateway
from_user = ${a.sipUser}
from_domain = ${a.sipRealm}
; DTMF als RFC-2833-Ereignisse. Inband-Toene ueberstehen die Codec-Wandlung
; nicht zuverlaessig - und ohne zuverlaessiges DTMF gibt es keine Freigabe.
dtmf_mode = rfc4733
direct_media = no
force_rport = yes
rewrite_contact = yes

[gsm-gateway]
type = identify
endpoint = gsm-gateway
match = ${a.gatewayIp}
`,
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
 same => n,Dial(PJSIP/\${EXTEN}@gsm-gateway,45)
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
  console.log('  pjsip.conf            Trunk zum Gateway');
  console.log('  extensions.conf       Rufnummernplan (nur Noahs Nummer waehlbar)');
  console.log('  ari.conf              Zugang der Anwendung zur Telefonanlage');
  console.log('  http.conf             nur localhost');
  console.log('  modules-hinweis.txt   welche Module gebraucht werden');
  console.log(`
Naechste Schritte:

  1. Die Dateien durchlesen. Ueberall, wo BITTE-EINTRAGEN steht, gehoert ein
     Wert vom Gateway hin.
  2. ARI-Passwort in den Schluesselbund legen:
       ${
         process.platform === 'darwin'
           ? 'security add-generic-password -U -s de.hermservice.jarvis-pro -a ari-password -w'
           : 'secret-tool store --label "jarvis ari-password" service de.hermservice.jarvis-pro account ari-password'
       }
  3. Dateien nach /etc/asterisk kopieren, Rechte 0640, Eigentuemer asterisk.
  4. asterisk -rx "core reload"
  5. Verbindung pruefen:
       asterisk -rx "pjsip show registrations"
       asterisk -rx "pjsip show endpoints"
  6. Erst danach in .env JARVIS_MODE auf dry-run stellen.

Solange das Gateway nicht da ist: "pnpm simulate:call" tut es auch.
`);
}

void main();
