import { app, BrowserWindow, shell, session } from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { JarvisEvent } from '../shared/types.js';
import { IPC } from '../shared/ipc.js';
import { createRuntime, type JarvisRuntime } from '../core/runtime.js';
import { createSecretBox } from './secretBox.js';
import { createSystemBridge } from './systemBridge.js';
import { registerIpc } from './ipc.js';

// The main process is bundled to CommonJS, so __dirname is the dist/main folder.
const here = __dirname;
const devServerUrl = process.env.JARVIS_DEV_SERVER_URL;

let runtime: JarvisRuntime | null = null;
let mainWindow: BrowserWindow | null = null;

/** One instance only — two processes on one SQLite file invite corruption. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function broadcast(event: JarvisEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.event, event);
  }
}

function hardenSession(): void {
  const target = session.defaultSession;

  // Content Security Policy. `unsafe-inline` for styles is required by the
  // renderer's inline critical CSS; scripts stay strictly self-hosted.
  target.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "media-src 'self' blob: data:",
            "font-src 'self'",
            // The renderer never talks to the network itself; everything goes
            // through IPC into the main process.
            "connect-src 'self'",
            "form-action 'none'",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "base-uri 'none'",
          ].join('; '),
        ],
      },
    });
  });

  // The microphone is the only device permission the app may ever get, and
  // only when speech input is switched on.
  target.setPermissionRequestHandler((_contents, permission, callback) => {
    const voice = runtime?.services.settings.get().voice;
    const wantsMicrophone = permission === 'media' && voice?.sttProvider !== 'off';
    callback(Boolean(wantsMicrophone));
  });

  target.setPermissionCheckHandler((_contents, permission) => {
    const voice = runtime?.services.settings.get().voice;
    return permission === 'media' && voice?.sttProvider !== 'off';
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#05060A',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    // Smoke test for CI: boot the whole stack, prove the window rendered,
    // optionally save a screenshot, then quit.
    if (process.env.JARVIS_SMOKE_TEST === '1') {
      const shot = process.env.JARVIS_SMOKE_SHOT;
      setTimeout(() => {
        void (async () => {
          if (shot && mainWindow) {
            const image = await mainWindow.webContents.capturePage();
            await writeFile(shot, image.toPNG());
          }
          console.log('JARVIS_SMOKE_OK');
          app.quit();
        })();
      }, 1200);
    }
  });

  // Navigation stays inside the app; anything else opens in the real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('file://');
    if (!allowed) {
      event.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(join(here, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // JARVIS_DATA_DIR keeps the command-line tools, a portable install and the
  // app pointed at the same database.
  const dataDir = process.env.JARVIS_DATA_DIR || app.getPath('userData');

  runtime = createRuntime({
    dataDir,
    secretBox: createSecretBox(dataDir),
    systemBridge: createSystemBridge(),
    emit: broadcast,
  });

  runtime.services.audit.log({
    actor: 'system',
    action: 'anwendung.gestartet',
    outcome: 'info',
    detail: `Version ${app.getVersion()}, Datenbank ${runtime.db.driver}, Schlüsselspeicher ${runtime.services.credentials.boxName}`,
  });

  hardenSession();
  registerIpc(runtime);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  runtime?.services.audit.log({ actor: 'system', action: 'anwendung.beendet', outcome: 'info' });
  runtime?.close();
  runtime = null;
});

// Never let a renderer attach a debugger or open arbitrary web content.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});
