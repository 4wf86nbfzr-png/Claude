import { requireCurrent } from "@/server/auth/current";
import { listOffersFor } from "@/server/modules/partners/service";
import { listDocuments } from "@/server/modules/documents/service";
import { OFFER_STATUS_LABELS } from "@/server/modules/partners/schema";
import { PageHeader, Panel, Badge, EmptyState, Field, Input, Select, Textarea, Alert, Dl } from "@/components/ui";
import { ActionForm } from "@/components/ui/form";
import { respondOfferAction } from "../../partner/actions";
import { fmtRange, fmtDateTime } from "@/lib/format";
import Link from "next/link";

export const metadata = { title: "Partnerportal" };
export const dynamic = "force-dynamic";

export default async function PartnerPortalPage() {
  const { ctx } = await requireCurrent("portal:partner");
  if (!ctx.partnerId) return <Alert tone="warn">Ihr Konto ist keinem Partnerunternehmen zugeordnet.</Alert>;
  const [offers, docs] = await Promise.all([listOffersFor(ctx), listDocuments(ctx)]);
  const open = offers.filter((o) => o.o.status === "offered");
  const rest = offers.filter((o) => o.o.status !== "offered");
  return (
    <>
      <PageHeader title="Partnerportal" subtitle="Personalanfragen, die Ihnen zur Besetzung angeboten wurden. Sie sehen nur freigegebene Informationen." />
      <div className="grid xl:grid-cols-[1fr_360px] gap-4 items-start">
        <div className="space-y-4">
          <Panel title={`Offene Anfragen (${open.length})`} padded={false}>
            {open.length === 0 ? (
              <EmptyState title="Keine offenen Anfragen" />
            ) : (
              <ul className="divide-y divide-line">
                {open.map((o) => (
                  <li key={o.o.id} className="p-4 grid md:grid-cols-[1fr_320px] gap-4">
                    <div>
                      <div className="font-medium text-[14px]">
                        {o.positionName} · {o.o.headcountRequested} Personen
                      </div>
                      <Dl
                        items={[
                          { k: "Zeit", v: <span className="mono">{fmtRange(o.positionStartsAt, o.positionEndsAt)}</span> },
                          { k: "Veranstaltung", v: o.eventName },
                          { k: "Ort", v: o.locationName ? `${o.locationName}${o.locationCity ? `, ${o.locationCity}` : ""}` : null },
                          { k: "Treffpunkt", v: o.meetingPoint },
                          { k: "Dresscode", v: o.dresscode },
                          { k: "Briefing", v: o.briefing ? <span className="whitespace-pre-line">{o.briefing}</span> : null },
                          { k: "Nachricht", v: o.o.message },
                          { k: "Rückmeldung bis", v: fmtDateTime(o.o.deadlineAt) },
                        ]}
                      />
                    </div>
                    <ActionForm action={respondOfferAction} submitLabel="Rückmeldung senden" submitVariant="accent" className="space-y-2">
                      <input type="hidden" name="offerId" value={o.o.id} />
                      <input type="hidden" name="partnerId" value={ctx.partnerId ?? ""} />
                      <Field label="Antwort" htmlFor={`resp-${o.o.id}`}>
                        <Select id={`resp-${o.o.id}`} name="response" defaultValue="accepted">
                          <option value="accepted">Zusage (vollständig)</option>
                          <option value="partially_accepted">Teilweise</option>
                          <option value="declined">Absage</option>
                        </Select>
                      </Field>
                      <Field label="Zugesagte Personen" htmlFor={`cnt-${o.o.id}`}>
                        <Input id={`cnt-${o.o.id}`} name="headcountCommitted" type="number" min={0} max={o.o.headcountRequested} defaultValue={o.o.headcountRequested} />
                      </Field>
                      <Field label="Namen des Personals (eine Zeile je Person, optional)" htmlFor={`names-${o.o.id}`}>
                        <Textarea id={`names-${o.o.id}`} name="staffNames" />
                      </Field>
                      <Field label="Hinweis" htmlFor={`note-${o.o.id}`}>
                        <Input id={`note-${o.o.id}`} name="responseNote" />
                      </Field>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Bisherige Anfragen" padded={false}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>Position</th>
                  <th className="num">Angefragt</th>
                  <th className="num">Zugesagt</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((o) => (
                  <tr key={o.o.id}>
                    <td className="mono whitespace-nowrap">{fmtRange(o.positionStartsAt, o.positionEndsAt)}</td>
                    <td>{o.positionName}</td>
                    <td className="num">{o.o.headcountRequested}</td>
                    <td className="num">{o.o.headcountCommitted}</td>
                    <td>
                      <Badge tone={o.o.status === "accepted" ? "ok" : o.o.status === "declined" ? "danger" : "neutral"}>{OFFER_STATUS_LABELS[o.o.status]}</Badge>
                    </td>
                  </tr>
                ))}
                {rest.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-ink-3">
                      Noch keine.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        </div>
        <Panel title="Freigegebene Dokumente">
          {docs.length === 0 ? (
            <p className="text-[13px] text-ink-3">Keine Dokumente.</p>
          ) : (
            <ul className="text-[13px] space-y-1">
              {docs.map((d) => (
                <li key={d.id}>
                  <Link href={`/dokumente/${d.id}`}>{d.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
