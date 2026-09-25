'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Konflikt } from '@/lib/dispo/pruefung';

/**
 * Tagesplanung als Leitstelle (SecPlan 4 und 27).
 *
 * Links stehen die Kräfte, rechts der Einsatzplan als Zeitachse. Ein Name
 * wird auf eine Positionszeile gezogen; erst danach fragt der Server, ob
 * das geht. Die Antwort kommt als Blatt über dem Plan – mit Klartext,
 * nicht mit einem roten Rand.
 *
 * Die Zeitachse beginnt nicht um 00:00, sondern an der frühesten Schicht
 * des Tages. Ein Plan, der acht leere Stunden zeigt, bevor irgendetwas
 * passiert, ist auf einem 1440er Bildschirm eine verschenkte Hälfte.
 */

export interface PlanBalken {
  id: string;
  name: string;
  start: string | null;
  ende: string | null;
  status: string;
  ersatz: boolean;
  mitarbeiterId: string;
}

export interface PlanZeile {
  positionId: string;
  titel: string;
  start: string | null;
  ende: string | null;
  soll: number;
  ist: number;
  anforderungen: string[];
  balken: PlanBalken[];
}

export interface PlanGruppe {
  eventId: string;
  name: string;
  ort: string | null;
  kunde: string | null;
  zeilen: PlanZeile[];
}

export interface PlanKraft {
  id: string;
  name: string;
  kuerzel: string;
  qualifikationen: string[];
  /** frei | eingeplant | abwesend | gesperrt */
  zustand: 'frei' | 'eingeplant' | 'abwesend' | 'gesperrt';
  hinweis: string | null;
  /** Bereits verplante Minuten an diesem Tag. */
  verplant: number;
}

export type ZuordnenAktion = (
  positionId: string,
  employeeId: string,
  trotzdem: boolean,
) => Promise<{ erfolg?: boolean; konflikte?: Konflikt[]; ueberschrift?: string; fehler?: string }>;

const ZUSTAND_FARBE: Record<PlanKraft['zustand'], string> = {
  frei: 'gruen',
  eingeplant: 'blau',
  abwesend: 'gelb',
  gesperrt: 'rot',
};

const ZUSTAND_WORT: Record<PlanKraft['zustand'], string> = {
  frei: 'verfügbar',
  eingeplant: 'eingeplant',
  abwesend: 'abwesend',
  gesperrt: 'gesperrt',
};

function minuten(zeit: string | null): number | null {
  if (!zeit) return null;
  return Number(zeit.slice(0, 2)) * 60 + Number(zeit.slice(3, 5));
}

/** Endet die Schicht nach Mitternacht, läuft sie über 24:00 hinaus weiter. */
function ende(start: string | null, schluss: string | null): number | null {
  const a = minuten(start);
  const b = minuten(schluss);
  if (a === null || b === null) return null;
  return b <= a ? b + 24 * 60 : b;
}

