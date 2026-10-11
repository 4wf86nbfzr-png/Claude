import { Field, Input, Select, Textarea } from "@/components/ui";
import { FieldError } from "@/components/ui/form";
import type { customers } from "@/server/db/schema";

export function CustomerFormFields({ c }: { c?: typeof customers.$inferSelect }) {
  const a = c?.billingAddress ?? {};
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="Name" htmlFor="name" className="md:col-span-2">
        <Input id="name" name="name" defaultValue={c?.name} required autoFocus={!c} />
        <FieldError name="name" />
      </Field>
      <Field label="Firmierung (rechtlich)" htmlFor="legalName">
        <Input id="legalName" name="legalName" defaultValue={c?.legalName ?? ""} />
      </Field>
      <Field label="Kundennummer" htmlFor="customerNumber" help="Leer lassen für automatische Vergabe (KD-000001 …).">
        <Input id="customerNumber" name="customerNumber" defaultValue={c?.customerNumber} className="mono" />
        <FieldError name="customerNumber" />
      </Field>
      <Field label="Status" htmlFor="status">
        <Select id="status" name="status" defaultValue={c?.status ?? "active"}>
          <option value="lead">Interessent</option>
          <option value="active">Aktiv</option>
          <option value="inactive">Inaktiv</option>
          <option value="blocked">Gesperrt</option>
        </Select>
      </Field>
      <Field label="Zentrale E-Mail" htmlFor="email" help="Anfragen von dieser Adresse werden automatisch zugeordnet.">
        <Input id="email" name="email" type="email" defaultValue={c?.email ?? ""} />
        <FieldError name="email" />
      </Field>
      <Field label="Telefon" htmlFor="phone">
        <Input id="phone" name="phone" defaultValue={c?.phone ?? ""} />
      </Field>
      <Field label="Website" htmlFor="website">
        <Input id="website" name="website" defaultValue={c?.website ?? ""} />
      </Field>
      <Field label="Rechnungsadresse – Straße" htmlFor="street">
        <Input id="street" name="street" defaultValue={a.street ?? ""} />
      </Field>
      <div className="grid grid-cols-[100px_1fr] gap-2">
        <Field label="PLZ" htmlFor="zip">
          <Input id="zip" name="zip" defaultValue={a.zip ?? ""} />
        </Field>
        <Field label="Ort" htmlFor="city">
          <Input id="city" name="city" defaultValue={a.city ?? ""} />
        </Field>
      </div>
      <Field label="Rechnungs-E-Mail" htmlFor="billingEmail">
        <Input id="billingEmail" name="billingEmail" type="email" defaultValue={c?.billingEmail ?? ""} />
      </Field>
      <Field label="USt-IdNr." htmlFor="vatId">
        <Input id="vatId" name="vatId" defaultValue={c?.vatId ?? ""} />
      </Field>
      <Field label="Zahlungsziel (Tage)" htmlFor="paymentTermsDays">
        <Input id="paymentTermsDays" name="paymentTermsDays" defaultValue={c?.paymentTermsDays ?? ""} />
      </Field>
      <Field label="Individuelle Anforderungen" htmlFor="requirements" help="Dresscode-Standards, Sicherheitsvorgaben, Besonderheiten – wird in neue Veranstaltungen übernommen.">
        <Textarea id="requirements" name="requirements" defaultValue={c?.requirements ?? ""} />
      </Field>
      <Field label="Interne Notizen" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={c?.notes ?? ""} />
      </Field>
      <input type="hidden" name="country" value={a.country ?? "DE"} />
    </div>
  );
}
