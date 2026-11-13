import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  announceIncident,
  announcementPayload,
  readWebhookUrl,
  sendToWebhook,
} from '../lib/announcements.js';
import { resolveConfig } from '../lib/config.js';
import { baseConfig, quietly } from './helpers.js';

const WEBHOOK = 'https://discord.com/api/webhooks/123456789/abc_DEF-123';

const incident = (fields = {}) => ({
  id: 7,
  title: 'AGS route server unreachable',
  impact: 'major_outage',
  status: 'identified',
  components: ['site'],
  createdAt: '2026-11-13T20:00:00.000Z',
  resolvedAt: null,
  updates: [
    { id: 2, status: 'identified', message: 'Restarting the AGS instance.', createdAt: '2026-11-13T20:30:00.000Z' },
    { id: 1, status: 'investigating', message: 'Looking into it.', createdAt: '2026-11-13T20:00:00.000Z' },
  ],
  ...fields,
});

const names = new Map([['site', 'AGS Route']]);
const payloadFor = (fields, isNew = false) =>
  announcementPayload({ incident: incident(fields), isNew, names, siteUrl: 'https://status.example' });
const texts = (payload) => payload.components[0].components.filter((c) => c.type === 10).map((c) => c.content);

// ---------- webhook URL ----------

test('only real Discord webhook URLs turn announcements on', async () => {
  assert.equal(readWebhookUrl({ DISCORD_WEBHOOK_URL: WEBHOOK }), WEBHOOK);
  assert.equal(readWebhookUrl({ DISCORD_WEBHOOK_URL: ` ${WEBHOOK} ` }), WEBHOOK);
  assert.ok(readWebhookUrl({ DISCORD_WEBHOOK_URL: 'https://canary.discord.com/api/v10/webhooks/1/x' }));
  assert.equal(readWebhookUrl({}), null);
  await quietly(() => {
    assert.equal(readWebhookUrl({ DISCORD_WEBHOOK_URL: 'https://evil.example/api/webhooks/1/x' }), null);
    assert.equal(readWebhookUrl({ DISCORD_WEBHOOK_URL: 'http://discord.com/api/webhooks/1/x' }), null);
  });
});

// ---------- message ----------

test('payload is a Components V2 message: flag set, no content or embeds, no pings', () => {
  const payload = payloadFor();
  assert.equal(payload.flags, 1 << 15);
  assert.equal('content' in payload, false);
  assert.equal('embeds' in payload, false);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });

  const [container] = payload.components;
  assert.equal(container.type, 17);
  assert.deepEqual(container.components.map((c) => c.type), [10, 10, 10, 14, 10]);
});

test('payload content: title, status line, latest message, footer', () => {
  const [title, status, message, footer] = texts(payloadFor());
  assert.equal(title, '## AGS route server unreachable');
  assert.equal(status, '**Identified** · Major outage');
  assert.equal(message, 'Restarting the AGS instance.');
  assert.equal(footer, `-# Affects AGS Route · <t:${Date.parse('2026-11-13T20:30:00Z') / 1000}:f> · [View incident](https://status.example/incidents/7)`);
});

test('new incidents say so; no components reads "All services"', () => {
  const [, status, , footer] = texts(payloadFor({ status: 'investigating', components: [], updates: incident().updates.slice(1) }, true));
  assert.equal(status, '**New incident** · Investigating · Major outage');
  assert.match(footer, /^-# Affects All services/);
});

test('sidebar colour follows impact, and turns green when resolved', () => {
  const color = (fields) => payloadFor(fields).components[0].accent_color;
  assert.equal(color({ impact: 'major_outage' }), 0xef4444);
  assert.equal(color({ impact: 'degraded' }), 0xeab308);
  assert.equal(color({ impact: 'maintenance' }), 0x3b82f6);
  assert.equal(color({ status: 'resolved', resolvedAt: '2026-11-13T21:00:00.000Z' }), 0x22c55e);
});

test('long titles and messages are truncated', () => {
  const long = incident({ title: 't'.repeat(500) });
  long.updates[0] = { ...long.updates[0], message: 'm'.repeat(5000) };
  const [title, , message] = texts(announcementPayload({ incident: long, isNew: false, names, siteUrl: 'https://s' }));
  assert.equal(title.length, '## '.length + 200);
  assert.equal(message.length, 1800);
  assert.ok(message.endsWith('…'));
});

// ---------- sending ----------

test('sendToWebhook posts JSON with with_components=true and wait=true', async () => {
  let call;
  const fetchImpl = async (url, init) => {
    call = { url: new URL(url), init };
    return Response.json({ id: '1' });
  };
  await sendToWebhook(WEBHOOK, { flags: 32768 }, fetchImpl);

  assert.equal(call.url.searchParams.get('with_components'), 'true');
  assert.equal(call.url.searchParams.get('wait'), 'true');
  assert.equal(call.init.method, 'POST');
  assert.deepEqual(JSON.parse(call.init.body), { flags: 32768 });

  await assert.rejects(sendToWebhook(WEBHOOK, {}, async () => new Response('bad', { status: 400 })), /responded 400/);
});

// ---------- announceIncident ----------

// A db stub that returns one incident row the way the incidents query does.
const dbWith = (row) => ({ query: async () => [row] });
const row = {
  id: 7, title: 'T', impact: 'degraded', status: 'investigating', components: ['site'],
  created_at: new Date('2026-11-13T20:00:00Z'), resolved_at: null,
  updates: [{ id: 1, status: 'investigating', message: 'M', author: 'Dalton', createdAt: '2026-11-13T20:00:00Z' }],
};
const config = resolveConfig(baseConfig());
const common = { config, id: 7, isNew: true, siteUrl: 'https://status.example' };

test('announceIncident: off without a webhook, skipped when unticked', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return Response.json({}); };
  assert.equal(await announceIncident({ ...common, db: dbWith(row), announce: true, env: {}, fetchImpl }), 'off');
  assert.equal(await announceIncident({ ...common, db: dbWith(row), announce: false, env: { DISCORD_WEBHOOK_URL: WEBHOOK }, fetchImpl }), 'skipped');
  assert.equal(called, false);
});

test('announceIncident: sent on success, failed (not thrown) when Discord errors', async () => {
  const env = { DISCORD_WEBHOOK_URL: WEBHOOK };
  let body;
  const ok = async (url, init) => { body = JSON.parse(init.body); return Response.json({}); };
  assert.equal(await announceIncident({ ...common, db: dbWith(row), announce: true, env, fetchImpl: ok }), 'sent');
  assert.match(JSON.stringify(body), /Affects Site/);
  assert.doesNotMatch(JSON.stringify(body), /Dalton/); // authors stay private

  const down = async () => new Response('nope', { status: 503 });
  const result = await quietly(() => announceIncident({ ...common, db: dbWith(row), announce: true, env, fetchImpl: down }));
  assert.equal(result, 'failed');
});
