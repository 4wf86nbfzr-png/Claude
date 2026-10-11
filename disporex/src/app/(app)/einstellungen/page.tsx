import { requireCurrent } from "@/server/auth/current";
import { getTenant, effectiveSettings } from "@/server/modules/tenants/service";
import { PageHeader, Panel, Field, Input } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { updateTenantAction } from "./actions";

export const metadata = { title: "Einstellungen" };

export default async function TenantSettingsPage() {
  const { ctx } = await requireCurrent("settings:read");
  const tenant = await getTenant(ctx.tenantId);
  const s = effectiveSettings(tenant.settings);
  const ro = !ctx.permissions.has("settings:write");
  return (
    <>
      <PageHeader title="Unternehmen" subtitle="Grundeinstellungen des Mandanten. Arbeitszeitregeln erzeugen Warnungen in der Planung, sie sind keine rechtsverbindliche Prüfung." />
      <Panel>
        <ActionForm action={updateTenantAction} submitLabel="Speichern" className="max-w-2xl">
          <fieldset disabled={ro} className="grid md:grid-cols-2 gap-4">
            <Field label="Unternehmensname" htmlFor="name" className="md:col-span-2">
              <Input id="name" name="name" defaultValue={tenant.name} required />
            </Field>
            <Field label="Zeitzone" htmlFor="timezone">
              <Input id="timezone" name="timezone" defaultValue={s.timezone} />
            </Field>
            <Field label="Rückmeldefrist für Einsatzanfragen (Stunden)" htmlFor="responseDeadlineHours">
              <Input id="responseDeadlineHours" name="responseDeadlineHours" type="number" min={1} max={720} defaultValue={s.responseDeadlineHours} />
            </Field>
            <Field label="Mindest-Ruhezeit zwischen Schichten (Stunden)" htmlFor="minRestHours" help="Unterschreitung erzeugt eine Warnung bei der Zuweisung.">
              <Input id="minRestHours" name="minRestHours" type="number" step="0.5" min={0} max={24} defaultValue={s.minRestHours} />
            </Field>
            <Field label="Maximale Schichtdauer (Stunden)" htmlFor="maxShiftHours">
              <Input id="maxShiftHours" name="maxShiftHours" type="number" step="0.5" min={1} max={24} defaultValue={s.maxShiftHours} />
            </Field>
            <Field label="Toleranz Soll-Ist-Abgleich (Minuten)" htmlFor="reconciliationToleranceMinutes" help="Abweichungen innerhalb der Toleranz gelten als Übereinstimmung.">
              <Input id="reconciliationToleranceMinutes" name="reconciliationToleranceMinutes" type="number" min={0} max={120} defaultValue={s.reconciliationToleranceMinutes} />
            </Field>
            <Field label="Aufbewahrung deaktivierter Mitarbeiter (Tage)" htmlFor="retentionDaysInactiveEmployees" help="Nach Ablauf erscheinen Datensätze in der Löschliste.">
              <Input id="retentionDaysInactiveEmployees" name="retentionDaysInactiveEmployees" type="number" min={30} max={3650} defaultValue={s.retentionDaysInactiveEmployees} />
            </Field>
            <Field label="Aufbewahrung Protokolleinträge (Tage)" htmlFor="retentionDaysAuditLogs">
              <Input id="retentionDaysAuditLogs" name="retentionDaysAuditLogs" type="number" min={30} max={3650} defaultValue={s.retentionDaysAuditLogs} />
            </Field>
          </fieldset>
        </ActionForm>
      </Panel>
    </>
  );
}
