import type { Metadata } from 'next';
import { appConfig } from '@miteinander/core';
import './globals.css';
import { MainNav } from './nav';

export const metadata: Metadata = {
  title: `${appConfig.appName} – Verwaltung`,
  description: 'Prüfungen, Sicherheitsfälle und Inhalte verwalten.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        {/* Sprungmarke: erste erreichbare Stelle für Tastaturnutzende. */}
        <a className="skip-link" href="#inhalt">
          Direkt zum Inhalt
        </a>
        <header style={{ borderBottom: '1px solid var(--border)', padding: '16px 24px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 12 }}>
            <strong>{appConfig.appName} – Verwaltung</strong>
            <MainNav />
          </div>
        </header>
        <main id="inhalt">{children}</main>
        <footer
          style={{
            borderTop: '1px solid var(--border)',
            padding: '24px',
            marginTop: 48,
          }}
        >
          <div style={{ maxWidth: 1100, margin: '0 auto' }} className="muted">
            <p>
              Zugriffe auf Nutzerdaten werden protokolliert. Ein stilles Anmelden im Namen einer
              Person gibt es nicht.
            </p>
            <p>Rückmeldungen zur Barrierefreiheit: {appConfig.accessibilityFeedbackEmail}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
