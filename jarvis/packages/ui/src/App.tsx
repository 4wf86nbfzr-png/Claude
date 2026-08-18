import { useEffect, useState } from 'react';
import { ApprovalDialog } from './components/ApprovalDialog.js';
import { useJarvis } from './lib/store.js';
import { Einrichtung } from './views/Einrichtung.js';
import { Firmen } from './views/Firmen.js';
import { Freigaben } from './views/Freigaben.js';
import { Konsole } from './views/Konsole.js';
import { Protokoll } from './views/Protokoll.js';
import { Versandzentrale } from './views/Versandzentrale.js';

type Ansicht = 'konsole' | 'versand' | 'freigaben' | 'firmen' | 'protokoll' | 'einrichtung';

const ANSICHTEN: Array<{ id: Ansicht; titel: string }> = [
  { id: 'konsole', titel: 'Konsole' },
  { id: 'versand', titel: 'Versandzentrale' },
  { id: 'freigaben', titel: 'Freigaben' },
  { id: 'firmen', titel: 'Unternehmen' },
  { id: 'protokoll', titel: 'Protokoll' },
  { id: 'einrichtung', titel: 'Einrichtung' },
];

/**
 * Rahmen der Anwendung.
 *
 * Eine offene Freigabe schiebt sich als Dialog über alles andere -- sie ist
 * der einzige Zustand, der die Aufmerksamkeit erzwingen darf.
 */
export function App(): JSX.Element {
  const jarvis = useJarvis();
  const [ansicht, setAnsicht] = useState<Ansicht>('konsole');
  const [dialogUnterdrueckt, setDialogUnterdrueckt] = useState<string | null>(null);

  const naechsteFreigabe = jarvis.freigaben[0];
  const zeigeDialog =
    naechsteFreigabe && naechsteFreigabe.id !== dialogUnterdrueckt && ansicht !== 'freigaben';

  // Tastenkürzel: Strg/Cmd + 1..6 wechselt die Ansicht.
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const nummer = Number.parseInt(e.key, 10);
      if (Number.isInteger(nummer) && nummer >= 1 && nummer <= ANSICHTEN.length) {
        e.preventDefault();
        setAnsicht(ANSICHTEN[nummer - 1]!.id);
      }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, []);

  return (
    <div className="app">
      <aside className="seitenleiste">
        <div className="marke">
          <h1 className="marke__wort">Jarvis</h1>
          <p className="marke__zusatz">{jarvis.bereit ? jarvis.zustand : 'kein Kern'}</p>
        </div>

        <nav className="nav" aria-label="Hauptnavigation">
          {ANSICHTEN.map((eintrag) => (
            <button
              key={eintrag.id}
              type="button"
              className="nav__eintrag"
              aria-current={ansicht === eintrag.id ? 'page' : undefined}
              onClick={() => setAnsicht(eintrag.id)}
            >
              <span>{eintrag.titel}</span>
              {eintrag.id === 'freigaben' && jarvis.freigaben.length > 0 && (
                <span className="nav__zaehler nav__zaehler--warten">{jarvis.freigaben.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="seitenleiste__fuss">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={jarvis.sprachausgabeAn}
              onChange={(e) => jarvis.setSprachausgabe(e.target.checked)}
            />
            Sprachausgabe
          </label>
          <p style={{ marginTop: '0.75rem' }}>Alle Daten liegen lokal.</p>
        </div>
      </aside>

      <main className="buehne">
        {!jarvis.bereit && (
          <p className="hinweis hinweis--gefahr">
            Die Oberfläche läuft ohne den JARVIS-Kern. Bitte die Desktop-App starten
            (<code>npm run dev</code> im Ordner <code>jarvis</code>).
          </p>
        )}

        {jarvis.fehler && (
          <div className="hinweis hinweis--gefahr" style={{ marginBottom: '1.25rem' }}>
            <p style={{ margin: 0 }}>{jarvis.fehler.message}</p>
            {jarvis.fehler.hint && (
              <p className="leise" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                {jarvis.fehler.hint}
              </p>
            )}
            <button
              type="button"
              className="knopf knopf--klein"
              style={{ marginTop: '0.5rem' }}
              onClick={jarvis.fehlerSchliessen}
            >
              Verstanden
            </button>
          </div>
        )}

        {ansicht === 'konsole' && <Konsole />}
        {ansicht === 'versand' && <Versandzentrale />}
        {ansicht === 'freigaben' && <Freigaben />}
        {ansicht === 'firmen' && <Firmen />}
        {ansicht === 'protokoll' && <Protokoll />}
        {ansicht === 'einrichtung' && <Einrichtung />}
      </main>

      {zeigeDialog && naechsteFreigabe && (
        <ApprovalDialog
          freigabe={naechsteFreigabe}
          beschaeftigt={jarvis.beschaeftigt}
          onFreigeben={() => void jarvis.freigeben(naechsteFreigabe.id)}
          onAblehnen={() => void jarvis.ablehnen(naechsteFreigabe.id)}
          onBearbeiten={() => {
            setDialogUnterdrueckt(naechsteFreigabe.id);
            setAnsicht('versand');
          }}
          onSchliessen={() => setDialogUnterdrueckt(naechsteFreigabe.id)}
        />
      )}
    </div>
  );
}
