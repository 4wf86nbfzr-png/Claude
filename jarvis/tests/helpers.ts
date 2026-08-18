/**
 * Gemeinsame Testvorbereitung: frisches Datenverzeichnis, frische Datenbank.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb, openJarvisDatabase, setDb } from '../src/main/db'
import { resetApprovalExecutors } from '../src/main/services/approval'
import { resetCredentialCache } from '../src/main/services/credentials'
import { dataPath, FILES, setDataDir } from '../src/main/services/runtime'
import { resetSettingsCache, updateSettings } from '../src/main/services/settings'

let currentDir: string | null = null

export function setupTestEnvironment(): string {
  const dir = mkdtempSync(join(tmpdir(), 'jarvis-test-'))
  currentDir = dir
  setDataDir(dir)
  resetSettingsCache()
  resetCredentialCache()
  resetApprovalExecutors()
  setDb(openJarvisDatabase(dataPath(FILES.database)))
  return dir
}

export function teardownTestEnvironment(): void {
  closeDb()
  if (currentDir) rmSync(currentDir, { recursive: true, force: true })
  currentDir = null
}

/** Einstellungen, die eine vollständig eingerichtete Installation nachbilden. */
export function configureForSending(): void {
  updateSettings({
    mail: {
      transport: 'smtp',
      fromAddress: 'dispo@example-absender.de',
      fromName: 'Testfirma',
      smtp: { host: 'localhost', port: 587, secure: false, user: 'dispo@example-absender.de' }
    },
    outreach: {
      senderCompany: 'Testfirma GmbH',
      senderService: 'Baustellenbewachung',
      requireVerifiedAddress: true,
      dailySendLimit: 40,
      minSecondsBetweenSends: 0
    }
  })
}
