'use client';

/** Auffangnetz für unerwartete Fehler – ohne technische Details (Spec 53). */
export default function Fehler({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', fontFamily: 'system-ui, sans-serif', background: '#F4F4F6', color: '#14141A' }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Es ist ein technischer Fehler aufgetreten</h1>
          <p style={{ color: '#55555F', marginBottom: 16 }}>
            Der Vorgang konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.
            Wenn der Fehler bestehen bleibt, melden Sie sich bitte bei der Administration.
          </p>
          <button onClick={reset} style={{ padding: '10px 18px', borderRadius: 6, border: '1px solid #7C3AED', background: '#7C3AED', color: '#fff', cursor: 'pointer' }}>
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  );
}
