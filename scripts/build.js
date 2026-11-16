// Builds the site Vercel serves: copies public/ to dist/ and writes each page's
// <head> tags (title, link previews, favicon) from status.config.js.
// Runs on every deploy (vercel.json → buildCommand). Locally: npm run build.

import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import rawConfig from '../status.config.js';
import { resolveConfig } from '../lib/config.js';
import { PAGES, applyHead } from '../lib/site-meta.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = `${root}public`;
const output = `${root}dist`;

const config = resolveConfig(rawConfig); // a config mistake fails the deploy, not the live page

await rm(output, { recursive: true, force: true });
await cp(source, output, { recursive: true });

for (const [file, page] of Object.entries(PAGES)) {
  const path = `${output}/${file}`;
  await writeFile(path, applyHead(await readFile(path, 'utf8'), config, page));
}

console.log(`Built ${Object.keys(PAGES).length} pages into dist/`);
