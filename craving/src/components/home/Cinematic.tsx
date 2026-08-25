"use client";

import { useEffect, useRef, useState } from "react";

import { cinematicFor } from "@/data/media";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";

/**
 * Video-Slot mit Rueckfallebene.
 *
 * Geladen wird erst, wenn der Abschnitt in die Naehe des Sichtfelds kommt
 * (IntersectionObserver + preload="none"), abgespielt stumm und in
 * Schleife. Ohne hinterlegte Datei oder bei prefers-reduced-motion zeigt
 * der Slot `children` — bei uns die prozedurale Produktdarstellung.
 */
export function Cinematic({
  categoryId,
  className = "",
  children,
}: {
  categoryId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const source = cinematicFor(categoryId);
  const reduced = useReducedMotionSafe();
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || !source || reduced) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [source, reduced]);

  if (!source || reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div ref={ref} className={className}>
      {near ? (
        <video
          className="size-full rounded-[26px] object-cover"
          poster={source.poster}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          aria-label={source.alt}
        >
          {source.webm && <source src={source.webm} type="video/webm" />}
          {source.mp4 && <source src={source.mp4} type="video/mp4" />}
        </video>
      ) : (
        children
      )}
    </div>
  );
}
