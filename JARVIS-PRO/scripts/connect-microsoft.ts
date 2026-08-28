/**
 * `pnpm connect:microsoft` - verbindet Jarvis einmalig mit Microsoft 365.
 *
 * Was hier passiert und was ausdruecklich nicht:
 *   - Es wird ein Browserfenster geoeffnet, in dem DU dich bei Microsoft
 *     anmeldest. Dein Passwort sieht Jarvis nie.
 *   - Zurueck kommt ein Refresh Token. Der landet im Schluesselbund des
 *     Betriebssystems, nicht in einer Datei und nicht im Log.
 *   - Es wird nichts gelesen und nichts gesendet. Das passiert erst im
 *     Betrieb, und Senden nur nach Freigabe.
 *
 * Rueckgaengig machen: `pnpm tsx scripts/connect-microsoft.ts --trennen`
 */
import { execFile } from 'node:child_process';
import { detectSecretStore } from '@jarvis/security';
import { rootLogger } from '@jarvis/observability';
import { MicrosoftOAuth, MS_SCOPES } from '@jarvis/connectors';
import { systemClock } from '@jarvis/domain';
import { loadConfig } from '../apps/orchestrator/src/config.js';
import { createPrompt } from './lib/prompt.js';

function browserOeffnen(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  execFile(cmd, [url], (err) => {
    if (err) {
      console.log('\nDer Browser liess sich nicht automatisch oeffnen.');
      console.log('Bitte diese Adresse von Hand aufrufen:\n');
      console.log(url + '\n');
    }
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const secrets = await detectSecretStore();
  const logger = rootLogger.child('connect-microsoft');

  const oauth = new MicrosoftOAuth(
    {
      tenantId: config.microsoft.tenantId,
      clientId: config.microsoft.clientId,
      redirectUri: config.microsoft.redirectUri,
    },
    { secrets, logger, clock: systemClock },
  );

  if (process.argv.includes('--trennen')) {
    await oauth.disconnect();
    console.log('\nDie Verbindung wurde getrennt. Der Refresh Token ist aus dem Schluesselbund entfernt.');
    console.log('Im Microsoft-Konto solltest du der App zusaetzlich die Berechtigung entziehen:');
    console.log('  https://myaccount.microsoft.com  ->  Apps und Dienste\n');
    return;
  }

  console.log('\n' + '='.repeat(72));
  console.log('Microsoft 365 verbinden');
  console.log('='.repeat(72));

  if (config.microsoft.clientId.length === 0) {
    console.log(`
MS_CLIENT_ID ist nicht gesetzt. Das ist die Kennung einer App-Registrierung,
die du einmal in deinem Microsoft-Konto anlegst. Sie ist kein Geheimnis.

So legst du sie an:
  1. https://entra.microsoft.com  ->  App-Registrierungen  ->  Neue Registrierung
  2. Name: zum Beispiel "Jarvis"
  3. Kontotypen: der Typ, unter dem dein Postfach laeuft
  4. Umleitungs-URI: Typ "Mobil- und Desktopanwendungen",
     Wert: ${config.microsoft.redirectUri}
  5. Unter "Authentifizierung" sicherstellen, dass es ein OEFFENTLICHER
     Client ist. Ein Client Secret wird NICHT gebraucht und soll auch nicht
     angelegt werden - es liesse sich auf deinem Rechner nicht geheim halten.
  6. Die "Anwendungs-ID (Client)" nach MS_CLIENT_ID in die .env eintragen.

Erwartete Berechtigungen (delegiert, mehr nicht):
${MS_SCOPES.map((s) => `     ${s}`).join('\n')}

  Mail.Read und Mail.Send genuegen. Bewusst KEIN Mail.ReadWrite: damit
  koennte Jarvis E-Mails veraendern oder loeschen. Das soll er nicht koennen,
  auch nicht versehentlich.

Danach dieses Skript erneut ausfuehren.
`);
    process.exitCode = 1;
    return;
  }

  if (await oauth.isConnected()) {
    const prompt = await createPrompt();
    const antwort = await prompt.frage(
      'Es ist bereits eine Verbindung hinterlegt. Neu verbinden? (ja/nein)',
      'nein',
    );
    prompt.close();
    if (antwort.toLowerCase() !== 'ja') {
      console.log('Es wurde nichts veraendert.');
      return;
    }
  }

  console.log(`
Gleich oeffnet sich der Browser. Dort meldest du dich bei Microsoft an und
bestaetigst die oben genannten Berechtigungen.

Was du pruefen solltest, bevor du zustimmst:
  - Steht in der Adresszeile login.microsoftonline.com?
  - Wird der Name deiner eigenen App-Registrierung angezeigt?
  - Werden genau die Berechtigungen verlangt, die oben stehen?

Jarvis sieht dein Passwort nie. Zurueck kommt nur ein Token.
`);

  try {
    const { account } = await oauth.runInteractiveLogin(browserOeffnen);
    console.log('\n' + '='.repeat(72));
    console.log('Verbunden.');
    console.log('='.repeat(72));
    console.log(`Postfach: ${account}`);
    console.log('Der Refresh Token liegt im Schluesselbund, nicht in einer Datei.\n');
    console.log('Bitte in die .env eintragen:');
    console.log(`  MS_ACCOUNT=${account}\n`);
    console.log('Naechster Schritt - lesen, ohne etwas zu veraendern:');
    console.log('  In .env JARVIS_MODE=dry-run setzen und "pnpm start" starten.');
    console.log('  Im Trockenlauf wird gelesen und nichts gesendet.\n');
  } catch (err) {
    console.error('\nDie Anmeldung ist fehlgeschlagen.');
    console.error(err instanceof Error ? err.message : String(err));
    console.error('\nEs wurde nichts gespeichert und nichts veraendert.');
    process.exitCode = 1;
  }
}

void main();
