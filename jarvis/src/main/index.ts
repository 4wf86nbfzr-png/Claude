/**
 * Start der Anwendung.
 *
 * Reihenfolge: Datenverzeichnis -> Datenbank -> Werkzeuge -> Ersatz-Aufträge
 * für offene Freigaben -> IPC -> Fenster.
 */
import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performSend } from './agents/mail-agent'
import { closeDb, openJarvisDatabase, setDb } from './db'
import { registerIpcHandlers } from './ipc'
import { registerFallbackExecutor } from './services/approval'
import { auditInfo } from './services/audit'
import { loadEnvFiles } from './services/env'
import { onJarvisEvent } from './services/events'
import { FILES, setDataDir, dataPath } from './services/runtime'
import { registerAllTools } from './tools'
import { IPC } from '@shared/ipc'
import type { ToolResult } from '@shared/types'

const here = dirname(fileURLToPath(import.meta.url))

/** electron-vite legt das Preload-Skript je nach Modulformat als .mjs oder .js ab. */
function preloadPath(): string {
  const candidates = [join(here, '../preload/index.mjs'), join(here, '../preload/index.js'), join(here, '../preload/index.cjs')]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#08080A',
    title: 'JARVIS',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // Für ESM-Preload-Skripte muss die Sandbox aus sein; die Trennung
      // übernimmt contextIsolation.
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Externe Links gehören in den Browser, nicht in die App.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isDev = Boolean(process.env.ELECTRON_RENDERER_URL)
    if (isDev && url.startsWith(process.env.ELECTRON_RENDERER_URL as string)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  // Ereignisse aus dem Kern ins Fenster durchreichen.
  onJarvisEvent((jarvisEvent) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.event, jarvisEvent)
    }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(here, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function bootstrap(): void {
  setDataDir(app.getPath('userData'))

  // .env ist der Weg für automatisierte Umgebungen. Wer die Anwendung normal
  // benutzt, trägt seine Zugänge in den Einstellungen ein — die landen
  // verschlüsselt im Schlüsselbund statt im Klartext auf der Platte.
  const env = loadEnvFiles([process.cwd(), app.getAppPath(), app.getPath('userData')])

  setDb(openJarvisDatabase(dataPath(FILES.database)))
  registerAllTools()

  // Nach einem Neustart liegt zu einer offenen Freigabe kein Auftrag mehr im
  // Speicher. Für den Mailversand lässt er sich aus der Anfrage wiederherstellen.
  registerFallbackExecutor('email_senden', async (approval): Promise<ToolResult> => {
    if (!approval.relatedEmailId) {
      return { ok: false, error: 'Zu dieser Freigabe ist kein Entwurf hinterlegt.' }
    }
    return performSend(approval.relatedEmailId, approval.id)
  })

  registerIpcHandlers()
  auditInfo('System', 'Start', `JARVIS ${app.getVersion()} gestartet (${process.platform}).`)
  if (env) {
    auditInfo('System', 'Umgebung geladen', `${env.file}: ${env.keys.length} Werte übernommen.`)
  }
}

app.whenReady().then(() => {
  bootstrap()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  auditInfo('System', 'Beenden', 'JARVIS wird beendet.')
  closeDb()
})

// Zweite Instanz auf das vorhandene Fenster lenken.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}
