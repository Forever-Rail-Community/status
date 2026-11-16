import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '../lib/config.js';
import { PAGES, applyHead, headTags } from '../lib/site-meta.js';
import { baseConfig } from './helpers.js';

const config = (site) => resolveConfig({ ...baseConfig(), title: 'FR "Status"', notice: 'Live <status>', site });
const home = PAGES['index.html'];

test('link preview tags use the config, escaped', () => {
  const { title, tags } = headTags(config({ url: 'https://s.example.com', image: '/p.png', favicon: '/f.png' }), home);
  assert.equal(title, 'FR "Status"');
  assert.match(tags, /<meta property="og:title" content="FR &quot;Status&quot;">/);
  assert.match(tags, /<meta name="description" content="Live &lt;status&gt;">/);
  assert.match(tags, /og:image" content="https:\/\/s\.example\.com\/p\.png"/);
  assert.match(tags, /og:url" content="https:\/\/s\.example\.com"/);
  assert.match(tags, /twitter:card" content="summary_large_image"/);
  assert.match(tags, /<link rel="icon" href="\/f\.png">/);
  assert.match(tags, /application\/rss\+xml/);
});

test('without site.url there is no image or URL (previews need full addresses)', () => {
  const { tags } = headTags(config({ image: '/p.png' }), home);
  assert.doesNotMatch(tags, /og:image|og:url/);
  assert.match(tags, /twitter:card" content="summary"/);
  assert.match(headTags(config({ image: 'https://cdn.example.com/p.png' }), home).tags, /og:image" content="https:\/\/cdn/);
});

test('page titles and paths; admin gets only the favicon', () => {
  const c = config({ url: 'https://s.example.com', favicon: '/f.png' });
  assert.equal(headTags(c, PAGES['history/index.html']).title, 'History · FR "Status"');
  assert.match(headTags(c, PAGES['history/index.html']).tags, /og:url" content="https:\/\/s\.example\.com\/history"/);
  const admin = headTags(c, PAGES['admin/index.html']);
  assert.equal(admin.tags, '<link rel="icon" href="/f.png">');
});

test('applyHead fills the title and marker, and refuses pages without the marker', () => {
  const html = applyHead('<head><title>x</title>\n  <!-- build:head -->\n</head>', config({}), home);
  assert.match(html, /<title>FR &quot;Status&quot;<\/title>/);
  assert.doesNotMatch(html, /build:head/);
  assert.throws(() => applyHead('<head><title>x</title></head>', config({}), home), /build:head/);
});

test('every listed page in public/ has the marker', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of Object.keys(PAGES)) {
    assert.match(await readFile(new URL(`../public/${file}`, import.meta.url), 'utf8'), /<!-- build:head -->/, file);
  }
});
