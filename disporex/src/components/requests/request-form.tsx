import { Field, Input, Select, Textarea } from "@/components/ui";
import { FieldError } from "@/components/ui/form";
import { toLocalInput } from "@/lib/format";
import type { CustomerRequest } from "@/server/modules/requests/service";

export function RequestFormFields({ r, customers, defaultCustomerId }: { r?: CustomerRequest; customers: { id: string; name: string }[]; defaultCustomerId?: string }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="Titel" htmlFor="title" className="md:col-span-2">
        <Input id="title" name="title" defaultValue={r?.title} required autoFocus={!r} placeholder="z. B. Firmenfeier Hafencity, 6 Personen" />
        <FieldError name="title" />
      </Field>
      <Field label="Kunde" htmlFor="customerId" help="Kann später zugeordnet werden.">
        <Select id="customerId" name="customerId" defaultValue={r?.customerId ?? defaultCustomerId ?? ""}>
          <option value="">– noch nicht zugeordnet –</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Personalbedarf (Personen)" htmlFor="headcount">
        <Input id="headcount" name="headcount" type="number" min={1} defaultValue={r?.headcount ?? ""} />
      </Field>
      <Field label="Beginn" htmlFor="startsAt">
        <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={toLocalInput(r?.startsAt)} />
      </Field>
      <Field label="Ende" htmlFor="endsAt">
        <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={toLocalInput(r?.endsAt)} />
      </Field>
      <Field label="Einsatzort" htmlFor="locationText" className="md:col-span-2">
        <Input id="locationText" name="locationText" defaultValue={r?.locationText ?? ""} />
      </Field>
      <Field label="Ansprechpartner" htmlFor="contactName">
        <Input id="contactName" name="contactName" defaultValue={r?.contactName ?? ""} />
      </Field>
      <Field label="E-Mail" htmlFor="contactEmail">
        <Input id="contactEmail" name="contactEmail" type="email" defaultValue={r?.contactEmail ?? ""} />
        <FieldError name="contactEmail" />
      </Field>
      <Field label="Telefon" htmlFor="contactPhone">
        <Input id="contactPhone" name="contactPhone" defaultValue={r?.contactPhone ?? ""} />
      </Field>
      <Field label="Beschreibung / Anforderungen" htmlFor="description" className="md:col-span-2">
        <Textarea id="description" name="description" defaultValue={r?.description ?? ""} placeholder="Positionen, Qualifikationen, Dresscode, Besonderheiten …" />
      </Field>
    </div>
  );
}
