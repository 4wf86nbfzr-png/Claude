"use client";

/** Installations-Aufforderung des Browsers (Chrome, Edge, Android) zwischenspeichern, damit die Website sie bei Klick auslösen kann. */
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; listeners.forEach((l) => l()); });
  window.addEventListener("appinstalled", () => { deferred = null; listeners.forEach((l) => l()); });
}
export function canPromptInstall(): boolean { return deferred !== null; }
export function onInstallChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const ev = deferred; await ev.prompt(); const r = await ev.userChoice; if (r.outcome === "accepted") deferred = null; return r.outcome;
}
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true || Boolean((window as Window & { clairifyDesktop?: unknown }).clairifyDesktop);
}
export type OS = "windows" | "macos" | "linux" | "ios" | "android" | "unknown";
export function detectOS(): OS {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/.test(ua)) return "macos";
  if (/Linux|X11/.test(ua)) return "linux";
  return "unknown";
}
