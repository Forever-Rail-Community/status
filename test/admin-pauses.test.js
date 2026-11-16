// Admin pause API with a recording stub database (the SQL itself is in pauses.db.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminRoutes } from '../lib/admin.js';
import { pauseHandlers } from '../lib/admin-pauses.js';
import { sessionHandlers } from '../lib/admin-incidents.js';
import { sessionCookie } from '../lib/auth/session.js';
import { authEnv } from './helpers.js';

const ORIGIN = 'https://status.example';
const cookie = sessionCookie({ id: '111', name: 'Dalton' }, authEnv.SESSION_SECRET).split(';')[0];
const request = (method, path, body) => new Request(`${ORIGIN}${path}`, {
  method,
  headers: { cookie, origin: ORIGIN, ...(body ? { 'content-type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

const config = {
  title: 'T',
  groups: [{ name: 'Servers', components: [
    { id: 'frc-run8', name: 'Run8', monitor: 'srv', components: [{ id: 'run8-se', name: 'SE route', monitor: 'se', pausable: true }] },
    { id: 'discord', name: 'Discord' },
  ] }],
};

function recordingDb(rows = []) {
  const queries = [];
  return { queries, query: async (text, params) => (queries.push({ text, params }), rows) };
}

test('pause a route; refuse components that aren\'t pausable', async () => {
  const db = recordingDb();
  const routes = adminRoutes(pauseHandlers, { config, db, env: authEnv });

  const ok = await routes.POST(request('POST', '/api/admin/pauses', { component: 'run8-se' }));
  assert.equal(ok.status, 201);
  assert.deepEqual(db.queries[0].params, ['run8-se', 'Dalton']);

  for (const component of ['discord', 'frc-run8', 'nope', 42]) {
    const res = await routes.POST(request('POST', '/api/admin/pauses', { component }));
    assert.equal(res.status, 400, String(component));
  }
  assert.equal(db.queries.length, 1);
});

test('resume: 404 when not paused; GET lists what is paused', async () => {
  const notPaused = adminRoutes(pauseHandlers, { config, db: recordingDb([]), env: authEnv });
  assert.equal((await notPaused.DELETE(request('DELETE', '/api/admin/pauses?component=run8-se'))).status, 404);

  const row = { component_id: 'run8-se', started_at: new Date('2026-11-16T10:00:00Z'), ended_at: null };
  const paused = adminRoutes(pauseHandlers, { config, db: recordingDb([row]), env: authEnv });
  assert.equal((await paused.DELETE(request('DELETE', '/api/admin/pauses?component=run8-se'))).status, 200);
  assert.deepEqual(await (await paused.GET(request('GET', '/api/admin/pauses'))).json(),
    { paused: { 'run8-se': '2026-11-16T10:00:00.000Z' } });
});

test('session lists pausable routes with their parent, and nests the picker', async () => {
  const routes = adminRoutes(sessionHandlers, { config, db: recordingDb(), env: authEnv });
  const body = await (await routes.GET(request('GET', '/api/admin/session'))).json();
  assert.deepEqual(body.pausable, [{ id: 'run8-se', name: 'SE route', parent: 'Run8' }]);
  assert.deepEqual(body.groups[0].components[0].components.map((c) => c.id), ['run8-se']);
});
