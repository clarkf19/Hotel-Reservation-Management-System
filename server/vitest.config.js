import { defineConfig } from 'vitest/config';
import fs from 'node:fs';

// Tests always run against the separate hrms_test database (never the development data).
function readEnv() {
  try {
    return Object.fromEntries(
      fs.readFileSync(new URL('./.env', import.meta.url), 'utf8').split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }),
    );
  } catch { return {}; }
}
const fileEnv = readEnv();
const testDb = process.env.TEST_DATABASE_URL || fileEnv.TEST_DATABASE_URL || 'postgresql://hrms:hrms_local_dev@localhost:5433/hrms_test?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/globalSetup.js',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDb,
      JWT_SECRET: 'test-secret-only-used-by-automated-tests',
      ANTHROPIC_API_KEY: '',
      MOCK_GATEWAY_LEDGER: new URL('./.data/mock-gateway-ledger.test.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
    },
  },
});
