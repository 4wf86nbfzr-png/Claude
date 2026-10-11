import { requireCurrent } from "@/server/auth/current";
import { listApiKeys } from "@/server/auth/api-keys";
import { PERMISSIONS } from "@/server/auth/permissions";
import { PageHeader, Panel, Field, Input, Badge, Table, Alert } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { createApiKeyAction, revokeApiKeyAction, rotateApiKeyAction } from "../actions";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "API-Schlüssel" };

export default async function ApiKeysPage() {
  const { ctx } = await requireCurrent("api_keys:manage");
  const keys = await listApiKeys(ctx);
  const scopes = PERMISSIONS.filter((p) => !p.startsWith("portal:") && !p.endsWith("_own"));
  return (
    <>
      <PageHeader title="API-Schlüssel" subtitle="Für externe Integrationen über /api/v1. Schlüssel werden nur als Hash gespeichert und genau einmal im Klartext angezeigt." />
      <div className="grid lg:grid-cols-[1fr_420px] gap-4 items-start">
        <Panel title="Vorhandene Schlüssel" padded={false}>
          {keys.length === 0 ? (
            <p className="p-4 text-[13px] text-ink-3">Noch keine Schlüssel.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Präfix</th>
                  <th>Scopes</th>
                  <th>Zuletzt benutzt</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const expired = k.expiresAt && k.expiresAt < new Date();
                  return (
                    <tr key={k.id}>
                      <td className="font-medium">{k.name}</td>
                      <td className="mono">{k.prefix}…</td>
                      <td className="text-[12px] text-ink-3 max-w-[320px]">{k.scopes.join(", ")}</td>
                      <td className="text-ink-3">{fmtDateTime(k.lastUsedAt)}</td>
                      <td>
                        {k.revokedAt ? <Badge tone="danger">widerrufen</Badge> : expired ? <Badge tone="warn">abgelaufen</Badge> : <Badge tone="ok">aktiv</Badge>}
                        {k.expiresAt && !k.revokedAt && <div className="text-[11.5px] text-ink-4">bis {fmtDateTime(k.expiresAt)}</div>}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {!k.revokedAt && !expired && (
                          <>
                            <RotateButton id={k.id} />{" "}
                            <ActionButton action={revokeApiKeyAction} label="Widerrufen" variant="danger" hidden={{ id: k.id }} confirm="Schlüssel sofort widerrufen? Integrationen mit diesem Schlüssel schlagen danach fehl." />
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Panel>
        <Panel title="Neuen Schlüssel erstellen">
          <Alert tone="info" className="mb-3">
            Vergeben Sie nur die Scopes, die die Integration wirklich braucht.
          </Alert>
          <ActionForm action={createApiKeyAction} submitLabel="Erstellen" className="space-y-3">
            <Field label="Name" htmlFor="k-name">
              <Input id="k-name" name="name" required minLength={2} placeholder="z. B. Webseite-Anfrageformular" />
            </Field>
            <Field label="Ablaufdatum (optional)" htmlFor="k-exp">
              <Input id="k-exp" name="expiresAt" type="date" />
            </Field>
            <fieldset>
              <legend className="label">Scopes</legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 max-h-[280px] overflow-y-auto border border-line rounded-md p-2 text-[12.5px]">
                {scopes.map((p) => (
                  <label key={p} className="flex items-center gap-1.5">
                    <input type="checkbox" name="scopes" value={p} disabled={!ctx.permissions.has(p)} /> <span className="mono">{p}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}

function RotateButton({ id }: { id: string }) {
  return (
    <ActionForm action={rotateApiKeyAction} submitLabel="Rotieren" submitVariant="secondary" className="inline [&>div]:inline [&>div]:mt-0">
      <input type="hidden" name="id" value={id} />
    </ActionForm>
  );
}
