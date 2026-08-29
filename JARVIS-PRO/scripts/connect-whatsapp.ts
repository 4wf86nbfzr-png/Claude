/**
 * `pnpm connect:whatsapp` - hinterlegt die Zugangsdaten fuer die
 * WhatsApp Business Cloud API.
 *
 * Direkt bei Meta. Kein Business Solution Provider, keine Automatisierung von
 * WhatsApp Web, keine inoffizielle Bibliothek.
 *
 * Die Geheimnisse werden verdeckt eingelesen und wandern in den
 * Schluesselbund. Sie stehen nie in der .env, nie in der Shell-Historie und
 * nie im Log.
 */
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { detectSecretStore, randomToken } from '@jarvis/security';
import { loadConfig } from '../apps/orchestrator/src/config.js';
import { createPrompt } from './lib/prompt.js';

async function verdeckt(frage: string): Promise<string> {
  if (stdin.isTTY !== true) {
    // Ohne Terminal kann nichts verdeckt eingelesen werden. Dann lieber
    // abbrechen als ein Geheimnis sichtbar entgegennehmen.
    throw new Error('Geheimnisse koennen nur an einem Terminal eingegeben werden.');
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    const anyRl = rl as unknown as { _writeToOutput?: (s: string) => void; output?: NodeJS.WriteStream };
    let erste = true;
    anyRl._writeToOutput = (s: string): void => {
      if (erste) {
        anyRl.output?.write(s);
        erste = false;
        return;
      }
      if (s.includes('\n')) anyRl.output?.write('\n');
    };
    rl.question(frage, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const secrets = await detectSecretStore();

  console.log('\n' + '='.repeat(72));
  console.log('WhatsApp Business Cloud API verbinden');
  console.log('='.repeat(72));

  if (config.whatsapp.phoneNumberId.length === 0) {
    console.log(`
WHATSAPP_PHONE_NUMBER_ID ist nicht gesetzt.

Das brauchst du vorher, alles direkt bei Meta:

  1. Eine App im Meta-Entwicklerportal mit dem Produkt "WhatsApp".
  2. Ein WhatsApp Business Account (WABA).
  3. Die Rufnummer dort registriert.

  ZUR BESTEHENDEN NUMMER - das ist die entscheidende Frage:
  Eine Nummer, die heute in der WhatsApp-Business-APP laeuft, kann nicht
  einfach parallel ueber die Cloud API bedient werden. Meta bietet dafuer
  ein Coexistence- bzw. Migrationsverfahren an; welche Variante fuer deine
  Nummer gilt und was sie kostet, steht im WhatsApp Manager.

  Bitte VOR dem Umstellen klaeren. Eine falsch migrierte Nummer ist in der
  App weg.

  UND: alte Nachrichten aus der App lassen sich ueber die Cloud API NICHT
  rueckwirkend abrufen. Jarvis kennt nur, was ab der Anbindung hereinkommt.
  Das ist eine Eigenschaft der Schnittstelle, nicht dieser Software.

Die nicht geheimen Kennungen gehoeren in die .env:
  WHATSAPP_PHONE_NUMBER_ID
  WHATSAPP_WABA_ID
  WHATSAPP_GRAPH_VERSION   (aktuell ${config.whatsapp.graphVersion})
`);
    process.exitCode = 1;
    return;
  }

  const prompt = await createPrompt();
  console.log(`
Es werden drei Geheimnisse hinterlegt. Die Eingabe bleibt jeweils unsichtbar.

  1. Zugangstoken (System User Token). Kurzlebige Tokens laufen nach
     Stunden ab - fuer den Dauerbetrieb wird ein System-User-Token mit
     langer Laufzeit gebraucht.
  2. App Secret. Damit werden eingehende Webhooks geprueft. Ohne dieses
     Geheimnis nimmt Jarvis keinen Webhook an.
  3. Verify Token. Den denkst du dir selbst aus; er wird beim Einrichten des
     Webhooks bei Meta eingetragen.
`);

  const weiter = await prompt.frage('Weiter? (ja/nein)', 'ja');
  prompt.close();
  if (weiter.toLowerCase() !== 'ja') {
    console.log('Abgebrochen. Es wurde nichts veraendert.');
    return;
  }

  try {
    const token = await verdeckt('\nZugangstoken:  ');
    if (token.length < 20) {
      console.error('Das sieht nicht nach einem gueltigen Token aus. Es wurde nichts gespeichert.');
      process.exitCode = 1;
      return;
    }
    const appSecret = await verdeckt('App Secret:    ');
    if (appSecret.length < 16) {
      console.error('Das App Secret ist zu kurz. Es wurde nichts gespeichert.');
      process.exitCode = 1;
      return;
    }

    const vorschlag = randomToken(24);
    console.log(`\nVerify Token - Vorschlag (kannst du so uebernehmen):\n  ${vorschlag}\n`);
    const verifyToken = (await verdeckt('Verify Token:  ')) || vorschlag;

    await secrets.set('whatsapp-access-token', token);
    await secrets.set('whatsapp-app-secret', appSecret);
    await secrets.set('whatsapp-verify-token', verifyToken);

    console.log('\n' + '='.repeat(72));
    console.log('Hinterlegt.');
    console.log('='.repeat(72));
    console.log(`Ablage: ${secrets.kind}`);
    console.log('In der .env steht davon nichts.\n');
    console.log('Webhook bei Meta eintragen:');
    console.log(`  Callback-URL:   https://<deine-domain>/webhook/whatsapp`);
    console.log(`  Verify Token:   der eben eingegebene`);
    console.log(`  Felder:         messages`);
    console.log(`
Ohne oeffentlich erreichbare HTTPS-Adresse kommen keine Webhooks an.
Fuer einen Rechner im Buero heisst das: entweder eine Portfreigabe mit
gueltigem Zertifikat oder ein Tunneldienst. Der Webhook-Endpunkt selbst
lauscht nur auf localhost:${config.whatsapp.webhookPort}.

Solange kein Webhook eingerichtet ist, funktioniert alles andere weiter -
nur WhatsApp-Nachrichten erreichen Jarvis dann nicht.
`);
  } catch (err) {
    console.error('\n' + (err instanceof Error ? err.message : String(err)));
    console.error('Es wurde nichts gespeichert.');
    process.exitCode = 1;
  }
}

void main();
