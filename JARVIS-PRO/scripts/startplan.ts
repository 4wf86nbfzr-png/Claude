/**
 * `pnpm startplan` - wo stehe ich, und was ist als Naechstes dran?
 *
 * Prueft den tatsaechlichen Zustand und zeigt genau EINEN naechsten Schritt.
 * Rein lesend, nur maskierte Werte.
 *
 * Der Sinn: die Reihenfolge ist nicht beliebig. Manches haengt an Hardware,
 * die noch kommt - anderes laesst sich schon heute erledigen, waehrend man
 * darauf wartet. Diese Trennung von Hand im Kopf zu behalten, ist die
 * haeufigste Quelle fuer verlorene Wochen.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { detectSecretStore } from '@jarvis/security';
import { loadDotEnv } from '../apps/orchestrator/src/config.js';

type Zustand = 'fertig' | 'offen' | 'blockiert';

interface Schritt {
  readonly nr: number;
  readonly titel: string;
  /** Was zu tun ist. Ein Befehl oder eine Handlung. */
  readonly tun: string;
  /** Warum es gebraucht wird - damit man es nicht ueberspringt. */
  readonly warum: string;
  /** Nummern der Schritte, die vorher fertig sein muessen. */
  readonly braucht: readonly number[];
  /** true = laesst sich ohne das Gateway erledigen. */
  readonly ohneHardware: boolean;
  pruefen(): Promise<boolean> | boolean;
}

