"use client";

import { useEffect, useState, type RefObject } from "react";

/** true, sobald das Element in die Nähe des Viewports kommt (und false, wenn es weit weg ist):
 *  WebGL-Szenen werden nur dann gerendert, damit mehrere Canvas-Elemente die Seite nicht ausbremsen. */
export function useNear(ref: RefObject<HTMLElement | null>, margin = "50%") {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { queueMicrotask(() => setNear(true)); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => setNear(e.isIntersecting)), { rootMargin: `${margin} 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return near;
}

export function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => { queueMicrotask(() => setR(window.matchMedia("(prefers-reduced-motion: reduce)").matches)); }, []);
  return r;
}
