import { requireCurrent } from "@/server/auth/current";
import { listEndpoints, listDeliveries } from "@/server/modules/webhooks/service";
import { DOMAIN_EVENT_TYPES } from "@/server/core/events";
import { PageHeader, Panel, Table, Badge, Field, Input, Textarea, Alert } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { createWebhookAction, toggleWebhookAction, rotateWebhookAction, deleteWebhookAction, retryDeliveryAction } from "../integrations-actions";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Webhooks" };
export const dynamic = "force-dynamic";

export default async function WebhooksPage({ searchParams }: { searchParams: Promise<{ endpoint?: string }> }) {
  const { ctx } = await requireCurrent("webhooks:manage");
  const sp = await searchParams;
  const endpoints = await listEndpoints(ctx);
  const selected = sp.endpoint ?? endpoints[0]?.id;
  const deliveries = selected ? await listDeliveries(ctx, selected, 50) : [];
  return (
    <>
      <PageHeader title="Webhooks" subtitle="Ausgehende Ereignismeldungen an Ihre Systeme. Signiert (HMAC-SHA256), mit Zeitstempel, Wiederholung bei Fehlern, keine internen Ziele." />
      <div className="grid xl:grid-cols-[1fr_400px] gap-4 items-start">
        <div className="space-y-4">
          <Panel title="Endpunkte" padded={false}>
            {endpoints.length === 0 ? (
              <p className="p-4 text-[13px] text-ink-3">Noch keine Webhooks.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>URL</th>
                    <th>Ereignisse</th>
                    <th>Status</th>
                    <th className="num">Zustellungen</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <a href={`/einstellungen/webhooks?endpoint=${e.id}`} className="font-medium">
                          {e.name}
                        </a>
                      </td>
                      <td className="mono text-[12px] max-w-[260px] truncate" title={e.url}>
                        {e.url}
                      </td>
                      <td className="text-[12px] text-ink-3 max-w-[200px]">{e.eventTypes.join(", ")}</td>
                      <td>
                        {e.active ? <Badge tone="ok">aktiv</Badge> : <Badge tone="danger">inaktiv</Badge>}
                        {e.failureCount > 0 && <div className="text-[11.5px] text-warn">{e.failureCount} Fehler in Folge</div>}
                      </td>
                      <td className="num">
                        {e.deliveries} {e.failed > 0 && <Badge tone="danger">{e.failed} fehlgeschlagen</Badge>}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <ActionButton action={toggleWebhookAction} label={e.active ? "Deaktivieren" : "Aktivieren"} hidden={{ id: e.id, active: e.active ? "0" : "1" }} />{" "}
                        <ActionForm action={rotateWebhookAction} submitLabel="Geheimnis rotieren" submitVariant="secondary" className="inline [&>div]:inline [&>div]:mt-0 [&>div>button]:btn-sm">
                          <input type="hidden" name="id" value={e.id} />
                        </ActionForm>{" "}
                        <ActionButton action={deleteWebhookAction} label="Löschen" variant="danger" hidden={{ id: e.id }} confirm="Webhook löschen?" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
          {selected && (
            <Panel title="Letzte Zustellungen" padded={false}>
              {deliveries.length === 0 ? (
                <p className="p-4 text-[13px] text-ink-3">Noch keine Zustellungen.</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>Zeit</th>
                      <th>Ereignis</th>
                      <th>Status</th>
                      <th className="num">Versuche</th>
                      <th>Antwort / Fehler</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d) => (
                      <tr key={d.id}>
                        <td className="whitespace-nowrap text-ink-3">{fmtDateTime(d.createdAt)}</td>
                        <td className="mono text-[12px]">{d.eventType}</td>
                        <td>
                          <Badge tone={d.status === "delivered" ? "ok" : d.status === "pending" ? "info" : "danger"}>{d.status}</Badge>
                        </td>
                        <td className="num">{d.attempts}</td>
                        <td className="text-[12px] max-w-[320px] truncate" title={d.lastError ?? d.lastResponseSnippet ?? ""}>
                          {d.lastStatusCode && <span className="mono">{d.lastStatusCode} </span>}
                          {d.lastError ?? d.lastResponseSnippet}
                        </td>
                        <td className="text-right">{d.status !== "delivered" && d.status !== "pending" && <ActionButton action={retryDeliveryAction} label="Erneut" hidden={{ id: d.id }} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Panel>
          )}
        </div>
        <Panel title="Neuer Webhook">
          <Alert tone="info" className="mb-3">
            Signatur-Header <span className="mono">X-DispoRex-Signature: t=&lt;unix&gt;,v1=&lt;hmac&gt;</span> über <span className="mono">&lt;t&gt;.&lt;body&gt;</span>. Toleranz 5 Minuten empfohlen.
          </Alert>
          <ActionForm action={createWebhookAction} submitLabel="Anlegen" className="space-y-3">
            <Field label="Name" htmlFor="wh-name">
              <Input id="wh-name" name="name" required />
            </Field>
            <Field label="URL (https)" htmlFor="wh-url">
              <Input id="wh-url" name="url" type="url" required placeholder="https://example.com/disporex" />
            </Field>
            <fieldset>
              <legend className="label">Ereignisse</legend>
              <div className="grid grid-cols-1 gap-y-1 max-h-[260px] overflow-y-auto border border-line rounded-md p-2 text-[12.5px]">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="eventTypes" value="*" /> <span className="mono">*</span> (alle)
                </label>
                {DOMAIN_EVENT_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-1.5">
                    <input type="checkbox" name="eventTypes" value={t} /> <span className="mono">{t}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Beschreibung" htmlFor="wh-desc">
              <Textarea id="wh-desc" name="description" />
            </Field>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
