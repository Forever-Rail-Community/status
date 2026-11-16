// Admin route-state API with a recording stub database (the SQL is in route-states.db.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminRoutes } from '../lib/admin.js';
import { routeStateHandlers } from '../lib/admin-route-states.js';
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
    { id: 'frc-run8', name: 'Run8', monitor: 'srv', components: [{ id: 'run8-se', name: 'SE route', route: true }] },
    { id: 'discord', name: 'Discord' },
  ] }],
};

function recordingDb(rows = []) {
  const queries = [];
  return { queries, query: async (text, params) => (queries.push({ text, params }), rows) };
}

test('PUT sets a route state and answers with the current states', async () => {
  const row = { component_id: 'run8-se', state: 'down', started_at: new Date('2026-11-16T10:00:00Z') };
  const db = recordingDb([row]);
  const res = await adminRoutes(routeStateHandlers, { config, db, env: authEnv })
    .PUT(request('PUT', '/api/admin/route-states', { component: 'run8-se', state: 'down' }));
  assert.equal(res.status, 200);
  assert.deepEqual(db.queries.map((q) => q.params), [['run8-se', 'down'], ['run8-se', 'down', 'Dalton'], undefined]);
  assert.deepEqual(await res.json(), { states: { 'run8-se': { state: 'down', since: '2026-11-16T10:00:00.000Z' } } });
});

test('PUT refuses non-routes and unknown states without touching the database', async () => {
  const db = recordingDb();
  const routes = adminRoutes(routeStateHandlers, { config, db, env: authEnv });
  for (const body of [{ component: 'discord', state: 'down' }, { component: 'frc-run8', state: 'down' }, { component: 'run8-se', state: 'gone' }]) {
    assert.equal((await routes.PUT(request('PUT', '/api/admin/route-states', body))).status, 400, JSON.stringify(body));
  }
  assert.equal(db.queries.length, 0);
});

test('session lists routes with their parent, and nests the picker', async () => {
  const routes = adminRoutes(sessionHandlers, { config, db: recordingDb(), env: authEnv });
  const body = await (await routes.GET(request('GET', '/api/admin/session'))).json();
  assert.deepEqual(body.routes, [{ id: 'run8-se', name: 'SE route', parent: 'Run8' }]);
  assert.deepEqual(body.groups[0].components[0].components.map((c) => c.id), ['run8-se']);
});
