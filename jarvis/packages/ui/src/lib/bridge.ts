import type { Command, CommandResponse, IpcEventEnvelope } from '@jarvis/core/ipc';

/**
 * Zugriff auf den Kern.
 *
 * Im Fenster gibt es nur `window.jarvis` aus dem Vorlade-Skript. Läuft die
 * Oberfläche einmal ohne Electron (z. B. `vite dev` im Browser), meldet
 * `verfuegbar` das ehrlich, statt still nichts zu tun.
 */

declare global {
  interface Window {
    jarvis?: {
      invoke(command: Command): Promise<CommandResponse>;
      onEvent(handler: (event: IpcEventEnvelope) => void): () => void;
      plattform: string;
      version: string;
    };
  }
}

export const bridgeVerfuegbar = (): boolean => typeof window !== 'undefined' && Boolean(window.jarvis);

export async function befehl(command: Command): Promise<CommandResponse> {
  if (!window.jarvis) {
    return {
      ok: false,
      error: {
        code: 'NOT_CONFIGURED',
        message: 'Die Oberfläche läuft ohne den JARVIS-Kern.',
        hint: 'Bitte die Desktop-App starten (npm run dev im Ordner jarvis).',
      },
    };
  }
  return window.jarvis.invoke(command);
}

/** Wie `befehl`, gibt aber direkt die Daten oder null zurück. */
export async function daten<T>(command: Command): Promise<T | null> {
  const r = await befehl(command);
  return r.ok ? (r.data as T) : null;
}

export function aufEreignis(handler: (event: IpcEventEnvelope) => void): () => void {
  if (!window.jarvis) return () => {};
  return window.jarvis.onEvent(handler);
}

export const plattform = (): string => window.jarvis?.plattform ?? 'web';
