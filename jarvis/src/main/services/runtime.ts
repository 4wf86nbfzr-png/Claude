/**
 * Laufzeitpfade.
 *
 * Der Main-Prozess setzt das Datenverzeichnis beim Start auf
 * `app.getPath('userData')`. Tests setzen ein temporäres Verzeichnis.
 * Dadurch bleibt der Rest des Codes frei von Electron-Importen und lässt
 * sich ohne laufende App testen.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

let dataDir: string | null = null

export function setDataDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
  dataDir = dir
}

export function getDataDir(): string {
  if (!dataDir) throw new Error('Datenverzeichnis ist nicht gesetzt (setDataDir fehlt).')
  return dataDir
}

export function dataPath(...parts: string[]): string {
  return join(getDataDir(), ...parts)
}

/** Unterordner anlegen und zurückgeben. */
export function ensureDir(...parts: string[]): string {
  const dir = dataPath(...parts)
  mkdirSync(dir, { recursive: true })
  return dir
}

export const FILES = {
  database: 'jarvis.db',
  settings: 'settings.json',
  secrets: 'secrets.enc',
  secretKey: 'secret.key',
  attachments: 'anhänge',
  logs: 'logs'
} as const
