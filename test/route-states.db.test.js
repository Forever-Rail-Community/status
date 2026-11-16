// Route state SQL against a real Postgres, including the upgrade from the pause-only table.
// Skipped unless TEST_DATABASE_URL is set.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { migrate } from '../lib/db.js';
import { ValidationError } from '../lib/incidents.js';
import { currentRouteStates, listRouteStates, setRouteState } from '../lib/route-states.js';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';
let client;
const db = { query: async (text, params) => (await client.query(text, params)).rows };
const routes = new Set(['run8-se', 'run8-ags']);
const set = (component, state) => setRouteState(db, { component, state, author: 'Dalton' }, routes);

before(async () => {
  if (skip) return;
  client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('drop table if exists route_states, component_pauses');
});
after(async () => client?.end());

test('upgrading from the pause-only table keeps open pauses as Paused', { skip }, async () => {
  await client.query(`create table component_pauses (id bigserial primary key, component_id text not null,
    started_at timestamptz not null default now(), ended_at timestamptz, author text)`);
  await client.query(`create unique index component_pauses_open_idx on component_pauses (component_id) where ended_at is null`);
  await client.query(`insert into component_pauses (component_id) values ('run8-ags')`);
  await migrate(db);
  await migrate(db); // safe to run again
  assert.equal((await currentRouteStates(db))['run8-ags'].state, 'paused');
  await client.query('truncate route_states');
});

test('set Down, Down again (no-op), Paused, Up; history is kept', { skip }, async () => {
  await set('run8-se', 'down');
  const since = (await currentRouteStates(db))['run8-se'].since;
  await set('run8-se', 'down');
  assert.equal((await currentRouteStates(db))['run8-se'].since, since);

  await set('run8-se', 'paused');
  assert.equal((await currentRouteStates(db))['run8-se'].state, 'paused');
  await set('run8-se', 'up');
  assert.deepEqual(await currentRouteStates(db), {});

  const history = await listRouteStates(db, { days: 30 });
  assert.deepEqual(history.map((p) => [p.state, p.endedAt !== null]), [['down', true], ['paused', true]]);

  await set('run8-se', 'up'); // already up: nothing to do
  assert.equal((await listRouteStates(db, { days: 30 })).length, 2);
});

test('refuses unknown routes and states', { skip }, async () => {
  await assert.rejects(set('discord', 'down'), ValidationError);
  await assert.rejects(set('run8-se', 'broken'), ValidationError);
});
