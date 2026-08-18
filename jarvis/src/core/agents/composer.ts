import type { CompanyClaim, Company, Contact } from '../../shared/types';
import type { SenderProfile } from '../services/config';
import type { LlmProvider } from '../services/llm';

export interface MailEntwurfEingabe {
  company: Company;
  contact: Contact | null;
  claims: CompanyClaim[];
  /** Angebotene Leistung, z. B. "24/7 Baustellenbewachung". */
  dienstleistung: string;
  /** Warum dieses Unternehmen interessant ist (aus der Recherche). */
  akquisegrund: string | null;
  sender: SenderProfile;
  /** Zusätzliche Anweisung des Benutzers, etwa "kürzer" oder "persönlicher". */
  anweisung?: string | null;
}

export interface MailEntwurf {
  subject: string;
  bodyText: string;
  akquisegrund: string;
}

const REGELN = `
Du schreibst geschäftliche Erstkontakt-E-Mails für ein Hamburger Personaldienstleistungsunternehmen.

Feste Regeln:
- Deutsch, Sie-Form, hanseatisch-sachlich und warm. Kein Werbedeutsch, keine Superlative.
- Keine erfundenen Angaben. Du darfst NUR die unten aufgeführten belegten Fakten über das
  Unternehmen verwenden. Steht etwas nicht in den Fakten, erwähnst du es nicht.
- Keine Zahlen ohne Beleg (keine erfundenen Referenzen, Jahre, Mitarbeiterzahlen).
- Der erste Satz nimmt konkret Bezug auf das angeschriebene Unternehmen.
- 120 bis 180 Wörter, Absätze durch Leerzeilen getrennt.
- Kein "Sehr geehrte Damen und Herren", wenn ein Ansprechpartner bekannt ist.
- Schließe mit einer einzelnen, konkreten Frage nach einem kurzen Gespräch.
- Keine Grußformel-Signatur erfinden: Die Signatur wird technisch angehängt.
- Kein Hinweis auf KI, keine Platzhalter in eckigen Klammern.

Antworte ausschließlich mit JSON in genau dieser Form:
{"subject": "...", "bodyText": "...", "akquisegrund": "..."}
"akquisegrund" ist eine sachliche Begründung in einem Satz, warum das Unternehmen als Kunde infrage kommt.
`.trim();

/**
 * Erzeugt einen individuellen Akquise-Entwurf (§5).
 *
 * Die belegten Fakten werden dem Modell wörtlich mitgegeben; Einschätzungen
 * werden getrennt gekennzeichnet übergeben, damit sie nicht als Tatsache in
 * die Mail wandern.
 */
export async function erstelleAkquiseMail(llm: LlmProvider, eingabe: MailEntwurfEingabe): Promise<MailEntwurf> {
  const fakten = eingabe.claims.filter((claim) => claim.kind === 'FAKT');
  const einschaetzungen = eingabe.claims.filter((claim) => claim.kind === 'KI_EINSCHAETZUNG');

  const kontext = [
    `Absender: ${eingabe.sender.company}${eingabe.sender.person ? `, ${eingabe.sender.person}` : ''}${
      eingabe.sender.role ? ` (${eingabe.sender.role})` : ''
    }`,
    `Angebot des Absenders: ${eingabe.sender.offering}`,
    `Konkret angebotene Leistung: ${eingabe.dienstleistung}`,
    '',
    `Empfängerunternehmen: ${eingabe.company.name}`,
    eingabe.company.city ? `Ort: ${eingabe.company.city}` : null,
    eingabe.company.industry ? `Branche: ${eingabe.company.industry}` : null,
    eingabe.contact ? `Ansprechpartner: ${eingabe.contact.fullName}${eingabe.contact.role ? `, ${eingabe.contact.role}` : ''}` : 'Ansprechpartner: nicht bekannt',
    '',
    'Belegte Fakten (nur diese verwenden):',
    ...(fakten.length > 0
      ? fakten.map((claim) => `- ${claim.statement}${claim.sourceUrl ? ` [Quelle: ${claim.sourceUrl}]` : ''}`)
      : ['- (keine belegten Fakten vorhanden – dann sehr allgemein bleiben und nichts behaupten)']),
    '',
    'Einschätzungen (NICHT als Tatsache formulieren, höchstens als Frage):',
    ...(einschaetzungen.length > 0 ? einschaetzungen.map((claim) => `- ${claim.statement}`) : ['- (keine)']),
    eingabe.akquisegrund ? `\nVermuteter Anlass: ${eingabe.akquisegrund}` : '',
    eingabe.anweisung ? `\nZusätzliche Anweisung des Benutzers: ${eingabe.anweisung}` : ''
  ]
    .filter((zeile) => zeile !== null)
    .join('\n');

  const antwort = await llm.complete({
    system: REGELN,
    messages: [{ role: 'user', content: kontext }],
    maxTokens: 1200,
    temperature: 0.6
  });

  const entwurf = leseJson(antwort.text);
  if (!entwurf) {
    throw new Error('Das Sprachmodell hat keinen verwertbaren Entwurf geliefert. Bitte erneut versuchen.');
  }
  return {
    subject: entwurf.subject.trim(),
    bodyText: mitSignatur(entwurf.bodyText.trim(), eingabe.sender),
    akquisegrund: (entwurf.akquisegrund ?? eingabe.akquisegrund ?? '').trim()
  };
}

