import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { getCustomer, findSimilarCustomers } from "@/server/modules/customers/service";
import { PageHeader, Panel, Badge, Table, Field, Input, Textarea, Alert, LinkButton } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { updateCustomerAction, contactAction, deleteContactAction, locationAction } from "../actions";
import { CustomerFormFields } from "@/components/customers/customer-form";
import { fmtRange, fmtDate } from "@/lib/format";
import { EVENT_STATUS_LABELS, ORDER_STATUS_LABELS } from "@/server/modules/events/schema";
import { REQUEST_STATUS_LABELS } from "@/server/modules/requests/schema";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireCurrent("customers:read");
  const data = await getCustomer(ctx, id);
  const c = data.customer;
  const similar = await findSimilarCustomers(ctx, c.name, c.id);
  const canWrite = ctx.permissions.has("customers:write");
  return (
    <>
      <PageHeader
        title={c.name}
        breadcrumb={<Link href="/kunden">Kunden</Link>}
        subtitle={
          <>
            <span className="mono">{c.customerNumber}</span> · <Badge tone={c.status === "active" ? "ok" : "neutral"}>{c.status}</Badge>
          </>
        }
        actions={ctx.permissions.has("events:write") && <LinkButton href={`/veranstaltungen/neu?customerId=${c.id}`} variant="primary">Veranstaltung anlegen</LinkButton>}
      />
      {similar.length > 0 && (
        <Alert tone="warn" className="mb-4">
          Ähnliche Kunden vorhanden – mögliches Duplikat:{" "}
          {similar.map((s) => (
            <Link key={s.id} href={`/kunden/${s.id}`} className="mr-2">
              {s.name} ({s.customerNumber})
            </Link>
          ))}
        </Alert>
      )}
      <div className="grid xl:grid-cols-[1fr_400px] gap-4 items-start">
        <div className="space-y-4">
          <Panel title="Stammdaten">
            <ActionForm action={updateCustomerAction} submitLabel="Speichern">
              <input type="hidden" name="id" value={c.id} />
              <fieldset disabled={!canWrite}>
                <CustomerFormFields c={c} />
              </fieldset>
            </ActionForm>
          </Panel>
          <Panel title="Veranstaltungen" padded={false}>
            <Table>
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>Name</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.events.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-ink-3">
                      Noch keine Veranstaltungen.
                    </td>
                  </tr>
                )}
                {data.events.map((e) => (
                  <tr key={e.id}>
                    <td className="mono whitespace-nowrap">{fmtRange(e.startsAt, e.endsAt)}</td>
                    <td>
                      <Link href={`/veranstaltungen/${e.id}`}>{e.name}</Link>
                    </td>
                    <td>
                      <Badge>{EVENT_STATUS_LABELS[e.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>
          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="Aufträge" padded={false}>
              <Table>
                <thead>
                  <tr>
                    <th>Nummer</th>
                    <th>Status</th>
                    <th>Angelegt</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((o) => (
                    <tr key={o.id}>
                      <td className="mono">{o.eventId ? <Link href={`/veranstaltungen/${o.eventId}`}>{o.orderNumber}</Link> : o.orderNumber}</td>
                      <td>
                        <Badge tone={o.status === "confirmed" ? "ok" : "neutral"}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                      </td>
                      <td className="text-ink-3">{fmtDate(o.createdAt)}</td>
                    </tr>
                  ))}
                  {data.orders.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-ink-3">
                        Keine Aufträge.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Panel>
            <Panel title="Anfragen" padded={false}>
              <Table>
                <thead>
                  <tr>
                    <th>Titel</th>
                    <th>Status</th>
                    <th>Termin</th>
                  </tr>
                </thead>
                <tbody>
                  {data.requests.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/anfragen/${r.id}`}>{r.title}</Link>
                      </td>
                      <td>
                        <Badge>{REQUEST_STATUS_LABELS[r.status]}</Badge>
                      </td>
                      <td className="text-ink-3">{fmtDate(r.startsAt)}</td>
                    </tr>
                  ))}
                  {data.requests.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-ink-3">
                        Keine Anfragen.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Panel>
          </div>
        </div>
        <div className="space-y-4">
          <Panel title="Ansprechpartner" padded={false}>
            <ul className="divide-y divide-line">
              {data.contacts.map((k) => (
                <li key={k.id} className="px-4 py-2.5 text-[13px] flex justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {k.name} {k.isPrimary && <Badge tone="accent">Haupt</Badge>}
                    </div>
                    <div className="text-ink-3">{k.role}</div>
                    <div className="text-ink-2">
                      {k.email} {k.phone && <span className="mono">· {k.phone}</span>}
                    </div>
                  </div>
                  {canWrite && <ActionButton action={deleteContactAction} label="Entfernen" variant="ghost" hidden={{ customerId: c.id, contactId: k.id }} confirm={`${k.name} entfernen?`} />}
                </li>
              ))}
              {data.contacts.length === 0 && <li className="px-4 py-3 text-[13px] text-ink-3">Noch keine Ansprechpartner.</li>}
            </ul>
            {canWrite && (
              <div className="p-4 border-t border-line">
                <ActionForm action={contactAction} submitLabel="Ansprechpartner hinzufügen" submitVariant="secondary" className="space-y-2" reset>
                  <input type="hidden" name="customerId" value={c.id} />
                  <Input name="name" placeholder="Name" required aria-label="Name" />
                  <Input name="role" placeholder="Funktion" aria-label="Funktion" />
                  <Input name="email" type="email" placeholder="E-Mail" aria-label="E-Mail" />
                  <Input name="phone" placeholder="Telefon" aria-label="Telefon" />
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" name="isPrimary" /> Hauptansprechpartner
                  </label>
                </ActionForm>
              </div>
            )}
          </Panel>
          <Panel title="Standorte / Einsatzorte" padded={false}>
            <ul className="divide-y divide-line">
              {data.locations.map((l) => (
                <li key={l.id} className="px-4 py-2.5 text-[13px]">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-ink-3">{[l.street, [l.zip, l.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
                  {l.notes && <div className="text-ink-2 text-[12.5px]">{l.notes}</div>}
                </li>
              ))}
              {data.locations.length === 0 && <li className="px-4 py-3 text-[13px] text-ink-3">Noch keine Standorte.</li>}
            </ul>
            {canWrite && (
              <div className="p-4 border-t border-line">
                <ActionForm action={locationAction} submitLabel="Standort hinzufügen" submitVariant="secondary" className="space-y-2" reset>
                  <input type="hidden" name="customerId" value={c.id} />
                  <Input name="name" placeholder="Bezeichnung (z. B. Messehalle B)" required aria-label="Bezeichnung" />
                  <Input name="street" placeholder="Straße" aria-label="Straße" />
                  <div className="grid grid-cols-[90px_1fr] gap-2">
                    <Input name="zip" placeholder="PLZ" aria-label="PLZ" />
                    <Input name="city" placeholder="Ort" aria-label="Ort" />
                  </div>
                  <Field label="Hinweise (Anfahrt, Treffpunkt, Parken)" htmlFor={`loc-notes-${c.id}`}>
                    <Textarea id={`loc-notes-${c.id}`} name="notes" />
                  </Field>
                </ActionForm>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
