import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { THEME_COOKIE } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'HST Planer', template: '%s · HST Planer' },
  description: 'Disposition & Einsatzsteuerung für das HERM Service Team',
  robots: { index: false, follow: false },
  icons: { icon: '/logo-platzhalter.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F4F6' },
    { media: '(prefers-color-scheme: dark)', color: '#0D0D11' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Das Thema steht im Cookie und wird serverseitig gesetzt – dadurch gibt es
  // beim Laden kein kurzes Aufblitzen der hellen Oberflaeche.
  const gespeichert = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = gespeichert === 'dark' || gespeichert === 'light' ? gespeichert : undefined;

  return (
    <html lang="de" data-theme={theme} suppressHydrationWarning>
      <head>
        {!theme && (
          <script
            // Ohne gespeicherte Praeferenz folgt die Oberflaeche dem Betriebssystem.
            dangerouslySetInnerHTML={{
              __html: `try{if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.dataset.theme='dark'}catch(e){}`,
            }}
          />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
