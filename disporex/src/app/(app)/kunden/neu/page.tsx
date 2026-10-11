import { requireCurrent } from "@/server/auth/current";
import { PageHeader, Panel } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { createCustomerAction } from "../actions";
import { CustomerFormFields } from "@/components/customers/customer-form";

export const metadata = { title: "Neuer Kunde" };

export default async function NewCustomerPage() {
  await requireCurrent("customers:write");
  return (
    <>
      <PageHeader title="Neuer Kunde" breadcrumb="Kunden" />
      <Panel className="max-w-3xl">
        <ActionForm action={createCustomerAction} submitLabel="Anlegen">
          <CustomerFormFields />
        </ActionForm>
      </Panel>
    </>
  );
}
