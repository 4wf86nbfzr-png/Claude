import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listRateCards, listSurchargeRules } from "@/server/modules/billing/service";
import { listCustomers } from "@/server/modules/customers/service";
import { PageHeader, Panel, Table, Badge, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { createRateCardAction, endRateCardAction, deleteRateCardAction, createSurchargeAction, deleteSurchargeAction } from "../actions";
import { fmtCents, fmtDate } from "@/lib/format";

export const metadata = { title: "Stundensätze & Zuschläge" };
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = { night: "Nacht", sunday: "Sonntag", saturday: "Samstag", holiday: "Feiertag" };

export default async function RatesPage() {
  const { ctx } = await requireCurrent("billing:read");
  const [cards, rules, customers] = await Promise.all([listRateCards(ctx), listSurchargeRules(ctx), listCustomers(ctx, { pageSize: 300, status: "all" })]);
  const canWrite = ctx.permissions.has("billing:write");
  return (
    <>
      <PageHeader title="Stundensätze und Zuschläge" breadcrumb={<Link href="/abrechnung">Abrechnung</Link>} subtitle="Sätze gelten ab einem Datum; ein neuer Satz beendet den Vorgänger am Vortag. Bereits verwendete Sätze lassen sich nur beenden. Zuschläge sind explizite Parameter und werden minutengenau berechnet; mehrere Regeln addieren sich." />
      <div className="grid xl:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          <Panel title="Stundensätze" padded={false}>
            <Table>
              <thead>
                <tr>
                  <th>Kunde</th>
                  <th>Position</th>
                  <th>Bezeichnung</th>
                  <th className="num">Satz</th>
                  <th>Gültig</th>
                  {canWrite && <th></th>}
                </tr>
              </thead>
              <tbody>
                {cards.map(({ r, customerName, used }) => (
                  <tr key={r.id}>
                    <td>{customerName ?? <span className="text-ink-4">Standard</span>}</td>
                    <td className="mono">{r.billingCategory ?? <span className="text-ink-4">alle</span>}</td>
                    <td>{r.label}</td>
                    <td className="num">{fmtCents(r.hourlyRateCents)}</td>
                    <td className="text-[12.5px]">
                      {fmtDate(r.validFrom)} – {r.validTo ? fmtDate(r.validTo) : "offen"} {used > 0 && <Badge>{used}× verwendet</Badge>}
                    </td>
                    {canWrite && (
                      <td className="text-right whitespace-nowrap">
                        {!r.validTo && (
                          <ActionForm action={endRateCardAction} submitLabel="Beenden" submitVariant="secondary" className="inline-flex items-center gap-1 [&>div]:mt-0 [&>div>button]:btn-sm">
                            <input type="hidden" name="id" value={r.id} />
                            <Input name="validTo" type="date" required className="w-36 py-1 text-[12px]" aria-label="Gültig bis" />
                          </ActionForm>
                        )}{" "}
                        {used === 0 && <ActionButton action={deleteRateCardAction} label="Löschen" variant="ghost" hidden={{ id: r.id }} confirm="Satz löschen?" />}
                      </td>
                    )}
                  </tr>
                ))}
                {cards.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-ink-3">
                      Noch keine Stundensätze.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Panel>
          {canWrite && (
            <Panel title="Neuer Stundensatz">
              <ActionForm action={createRateCardAction} submitLabel="Anlegen" className="grid md:grid-cols-2 gap-3" reset>
                <Field label="Kunde (leer = Standard für alle)" htmlFor="rc-cust">
                  <Select id="rc-cust" name="customerId" defaultValue="">
                    <option value="">Standard</option>
                    {customers.items.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Abrechnungsposition (leer = alle)" htmlFor="rc-cat" help="Entspricht der Abrechnungsposition der Position, z. B. security.">
                  <Input id="rc-cat" name="billingCategory" className="mono" />
                </Field>
                <Field label="Bezeichnung" htmlFor="rc-label">
                  <Input id="rc-label" name="label" required />
                </Field>
                <Field label="Stundensatz (EUR)" htmlFor="rc-rate">
                  <Input id="rc-rate" name="hourlyRate" type="number" step="0.01" min={0} required />
                </Field>
                <Field label="Gültig ab" htmlFor="rc-from">
                  <Input id="rc-from" name="validFrom" type="date" required />
                </Field>
                <Field label="Gültig bis (optional)" htmlFor="rc-to">
                  <Input id="rc-to" name="validTo" type="date" />
                </Field>
              </ActionForm>
            </Panel>
          )}
        </div>
        <div className="space-y-4">
          <Panel title="Zuschlagsregeln" padded={false}>
            <Table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Art</th>
                  <th className="num">%</th>
                  <th>Fenster / Tage</th>
                  <th>Gültig</th>
                  {canWrite && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{KIND_LABELS[r.kind]}</td>
                    <td className="num">{r.percent}</td>
                    <td className="text-[12px] text-ink-3">{r.kind === "night" ? `${r.fromTime}–${r.toTime}` : r.kind === "holiday" ? `${r.holidays.length} Tage` : "–"}</td>
                    <td className="text-[12.5px]">
                      {fmtDate(r.validFrom)} – {r.validTo ? fmtDate(r.validTo) : "offen"}
                    </td>
                    {canWrite && (
                      <td className="text-right">
                        <ActionButton action={deleteSurchargeAction} label="Löschen" variant="ghost" hidden={{ id: r.id }} confirm="Regel löschen? Bereits erzeugte Grundlagen bleiben unverändert." />
                      </td>
                    )}
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-ink-3">
                      Keine Zuschlagsregeln – ohne Regeln werden keine Zuschläge berechnet.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Panel>
          {canWrite && (
            <Panel title="Neue Zuschlagsregel">
              <ActionForm action={createSurchargeAction} submitLabel="Anlegen" className="grid md:grid-cols-2 gap-3" reset>
                <Field label="Name" htmlFor="sr-name">
                  <Input id="sr-name" name="name" required />
                </Field>
                <Field label="Art" htmlFor="sr-kind">
                  <Select id="sr-kind" name="kind" defaultValue="night">
                    <option value="night">Nacht (Zeitfenster)</option>
                    <option value="saturday">Samstag</option>
                    <option value="sunday">Sonntag</option>
                    <option value="holiday">Feiertag (Datumsliste)</option>
                  </Select>
                </Field>
                <Field label="Prozent" htmlFor="sr-pct">
                  <Input id="sr-pct" name="percent" type="number" min={0} max={300} required />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Nacht von" htmlFor="sr-from">
                    <Input id="sr-from" name="fromTime" type="time" />
                  </Field>
                  <Field label="Nacht bis" htmlFor="sr-to">
                    <Input id="sr-to" name="toTime" type="time" />
                  </Field>
                </div>
                <Field label="Feiertage (YYYY-MM-DD, durch Komma/Zeilenumbruch)" htmlFor="sr-hol" className="md:col-span-2">
                  <Textarea id="sr-hol" name="holidays" placeholder="2026-12-25, 2026-12-26" />
                </Field>
                <Field label="Gültig ab" htmlFor="sr-vf">
                  <Input id="sr-vf" name="validFrom" type="date" required />
                </Field>
                <Field label="Gültig bis (optional)" htmlFor="sr-vt">
                  <Input id="sr-vt" name="validTo" type="date" />
                </Field>
              </ActionForm>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
