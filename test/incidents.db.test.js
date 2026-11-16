// Runs the incident SQL against a real Postgres. Skipped unless TEST_DATABASE_URL is set:
//   TEST_DATABASE_URL=postgres://user:pass@localhost/status_test npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { migrate } from '../lib/db.js';
import {
  NotFoundError,
  addIncidentUpdate,
  createIncident,
  deleteIncident,
  editIncident,
  getIncident,
  listIncidents,
} from '../lib/incidents.js';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';

let client;
const db = { query: async (text, params) => (await client.query(text, params)).rows };

before(async () => {
  if (skip) return;
  client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('drop table if exists incident_updates, incidents, component_pauses, route_states');
  await migrate(db);
  await migrate(db); // idempotent
});

after(async () => client?.end());

const base = {
  title: 'SE route unreachable',
  impact: 'major_outage',
  status: 'investigating',
  components: ['run8-se'],
  message: 'Players cannot connect to SE.',
};

test('create → list with first update and author', { skip }, async () => {
  const id = await createIncident(db, base, 'dalton');
  const [incident] = await listIncidents(db, { days: 30, withAuthors: true });

  assert.equal(incident.id, id);
  assert.equal(incident.status, 'investigating');
  assert.deepEqual(incident.components, ['run8-se']);
  assert.equal(incident.resolvedAt, null);
  assert.equal(incident.updates.length, 1);
  assert.equal(incident.updates[0].author, 'dalton');
  assert.match(incident.createdAt, /^\d{4}-\d{2}-\d{2}T/);

  const [publicView] = await listIncidents(db, { days: 30 });
  assert.equal('author' in publicView.updates[0], false);
});

test('updates move status; resolve sets resolvedAt; reopen clears it', { skip }, async () => {
  const id = await createIncident(db, { ...base, title: 'Updates' }, 'dalton');
  await addIncidentUpdate(db, id, { status: 'identified', message: 'Router rebooted.' }, 'dalton');
  await addIncidentUpdate(db, id, { status: 'resolved', message: 'Back up.' }, 'dalton');

  let incident = (await listIncidents(db, { days: 30 })).find((i) => i.id === id);
  assert.equal(incident.status, 'resolved');
  assert.ok(incident.resolvedAt);
  assert.deepEqual(incident.updates.map((u) => u.status), ['resolved', 'identified', 'investigating']);

  await addIncidentUpdate(db, id, { status: 'monitoring', message: 'Flapping again.' }, 'dalton');
  incident = (await listIncidents(db, { days: 30 })).find((i) => i.id === id);
  assert.equal(incident.resolvedAt, null);
});

test('creating as resolved records a resolved incident', { skip }, async () => {
  const id = await createIncident(db, { ...base, title: 'After the fact', status: 'resolved' }, 'dalton');
  const incident = (await listIncidents(db, { days: 30 })).find((i) => i.id === id);
  assert.ok(incident.resolvedAt);
});

test('old resolved incidents drop out of the window; open ones never do', { skip }, async () => {
  const oldResolved = await createIncident(db, { ...base, title: 'Old', status: 'resolved' }, 'dalton');
  const oldOpen = await createIncident(db, { ...base, title: 'Old open' }, 'dalton');
  await client.query(
    `update incidents set created_at = now() - interval '60 days', resolved_at = case when resolved_at is not null then now() - interval '59 days' end where id = any($1)`,
    [[oldResolved, oldOpen]],
  );

  const ids = (await listIncidents(db, { days: 30 })).map((i) => i.id);
  assert.equal(ids.includes(oldResolved), false);
  assert.equal(ids.includes(oldOpen), true);
});

test('edit changes only the given fields', { skip }, async () => {
  const id = await createIncident(db, { ...base, title: 'Edit me' }, 'dalton');
  await editIncident(db, id, { impact: 'degraded', components: [] });
  const incident = (await listIncidents(db, { days: 30 })).find((i) => i.id === id);
  assert.equal(incident.title, 'Edit me');
  assert.equal(incident.impact, 'degraded');
  assert.deepEqual(incident.components, []);
});

test('delete cascades; missing ids raise NotFoundError', { skip }, async () => {
  const id = await createIncident(db, { ...base, title: 'Delete me' }, 'dalton');
  await deleteIncident(db, id);
  const remaining = await client.query('select count(*)::int as n from incident_updates where incident_id = $1', [id]);
  assert.equal(remaining.rows[0].n, 0);

  await assert.rejects(deleteIncident(db, id), NotFoundError);
  await assert.rejects(addIncidentUpdate(db, id, { status: 'resolved', message: 'x' }, 'a'), NotFoundError);
  await assert.rejects(editIncident(db, id, { title: 'x' }), NotFoundError);
});

test('getIncident returns one incident with updates; missing id is NotFoundError', { skip }, async () => {
  const id = await createIncident(db, { ...base, title: 'Fetch me' }, 'dalton');
  await addIncidentUpdate(db, id, { status: 'identified', message: 'Found it' }, 'dalton');

  const incident = await getIncident(db, id);
  assert.equal(incident.title, 'Fetch me');
  assert.deepEqual(incident.updates.map((u) => u.status), ['identified', 'investigating']);
  assert.equal('author' in incident.updates[0], false);
  await assert.rejects(getIncident(db, 999999), NotFoundError);
});
