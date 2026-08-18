import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/database.js';
import { createRepositories, type Repositories } from '../src/db/repos/index.js';

export interface TestEnv {
  repos: Repositories;
  dir: string;
  dispose(): void;
}

/** Frische Datenbank in einem temporaeren Verzeichnis. */
export function makeTestDb(): TestEnv {
  const dir = mkdtempSync(join(tmpdir(), 'jarvis-test-'));
  const db = openDatabase({ file: join(dir, 'test.db') });
  const repos = createRepositories(db);
  return {
    repos,
    dir,
    dispose() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
