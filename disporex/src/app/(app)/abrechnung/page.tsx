import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listBillingItems } from "@/server/modules/billing/service";
import { listCustomers } from "@/server/modules/customers/service";
import { PageHeader, Panel, Table, Badge, EmptyState, Field, Input, Select, Button, LinkButton, Alert } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { generateBillingAction, finalizeBillingAction } from "./actions";
import { fmtRange, fmtCents, fmtMinutes } from "@/lib/format";
import { localToUtc } from "@/lib/tz";

export const metadata = { title: "Abrechnung" };
export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent("billing:read");
  const sp = await searchParams;
  const today = new Date();
  const von = sp.von ?? new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10);
  const bis = sp.bis ?? new Date(today.getFullYear(), today.getMonth(), 0).toISOString().slice(0, 10);
  const [customers, items] = await Promise.all([listCustomers(ctx, { pageSize: 300, status: "all" }), listBillingItems(ctx, { customerId: sp.customerId || undefined, status: (sp.status as "all") || "all", from: localToUtc(`${von}T00:00`), to: localToUtc(`${bis}T23:59`) })]);
  const canWrite = ctx.permissions.has("billing:write");
  const total = items.reduce((a, r) => a + r.b.totalCents, 0);
  const prelim = items.filter((r) => r.b.status === "preliminary").length;
  return (
    <>
      <PageHeader
        title="Abrechnungsvorbereitung"
        subtitle="Abrechnungsgrundlagen je bestätigter Schicht: geplante Minuten, bestätigte Ist-Minuten, Stundensatz mit Gültigkeit, Zuschläge. Keine Rechnungsstellung, kein Steuer- oder Lohnmodul."
        actions={
          <>
            <LinkButton href="/abrechnung/saetze">Stundensätze & Zuschläge</LinkButton>
            <a className="btn btn-secondary" href={`/abrechnung/export?${new URLSearchParams({ customerId: sp.customerId ?? "", von, bis, status: sp.status ?? "all" })}`}>
              CSV-Export
            </a>
          </>
        }
      />
      <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="space-y-3">
          <form className="flex flex-wrap gap-2 items-end">
            <Select name="customerId" defaultValue={sp.customerId ?? ""} className="w-auto" aria-label="Kunde">
              <option value="">Alle Kunden</option>
              {customers.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select name="status" defaultValue={sp.status ?? "all"} className="w-auto" aria-label="Status">
              <option value="all">Alle</option>
              <option value="preliminary">Vorläufig</option>
              <option value="final">Final</option>
            </Select>
            <Input name="von" type="date" defaultValue={von} className="w-auto" aria-label="Von" />
            <Input name="bis" type="date" defaultValue={bis} className="w-auto" aria-label="Bis" />
            <Button type="submit">Anzeigen</Button>
          </form>
          {prelim > 0 && <Alert tone="warn">{prelim} Positionen sind vorläufig (geplante statt bestätigter Ist-Zeit). Erst nach Soll-Ist-Bestätigung abschließen.</Alert>}
          <Panel padded={false} title={`Positionen · Summe ${fmtCents(total)}`}>
            {items.length === 0 ? (
              <EmptyState title="Keine Abrechnungsgrundlagen im Zeitraum" hint="Rechts für einen Kunden und Zeitraum erzeugen." />
            ) : (
              <ActionForm action={finalizeBillingAction} submitLabel="Markierte abschließen" submitVariant="accent" className="[&>div]:px-4 [&>div]:pb-3">
                <Table>
                  <thead>
                    <tr>
                      {canWrite && <th></th>}
                      <th>Kunde</th>
                      <th>Veranstaltung / Position</th>
                      <th>Zeit</th>
                      <th className="num">Geplant</th>
                      <th className="num">Ist</th>
                      <th className="num">Satz</th>
                      <th className="num">Zuschläge</th>
                      <th className="num">Summe</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(({ b, customerName, eventName, positionName, startsAt, endsAt }) => (
                      <tr key={b.id}>
                        {canWrite && <td>{b.status === "preliminary" && b.approvedMinutes !== null && <input type="checkbox" name="ids" value={b.id} />}</td>}
                        <td>{customerName}</td>
                        <td>
                          <Link href={`/veranstaltungen/${b.eventId}`}>{eventName}</Link>
                          <div className="text-[12px] text-ink-3">
                            {positionName} {b.billingCategory && <span className="mono">· {b.billingCategory}</span>}
                          </div>
                        </td>
                        <td className="mono whitespace-nowrap text-[12px]">{fmtRange(startsAt, endsAt)}</td>
                        <td className="num">{fmtMinutes(b.plannedMinutes)}</td>
                        <td className="num">{b.approvedMinutes === null ? <span className="text-warn">offen</span> : fmtMinutes(b.approvedMinutes)}</td>
                        <td className="num">{fmtCents(b.hourlyRateCents)}</td>
                        <td className="num" title={(b.surchargeDetails ?? []).map((d) => `${d.rule}: ${d.minutes} min × ${d.percent} %`).join("\n")}>
                          {fmtCents(b.surchargeCents)}
                        </td>
                        <td className="num font-medium">{fmtCents(b.totalCents)}</td>
                        <td>{b.status === "final" ? <Badge tone="ok">final</Badge> : <Badge tone="warn">vorläufig</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </ActionForm>
            )}
          </Panel>
        </div>
        {canWrite && (
          <Panel title="Grundlagen erzeugen / aktualisieren">
            <ActionForm action={generateBillingAction} submitLabel="Berechnen" className="space-y-3">
              <Field label="Kunde" htmlFor="g-cust">
                <Select id="g-cust" name="customerId" required defaultValue={sp.customerId ?? ""}>
                  <option value="">– wählen –</option>
                  {customers.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Von" htmlFor="g-von">
                <Input id="g-von" name="von" type="date" defaultValue={von} required />
              </Field>
              <Field label="Bis" htmlFor="g-bis">
                <Input id="g-bis" name="bis" type="date" defaultValue={bis} required />
              </Field>
              <p className="help">Berücksichtigt bestätigte Schichten bestätigter Veranstaltungen. Finale Positionen bleiben unverändert; historische Stundensätze werden nie überschrieben.</p>
            </ActionForm>
          </Panel>
        )}
      </div>
    </>
  );
}
