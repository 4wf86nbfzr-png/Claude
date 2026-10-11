import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { getEvent } from "@/server/modules/events/service";
import { listQualifications } from "@/server/modules/qualifications/service";
import { PageHeader, Panel } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { updatePositionAction } from "../../../actions";
import { PositionFormFields } from "@/components/events/event-form";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditPositionPage({ params }: { params: Promise<{ id: string; positionId: string }> }) {
  const { id, positionId } = await params;
  const { ctx } = await requireCurrent("events:write");
  const [data, quals] = await Promise.all([getEvent(ctx, id), listQualifications(ctx)]);
  const p = data.positions.find((x) => x.id === positionId);
  if (!p) notFound();
  return (
    <>
      <PageHeader title={`Position: ${p.name}`} breadcrumb={<Link href={`/veranstaltungen/${id}`}>{data.event.name}</Link>} subtitle="Mehr Bedarf erzeugt offene Slots, weniger entfernt nur unbesetzte. Zeitänderungen gelten für alle Slots und informieren zugewiesene Mitarbeiter." />
      <Panel className="max-w-3xl">
        <ActionForm action={updatePositionAction} submitLabel="Speichern">
          <input type="hidden" name="eventId" value={id} />
          <input type="hidden" name="positionId" value={positionId} />
          <PositionFormFields p={p} qualifications={quals} />
        </ActionForm>
      </Panel>
    </>
  );
}
