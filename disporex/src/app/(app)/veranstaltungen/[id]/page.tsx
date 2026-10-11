import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { getEvent } from "@/server/modules/events/service";
import { listCustomers, listLocations, getCustomer } from "@/server/modules/customers/service";
import { listQualifications } from "@/server/modules/qualifications/service";
import { EVENT_STATUS_LABELS, ORDER_STATUS_LABELS } from "@/server/modules/events/schema";
import { SHIFT_STATUS_LABELS } from "@/server/modules/shifts/schema";
import { PageHeader, Panel, Badge, Alert, Input, Textarea, Field, Dl, LinkButton } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { updateEventAction, eventStatusAction, createPositionAction, deletePositionAction, orderAction, shiftConfirmAction, shiftWithdrawAction, shiftRespondAction, removeSlotAction } from "../actions";
import { EventFormFields, PositionFormFields } from "@/components/events/event-form";
import { fmtRange, fmtDateTime, fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const TONE: Record<string, "ok" | "neutral" | "warn" | "danger" | "info" | "accent"> = { draft: "neutral", planned: "info", confirmed: "ok", in_progress: "accent", completed: "neutral", cancelled: "danger" };
const SHIFT_TONE: Record<string, "ok" | "neutral" | "warn" | "danger" | "info" | "accent"> = { open: "warn", requested: "info", accepted: "accent", confirmed: "ok", declined: "danger", no_response: "danger", withdrawn: "neutral", replaced: "neutral", cancelled: "neutral" };

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ hinweis?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { ctx } = await requireCurrent("events:read");
  const data = await getEvent(ctx, id);
  const e = data.event;
  const canWrite = ctx.permissions.has("events:write");
  const canAssign = ctx.permissions.has("shifts:assign");
  const internal = ctx.role !== "customer";
  const [customers, locations, quals, cust] = internal
    ? await Promise.all([listCustomers(ctx, { pageSize: 200, status: "all" }).then((p) => p.items), listLocations(ctx, e.customerId), listQualifications(ctx), getCustomer(ctx, e.customerId)])
    : [[], [], [], null];
  const confirmedEvent = e.status === "confirmed" || e.status === "in_progress";
  const required = data.positions.reduce((a, p) => a + p.headcountRequired, 0);
  const filled = data.positions.reduce((a, p) => a + p.filled, 0);
  const transitions: Record<string, { to: string; label: string; variant?: "primary" | "secondary" | "danger" | "accent"; needsReason?: boolean }[]> = {
    draft: [{ to: "planned", label: "Als geplant markieren", variant: "primary" }],
    planned: [{ to: "draft", label: "Zurück zu Entwurf" }],
    confirmed: [
      { to: "in_progress", label: "Läuft jetzt", variant: "accent" },
      { to: "completed", label: "Abschließen", variant: "primary" },
    ],
    in_progress: [{ to: "completed", label: "Abschließen", variant: "primary" }],
    completed: [],
    cancelled: [{ to: "draft", label: "Reaktivieren" }],
  };
  return (
    <>
      <PageHeader
        title={e.name}
        breadcrumb={<Link href="/veranstaltungen">Veranstaltungen</Link>}
        subtitle={
          <>
            <Badge tone={TONE[e.status]}>{EVENT_STATUS_LABELS[e.status]}</Badge> · {fmtRange(e.startsAt, e.endsAt)} · <Link href={`/kunden/${e.customerId}`}>{data.customerName}</Link>
            {data.location && <> · {data.location.name}</>} · Besetzung {filled}/{required}
          </>
        }
        actions={
          canWrite && (
            <div className="flex flex-wrap gap-2">
              {transitions[e.status]?.map((t) => <ActionButton key={t.to} action={eventStatusAction} label={t.label} variant={t.variant ?? "secondary"} size={undefined} hidden={{ id: e.id, status: t.to }} />)}
              {!["completed", "cancelled"].includes(e.status) && (
                <ActionForm action={eventStatusAction} submitLabel="Absagen" submitVariant="danger" className="flex items-center gap-2 [&>div]:mt-0" confirm="Veranstaltung absagen? Alle Einsätze werden storniert und Mitarbeiter informiert.">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="status" value="cancelled" />
                  <Input name="reason" placeholder="Grund der Absage" required className="w-48" />
                </ActionForm>
              )}
            </div>
          )
        }
      />
      {sp.hinweis === "umgewandelt" && (
        <Alert tone="ok" className="mb-4">
          Aus der Anfrage wurden Veranstaltung und Auftragsentwurf erstellt. Prüfen Sie Positionen und bestätigen Sie den Auftrag, sobald der Kunde zugesagt hat.
        </Alert>
      )}
      <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="space-y-4">
          <Panel title="Positionen und Besetzung" padded={false}>
            {data.positions.length === 0 && <p className="p-4 text-[13px] text-ink-3">Noch keine Positionen. Legen Sie den Personalbedarf je Rolle an.</p>}
            {data.positions.map((p) => (
              <div key={p.id} className="border-b border-line last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-surface">
                  <div className="text-[13.5px]">
                    <span className="font-semibold">{p.name}</span> <span className="text-ink-3">· {fmtTime(p.startsAt)}–{fmtTime(p.endsAt)} · Bedarf {p.headcountRequired}</span>
                    {p.qualificationNames.length > 0 && <span className="text-ink-3"> · {p.qualificationNames.join(", ")}</span>}
                    {p.billingCategory && <span className="mono text-ink-4"> · {p.billingCategory}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <Badge tone={p.open > 0 ? "warn" : "ok"}>
                      {p.filled} besetzt · {p.pending} angefragt · {p.open} offen
                    </Badge>
                    {canWrite && (
                      <>
                        <LinkButton href={`/veranstaltungen/${e.id}/positionen/${p.id}`} size="sm">
                          Bearbeiten
                        </LinkButton>
                        <ActionButton action={deletePositionAction} label="Löschen" variant="ghost" hidden={{ eventId: e.id, positionId: p.id }} confirm={`Position „${p.name}“ löschen?`} />
                      </>
                    )}
                  </div>
                </div>
                <table className="tbl">
                  <tbody>
                    {p.shifts.map((s) => (
                      <tr key={s.id} className={["replaced", "cancelled", "withdrawn", "declined", "no_response"].includes(s.status) ? "text-ink-4" : ""}>
                        <td className="w-[150px]">
                          <Badge tone={SHIFT_TONE[s.status]}>{SHIFT_STATUS_LABELS[s.status]}</Badge>
                        </td>
                        <td>
                          {s.employeeId ? (
                            <Link href={`/mitarbeiter/${s.employeeId}`}>
                              {s.employeeName} <span className="mono text-ink-4">{s.employeeNumber}</span>
                            </Link>
                          ) : s.partnerName ? (
                            <span>
                              {s.partnerName} {s.partnerStaffName && <span className="text-ink-3">({s.partnerStaffName})</span>}
                            </span>
                          ) : (
                            <span className="text-ink-4">– unbesetzt –</span>
                          )}
                          {s.conflictOverrideReason && (
                            <div className="text-[12px] text-warn" title={`Freigegeben von Benutzer ${s.conflictOverrideBy}`}>
                              Konflikt freigegeben: {s.conflictOverrideReason}
                            </div>
                          )}
                          {s.status === "requested" && s.responseDeadlineAt && <div className="text-[12px] text-ink-3">Frist: {fmtDateTime(s.responseDeadlineAt)}{s.responseDeadlineAt < new Date() && <Badge tone="danger">überfällig</Badge>}</div>}
                          {s.notes && <div className="text-[12px] text-ink-3 whitespace-pre-line">{s.notes}</div>}
                        </td>
                        <td className="mono text-[12px] whitespace-nowrap">
                          {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          <Link href={`/schichten/${s.id}`} className="btn btn-ghost btn-sm">
                            Details
                          </Link>{" "}
                          {canAssign && s.status === "open" && (
                            <>
                              <LinkButton href={`/veranstaltungen/${e.id}/besetzen/${s.id}`} variant="primary" size="sm">
                                Besetzen
                              </LinkButton>{" "}
                              <ActionButton action={removeSlotAction} label="Slot entfernen" variant="ghost" hidden={{ eventId: e.id, shiftId: s.id }} />
                            </>
                          )}
                          {canAssign && s.status === "requested" && (
                            <>
                              <ActionButton action={shiftRespondAction} label="Zusage erfassen" hidden={{ eventId: e.id, shiftId: s.id, response: "accepted" }} />{" "}
                              <ActionButton action={shiftRespondAction} label="Absage erfassen" variant="danger" hidden={{ eventId: e.id, shiftId: s.id, response: "declined" }} />
                            </>
                          )}
                          {canAssign && s.status === "accepted" && <ActionButton action={shiftConfirmAction} label="Bestätigen" variant="accent" hidden={{ eventId: e.id, shiftId: s.id }} />}{" "}
                          {canAssign && ["requested", "accepted", "confirmed"].includes(s.status) && (
                            <ActionForm action={shiftWithdrawAction} submitLabel="Zurückziehen" submitVariant="danger" className="inline-flex items-center gap-1 [&>div]:mt-0 [&>div>button]:btn-sm" confirm="Zuweisung zurückziehen? Der Slot wird neu geöffnet.">
                              <input type="hidden" name="eventId" value={e.id} />
                              <input type="hidden" name="shiftId" value={s.id} />
                              <Input name="reason" placeholder="Grund" required className="w-32 py-1 text-[12px]" />
                            </ActionForm>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {canWrite && !["completed", "cancelled"].includes(e.status) && (
              <details className="p-4 border-t border-line" open={data.positions.length === 0}>
                <summary className="cursor-pointer text-[13px] font-medium">Position hinzufügen</summary>
                <div className="mt-3">
                  <ActionForm action={createPositionAction} submitLabel="Position anlegen" submitVariant="secondary" reset>
                    <input type="hidden" name="eventId" value={e.id} />
                    <PositionFormFields qualifications={quals} defaults={{ startsAt: e.startsAt, endsAt: e.endsAt }} />
                  </ActionForm>
                </div>
              </details>
            )}
          </Panel>
          <Panel title="Veranstaltungsdaten">
            {internal ? (
              <ActionForm action={updateEventAction} submitLabel="Speichern">
                <input type="hidden" name="id" value={e.id} />
                <fieldset disabled={!canWrite || ["completed", "cancelled"].includes(e.status)}>
                  <EventFormFields e={e} customers={customers} locations={locations} contacts={cust?.contacts ?? []} />
                  {confirmedEvent && (
                    <Field label="Begründung der Änderung (Pflicht nach Bestätigung)" htmlFor="reason" className="mt-3">
                      <Input id="reason" name="reason" />
                    </Field>
                  )}
                </fieldset>
              </ActionForm>
            ) : (
              <Dl items={[{ k: "Zeit", v: fmtRange(e.startsAt, e.endsAt) }, { k: "Ort", v: data.location?.name }, { k: "Treffpunkt", v: e.meetingPoint }, { k: "Dresscode", v: e.dresscode }, { k: "Briefing", v: e.briefing }]} />
            )}
          </Panel>
        </div>
        <div className="space-y-4">
          {internal && (
            <Panel title="Auftrag">
              {data.order ? (
                <>
                  <Dl items={[{ k: "Nummer", v: <span className="mono">{data.order.orderNumber}</span> }, { k: "Status", v: <Badge tone={data.order.status === "confirmed" ? "ok" : data.order.status === "changed" ? "warn" : "neutral"}>{ORDER_STATUS_LABELS[data.order.status]}</Badge> }, { k: "Bestätigt", v: fmtDateTime(data.order.confirmedAt) }, { k: "Kundenportal", v: data.order.releasedToCustomerAt ? "freigegeben" : "nicht freigegeben" }]} />
                  {data.order.notes && <p className="text-[13px] mt-2 whitespace-pre-line">{data.order.notes}</p>}
                  {ctx.permissions.has("orders:write") && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {["draft", "offered"].includes(data.order.status) && <ActionButton action={orderAction} label="Als angeboten markieren" hidden={{ eventId: e.id, status: "offered" }} />}
                      {["draft", "offered", "changed"].includes(data.order.status) && ctx.permissions.has("orders:confirm") && (
                        <ActionButton action={orderAction} label="Auftrag bestätigen" variant="accent" hidden={{ eventId: e.id, status: "confirmed", release: "1" }} confirm="Auftrag verbindlich bestätigen? Die Veranstaltung wird damit bestätigt." />
                      )}
                      {["draft", "offered", "confirmed", "changed"].includes(data.order.status) && (
                        <ActionButton action={orderAction} label="Stornieren" variant="danger" hidden={{ eventId: e.id, status: "cancelled" }} confirm="Auftrag stornieren?" />
                      )}
                    </div>
                  )}
                </>
              ) : ctx.permissions.has("orders:write") ? (
                <ActionButton action={orderAction} label="Auftrag anlegen" variant="primary" size={undefined} hidden={{ eventId: e.id }} />
              ) : (
                <p className="text-[13px] text-ink-3">Kein Auftrag.</p>
              )}
            </Panel>
          )}
          {e.internalNotes && internal && (
            <Panel title="Interne Notizen">
              <p className="text-[13px] whitespace-pre-line">{e.internalNotes}</p>
            </Panel>
          )}
          {data.changes.length > 0 && (
            <Panel title="Änderungen nach Bestätigung">
              <ul className="text-[12.5px] space-y-1.5">
                {data.changes.map((c) => (
                  <li key={c.id}>
                    <div className="text-ink-4">
                      {fmtDateTime(c.createdAt)} · {c.actor ?? "System"}
                    </div>
                    <div>
                      <span className="mono">{c.field}</span>: {c.oldValue ?? "–"} → {c.newValue ?? "–"}
                    </div>
                    {c.reason && <div className="text-ink-3">Grund: {c.reason}</div>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Dokumente">
            {data.documents.length === 0 ? <p className="text-[13px] text-ink-3">Keine Dokumente.</p> : (
              <ul className="text-[13px] space-y-1">
                {data.documents.map((d) => (
                  <li key={d.id}>
                    <Link href={`/dokumente/${d.id}`}>{d.title}</Link> <span className="text-ink-4">({d.category})</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="help">
              <Link href={`/dokumente?entityType=event&entityId=${e.id}`}>Dokument hochladen</Link>
            </p>
            <Textarea className="hidden" />
          </Panel>
        </div>
      </div>
    </>
  );
}
