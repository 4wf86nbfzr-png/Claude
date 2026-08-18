/**
 * .env einlesen.
 *
 * Bewusst ohne Zusatzpaket — es geht um wenige Zeilen KEY=VALUE. Gesucht wird
 * im Arbeitsverzeichnis (Entwicklung) und im Datenverzeichnis (installierte
 * Anwendung). Bereits gesetzte Umgebungsvariablen werden nicht überschrieben:
 * was die Umgebung mitbringt, hat Vorrang vor der Datei.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line
    const separator = withoutExport.indexOf('=')
    if (separator <= 0) continue

    const key = withoutExport.slice(0, separator).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue

    let value = withoutExport.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!value) continue

    out[key] = value
  }

  return out
}

/** Liest die erste gefundene .env und gibt zurück, welche Datei genommen wurde. */
export function loadEnvFiles(directories: string[]): { file: string; keys: string[] } | null {
  for (const directory of directories) {
    const file = join(directory, '.env')
    if (!existsSync(file)) continue

    let parsed: Record<string, string>
    try {
      parsed = parseEnvFile(readFileSync(file, 'utf8'))
    } catch {
      continue
    }

    const applied: string[] = []
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key]) continue
      process.env[key] = value
      applied.push(key)
    }
    return { file, keys: applied }
  }

  return null
}
