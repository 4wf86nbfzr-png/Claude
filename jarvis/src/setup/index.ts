/**
 * Einrichtungsassistent für die Kommandozeile.
 *
 * Fragt der Reihe nach ab, was JARVIS zum Arbeiten braucht, und schreibt das
 * Ergebnis in eine .env-Datei im Datenverzeichnis. Geheimnisse landen im
 * verschlüsselten Tresor, sofern eine Passphrase gesetzt ist – andernfalls
 * sagt der Assistent deutlich, dass sie im Klartext in der Datei stehen.
 *
 * Aufruf: npm run setup
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { stdin, stdout } from 'node:process';
import { defaultDataDir, loadEnvFile } from '../core/services/config';
import { CredentialService, PassphraseEncryptor, SECRET_CATALOG } from '../core/services/credentials';

/**
 * Zeilenweises Lesen über einen Iterator statt über readline/promises:
 * `rl.question` löst bei nicht-interaktiver Eingabe (Pipe, Skript) nur die
 * erste Frage auf. Der Iterator arbeitet in beiden Fällen zuverlässig.
 */
const rl = createInterface({ input: stdin, terminal: false });
const zeilen = rl[Symbol.asyncIterator]();

const frage = async (text: string, standard = ''): Promise<string> => {
  stdout.write(standard ? `${text} [${standard}]: ` : `${text}: `);
  const { value, done } = await zeilen.next();
  if (done) {
    stdout.write('\n');
    return standard;
  }
  return String(value).trim() || standard;
};

const auswahl = async (text: string, optionen: string[], standard: string): Promise<string> => {
  console.log(`\n${text}`);
  optionen.forEach((option, index) => console.log(`  ${index + 1}) ${option}`));
  const eingabe = await frage(`Auswahl 1-${optionen.length}`, String(optionen.indexOf(standard) + 1));
  const nummer = Number(eingabe);
  return optionen[Number.isInteger(nummer) && nummer >= 1 && nummer <= optionen.length ? nummer - 1 : 0] ?? standard;
};

const jaNein = async (text: string, standard = true): Promise<boolean> => {
  const antwort = (await frage(`${text} (j/n)`, standard ? 'j' : 'n')).toLowerCase();
  return antwort.startsWith('j') || antwort.startsWith('y');
};

