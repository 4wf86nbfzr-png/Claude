/* ============================================================
   Die Nachricht am Morgen
   ------------------------------------------------------------
   Drei Wege, alle optional, alle gleichzeitig moeglich:
     Mail    — ueber den eigenen Postausgang (nodemailer)
     Webhook — POST als JSON, fuer Chat-Dienste
     Konsole — laeuft immer, damit man beim Einrichten etwas sieht

   Es geht kein Personenname an Dritte: die Mail nennt Zahlen und
   den Link ins Werkzeug, nicht die Namensliste. Wer die Namen
   sehen will, oeffnet den Abgleich im Bueronetz.
   ============================================================ */

export function textBauen(paket, adresse) {
  const zahl = paket.soll.length;
  const einsaetze = [...new Set(paket.soll.map((s) => s.einsatz).filter(Boolean))];
  const zeilen = [
    `Moin,`,
    ``,
    `fuer ${deutsch(paket.tag)} stehen ${zahl} Schichten zum Abgleich bereit.`,
    einsaetze.length ? `Einsätze: ${einsaetze.slice(0, 8).join(', ')}${einsaetze.length > 8 ? ' …' : ''}` : '',
    paket.ist && paket.ist.length
      ? `${paket.ist.length} Zeiten sind bereits per Schnellerfassung eingegangen.`
      : `Es liegen noch keine gemeldeten Zeiten vor.`,
    ``,
    `Abgleich öffnen: ${adresse}`,
    ``,
    `— Brücke, automatisch erzeugt`
  ];
  return zeilen.filter((z) => z !== '').join('\n');
}

function deutsch(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  const tage = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return `${tage[d.getDay()]}, ${m[3]}.${m[2]}.${m[1]}`;
}

export async function schicken(konfig, paket, adresse) {
  const text = textBauen(paket, adresse);
  const betreff = (konfig.mail.betreff || 'Schichtabgleich {datum}').replace('{datum}', deutsch(paket.tag));
  const berichte = [];

  console.log('\n' + betreff + '\n' + '-'.repeat(betreff.length) + '\n' + text + '\n');
  berichte.push('Konsole');

  if (konfig.mail.aktiv && konfig.mail.an && konfig.mail.an.length) {
    try {
      const { default: nodemailer } = await import('nodemailer');
      const post = nodemailer.createTransport(konfig.mail.smtp);
      await post.sendMail({
        from: konfig.mail.von || konfig.mail.smtp?.auth?.user,
        to: konfig.mail.an.join(', '),
        subject: betreff,
        text
      });
      berichte.push('Mail an ' + konfig.mail.an.length + ' Empfänger');
    } catch (f) {
      const grund = /Cannot find (package|module)/.test(f.message)
        ? 'nodemailer fehlt — im Ordner bruecke/ einmal:  npm install nodemailer'
        : f.message;
      console.error('Mail nicht versendet: ' + grund);
      berichte.push('Mail gescheitert');
    }
  }

  if (konfig.webhook) {
    try {
      await fetch(konfig.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tag: paket.tag, schichten: paket.soll.length, adresse })
      });
      berichte.push('Webhook');
    } catch (f) {
      console.error('Webhook nicht erreicht: ' + f.message);
    }
  }

  return berichte;
}
