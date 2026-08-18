import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(here, 'src/shared'),
      '@core': resolve(here, 'src/core'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // node:sqlite is experimental in Node 22 and prints a warning per process.
    silent: false,
    testTimeout: 20_000,
  },
});
