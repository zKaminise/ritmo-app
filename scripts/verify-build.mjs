import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const dir = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const manifest = JSON.parse(await readFile(`${dir}/manifest.webmanifest`, 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/');
for (const icon of manifest.icons) {
  const buffer = await readFile(`${dir}${icon.src}`);
  const [width, height] = icon.sizes.split('x').map(Number);
  assert.equal(buffer.readUInt32BE(16), width);
  assert.equal(buffer.readUInt32BE(20), height);
}
const sw = await readFile(`${dir}/sw.js`, 'utf8');
const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
assert(
  list.some((p) => p.startsWith('/assets/')),
  'Service Worker deve precachear assets compilados.',
);
for (const path of list.filter((p) => p !== '/')) assert((await stat(`${dir}${path}`)).isFile());
assert(sw.includes('notificationclick'));
assert(sw.includes('showNotification'));
assert(sw.includes('setAppBadge'));
console.log(
  `PWA verificada: manifest, ${manifest.icons.length} ícones e ${list.length} arquivos no precache.`,
);