function vorhanden(cmd: string): boolean {
  try {
    execFileSync('command', ['-v', cmd], { stdio: 'ignore', shell: '/bin/bash' });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const env = { ...loadDotEnv(), ...process.env } as Record<string, string>;
  const secrets = await detectSecretStore();
  const gesetzt = (k: string): boolean => (env[k] ?? '').trim().length > 0;

  const schritte: Schritt[] = [
    {
      nr: 1,
      titel: 'Projekt auf dem eigenen Rechner einrichten',
      tun: 'pnpm setup',
      warum: 'Ohne whisper.cpp und Piper gibt es kein Hoeren und kein Sprechen.',
      braucht: [],
      ohneHardware: true,
      pruefen: () => gesetzt('WHISPER_BIN') && existsSync(env['WHISPER_BIN'] ?? ''),
    },
    {
      nr: 2,
      titel: 'Sprachausgabe bereitstellen',
      tun: 'Piper und die Stimme de_DE-thorsten-high nach vendor/ bzw. models/ legen, dann PIPER_BIN und PIPER_VOICE in .env eintragen',
      warum: 'Piper wird bewusst nicht automatisch geladen - die Ausgaben unterscheiden sich je nach Plattform.',
      braucht: [1],
      ohneHardware: true,
      pruefen: () => gesetzt('PIPER_BIN') && existsSync(env['PIPER_BIN'] ?? ''),
    },
    {
      nr: 3,
      titel: 'Sprachmodell messen und festlegen',
      tun: 'pnpm bench:speech',
      warum: 'Welches Modell taugt, haengt am Rechner. Eine Empfehlung ohne Messung waere geraten.',
      braucht: [1],
      ohneHardware: true,
      pruefen: () => gesetzt('WHISPER_MODEL') && existsSync(env['WHISPER_MODEL'] ?? ''),
    },
    {
      nr: 4,
      titel: 'Anmelde-PIN festlegen',
      tun: 'pnpm hash:pin, dann den Hash als "login-pin-hash" in den Schluesselbund',
      warum: 'Die Caller-ID allein genuegt nicht - sie laesst sich faelschen.',
      braucht: [],
      ohneHardware: true,
      pruefen: () => secrets.has('login-pin-hash'),
    },
    {
      nr: 5,
      titel: 'Freigabe-PIN festlegen (andere als die Anmelde-PIN)',
      tun: 'pnpm hash:pin, dann den Hash als "approval-pin-hash" in den Schluesselbund',
      warum: 'Ohne sie kann nichts gesendet werden. Waeren beide gleich, verriete eine mitgehoerte Anmeldung die Versandfreigabe.',
      braucht: [],
      ohneHardware: true,
      pruefen: () => secrets.has('approval-pin-hash'),
    },
    {
      nr: 6,
      titel: 'Verhalten im Simulator abnehmen',
      tun: 'pnpm simulate:call und pnpm dry-run',
      warum: 'Vor jedem Kauf pruefen, ob das Gespraech so laeuft, wie du es willst.',
      braucht: [],
      ohneHardware: true,
      // Nicht automatisch pruefbar - es geht um eine Beurteilung, nicht um einen Zustand.
      pruefen: () => false,
    },
    {
      nr: 7,
      titel: 'Anthropic-Zugang hinterlegen',
      tun: 'API-Schluessel als "anthropic-api-key" in den Schluesselbund, JARVIS_MODEL in .env pruefen',
      warum: 'Ohne Modell fuehrt Jarvis kein Gespraech, sondern nur ein Drehbuch.',
      braucht: [],
      ohneHardware: true,
      pruefen: () => secrets.has('anthropic-api-key'),
    },
    {
      nr: 8,
      titel: 'Microsoft 365 verbinden',
      tun: 'pnpm connect:microsoft',
      warum: 'Ohne Postfach gibt es keine neuen E-Mails - und damit keinen Anlass fuer einen Anruf.',
      braucht: [],
      ohneHardware: true,
      pruefen: () => secrets.has('ms-refresh-token'),
    },
    {
      nr: 9,
      titel: 'Trockenlauf gegen das echte Postfach',
      tun: 'In .env JARVIS_MODE=dry-run setzen, pnpm start, ein paar Stunden laufen lassen, dann pnpm status',
      warum: 'Zeigt, ob Ereignisse richtig erkannt werden - ohne dass jemand eine Mail bekommt.',
      braucht: [1, 2, 3, 8],
      ohneHardware: true,
      pruefen: () => (env['JARVIS_MODE'] ?? '') === 'dry-run' && existsSync(env['JARVIS_DB_PATH'] ?? './var/jarvis.db'),
    },
    {
      nr: 10,
      titel: 'Anschluss beschaffen: Gateway ODER VoIP-Nummer',
      tun: 'Weg A: Geraet nach docs/gateway-kaufberatung.md bestellen. Weg B: Nummer nach docs/voip-nummer.md anmelden. Danach GATEWAY_VORHANDEN=ja in .env.',
      warum: 'DAS ist der Blocker fuer alles Telefonische. Ein Handy taugt nicht - es ist kein SIP-Trunk. Weg B geht heute, Weg A ohne fremden Anbieter in der Leitung.',
      braucht: [],
      ohneHardware: true,
      pruefen: () => gesetzt('GATEWAY_VORHANDEN'),
    },
    {
      nr: 11,
      titel: 'Zugangsdaten besorgen, Portierungssperre setzen',
      tun: 'Weg A: SIM aus dem Zweithandy ins Gateway, SIP-Benutzer anlegen. Weg B: SIP-Zugangsdaten in der Kontoverwaltung abrufen. Beide: beim Anbieter eine Portierungssperre einrichten.',
      warum: 'Ohne Sperre koennte jemand die Jarvis-Nummer uebernehmen und die Ansagen mithoeren.',
      braucht: [10],
      ohneHardware: false,
      pruefen: () => false,
    },
    {
      nr: 12,
      titel: 'Asterisk installieren',
      tun: 'Paket der Distribution, oder infra/docker/compose.yml',
      warum: 'Die Telefonanlage zwischen Gateway und Jarvis.',
      braucht: [10],
      ohneHardware: false,
      pruefen: () => vorhanden('asterisk'),
    },
    {
      nr: 13,
      titel: 'Asterisk konfigurieren',
      tun: 'pnpm configure:gateway (fragt nach Weg A oder B), Dateien durchlesen, BITTE-EINTRAGEN ersetzen, nach /etc/asterisk kopieren',
      warum: 'Der Rufnummernplan laesst ausgehend nur deine Nummer zu - zweite Sicherung hinter dem Code.',
      braucht: [12],
      ohneHardware: false,
      pruefen: () => existsSync('/etc/asterisk/pjsip.conf'),
    },
    {
      nr: 14,
      titel: 'Erster echter Testanruf: du rufst Jarvis an',
      tun: 'Jarvis-Nummer vom Handy anrufen, PIN eingeben',
      warum: 'Hier zeigt sich, ob der Asterisk-Adapter stimmt - er ist als einziger Teil noch nie an echter Hardware gelaufen.',
      braucht: [1, 2, 4, 13],
      ohneHardware: false,
      pruefen: () => false,
    },
    {
      nr: 15,
      titel: 'Erster echter Versand - an deine eigene Adresse',
      tun: 'JARVIS_MODE=live und JARVIS_DB_CIPHER=true setzen, Jarvis eine Mail an dich selbst entwerfen und freigeben lassen',
      warum: 'Der erste scharfe Versand geht an niemanden sonst. Pruefen: genau EINE Mail kommt an.',
      braucht: [5, 7, 8, 14],
      ohneHardware: false,
      pruefen: () => (env['JARVIS_MODE'] ?? '') === 'live',
    },
  ];

  const zustaende = new Map<number, Zustand>();
  for (const s of schritte) {
    const fertig = await s.pruefen();
    if (fertig) {
      zustaende.set(s.nr, 'fertig');
      continue;
    }
    const blockiert = s.braucht.some((n) => zustaende.get(n) !== 'fertig');
    zustaende.set(s.nr, blockiert ? 'blockiert' : 'offen');
  }

  const symbol: Record<Zustand, string> = { fertig: '[ok]  ', offen: '[ -> ]', blockiert: '[ .. ]' };

  console.log('\n' + '='.repeat(72));
  console.log('Jarvis Pro - Startplan');
  console.log('='.repeat(72));
  console.log('Reihenfolge ist bindend: was blockiert ist, braucht erst die Vorstufe.\n');

  const ohne = schritte.filter((s) => s.ohneHardware);
  const mit = schritte.filter((s) => !s.ohneHardware);

  console.log('OHNE ANSCHLUSS MOEGLICH - das kannst du jetzt sofort machen');
  console.log('-'.repeat(72));
  for (const s of ohne) {
    const z = zustaende.get(s.nr) ?? 'offen';
    console.log(`${symbol[z]} ${String(s.nr).padStart(2)}. ${s.titel}`);
    if (z !== 'fertig') console.log(`         ${s.tun}`);
  }

  console.log('\nBRAUCHT DEN ANSCHLUSS (Gateway oder VoIP-Nummer)');
  console.log('-'.repeat(72));
  for (const s of mit) {
    const z = zustaende.get(s.nr) ?? 'offen';
    console.log(`${symbol[z]} ${String(s.nr).padStart(2)}. ${s.titel}`);
    if (z !== 'fertig') console.log(`         ${s.tun}`);
  }

  // Genau EIN naechster Schritt - der erste offene ohne Hardware, sonst der
  // erste offene ueberhaupt. Eine Liste mit zwoelf "als Naechstes" ist keine.
  const naechster =
    ohne.find((s) => zustaende.get(s.nr) === 'offen') ??
    schritte.find((s) => zustaende.get(s.nr) === 'offen');

  console.log('\n' + '='.repeat(72));
  if (naechster === undefined) {
    const offen = schritte.filter((s) => zustaende.get(s.nr) !== 'fertig');
    if (offen.length === 0) {
      console.log('Alles erledigt. Jarvis ist startklar.');
    } else {
      console.log('Es geht nur mit dem Anschluss weiter. Alles andere ist vorbereitet.');
      console.log(`Naechster Schritt danach: ${offen[0]?.nr}. ${offen[0]?.titel}`);
    }
  } else {
    console.log(`ALS NAECHSTES: ${naechster.nr}. ${naechster.titel}`);
    console.log('='.repeat(72));
    console.log(`\n  ${naechster.tun}\n`);
    console.log(`  Warum: ${naechster.warum}`);
  }

  const fertig = schritte.filter((s) => zustaende.get(s.nr) === 'fertig').length;
  console.log(`\nStand: ${fertig} von ${schritte.length} Schritten erledigt.`);
  console.log('Ausfuehrlich: docs/betriebshandbuch.md\n');
}

void main();
