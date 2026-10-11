import { requireCurrent } from "@/server/auth/current";
import { PageHeader, Panel, Field, Input, Select } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { importEmployeesAction } from "../actions";

export const metadata = { title: "Mitarbeiter importieren" };

export default async function ImportPage() {
  await requireCurrent("employees:import");
  return (
    <>
      <PageHeader title="Mitarbeiter importieren" breadcrumb="Mitarbeiter" subtitle="CSV mit Kopfzeile (Trennzeichen ; oder ,). Bestehende Mitarbeiter-IDs werden aktualisiert, neue angelegt." />
      <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
        <Panel>
          <ActionForm action={importEmployeesAction} submitLabel="Import starten" className="space-y-3">
            <Field label="CSV-Datei" htmlFor="file">
              <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
            </Field>
            <Field label="Modus" htmlFor="mode">
              <Select id="mode" name="mode" defaultValue="dry">
                <option value="dry">Testlauf (nichts speichern, nur prüfen)</option>
                <option value="live">Importieren</option>
              </Select>
            </Field>
          </ActionForm>
        </Panel>
        <Panel title="Erwartete Spalten">
          <pre className="text-[12px] whitespace-pre-wrap">
            employee_number;first_name;last_name;email;phone;city;status;employment_type;areas;qualifications{"\n"}
            MA-000012;Anna;Muster;anna@example.com;+49…;Hamburg;active;minijob;security|gastro;34a
          </pre>
          <p className="help">Deutsche Spaltennamen (vorname, nachname, mitarbeiter_id, telefon, ort, bereiche, qualifikationen) werden ebenfalls erkannt. Qualifikationen über ihren Schlüssel, mehrere mit |.</p>
        </Panel>
      </div>
    </>
  );
}
