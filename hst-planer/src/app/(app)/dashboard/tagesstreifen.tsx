import Link from 'next/link';
import { besetzungAus } from '@/lib/queries/coverage';

/**
 * Tagesdisposition als Zeitachse (SecPlan 3).
 *
 * Bewusst schmal: das Dashboard soll zeigen, wie der Tag liegt – wer
 * planen will, geht in die Leitstelle. Deshalb eine Zeile je Einsatz,
 * keine Zeile je Position.
 */
interface Streifenevent {
  id: string;
  name: string;
  venue: string | null;
  city: string | null;
  startTime: string | null;
  endTime: string | null;
  positions: Parameters<typeof besetzungAus>[0];
}

function minuten(zeit: string | null): number | null {
  if (!zeit) return null;
  return Number(zeit.slice(0, 2)) * 60 + Number(zeit.slice(3, 5));
}

export function Tagesstreifen({ events }: { events: Streifenevent[] }) {
  if (events.length === 0) {
    return <div className="karte"><p className="leerhinweis">Für heute ist nichts geplant.</p></div>;
  }

  // Fenster auf die tatsächlichen Schichten legen, nicht auf 00:00–24:00.
  let von = 24 * 60;
  let bis = 0;
  for (const event of events) {
    const a = minuten(event.startTime);
    const b = minuten(event.endTime);
    if (a === null || b === null) continue;
    von = Math.min(von, a);
    bis = Math.max(bis, b <= a ? b + 24 * 60 : b);
  }
  if (bis <= von) { von = 6 * 60; bis = 24 * 60; }
  von = Math.max(0, Math.floor((von - 30) / 60) * 60);
  bis = Math.min(48 * 60, Math.ceil((bis + 30) / 60) * 60);

  const stunden: number[] = [];
  for (let m = von; m < bis; m += 60) stunden.push(m);

  return (
    <div className="karte zeitstreifen">
      <div className="leitstelle-plan" style={{ maxHeight: 280 }}>
        <div className="plan-inhalt" style={{ ['--label' as string]: '190px' }}>
          <div className="zeitkopf">
            <span className="zeitkopf-label">Einsatz</span>
            {stunden.map((m) => (
              <span key={m}>{String(Math.floor(m / 60) % 24).padStart(2, '0')}:00</span>
            ))}
          </div>

          {events.map((event) => {
            const b = besetzungAus(event.positions);
            const a = minuten(event.startTime);
            const e0 = minuten(event.endTime);
            const e = a !== null && e0 !== null ? (e0 <= a ? e0 + 24 * 60 : e0) : null;
            const art = b.offen === 0 ? 'einsatzbalken-fertig' : b.ist === 0 ? 'einsatzbalken-kritisch' : 'einsatzbalken-offen';

            return (
              <div className="plan-zeile" key={event.id}>
                <span className="plan-label" title={event.venue ?? event.city ?? undefined}>
                  <Link href={`/events/${event.id}`}>{event.name}</Link>
                  <span className="plan-soll">{b.ist}/{b.soll}</span>
                </span>
                <span className="plan-spur plan-gitter">
                  {a !== null && e !== null && (
                    <Link
                      href={`/events/${event.id}/mitarbeiter`}
                      className={`einsatzbalken ${art}`}
                      style={{
                        left: `calc(${(a - von) / 60} * var(--stunde))`,
                        width: `calc(${(e - a) / 60} * var(--stunde))`,
                      }}
                      title={`${event.startTime}–${event.endTime} · ${b.ist} von ${b.soll} besetzt`}
                    >
                      {event.startTime}–{event.endTime}
                      {b.offen > 0 && ` · ${b.offen} offen`}
                    </Link>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
