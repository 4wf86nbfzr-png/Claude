import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listImports } from "@/server/modules/time/service";
import { listEmployees } from "@/server/modules/employees/service";
import { PageHeader, Panel, Table, Badge, EmptyState, Field, Input, Select, Alert } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { importAction, manualRecordAction } from "./actions";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Zeitnachweise" };
export const dynamic = "force-dynamic";

export default async function TimeImportsPage() {
  const { ctx } = await requireCurrent("time:read");
  const [imports, employees] = await Promise.all([listImports(ctx), ctx.permissions.has("time:correct") ? listEmployees(ctx, { pageSize: 300 }) : Promise.resolve(null)]);
  return (
    <>
      <PageHeader title="Zeitnachweise" subtitle="Importierte Rohdaten bleiben unverändert. Zuordnung über die Mitarbeiter-ID, Abgleich gegen bestätigte Schichten, Abweichungen unter Soll-Ist-Abgleich." />
      <div className="grid xl:grid-cols-[1fr_400px] gap-4 items-start">
        <Panel title="Importe" padded={false}>
          {imports.length === 0 ? (
            <EmptyState title="Noch keine Importe" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Kennung</th>
                  <th>Datei</th>
                  <th>Zeit</th>
                  <th>Von</th>
                  <th className="num">Zeilen</th>
                  <th className="num">Importiert</th>
                  <th className="num">Duplikate</th>
                  <th className="num">Fehler</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {imports.map(({ i, importer }) => (
                  <tr key={i.id}>
                    <td className="mono">
                      <Link href={`/zeitnachweise/${i.id}`}>{i.reference}</Link>
                    </td>
                    <td>{i.filename}</td>
                    <td className="text-ink-3 whitespace-nowrap">{fmtDateTime(i.createdAt)}</td>
                    <td>{importer ?? "API"}</td>
                    <td className="num">{i.rowCount}</td>
                    <td className="num">{i.importedCount}</td>
                    <td className="num">{i.duplicateCount}</td>
                    <td className="num">{i.errorCount > 0 ? <Badge tone="warn">{i.errorCount}</Badge> : 0}</td>
                    <td>
                      <Badge tone={i.status === "completed" ? "ok" : i.status === "failed" ? "danger" : "info"}>{i.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        <div className="space-y-4">
          {ctx.permissions.has("time:import") && (
            <Panel title="Datei importieren">
              <Alert tone="info" className="mb-3">
                CSV oder XLSX mit Kopfzeile. Erkannte Spalten: Mitarbeiter-ID/Personalnummer, Datum, Beginn, Ende, Pause – oder vollständige Zeitstempel in Beginn/Ende.
              </Alert>
              <ActionForm action={importAction} submitLabel="Importieren" className="space-y-3">
                <Field label="Datei" htmlFor="t-file">
                  <Input id="t-file" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
                </Field>
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" name="force" /> Erneut importieren, auch wenn die Datei bereits verarbeitet wurde (Zeilen-Duplikate bleiben geschützt)
                </label>
              </ActionForm>
            </Panel>
          )}
          {employees && (
            <Panel title="Nachweis manuell erfassen">
              <ActionForm action={manualRecordAction} submitLabel="Erfassen" submitVariant="secondary" className="space-y-3" reset>
                <Field label="Mitarbeiter" htmlFor="m-emp">
                  <Select id="m-emp" name="employeeId" required>
                    {employees.items.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.lastName}, {e.firstName} ({e.employeeNumber})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Beginn" htmlFor="m-start">
                  <Input id="m-start" name="startedAt" type="datetime-local" required />
                </Field>
                <Field label="Ende" htmlFor="m-end">
                  <Input id="m-end" name="endedAt" type="datetime-local" required />
                </Field>
                <Field label="Pause (Minuten)" htmlFor="m-break">
                  <Input id="m-break" name="breakMinutes" type="number" min={0} defaultValue={0} />
                </Field>
                <Field label="Hinweis / Quelle" htmlFor="m-note">
                  <Input id="m-note" name="note" placeholder="z. B. telefonisch gemeldet" />
                </Field>
              </ActionForm>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
