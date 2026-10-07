import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const dir = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const assets = (await readdir(`${dir}/assets`))
  .filter((f) => !f.endsWith('.map'))
  .map((f) => `/assets/${f}`);
const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 12);
const sw = await readFile(`${dir}/sw.js`, 'utf8');
await writeFile(
  `${dir}/sw.js`,
  sw
    .replace(
      /const PRECACHE = \[[\s\S]*?\];/,
      `const PRECACHE = ${JSON.stringify(['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', ...assets])};`,
    )
    .replace('ritmo-shell-v1', `ritmo-shell-${version}`),
);
console.log(`Service Worker: ${assets.length} assets no cache · ${version}`);
