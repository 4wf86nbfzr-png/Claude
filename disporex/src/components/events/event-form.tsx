import { Field, Input, Select, Textarea } from "@/components/ui";
import { FieldError } from "@/components/ui/form";
import { toLocalInput } from "@/lib/format";
import type { EventRow } from "@/server/modules/events/service";

export function EventFormFields({ e, customers, locations, contacts, defaultCustomerId }: {
  e?: EventRow;
  customers: { id: string; name: string }[];
  locations: { id: string; name: string; city: string | null }[];
  contacts: { id: string; name: string }[];
  defaultCustomerId?: string;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="Name" htmlFor="name" className="md:col-span-2">
        <Input id="name" name="name" defaultValue={e?.name} required autoFocus={!e} />
        <FieldError name="name" />
      </Field>
      <Field label="Kunde" htmlFor="customerId">
        <Select id="customerId" name="customerId" defaultValue={e?.customerId ?? defaultCustomerId ?? ""} required disabled={Boolean(e)}>
          <option value="">– wählen –</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {e && <input type="hidden" name="customerId" value={e.customerId} />}
      </Field>
      <Field label="Einsatzort" htmlFor="locationId">
        <Select id="locationId" name="locationId" defaultValue={e?.locationId ?? ""}>
          <option value="">–</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.city ? ` (${l.city})` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Beginn" htmlFor="startsAt">
        <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={toLocalInput(e?.startsAt)} required />
        <FieldError name="startsAt" />
      </Field>
      <Field label="Ende" htmlFor="endsAt">
        <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={toLocalInput(e?.endsAt)} required />
        <FieldError name="endsAt" />
      </Field>
      <Field label="Aufbau ab" htmlFor="setupStartsAt">
        <Input id="setupStartsAt" name="setupStartsAt" type="datetime-local" defaultValue={toLocalInput(e?.setupStartsAt)} />
      </Field>
      <Field label="Abbau bis" htmlFor="teardownEndsAt">
        <Input id="teardownEndsAt" name="teardownEndsAt" type="datetime-local" defaultValue={toLocalInput(e?.teardownEndsAt)} />
      </Field>
      <Field label="Ansprechpartner (Kunde)" htmlFor="contactId">
        <Select id="contactId" name="contactId" defaultValue={e?.contactId ?? ""}>
          <option value="">–</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Treffpunkt" htmlFor="meetingPoint">
        <Input id="meetingPoint" name="meetingPoint" defaultValue={e?.meetingPoint ?? ""} />
      </Field>
      <Field label="Dresscode" htmlFor="dresscode">
        <Input id="dresscode" name="dresscode" defaultValue={e?.dresscode ?? ""} placeholder="z. B. schwarz, weißes Hemd, Namensschild" />
      </Field>
      <Field label="Besonderheiten" htmlFor="specialNotes">
        <Input id="specialNotes" name="specialNotes" defaultValue={e?.specialNotes ?? ""} />
      </Field>
      <Field label="Briefing (für Mitarbeiter sichtbar)" htmlFor="briefing" className="md:col-span-2">
        <Textarea id="briefing" name="briefing" defaultValue={e?.briefing ?? ""} />
      </Field>
      <Field label="Interne Notizen (nicht für Mitarbeiter/Partner)" htmlFor="internalNotes">
        <Textarea id="internalNotes" name="internalNotes" defaultValue={e?.internalNotes ?? ""} />
      </Field>
      <Field label="Abrechnungshinweise" htmlFor="billingNotes">
        <Textarea id="billingNotes" name="billingNotes" defaultValue={e?.billingNotes ?? ""} />
      </Field>
    </div>
  );
}

export function PositionFormFields({ p, qualifications, defaults }: { p?: { name: string; headcountRequired: number; startsAt: Date; endsAt: Date; breakMinutes: number; requiredQualificationIds: string[]; dresscode: string | null; notes: string | null; billingCategory: string | null }; qualifications: { id: string; name: string }[]; defaults?: { startsAt: Date; endsAt: Date } }) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Field label="Bezeichnung" htmlFor="p-name">
        <Input id="p-name" name="name" defaultValue={p?.name} required placeholder="z. B. Einlass, Garderobe, Objektschutz" />
      </Field>
      <Field label="Personalbedarf" htmlFor="p-head">
        <Input id="p-head" name="headcountRequired" type="number" min={1} max={500} defaultValue={p?.headcountRequired ?? 1} required />
      </Field>
      <Field label="Beginn" htmlFor="p-start">
        <Input id="p-start" name="startsAt" type="datetime-local" defaultValue={toLocalInput(p?.startsAt ?? defaults?.startsAt)} required />
      </Field>
      <Field label="Ende" htmlFor="p-end">
        <Input id="p-end" name="endsAt" type="datetime-local" defaultValue={toLocalInput(p?.endsAt ?? defaults?.endsAt)} required />
      </Field>
      <Field label="Pause (Minuten)" htmlFor="p-break">
        <Input id="p-break" name="breakMinutes" type="number" min={0} max={480} defaultValue={p?.breakMinutes ?? 0} />
      </Field>
      <Field label="Abrechnungsposition" htmlFor="p-bill" help="Schlüssel für den Stundensatz, z. B. security, host.">
        <Input id="p-bill" name="billingCategory" defaultValue={p?.billingCategory ?? ""} />
      </Field>
      <fieldset className="md:col-span-2">
        <legend className="label">Erforderliche Qualifikationen</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {qualifications.length === 0 && <span className="text-ink-3">Keine Qualifikationen im Katalog.</span>}
          {qualifications.map((q) => (
            <label key={q.id} className="flex items-center gap-1.5">
              <input type="checkbox" name="requiredQualificationIds" value={q.id} defaultChecked={p?.requiredQualificationIds.includes(q.id)} /> {q.name}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Dresscode (abweichend)" htmlFor="p-dress">
        <Input id="p-dress" name="dresscode" defaultValue={p?.dresscode ?? ""} />
      </Field>
      <Field label="Hinweise" htmlFor="p-notes">
        <Input id="p-notes" name="notes" defaultValue={p?.notes ?? ""} />
      </Field>
    </div>
  );
}
