import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export const alias = {
  '@jarvis/domain': r('./packages/domain/src/index.ts'),
  '@jarvis/security': r('./packages/security/src/index.ts'),
  '@jarvis/observability': r('./packages/observability/src/index.ts'),
  '@jarvis/storage': r('./packages/storage/src/index.ts'),
  '@jarvis/approval-engine': r('./packages/approval-engine/src/index.ts'),
  '@jarvis/connectors': r('./packages/connectors/src/index.ts'),
  '@jarvis/speech': r('./packages/speech/src/index.ts'),
  '@jarvis/testkit': r('./packages/testkit/src/index.ts'),
  '@jarvis/telephony': r('./apps/telephony/src/index.ts'),
  '@jarvis/orchestrator': r('./apps/orchestrator/src/index.ts'),
  '@jarvis/connector-worker': r('./apps/connector-worker/src/index.ts'),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
        },
      },
    ],
  },
});
