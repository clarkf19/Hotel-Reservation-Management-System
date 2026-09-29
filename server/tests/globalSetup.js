/** Prepares the hrms_test database once per test run: apply migrations, then load the deterministic demo seed. */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function setup({ config }) {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const env = { ...process.env, ...config.env };
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('node prisma/seed.js', { cwd, env, stdio: 'pipe' });
}
