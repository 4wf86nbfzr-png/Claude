import { useState } from 'react';
import { Einstellungen } from './components/Einstellungen';
import { Entwuerfe } from './components/Entwuerfe';
import { Gespraech } from './components/Gespraech';
import { Protokoll } from './components/Protokoll';
import { Versandzentrale } from './components/Versandzentrale';
import { useJarvis } from './state/useJarvis';

type Ansicht = 'gespraech' | 'versand' | 'entwuerfe' | 'protokoll' | 'einstellungen';

const NAVIGATION: { id: Ansicht; titel: string }[] = [
  { id: 'gespraech', titel: 'Gespräch' },
  { id: 'versand', titel: 'Versand' },
  { id: 'entwuerfe', titel: 'Entwürfe' },
  { id: 'protokoll', titel: 'Protokoll' },
  { id: 'einstellungen', titel: 'Einstellungen' }
];

export function App() {
  const j = useJarvis();
  const [ansicht, setAnsicht] = useState<Ansicht>('gespraech');

  return (
    <div className="app">
      <header className="kopf">
        <span className="kopf__marke">Jarvis</span>
        <nav>
          {NAVIGATION.map((eintrag) => (
            <button
              key={eintrag.id}
              aria-current={ansicht === eintrag.id}
              onClick={() => setAnsicht(eintrag.id)}
            >
              {eintrag.titel}
              {eintrag.id === 'versand' && j.freigaben.length > 0 ? ` · ${j.freigaben.length}` : ''}
            </button>
          ))}
          <button
            aria-pressed={j.autoVorlesen}
            onClick={() => {
              j.setAutoVorlesen(!j.autoVorlesen);
              if (j.autoVorlesen) j.vorlesenBeenden();
            }}
            title="Antworten automatisch vorlesen"
          >
            {j.autoVorlesen ? 'Ton an' : 'Ton aus'}
          </button>
        </nav>
      </header>

      {ansicht === 'gespraech' && <Gespraech j={j} />}
      {ansicht === 'versand' && <Versandzentrale onVorlesen={j.vorlesen} />}
      {ansicht === 'entwuerfe' && <Entwuerfe onVorlesen={j.vorlesen} />}
      {ansicht === 'protokoll' && <Protokoll />}
      {ansicht === 'einstellungen' && <Einstellungen status={j.status} onStatus={j.ladeStatus} />}
    </div>
  );
}
