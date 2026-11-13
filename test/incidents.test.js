import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '../lib/config.js';
import { buildStatus } from '../lib/page.js';
import {
  NotFoundError,
  ValidationError,
  parseIncidentEdit,
  parseIncidentId,
  parseIncidentUpdate,
  parseNewIncident,
} from '../lib/incidents.js';
import { baseConfig } from './helpers.js';

const known = new Set(['site', 'support']);
const valid = {
  title: ' Site down ',
  impact: 'major_outage',
  status: 'investigating',
  components: ['site', 'site'],
  message: 'Looking into it',
};

// ---------- validation ----------

test('parseNewIncident trims, dedupes components and defaults to none', () => {
  assert.deepEqual(parseNewIncident(valid, known), { ...valid, title: 'Site down', components: ['site'] });
  assert.deepEqual(parseNewIncident({ ...valid, components: undefined }, known).components, []);
});

test('parseNewIncident rejects bad input with a clear message', () => {
  const rejects = (input, pattern) =>
    assert.throws(() => parseNewIncident(input, known), (e) => e instanceof ValidationError && pattern.test(e.message));
  rejects(null, /JSON object/);
  rejects({ ...valid, title: '   ' }, /title is required/);
  rejects({ ...valid, title: 'x'.repeat(201) }, /at most 200/);
  rejects({ ...valid, impact: 'apocalypse' }, /impact must be one of/);
  rejects({ ...valid, status: 'done' }, /status must be one of/);
  rejects({ ...valid, components: ['nope'] }, /unknown components: nope/);
  rejects({ ...valid, components: 'site' }, /must be a list/);
  rejects({ ...valid, message: '' }, /message is required/);
});

test('parseIncidentEdit takes only the given fields; parseIncidentUpdate needs both', () => {
  assert.deepEqual(parseIncidentEdit({ impact: 'degraded' }, known), { impact: 'degraded' });
  assert.throws(() => parseIncidentEdit({}, known), /nothing to change/);
  assert.deepEqual(parseIncidentUpdate({ status: 'resolved', message: 'Fixed' }), { status: 'resolved', message: 'Fixed' });
  assert.throws(() => parseIncidentUpdate({ status: 'resolved' }), ValidationError);
});

test('parseIncidentId accepts positive integers only', () => {
  assert.equal(parseIncidentId('42'), 42);
  for (const bad of [null, '', '0', '-1', '1.5', 'abc', '1; drop table']) {
    assert.throws(() => parseIncidentId(bad), NotFoundError);
  }
});

// ---------- effect on the status page ----------

const incident = (fields) => ({
  id: 1,
  title: 'Incident',
  impact: 'major_outage',
  status: 'investigating',
  components: [],
  createdAt: '2026-11-13T10:00:00.000Z',
  resolvedAt: null,
  updates: [],
  ...fields,
});

const config = resolveConfig(baseConfig());
const monitorsUp = [{ id: 'm1', uptime_status: 'up' }];
const statusOf = (body, id) => body.groups[0].components.find((c) => c.id === id).status;

test('an open incident raises its components; the monitor status still counts', () => {
  const body = buildStatus(config, monitorsUp, [incident({ impact: 'degraded', components: ['support'] })]);
  assert.equal(statusOf(body, 'support'), 'degraded');
  assert.equal(statusOf(body, 'site'), 'operational');
  assert.equal(body.overall, 'degraded');

  // A worse live status wins over a milder incident.
  const down = buildStatus(config, [{ id: 'm1', uptime_status: 'down' }], [incident({ impact: 'degraded', components: ['site'] })]);
  assert.equal(statusOf(down, 'site'), 'major_outage');
});

test('resolved and scheduled incidents do not change status', () => {
  const body = buildStatus(config, monitorsUp, [
    incident({ id: 1, components: ['site'], status: 'resolved', resolvedAt: '2026-11-13T11:00:00.000Z' }),
    incident({ id: 2, impact: 'maintenance', components: ['support'], status: 'scheduled' }),
  ]);
  assert.equal(body.overall, 'operational');
  assert.deepEqual(body.incidents.active.map((i) => i.id), [2]);
  assert.deepEqual(body.incidents.recent.map((i) => i.id), [1]);
});

test('live incidents are listed before planned maintenance', () => {
  const body = buildStatus(config, monitorsUp, [
    incident({ id: 1, impact: 'maintenance', status: 'scheduled' }),
    incident({ id: 2 }),
  ]);
  assert.deepEqual(body.incidents.active.map((i) => i.id), [2, 1]);
});

test('incidents with no components affect the page banner only', () => {
  const body = buildStatus(config, monitorsUp, [incident({ impact: 'maintenance' })]);
  assert.equal(body.overall, 'maintenance');
  assert.equal(statusOf(body, 'site'), 'operational');
});

test('references to removed components are dropped; null incidents means unavailable', () => {
  const body = buildStatus(config, monitorsUp, [incident({ components: ['site', 'gone'] })]);
  assert.deepEqual(body.incidents.active[0].components, ['site']);
  assert.equal(buildStatus(config, monitorsUp, null).incidents, null);
});

test('features: History needs incidents, Log in needs admin sign-in', () => {
  assert.deepEqual(buildStatus(config, monitorsUp, []).features, { history: true, login: false });
  assert.deepEqual(buildStatus(config, monitorsUp, null, { login: true }).features, { history: false, login: true });
});
