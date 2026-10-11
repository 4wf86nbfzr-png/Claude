import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { suggestEmployees } from "@/server/modules/shifts/service";
import { CONFLICT_LABELS } from "@/server/modules/shifts/conflicts";
import { PageHeader, Panel, Badge, Input, Button, Field, Select } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { assignShiftAction } from "../../../actions";
import { fmtRange } from "@/lib/format";
import { AREA_LABELS } from "@/server/modules/employees/schema";

export const dynamic = "force-dynamic";

export default async function AssignPage({ params, searchParams }: { params: Promise<{ id: string; shiftId: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id, shiftId } = await params;
  const sp = await searchParams;
  const { ctx } = await requireCurrent("shifts:assign");
  const data = await suggestEmployees(ctx, shiftId, { q: sp.q });
  const canOverride = ctx.permissions.has("shifts:override_conflict");
  return (
    <>
      <PageHeader
        title={`Besetzen: ${data.position.name}`}
        breadcrumb={
          <>
            <Link href="/veranstaltungen">Veranstaltungen</Link> / <Link href={`/veranstaltungen/${id}`}>{data.event.name}</Link>
          </>
        }
        subtitle={`${fmtRange(data.shift.startsAt, data.shift.endsAt)} · Kandidaten sortiert nach Konfliktfreiheit. Harte Konflikte (Doppelbuchung, inaktiv) sind nicht freigebbar.`}
      />
      <form className="flex gap-2 mb-3 max-w-md">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Name oder Mitarbeiter-ID" aria-label="Suche" />
        <Button type="submit">Suchen</Button>
      </form>
      <Panel padded={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Mitarbeiter</th>
              <th>Bereiche</th>
              <th>Prüfung</th>
              <th>Zuweisung</th>
            </tr>
          </thead>
          <tbody>
            {data.candidates.length === 0 && (
              <tr>
                <td colSpan={4} className="text-ink-3">
                  Keine aktiven Mitarbeiter gefunden.
                </td>
              </tr>
            )}
            {data.candidates.map(({ employee: emp, conflicts, hard }) => (
              <tr key={emp.id} className={hard ? "opacity-60" : ""}>
                <td>
                  <Link href={`/mitarbeiter/${emp.id}`} className="font-medium">
                    {emp.lastName}, {emp.firstName}
                  </Link>
                  <div className="mono text-[12px] text-ink-4">{emp.employeeNumber}</div>
                  {emp.orgNotes && <div className="text-[12px] text-ink-3">{emp.orgNotes}</div>}
                </td>
                <td className="text-[12.5px] text-ink-2">{emp.areas.map((a) => AREA_LABELS[a] ?? a).join(", ")}</td>
                <td>
                  {conflicts.length === 0 ? (
                    <Badge tone="ok">keine Konflikte</Badge>
                  ) : (
                    <ul className="space-y-0.5">
                      {conflicts.map((c, i) => (
                        <li key={i} className="text-[12.5px]">
                          <Badge tone={c.hard ? "danger" : "warn"}>{CONFLICT_LABELS[c.type]}</Badge> <span className="text-ink-2">{c.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="min-w-[300px]">
                  {hard ? (
                    <span className="text-[12.5px] text-ink-3">Nicht möglich.</span>
                  ) : conflicts.length > 0 && !canOverride ? (
                    <span className="text-[12.5px] text-ink-3">Freigabe nur mit Berechtigung „Konflikte freigeben“.</span>
                  ) : (
                    <ActionForm action={assignShiftAction} submitLabel="Zuweisen" submitVariant={conflicts.length ? "secondary" : "primary"} className="space-y-1.5 [&>div]:mt-1.5 [&>div>button]:btn-sm">
                      <input type="hidden" name="eventId" value={id} />
                      <input type="hidden" name="shiftId" value={shiftId} />
                      <input type="hidden" name="employeeId" value={emp.id} />
                      <Select name="mode" defaultValue="request" aria-label="Modus" className="py-1 text-[12.5px]">
                        <option value="request">Anfragen (Rückmeldung mit Frist)</option>
                        <option value="direct">Direkt bestätigen (bereits zugesagt)</option>
                      </Select>
                      {conflicts.length > 0 && (
                        <Field label="Begründung der Freigabe" htmlFor={`ov-${emp.id}`}>
                          <Input id={`ov-${emp.id}`} name="overrideReason" required className="py-1 text-[12.5px]" />
                        </Field>
                      )}
                      <Input name="note" placeholder="Hinweis an den Mitarbeiter (optional)" className="py-1 text-[12.5px]" aria-label="Hinweis" />
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
