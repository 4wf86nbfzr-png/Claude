import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { getReconciliationItem, RECON_KIND_LABELS, RECON_STATUS_LABELS } from "@/server/modules/time/service";
import { PageHeader, Panel, Badge, Dl, Field, Input, Alert } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { explainDeviationAction } from "../../anfragen/ai-actions";
import { aiAvailable } from "@/server/modules/ai/service";
import { approveAction, rejectAction, correctAction, reopenAction } from "../../zeitnachweise/actions";
import { fmtRange, fmtDateTime, fmtMinutes, toLocalInput } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReconciliationItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireCurrent("time:read");
  const { item: it, corrections, employee, shift, record } = await getReconciliationItem(ctx, id);
  const canCorrect = ctx.permissions.has("time:correct");
  const canApprove = ctx.permissions.has("time:approve");
  const editable = it.status === "open" || it.status === "corrected";
  return (
    <>
      <PageHeader
        title={`${RECON_KIND_LABELS[it.kind]}${employee ? ` · ${employee.lastName}, ${employee.firstName}` : ""}`}
        breadcrumb={<Link href="/abgleich">Soll-Ist-Abgleich</Link>}
        subtitle={
          <>
            <Badge tone={it.status === "approved" ? "ok" : it.status === "rejected" ? "danger" : "warn"}>{RECON_STATUS_LABELS[it.status]}</Badge>
            {shift && (
              <>
                {" "}
                · <Link href={`/veranstaltungen/${shift.s.eventId}`}>{shift.eventName}</Link> · {shift.positionName}
              </>
            )}
          </>
        }
      />
      {it.kind === "deviation" && (
        <Alert tone="warn" className="mb-4">
          Geplant {it.plannedStart && it.plannedEnd ? fmtRange(it.plannedStart, it.plannedEnd) : "–"} · Gemeldet {it.actualStart && it.actualEnd ? fmtRange(it.actualStart, it.actualEnd) : "–"} · Ergebnis: <strong>{fmtMinutes(it.deviationMinutes)} Abweichung</strong>, Prüfung erforderlich.
        </Alert>
      )}
      {it.kind === "missing_record" && <Alert tone="danger" className="mb-4">Für diese bestätigte Schicht liegt kein Zeitnachweis vor. Zeiten manuell eintragen (Korrektur) und bestätigen oder den Eintrag ablehnen.</Alert>}
      {it.kind === "unplanned_record" && <Alert tone="info" className="mb-4">Zeitnachweis ohne geplante Schicht. Bestätigen übernimmt die Zeit als Ist-Zeit ohne Planungsbezug; ablehnen verwirft sie für die Abrechnung.</Alert>}
      <div className="grid xl:grid-cols-[1fr_420px] gap-4 items-start">
        <div className="space-y-4">
          <Panel title="Vergleich">
            <Dl
              items={[
                { k: "Geplant (Soll)", v: it.plannedStart && it.plannedEnd ? <span className="mono">{fmtRange(it.plannedStart, it.plannedEnd)}</span> : "–" },
                { k: "Gemeldet (Ist, Rohdaten)", v: it.actualStart && it.actualEnd ? <span className="mono">{fmtRange(it.actualStart, it.actualEnd)}</span> : "–" },
                { k: "Pause (gemeldet)", v: record ? `${record.breakMinutes} min` : "–" },
                { k: "Bestätigt / korrigiert", v: it.approvedStart && it.approvedEnd ? <span className="mono">{fmtRange(it.approvedStart, it.approvedEnd)}{it.approvedBreakMinutes ? ` · Pause ${it.approvedBreakMinutes} min` : ""}</span> : "–" },
                { k: "Abweichung", v: fmtMinutes(it.deviationMinutes) },
                { k: "Quelle", v: record ? `${record.source}${record.importId ? " (Import)" : ""} · Kennung ${record.employeeNumberRaw}` : "–" },
                { k: "Geprüft", v: it.resolvedAt ? `${fmtDateTime(it.resolvedAt)}` : "–" },
                { k: "Hinweis", v: it.resolutionNote },
              ]}
            />
          </Panel>
          <Panel title="Korrekturprotokoll" padded={false}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>Feld</th>
                  <th>Vorher</th>
                  <th>Nachher</th>
                  <th>Wer</th>
                  <th>Begründung</th>
                </tr>
              </thead>
              <tbody>
                {corrections.map(({ c, userName }) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap text-ink-3">{fmtDateTime(c.createdAt)}</td>
                    <td className="mono text-[12px]">{c.field}</td>
                    <td className="mono text-[12px]">{c.oldValue?.endsWith("Z") ? fmtDateTime(c.oldValue) : c.oldValue ?? "–"}</td>
                    <td className="mono text-[12px]">{c.newValue?.endsWith("Z") ? fmtDateTime(c.newValue) : c.newValue ?? "–"}</td>
                    <td>{userName}</td>
                    <td>{c.reason}</td>
                  </tr>
                ))}
                {corrections.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-ink-3">
                      Keine Korrekturen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        </div>
        <div className="space-y-4">
          {canCorrect && editable && (
            <Panel title="Korrigieren">
              <ActionForm action={correctAction} submitLabel="Korrektur speichern" submitVariant="secondary" className="space-y-3">
                <input type="hidden" name="id" value={it.id} />
                <Field label="Beginn (Ist)" htmlFor="c-start">
                  <Input id="c-start" name="approvedStart" type="datetime-local" defaultValue={toLocalInput(it.approvedStart ?? it.actualStart ?? it.plannedStart)} required />
                </Field>
                <Field label="Ende (Ist)" htmlFor="c-end">
                  <Input id="c-end" name="approvedEnd" type="datetime-local" defaultValue={toLocalInput(it.approvedEnd ?? it.actualEnd ?? it.plannedEnd)} required />
                </Field>
                <Field label="Pause (Minuten)" htmlFor="c-break">
                  <Input id="c-break" name="approvedBreakMinutes" type="number" min={0} defaultValue={it.approvedBreakMinutes ?? record?.breakMinutes ?? 0} />
                </Field>
                <Field label="Begründung (Pflicht)" htmlFor="c-reason">
                  <Input id="c-reason" name="reason" required minLength={3} />
                </Field>
              </ActionForm>
            </Panel>
          )}
          {canApprove && editable && (
            <Panel title="Entscheidung">
              <ActionForm action={approveAction} submitLabel={it.status === "corrected" ? "Korrigierte Zeit bestätigen" : "Gemeldete Zeit bestätigen"} submitVariant="accent" className="mb-4">
                <input type="hidden" name="id" value={it.id} />
                <Field label="Hinweis (optional)" htmlFor="a-note">
                  <Input id="a-note" name="note" />
                </Field>
              </ActionForm>
              <ActionForm action={rejectAction} submitLabel="Ablehnen" submitVariant="danger">
                <input type="hidden" name="id" value={it.id} />
                <Field label="Grund (Pflicht)" htmlFor="r-reason">
                  <Input id="r-reason" name="reason" required />
                </Field>
              </ActionForm>
            </Panel>
          )}
          {canApprove && !editable && (
            <Panel title="Zurücksetzen">
              <ActionForm action={reopenAction} submitLabel="Prüfung erneut öffnen" submitVariant="secondary" confirm="Entscheidung zurücksetzen?">
                <input type="hidden" name="id" value={it.id} />
                <Field label="Grund" htmlFor="o-reason">
                  <Input id="o-reason" name="reason" required />
                </Field>
              </ActionForm>
            </Panel>
          )}
          {!canCorrect && !canApprove && <p className="text-[13px] text-ink-3">Nur Lesezugriff.</p>}
          {ctx.permissions.has("ai:use") && aiAvailable() && it.kind !== "match" && (
            <Panel title="Verständliche Erklärung (KI)">
              <ActionButton action={explainDeviationAction} label="Abweichung erklären" size={undefined} hidden={{ id: it.id }} className="block" />
              <p className="help mt-2">Erklärt die Abweichung in Worten; die Entscheidung bleibt bei Ihnen.</p>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
