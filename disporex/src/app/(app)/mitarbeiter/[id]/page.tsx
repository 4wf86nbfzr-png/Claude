import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { getEmployee } from "@/server/modules/employees/service";
import { listQualifications } from "@/server/modules/qualifications/service";
import { PageHeader, Panel, Badge, Table, Field, Input, Select, Textarea, Dl } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { updateEmployeeAction, employeeStatusAction, addNoteAction, setQualificationAction, removeQualificationAction, inviteEmployeeAction } from "../actions";
import { EmployeeFormFields } from "@/components/employees/employee-form";
import { fmtDate, fmtDateTime, fmtRange } from "@/lib/format";
import { SHIFT_STATUS_LABELS } from "@/server/modules/shifts/schema";
import { AREA_LABELS } from "@/server/modules/employees/schema";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireCurrent("employees:read");
  const [data, quals] = await Promise.all([getEmployee(ctx, id), listQualifications(ctx)]);
  const e = data.employee;
  const canWrite = ctx.permissions.has("employees:write");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title={`${e.lastName}, ${e.firstName}`}
        breadcrumb={<Link href="/mitarbeiter">Mitarbeiter</Link>}
        subtitle={
          <>
            <span className="mono">{e.employeeNumber}</span> · {e.areas.map((a) => AREA_LABELS[a] ?? a).join(", ") || "kein Bereich"} ·{" "}
            <Badge tone={e.status === "active" ? "ok" : e.status === "left" ? "danger" : "neutral"}>{e.status}</Badge>
            {e.retainUntil && <span className="text-ink-4"> · Löschfrist ab {fmtDate(e.retainUntil)}</span>}
          </>
        }
        actions={
          canWrite ? (
            e.status === "active" ? (
              <ActionForm action={employeeStatusAction} submitLabel="Deaktivieren" submitVariant="danger" className="flex items-end gap-2 [&>div]:mt-0" confirm="Mitarbeiter deaktivieren? Künftige Einsätze müssen vorher ersetzt sein.">
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="status" value="inactive" />
                <Input name="reason" placeholder="Grund (optional)" className="w-56" />
              </ActionForm>
            ) : (
              <ActionButton action={employeeStatusAction} label="Reaktivieren" variant="primary" size={undefined} hidden={{ id: e.id, status: "active" }} />
            )
          ) : undefined
        }
      />
      <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="space-y-4">
          <Panel title="Stammdaten">
            <ActionForm action={updateEmployeeAction} submitLabel="Speichern">
              <input type="hidden" name="id" value={e.id} />
              <fieldset disabled={!canWrite}>
                <EmployeeFormFields e={e} />
              </fieldset>
            </ActionForm>
          </Panel>
          <Panel title="Qualifikationen" padded={false}>
            {data.qualifications.length === 0 ? (
              <p className="p-4 text-[13px] text-ink-3">Keine Qualifikationen hinterlegt.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Qualifikation</th>
                    <th>Gültig ab</th>
                    <th>Gültig bis</th>
                    <th>Hinweis</th>
                    {canWrite && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.qualifications.map((q) => {
                    const expired = q.validUntil && q.validUntil < today;
                    const soon = q.validUntil && !expired && q.validUntil < new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
                    return (
                      <tr key={q.id}>
                        <td className="font-medium">{q.name}</td>
                        <td>{fmtDate(q.validFrom)}</td>
                        <td>
                          {fmtDate(q.validUntil)} {expired && <Badge tone="danger">abgelaufen</Badge>} {soon && <Badge tone="warn">läuft bald ab</Badge>}
                        </td>
                        <td className="text-ink-3">{q.note}</td>
                        {canWrite && (
                          <td className="text-right">
                            <ActionButton action={removeQualificationAction} label="Entfernen" variant="ghost" hidden={{ id: e.id, qualificationId: q.qualificationId }} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
            {canWrite && (
              <div className="p-4 border-t border-line">
                <ActionForm action={setQualificationAction} submitLabel="Hinzufügen / aktualisieren" submitVariant="secondary" className="grid md:grid-cols-4 gap-3 items-end [&>div:last-child]:mt-0" reset>
                  <input type="hidden" name="id" value={e.id} />
                  <Field label="Qualifikation" htmlFor="q-id">
                    <Select id="q-id" name="qualificationId" required>
                      {quals.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Gültig ab" htmlFor="q-from">
                    <Input id="q-from" name="validFrom" type="date" />
                  </Field>
                  <Field label="Gültig bis" htmlFor="q-until">
                    <Input id="q-until" name="validUntil" type="date" />
                  </Field>
                  <Field label="Hinweis" htmlFor="q-note">
                    <Input id="q-note" name="note" />
                  </Field>
                </ActionForm>
              </div>
            )}
          </Panel>
          <Panel title="Einsätze" padded={false}>
            <Table>
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>Veranstaltung</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...data.upcomingShifts, ...data.pastShifts].length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-ink-3">
                      Keine Einsätze.
                    </td>
                  </tr>
                )}
                {data.upcomingShifts.map((s) => (
                  <tr key={s.id}>
                    <td className="mono whitespace-nowrap">{fmtRange(s.startsAt, s.endsAt)}</td>
                    <td>
                      <Link href={`/veranstaltungen/${s.eventId}`}>{s.eventName}</Link>
                    </td>
                    <td>
                      <Badge tone={s.status === "confirmed" ? "ok" : s.status === "requested" ? "info" : "accent"}>{SHIFT_STATUS_LABELS[s.status]}</Badge>
                    </td>
                  </tr>
                ))}
                {data.pastShifts.map((s) => (
                  <tr key={s.id} className="text-ink-3">
                    <td className="mono whitespace-nowrap">{fmtRange(s.startsAt, s.endsAt)}</td>
                    <td>
                      <Link href={`/veranstaltungen/${s.eventId}`}>{s.eventName}</Link>
                    </td>
                    <td>
                      <Badge>{SHIFT_STATUS_LABELS[s.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Zugang">
            {data.account ? (
              <Dl items={[{ k: "Konto", v: data.account.email }, { k: "Status", v: data.account.status }]} />
            ) : ctx.permissions.has("users:write") ? (
              <ActionForm action={inviteEmployeeAction} submitLabel="Portal-Einladung senden" submitVariant="secondary" className="space-y-2">
                <input type="hidden" name="id" value={e.id} />
                <Field label="E-Mail-Adresse" htmlFor="inv-email" help="Der Mitarbeiter kann dann Einsatzanfragen im Portal beantworten.">
                  <Input id="inv-email" name="email" type="email" defaultValue={e.email ?? ""} required />
                </Field>
              </ActionForm>
            ) : (
              <p className="text-[13px] text-ink-3">Kein Portalzugang.</p>
            )}
          </Panel>
          <Panel title="Abwesenheiten (kommend)">
            {data.availabilities.length === 0 ? (
              <p className="text-[13px] text-ink-3">Keine Einträge.</p>
            ) : (
              <ul className="text-[13px] space-y-1">
                {data.availabilities.map((a) => (
                  <li key={a.id}>
                    <Badge tone={a.kind === "unavailable" ? "warn" : "ok"}>{a.kind === "unavailable" ? "abwesend" : "verfügbar"}</Badge> {fmtRange(a.startsAt, a.endsAt)} {a.note && <span className="text-ink-3">· {a.note}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="help">
              <Link href={`/verfuegbarkeiten?employeeId=${e.id}`}>Verfügbarkeiten verwalten</Link>
            </p>
          </Panel>
          <Panel title="Historie / Kommunikation">
            {canWrite && (
              <ActionForm action={addNoteAction} submitLabel="Eintrag speichern" submitVariant="secondary" className="mb-4" reset>
                <input type="hidden" name="id" value={e.id} />
                <div className="flex gap-2 mb-2">
                  <Select name="kind" defaultValue="note" className="w-auto">
                    <option value="note">Notiz</option>
                    <option value="call">Telefonat</option>
                    <option value="email">E-Mail</option>
                    <option value="meeting">Gespräch</option>
                  </Select>
                </div>
                <Textarea name="body" required placeholder="Was wurde besprochen?" />
              </ActionForm>
            )}
            <ul className="space-y-2 text-[13px]">
              {data.notes.map((n) => (
                <li key={n.id} className="border-l-2 border-line pl-2">
                  <div className="text-ink-4 text-[12px]">
                    {fmtDateTime(n.createdAt)} · {n.author ?? "System"} · {n.kind}
                  </div>
                  <div className="whitespace-pre-line">{n.body}</div>
                </li>
              ))}
              {data.notes.length === 0 && <li className="text-ink-3">Noch keine Einträge.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
