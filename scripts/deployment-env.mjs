import { parse } from 'dotenv';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const local = parse(await readFile('.env', 'utf8'));
const remote = parse(await readFile('work/remote.env', 'utf8'));
const old = await readFile('work/deployment.env', 'utf8')
  .then(parse)
  .catch(() => ({}));
const verifiedUrl = (value) => {
  const url = new URL(value);
  url.searchParams.set('sslmode', 'verify-full');
  return url.href;
};
const env = {
  DATABASE_URL: verifiedUrl(remote.POSTGRES_URL),
  DIRECT_URL: verifiedUrl(remote.POSTGRES_URL_NON_POOLING),
  NODE_ENV: 'production',
  PORT: '3000',
  SCHEDULER_MODE: 'external',
  DB_POOL_MAX: '3',
  SESSION_DAYS: '30',
  CRON_SECRET: old.CRON_SECRET || randomBytes(32).toString('base64url'),
  VAPID_PUBLIC_KEY: local.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: local.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: local.VAPID_SUBJECT,
};
for (const key of [
  'DATABASE_URL',
  'DIRECT_URL',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'CRON_SECRET',
])
  if (!env[key]) throw new Error(`Configure ${key} antes do deploy.`);
await writeFile(
  'work/deployment.env',
  Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n',
);
console.log(
  'Variáveis de deploy preparadas em arquivo ignorado pelo Git. Nenhum segredo foi exibido.',
);
