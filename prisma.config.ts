import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { fileURLToPath } from 'node:url';
const rawUrl =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  'postgresql://USER:PASSWORD@HOST:5432/DATABASE';
function migrationUrl() {
  const url = new URL(rawUrl);
  if (url.hostname.endsWith('.pooler.supabase.com') || url.hostname.endsWith('.supabase.co')) {
    url.searchParams.set('sslmode', 'require');
    url.searchParams.set('sslaccept', 'strict');
    url.searchParams.set(
      'sslcert',
      fileURLToPath(new URL('./apps/api/certs/supabase-ca.crt', import.meta.url)),
    );
  }
  return url.href;
}
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --tsconfig apps/api/tsconfig.json prisma/seed.ts',
  },
  datasource: {
    url: migrationUrl(),
  },
});
