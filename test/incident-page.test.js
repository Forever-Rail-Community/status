// GET /api/incident?id=…: the public payload behind /incidents/:id.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createHandler } from '../lib/handler.js';
import { loadIncidentPage } from '../lib/incident-page.js';
import { createIncident, addIncidentUpdate } from '../lib/incidents.js';
import { migrate } from '../lib/db.js';
import { baseConfig } from './helpers.js';

const request = (id) => new Request(`https://status.example/api/incident?id=${id}`);
const handler = (db) =>
  createHandler(loadIncidentPage, { cacheControl: 'c', requiresApiKey: false, config: baseConfig(), db });

test('without a database: page settings, no incident, no History button', async () => {
  delete process.env.HETRIX_API_KEY; // this route never needs it
  const res = await handler(null)(request(1));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.incident, null);
  assert.equal(body.page.title, 'Test');
  assert.deepEqual(body.features, { history: false, login: false });
});

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

test('returns one incident with its full timeline, without admin names', { skip }, async () => {
  const id = await createIncident(db, {
    title: 'SE down', impact: 'major_outage', status: 'investigating', components: ['site', 'removed-one'], message: 'Looking',
  }, 'Dalton');
  await addIncidentUpdate(db, id, { status: 'resolved', message: 'Fixed' }, 'Dalton');

  const res = await handler(db)(request(id));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.incident.title, 'SE down');
  assert.deepEqual(body.incident.updates.map((u) => u.status), ['resolved', 'investigating']);
  assert.deepEqual(body.incident.components, ['site']); // removed components dropped
  assert.deepEqual(body.componentNames, { site: 'Site' });
  assert.equal(body.features.history, true);
  assert.doesNotMatch(JSON.stringify(body), /Dalton/);
});

test('unknown or malformed ids give incident: null, not an error', { skip }, async () => {
  for (const id of ['999999', 'abc', '']) {
    const res = await handler(db)(request(id));
    assert.equal(res.status, 200, id);
    assert.equal((await res.json()).incident, null, id);
  }
});
