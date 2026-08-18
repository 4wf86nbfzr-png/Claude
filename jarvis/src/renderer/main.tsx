import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/app.css';

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement nicht gefunden.');

// Ohne die Brücke zum Kern hat die Oberfläche keine Funktion. Statt eines
// leeren Fensters bekommt der Benutzer dann eine klare Meldung.
if (typeof window.jarvis === 'undefined') {
  wurzel.innerHTML = `
    <div style="display:grid;place-items:center;height:100%;text-align:center;padding:40px">
      <div>
        <p style="font-family:ui-monospace,monospace;letter-spacing:.3em;text-transform:uppercase">Jarvis</p>
        <p style="margin-top:16px;color:#b8b8c0;max-width:46ch">
          Die Verbindung zum Kern ist nicht verfügbar. Bitte starten Sie JARVIS über die App
          (<code>npm start</code>) und nicht direkt im Browser.
        </p>
      </div>
    </div>`;
  throw new Error('Preload-Brücke nicht verfügbar.');
}

createRoot(wurzel).render(
  <StrictMode>
    <App />
  </StrictMode>
);
