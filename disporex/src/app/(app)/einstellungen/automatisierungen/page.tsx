import { requireCurrent } from "@/server/auth/current";
import { listRules, listRuns } from "@/server/modules/automations/service";
import { DOMAIN_EVENT_TYPES } from "@/server/core/events";
import { ROLE_KEYS } from "@/server/db/schema";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { PageHeader, Panel, Table, Badge, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { createRuleAction, toggleRuleAction, deleteRuleAction, defaultRulesAction } from "../integrations-actions";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Automatisierungen" };
export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const { ctx } = await requireCurrent("automations:manage");
  const [rules, runs] = await Promise.all([listRules(ctx), listRuns(ctx, undefined, 50)]);
  return (
    <>
      <PageHeader
        title="Automatisierungen"
        subtitle="Auslöser → Bedingungen → Aktionen. Jede Ausführung wird protokolliert; Regeln erzeugen nie verbindliche Aufträge und laufen nicht rekursiv."
        actions={<ActionButton action={defaultRulesAction} label="Standardregeln anlegen" size={undefined} />}
      />
      <div className="grid xl:grid-cols-[1fr_420px] gap-4 items-start">
        <div className="space-y-4">
          <Panel title="Regeln" padded={false}>
            {rules.length === 0 ? (
              <p className="p-4 text-[13px] text-ink-3">Noch keine Regeln. „Standardregeln anlegen“ erzeugt sinnvolle Vorgaben.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Auslöser</th>
                    <th>Bedingungen</th>
                    <th>Aktionen</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-[12px] text-ink-3">{r.description}</div>
                      </td>
                      <td className="mono text-[12px]">{r.trigger}</td>
                      <td className="text-[12px] text-ink-3">{r.conditions.length === 0 ? "immer" : r.conditions.map((c) => `${c.field} ${c.type.replace("field_", "")}${"value" in c ? ` ${String(c.value)}` : ""}`).join("; ")}</td>
                      <td className="text-[12px] text-ink-3">{r.actions.map((a) => a.type).join(", ")}</td>
                      <td>
                        {r.enabled ? <Badge tone="ok">aktiv</Badge> : <Badge>aus</Badge>}
                        <div className="text-[11.5px] text-ink-4">max. {r.maxRunsPerHour}/h</div>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <ActionButton action={toggleRuleAction} label={r.enabled ? "Deaktivieren" : "Aktivieren"} hidden={{ id: r.id, enabled: r.enabled ? "0" : "1" }} />{" "}
                        <ActionButton action={deleteRuleAction} label="Löschen" variant="danger" hidden={{ id: r.id }} confirm="Regel löschen?" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
          <Panel title="Letzte Ausführungen" padded={false}>
            {runs.length === 0 ? (
              <p className="p-4 text-[13px] text-ink-3">Noch keine Ausführungen.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Zeit</th>
                    <th>Regel</th>
                    <th>Status</th>
                    <th>Protokoll</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(({ run, ruleName }) => (
                    <tr key={run.id}>
                      <td className="whitespace-nowrap text-ink-3">{fmtDateTime(run.createdAt)}</td>
                      <td>{ruleName}</td>
                      <td>
                        <Badge tone={run.status === "success" ? "ok" : run.status === "failed" ? "danger" : "neutral"}>{run.status}</Badge>
                      </td>
                      <td className="text-[12px]">
                        {run.log.map((l, i) => (
                          <div key={i} className={l.ok ? "text-ink-2" : "text-danger"}>
                            {l.step}: {l.ok ? "ok" : "Fehler"}
                            {l.message ? ` – ${l.message}` : ""}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </div>
        <Panel title="Neue Regel">
          <ActionForm action={createRuleAction} submitLabel="Regel anlegen" className="space-y-3">
            <Field label="Name" htmlFor="r-name">
              <Input id="r-name" name="name" required />
            </Field>
            <Field label="Beschreibung" htmlFor="r-desc">
              <Textarea id="r-desc" name="description" />
            </Field>
            <Field label="Auslöser" htmlFor="r-trigger">
              <Select id="r-trigger" name="trigger" defaultValue="customer_request.created">
                {DOMAIN_EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset className="space-y-2">
              <legend className="label">Bedingungen (optional, alle müssen zutreffen)</legend>
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr] gap-1">
                  <Select name={`c${i}_type`} defaultValue="" aria-label="Typ" className="py-1 text-[12.5px]">
                    <option value="">–</option>
                    <option value="field_present">vorhanden</option>
                    <option value="field_missing">fehlt</option>
                    <option value="field_equals">gleich</option>
                    <option value="field_gt">größer als</option>
                  </Select>
                  <Input name={`c${i}_field`} placeholder="Feld, z. B. headcount" aria-label="Feld" className="py-1 text-[12.5px]" />
                  <Input name={`c${i}_value`} placeholder="Wert" aria-label="Wert" className="py-1 text-[12.5px]" />
                </div>
              ))}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="label">Aktionen</legend>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="a_notify" defaultChecked /> Rolle benachrichtigen
              </label>
              <div className="grid grid-cols-2 gap-1 pl-5">
                <Select name="a_notify_role" defaultValue="dispatcher" className="py-1 text-[12.5px]" aria-label="Rolle">
                  {ROLE_KEYS.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
                <Select name="a_notify_priority" defaultValue="normal" className="py-1 text-[12.5px]" aria-label="Priorität">
                  <option value="low">niedrig</option>
                  <option value="normal">normal</option>
                  <option value="high">hoch</option>
                  <option value="critical">kritisch</option>
                </Select>
                <Input name="a_notify_title" placeholder="Titel, z. B. Anfrage: {title}" className="col-span-2 py-1 text-[12.5px]" aria-label="Titel" />
                <Input name="a_notify_body" placeholder="Text (Platzhalter {feld})" className="col-span-2 py-1 text-[12.5px]" aria-label="Text" />
              </div>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="a_flag" /> Fehlende Felder kennzeichnen (Anfragen)
              </label>
              <Input name="a_flag_fields" defaultValue="startsAt,endsAt,locationText,headcount" className="ml-5 py-1 text-[12.5px]" aria-label="Felder" />
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="a_status" /> Anfragestatus setzen
              </label>
              <Select name="a_status_value" defaultValue="in_review" className="ml-5 py-1 text-[12.5px] w-auto" aria-label="Status">
                <option value="new">Neu</option>
                <option value="in_review">In Prüfung</option>
                <option value="needs_info">Rückfrage</option>
              </Select>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="a_webhook" /> Ereignis an Webhooks auslösen
              </label>
              <Select name="a_webhook_event" defaultValue="customer_request.updated" className="ml-5 py-1 text-[12.5px] w-auto" aria-label="Ereignis">
                {DOMAIN_EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="a_ai" /> KI-Extraktion der Anfrage (nur bei konfiguriertem Anbieter)
              </label>
            </fieldset>
            <Field label="Max. Ausführungen pro Stunde" htmlFor="r-max">
              <Input id="r-max" name="maxRunsPerHour" type="number" min={1} max={10000} defaultValue={100} />
            </Field>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
