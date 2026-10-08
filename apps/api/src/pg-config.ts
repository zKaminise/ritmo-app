import { readFileSync } from 'node:fs';
import type { PoolConfig } from 'pg';
export function postgresConfig(connectionString: string): PoolConfig {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Conexão PostgreSQL inválida.');
  }
  if (url.hostname.endsWith('.pooler.supabase.com') || url.hostname.endsWith('.supabase.co')) {
    for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat'])
      url.searchParams.delete(key);
    return {
      connectionString: url.href,
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(new URL('../certs/supabase-ca.crt', import.meta.url), 'utf8'),
      },
    };
  }
  return { connectionString };
}
