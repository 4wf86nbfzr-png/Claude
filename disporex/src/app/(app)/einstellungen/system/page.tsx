import { requireCurrent } from "@/server/auth/current";
import { listRecentJobs } from "@/server/jobs/queue";
import { PageHeader, Panel, Table, Badge, EmptyState } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { env } from "@/server/core/env";
import { mailConfigured } from "@/server/modules/mail/mailer";

export const metadata = { title: "System" };
export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const { ctx } = await requireCurrent("settings:read");
  const jobs = await listRecentJobs(ctx.tenantId, 50);
  const e = env();
  const tone = (s: string) => (s === "completed" ? "ok" : s === "failed" ? "warn" : s === "dead" ? "danger" : s === "running" ? "info" : "neutral");
  return (
    <>
      <PageHeader title="System" subtitle="Konfigurationsstatus und Hintergrundjobs dieses Mandanten." />
      <div className="grid lg:grid-cols-[360px_1fr] gap-4 items-start">
        <Panel title="Integrationen">
          <ul className="text-[13px] space-y-1.5">
            <li>
              E-Mail-Versand: {mailConfigured() ? <Badge tone="ok">SMTP konfiguriert</Badge> : <Badge tone="warn">nur Protokoll (SMTP_HOST fehlt)</Badge>}
            </li>
            <li>
              Eingehende E-Mails: {e.IMAP_HOST ? <Badge tone="ok">IMAP konfiguriert</Badge> : <Badge tone="neutral">nicht konfiguriert</Badge>}
            </li>
            <li>
              KI-Anbieter: {e.AI_PROVIDER !== "none" ? <Badge tone="ok">{e.AI_PROVIDER}</Badge> : <Badge tone="neutral">deaktiviert</Badge>}
            </li>
            <li>
              WhatsApp Business: {e.WHATSAPP_ACCESS_TOKEN ? <Badge tone="ok">konfiguriert</Badge> : <Badge tone="neutral">nicht konfiguriert</Badge>}
            </li>
            <li>
              Dokumentenspeicher: <Badge tone="neutral">{e.STORAGE_DRIVER}</Badge>
            </li>
          </ul>
          <p className="help mt-3">Konfiguration erfolgt über Umgebungsvariablen (siehe .env.example). Ohne diese Dienste bleibt die restliche Plattform voll nutzbar.</p>
        </Panel>
        <Panel title="Hintergrundjobs (letzte 50)" padded={false}>
          {jobs.length === 0 ? (
            <EmptyState title="Noch keine Jobs" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Typ</th>
                  <th>Status</th>
                  <th>Versuche</th>
                  <th>Fällig</th>
                  <th>Fehler</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="mono text-[12px]">{j.type}</td>
                    <td>
                      <Badge tone={tone(j.status)}>{j.status}</Badge>
                    </td>
                    <td className="num">
                      {j.attempts}/{j.maxAttempts}
                    </td>
                    <td className="text-ink-3 whitespace-nowrap">{fmtDateTime(j.runAt)}</td>
                    <td className="text-[12px] text-danger max-w-[380px] truncate" title={j.lastError ?? ""}>
                      {j.lastError}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}
