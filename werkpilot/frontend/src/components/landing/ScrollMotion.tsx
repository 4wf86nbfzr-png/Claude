"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/** Fly-through-Übergänge und gleitende Bilder: Abschnitte mit data-fly kommen beim Scrollen aus der
 *  Tiefe nach vorn, große Bilder laufen etwas langsamer als der Text. Nur ohne reduzierte Bewegung. */
export function ScrollMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-fly]").forEach((el) => {
        gsap.fromTo(el, { transformPerspective: 1400, z: -340, yPercent: 7, scale: 0.94, opacity: 0.25 },
          { z: 0, yPercent: 0, scale: 1, opacity: 1, ease: "none", immediateRender: false, scrollTrigger: { trigger: el, start: "top 100%", end: "top 38%", scrub: true, invalidateOnRefresh: true } });
      });
      gsap.utils.toArray<HTMLElement>(".still-wrap .still").forEach((img) => {
        gsap.fromTo(img, { yPercent: -9, scale: 1.2 }, { yPercent: 9, scale: 1.2, ease: "none", scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "bottom top", scrub: true, invalidateOnRefresh: true } });
      });
    });
    ScrollTrigger.sort();
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => { cancelAnimationFrame(id); ctx.revert(); };
  }, []);
  return null;
}
