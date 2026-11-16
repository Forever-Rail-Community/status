// Admin API: access control with a stub database, then the full flow against
// real Postgres when TEST_DATABASE_URL is set.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { adminRoutes } from '../lib/admin.js';
import { incidentHandlers, sessionHandlers, updateHandlers } from '../lib/admin-incidents.js';
import { sessionCookie } from '../lib/auth/session.js';
import { migrate } from '../lib/db.js';
import { authEnv, baseConfig, quietly } from './helpers.js';

const ORIGIN = 'https://status.example';
const signedIn = sessionCookie({ id: '111', name: 'Dalton' }, authEnv.SESSION_SECRET).split(';')[0];

function request(method, path, { body, cookie = signedIn, origin = ORIGIN } = {}) {
  const headers = { cookie };
  if (origin) headers.origin = origin;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const routes = (handlers, db, env = authEnv, fetchImpl) => adminRoutes(handlers, { config: baseConfig(), db, env, fetchImpl });
const stubDb = { query: async () => [] };

// ---------- access control ----------

test('not configured → 503; not signed in → 401; missing database → 503', async () => {
  assert.equal((await routes(sessionHandlers, stubDb, {}).GET(request('GET', '/api/admin/session'))).status, 503);
  const signedOut = await routes(sessionHandlers, stubDb).GET(request('GET', '/api/admin/session', { cookie: '' }));
  assert.equal(signedOut.status, 401);
  // The sign-in screen still gets the title and theme (public settings only).
  assert.deepEqual((await signedOut.json()).page, { title: 'Test', theme: 'dark', accent: null });
  assert.equal((await routes(sessionHandlers, null).GET(request('GET', '/api/admin/session'))).status, 503);
});

test('session lists components and choices for the form', async () => {
  const res = await routes(sessionHandlers, stubDb).GET(request('GET', '/api/admin/session'));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(body.user, { id: '111', name: 'Dalton' });
  assert.deepEqual(body.groups[0].components.map((c) => c.id), ['site', 'support']);
  assert.ok(body.impacts.includes('major_outage'));
  assert.deepEqual(body.templates, []);
  assert.equal(body.discord, false);

  const withWebhook = { ...authEnv, DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/tok' };
  const on = await routes(sessionHandlers, stubDb, withWebhook).GET(request('GET', '/api/admin/session'));
  assert.equal((await on.json()).discord, true);
});

test('writes need same origin, valid JSON and valid fields', async () => {
  const { POST } = routes(incidentHandlers, stubDb);
  const valid = { title: 'x', impact: 'degraded', status: 'investigating', message: 'm' };

  assert.equal((await POST(request('POST', '/api/admin/incidents', { body: valid, origin: 'https://evil.example' }))).status, 403);
  assert.equal((await POST(request('POST', '/api/admin/incidents', { body: valid, origin: null }))).status, 403);
  assert.equal((await POST(request('POST', '/api/admin/incidents', { body: '{nope' }))).status, 400);

  const bad = await POST(request('POST', '/api/admin/incidents', { body: { ...valid, components: ['ghost'] } }));
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /unknown components/);
});

test('bad ids are 404; unexpected errors are a generic 500', async () => {
  const { DELETE } = routes(incidentHandlers, stubDb);
  assert.equal((await DELETE(request('DELETE', '/api/admin/incidents?id=abc'))).status, 404);

  const broken = { query: async () => { throw new Error('connection refused: secret-host'); } };
  const res = await quietly(() => routes(incidentHandlers, broken).GET(request('GET', '/api/admin/incidents')));
  assert.equal(res.status, 500);
  assert.doesNotMatch(await res.text(), /secret-host/);
});

// ---------- full flow on real Postgres ----------

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';
let client;
const db = { query: async (text, params) => (await client.query(text, params)).rows };

before(async () => {
  if (skip) return;
  client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('drop table if exists incident_updates, incidents');
  await migrate(db);
});
after(async () => client?.end());

test('create → update → edit → resolve → delete through the API', { skip }, async () => {
  const incidents = routes(incidentHandlers, db);
  const updates = routes(updateHandlers, db);
  const list = async () => (await (await incidents.GET(request('GET', '/api/admin/incidents'))).json()).incidents;

  const created = await incidents.POST(request('POST', '/api/admin/incidents', {
    body: { title: 'SE route down', impact: 'major_outage', status: 'investigating', components: ['site'], message: 'Looking' },
  }));
  assert.equal(created.status, 201);
  const { id } = await created.json();

  assert.equal((await updates.POST(request('POST', `/api/admin/incident-updates?id=${id}`, {
    body: { status: 'identified', message: 'Host rebooted' },
  }))).status, 201);

  assert.equal((await incidents.PATCH(request('PATCH', `/api/admin/incidents?id=${id}`, {
    body: { impact: 'partial_outage' },
  }))).status, 200);

  await updates.POST(request('POST', `/api/admin/incident-updates?id=${id}`, { body: { status: 'resolved', message: 'Back' } }));

  const [incident] = await list();
  assert.equal(incident.impact, 'partial_outage');
  assert.equal(incident.status, 'resolved');
  assert.ok(incident.resolvedAt);
  assert.deepEqual(incident.updates.map((u) => [u.status, u.author]), [
    ['resolved', 'Dalton'], ['identified', 'Dalton'], ['investigating', 'Dalton'],
  ]);

  assert.equal((await incidents.DELETE(request('DELETE', `/api/admin/incidents?id=${id}`))).status, 200);
  assert.equal((await list()).length, 0);
  assert.equal((await incidents.DELETE(request('DELETE', `/api/admin/incidents?id=${id}`))).status, 404);
});

test('Discord: posting and updating announce; unticked skips; Discord down still saves', { skip }, async () => {
  const env = { ...authEnv, DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/tok' };
  const sent = [];
  let discordUp = true;
  const fakeDiscord = async (url, init) => {
    if (!discordUp) return new Response('down', { status: 503 });
    sent.push({ url: new URL(url), body: JSON.parse(init.body) });
    return Response.json({ id: 'msg' });
  };
  const incidents = routes(incidentHandlers, db, env, fakeDiscord);
  const updates = routes(updateHandlers, db, env, fakeDiscord);

  const created = await incidents.POST(request('POST', '/api/admin/incidents', {
    body: { title: 'PA route down', impact: 'major_outage', status: 'investigating', components: ['site'], message: 'Checking', announce: true },
  }));
  const { id, discord } = await created.json();
  assert.equal(discord, 'sent');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url.searchParams.get('with_components'), 'true');
  assert.equal(sent[0].body.flags, 1 << 15);
  assert.match(sent[0].body.components[0].components[1].content, /New incident/);
  assert.match(sent[0].body.components[0].components[4].content, new RegExp(`\\[View incident\\]\\(https://status\\.example/incidents/${id}\\)`));

  const skipped = await updates.POST(request('POST', `/api/admin/incident-updates?id=${id}`, {
    body: { status: 'identified', message: 'typo fix', announce: false },
  }));
  assert.equal((await skipped.json()).discord, 'skipped');
  assert.equal(sent.length, 1);

  const resolved = await updates.POST(request('POST', `/api/admin/incident-updates?id=${id}`, {
    body: { status: 'resolved', message: 'Back up' },
  }));
  assert.equal((await resolved.json()).discord, 'sent');
  assert.equal(sent[1].body.components[0].accent_color, 0x22c55e);
  assert.match(sent[1].body.components[0].components[1].content, /^\*\*Resolved\*\*/);

  discordUp = false;
  const failed = await quietly(() => updates.POST(request('POST', `/api/admin/incident-updates?id=${id}`, {
    body: { status: 'monitoring', message: 'Flapping' },
  })));
  assert.equal(failed.status, 201);
  assert.equal((await failed.json()).discord, 'failed');
  const [saved] = (await (await incidents.GET(request('GET', '/api/admin/incidents'))).json()).incidents.filter((i) => i.id === id);
  assert.equal(saved.status, 'monitoring');
});
