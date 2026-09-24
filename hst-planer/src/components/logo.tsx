/**
 * Logo-Platzhalter (Spec 75). Das echte HST-Logo wird später unter
 * public/logo.svg abgelegt; diese Komponente greift dann darauf zu.
 */
export function Logo({ groesse = 28 }: { groesse?: number }) {
  return (
    <span
      aria-label="HST Planer"
      role="img"
      style={{
        display: 'grid', placeItems: 'center', flex: 'none',
        width: groesse, height: groesse, borderRadius: groesse * 0.22,
        background: 'var(--akzent)', color: 'var(--akzent-kontrast)',
        fontWeight: 700, fontSize: groesse * 0.4, letterSpacing: '-.02em',
      }}
    >
      HST
    </span>
  );
}
