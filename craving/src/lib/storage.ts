/**
 * Gekapselter Zugriff auf localStorage.
 * Faengt Private-Mode, volle Quota und deaktivierte Speicher ab —
 * die App darf daran nie sterben (siehe Offline-Anforderung).
 */

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfuegbar — die App laeuft ohne Persistenz weiter. */
  }
}

export function removeKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* egal */
  }
}

/** Storage-Adapter fuer zustand/persist, robust gegen Ausnahmen. */
export const safeStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(name, value);
    } catch {
      /* egal */
    }
  },
  removeItem: (name: string): void => removeKey(name),
};
