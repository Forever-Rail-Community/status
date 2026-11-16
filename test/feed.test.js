import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderFeed, loadFeed } from '../lib/feed.js';
import { createHandler } from '../lib/handler.js';
import { respondXml } from '../lib/feed.js';
import { baseConfig } from './helpers.js';

const incident = {
  id: 7, title: 'Run8 <East> down', impact: 'major_outage', status: 'resolved', components: [],
  createdAt: '2026-11-01T10:00:00.000Z', resolvedAt: '2026-11-01T11:00:00.000Z',
  updates: [
    { id: 11, status: 'investigating', message: 'Looking into it & more', createdAt: '2026-11-01T10:00:00.000Z' },
    { id: 12, status: 'resolved', message: '', createdAt: '2026-11-01T11:00:00.000Z' },
  ],
};

test('one item per update, newest first, escaped, with stable guids', () => {
  const xml = renderFeed({ title: 'FR', siteUrl: 'https://s.example.com', incidents: [incident] });
  const items = xml.match(/<item>.*?<\/item>/g);
  assert.equal(items.length, 2);
  assert.match(items[0], /<title>Resolved: Run8 &lt;East&gt; down<\/title>/);
  assert.match(items[0], /<description>Resolved<\/description>/); // empty message falls back to the status
  assert.match(items[1], /Looking into it &amp; more/);
  assert.match(items[0], /<guid isPermaLink="false">https:\/\/s\.example\.com\/incidents\/7#update-12<\/guid>/);
  assert.match(items[0], /<pubDate>Sun, 01 Nov 2026 11:00:00 GMT<\/pubDate>/);
  assert.match(xml, /<lastBuildDate>Sun, 01 Nov 2026 11:00:00 GMT/);
});

test('an empty feed is still valid RSS', () => {
  const xml = renderFeed({ title: 'FR', siteUrl: 'https://s.example.com', incidents: [] });
  assert.match(xml, /^<\?xml/);
  assert.doesNotMatch(xml, /<item>|lastBuildDate/);
});

test('route: XML content type and the request origin when site.url is unset', async () => {
  const GET = createHandler(loadFeed, {
    cacheControl: 'public, s-maxage=60', requiresApiKey: false, respond: respondXml,
    config: baseConfig(), db: { query: async () => [] },
  });
  const res = await GET(new Request('https://preview.example.com/api/feed'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/rss+xml; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'public, s-maxage=60');
  assert.match(await res.text(), /<link>https:\/\/preview\.example\.com<\/link>/);
});
