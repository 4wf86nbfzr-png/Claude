import { requireCurrent } from "@/server/auth/current";
import { listQualifications } from "@/server/modules/qualifications/service";
import { PageHeader, Panel } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { createPartnerAction } from "../actions";
import { PartnerFormFields } from "@/components/partners/partner-form";

export const metadata = { title: "Neuer Partner" };

export default async function NewPartnerPage() {
  const { ctx } = await requireCurrent("partners:write");
  const quals = await listQualifications(ctx);
  return (
    <>
      <PageHeader title="Neuer Partner" breadcrumb="Partner" />
      <Panel className="max-w-3xl">
        <ActionForm action={createPartnerAction} submitLabel="Anlegen">
          <PartnerFormFields qualifications={quals} />
        </ActionForm>
      </Panel>
    </>
  );
}