/** Überarbeitet einen bestehenden Entwurf nach Zuruf ("mach ihn kürzer"). */
export async function ueberarbeiteMail(
  llm: LlmProvider,
  vorhanden: { subject: string; bodyText: string },
  anweisung: string,
  sender: SenderProfile
): Promise<{ subject: string; bodyText: string }> {
  const antwort = await llm.complete({
    system:
      `${REGELN}\n\nDu überarbeitest einen bestehenden Entwurf. Behalte alle belegten Angaben bei, ` +
      'erfinde nichts hinzu und ändere nur, was die Anweisung verlangt. ' +
      'Die Signatur am Ende bleibt unverändert erhalten.',
    messages: [
      {
        role: 'user',
        content: `Bisheriger Betreff: ${vorhanden.subject}\n\nBisheriger Text:\n${vorhanden.bodyText}\n\nAnweisung: ${anweisung}`
      }
    ],
    maxTokens: 1200,
    temperature: 0.5
  });
  const entwurf = leseJson(antwort.text);
  if (!entwurf) throw new Error('Die Überarbeitung war nicht lesbar. Bitte erneut versuchen.');
  return {
    subject: entwurf.subject.trim() || vorhanden.subject,
    bodyText: mitSignatur(ohneSignatur(entwurf.bodyText.trim(), sender), sender)
  };
}

/** Signatur aus dem Absenderprofil – wird nie vom Modell erfunden. */
export function signatur(sender: SenderProfile): string {
  if (sender.signature.trim()) return sender.signature.trim();
  return [
    'Mit freundlichen Grüßen',
    '',
    sender.person || null,
    sender.role || null,
    sender.company,
    sender.address || null,
    sender.phone ? `Telefon: ${sender.phone}` : null,
    sender.web || null
  ]
    .filter(Boolean)
    .join('\n');
}

const TRENNER = '\n\n-- \n';

export function mitSignatur(text: string, sender: SenderProfile): string {
  const block = signatur(sender);
  if (!block) return text;
  return text.includes(block) ? text : `${text}${TRENNER}${block}`;
}

export function ohneSignatur(text: string, sender: SenderProfile): string {
  const index = text.indexOf(TRENNER);
  if (index >= 0) return text.slice(0, index);
  const block = signatur(sender);
  return block && text.endsWith(block) ? text.slice(0, text.length - block.length).trimEnd() : text;
}

/** Liest JSON auch dann, wenn das Modell es in Fließtext oder ```-Blöcke packt. */
export function leseJson(text: string): { subject: string; bodyText: string; akquisegrund?: string } | null {
  const kandidaten: string[] = [];
  const codeBlock = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (codeBlock?.[1]) kandidaten.push(codeBlock[1]);
  const start = text.indexOf('{');
  const ende = text.lastIndexOf('}');
  if (start >= 0 && ende > start) kandidaten.push(text.slice(start, ende + 1));
  kandidaten.push(text);

  for (const kandidat of kandidaten) {
    try {
      const daten = JSON.parse(kandidat) as Record<string, unknown>;
      if (typeof daten.subject === 'string' && typeof daten.bodyText === 'string') {
        return {
          subject: daten.subject,
          bodyText: daten.bodyText,
          ...(typeof daten.akquisegrund === 'string' ? { akquisegrund: daten.akquisegrund } : {})
        };
      }
    } catch {
      // Nächsten Kandidaten versuchen.
    }
  }
  return null;
}
