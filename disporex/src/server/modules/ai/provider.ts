import type { RequestExtraction } from "./service";
/** Wird in Phase 5 durch die Anbieter-Implementierung ersetzt; bis dahin verweigert sie ehrlich. */
export async function extractWithProvider(_tenantId: string, _text: string, _opts: { entityId?: string }): Promise<RequestExtraction | null> {
  throw new Error("KI-Anbieter ist konfiguriert, aber die Anbieter-Implementierung ist noch nicht verfügbar (Phase 5).");
}
