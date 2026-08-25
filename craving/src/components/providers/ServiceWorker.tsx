"use client";

import { useEffect } from "react";

/**
 * Registriert den Service Worker — nur im Produktionsbuild. In der
 * Entwicklung wuerde er staendig veraltete Dateien ausliefern und das
 * Nachladen (HMR) stoeren.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
