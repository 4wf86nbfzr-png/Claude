import { useEffect, useRef } from 'react';
import { VoiceState } from '@shared/status';

interface Props {
  zustand: VoiceState;
  pegel: number;
  groesse?: number;
}

const FARBE: Record<string, string> = {
  IDLE: 'rgba(244,244,246,0.55)',
  LISTENING: 'rgba(122,167,255,0.95)',
  THINKING: 'rgba(232,194,106,0.9)',
  EXECUTING: 'rgba(232,194,106,0.9)',
  WAITING_FOR_APPROVAL: 'rgba(226,105,95,0.95)',
  SPEAKING: 'rgba(87,217,163,0.9)',
  ERROR: 'rgba(226,105,95,0.95)'
};

/**
 * Die Kugel.
 *
 * Sie zeigt einen Zustand an und sonst nichts: im Ruhezustand atmet sie kaum
 * merklich, beim Zuhören folgt sie dem Mikrofonpegel, beim Arbeiten dreht sich
 * ein Ring. Keine Dauerbewegung ohne Anlass.
 */
export function VoiceOrb({ zustand, pegel, groesse = 168 }: Props) {
  const leinwand = useRef<HTMLCanvasElement>(null);
  const pegelRef = useRef(pegel);
  const zustandRef = useRef(zustand);
  pegelRef.current = pegel;
  zustandRef.current = zustand;

  useEffect(() => {
    const canvas = leinwand.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = groesse * dpr;
    canvas.height = groesse * dpr;
    ctx.scale(dpr, dpr);

    const wenigerBewegung = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mitte = groesse / 2;
    const basis = groesse * 0.27;
    let bild = 0;
    let geglaettet = 0;
    let laeuft = true;

    const zeichne = () => {
      if (!laeuft) return;
      bild += 1;
      const aktuellerZustand = zustandRef.current;
      const farbe = FARBE[aktuellerZustand] ?? FARBE.IDLE!;
      geglaettet += (pegelRef.current - geglaettet) * 0.2;

      const atem = wenigerBewegung ? 0 : Math.sin(bild / 55) * 0.02;
      const ausschlag = aktuellerZustand === VoiceState.LISTENING ? geglaettet * 0.5 : 0;
      const radius = basis * (1 + atem + ausschlag);

      ctx.clearRect(0, 0, groesse, groesse);

      // Weicher Kern: innen hell, nach außen auslaufend.
      const verlauf = ctx.createRadialGradient(mitte, mitte, 0, mitte, mitte, radius * 1.15);
      verlauf.addColorStop(0, farbe);
      verlauf.addColorStop(0.45, farbe.replace(/[\d.]+\)$/, '0.22)'));
      verlauf.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(mitte, mitte, radius * 1.15, 0, Math.PI * 2);
      ctx.fillStyle = verlauf;
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Konturring
      ctx.beginPath();
      ctx.arc(mitte, mitte, radius, 0, Math.PI * 2);
      ctx.strokeStyle = farbe;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Arbeitsring: dreht nur, während wirklich gearbeitet wird.
      const arbeitet =
        aktuellerZustand === VoiceState.THINKING || aktuellerZustand === VoiceState.EXECUTING;
      if (arbeitet && !wenigerBewegung) {
        const start = (bild / 26) % (Math.PI * 2);
        ctx.beginPath();
        ctx.arc(mitte, mitte, radius + 12, start, start + Math.PI * 0.45);
        ctx.strokeStyle = farbe;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Ruhender Außenring als feine Kante
      ctx.beginPath();
      ctx.arc(mitte, mitte, radius + 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.stroke();

      requestAnimationFrame(zeichne);
    };
    zeichne();

    return () => {
      laeuft = false;
    };
  }, [groesse]);

  return (
    <canvas
      ref={leinwand}
      className="orb"
      style={{ width: groesse, height: groesse }}
      role="img"
      aria-label={`Sprachstatus: ${zustand}`}
    />
  );
}
