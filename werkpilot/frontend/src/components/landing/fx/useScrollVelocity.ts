"use client";

import { useEffect, useRef } from "react";

/** Scrollgeschwindigkeit in px/s als Ref (kein Rerender), für Effekte, die auf schnelles Scrollen reagieren. */
export function useScrollVelocity() {
  const v = useRef(0);
  useEffect(() => {
    let lastY = window.scrollY, lastT = performance.now(), raf = 0;
    const on = () => {
      const now = performance.now(), dt = Math.max(1, now - lastT);
      v.current = ((window.scrollY - lastY) / dt) * 1000; lastY = window.scrollY; lastT = now;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const decay = () => { v.current *= 0.85; if (Math.abs(v.current) > 5) raf = requestAnimationFrame(decay); else v.current = 0; }; raf = requestAnimationFrame(decay); });
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, []);
  return v;
}
