import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listQualifications, listExpiringQualifications } from "@/server/modules/qualifications/service";
import { PageHeader, Panel, Table, Field, Input, Textarea, Badge, EmptyState } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { createQualificationAction, deleteQualificationAction } from "./actions";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Qualifikationen" };
export const dynamic = "force-dynamic";

export default async function QualificationsPage({ searchParams }: { searchParams: Promise<{ ablauf?: string }> }) {
  const { ctx } = await requireCurrent("employees:read");
  const sp = await searchParams;
  const days = Number(sp.ablauf ?? 30) || 30;
  const [quals, expiring] = await Promise.all([listQualifications(ctx), listExpiringQualifications(ctx, days)]);
  const canWrite = ctx.permissions.has("employees:write");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Qualifikationen" subtitle="Katalog der Nachweise, die Positionen voraussetzen können. Ablaufende Nachweise erscheinen auf dem Dashboard." />
      <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="space-y-4">
          <Panel title="Katalog" padded={false}>
            {quals.length === 0 ? (
              <EmptyState title="Noch keine Qualifikationen" hint="Beispiele: Sachkunde §34a, Erste Hilfe, Gabelstaplerschein, Führerschein B." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Schlüssel</th>
                    <th>Name</th>
                    <th>Beschreibung</th>
                    <th>Läuft ab</th>
                    {canWrite && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {quals.map((q) => (
                    <tr key={q.id}>
                      <td className="mono">{q.key}</td>
                      <td className="font-medium">{q.name}</td>
                      <td className="text-ink-3">{q.description}</td>
                      <td>{q.expires ? "ja" : "nein"}</td>
                      {canWrite && (
                        <td className="text-right">
                          <ActionButton action={deleteQualificationAction} label="Löschen" variant="ghost" hidden={{ id: q.id }} confirm={`„${q.name}“ löschen?`} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
          <Panel title={`Ablaufende Nachweise (nächste ${days} Tage, inkl. abgelaufene)`} padded={false}>
            {expiring.length === 0 ? (
              <p className="p-4 text-[13px] text-ink-3">Keine ablaufenden Nachweise.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Mitarbeiter</th>
                    <th>Qualifikation</th>
                    <th>Gültig bis</th>
                  </tr>
                </thead>
                <tbody>
                  {expiring.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <Link href={`/mitarbeiter/${x.employeeId}`}>
                          {x.lastName}, {x.firstName}
                        </Link>{" "}
                        <span className="mono text-ink-4">{x.employeeNumber}</span>
                      </td>
                      <td>{x.qualification}</td>
                      <td>
                        {fmtDate(x.validUntil)} {x.validUntil && x.validUntil < today ? <Badge tone="danger">abgelaufen</Badge> : <Badge tone="warn">läuft ab</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </div>
        {canWrite && (
          <Panel title="Neue Qualifikation">
            <ActionForm action={createQualificationAction} submitLabel="Anlegen" className="space-y-3" reset>
              <Field label="Schlüssel" htmlFor="q-key" help="Kurz, ohne Leerzeichen, z. B. 34a, erste-hilfe. Wird im CSV-Import verwendet.">
                <Input id="q-key" name="key" required pattern="[a-z0-9_-]+" className="mono" />
              </Field>
              <Field label="Name" htmlFor="q-name">
                <Input id="q-name" name="name" required />
              </Field>
              <Field label="Beschreibung" htmlFor="q-desc">
                <Textarea id="q-desc" name="description" />
              </Field>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="expires" /> Nachweis hat ein Ablaufdatum
              </label>
            </ActionForm>
          </Panel>
        )}
      </div>
    </>
  );
}
