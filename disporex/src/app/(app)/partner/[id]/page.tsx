import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { getPartner } from "@/server/modules/partners/service";
import { listQualifications } from "@/server/modules/qualifications/service";
import { OFFER_STATUS_LABELS } from "@/server/modules/partners/schema";
import { PageHeader, Panel, Badge, Table, Input } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { updatePartnerAction, partnerContactAction, withdrawOfferAction } from "../actions";
import { PartnerFormFields } from "@/components/partners/partner-form";
import { fmtRange, fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireCurrent("partners:read");
  const [data, quals] = await Promise.all([getPartner(ctx, id), listQualifications(ctx)]);
  const p = data.partner;
  const canWrite = ctx.permissions.has("partners:write");
  return (
    <>
      <PageHeader
        title={p.name}
        breadcrumb={<Link href="/partner">Partner</Link>}
        subtitle={
          <>
            <Badge tone={p.status === "active" ? "ok" : "neutral"}>{p.status}</Badge> · Qualifikationen: {data.qualificationNames.join(", ") || "keine"}
          </>
        }
      />
      <div className="grid xl:grid-cols-[1fr_400px] gap-4 items-start">
        <div className="space-y-4">
          <Panel title="Stammdaten">
            <ActionForm action={updatePartnerAction} submitLabel="Speichern">
              <input type="hidden" name="id" value={p.id} />
              <fieldset disabled={!canWrite}>
                <PartnerFormFields p={p} qualifications={quals} />
              </fieldset>
            </ActionForm>
          </Panel>
          <Panel title="Angebote und Rückmeldungen" padded={false}>
            {data.offers.length === 0 ? (
              <p className="p-4 text-[13px] text-ink-3">Noch keine Angebote. Positionen werden auf der Veranstaltungsseite an Partner angeboten.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Veranstaltung / Position</th>
                    <th>Zeit</th>
                    <th className="num">Angefragt</th>
                    <th className="num">Zugesagt</th>
                    <th>Status</th>
                    <th>Rückmeldung</th>
                    {canWrite && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.offers.map((o) => (
                    <tr key={o.o.id}>
                      <td>
                        <Link href={`/veranstaltungen/${o.eventId}`}>{o.eventName}</Link>
                        <div className="text-ink-3 text-[12px]">{o.positionName}</div>
                      </td>
                      <td className="mono whitespace-nowrap">{fmtRange(o.positionStartsAt, o.positionEndsAt)}</td>
                      <td className="num">{o.o.headcountRequested}</td>
                      <td className="num">{o.o.headcountCommitted}</td>
                      <td>
                        <Badge tone={o.o.status === "accepted" ? "ok" : o.o.status === "declined" ? "danger" : o.o.status === "offered" ? "info" : "neutral"}>{OFFER_STATUS_LABELS[o.o.status]}</Badge>
                      </td>
                      <td className="text-[12px] text-ink-3">
                        {o.o.respondedAt && fmtDateTime(o.o.respondedAt)}
                        {o.o.responseNote && <div>{o.o.responseNote}</div>}
                      </td>
                      {canWrite && <td className="text-right">{o.o.status === "offered" && <ActionButton action={withdrawOfferAction} label="Zurückziehen" variant="ghost" hidden={{ offerId: o.o.id, partnerId: p.id }} />}</td>}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Ansprechpartner" padded={false}>
            <ul className="divide-y divide-line">
              {data.contacts.map((k) => (
                <li key={k.id} className="px-4 py-2.5 text-[13px]">
                  <div className="font-medium">
                    {k.name} {k.isPrimary && <Badge tone="accent">Haupt</Badge>}
                  </div>
                  <div className="text-ink-3">{k.role}</div>
                  <div className="text-ink-2">
                    {k.email} {k.phone && <span className="mono">· {k.phone}</span>}
                  </div>
                </li>
              ))}
              {data.contacts.length === 0 && <li className="px-4 py-3 text-[13px] text-ink-3">Noch keine Ansprechpartner.</li>}
            </ul>
            {canWrite && (
              <div className="p-4 border-t border-line">
                <ActionForm action={partnerContactAction} submitLabel="Hinzufügen" submitVariant="secondary" className="space-y-2" reset>
                  <input type="hidden" name="partnerId" value={p.id} />
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
          <Panel title="Dokumente">
            {data.documents.length === 0 ? (
              <p className="text-[13px] text-ink-3">Keine Dokumente.</p>
            ) : (
              <ul className="text-[13px] space-y-1">
                {data.documents.map((d) => (
                  <li key={d.id}>
                    <Link href={`/dokumente/${d.id}`}>{d.title}</Link> {d.expiresAt && <span className="text-ink-4">bis {d.expiresAt}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="help">
              <Link href={`/dokumente?entityType=partner&entityId=${p.id}`}>Dokument hochladen</Link>
            </p>
          </Panel>
          <Panel title="Portalzugang">
            <p className="text-[13px] text-ink-3">
              Partner erhalten Zugang über <Link href="/einstellungen/benutzer">Einstellungen → Benutzer → Einladen</Link> mit der Rolle „Partnerunternehmen“ und diesem Partner.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
