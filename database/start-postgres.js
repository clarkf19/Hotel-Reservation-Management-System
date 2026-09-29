/**
 * Starts a real PostgreSQL 18 server for local development.
 *
 * IMPLEMENTATION DECISION: PostgreSQL is not installed on the development
 * machine and Docker Desktop is optional, so the database runs from the
 * `embedded-postgres` npm package (official PostgreSQL binaries). The data
 * directory lives in ./pgdata and survives restarts.
 *
 *   npm start          -> start (initialising the cluster on first run)
 *   npm run reset      -> delete all data and start from an empty cluster
 */
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, 'pgdata');
const PORT = Number(process.env.PGPORT || 5433);
const USER = process.env.PGUSER || 'hrms';
const PASSWORD = process.env.PGPASSWORD || 'hrms_local_dev';
const DATABASES = ['hrms', 'hrms_test'];

if (process.argv.includes('--reset') && fs.existsSync(dataDir)) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('[db] Removed existing data directory');
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  // UTF-8 regardless of the Windows locale (guest names, ₹ symbols, etc.)
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: (e) => console.error('[db]', String(e).trim()),
});

const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
if (firstRun) {
  console.log('[db] Initialising new PostgreSQL cluster...');
  await pg.initialise();
}
await pg.start();

for (const name of DATABASES) {
  try {
    await pg.createDatabase(name);
    console.log(`[db] Created database "${name}"`);
  } catch {
    // already exists
  }
}

console.log(`[db] PostgreSQL running on localhost:${PORT} (user "${USER}")`);
console.log('[db] Press Ctrl+C to stop.');

const shutdown = async () => {
  console.log('\n[db] Stopping PostgreSQL...');
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
