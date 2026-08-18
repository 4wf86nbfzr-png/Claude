import { execFile } from 'node:child_process';
import { app, clipboard, shell } from 'electron';
import type { JarvisError, Result } from '../shared/types.js';
import { err, makeError, ok } from '../shared/types.js';
import type { SystemBridge } from '../core/agents/SystemAgent.js';

/**
 * Application names are passed to the OS launcher as a single argument (never
 * through a shell), and anything that could change the meaning of a command
 * line is rejected outright.
 */
const SAFE_APP_NAME = /^[\p{L}\p{N} ._+-]{1,64}$/u;

export function createSystemBridge(): SystemBridge {
  return {
    platform: process.platform,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unbekannt',

    async openExternal(url: string): Promise<void> {
      await shell.openExternal(url);
    },

    async openPath(path: string): Promise<string> {
      return shell.openPath(path);
    },

    writeClipboard(text: string): void {
      clipboard.writeText(text);
    },

    readClipboard(): string {
      return clipboard.readText();
    },

    async launchApplication(name: string): Promise<Result<string, JarvisError>> {
      const trimmed = name.trim();
      if (!SAFE_APP_NAME.test(trimmed)) {
        return err(
          makeError(
            'system.unsafe_name',
            `„${name}" ist kein zulässiger Programmname.`,
            { hint: 'Nur Buchstaben, Ziffern, Leerzeichen, Punkt, Unterstrich, Plus und Bindestrich.' },
          ),
        );
      }

      const command = launchCommand(process.platform, trimmed);
      if (!command) {
        return err(
          makeError('system.unsupported_platform', `Programmstart wird auf ${process.platform} nicht unterstützt.`),
        );
      }

      return new Promise((resolve) => {
        execFile(command.file, command.args, { timeout: 15_000 }, (error, _stdout, stderr) => {
          if (error) {
            resolve(
              err(
                makeError('system.launch_failed', `„${trimmed}" konnte nicht gestartet werden.`, {
                  detail: (stderr || error.message).slice(0, 300),
                  hint: 'Heißt das Programm auf diesem System genau so?',
                }),
              ),
            );
            return;
          }
          resolve(ok(`${trimmed} wurde gestartet.`));
        });
      });
    },
  };
}

function launchCommand(platform: NodeJS.Platform, name: string): { file: string; args: string[] } | null {
  switch (platform) {
    case 'darwin':
      return { file: 'open', args: ['-a', name] };
    case 'win32':
      // `start` is a cmd builtin; the empty string is the mandatory window title.
      return { file: 'cmd', args: ['/c', 'start', '', name] };
    case 'linux':
      return { file: 'gtk-launch', args: [name] };
    default:
      return null;
  }
}
