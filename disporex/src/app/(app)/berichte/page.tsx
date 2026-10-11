import { requireCurrent } from "@/server/auth/current";
import { runReport, REPORT_LABELS, type ReportKey } from "@/server/modules/reports/service";
import { PageHeader, Panel, Table, Select, Input, Button, Alert, Badge } from "@/components/ui";
import { localToUtc } from "@/lib/tz";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Berichte" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent("reports:view");
  const sp = await searchParams;
  const key = (Object.keys(REPORT_LABELS).includes(sp.bericht ?? "") ? sp.bericht : "staffing") as ReportKey;
  const today = new Date();
  const von = sp.von ?? new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const bis = sp.bis ?? new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const range = { from: localToUtc(`${von}T00:00`), to: localToUtc(`${bis}T23:59`) };
  const r = await runReport(ctx, key, range);
  return (
    <>
      <PageHeader title="Berichte" subtitle="Alle Kennzahlen stammen aus den operativen Daten. Vorläufige Auswertungen sind gekennzeichnet." actions={ctx.permissions.has("reports:export") && <a className="btn btn-secondary" href={`/berichte/export?bericht=${key}&von=${von}&bis=${bis}`}>CSV-Export</a>} />
      <form className="flex flex-wrap gap-2 mb-3 items-end">
        <Select name="bericht" defaultValue={key} className="w-auto" aria-label="Bericht">
          {Object.entries(REPORT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Input name="von" type="date" defaultValue={von} className="w-auto" aria-label="Von" />
        <Input name="bis" type="date" defaultValue={bis} className="w-auto" aria-label="Bis" />
        <Button type="submit">Anzeigen</Button>
      </form>
      {r.preliminary && <Alert tone="warn" className="mb-3">Vorläufig: Der Zeitraum enthält offene oder nicht abgeschlossene Daten. {r.notes.join(" ")}</Alert>}
      {!r.preliminary && r.notes.length > 0 && <Alert tone="info" className="mb-3">{r.notes.join(" ")}</Alert>}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-4">
        {Object.entries(r.summary).map(([k, v]) => (
          <div key={k} className="kpi">
            <span className="kpi-value">{typeof v === "number" ? v.toLocaleString("de-DE") : v}</span>
            <span className="kpi-label">{k}</span>
          </div>
        ))}
      </div>
      <Panel title={r.title} padded={false} actions={<Badge>{r.rows.length} Zeilen</Badge>}>
        {r.rows.length === 0 ? (
          <p className="p-4 text-[13px] text-ink-3">Keine Daten im Zeitraum.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                {r.columns.map((c) => (
                  <th key={c.key} className={c.numeric ? "num" : ""}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row, i) => (
                <tr key={i}>
                  {r.columns.map((c) => {
                    const v = row[c.key];
                    const isDate = typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v);
                    return (
                      <td key={c.key} className={c.numeric ? "num" : ""}>
                        {v === null || v === undefined ? "–" : isDate ? fmtDateTime(v) : typeof v === "number" ? v.toLocaleString("de-DE") : v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
