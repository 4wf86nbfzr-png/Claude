import { requireCurrent } from "@/server/auth/current";
import { listMembers, listOpenInvitations } from "@/server/modules/users/service";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { ROLE_KEYS } from "@/server/db/schema";
import { PageHeader, Panel, Field, Input, Select, Badge, Table } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { inviteAction, changeRoleAction, memberStatusAction } from "../actions";
import { fmtDateTime } from "@/lib/format";
import { ReauthBox } from "@/components/layout/reauth";
import { withTenant } from "@/server/db/client";
import { employees, customers, partners } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export const metadata = { title: "Benutzer" };

export default async function UsersPage() {
  const { ctx } = await requireCurrent("users:read");
  const [members, invites] = await Promise.all([listMembers(ctx), listOpenInvitations(ctx)]);
  const canWrite = ctx.permissions.has("users:write");
  const reauthOk = Boolean(ctx.reauthAt && Date.now() - ctx.reauthAt.getTime() < 15 * 60_000);
  const [emps, custs, parts] = await withTenant(ctx.tenantId, async (tx) => [
    await tx.select({ id: employees.id, label: employees.lastName, first: employees.firstName, no: employees.employeeNumber }).from(employees).where(eq(employees.status, "active")).orderBy(employees.lastName),
    await tx.select({ id: customers.id, name: customers.name }).from(customers).orderBy(customers.name),
    await tx.select({ id: partners.id, name: partners.name }).from(partners).orderBy(partners.name),
  ]);
  return (
    <>
      <PageHeader title="Benutzer und Einladungen" subtitle="Wer im Unternehmen mit welcher Rolle arbeitet. Rollenänderungen und Sperren verlangen eine Passwortbestätigung." />
      {canWrite && !reauthOk && <ReauthBox />}
      <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
        <Panel title="Mitglieder" padded={false}>
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>E-Mail</th>
                <th>Rolle</th>
                <th>Status</th>
                <th>Letzte Anmeldung</th>
                {canWrite && <th></th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.membershipId}>
                  <td className="font-medium">{m.name}</td>
                  <td className="mono text-[12.5px]">{m.email}</td>
                  <td>
                    {canWrite && m.userId !== ctx.userId ? (
                      <ActionForm action={changeRoleAction} submitLabel="Ändern" submitVariant="secondary" className="flex items-center gap-2 [&>div]:mt-0">
                        <input type="hidden" name="membershipId" value={m.membershipId} />
                        <select name="role" className="input py-1 w-auto" defaultValue={m.role} disabled={!reauthOk}>
                          {ROLE_KEYS.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </ActionForm>
                    ) : (
                      ROLE_LABELS[m.role]
                    )}
                  </td>
                  <td>
                    {m.status === "active" ? <Badge tone="ok">aktiv</Badge> : <Badge tone="danger">gesperrt</Badge>}
                    {m.userStatus === "locked" && <Badge tone="warn">Login gesperrt</Badge>}
                  </td>
                  <td className="text-ink-3">{fmtDateTime(m.lastLoginAt)}</td>
                  {canWrite && (
                    <td className="text-right">
                      {m.userId !== ctx.userId && reauthOk && (
                        <ActionButton
                          action={memberStatusAction}
                          label={m.status === "active" ? "Sperren" : "Entsperren"}
                          variant={m.status === "active" ? "danger" : "secondary"}
                          hidden={{ membershipId: m.membershipId, status: m.status === "active" ? "suspended" : "active" }}
                          confirm={m.status === "active" ? `${m.name} sperren? Laufende Sitzungen werden beendet.` : undefined}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
          {invites.filter((i) => !i.acceptedAt).length > 0 && (
            <div className="p-4 border-t border-line">
              <h3 className="text-[13px] font-semibold mb-2">Offene Einladungen</h3>
              <ul className="text-[13px] space-y-1">
                {invites
                  .filter((i) => !i.acceptedAt)
                  .map((i) => (
                    <li key={i.id} className="flex gap-3">
                      <span className="mono">{i.email}</span>
                      <span className="text-ink-3">{ROLE_LABELS[i.role]}</span>
                      <span className="text-ink-4">gültig bis {fmtDateTime(i.expiresAt)}</span>
                      {i.expiresAt < new Date() && <Badge tone="danger">abgelaufen</Badge>}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Panel>
        {canWrite && (
          <Panel title="Einladen">
            <ActionForm action={inviteAction} submitLabel="Einladung senden" className="space-y-3" reset>
              <Field label="E-Mail-Adresse" htmlFor="inv-email">
                <Input id="inv-email" name="email" type="email" required />
              </Field>
              <Field label="Rolle" htmlFor="inv-role">
                <Select id="inv-role" name="role" defaultValue="dispatcher">
                  {ROLE_KEYS.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Mitarbeiterdatensatz (für Rolle Mitarbeiter)" htmlFor="inv-emp">
                <Select id="inv-emp" name="employeeId" defaultValue="">
                  <option value="">–</option>
                  {emps.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}, {e.first} ({e.no})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Kunde (für Rolle Kunde)" htmlFor="inv-cust">
                <Select id="inv-cust" name="customerId" defaultValue="">
                  <option value="">–</option>
                  {custs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Partner (für Rolle Partnerunternehmen)" htmlFor="inv-part">
                <Select id="inv-part" name="partnerId" defaultValue="">
                  <option value="">–</option>
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </ActionForm>
          </Panel>
        )}
      </div>
    </>
  );
}
