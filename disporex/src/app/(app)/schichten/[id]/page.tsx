import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { getShift } from "@/server/modules/shifts/service";
import { SHIFT_STATUS_LABELS } from "@/server/modules/shifts/schema";
import { PageHeader, Panel, Badge, Dl, Field, Input } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { shiftTimesAction } from "../../veranstaltungen/actions";
import { fmtRange, fmtDateTime, toLocalInput } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ShiftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireCurrent();
  const d = await getShift(ctx, id);
  const s = d.shift;
  const canWrite = ctx.permissions.has("shifts:write");
  return (
    <>
      <PageHeader
        title={`${d.event.name} · ${d.position.name}`}
        breadcrumb={
          <>
            <Link href="/schichten">Schichten</Link> / <Link href={`/veranstaltungen/${d.event.id}`}>{d.event.name}</Link>
          </>
        }
        subtitle={
          <>
            <Badge tone={s.status === "confirmed" ? "ok" : s.status === "open" ? "warn" : "info"}>{SHIFT_STATUS_LABELS[s.status]}</Badge> · {fmtRange(s.startsAt, s.endsAt)} · {d.customerName}
          </>
        }
      />
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Panel title="Einsatz">
          <Dl
            items={[
              { k: "Mitarbeiter", v: d.employee ? <Link href={`/mitarbeiter/${d.employee.id}`}>{d.employee.lastName}, {d.employee.firstName}</Link> : "–" },
              { k: "Ort", v: d.location ? `${d.location.name}${d.location.city ? `, ${d.location.city}` : ""}` : "–" },
              { k: "Treffpunkt", v: d.event.meetingPoint },
              { k: "Dresscode", v: d.position.dresscode ?? d.event.dresscode },
              { k: "Pause", v: `${s.breakMinutes} min` },
              { k: "Angefragt", v: fmtDateTime(s.requestedAt) },
              { k: "Rückmeldefrist", v: fmtDateTime(s.responseDeadlineAt) },
              { k: "Rückmeldung", v: fmtDateTime(s.respondedAt) },
              { k: "Bestätigt", v: fmtDateTime(s.confirmedAt) },
              { k: "Konfliktfreigabe", v: s.conflictOverrideReason },
              { k: "Hinweise", v: s.notes },
            ]}
          />
          {canWrite && ["open", "requested", "accepted", "confirmed"].includes(s.status) && (
            <ActionForm action={shiftTimesAction} submitLabel="Zeit ändern" submitVariant="secondary" className="mt-4 grid md:grid-cols-3 gap-3 items-end [&>div:last-child]:mt-0">
              <input type="hidden" name="eventId" value={d.event.id} />
              <input type="hidden" name="shiftId" value={s.id} />
              <Field label="Beginn" htmlFor="t-start">
                <Input id="t-start" name="startsAt" type="datetime-local" defaultValue={toLocalInput(s.startsAt)} required />
              </Field>
              <Field label="Ende" htmlFor="t-end">
                <Input id="t-end" name="endsAt" type="datetime-local" defaultValue={toLocalInput(s.endsAt)} required />
              </Field>
              <Field label="Grund" htmlFor="t-reason">
                <Input id="t-reason" name="reason" />
              </Field>
            </ActionForm>
          )}
        </Panel>
        <Panel title="Verlauf" padded={false}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Von → Nach</th>
                <th>Wer</th>
                <th>Grund</th>
              </tr>
            </thead>
            <tbody>
              {d.history.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap text-ink-3">{fmtDateTime(h.createdAt)}</td>
                  <td>
                    {h.fromStatus ? SHIFT_STATUS_LABELS[h.fromStatus] : "–"} → {SHIFT_STATUS_LABELS[h.toStatus]}
                  </td>
                  <td>{h.actorLabel ?? "System"}</td>
                  <td className="text-ink-3">{h.reason}</td>
                </tr>
              ))}
              {d.history.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-ink-3">
                    Noch keine Statusänderungen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
