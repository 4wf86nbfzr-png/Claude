import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { getImport, RECON_KIND_LABELS, RECON_STATUS_LABELS } from "@/server/modules/time/service";
import { PageHeader, Panel, Table, Badge, Dl, Alert } from "@/components/ui";
import { fmtRange, fmtDateTime, fmtMinutes } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireCurrent("time:read");
  const { import: imp, records } = await getImport(ctx, id);
  const summary = imp.summary;
  return (
    <>
      <PageHeader title={`Import ${imp.reference}`} breadcrumb={<Link href="/zeitnachweise">Zeitnachweise</Link>} subtitle={`${imp.filename} · ${fmtDateTime(imp.createdAt)}`} />
      <div className="grid xl:grid-cols-[1fr_360px] gap-4 items-start">
        <Panel title="Datensätze" padded={false}>
          <Table>
            <thead>
              <tr>
                <th>Kennung</th>
                <th>Mitarbeiter</th>
                <th>Gemeldet</th>
                <th className="num">Pause</th>
                <th>Status</th>
                <th>Abgleich</th>
              </tr>
            </thead>
            <tbody>
              {records.map(({ r, employeeName, item }) => (
                <tr key={r.id}>
                  <td className="mono">{r.employeeNumberRaw}</td>
                  <td>{employeeName ?? <Badge tone="danger">unbekannt</Badge>}</td>
                  <td className="mono whitespace-nowrap">{fmtRange(r.startedAt, r.endedAt)}</td>
                  <td className="num">{r.breakMinutes}</td>
                  <td>
                    <Badge tone={r.status === "unmatched" ? "danger" : r.status === "reviewed" ? "ok" : "neutral"}>{r.status}</Badge>
                  </td>
                  <td className="text-[12.5px]">
                    {item ? (
                      <Link href={`/abgleich/${item.id}`}>
                        {RECON_KIND_LABELS[item.kind]} · {RECON_STATUS_LABELS[item.status]}
                        {item.kind === "deviation" && <span className="mono"> ({fmtMinutes(item.deviationMinutes)})</span>}
                      </Link>
                    ) : (
                      <span className="text-ink-4">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
        <div className="space-y-4">
          <Panel title="Zusammenfassung">
            <Dl items={[{ k: "Status", v: imp.status }, { k: "Format", v: imp.format }, { k: "Zeilen", v: imp.rowCount }, { k: "Importiert", v: imp.importedCount }, { k: "Duplikate", v: imp.duplicateCount }, { k: "Fehler", v: imp.errorCount }, { k: "Datei-Hash", v: <span className="mono text-[11px] break-all">{imp.fileHash.slice(0, 24)}…</span> }]} />
            {imp.columnMapping && (
              <p className="help mt-2">
                Spalten: {Object.entries(imp.columnMapping).map(([k, v]) => `${k}=${v}`).join(", ")}
              </p>
            )}
          </Panel>
          {summary && summary.unmatchedEmployees.length > 0 && (
            <Alert tone="warn">
              Unbekannte Mitarbeiterkennungen: {summary.unmatchedEmployees.join(", ")}. Bitte Mitarbeiter-ID im Stammdatensatz prüfen.
            </Alert>
          )}
          {summary && summary.errors.length > 0 && (
            <Panel title={`Zeilenfehler (${summary.errors.length})`}>
              <ul className="text-[12.5px] space-y-1 max-h-[300px] overflow-y-auto">
                {summary.errors.map((e, i) => (
                  <li key={i}>
                    <span className="mono">Zeile {e.row}</span>: {e.message}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {summary?.warnings?.map((w, i) => (
            <Alert key={i} tone="info">
              {w}
            </Alert>
          ))}
        </div>
      </div>
    </>
  );
}
