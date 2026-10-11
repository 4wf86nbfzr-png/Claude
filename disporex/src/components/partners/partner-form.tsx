import { Field, Input, Select, Textarea } from "@/components/ui";
import { FieldError } from "@/components/ui/form";
import type { partners } from "@/server/db/schema";

export function PartnerFormFields({ p, qualifications }: { p?: typeof partners.$inferSelect; qualifications: { id: string; name: string }[] }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="Name" htmlFor="name" className="md:col-span-2">
        <Input id="name" name="name" defaultValue={p?.name} required autoFocus={!p} />
        <FieldError name="name" />
      </Field>
      <Field label="Status" htmlFor="status">
        <Select id="status" name="status" defaultValue={p?.status ?? "active"}>
          <option value="pending">In Prüfung</option>
          <option value="active">Aktiv</option>
          <option value="inactive">Inaktiv</option>
        </Select>
      </Field>
      <Field label="Ort" htmlFor="city">
        <Input id="city" name="city" defaultValue={p?.city ?? ""} />
      </Field>
      <Field label="E-Mail" htmlFor="email">
        <Input id="email" name="email" type="email" defaultValue={p?.email ?? ""} />
      </Field>
      <Field label="Telefon" htmlFor="phone">
        <Input id="phone" name="phone" defaultValue={p?.phone ?? ""} />
      </Field>
      <fieldset className="md:col-span-2">
        <legend className="label">Lieferbare Qualifikationen</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {qualifications.map((q) => (
            <label key={q.id} className="flex items-center gap-1.5">
              <input type="checkbox" name="qualificationIds" value={q.id} defaultChecked={p?.qualificationIds.includes(q.id)} /> {q.name}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Nachweise / Compliance" htmlFor="complianceNotes" help="Z. B. Bewachungserlaubnis, Haftpflicht, Zuverlässigkeitsprüfungen – mit Gültigkeiten. Dateien unter Dokumente ablegen.">
        <Textarea id="complianceNotes" name="complianceNotes" defaultValue={p?.complianceNotes ?? ""} />
      </Field>
      <Field label="Interne Notizen" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={p?.notes ?? ""} />
      </Field>
    </div>
  );
}
