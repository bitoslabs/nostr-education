import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Browser ESM trees copied verbatim from node_modules. The import map in
// index.html points bare specifiers at these files, so the app runs with no CDN
// and no bundler. Regenerate with `npm run vendor` after a dependency change.
const copies = [
  ['node_modules/vanjs-core/src/van.js', 'vendor/vanjs-core/van.js'],
  ['node_modules/nostr-tools/lib/esm', 'vendor/nostr-tools'],
  ['node_modules/@noble/curves', 'vendor/@noble/curves'],
  ['node_modules/@noble/hashes', 'vendor/@noble/hashes'],
  ['node_modules/@noble/ciphers', 'vendor/@noble/ciphers'],
  ['node_modules/@scure/base', 'vendor/@scure/base'],
];

await rm(resolve(root, 'vendor'), { recursive: true, force: true });

for (const [from, to] of copies) {
  const target = resolve(root, to);
  await mkdir(dirname(target), { recursive: true });
  await cp(resolve(root, from), target, { recursive: true });
}

// Precache manifest for sw.js: the app shell plus the whole module graph, so a
// single online visit is enough to serve the app with no network afterwards.
const walk = async (dir, filter) => {
  const entries = await readdir(resolve(root, dir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path, filter)));
    else if (filter(entry.name)) files.push(`./${path.split('\\').join('/')}`);
  }
  return files;
};

const assets = [
  './index.html',
  './manifest.webmanifest',
  ...(await walk('assets', (name) => /\.(png|svg|ico|webmanifest)$/i.test(name))),
  ...(await walk('src', (name) => name.endsWith('.js') || name.endsWith('.css'))),
  ...(await walk('vendor', (name) => name.endsWith('.js'))),
];

const manifest = { version: Date.now().toString(36), assets };
await writeFile(resolve(root, 'vendor/precache.json'), JSON.stringify(manifest) + '\n');

console.log(`vendored ${copies.length} package trees and ${assets.length} precache assets into vendor/`);
