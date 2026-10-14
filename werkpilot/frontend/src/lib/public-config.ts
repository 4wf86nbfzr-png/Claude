"use client";

import { useEffect, useState } from "react";

/** Antwort von GET /api/public/config: nur Zustände, keine Geheimnisse. */
export type PublicConfig = {
  app: string;
  env: string;
  stripe_ready: boolean;
  llm_live: boolean;
  email_live: boolean;
  trial_days: number;
  downloads: { windows: string | null; macos: string | null; linux?: string | null; ios: string | null; android: string | null };
};

let cache: Promise<PublicConfig | null> | null = null;

/** Lädt die öffentliche Konfiguration genau einmal pro Seite und teilt sie zwischen Komponenten. */
export function fetchPublicConfig(): Promise<PublicConfig | null> {
  if (!cache) {
    cache = fetch("/api/public/config")
      .then((r) => (r.ok ? (r.json() as Promise<PublicConfig>) : null))
      .catch(() => null);
  }
  return cache;
}

export function usePublicConfig(): PublicConfig | null {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  useEffect(() => {
    let alive = true;
    fetchPublicConfig().then((c) => { if (alive && c) setCfg(c); });
    return () => { alive = false; };
  }, []);
  return cfg;
}
