"use client";

import { useEffect, useState } from "react";

/**
 * Welcher Abschnitt ist gerade sichtbar? Treibt die Fortschrittsleiste
 * des Builders und die Kapitelmarken langer Seiten.
 */
export function useScrollSpy(ids: string[], rootMargin = "-45% 0px -45% 0px"): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin, threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids, rootMargin]);

  return active;
}
