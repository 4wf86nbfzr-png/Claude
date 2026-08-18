/**
 * Dateizugriff nach dem Prinzip der geringsten Rechte.
 *
 * JARVIS darf nicht überall lesen und schreiben. Erlaubt sind:
 *   - der eigene Arbeitsordner im Datenverzeichnis,
 *   - Verzeichnisse, die der Nutzer in den Einstellungen ausdrücklich freigibt.
 *
 * Geprüft wird der aufgelöste Pfad, nicht die Eingabe — sonst ließe sich die
 * Sperre mit "../.." umgehen.
 */
import { realpathSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'
import { ensureDir } from './runtime'
import { getSettings } from './settings'

export function workspaceDir(): string {
  return ensureDir('arbeitsordner')
}

export function allowedRoots(): string[] {
  const roots = [workspaceDir(), ...getSettings().files.allowedRoots]
  return roots.filter(Boolean).map((root) => resolve(root))
}

function within(child: string, parent: string): boolean {
  if (child === parent) return true
  return child.startsWith(parent.endsWith(sep) ? parent : parent + sep)
}

export interface PathCheck {
  ok: boolean
  path: string
  error?: string
}

/**
 * Löst einen Pfad auf und prüft ihn gegen die freigegebenen Verzeichnisse.
 *
 * Existiert die Datei schon, wird zusätzlich der echte Pfad geprüft (das
 * fängt Verknüpfungen ab, die aus dem erlaubten Bereich herausführen).
 */
export function checkPath(input: string): PathCheck {
  if (!input || !input.trim()) return { ok: false, path: '', error: 'Es wurde kein Pfad angegeben.' }

  const candidate = isAbsolute(input) ? resolve(input) : resolve(workspaceDir(), input)
  const roots = allowedRoots()

  let real = candidate
  try {
    real = realpathSync(candidate)
  } catch {
    // Datei existiert noch nicht — dann zählt der aufgelöste Pfad.
  }

  const allowed = roots.some((root) => within(candidate, root) || within(real, root))
  if (!allowed) {
    return {
      ok: false,
      path: candidate,
      error:
        `Der Pfad ${candidate} liegt außerhalb der freigegebenen Verzeichnisse. ` +
        `Erlaubt sind: ${roots.join(', ')}. Weitere Ordner lassen sich in den Einstellungen freigeben.`
    }
  }

  return { ok: true, path: candidate }
}
