import { requireCurrent } from "@/server/auth/current";
import { listCustomers, listLocations, getCustomer } from "@/server/modules/customers/service";
import { PageHeader, Panel } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { createEventAction } from "../actions";
import { EventFormFields } from "@/components/events/event-form";

export const metadata = { title: "Neue Veranstaltung" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const { ctx } = await requireCurrent("events:write");
  const sp = await searchParams;
  const [customers, locations] = await Promise.all([listCustomers(ctx, { pageSize: 200, status: "all" }).then((p) => p.items), listLocations(ctx, sp.customerId)]);
  const contacts = sp.customerId ? (await getCustomer(ctx, sp.customerId)).contacts : [];
  return (
    <>
      <PageHeader title="Neue Veranstaltung" breadcrumb="Veranstaltungen" subtitle="Wird als Entwurf angelegt. Positionen und Personalbedarf folgen im nächsten Schritt." />
      <Panel className="max-w-3xl">
        <ActionForm action={createEventAction} submitLabel="Anlegen">
          <EventFormFields customers={customers} locations={locations} contacts={contacts} defaultCustomerId={sp.customerId} />
        </ActionForm>
      </Panel>
    </>
  );
}
