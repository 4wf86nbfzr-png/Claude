"use client";

import { useEffect } from "react";

/** Meldet den Service Worker an, damit Clairify sich auf Windows, macOS, Linux, Android und iPhone als App installieren lässt. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || location.protocol !== "https:" && location.hostname !== "localhost") return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
