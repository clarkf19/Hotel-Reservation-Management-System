// Creates server/.env from .env.example with a freshly generated JWT secret (never overwrites an existing .env).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'server', '.env');
if (fs.existsSync(target)) {
  console.log('[setup] server/.env already exists — left unchanged.');
} else {
  const template = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  fs.writeFileSync(target, template.replace('replace-with-a-long-random-string', crypto.randomBytes(48).toString('hex')));
  console.log('[setup] Created server/.env with a random JWT secret.');
}
console.log('[setup] Next: "npm run db" (terminal 1), then "npm run db:setup", "npm run api" (terminal 2), "npm run web" (terminal 3).');
