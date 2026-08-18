import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, safeStorage, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CommandHandler,
  IPC_COMMAND_CHANNEL,
  IPC_EVENT_CHANNEL,
  Jarvis,
  ok,
  err,
  type Command,
  type ExternalSecretStore,
  type Result,
} from '@jarvis/core';

/**
 * Electron-Hauptprozess.
 *
 * Er tut bewusst wenig: Fenster oeffnen, den Kern starten, Befehle und
 * Ereignisse durchreichen. Die gesamte Fachlogik liegt in @jarvis/core und
 * ist damit auch ohne Electron testbar.
 *
 * Warum Electron und nicht Tauri: der Kern haengt an Node-Bibliotheken
 * (better-sqlite3, nodemailer, imapflow) und am Node-Netzwerkstapel. Unter
 * Tauri bräuchte es dafür entweder eine zweite Implementierung in Rust oder
 * einen mitgelieferten Node-Beiprozess -- beides mehr Angriffsfläche und mehr
 * Pflegeaufwand als der Speichervorteil wert ist. Dafür ist hier alles
 * abgeschaltet, was Electron unsicher macht (siehe webPreferences unten).
 */

const ENTWICKLUNG = process.env.NODE_ENV === 'development';
const DEV_SERVER = process.env.JARVIS_DEV_SERVER ?? 'http://127.0.0.1:5173';

let fenster: BrowserWindow | null = null;
let jarvis: Jarvis | null = null;
let handler: CommandHandler | null = null;
let ereignisAbmelden: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Zugangsdaten im Schluesselbund des Betriebssystems
// ---------------------------------------------------------------------------

/**
 * Nutzt Electrons `safeStorage`, das unter macOS an die Keychain geht, unter
 * Windows an DPAPI und unter Linux an den Secret Service (gnome-keyring/kwallet).
 * Die verschluesselten Werte liegen in einer Datei im Benutzerdatenverzeichnis --
 * ohne den Schluessel des Systems sind sie wertlos.
 */
function createSecretStore(): ExternalSecretStore | undefined {
  const datei = join(app.getPath('userData'), 'zugangsdaten.bin');

  const lesen = (): Record<string, string> => {
    if (!existsSync(datei)) return {};
    try {
      const roh = readFileSync(datei);
      return JSON.parse(safeStorage.decryptString(roh)) as Record<string, string>;
    } catch {
      return {};
    }
  };
  const schreiben = (werte: Record<string, string>) => {
    writeFileSync(datei, safeStorage.encryptString(JSON.stringify(werte)), { mode: 0o600 });
  };

  return {
    name: 'Electron safeStorage',
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    get: (key) => lesen()[key] ?? null,
    set: (key, value) => {
      const werte = lesen();
      werte[key] = value;
      schreiben(werte);
    },
    delete: (key) => {
      const werte = lesen();
      if (key in werte) {
        delete werte[key];
        schreiben(werte);
      }
    },
    keys: () => Object.keys(lesen()),
  };
}

// ---------------------------------------------------------------------------
// Fenster
// ---------------------------------------------------------------------------

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: '#08080A',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'JARVIS',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      // Die drei Zeilen sind der Grund, warum das hier vertretbar ist:
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Externe Links gehen in den Systembrowser, nicht in ein neues Fenster.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const erlaubt = ENTWICKLUNG ? url.startsWith(DEV_SERVER) : url.startsWith('file://');
    if (!erlaubt) {
      event.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });

  if (ENTWICKLUNG) {
    void win.loadURL(DEV_SERVER);
  } else {
    void win.loadFile(join(__dirname, '..', 'renderer', 'index.html'));
  }

  return win;
}

/** Strenge Inhaltsrichtlinie: keine fremden Quellen, kein eval. */
function applyContentSecurityPolicy(win: BrowserWindow): void {
  const policy = ENTWICKLUNG
    ? "default-src 'self' 'unsafe-inline' data: blob: http://127.0.0.1:5173 ws://127.0.0.1:5173; media-src 'self' data: blob: file:"
    : "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob: file:; connect-src 'self'; object-src 'none'; base-uri 'none'";

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] },
    });
  });

  // Mikrofon ja (Sprachbedienung), alles andere nein.
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
}

