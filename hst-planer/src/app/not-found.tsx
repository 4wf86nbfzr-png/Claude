import Link from 'next/link';

export const metadata = { title: 'Nicht gefunden' };

export default function NichtGefunden() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 20, textAlign: 'center' }}>
      <div style={{ maxWidth: 400 }}>
        <p style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-gedaempft)' }}>HST Planer</p>
        <h1 style={{ fontSize: 20, fontWeight: 650, margin: '6px 0 8px' }}>Diese Seite gibt es nicht</h1>
        <p style={{ color: 'var(--text-sekundaer)', marginBottom: 16 }}>
          Der Link ist vermutlich veraltet oder der Datensatz wurde archiviert.
        </p>
        <Link href="/" className="knopf knopf-primaer">Zur Startseite</Link>
      </div>
    </main>
  );
}
