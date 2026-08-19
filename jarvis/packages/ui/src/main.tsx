import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { GespraechProvider } from './lib/gespraechskontext.js';
import { JarvisProvider } from './lib/store.js';
import './styles/app.css';

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Das Wurzelelement fehlt im Dokument.');

createRoot(wurzel).render(
  <StrictMode>
    <JarvisProvider>
      {/* Das Zuhören umschließt die ganze Anwendung: JARVIS soll in jeder
          Ansicht reagieren, nicht nur in der Konsole. */}
      <GespraechProvider>
        <App />
      </GespraechProvider>
    </JarvisProvider>
  </StrictMode>,
);
