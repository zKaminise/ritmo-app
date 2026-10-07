import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const { createApp } = await import('./bootstrap.js');
const app = await createApp();
await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
