import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Mirrors Electron's `app.getPath('userData')` for the product name in
 * package.json, so the command-line tools read and write the same database the
 * app uses. `JARVIS_DATA_DIR` overrides it (handy for a portable install).
 */
export function resolveDataDir(productName = 'JARVIS') {
  if (process.env.JARVIS_DATA_DIR) return process.env.JARVIS_DATA_DIR;
  switch (process.platform) {
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', productName);
    case 'win32':
      return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), productName);
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), productName);
  }
}

export function databaseFile(productName = 'JARVIS') {
  return join(resolveDataDir(productName), 'jarvis.db');
}
