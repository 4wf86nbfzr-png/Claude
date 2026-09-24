import { NextResponse } from 'next/server';
import { ok, parseBody, route } from '@/lib/api';
import { rateLimit } from '@/lib/rate-limit';
import { RateLimitError, ValidationError } from '@/lib/errors';
import { clientIp } from '@/lib/auth/session';
import { anfrageAusFormular, OEFFENTLICHE_ANFRAGE } from '@/lib/domain/requests';

/**
 * Oeffentliche Schnittstelle fuer das Anfrageformular auf hermserviceteam.com
 * (Spec 16/43).
 *
 * Schutzmassnahmen, weil diese Route ohne Anmeldung erreichbar ist:
 *   * Begrenzung auf 5 Anfragen je IP und Stunde
 *   * Herkunftspruefung ueber PUBLIC_API_ORIGINS
 *   * unsichtbares Honigtopf-Feld (`website`) wie auf der Website selbst
 *   * optionaler API-Schluessel ueber den Header `x-api-key`
 */

function erlaubteHerkunft(origin: string | null): boolean {
  const liste = (process.env.PUBLIC_API_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (liste.length === 0) return true; // nicht konfiguriert: nicht blockieren, nur begrenzen
  if (!origin) return true;            // serverseitige Aufrufe senden keinen Origin
  return liste.includes(origin);
}

function cors(origin: string | null): Record<string, string> {
  const liste = (process.env.PUBLIC_API_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  const erlaubt = origin && (liste.length === 0 || liste.includes(origin)) ? origin : liste[0] ?? '';
  return {
    'Access-Control-Allow-Origin': erlaubt,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-api-key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get('origin')) });
}

export const POST = route(async (request: Request) => {
  const origin = request.headers.get('origin');
  const kopf = cors(origin);
  const ip = (await clientIp()) ?? 'unbekannt';

  if (!erlaubteHerkunft(origin)) {
    return NextResponse.json({ error: 'Diese Herkunft ist nicht freigegeben.', code: 'KEINE_BERECHTIGUNG' }, { status: 403, headers: kopf });
  }
  // Grenze ist konfigurierbar, damit Lasttests und stark frequentierte
  // Formulare nicht gegen einen fest verdrahteten Wert laufen.
  const grenze = Math.max(1, Number(process.env.PUBLIC_REQUEST_LIMIT ?? 5));
  if (!rateLimit(`public-request:${ip}`, grenze, 3600).ok) {
    throw new RateLimitError('Es sind bereits mehrere Anfragen von Ihrem Anschluss eingegangen. Bitte melden Sie sich telefonisch.');
  }

  const rohdaten = await request.clone().json().catch(() => ({})) as Record<string, unknown>;
  // Honigtopf: echte Besucher fuellen dieses Feld nie aus.
  if (typeof rohdaten.website === 'string' && rohdaten.website.trim() !== '') {
    // Freundlich bestaetigen, aber nichts speichern – so lernt der Absender nichts dazu.
    return NextResponse.json({ status: 'ok', hinweis: 'Ihre Anfrage wurde entgegengenommen.' }, { headers: kopf });
  }

  const eingabe = await parseBody(request, OEFFENTLICHE_ANFRAGE);
  if (!eingabe.message && !eingabe.eventDate && !eingabe.employeesNeeded) {
    throw new ValidationError('Bitte beschreiben Sie kurz, wofuer Sie Personal benoetigen.');
  }

  const anfrage = await anfrageAusFormular(eingabe, { kanal: 'API', ip });

  return ok(
    {
      status: 'ok',
      anfrageNummer: anfrage.reference,
      hinweis: 'Ihre Anfrage ist eingegangen und wird von unserer Disposition geprueft. Sie erhalten zeitnah eine Rueckmeldung.',
      fehlendeAngaben: anfrage.missingFields,
    },
    { status: 201, headers: kopf },
  );
});
