import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listAvailabilities } from "@/server/modules/availability/service";
import { listEmployees } from "@/server/modules/employees/service";
import { PageHeader, Panel, Table, Badge, EmptyState, Field, Input, Select, Button } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { createAvailabilityAction, deleteAvailabilityAction } from "./actions";
import { fmtRange } from "@/lib/format";
import { localToUtc } from "@/lib/tz";

export const metadata = { title: "Verfügbarkeiten" };
export const dynamic = "force-dynamic";

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent("availability:read");
  const sp = await searchParams;
  const from = sp.von ? localToUtc(`${sp.von}T00:00`) : new Date();
  const to = sp.bis ? localToUtc(`${sp.bis}T23:59`) : undefined;
  const [rows, employees] = await Promise.all([listAvailabilities(ctx, { employeeId: sp.employeeId || undefined, from, to, kind: (sp.kind as "unavailable") || undefined }), listEmployees(ctx, { pageSize: 300 })]);
  const canWrite = ctx.permissions.has("availability:write");
  return (
    <>
      <PageHeader title="Verfügbarkeiten und Abwesenheiten" subtitle="Abwesenheiten erzeugen bei der Zuweisung einen Konflikt. Verfügbarkeiten sind Hinweise für die Disposition." />
      <form className="flex flex-wrap gap-2 mb-3 items-end">
        <Select name="employeeId" defaultValue={sp.employeeId ?? ""} className="w-auto" aria-label="Mitarbeiter">
          <option value="">Alle Mitarbeiter</option>
          {employees.items.map((e) => (
            <option key={e.id} value={e.id}>
              {e.lastName}, {e.firstName}
            </option>
          ))}
        </Select>
        <Select name="kind" defaultValue={sp.kind ?? ""} className="w-auto" aria-label="Art">
          <option value="">Alle</option>
          <option value="unavailable">Abwesenheiten</option>
          <option value="available">Verfügbarkeiten</option>
        </Select>
        <Input name="von" type="date" defaultValue={sp.von ?? ""} className="w-auto" aria-label="Von" />
        <Input name="bis" type="date" defaultValue={sp.bis ?? ""} className="w-auto" aria-label="Bis" />
        <Button type="submit">Filtern</Button>
      </form>
      <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
        <Panel padded={false}>
          {rows.length === 0 ? (
            <EmptyState title="Keine Einträge im Zeitraum" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Mitarbeiter</th>
                  <th>Art</th>
                  <th>Zeitraum</th>
                  <th>Hinweis</th>
                  {canWrite && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ a, firstName, lastName, employeeNumber }) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/mitarbeiter/${a.employeeId}`}>
                        {lastName}, {firstName}
                      </Link>{" "}
                      <span className="mono text-ink-4">{employeeNumber}</span>
                    </td>
                    <td>
                      <Badge tone={a.kind === "unavailable" ? "warn" : "ok"}>{a.kind === "unavailable" ? "abwesend" : "verfügbar"}</Badge>
                    </td>
                    <td className="mono whitespace-nowrap">{fmtRange(a.startsAt, a.endsAt)}</td>
                    <td className="text-ink-3">{a.note}</td>
                    {canWrite && (
                      <td className="text-right">
                        <ActionButton action={deleteAvailabilityAction} label="Löschen" variant="ghost" hidden={{ id: a.id }} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        {canWrite && (
          <Panel title="Eintrag anlegen">
            <ActionForm action={createAvailabilityAction} submitLabel="Speichern" className="space-y-3" reset>
              <Field label="Mitarbeiter" htmlFor="av-emp">
                <Select id="av-emp" name="employeeId" required defaultValue={sp.employeeId ?? ""}>
                  <option value="">– wählen –</option>
                  {employees.items.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.lastName}, {e.firstName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Art" htmlFor="av-kind">
                <Select id="av-kind" name="kind" defaultValue="unavailable">
                  <option value="unavailable">Abwesend (Urlaub, krank, Sperrzeit)</option>
                  <option value="available">Verfügbar (bietet sich an)</option>
                </Select>
              </Field>
              <Field label="Von" htmlFor="av-start">
                <Input id="av-start" name="startsAt" type="datetime-local" required />
              </Field>
              <Field label="Bis" htmlFor="av-end">
                <Input id="av-end" name="endsAt" type="datetime-local" required />
              </Field>
              <Field label="Hinweis" htmlFor="av-note">
                <Input id="av-note" name="note" />
              </Field>
            </ActionForm>
          </Panel>
        )}
      </div>
    </>
  );
}
