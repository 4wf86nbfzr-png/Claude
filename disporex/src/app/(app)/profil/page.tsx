import { requireCurrent } from "@/server/auth/current";
import { listUserSessions } from "@/server/modules/users/service";
import { getMyPreferences } from "@/server/modules/notifications/service";
import { PageHeader, Panel, Field, Input, Table, Badge, Dl } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { changePasswordAction, savePrefsAction } from "./actions";
import { revokeSessionAction } from "../einstellungen/actions";
import { fmtDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/server/auth/permissions";

export const metadata = { title: "Profil" };

const KINDS: { kind: string; label: string }[] = [
  { kind: "shift.request", label: "Einsatzanfragen" },
  { kind: "shift.response", label: "Rückmeldungen von Mitarbeitern" },
  { kind: "shift.declined", label: "Absagen" },
  { kind: "request.new", label: "Neue Kundenanfragen" },
  { kind: "document.expiring", label: "Ablaufende Dokumente/Qualifikationen" },
  { kind: "import.completed", label: "Importe und Abgleich" },
];

export default async function ProfilePage() {
  const { ctx, user } = await requireCurrent();
  const [sessions, prefs] = await Promise.all([listUserSessions(ctx, user.id), getMyPreferences(ctx)]);
  return (
    <>
      <PageHeader title="Profil und Sicherheit" />
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Panel title="Konto">
          <Dl items={[{ k: "Name", v: user.name }, { k: "E-Mail", v: user.email }, { k: "Rolle", v: ctx.role === "system" ? "Systemadministrator" : ROLE_LABELS[ctx.role] }]} />
        </Panel>
        <Panel title="Passwort ändern">
          <ActionForm action={changePasswordAction} submitLabel="Passwort ändern" className="space-y-3" successMessage="Passwort geändert. Andere Sitzungen wurden beendet.">
            <Field label="Aktuelles Passwort" htmlFor="cur">
              <Input id="cur" name="current" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="Neues Passwort" htmlFor="new" help="Mindestens 10 Zeichen.">
              <Input id="new" name="password" type="password" autoComplete="new-password" required minLength={10} />
            </Field>
          </ActionForm>
        </Panel>
        <Panel title="Benachrichtigungen">
          <ActionForm action={savePrefsAction} submitLabel="Speichern" successMessage="Gespeichert.">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Anlass</th>
                  <th>In-App</th>
                  <th>E-Mail</th>
                </tr>
              </thead>
              <tbody>
                {KINDS.map((k) => (
                  <tr key={k.kind}>
                    <td>{k.label}</td>
                    <td>
                      <input type="checkbox" name={`in_app:${k.kind}`} defaultChecked={prefs[k.kind]?.in_app !== false} />
                    </td>
                    <td>
                      <input type="checkbox" name={`email:${k.kind}`} defaultChecked={prefs[k.kind]?.email !== false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="help">Kritische Meldungen werden unabhängig von diesen Einstellungen zugestellt.</p>
          </ActionForm>
        </Panel>
        <Panel title="Aktive Sitzungen" padded={false}>
          <Table>
            <thead>
              <tr>
                <th>Gerät</th>
                <th>IP</th>
                <th>Zuletzt aktiv</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions
                .filter((s) => !s.revokedAt && s.expiresAt > new Date())
                .map((s) => (
                  <tr key={s.id}>
                    <td className="text-[12px] text-ink-2 max-w-[260px] truncate" title={s.userAgent ?? ""}>
                      {s.userAgent ?? "–"} {s.id === ctx.sessionId && <Badge tone="accent">diese</Badge>}
                    </td>
                    <td className="mono">{s.ip ?? "–"}</td>
                    <td className="text-ink-3">{fmtDateTime(s.lastSeenAt)}</td>
                    <td className="text-right">{s.id !== ctx.sessionId && <ActionButton action={revokeSessionAction} label="Beenden" hidden={{ sessionId: s.id }} />}</td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </Panel>
      </div>
    </>
  );
}
