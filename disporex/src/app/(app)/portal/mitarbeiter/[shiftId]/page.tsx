import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { getShift } from "@/server/modules/shifts/service";
import { SHIFT_STATUS_LABELS } from "@/server/modules/shifts/schema";
import { PageHeader, Panel, Badge, Dl, Field, Input } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { shiftRespondAction } from "../../../veranstaltungen/actions";
import { fmtRange, fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalShiftPage({ params }: { params: Promise<{ shiftId: string }> }) {
  const { shiftId } = await params;
  const { ctx } = await requireCurrent("portal:employee");
  const d = await getShift(ctx, shiftId);
  const s = d.shift;
  const canRespond = s.status === "requested" || s.status === "accepted";
  return (
    <>
      <PageHeader title={d.event.name} breadcrumb={<Link href="/portal/mitarbeiter">Meine Einsätze</Link>} subtitle={<><Badge tone={s.status === "confirmed" ? "ok" : "info"}>{SHIFT_STATUS_LABELS[s.status]}</Badge> · {d.position.name}</>} />
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Panel title="Einsatzdetails">
          <Dl
            items={[
              { k: "Zeit", v: <span className="mono">{fmtRange(s.startsAt, s.endsAt)}</span> },
              { k: "Pause", v: `${s.breakMinutes} min` },
              { k: "Ort", v: d.location ? [d.location.name, d.location.street, [d.location.zip, d.location.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "–" },
              { k: "Anfahrt / Hinweise", v: d.location?.notes },
              { k: "Treffpunkt", v: d.event.meetingPoint },
              { k: "Dresscode", v: d.position.dresscode ?? d.event.dresscode },
              { k: "Briefing", v: d.event.briefing ? <span className="whitespace-pre-line">{d.event.briefing}</span> : null },
              { k: "Besonderheiten", v: d.event.specialNotes },
              { k: "Hinweis der Disposition", v: s.notes },
              { k: "Rückmeldefrist", v: fmtDateTime(s.responseDeadlineAt) },
            ]}
          />
        </Panel>
        <Panel title="Rückmeldung">
          {canRespond ? (
            <div className="space-y-4">
              {s.status === "requested" && <ActionButton action={shiftRespondAction} label="Ich sage zu" variant="accent" size={undefined} hidden={{ eventId: s.eventId, shiftId: s.id, response: "accepted" }} />}
              <ActionForm action={shiftRespondAction} submitLabel={s.status === "accepted" ? "Zusage zurücknehmen" : "Absagen"} submitVariant="danger" confirm="Wirklich absagen? Die Disposition wird informiert.">
                <input type="hidden" name="eventId" value={s.eventId} />
                <input type="hidden" name="shiftId" value={s.id} />
                <input type="hidden" name="response" value="declined" />
                <Field label="Grund (optional)" htmlFor="r-note">
                  <Input id="r-note" name="note" />
                </Field>
              </ActionForm>
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">{s.status === "confirmed" ? "Dieser Einsatz ist verbindlich bestätigt. Bei Verhinderung bitte die Disposition kontaktieren." : "Keine Rückmeldung mehr möglich."}</p>
          )}
        </Panel>
      </div>
    </>
  );
}
