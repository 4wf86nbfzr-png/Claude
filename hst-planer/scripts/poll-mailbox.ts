/**
 * Postfach abrufen und neue Personalanfragen anlegen.
 *
 *   npm run mail:poll
 *
 * Für den Dauerbetrieb in einen Cron eintragen, z. B. alle fünf Minuten:
 *   *\/5 * * * * cd /srv/hst-planer && npm run mail:poll >> /var/log/hst-mail.log 2>&1
 */
import { config } from 'dotenv';
config({ path: '.env', quiet: true });

async function main() {
  const { postfachAbrufen, postfachKonfiguriert } = await import('../src/lib/email/mailbox');
  if (!postfachKonfiguriert()) {
    console.error('Kein Postfach konfiguriert. Bitte EMAIL_HOST, EMAIL_USER und EMAIL_PASSWORD in der .env setzen.');
    process.exit(1);
  }
  const ergebnis = await postfachAbrufen();
  console.log(
    `${ergebnis.geprueft} Nachrichten geprüft, ${ergebnis.neu} neu gespeichert, ` +
    `${ergebnis.anfragen} Personalanfragen angelegt, ${ergebnis.uebersprungen} übersprungen.`,
  );
  for (const fehler of ergebnis.fehler) console.error('  Fehler:', fehler);
  process.exit(ergebnis.fehler.length ? 1 : 0);
}

main().catch((fehler) => { console.error(fehler); process.exit(1); });
