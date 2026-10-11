import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { calendarRange } from "@/server/modules/shifts/service";
import { listCustomers } from "@/server/modules/customers/service";
import { listEmployees } from "@/server/modules/employees/service";
import { PageHeader, Panel, Select, Button, Badge, Input } from "@/components/ui";
import { startOfDayUtc } from "@/lib/tz";
import { fmtTime, fmtWeekday, fmtDate } from "@/lib/format";
import { addDays } from "@/server/core/time";
import { EVENT_STATUS_LABELS } from "@/server/modules/events/schema";
import { SHIFT_STATUS_LABELS } from "@/server/modules/shifts/schema";

export const metadata = { title: "Kalender" };
export const dynamic = "force-dynamic";

const TZ = "Europe/Berlin";
function isoDay(d: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);
}
function parseDay(s: string | undefined): string {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : isoDay(new Date());
}
function shiftDays(day: string, n: number): string {
  return isoDay(addDays(startOfDayUtc(day), n + 0.5));
}
function mondayOf(day: string): string {
  const d = startOfDayUtc(day);
  const wd = (new Date(d.getTime() + 12 * 3_600_000).getUTCDay() + 6) % 7; // 0 = Montag
  return shiftDays(day, -wd);
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent("shifts:read");
  const sp = await searchParams;
  const view = (["tag", "woche", "monat"].includes(sp.ansicht ?? "") ? sp.ansicht : "woche") as "tag" | "woche" | "monat";
  const day = parseDay(sp.tag);
  let days: string[] = [];
  if (view === "tag") days = [day];
  else if (view === "woche") {
    const mon = mondayOf(day);
    days = Array.from({ length: 7 }, (_, i) => shiftDays(mon, i));
  } else {
    const first = `${day.slice(0, 7)}-01`;
    const mon = mondayOf(first);
    const nextMonthFirst = shiftDays(`${day.slice(0, 7)}-28`, 4).slice(0, 7) + "-01";
    const count = Math.ceil((startOfDayUtc(nextMonthFirst).getTime() - startOfDayUtc(mon).getTime()) / 86_400_000);
    days = Array.from({ length: Math.ceil(count / 7) * 7 }, (_, i) => shiftDays(mon, i));
  }
  const from = startOfDayUtc(days[0]!);
  const to = addDays(startOfDayUtc(days[days.length - 1]!), 1);
  const filter = { customerId: sp.customerId || undefined, employeeId: sp.employeeId || undefined, status: sp.status || undefined };
  const [data, customers, employees] = await Promise.all([calendarRange(ctx, from, to, filter), listCustomers(ctx, { pageSize: 200, status: "all" }), listEmployees(ctx, { pageSize: 300 })]);
  const prev = view === "tag" ? shiftDays(day, -1) : view === "woche" ? shiftDays(day, -7) : shiftDays(`${day.slice(0, 7)}-01`, -1);
  const next = view === "tag" ? shiftDays(day, 1) : view === "woche" ? shiftDays(day, 7) : shiftDays(`${day.slice(0, 7)}-28`, 4);
  const link = (overrides: Record<string, string>) => `/kalender?${new URLSearchParams({ ...sp, ansicht: view, tag: day, ...overrides })}`;
  const byDay = new Map<string, typeof data.events>();
  for (const d of days) byDay.set(d, []);
  for (const e of data.events) {
    for (const d of days) {
      const ds = startOfDayUtc(d);
      if (e.startsAt < addDays(ds, 1) && e.endsAt > ds) byDay.get(d)!.push(e);
    }
  }
  const shiftsByDay = new Map<string, typeof data.shifts>();
  for (const d of days) shiftsByDay.set(d, []);
  for (const s of data.shifts) {
    for (const d of days) {
      const ds = startOfDayUtc(d);
      if (s.startsAt < addDays(ds, 1) && s.endsAt > ds) shiftsByDay.get(d)!.push(s);
    }
  }
  const title = view === "tag" ? `${fmtWeekday(startOfDayUtc(day))}, ${fmtDate(startOfDayUtc(day))}` : view === "woche" ? `Woche ab ${fmtDate(from)}` : new Intl.DateTimeFormat("de-DE", { timeZone: TZ, month: "long", year: "numeric" }).format(addDays(startOfDayUtc(`${day.slice(0, 7)}-01`), 0.5));
  return (
    <>
      <PageHeader
        title="Kalender"
        subtitle={title}
        actions={
          <div className="flex gap-1">
            <Link className="btn btn-secondary btn-sm" href={link({ tag: prev })}>
              ‹
            </Link>
            <Link className="btn btn-secondary btn-sm" href={link({ tag: isoDay(new Date()) })}>
              Heute
            </Link>
            <Link className="btn btn-secondary btn-sm" href={link({ tag: next })}>
              ›
            </Link>
            <span className="w-2" />
            {(["tag", "woche", "monat"] as const).map((v) => (
              <Link key={v} className={`btn btn-sm ${view === v ? "btn-primary" : "btn-secondary"}`} href={link({ ansicht: v })}>
                {v === "tag" ? "Tag" : v === "woche" ? "Woche" : "Monat"}
              </Link>
            ))}
          </div>
        }
      />
      <form className="flex flex-wrap gap-2 mb-3 items-end">
        <input type="hidden" name="ansicht" value={view} />
        <Input name="tag" type="date" defaultValue={day} aria-label="Datum" className="w-auto" />
        <Select name="customerId" defaultValue={sp.customerId ?? ""} className="w-auto" aria-label="Kunde">
          <option value="">Alle Kunden</option>
          {customers.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="employeeId" defaultValue={sp.employeeId ?? ""} className="w-auto" aria-label="Mitarbeiter">
          <option value="">Alle Mitarbeiter</option>
          {employees.items.map((e) => (
            <option key={e.id} value={e.id}>
              {e.lastName}, {e.firstName}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-auto" aria-label="Status">
          <option value="">Alle Status</option>
          {Object.entries(EVENT_STATUS_LABELS)
            .filter(([k]) => k !== "cancelled")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </Select>
        <Button type="submit">Anzeigen</Button>
      </form>

      {view === "tag" ? (
        <Panel padded={false}>
          {byDay.get(day)!.length === 0 && <p className="p-4 text-[13px] text-ink-3">Keine Veranstaltungen an diesem Tag.</p>}
          {byDay.get(day)!.map((e) => (
            <div key={e.id} className="border-b border-line last:border-b-0 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono text-[12.5px]">
                  {fmtTime(e.startsAt)}–{fmtTime(e.endsAt)}
                </span>
                <Link href={`/veranstaltungen/${e.id}`} className="font-medium">
                  {e.name}
                </Link>
                <span className="text-ink-3 text-[12.5px]">
                  {e.customerName}
                  {e.locationName ? ` · ${e.locationName}` : ""}
                </span>
                <Badge tone={e.open > 0 ? "warn" : "ok"}>
                  {e.filled}/{e.required} besetzt{e.open > 0 ? ` · ${e.open} offen` : ""}
                </Badge>
              </div>
              <ul className="mt-1.5 grid md:grid-cols-2 xl:grid-cols-3 gap-x-4 text-[12.5px]">
                {shiftsByDay
                  .get(day)!
                  .filter((s) => s.eventId === e.id)
                  .map((s) => (
                    <li key={s.id} className="flex gap-2">
                      <span className="mono text-ink-4">
                        {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}
                      </span>
                      <span className="text-ink-3">{s.positionName}:</span>
                      <Link href={`/schichten/${s.id}`}>{s.employeeName ?? <span className="text-warn">offen</span>}</Link>
                      <span className="text-ink-4">({SHIFT_STATUS_LABELS[s.status]})</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </Panel>
      ) : (
        <Panel padded={false}>
          <div className="cal-grid border-t border-l border-line">
            {days.slice(0, 7).map((d) => (
              <div key={d} className="px-2 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3 border-r border-b border-line bg-surface">
                {fmtWeekday(startOfDayUtc(d))}
              </div>
            ))}
            {days.map((d) => {
              const inMonth = view !== "monat" || d.slice(0, 7) === day.slice(0, 7);
              const isToday = d === isoDay(new Date());
              return (
                <div key={d} className={`cal-cell ${inMonth ? "" : "bg-surface text-ink-4"} ${view === "woche" ? "min-h-[260px]" : ""}`}>
                  <div className={`text-[12px] mb-1 flex justify-between ${isToday ? "font-semibold text-accent" : "text-ink-3"}`}>
                    <Link href={link({ ansicht: "tag", tag: d })}>{d.slice(8)}.</Link>
                    {byDay.get(d)!.length > 0 && <span className="text-ink-4">{byDay.get(d)!.length}</span>}
                  </div>
                  <div className="space-y-1">
                    {byDay.get(d)!.map((e) => (
                      <Link key={e.id} href={`/veranstaltungen/${e.id}`} className={`cal-chip no-underline ${e.open > 0 ? "border-warn" : e.pending > 0 ? "border-info" : "border-ok"}`} title={`${e.name} · ${e.customerName} · ${e.filled}/${e.required} besetzt`}>
                        <span className="mono text-ink-4">{fmtTime(e.startsAt)}</span> {e.name}
                        {sp.employeeId &&
                          shiftsByDay
                            .get(d)!
                            .filter((s) => s.eventId === e.id)
                            .map((s) => (
                              <span key={s.id} className="text-ink-3">
                                {" "}
                                · {SHIFT_STATUS_LABELS[s.status]}
                              </span>
                            ))}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="px-3 py-2 text-[12px] text-ink-4">Markierung: gelb = offene Positionen, blau = Rückmeldungen ausstehend, grün = vollständig besetzt.</p>
        </Panel>
      )}
    </>
  );
}
