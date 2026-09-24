import 'server-only';
import type { ParsedRequest } from './parser';

/**
 * Optionale KI-Anreicherung (Spec 58).
 *
 * Feste Regeln, damit die KI niemals Schaden anrichten kann:
 *   1. Sie darf ausschliesslich Felder fuellen, die der regelbasierte Parser
 *      leer gelassen hat – vorhandene Werte bleiben unangetastet.
 *   2. Jedes so gefuellte Feld bekommt eine gedeckelte Konfidenz und wird
 *      als KI-Ergaenzung markiert, damit es in der Oberflaeche erkennbar ist.
 *   3. Ohne ANTHROPIC_API_KEY passiert schlicht nichts – der Parser allein
 *      traegt den Betrieb.
 */

const MAX_KI_KONFIDENZ = 0.75;

export interface AiKontext { subject?: string | null; body: string; fromEmail?: string | null }

export function kiVerfuegbar(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function anreichern(geparst: ParsedRequest, kontext: AiKontext): Promise<ParsedRequest> {
  if (!kiVerfuegbar()) return geparst;
  if (geparst.missingFields.length === 0) return geparst;

  try {
    const antwort = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'claude-sonnet-5',
        max_tokens: 800,
        system:
          'Du liest deutschsprachige Personalanfragen eines Personaldienstleisters und gibst die Angaben strukturiert zurueck. ' +
          'Antworte ausschliesslich mit JSON. Felder, die im Text nicht eindeutig stehen, setzt du auf null. ' +
          'Rate niemals. Datum als YYYY-MM-DD, Uhrzeiten als HH:MM (24 Stunden). ' +
          'serviceType ist einer von: SICHERHEIT, GASTRO, PROMOTION, LOGISTIK, FAHRSERVICE, REINIGUNG oder null.',
        messages: [{
          role: 'user',
          content:
            `Betreff: ${kontext.subject ?? '(kein Betreff)'}\nAbsender: ${kontext.fromEmail ?? '(unbekannt)'}\n\n${kontext.body}\n\n` +
            'Gib JSON mit den Schluesseln company, contactPerson, phone, eventName, eventDate, startTime, endTime, ' +
            'meetingTime, location, employeesNeeded, serviceType zurueck.',
        }],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!antwort.ok) {
      console.error('[HST Planer] KI-Auswertung fehlgeschlagen:', antwort.status, await antwort.text());
      return geparst;
    }

    const daten = await antwort.json() as { content?: Array<{ type: string; text?: string }> };
    const text = daten.content?.find((teil) => teil.type === 'text')?.text ?? '';
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return geparst;

    const vorschlag = JSON.parse(json) as Record<string, unknown>;
    const ergaenzt: ParsedRequest = { ...geparst };

    setzeWennLeer(ergaenzt, 'company', vorschlag.company);
    setzeWennLeer(ergaenzt, 'contactPerson', vorschlag.contactPerson);
    setzeWennLeer(ergaenzt, 'phone', vorschlag.phone);
    setzeWennLeer(ergaenzt, 'eventName', vorschlag.eventName);
    setzeWennLeer(ergaenzt, 'eventDate', vorschlag.eventDate, /^\d{4}-\d{2}-\d{2}$/);
    setzeWennLeer(ergaenzt, 'startTime', vorschlag.startTime, /^([01]\d|2[0-3]):[0-5]\d$/);
    setzeWennLeer(ergaenzt, 'endTime', vorschlag.endTime, /^([01]\d|2[0-3]):[0-5]\d$/);
    setzeWennLeer(ergaenzt, 'meetingTime', vorschlag.meetingTime, /^([01]\d|2[0-3]):[0-5]\d$/);
    setzeWennLeer(ergaenzt, 'location', vorschlag.location);
    setzeWennLeer(ergaenzt, 'serviceType', vorschlag.serviceType, /^(SICHERHEIT|GASTRO|PROMOTION|LOGISTIK|FAHRSERVICE|REINIGUNG)$/);

    if (ergaenzt.employeesNeeded.value == null) {
      const anzahl = Number(vorschlag.employeesNeeded);
      if (Number.isFinite(anzahl) && anzahl > 0 && anzahl < 1000) {
        ergaenzt.employeesNeeded = { value: Math.round(anzahl), confidence: MAX_KI_KONFIDENZ, evidence: 'KI-Ergaenzung' };
      }
    }

    // Fehlende Felder neu bestimmen
    const pflicht: Array<[keyof ParsedRequest, string]> = [
      ['eventDate', 'Datum'], ['startTime', 'Startzeit'], ['endTime', 'Endzeit'],
      ['location', 'Ort'], ['employeesNeeded', 'Anzahl Mitarbeiter'],
      ['serviceType', 'Leistungsart'], ['contactPerson', 'Ansprechpartner'],
    ];
    ergaenzt.missingFields = pflicht
      .filter(([schluessel]) => (ergaenzt[schluessel] as { value: unknown }).value == null)
      .map(([, bezeichnung]) => bezeichnung);
    const werte = pflicht
      .map(([schluessel]) => ergaenzt[schluessel] as { value: unknown; confidence: number })
      .filter((feld) => feld.value != null)
      .map((feld) => feld.confidence);
    ergaenzt.confidence = Math.round((werte.reduce((a, b) => a + b, 0) / pflicht.length) * 100) / 100;

    return ergaenzt;
  } catch (fehler) {
    // Die KI ist eine Zugabe – faellt sie aus, laeuft der Parser weiter.
    console.error('[HST Planer] KI-Auswertung uebersprungen:', fehler);
    return geparst;
  }
}

function setzeWennLeer(ziel: ParsedRequest, feld: keyof ParsedRequest, wert: unknown, muster?: RegExp) {
  const vorhanden = ziel[feld] as { value: unknown; confidence: number; evidence?: string };
  if (vorhanden?.value != null) return;
  if (typeof wert !== 'string' || !wert.trim()) return;
  const bereinigt = wert.trim();
  if (muster && !muster.test(bereinigt)) return;
  (ziel[feld] as unknown) = { value: bereinigt, confidence: MAX_KI_KONFIDENZ, evidence: 'KI-Ergaenzung' };
}