// ---------------------------------------------------------------------------
// Verdrahtung
// ---------------------------------------------------------------------------

function startCore(): void {
  jarvis = Jarvis.create({
    secretStore: createSecretStore(),
    clipboard: {
      readText: () => clipboard.readText(),
      writeText: (text: string) => clipboard.writeText(text),
    },
  });

  handler = new CommandHandler(jarvis, {
    openExternal: async (url: string): Promise<Result<unknown>> => {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
          return err('PERMISSION_DENIED', `Das Schema ${parsed.protocol} wird nicht geöffnet.`);
        }
        await shell.openExternal(parsed.toString());
        return ok({ geoeffnet: parsed.toString() });
      } catch (e) {
        return err('INVALID_INPUT', e instanceof Error ? e.message : String(e));
      }
    },
    revealPath: async (pfad: string): Promise<Result<unknown>> => {
      const sicher = jarvis!.system.resolveSafePath(pfad);
      if (!sicher.ok) return sicher;
      shell.showItemInFolder(sicher.data);
      return ok({ gezeigt: sicher.data });
    },
  });

  // Ereignisse des Kerns ans Fenster weiterreichen.
  ereignisAbmelden = jarvis.bus.onAny((ereignis) => {
    if (fenster && !fenster.isDestroyed()) {
      fenster.webContents.send(IPC_EVENT_CHANNEL, ereignis);
    }
  });
}

ipcMain.handle(IPC_COMMAND_CHANNEL, async (_event, command: Command) => {
  if (!handler) {
    return err('INTERNAL_ERROR', 'Der Kern ist noch nicht gestartet.');
  }
  if (!command || typeof command !== 'object' || typeof (command as Command).kind !== 'string') {
    return err('INVALID_INPUT', 'Ungültiger Befehl.');
  }
  return handler.handle(command);
});

function buildMenu(): void {
  const istMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(istMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Datei',
      submenu: [
        {
          label: 'Datenverzeichnis öffnen',
          click: () => {
            if (jarvis) void shell.openPath(jarvis.paths.dataDir);
          },
        },
        { type: 'separator' },
        istMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: 'Hilfe',
      submenu: [
        {
          label: 'Über JARVIS',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: 'JARVIS',
              message: 'JARVIS – persönlicher Desktop-Assistent',
              detail:
                `Version ${app.getVersion()}\n\n` +
                'Alle Daten liegen lokal. E-Mails werden ausschließlich nach ausdrücklicher Freigabe versendet.',
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Nur eine Instanz -- sonst greifen zwei Prozesse auf dieselbe Datenbank zu.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (fenster) {
      if (fenster.isMinimized()) fenster.restore();
      fenster.focus();
    }
  });

  void app.whenReady().then(() => {
    try {
      startCore();
    } catch (e) {
      const meldung = e instanceof Error ? e.message : String(e);
      // Auch auf stderr: wer aus dem Terminal startet, soll den Grund sehen
      // und nicht nur ein Fenster, das sich sofort wieder schliesst.
      console.error('[jarvis] Der Kern liess sich nicht starten:', e);
      void dialog.showMessageBox({
        type: 'error',
        title: 'JARVIS konnte nicht starten',
        message: 'Der Kern ließ sich nicht starten.',
        detail: meldung,
      });
      app.quit();
      return;
    }

    fenster = createWindow();
    applyContentSecurityPolicy(fenster);
    buildMenu();

    fenster.on('closed', () => {
      fenster = null;
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        fenster = createWindow();
        applyContentSecurityPolicy(fenster);
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  ereignisAbmelden?.();
  jarvis?.close();
  jarvis = null;
});

// Damit ein unerwarteter Fehler nicht stumm bleibt.
process.on('uncaughtException', (e) => {
  console.error('[jarvis] Unbehandelter Fehler im Hauptprozess:', e);
  if (fenster && !fenster.isDestroyed()) {
    fenster.webContents.send(IPC_EVENT_CHANNEL, {
      name: 'error',
      payload: { message: `Unerwarteter Fehler: ${e.message}` },
    });
  }
});
