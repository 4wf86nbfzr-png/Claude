import { app, BrowserWindow, clipboard, safeStorage, shell, session } from 'electron';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Kernel } from '../core/kernel';
import type { Encryptor } from '../core/services/credentials';
import { registriereIpc } from './ipc';

/** Zugangsdaten-Tresor über den Schlüsselbund des Betriebssystems. */
class SafeStorageEncryptor implements Encryptor {
  readonly label = 'Schlüsselbund des Betriebssystems';
  available(): boolean {
    return safeStorage.isEncryptionAvailable();
  }
  encrypt(plain: string): Buffer {
    return safeStorage.encryptString(plain);
  }
  decrypt(data: Buffer): string {
    return safeStorage.decryptString(data);
  }
}

let fenster: BrowserWindow | null = null;
let kernel: Kernel | null = null;

const entwicklungsServer = process.env.JARVIS_DEV_SERVER ?? null;

function erlaubteVerzeichnisse(): string[] {
  const heim = homedir();
  return [
    join(heim, 'Documents'),
    join(heim, 'Dokumente'),
    join(heim, 'Downloads'),
    join(heim, 'Desktop'),
    join(heim, 'Schreibtisch')
  ];
}

function erstelleFenster(): void {
  fenster = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#050506',
    title: 'JARVIS',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      // Sicherheitsgrundstellung: kein Node im Fenster, getrennte Welten.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true
    }
  });

  fenster.once('ready-to-show', () => fenster?.show());
  fenster.on('closed', () => {
    fenster = null;
  });

  // Links nach außen öffnet der Standardbrowser, nicht die App.
  fenster.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  fenster.webContents.on('will-navigate', (event, url) => {
    const erlaubt = entwicklungsServer && url.startsWith(entwicklungsServer);
    if (!erlaubt) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  if (entwicklungsServer) {
    void fenster.loadURL(entwicklungsServer);
    fenster.webContents.openDevTools({ mode: 'detach' });
  } else {
    void fenster.loadFile(join(__dirname, '..', '..', 'renderer', 'index.html'));
  }
}

function haerteSitzung(): void {
  const sitzung = session.defaultSession;

  // Nur das Mikrofon wird gebraucht – alles andere wird abgelehnt.
  sitzung.setPermissionRequestHandler((_webContents, berechtigung, erlauben) => {
    erlauben(berechtigung === 'media');
  });
  sitzung.setPermissionCheckHandler((_webContents, berechtigung) => berechtigung === 'media');

  sitzung.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          entwicklungsServer
            ? // Im Entwicklungsbetrieb braucht Vite eval und den lokalen Server.
              "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http://localhost:5273 ws://localhost:5273"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data: blob:; connect-src 'self'"
        ]
      }
    });
  });
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

app.whenReady().then(() => {
  haerteSitzung();
  try {
    kernel = Kernel.create({
      encryptor: new SafeStorageEncryptor(),
      clipboard: {
        schreiben: (text: string) => clipboard.writeText(text),
        lesen: () => clipboard.readText()
      },
      zusaetzlicheWurzeln: erlaubteVerzeichnisse(),
      envDatei: join(app.getPath('userData'), '.env')
    });
  } catch (error) {
    // Ohne Kern hat das Fenster keinen Zweck – Fehler sichtbar machen.
    console.error('JARVIS konnte nicht starten:', error);
    app.exit(1);
    return;
  }

  registriereIpc(kernel, () => fenster);
  erstelleFenster();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) erstelleFenster();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  kernel?.audit.log('JARVIS beendet', { actor: 'SYSTEM', status: 'INFO' });
  kernel?.close();
  kernel = null;
});
