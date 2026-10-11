import { Panel, Badge, Alert, Select } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { suggestAction, applySuggestionAction, draftReplyAction } from "@/app/(app)/anfragen/ai-actions";
import type { RequestExtraction } from "@/server/modules/ai/schemas";
import type { CustomerRequest } from "@/server/modules/requests/service";
import { fmtDateTime } from "@/lib/format";

const FIELD_LABELS: Record<string, string> = { title: "Titel", startsAt: "Beginn", endsAt: "Ende", locationText: "Einsatzort", headcount: "Personalbedarf", contactName: "Ansprechpartner", contactEmail: "E-Mail", contactPhone: "Telefon", requestedRoles: "Rollen" };

export function AiPanel({ r, available, canWrite }: { r: CustomerRequest; available: boolean; canWrite: boolean }) {
  const s = r.aiExtraction as RequestExtraction | null;
  const editable = r.status !== "converted";
  return (
    <Panel title="KI-Unterstützung">
      {!available ? (
        <p className="text-[13px] text-ink-3">Kein KI-Anbieter konfiguriert (AI_PROVIDER). Alle anderen Funktionen sind davon unabhängig.</p>
      ) : (
        <div className="space-y-3">
          {editable && (
            <div className="flex flex-wrap gap-2">
              <ActionButton action={suggestAction} label={s ? "Vorschlag neu berechnen" : "Angaben aus Text extrahieren"} variant="secondary" size={undefined} hidden={{ id: r.id }} />
            </div>
          )}
          {s && (
            <div className="space-y-2">
              <div className="text-[12.5px] text-ink-3">
                Vorschlag · Konfidenz <Badge tone={s.confidence === "high" ? "ok" : s.confidence === "medium" ? "warn" : "danger"}>{s.confidence}</Badge> – ein Vorschlag, keine Entscheidung.
              </div>
              {s.uncertainties.length > 0 && (
                <Alert tone="warn">
                  Unklar oder widersprüchlich: {s.uncertainties.join(" · ")}
                </Alert>
              )}
              {canWrite && editable ? (
                <ActionForm action={applySuggestionAction} submitLabel="Ausgewählte Felder übernehmen" submitVariant="secondary" className="space-y-1.5">
                  <input type="hidden" name="id" value={r.id} />
                  {(["title", "startsAt", "endsAt", "locationText", "headcount", "contactName", "contactEmail", "contactPhone", "requestedRoles"] as const).map((f) => {
                    const v = s[f];
                    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) return null;
                    const current = (r as Record<string, unknown>)[f];
                    const display = f === "requestedRoles" ? (v as RequestExtraction["requestedRoles"]).map((x) => `${x.count ?? "?"}× ${x.name}`).join(", ") : f === "startsAt" || f === "endsAt" ? fmtDateTime(String(v)) : String(v);
                    const filled = current !== null && current !== undefined && current !== "" && !(Array.isArray(current) && current.length === 0);
                    return (
                      <label key={f} className="flex items-start gap-2 text-[13px]">
                        <input type="checkbox" name="fields" value={f} defaultChecked={!filled} className="mt-1" />
                        <span>
                          <span className="text-ink-3">{FIELD_LABELS[f]}:</span> {display} {filled && <Badge>bereits befüllt</Badge>}
                        </span>
                      </label>
                    );
                  })}
                  <label className="flex items-center gap-2 text-[12.5px] text-ink-3">
                    <input type="checkbox" name="overwrite" /> befüllte Felder überschreiben
                  </label>
                </ActionForm>
              ) : (
                <pre className="text-[12px] whitespace-pre-wrap bg-surface p-2 rounded">{JSON.stringify(s, null, 1)}</pre>
              )}
            </div>
          )}
          <ActionForm action={draftReplyAction} submitLabel="Antwortentwurf erstellen" submitVariant="secondary" className="flex items-end gap-2 [&>div]:mt-0">
            <input type="hidden" name="id" value={r.id} />
            <Select name="tone" defaultValue="warm" className="w-auto py-1 text-[12.5px]" aria-label="Tonalität">
              <option value="warm">freundlich</option>
              <option value="formal">formell</option>
            </Select>
          </ActionForm>
          <p className="help">Entwürfe werden nie automatisch versendet. Eingaben aus E-Mails gelten als unvertrauenswürdige Daten; die KI erhält keinen Zugriff auf andere Daten oder Aktionen.</p>
        </div>
      )}
    </Panel>
  );
}
