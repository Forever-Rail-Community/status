// Pause SQL against a real Postgres. Skipped unless TEST_DATABASE_URL is set.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { migrate } from '../lib/db.js';
import { NotFoundError, ValidationError } from '../lib/incidents.js';
import { listPauses, pauseComponent, resumeComponent } from '../lib/pauses.js';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';
let client;
const db = { query: async (text, params) => (await client.query(text, params)).rows };
const pausable = new Set(['run8-se']);

before(async () => {
  if (skip) return;
  client = new pg.Client({ connectionString: url });
  await client.connect();
  await migrate(db);
  await client.query('truncate component_pauses');
});
after(async () => client?.end());

test('pause, pause again (no-op), resume, and refuse the rest', { skip }, async () => {
  await pauseComponent(db, 'run8-se', 'Dalton', pausable);
  await pauseComponent(db, 'run8-se', 'Dalton', pausable);
  let pauses = await listPauses(db, { days: 30 });
  assert.equal(pauses.length, 1);
  assert.equal(pauses[0].endedAt, null);

  await resumeComponent(db, 'run8-se', pausable);
  pauses = await listPauses(db, { days: 30 });
  assert.equal(pauses.length, 1);
  assert.notEqual(pauses[0].endedAt, null);
  assert.equal((await listPauses(db, { days: 0 })).filter((p) => p.endedAt === null).length, 0);

  await assert.rejects(resumeComponent(db, 'run8-se', pausable), NotFoundError);
  await assert.rejects(pauseComponent(db, 'discord', 'Dalton', pausable), ValidationError);
});
