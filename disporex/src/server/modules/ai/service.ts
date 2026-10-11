/**
 * Platz für die KI-Schnittstelle (Phase 5). Bis dahin liefert die Extraktion
 * null, wenn kein Anbieter konfiguriert ist – das restliche System läuft unverändert.
 */
import { env } from "../../core/env";

export type RequestExtraction = {
  title?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  locationText?: string | null;
  headcount?: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  requestedRoles?: { name: string; count?: number; qualifications?: string[] }[];
  missingFields: string[];
  uncertainties: string[];
  confidence: "low" | "medium" | "high";
};

export async function extractRequestFromText(_tenantId: string, _text: string, _opts: { entityId?: string } = {}): Promise<RequestExtraction | null> {
  if (env().AI_PROVIDER === "none") return null;
  const { extractWithProvider } = await import("./provider");
  return extractWithProvider(_tenantId, _text, _opts);
}
