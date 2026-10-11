import { requireCurrent } from "@/server/auth/current";
import { PageHeader, Panel } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { createEmployeeAction } from "../actions";
import { EmployeeFormFields } from "@/components/employees/employee-form";

export const metadata = { title: "Neuer Mitarbeiter" };

export default async function NewEmployeePage() {
  await requireCurrent("employees:write");
  return (
    <>
      <PageHeader title="Neuer Mitarbeiter" breadcrumb="Mitarbeiter" />
      <Panel className="max-w-3xl">
        <ActionForm action={createEmployeeAction} submitLabel="Anlegen">
          <EmployeeFormFields />
        </ActionForm>
      </Panel>
    </>
  );
}
