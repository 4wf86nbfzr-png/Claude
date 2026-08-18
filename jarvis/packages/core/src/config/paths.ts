import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * Alle Daten liegen lokal. Standard ist ein Ordner im Benutzerverzeichnis,
 * ueberschreibbar mit JARVIS_DATA_DIR (Tests setzen das auf ein tmp-Verzeichnis).
 */
export interface JarvisPaths {
  dataDir: string;
  dbFile: string;
  secretsFile: string;
  keyFile: string;
  attachmentsDir: string;
  audioDir: string;
  cacheDir: string;
  logDir: string;
}

export function resolvePaths(dataDirOverride?: string): JarvisPaths {
  const dataDir = resolve(
    dataDirOverride ?? process.env.JARVIS_DATA_DIR ?? join(homedir(), '.jarvis'),
  );
  const paths: JarvisPaths = {
    dataDir,
    dbFile: join(dataDir, 'jarvis.db'),
    secretsFile: join(dataDir, 'secrets.enc.json'),
    keyFile: join(dataDir, 'secrets.key'),
    attachmentsDir: join(dataDir, 'attachments'),
    audioDir: join(dataDir, 'audio'),
    cacheDir: join(dataDir, 'cache'),
    logDir: join(dataDir, 'logs'),
  };
  return paths;
}

export function ensurePaths(paths: JarvisPaths): JarvisPaths {
  for (const dir of [
    paths.dataDir,
    paths.attachmentsDir,
    paths.audioDir,
    paths.cacheDir,
    paths.logDir,
  ]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return paths;
}
