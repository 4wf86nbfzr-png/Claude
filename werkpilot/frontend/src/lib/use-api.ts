"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

/** Lädt einen API-Pfad; `reload()` holt die Daten erneut. Ändert sich der Pfad, wird neu geladen. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) return;
    try { setData(await api<T>(path)); setError(null); }
    catch (e) { setError(e instanceof ApiError ? String(e.detail) : "Fehler beim Laden"); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return { data, error, loading, reload: load };
}

export const statusLabel: Record<string, string> = { new: "Neu", processing: "In Verarbeitung", needs_review: "Zur Prüfung", waiting_customer: "Wartet auf Kunde", scheduled: "Termin", quoted: "Angebot", won: "Gewonnen", lost: "Verloren", spam: "Spam", closed: "Abgeschlossen" };
export const prioTone: Record<string, "bad" | "warn" | "accent" | "neutral"> = { urgent: "bad", high: "warn", normal: "accent", low: "neutral" };
export const prioLabel: Record<string, string> = { urgent: "Dringend", high: "Hoch", normal: "Normal", low: "Niedrig" };
export const catLabel: Record<string, string> = { notfall: "Notfall", reparatur: "Reparatur", neuinstallation: "Neuinstallation", wartung: "Wartung", angebot: "Angebot", terminfrage: "Terminfrage", rueckfrage: "Rückfrage", beschwerde: "Beschwerde", sonstiges: "Sonstiges", spam: "Spam" };