async function main(): Promise<void> {
  console.log('\n  JARVIS – Einrichtung\n  ────────────────────\n');

  const datenVerzeichnis = defaultDataDir();
  mkdirSync(datenVerzeichnis, { recursive: true });
  const envPfad = join(datenVerzeichnis, '.env');
  const werte: Record<string, string> = {};

  if (existsSync(envPfad)) {
    console.log(`Es gibt bereits eine Konfiguration unter ${envPfad}.`);
    if (!(await jaNein('Soll sie überschrieben werden?', false))) {
      console.log('Abgebrochen. Es wurde nichts geändert.');
      rl.close();
      return;
    }
  }

  // Für den Tresor wird eine Passphrase gebraucht, solange wir außerhalb der App laufen.
  const vorhandeneEnv: NodeJS.ProcessEnv = {};
  loadEnvFile(envPfad, vorhandeneEnv);
  let masterKey = process.env.JARVIS_MASTER_KEY ?? vorhandeneEnv.JARVIS_MASTER_KEY ?? '';
  if (!masterKey) {
    console.log(
      '\nGeheimnisse (API-Schlüssel, Passwörter) können verschlüsselt abgelegt werden.\n' +
        'Dafür wird eine Passphrase gebraucht, die beim Start als JARVIS_MASTER_KEY gesetzt sein muss.'
    );
    if (await jaNein('Verschlüsselten Tresor einrichten?', true)) {
      masterKey = await frage('Passphrase (mindestens 8 Zeichen)');
      if (masterKey.length < 8) {
        console.log('Zu kurz – es wird kein Tresor eingerichtet.');
        masterKey = '';
      }
    }
  }
  const credentials = masterKey
    ? new CredentialService(join(datenVerzeichnis, 'tresor.json'), new PassphraseEncryptor(masterKey), {})
    : null;

  // ---- Sprachmodell ----
  const llm = await auswahl(
    'Welches Sprachmodell soll JARVIS benutzen?',
    ['anthropic', 'openai-kompatibel', 'keiner'],
    'anthropic'
  );
  werte.JARVIS_LLM_PROVIDER = llm;
  if (llm === 'anthropic') {
    werte.JARVIS_LLM_MODEL = await frage('Modell', 'claude-sonnet-5');
    await geheimnis('ANTHROPIC_API_KEY');
  } else if (llm === 'openai-kompatibel') {
    werte.JARVIS_LLM_BASE_URL = await frage('Basis-Adresse', 'https://api.openai.com/v1');
    werte.JARVIS_LLM_MODEL = await frage('Modell', 'gpt-4o-mini');
    await geheimnis('OPENAI_API_KEY');
  }

  // ---- Websuche ----
  const suche = await auswahl(
    'Welchen Suchdienst soll die Unternehmensrecherche benutzen?',
    ['brave', 'tavily', 'serpapi', 'keiner'],
    'brave'
  );
  werte.JARVIS_SEARCH_PROVIDER = suche;
  if (suche === 'brave') await geheimnis('BRAVE_API_KEY');
  if (suche === 'tavily') await geheimnis('TAVILY_API_KEY');
  if (suche === 'serpapi') await geheimnis('SERPAPI_API_KEY');

  // ---- E-Mail ----
  const mail = await auswahl('Wie sollen E-Mails versendet werden?', ['smtp', 'gmail', 'keiner'], 'smtp');
  werte.JARVIS_MAIL_PROVIDER = mail;
  if (mail === 'smtp') {
    werte.SMTP_HOST = await frage('SMTP-Server', 'smtp.ihr-anbieter.de');
    werte.SMTP_PORT = await frage('Port', '587');
    werte.SMTP_SECURE = (await jaNein('Verbindung von Anfang an verschlüsselt (Port 465)?', false)) ? 'true' : 'false';
    werte.SMTP_USER = await frage('Benutzername');
    await geheimnis('SMTP_PASSWORD');
  }
  if (mail === 'gmail') {
    console.log('\nFür Gmail wird ein OAuth-Client vom Typ "Desktop" aus der Google Cloud Console gebraucht.');
    await geheimnis('GOOGLE_CLIENT_ID');
    await geheimnis('GOOGLE_CLIENT_SECRET');
    console.log('Die Anmeldung selbst erfolgt später in der App unter Einstellungen → Mit Google verbinden.');
  }
  if (mail !== 'keiner') {
    werte.MAIL_FROM_ADDRESS = await frage('Absenderadresse', 'dispo@hermserviceteam.com');
    werte.MAIL_FROM_NAME = await frage('Absendername', 'HERM Service Team');
  }

  // ---- Posteingang ----
  if (await jaNein('\nSollen Antworten über IMAP zugeordnet werden?', false)) {
    werte.IMAP_HOST = await frage('IMAP-Server');
    werte.IMAP_PORT = await frage('Port', '993');
    werte.IMAP_USER = await frage('Benutzername', werte.SMTP_USER ?? '');
    await geheimnis('IMAP_PASSWORD');
  }

  // ---- Absenderprofil ----
  console.log('\nAngaben für die Mailerzeugung und die Signatur:');
  werte.JARVIS_SENDER_COMPANY = await frage('Firma', 'HERM Service Team e.K.');
  werte.JARVIS_SENDER_PERSON = await frage('Ihr Name');
  werte.JARVIS_SENDER_ROLE = await frage('Ihre Funktion', 'Disposition');
  werte.JARVIS_SENDER_PHONE = await frage('Telefon');
  werte.JARVIS_SENDER_WEB = await frage('Website', 'https://hermserviceteam.com');
  werte.JARVIS_SENDER_ADDRESS = await frage('Anschrift (eine Zeile)');

  // ---- Grenzen ----
  werte.JARVIS_DAILY_SEND_LIMIT = await frage('\nHöchstzahl versendeter Mails pro Tag', '30');
  werte.JARVIS_DRY_RUN = (await jaNein('Testbetrieb starten (nichts wird wirklich versendet)?', true))
    ? 'true'
    : 'false';

  // Die Passphrase wird bewusst NICHT mitgeschrieben – sonst läge der
  // Schlüssel neben dem Tresor, den er schützen soll.

  const zeilen = [
    '# Von "npm run setup" erzeugt.',
    '# Geheimnisse stehen hier nur, wenn kein Tresor eingerichtet wurde.',
    `# Erzeugt am ${new Date().toISOString()}`,
    '',
    ...Object.entries(werte)
      .filter(([, wert]) => wert !== '')
      .map(([schluessel, wert]) => `${schluessel}=${wert}`),
    ''
  ];
  writeFileSync(envPfad, zeilen.join('\n'), { mode: 0o600 });
  try {
    chmodSync(envPfad, 0o600);
  } catch {
    // Unter Windows ohne Wirkung.
  }

  console.log(`\nFertig. Konfiguration gespeichert in ${envPfad}`);
  if (masterKey && credentials) {
    console.log(
      'Die Geheimnisse liegen verschlüsselt in tresor.json. Setzen Sie JARVIS_MASTER_KEY beim Start,\n' +
        'oder hinterlegen Sie die Schlüssel in der App erneut – dort übernimmt der Schlüsselbund des Systems.'
    );
  }
  console.log('Starten mit:  npm start\n');
  rl.close();

  async function geheimnis(name: string): Promise<void> {
    const definition = SECRET_CATALOG.find((eintrag) => eintrag.name === name);
    const vorhanden = credentials?.get(name);
    const beschriftung = `${definition?.label ?? name}${definition ? ` (${definition.hint})` : ''}`;
    if (vorhanden) {
      console.log(`${beschriftung}: bereits hinterlegt.`);
      return;
    }
    const wert = await frage(beschriftung);
    if (!wert) {
      console.log('  Übersprungen – lässt sich später in der App nachtragen.');
      return;
    }
    if (credentials) {
      credentials.set(name, wert);
      console.log('  Im verschlüsselten Tresor abgelegt.');
    } else {
      werte[name] = wert;
      console.log('  ACHTUNG: wird im Klartext in der .env-Datei gespeichert (Dateirechte 600).');
    }
  }
}

main().catch((fehler: Error) => {
  console.error(`\nEinrichtung fehlgeschlagen: ${fehler.message}`);
  rl.close();
  process.exit(1);
});
