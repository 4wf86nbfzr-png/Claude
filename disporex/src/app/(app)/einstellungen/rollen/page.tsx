import { requireCurrent } from "@/server/auth/current";
import { listRoleOverrides } from "@/server/modules/users/service";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLE_LABELS } from "@/server/auth/permissions";
import { ROLE_KEYS } from "@/server/db/schema";
import { PageHeader, Panel } from "@/components/ui";
import { roleOverrideAction } from "../actions";
import { ReauthBox } from "@/components/layout/reauth";
import { OverrideCell } from "./override-cell";

export const metadata = { title: "Rollen & Rechte" };

export default async function RolesPage() {
  const { ctx } = await requireCurrent("settings:read");
  const overrides = await listRoleOverrides(ctx);
  const canWrite = ctx.permissions.has("settings:write");
  const reauthOk = Boolean(ctx.reauthAt && Date.now() - ctx.reauthAt.getTime() < 15 * 60_000);
  const roles = ROLE_KEYS.filter((r) => r !== "tenant_admin");
  const ov = new Map(overrides.map((o) => [`${o.role}:${o.permission}`, o.allowed]));
  return (
    <>
      <PageHeader title="Rollen & Rechte" subtitle="Standardprofil je Rolle mit mandantenspezifischen Abweichungen. Der Unternehmensadministrator besitzt immer alle Rechte." />
      {canWrite && !reauthOk && <ReauthBox />}
      <Panel padded={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Berechtigung</th>
                {roles.map((r) => (
                  <th key={r}>{ROLE_LABELS[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p}>
                  <td className="mono text-[12px]">{p}</td>
                  {roles.map((r) => {
                    const def = ROLE_PERMISSIONS[r].has(p);
                    const o = ov.get(`${r}:${p}`);
                    const effective = o ?? def;
                    return (
                      <td key={r}>
                        <OverrideCell role={r} permission={p} defaultAllowed={def} override={o ?? null} effective={effective} editable={canWrite && reauthOk} action={roleOverrideAction} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
