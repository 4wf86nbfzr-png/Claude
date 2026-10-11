import { requireCurrent } from "@/server/auth/current";
import { listCustomers } from "@/server/modules/customers/service";
import { PageHeader, Panel } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { createRequestAction } from "../actions";
import { RequestFormFields } from "@/components/requests/request-form";

export const metadata = { title: "Anfrage erfassen" };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const { ctx } = await requireCurrent("requests:write");
  const sp = await searchParams;
  const customers = (await listCustomers(ctx, { pageSize: 200, status: "all" })).items;
  return (
    <>
      <PageHeader title="Anfrage erfassen" breadcrumb="Kundenanfragen" subtitle="Fehlende Angaben werden gekennzeichnet; Duplikate innerhalb von 30 Tagen erkannt." />
      <Panel className="max-w-3xl">
        <ActionForm action={createRequestAction} submitLabel="Anfrage anlegen">
          <RequestFormFields customers={customers} defaultCustomerId={sp.customerId} />
        </ActionForm>
      </Panel>
    </>
  );
}
