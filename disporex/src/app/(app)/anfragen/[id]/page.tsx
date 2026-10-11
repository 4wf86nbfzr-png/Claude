import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { getRequest, labelMissing } from "@/server/modules/requests/service";
import { listCustomers, listLocations } from "@/server/modules/customers/service";
import { listMembers } from "@/server/modules/users/service";
import { REQUEST_STATUS_LABELS } from "@/server/modules/requests/schema";
import { PageHeader, Panel, Badge, Alert, Field, Select, Dl } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { updateRequestAction, requestStatusAction, convertRequestAction, assignRequestAction } from "../actions";
import { RequestFormFields } from "@/components/requests/request-form";
import { fmtDateTime } from "@/lib/format";
import { AiPanel } from "@/components/requests/ai-panel";
import { aiAvailable } from "@/server/modules/ai/service";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireCurrent("requests:read");
  const data = await getRequest(ctx, id);
  const r = data.request;
  const canWrite = ctx.permissions.has("requests:write");
  const internal = ctx.role !== "customer";
  const [customers, members] = internal ? await Promise.all([listCustomers(ctx, { pageSize: 200, status: "all" }).then((p) => p.items), ctx.permissions.has("users:read") ? listMembers(ctx) : Promise.resolve([])]) : [[], []];
  const locs = internal ? await listLocations(ctx, r.customerId ?? undefined) : [];
  const editable = r.status !== "converted";
  const transitions: Record<string, { to: string; label: string; variant?: "primary" | "secondary" | "danger" | "accent" }[]> = {
    new: [
      { to: "in_review", label: "In Prüfung nehmen", variant: "primary" },
      { to: "needs_info", label: "Rückfrage nötig" },
      { to: "declined", label: "Ablehnen", variant: "danger" },
    ],
    in_review: [
      { to: "quoted", label: "Angebot gesendet", variant: "primary" },
      { to: "accepted", label: "Angenommen", variant: "accent" },
      { to: "needs_info", label: "Rückfrage nötig" },
      { to: "declined", label: "Ablehnen", variant: "danger" },
    ],
    needs_info: [
      { to: "in_review", label: "Angaben vollständig", variant: "primary" },
      { to: "declined", label: "Ablehnen", variant: "danger" },
    ],
    quoted: [
      { to: "accepted", label: "Kunde hat angenommen", variant: "accent" },
      { to: "declined", label: "Abgelehnt", variant: "danger" },
    ],
    accepted: [{ to: "declined", label: "Doch ablehnen", variant: "danger" }],
    declined: [{ to: "new", label: "Wieder öffnen" }],
    duplicate: [{ to: "new", label: "Kein Duplikat – öffnen" }],
    converted: [],
  };
  return (
    <>
      <PageHeader
        title={r.title}
        breadcrumb={<Link href="/anfragen">Kundenanfragen</Link>}
        subtitle={
          <>
            <Badge tone={r.status === "converted" ? "ok" : r.status === "declined" ? "danger" : "info"}>{REQUEST_STATUS_LABELS[r.status]}</Badge> · eingegangen {fmtDateTime(r.createdAt)} über {r.source}
            {data.customerName && <> · Kunde: {data.customerName}</>}
          </>
        }
      />
      {r.status === "duplicate" && data.duplicateOf && (
        <Alert tone="warn" className="mb-4">
          Als Duplikat erkannt von <Link href={`/anfragen/${data.duplicateOf.id}`}>{data.duplicateOf.title}</Link>. Falls es sich doch um eine eigene Anfrage handelt, unten „Kein Duplikat“ wählen.
        </Alert>
      )}
      {r.missingFields.length > 0 && r.status !== "converted" && (
        <Alert tone="warn" className="mb-4">
          Fehlende Angaben für die Umwandlung: {r.missingFields.map(labelMissing).join(", ")}
        </Alert>
      )}
      {r.convertedEventId && (
        <Alert tone="ok" className="mb-4">
          Umgewandelt in Veranstaltung: <Link href={`/veranstaltungen/${r.convertedEventId}`}>öffnen</Link>
        </Alert>
      )}
      <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start">
        <Panel title="Anfrage">
          {internal ? (
            <ActionForm action={updateRequestAction} submitLabel="Speichern">
              <input type="hidden" name="id" value={r.id} />
              <fieldset disabled={!canWrite || !editable}>
                <RequestFormFields r={r} customers={customers} />
              </fieldset>
            </ActionForm>
          ) : (
            <Dl
              items={[
                { k: "Termin", v: r.startsAt ? `${fmtDateTime(r.startsAt)} – ${fmtDateTime(r.endsAt)}` : "offen" },
                { k: "Ort", v: r.locationText },
                { k: "Bedarf", v: r.headcount },
                { k: "Beschreibung", v: r.description },
              ]}
            />
          )}
          {r.rawPayload !== null && internal && (
            <details className="mt-4 text-[12px]">
              <summary className="cursor-pointer text-ink-3">Rohdaten des Eingangs</summary>
              <pre className="whitespace-pre-wrap break-all mt-1 bg-surface p-2 rounded">{JSON.stringify(r.rawPayload as Record<string, unknown>, null, 1)}</pre>
            </details>
          )}
        </Panel>
        {internal && (
          <div className="space-y-4">
            <Panel title="Status">
              <div className="flex flex-wrap gap-2">
                {canWrite &&
                  transitions[r.status]?.map((t) => <ActionButton key={t.to} action={requestStatusAction} label={t.label} variant={t.variant ?? "secondary"} size={undefined} hidden={{ id: r.id, status: t.to }} />)}
                {(!canWrite || transitions[r.status]?.length === 0) && <span className="text-[13px] text-ink-3">Keine Aktionen.</span>}
              </div>
            </Panel>
            {ctx.permissions.has("requests:convert") && editable && r.status !== "declined" && r.status !== "duplicate" && (
              <Panel title="In Veranstaltung umwandeln">
                <ActionForm action={convertRequestAction} submitLabel="Veranstaltung + Auftrag anlegen" submitVariant="accent" className="space-y-3" confirm="Veranstaltung (geplant) und Auftragsentwurf anlegen?">
                  <input type="hidden" name="id" value={r.id} />
                  <Field label="Kunde" htmlFor="conv-customer">
                    <Select id="conv-customer" name="customerId" defaultValue={r.customerId ?? ""} required>
                      <option value="">– bitte wählen –</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Einsatzort (Stammdaten)" htmlFor="conv-loc" help="Optional; Freitext der Anfrage wird als Treffpunkt übernommen.">
                    <Select id="conv-loc" name="locationId" defaultValue="">
                      <option value="">–</option>
                      {locs.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <p className="help">Erzeugt eine Position „Personal“ mit dem Bedarf aus der Anfrage. Der Auftrag bleibt Entwurf, bis er bestätigt wird.</p>
                </ActionForm>
              </Panel>
            )}
            {ctx.permissions.has("ai:use") && <AiPanel r={r} available={aiAvailable()} canWrite={canWrite} />}
            <Panel title="Zuständigkeit">
              {canWrite && members.length > 0 ? (
                <ActionForm action={assignRequestAction} submitLabel="Zuweisen" submitVariant="secondary" className="[&>div]:mt-2">
                  <input type="hidden" name="id" value={r.id} />
                  <Select name="userId" defaultValue={r.assignedUserId ?? ""} aria-label="Zuständig">
                    <option value="">– niemand –</option>
                    {members
                      .filter((m) => ["dispatcher", "tenant_admin", "operations_lead"].includes(m.role))
                      .map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name}
                        </option>
                      ))}
                  </Select>
                </ActionForm>
              ) : (
                <p className="text-[13px]">{data.assignedName ?? "Niemand zugewiesen."}</p>
              )}
            </Panel>
            <Panel title="Eingang">
              <Dl items={[{ k: "Quelle", v: r.source }, { k: "Externe Referenz", v: r.externalRef }, { k: "Angelegt", v: fmtDateTime(r.createdAt) }, { k: "Geändert", v: fmtDateTime(r.updatedAt) }]} />
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
