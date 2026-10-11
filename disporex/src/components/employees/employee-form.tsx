import { Field, Input, Select, Textarea } from "@/components/ui";
import { FieldError } from "@/components/ui/form";
import { AREAS, AREA_LABELS, EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS } from "@/server/modules/employees/schema";
import type { Employee } from "@/server/modules/employees/service";

export function EmployeeFormFields({ e }: { e?: Employee }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="Vorname" htmlFor="firstName">
        <Input id="firstName" name="firstName" defaultValue={e?.firstName} required autoFocus={!e} />
        <FieldError name="firstName" />
      </Field>
      <Field label="Nachname" htmlFor="lastName">
        <Input id="lastName" name="lastName" defaultValue={e?.lastName} required />
        <FieldError name="lastName" />
      </Field>
      <Field label="Interne Mitarbeiter-ID" htmlFor="employeeNumber" help="Leer lassen für automatische Vergabe (MA-000001 …). Muss zur Kennung in Zeitnachweisen passen.">
        <Input id="employeeNumber" name="employeeNumber" defaultValue={e?.employeeNumber} className="mono" />
        <FieldError name="employeeNumber" />
      </Field>
      <Field label="Status" htmlFor="status">
        <Select id="status" name="status" defaultValue={e?.status ?? "active"}>
          <option value="active">Aktiv</option>
          <option value="applicant">Bewerber</option>
          <option value="inactive">Inaktiv</option>
          <option value="left">Ausgeschieden</option>
        </Select>
      </Field>
      <Field label="E-Mail" htmlFor="email">
        <Input id="email" name="email" type="email" defaultValue={e?.email ?? ""} />
        <FieldError name="email" />
      </Field>
      <Field label="Telefon" htmlFor="phone">
        <Input id="phone" name="phone" defaultValue={e?.phone ?? ""} />
      </Field>
      <Field label="Ort" htmlFor="city">
        <Input id="city" name="city" defaultValue={e?.city ?? ""} />
      </Field>
      <Field label="Beschäftigungsform" htmlFor="employmentType" help="Organisatorische Angabe ohne rechtliche Bewertung.">
        <Select id="employmentType" name="employmentType" defaultValue={e?.employmentType ?? ""}>
          <option value="">–</option>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EMPLOYMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="md:col-span-2">
        <legend className="label">Einsatzbereiche</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {AREAS.map((a) => (
            <label key={a} className="flex items-center gap-1.5">
              <input type="checkbox" name="areas" value={a} defaultChecked={e?.areas.includes(a)} /> {AREA_LABELS[a]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Organisatorische Hinweise" htmlFor="orgNotes" help="Z. B. „kein Nachtdienst“, „nur Wochenende“. Für Disponenten sichtbar.">
        <Textarea id="orgNotes" name="orgNotes" defaultValue={e?.orgNotes ?? ""} />
      </Field>
      <Field label="Interne Notizen" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={e?.notes ?? ""} />
      </Field>
    </div>
  );
}
