import { parse } from 'dotenv';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { postgresConfig } from '../apps/api/dist/pg-config.js';
const env = parse(await readFile('work/deployment.env', 'utf8'));
const appUrl = process.env.DEPLOYMENT_APP_URL || env.APP_URL;
if (!appUrl?.startsWith('https://') || !env.CRON_SECRET)
  throw new Error(
    'Configure DEPLOYMENT_APP_URL com a URL HTTPS definitiva e o segredo do agendador.',
  );
const client = new pg.Client({
  ...postgresConfig(env.DIRECT_URL || env.DATABASE_URL),
  connectionTimeoutMillis: 10000,
});
try {
  await client.connect();
  await client.query('CREATE EXTENSION IF NOT EXISTS pg_cron');
  await client.query('CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions');
  await client.query('CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault');
  for (const [name, value] of [
    ['ritmo_app_url', new URL(appUrl).origin],
    ['ritmo_cron_secret', env.CRON_SECRET],
  ]) {
    const result = await client.query('SELECT id FROM vault.secrets WHERE name=$1', [name]);
    if (result.rowCount)
      await client.query('SELECT vault.update_secret($1,$2,$3)', [result.rows[0].id, value, name]);
    else await client.query('SELECT vault.create_secret($1,$2)', [value, name]);
  }
  const command = `SELECT net.http_post(url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ritmo_app_url') || '/api/internal/scheduler',headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ritmo_cron_secret')),body := '{}'::jsonb,timeout_milliseconds := 120000);`;
  await client.query('SELECT cron.schedule($1,$2,$3)', ['ritmo-reminders', '* * * * *', command]);
  const job = await client.query('SELECT jobid,schedule,active FROM cron.job WHERE jobname=$1', [
    'ritmo-reminders',
  ]);
  console.log(JSON.stringify({ configured: true, job: job.rows[0], secretsStoredInVault: true }));
} finally {
  await client.end();
}
