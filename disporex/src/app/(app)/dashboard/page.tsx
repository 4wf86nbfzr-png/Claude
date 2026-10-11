import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { redirect } from "next/navigation";
import { homeForRole } from "@/server/auth/permissions";
import { loadDashboard } from "@/server/modules/dashboard/service";
import { PageHeader, Kpi, Panel, Alert, EmptyState, Badge } from "@/components/ui";
import { fmtTime, fmtRelative, fmtDate } from "@/lib/format";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ willkommen?: string }> }) {
  const current = await requireCurrent();
  if (!current.ctx.permissions.has("dashboard:view")) redirect(homeForRole(current.ctx.role));
  const { ctx } = current;
  const sp = await searchParams;
  const d = await loadDashboard(ctx);
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Stand ${fmtDate(new Date())}, ${fmtTime(new Date())} Uhr · alle Zahlen live aus Ihren Daten`} />
      {sp.willkommen && (
        <Alert tone="ok" className="mb-4">
          Willkommen bei DispoRex. Nächste Schritte: <Link href="/einstellungen/benutzer">Kollegen einladen</Link>, <Link href="/qualifikationen">Qualifikationen anlegen</Link>,{" "}
          <Link href="/mitarbeiter/neu">ersten Mitarbeiter erfassen</Link>.
        </Alert>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi value={d.today.events} label="Veranstaltungen heute" href={`/veranstaltungen?von=${d.today.date}&bis=${d.today.date}`} />
        <Kpi value={d.upcoming7d.events} label="Veranstaltungen nächste 7 Tage" href="/veranstaltungen?zeitraum=7" />
        <Kpi value={d.openPositions} label="Offene Positionen" href="/schichten?status=open" tone={d.openPositions > 0 ? "warn" : undefined} />
        <Kpi value={d.unconfirmedShifts} label="Unbestätigte Zusagen/Anfragen" href="/schichten?status=requested" />
        <Kpi value={d.newRequests} label="Neue Kundenanfragen" href="/anfragen?status=new" />
        <Kpi value={d.unhandledDeclines} label="Absagen ohne Ersatz" href="/schichten?status=declined" tone={d.unhandledDeclines > 0 ? "danger" : undefined} />
        <Kpi value={d.missingTimeRecords} label="Fehlende Zeitnachweise" href="/abgleich?kind=missing_record" />
        <Kpi value={d.openDeviations} label="Offene Abweichungen" href="/abgleich?status=open" />
        <Kpi value={d.expiringQualifications} label="Qualifikationen laufen ab (30 T.)" href="/qualifikationen?ablauf=30" tone={d.expiringQualifications > 0 ? "warn" : undefined} />
        <Kpi value={d.expiringDocuments} label="Dokumente laufen ab (30 T.)" href="/dokumente?ablauf=30" />
        <Kpi value={d.today.shifts} label="Schichten heute" href={`/schichten?von=${d.today.date}&bis=${d.today.date}`} />
        <Kpi value={d.overdueResponses} label="Rückmeldungen überfällig" href="/schichten?status=requested&ueberfaellig=1" tone={d.overdueResponses > 0 ? "danger" : undefined} />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 mt-5">
        <Panel title="Heute im Einsatz" padded={false}>
          {d.todayEvents.length === 0 ? (
            <EmptyState title="Heute keine Veranstaltungen" hint="Geplante und bestätigte Veranstaltungen des heutigen Tages erscheinen hier." />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>Veranstaltung</th>
                  <th>Kunde</th>
                  <th className="num">Besetzt</th>
                </tr>
              </thead>
              <tbody>
                {d.todayEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="mono whitespace-nowrap">
                      {fmtTime(e.startsAt)}–{fmtTime(e.endsAt)}
                    </td>
                    <td>
                      <Link href={`/veranstaltungen/${e.id}`}>{e.name}</Link>
                    </td>
                    <td>{e.customer}</td>
                    <td className="num">
                      {e.total - e.open}/{e.total} {e.open > 0 && <Badge tone="warn">{e.open} offen</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel title="Warnungen und Aufgaben">
            {d.warnings.length === 0 ? (
              <p className="text-[13px] text-ink-3">Keine offenen Warnungen.</p>
            ) : (
              <ul className="space-y-2">
                {d.warnings.map((w) => (
                  <li key={w.href + w.text}>
                    <Link href={w.href} className={`alert alert-${w.tone} block no-underline`}>
                      {w.text}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Letzte Benachrichtigungen" actions={<Link href="/benachrichtigungen" className="text-[12.5px]">Alle</Link>}>
            {d.recentNotifications.length === 0 ? (
              <p className="text-[13px] text-ink-3">Noch keine Benachrichtigungen.</p>
            ) : (
              <ul className="space-y-1.5 text-[13px]">
                {d.recentNotifications.map((n) => (
                  <li key={n.id} className="flex justify-between gap-3">
                    <Link href={n.link ?? "/benachrichtigungen"} className={n.readAt ? "text-ink-2" : "font-medium text-ink"}>
                      {n.title}
                    </Link>
                    <span className="text-ink-4 whitespace-nowrap">{fmtRelative(n.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
