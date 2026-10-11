import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listDocuments, CATEGORIES, CATEGORY_LABELS, type DocEntityType } from "@/server/modules/documents/service";
import { PageHeader, Panel, Table, Badge, EmptyState, Field, Input, Select, Button, Alert } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { uploadDocumentAction } from "./actions";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { withTenant } from "@/server/db/client";
import { employees, customers, partners, events } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";

export const metadata = { title: "Dokumente" };
export const dynamic = "force-dynamic";

const ENTITY_LABELS: Record<string, string> = { employee: "Mitarbeiter", customer: "Kunde", partner: "Partner", event: "Veranstaltung", tenant: "Unternehmen", request: "Anfrage", time_import: "Import" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent();
  const sp = await searchParams;
  const docs = await listDocuments(ctx, { entityType: (sp.entityType as DocEntityType) || undefined, entityId: sp.entityId || undefined, category: sp.category || undefined, expiringDays: sp.ablauf ? Number(sp.ablauf) : undefined, q: sp.q });
  const canWrite = ctx.permissions.has("documents:write");
  const internal = ["tenant_admin", "dispatcher", "operations_lead", "hr", "accounting"].includes(ctx.role);
  const lists = canWrite
    ? await withTenant(ctx.tenantId, async (tx) => ({
        employees: ctx.permissions.has("employees:documents") ? await tx.select({ id: employees.id, label: employees.lastName, first: employees.firstName }).from(employees).where(eq(employees.tenantId, ctx.tenantId)).orderBy(employees.lastName) : [],
        customers: await tx.select({ id: customers.id, name: customers.name }).from(customers).orderBy(customers.name),
        partners: await tx.select({ id: partners.id, name: partners.name }).from(partners).orderBy(partners.name),
        events: await tx.select({ id: events.id, name: events.name, startsAt: events.startsAt }).from(events).orderBy(desc(events.startsAt)).limit(100),
      }))
    : null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Dokumente" subtitle="Vertrauliche Dateien liegen im geschützten Speicher; Downloads laufen über einmalige, zeitlich begrenzte Links." />
      {internal && (
        <form className="flex flex-wrap gap-2 mb-3 items-end">
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Titel oder Dateiname" className="max-w-[220px]" aria-label="Suche" />
          <Select name="entityType" defaultValue={sp.entityType ?? ""} className="w-auto" aria-label="Zuordnung">
            <option value="">Alle Zuordnungen</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select name="category" defaultValue={sp.category ?? ""} className="w-auto" aria-label="Kategorie">
            <option value="">Alle Kategorien</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
          <Select name="ablauf" defaultValue={sp.ablauf ?? ""} className="w-auto" aria-label="Ablauf">
            <option value="">Alle</option>
            <option value="30">Laufen in 30 Tagen ab</option>
            <option value="90">Laufen in 90 Tagen ab</option>
          </Select>
          <Button type="submit">Filtern</Button>
        </form>
      )}
      <div className="grid xl:grid-cols-[1fr_400px] gap-4 items-start">
        <Panel padded={false}>
          {docs.length === 0 ? (
            <EmptyState title="Keine Dokumente" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Titel</th>
                  <th>Zuordnung</th>
                  <th>Kategorie</th>
                  <th>Vertraulichkeit</th>
                  <th>Gültig bis</th>
                  <th>Hochgeladen</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/dokumente/${d.id}`} className="font-medium">
                        {d.title}
                      </Link>
                      <div className="text-[12px] text-ink-4">
                        {d.filename} · v{d.version} · {(d.sizeBytes / 1024).toFixed(0)} KB
                      </div>
                    </td>
                    <td className="text-[12.5px]">{ENTITY_LABELS[d.entityType]}</td>
                    <td className="text-[12.5px]">{CATEGORY_LABELS[d.category] ?? d.category}</td>
                    <td>
                      <Badge tone={d.confidentiality === "confidential" ? "danger" : d.confidentiality === "shared" ? "accent" : "neutral"}>{d.confidentiality}</Badge>
                    </td>
                    <td>
                      {d.expiresAt ? (
                        <>
                          {fmtDate(d.expiresAt)} {d.expiresAt < today && <Badge tone="danger">abgelaufen</Badge>}
                        </>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="text-ink-3">{fmtDateTime(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        {canWrite && lists && (
          <Panel title="Dokument hochladen">
            <Alert tone="info" className="mb-3">
              Erlaubt: PDF, JPG, PNG, CSV, TXT, XLSX, DOCX bis 20 MB. Inhalt wird gegen den Dateityp geprüft.
            </Alert>
            <ActionForm action={uploadDocumentAction} submitLabel="Hochladen" className="space-y-3" reset>
              <Field label="Datei" htmlFor="d-file">
                <Input id="d-file" name="file" type="file" required />
              </Field>
              <Field label="Titel" htmlFor="d-title">
                <Input id="d-title" name="title" placeholder="Leer = Dateiname" />
              </Field>
              <Field label="Zuordnung" htmlFor="d-type">
                <Select id="d-type" name="entityType" defaultValue={sp.entityType ?? "customer"}>
                  {lists.employees.length > 0 && <option value="employee">Mitarbeiter</option>}
                  <option value="customer">Kunde</option>
                  <option value="partner">Partner</option>
                  <option value="event">Veranstaltung</option>
                  <option value="tenant">Unternehmen</option>
                </Select>
              </Field>
              <Field label="Objekt (ID)" htmlFor="d-entity" help="Aus den Listen unten kopieren oder vorbelegt über den Link „Dokument hochladen“ auf der jeweiligen Seite.">
                <Input id="d-entity" name="entityId" defaultValue={sp.entityId ?? ctx.tenantId} required className="mono" list="entity-ids" />
                <datalist id="entity-ids">
                  {lists.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      Mitarbeiter: {e.label}, {e.first}
                    </option>
                  ))}
                  {lists.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      Kunde: {c.name}
                    </option>
                  ))}
                  {lists.partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      Partner: {p.name}
                    </option>
                  ))}
                  {lists.events.map((e) => (
                    <option key={e.id} value={e.id}>
                      Veranstaltung: {e.name} ({fmtDate(e.startsAt)})
                    </option>
                  ))}
                  <option value={ctx.tenantId}>Unternehmen</option>
                </datalist>
              </Field>
              <Field label="Kategorie" htmlFor="d-cat">
                <Select id="d-cat" name="category" defaultValue="general">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Vertraulichkeit" htmlFor="d-conf" help="„Geteilt“ ist im jeweiligen Portal sichtbar (Mitarbeiter/Kunde/Partner). „Vertraulich“ nur mit besonderem Recht.">
                <Select id="d-conf" name="confidentiality" defaultValue="internal">
                  <option value="internal">Intern</option>
                  <option value="shared">Geteilt (Portal)</option>
                  {ctx.permissions.has("documents:confidential") && <option value="confidential">Vertraulich</option>}
                </Select>
              </Field>
              <Field label="Gültig bis (optional)" htmlFor="d-exp">
                <Input id="d-exp" name="expiresAt" type="date" />
              </Field>
              <Field label="Ersetzt Dokument (ID, optional → neue Version)" htmlFor="d-rep">
                <Input id="d-rep" name="replacesDocumentId" className="mono" defaultValue={sp.replaces ?? ""} />
              </Field>
            </ActionForm>
          </Panel>
        )}
      </div>
    </>
  );
}