export function Leitstelle({
  gruppen, kraefte, darfPlanen, zuordnen, tagIso,
}: {
  gruppen: PlanGruppe[];
  kraefte: PlanKraft[];
  darfPlanen: boolean;
  zuordnen: ZuordnenAktion;
  tagIso: string;
}) {
  const router = useRouter();
  const [suche, setSuche] = useState('');
  const [nurFrei, setNurFrei] = useState(false);
  const [gezogen, setGezogen] = useState<string | null>(null);
  const [ziel, setZiel] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const [frage, setFrage] = useState<{
    positionId: string; employeeId: string; person: string; position: string;
    konflikte: Konflikt[]; ueberschrift: string;
  } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  /*
    Die Jetzt-Linie wird erst nach dem ersten Rendern gesetzt. Würde der
    Server sie mitliefern, stünde sie bei jedem Aufruf auf der Uhrzeit des
    Servers und liefe beim Hydrieren auseinander.
  */
  const [jetzt, setJetzt] = useState<number | null>(null);
  useEffect(() => {
    function setzen() {
      const d = new Date();
      const heute = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setJetzt(heute === tagIso ? d.getHours() * 60 + d.getMinutes() : null);
    }
    setzen();
    const uhr = window.setInterval(setzen, 60_000);
    return () => window.clearInterval(uhr);
  }, [tagIso]);

  // --- Zeitfenster des Tages -------------------------------------------
  const { von, bis } = useMemo(() => {
    let min = 24 * 60;
    let max = 0;
    for (const g of gruppen) {
      for (const z of g.zeilen) {
        const a = minuten(z.start);
        const b = ende(z.start, z.ende);
        if (a !== null) min = Math.min(min, a);
        if (b !== null) max = Math.max(max, b);
      }
    }
    if (max <= min) return { von: 6 * 60, bis: 24 * 60 };
    // Auf volle Stunden aufrunden, links und rechts eine halbe Stunde Luft.
    return {
      von: Math.max(0, Math.floor((min - 30) / 60) * 60),
      bis: Math.min(48 * 60, Math.ceil((max + 30) / 60) * 60),
    };
  }, [gruppen]);

  const stunden = useMemo(() => {
    const aus: number[] = [];
    for (let m = von; m < bis; m += 60) aus.push(m);
    return aus;
  }, [von, bis]);

  function position(start: string | null, schluss: string | null) {
    const a = minuten(start);
    const b = ende(start, schluss);
    if (a === null || b === null) return null;
    const links = ((a - von) / 60) * 100;
    const breite = ((b - a) / 60) * 100;
    return { left: `calc(${links / 100} * var(--stunde))`, width: `calc(${breite / 100} * var(--stunde))` };
  }

  const gefilterteKraefte = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return kraefte.filter((k) => {
      if (nurFrei && k.zustand !== 'frei') return false;
      if (!q) return true;
      return k.name.toLowerCase().includes(q) || k.qualifikationen.some((x) => x.toLowerCase().includes(q));
    });
  }, [kraefte, suche, nurFrei]);

  function absenden(positionId: string, employeeId: string, trotzdem: boolean) {
    setFehler(null);
    starte(async () => {
      const antwort = await zuordnen(positionId, employeeId, trotzdem);
      if (antwort.erfolg) {
        setFrage(null);
        router.refresh();
        return;
      }
      if (antwort.konflikte?.length) {
        const person = kraefte.find((k) => k.id === employeeId)?.name ?? 'Die Kraft';
        const zeile = gruppen.flatMap((g) => g.zeilen).find((z) => z.positionId === positionId);
        setFrage({
          positionId, employeeId, person,
          position: zeile?.titel ?? 'Position',
          konflikte: antwort.konflikte,
          ueberschrift: antwort.ueberschrift ?? 'Bitte prüfen',
        });
        return;
      }
      setFehler(antwort.fehler ?? 'Die Zuordnung ist fehlgeschlagen.');
    });
  }

  function ablegen(positionId: string) {
    setZiel(null);
    const employeeId = gezogen;
    setGezogen(null);
    if (!employeeId || !darfPlanen) return;
    absenden(positionId, employeeId, false);
  }

  const leer = gruppen.length === 0;

  return (
    <div className="leitstelle">
      <div className="leitstelle-raster">
        {/* ------------------------------------------------ Kräfte ----- */}
        <aside className="leitstelle-seite" aria-label="Verfügbare Kräfte">
          <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--karte)', borderBottom: '1px solid var(--linie-2)', padding: 8 }}>
            <input
              className="feld feld-klein"
              type="search"
              placeholder="Name oder Qualifikation …"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              aria-label="Kräfte durchsuchen"
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11.5, color: 'var(--text-2)' }}>
              <input type="checkbox" checked={nurFrei} onChange={(e) => setNurFrei(e.target.checked)} />
              nur heute freie Kräfte ({kraefte.filter((k) => k.zustand === 'frei').length})
            </label>
          </div>

          {gefilterteKraefte.length === 0 && (
            <p className="leerhinweis">Keine Kraft passt zu dieser Suche.</p>
          )}

          {gefilterteKraefte.map((k) => (
            <div
              key={k.id}
              className="mitarbeiterzeile"
              draggable={darfPlanen && k.zustand !== 'gesperrt'}
              data-gezogen={gezogen === k.id ? 'true' : undefined}
              onDragStart={() => setGezogen(k.id)}
              onDragEnd={() => { setGezogen(null); setZiel(null); }}
              title={k.hinweis ?? `${k.name} – ${ZUSTAND_WORT[k.zustand]}`}
            >
              <span className="kuerzel" aria-hidden>{k.kuerzel}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Link href={`/mitarbeiter/${k.id}`}>{k.name}</Link>
                {k.qualifikationen.length > 0 && (
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {k.qualifikationen.join(' · ')}
                  </span>
                )}
              </span>
              <span className={`marke marke-${ZUSTAND_FARBE[k.zustand]}`} style={{ flex: 'none' }}>
                {k.zustand === 'eingeplant' ? `${Math.round(k.verplant / 60)} h` : ZUSTAND_WORT[k.zustand]}
              </span>
            </div>
          ))}
        </aside>

        {/* -------------------------------------------------- Plan ----- */}
        <div className="leitstelle-plan">
          {leer ? (
            <p className="leerhinweis">Für diesen Tag ist nichts geplant.</p>
          ) : (
            <div className="plan-inhalt">
              {jetzt !== null && jetzt >= von && jetzt < bis && (
                <span
                  className="plan-jetzt"
                  aria-hidden
                  style={{ left: `calc(var(--label) + ${(jetzt - von) / 60} * var(--stunde))` }}
                />
              )}
              <div className="zeitkopf">
                <span className="zeitkopf-label">Position</span>
                {stunden.map((m) => (
                  <span key={m}>{String(Math.floor(m / 60) % 24).padStart(2, '0')}:00</span>
                ))}
              </div>

              {gruppen.map((g) => (
                <div key={g.eventId}>
                  <div className="plan-gruppe">
                    <Link href={`/events/${g.eventId}`}>{g.name}</Link>
                    {g.ort && <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>{g.ort}</span>}
                    {g.kunde && <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>{g.kunde}</span>}
                  </div>

                  {g.zeilen.map((z) => {
                    const offen = Math.max(0, z.soll - z.ist);
                    return (
                      <div
                        key={z.positionId}
                        style={{ height: `calc(var(--spur) * ${Math.max(1, z.balken.length + (z.soll > z.ist ? 1 : 0))})` }}
                        className={`plan-zeile${ziel === z.positionId ? ' ziel-aktiv' : ''}`}
                        onDragOver={(e) => { if (gezogen && darfPlanen) { e.preventDefault(); setZiel(z.positionId); } }}
                        onDragLeave={() => setZiel((v) => (v === z.positionId ? null : v))}
                        onDrop={(e) => { e.preventDefault(); ablegen(z.positionId); }}
                      >
                        <span className="plan-label" title={z.anforderungen.join(', ')}>
                          <Link href={`/events/${g.eventId}/mitarbeiter?position=${z.positionId}`}>{z.titel}</Link>
                          <span className="plan-soll">{z.ist}/{z.soll}</span>
                        </span>
                        <span className="plan-spur plan-gitter">
                          {/* Der Sollbalken zeigt das Zeitfenster der Position. */}
                          {(() => {
                            const p = position(z.start, z.ende);
                            if (!p || offen === 0) return null;
                            return (
                              <span
                                className="einsatzbalken einsatzbalken-leer"
                                style={{
                                  ...p,
                                  top: `calc(${z.balken.length} * var(--spur) + 3px)`,
                                  height: 'calc(var(--spur) - 6px)',
                                  bottom: 'auto',
                                }}
                              >
                                {offen} offen
                              </span>
                            );
                          })()}
                          {z.balken.map((b, i) => {
                            const p = position(b.start ?? z.start, b.ende ?? z.ende);
                            if (!p) return null;
                            const art = b.status === 'ABGESAGT' || b.status === 'STORNIERT'
                              ? 'einsatzbalken-kritisch'
                              : b.status === 'ZUGESAGT' || b.status === 'ERSCHIENEN'
                                ? 'einsatzbalken-fertig'
                                : 'einsatzbalken-offen';
                            return (
                              <Link
                                key={b.id}
                                href={`/mitarbeiter/${b.mitarbeiterId}`}
                                className={`einsatzbalken ${art}`}
                                style={{
                                  ...p,
                                  top: `calc(${i} * var(--spur) + 3px)`,
                                  height: 'calc(var(--spur) - 6px)',
                                  bottom: 'auto',
                                }}
                                title={`${b.name} · ${b.start ?? '?'}–${b.ende ?? '?'} · ${b.status}${b.ersatz ? ' · Ersatz' : ''}`}
                              >
                                {b.name}{b.ersatz ? ' (E)' : ''}
                              </Link>
                            );
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ----------------------------------------------- Rückfrage ----- */}
      {fehler && (
        <div className="hinweis-fehler" role="alert" style={{ margin: 10 }}>
          {fehler}
          <button type="button" className="knopf knopf-klein" style={{ marginLeft: 10 }} onClick={() => setFehler(null)}>Schließen</button>
        </div>
      )}

      {frage && (
        <div className="blatt-schleier" onClick={() => setFrage(null)}>
          <div className="blatt" role="alertdialog" aria-modal="true" aria-labelledby="frage-titel" onClick={(e) => e.stopPropagation()}>
            <h2 id="frage-titel">{frage.ueberschrift}</h2>
            <p className="blatt-unter">
              {frage.person} → {frage.position}
            </p>
            <ul className="blatt-liste">
              {frage.konflikte.map((k, i) => (
                <li key={i} className={k.blockierend ? 'ist-hart' : 'ist-weich'}>
                  <span className={`marke marke-${k.blockierend ? 'rot' : 'gelb'}`}>
                    {k.blockierend ? 'Verbot' : 'Hinweis'}
                  </span>
                  <span>{k.text}</span>
                </li>
              ))}
            </ul>
            <div className="blatt-fuss">
              <button type="button" className="knopf" onClick={() => setFrage(null)}>Abbrechen</button>
              {!frage.konflikte.some((k) => k.blockierend) && (
                <button
                  type="button"
                  className="knopf knopf-beige"
                  disabled={laeuft}
                  onClick={() => absenden(frage.positionId, frage.employeeId, true)}
                >
                  {laeuft ? 'Wird gespeichert …' : 'Trotzdem zuordnen'}
                </button>
              )}
            </div>
            {frage.konflikte.some((k) => k.blockierend) && (
              <p className="blatt-fussnote">
                Diese Zuordnung lässt sich nicht speichern. Bitte zuerst den Grund oben auflösen.
              </p>
            )}
          </div>
        </div>
      )}

      <p className="nur-desktop" style={{ margin: 0, padding: '6px 12px', borderTop: '1px solid var(--linie)', fontSize: 11, color: 'var(--text-3)' }}>
        {darfPlanen
          ? 'Namen aus der linken Spalte auf eine Positionszeile ziehen. Geprüft wird beim Ablegen.'
          : 'Ansicht ohne Planungsrecht – Zuordnungen sind hier nicht möglich.'}
        {' '}Tag: {tagIso}
      </p>
    </div>
  );
}
