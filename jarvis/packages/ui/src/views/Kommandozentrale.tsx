import { Sparkline } from '../components/Sparkline.js';
import { useDaten, useJarvis } from '../lib/store.js';

interface Dashboard {
  wartetAufFreigabe: number;
  kennzahlen: {
    unternehmen: number;
    mitVerifizierterAdresse: number;
    entwuerfe: number;
    gesendetGesamt: number;
    gesendet7Tage: number;
    gesendetVorwoche: number;
    antworten: number;
    fehlgeschlagen: number;
    offeneAufgaben: number;
    kampagnen: number;
  };
  auslastung: {
    stunde: { verbraucht: number; grenze: number };
    tag: { verbraucht: number; grenze: number };
  };
  verlauf: Array<{ tag: string; anzahl: number }>;
  bereitschaft: Array<{ name: string; bereit: boolean; detail: string }>;
  aktivitaet: Array<{ id: string; zeit: string; text: string; fehler: boolean }>;
}

/** Einzahl oder Mehrzahl -- „1 Kampagnen" liest sich wie ein Fehler, weil es einer ist. */
function anzahl(n: number, einzahl: string, mehrzahl: string): string {
  return `${n} ${n === 1 ? einzahl : mehrzahl}`;
}

const LEER: Dashboard = {
  wartetAufFreigabe: 0,
  kennzahlen: {
    unternehmen: 0,
    mitVerifizierterAdresse: 0,
    entwuerfe: 0,
    gesendetGesamt: 0,
    gesendet7Tage: 0,
    gesendetVorwoche: 0,
    antworten: 0,
    fehlgeschlagen: 0,
    offeneAufgaben: 0,
    kampagnen: 0,
  },
  auslastung: { stunde: { verbraucht: 0, grenze: 0 }, tag: { verbraucht: 0, grenze: 0 } },
  verlauf: [],
  bereitschaft: [],
  aktivitaet: [],
};

/**
 * Die Kommandozentrale.
 *
 * Führt mit genau einer Zahl: was auf eine Entscheidung wartet. Alles andere
 * ordnet sich dem unter. Sämtliche Werte kommen aus der Datenbank — es gibt
 * hier keine Platzhalterzahlen und keine Hochrechnungen.
 */
