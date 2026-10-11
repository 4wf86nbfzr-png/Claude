import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listShifts } from "@/server/modules/shifts/service";
import { listAvailabilities } from "@/server/modules/availability/service";
import { listDocuments } from "@/server/modules/documents/service";
import { SHIFT_STATUS_LABELS } from "@/server/modules/shifts/schema";
import { PageHeader, Panel, Badge, EmptyState, Field, Input, Select, Alert } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { shiftRespondAction } from "../../veranstaltungen/actions";
import { createAvailabilityAction, deleteAvailabilityAction } from "../../verfuegbarkeiten/actions";
import { fmtRange, fmtDateTime } from "@/lib/format";

export const metadata = { title: "Meine Einsätze" };
export const dynamic = "force-dynamic";

export default async function EmployeePortalPage() {
  const { ctx, user } = await requireCurrent("portal:employee");
  if (!ctx.employeeId) {
    return (
      <Alert tone="warn">Ihr Konto ist keinem Mitarbeiterdatensatz zugeordnet. Bitte wenden Sie sich an die Disposition.</Alert>
    );
  }
  const now = new Date();
  const [requested, upcoming, past, avail, docs] = await Promise.all([
    listShifts(ctx, { status: "requested", from: now, pageSize: 50 }),
    listShifts(ctx, { status: "active", from: now, pageSize: 100 }),
    listShifts(ctx, { status: "all", to: now, pageSize: 20, dir: "desc" }),
    listAvailabilities(ctx, { from: now }),
    listDocuments(ctx),
  ]);
  const open = requested.items;
  const confirmed = upcoming.items.filter((s) => s.status !== "requested");
  return (
    <>
      <PageHeader title={`Moin ${user.name.split(" ")[0]}`} subtitle="Ihre Einsatzanfragen, bestätigten Einsätze und Abwesenheiten." />
      <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="space-y-4">
          <Panel title={`Offene Anfragen (${open.length})`} padded={false}>
            {open.length === 0 ? (
              <EmptyState title="Keine offenen Anfragen" />
            ) : (
              <ul className="divide-y divide-line">
                {open.map((s) => (
                  <li key={s.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[13.5px]">
                      <Link href={`/portal/mitarbeiter/${s.id}`} className="font-medium">
                        {s.eventName}
                      </Link>
                      <div className="text-ink-2">
                        {s.positionName} · <span className="mono">{fmtRange(s.startsAt, s.endsAt)}</span>
                        {s.locationName ? ` · ${s.locationName}` : ""}
                      </div>
                      {s.responseDeadlineAt && (
                        <div className="text-[12px] text-ink-3">
                          Bitte antworten bis {fmtDateTime(s.responseDeadlineAt)} {s.responseDeadlineAt < now && <Badge tone="danger">Frist abgelaufen</Badge>}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <ActionButton action={shiftRespondAction} label="Zusagen" variant="accent" hidden={{ eventId: s.eventId, shiftId: s.id, response: "accepted" }} />
                      <Link href={`/portal/mitarbeiter/${s.id}`} className="btn btn-secondary btn-sm">
                        Details / Absagen
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={`Bestätigte und zugesagte Einsätze (${confirmed.length})`} padded={false}>
            {confirmed.length === 0 ? (
              <EmptyState title="Keine kommenden Einsätze" />
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Zeit</th>
                    <th>Veranstaltung</th>
                    <th>Position</th>
                    <th>Ort</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmed.map((s) => (
                    <tr key={s.id}>
                      <td className="mono whitespace-nowrap">
                        <Link href={`/portal/mitarbeiter/${s.id}`}>{fmtRange(s.startsAt, s.endsAt)}</Link>
                      </td>
                      <td>{s.eventName}</td>
                      <td>{s.positionName}</td>
                      <td className="text-ink-3">{s.locationName}</td>
                      <td>
                        <Badge tone={s.status === "confirmed" ? "ok" : "accent"}>{SHIFT_STATUS_LABELS[s.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <Panel title="Vergangene Einsätze" padded={false}>
            <table className="tbl">
              <tbody>
                {past.items.map((s) => (
                  <tr key={s.id} className="text-ink-3">
                    <td className="mono whitespace-nowrap">{fmtRange(s.startsAt, s.endsAt)}</td>
                    <td>{s.eventName}</td>
                    <td>
                      <Badge>{SHIFT_STATUS_LABELS[s.status]}</Badge>
                    </td>
                  </tr>
                ))}
                {past.items.length === 0 && (
                  <tr>
                    <td className="text-ink-3">Noch keine.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Meine Abwesenheiten">
            <ul className="text-[13px] space-y-1.5 mb-3">
              {avail.map(({ a }) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span>
                    <Badge tone={a.kind === "unavailable" ? "warn" : "ok"}>{a.kind === "unavailable" ? "abwesend" : "verfügbar"}</Badge> {fmtRange(a.startsAt, a.endsAt)} {a.note && <span className="text-ink-3">· {a.note}</span>}
                  </span>
                  <ActionButton action={deleteAvailabilityAction} label="×" variant="ghost" hidden={{ id: a.id }} />
                </li>
              ))}
              {avail.length === 0 && <li className="text-ink-3">Keine Einträge.</li>}
            </ul>
            <ActionForm action={createAvailabilityAction} submitLabel="Eintragen" submitVariant="secondary" className="space-y-2" reset>
              <input type="hidden" name="employeeId" value={ctx.employeeId} />
              <Field label="Art" htmlFor="pa-kind">
                <Select id="pa-kind" name="kind" defaultValue="unavailable">
                  <option value="unavailable">Nicht verfügbar</option>
                  <option value="available">Verfügbar / biete mich an</option>
                </Select>
              </Field>
              <Field label="Von" htmlFor="pa-start">
                <Input id="pa-start" name="startsAt" type="datetime-local" required />
              </Field>
              <Field label="Bis" htmlFor="pa-end">
                <Input id="pa-end" name="endsAt" type="datetime-local" required />
              </Field>
              <Field label="Hinweis" htmlFor="pa-note">
                <Input id="pa-note" name="note" placeholder="z. B. Urlaub" />
              </Field>
            </ActionForm>
          </Panel>
          <Panel title="Meine Dokumente">
            {docs.length === 0 ? (
              <p className="text-[13px] text-ink-3">Keine freigegebenen Dokumente.</p>
            ) : (
              <ul className="text-[13px] space-y-1">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link href={`/dokumente/${d.id}`}>{d.title}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