export function Kommandozentrale({ aufFreigaben }: { aufFreigaben: () => void }): JSX.Element {
  const jarvis = useJarvis();
  const { daten: d, laedt } = useDaten<Dashboard>({ kind: 'dashboard' }, LEER);

  const k = d.kennzahlen;
  const wartet = d.wartetAufFreigabe;

  return (
    <div className="kz">
      <div className="buehne__kopf">
        <div>
          <p className="eyebrow">Übersicht</p>
          <h1>Kommandozentrale</h1>
        </div>
        <span className="leise" style={{ fontSize: '0.8rem' }}>
          {laedt ? 'lädt …' : new Date().toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })}
        </span>
      </div>

      {/* --- Hero + Auslastung ------------------------------------------- */}
      <div className="kz__oben">
        <div className={`hero${wartet > 0 ? ' hero--handeln' : ''}`}>
          <p className="eyebrow" style={{ margin: 0 }}>
            Wartet auf Ihre Freigabe
          </p>
          <p className="hero__wert">{wartet}</p>
          {wartet > 0 ? (
            <>
              <p className="hero__zeile">
                {wartet === 1 ? 'Eine Aktion wartet' : `${wartet} Aktionen warten`} auf Ihre Entscheidung.
                Vorher passiert nichts.
              </p>
              <button
                type="button"
                className="knopf knopf--stark"
                style={{ marginTop: '0.9rem' }}
                onClick={aufFreigaben}
              >
                Jetzt ansehen
              </button>
            </>
          ) : (
            <p className="hero__zeile">
              Nichts wartet. JARVIS hat nichts nach außen gegeben, was Sie nicht freigegeben haben.
            </p>
          )}
        </div>

        <section aria-label="Versandlimits">
          <h2 style={{ marginBottom: '0.85rem' }}>Versandlimits</h2>
          <Meter
            name="Diese Stunde"
            verbraucht={d.auslastung.stunde.verbraucht}
            grenze={d.auslastung.stunde.grenze}
          />
          <Meter
            name="Letzte 24 Stunden"
            verbraucht={d.auslastung.tag.verbraucht}
            grenze={d.auslastung.tag.grenze}
          />
          <p className="leise" style={{ fontSize: '0.8rem', marginTop: '0.9rem', maxWidth: '44ch' }}>
            Die Grenzen schützen die Zustellbarkeit Ihrer Domain. Ist eine erreicht, verweigert
            JARVIS den Versand — auch bei erteilter Freigabe.
          </p>
        </section>
      </div>

      {/* --- Kennzahlen ---------------------------------------------------- */}
      <section aria-label="Kennzahlen">
        <div className="kacheln">
          <Kachel label="Unternehmen" wert={k.unternehmen} zusatz={`${k.mitVerifizierterAdresse} mit verifizierter Adresse`} />
          <Kachel label="Offene Entwürfe" wert={k.entwuerfe} zusatz={k.kampagnen > 0 ? anzahl(k.kampagnen, 'Kampagne', 'Kampagnen') : 'keine Kampagne'} />
          <Kachel
            label="Gesendet, 7 Tage"
            wert={k.gesendet7Tage}
            delta={k.gesendet7Tage - k.gesendetVorwoche}
            deltaBezug="zur Vorwoche"
          />
          <Kachel label="Antworten" wert={k.antworten} zusatz={k.antworten === 0 ? 'IMAP nötig' : 'zugeordnet'} />
          <Kachel
            label="Fehlgeschlagen"
            wert={k.fehlgeschlagen}
            zusatz={k.fehlgeschlagen > 0 ? 'Grund steht in der Versandzentrale' : 'keine Fehler'}
            warnen={k.fehlgeschlagen > 0}
          />
          <Kachel label="Offene Aufgaben" wert={k.offeneAufgaben} zusatz={`${anzahl(k.gesendetGesamt, 'Mail', 'Mails')} insgesamt`} />
        </div>
      </section>

      {/* --- Verlauf ------------------------------------------------------- */}
      <section aria-label="Versandverlauf">
        <h2 style={{ marginBottom: '0.2rem' }}>Gesendete Mails je Tag</h2>
        <p className="leise" style={{ margin: '0 0 0.85rem', fontSize: '0.85rem' }}>
          Letzte 14 Tage
        </p>
        <Sparkline daten={d.verlauf} einheit="Mails" />
      </section>

      {/* --- Bereitschaft --------------------------------------------------- */}
      <section aria-label="Bereitschaft">
        <h2 style={{ marginBottom: '0.85rem' }}>Bereitschaft</h2>
        <div className="bereit">
          {d.bereitschaft.map((b) => (
            <span key={b.name} className={`bereit__punkt bereit__punkt--${b.bereit ? 'ja' : 'nein'}`}>
              {/* Zeichen UND Wort: die Farbe allein trägt die Aussage nicht. */}
              <span className="bereit__zeichen" aria-hidden="true">
                {b.bereit ? '✓' : '!'}
              </span>
              {b.name}
              <span className="bereit__detail">
                {b.bereit ? b.detail : 'offen'}
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* --- Aktivität ------------------------------------------------------ */}
      <section aria-label="Letzte Aktivität">
        <h2 style={{ marginBottom: '0.85rem' }}>Zuletzt geschehen</h2>
        {d.aktivitaet.length === 0 ? (
          <p className="leise">Noch nichts protokolliert.</p>
        ) : (
          <div className="protokoll">
            {d.aktivitaet.map((a) => (
              <div key={a.id} className={`protokoll__zeile${a.fehler ? ' protokoll__zeile--fehler' : ''}`}>
                <span className="protokoll__zeit">
                  {new Date(a.zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span>{a.text}</span>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="knopf knopf--klein"
          style={{ marginTop: '0.9rem' }}
          onClick={() => jarvis.neuLaden()}
        >
          Aktualisieren
        </button>
      </section>
    </div>
  );
}

/**
 * Kennzahl-Kachel: Beschriftung, Wert, dazu entweder ein Vergleich zur
 * Vorperiode oder eine Einordnung. Nie beides — sonst rauscht die Reihe.
 */
function Kachel({
  label,
  wert,
  zusatz,
  delta,
  deltaBezug,
  warnen,
}: {
  label: string;
  wert: number;
  zusatz?: string;
  delta?: number;
  deltaBezug?: string;
  warnen?: boolean;
}): JSX.Element {
  return (
    <div>
      <p className="kachel__label">{label}</p>
      <p className="kachel__wert" style={warnen && wert > 0 ? { color: 'var(--warn)' } : undefined}>
        {wert.toLocaleString('de-DE')}
      </p>
      {delta !== undefined && delta !== 0 ? (
        <p className={`kachel__delta kachel__delta--${delta > 0 ? 'gut' : 'schlecht'}`}>
          <span className="kachel__pfeil" aria-hidden="true">
            {delta > 0 ? '▲' : '▼'}
          </span>
          {delta > 0 ? '+' : ''}
          {delta} {deltaBezug}
        </p>
      ) : (
        <p className="kachel__delta">{delta === 0 && deltaBezug ? `unverändert ${deltaBezug}` : (zusatz ?? '')}</p>
      )}
    </div>
  );
}

/**
 * Meter für „Wert gegen Limit".
 *
 * Absichtlich ein Balken und kein Kreisbogen: auf einer geraden Bahn liest man
 * den Anteil ab, im Bogen schätzt man ihn. Die Füllfarbe wechselt mit dem
 * Ernst der Lage — und weil Grün und Amber bei Rotgrünsehschwäche nah
 * beieinanderliegen, steht die Lage zusätzlich als Wort darunter.
 */
function Meter({ name, verbraucht, grenze }: { name: string; verbraucht: number; grenze: number }): JSX.Element {
  const anteil = grenze > 0 ? Math.min(1, verbraucht / grenze) : 0;
  const lage =
    anteil >= 1 ? 'erreicht' : anteil >= 0.8 ? 'fast erreicht' : anteil >= 0.5 ? 'zur Hälfte' : 'reichlich Luft';
  const klasse = anteil >= 1 ? ' meter__fuellung--voll' : anteil >= 0.8 ? ' meter__fuellung--warn' : '';

  return (
    <div className="meter">
      <div className="meter__kopf">
        <span className="meter__name">{name}</span>
        <span className="meter__zahl">
          {verbraucht} von {grenze}
        </span>
      </div>
      <div
        className="meter__bahn"
        role="meter"
        aria-valuenow={verbraucht}
        aria-valuemin={0}
        aria-valuemax={grenze}
        aria-label={`${name}: ${verbraucht} von ${grenze}, ${lage}`}
      >
        <div className={`meter__fuellung${klasse}`} style={{ width: `${(anteil * 100).toFixed(1)}%` }} />
      </div>
      <p className="meter__lage">{lage}</p>
    </div>
  );
}
