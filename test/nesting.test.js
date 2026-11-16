// Sub-components (Run8 → its routes), manual route states and grid layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allComponents, monitorComponents, resolveConfig, routeComponents } from '../lib/config.js';
import { buildStatus } from '../lib/page.js';

const run8 = (routes) => ({
  id: 'frc-run8', name: 'Run8', monitor: 'srv',
  components: routes ?? [
    { id: 'run8-se', name: 'SE route', route: true },
    { id: 'run8-ags', name: 'AGS route', route: true },
  ],
});
const config = (routes, extra = {}) => resolveConfig({
  title: 'T',
  groups: [{ name: 'Servers', layout: 'grid', components: [run8(routes)] }, { name: 'Other', components: [{ name: 'Discord' }] }],
  ...extra,
});
const monitors = (states) => Object.entries(states).map(([id, uptime_status]) => ({ id, uptime_status }));
const run8Of = (body) => body.groups[0].components[0];
const period = (component, state, endedAt = null) => ({ component, state, startedAt: '2026-11-16T00:00:00.000Z', endedAt });
const status = (routeStates, serverUp = true, incidents = null) =>
  buildStatus(config(), monitors({ srv: serverUp ? 'up' : 'down' }), incidents, { routeStates });

test('config: sub-components, layout and routes', () => {
  const c = config();
  assert.deepEqual(allComponents(c).map((x) => x.id), ['frc-run8', 'run8-se', 'run8-ags', 'discord']);
  assert.deepEqual(monitorComponents(c).map((x) => x.id), ['frc-run8']); // routes don't use HetrixTools
  assert.deepEqual(routeComponents(c).map((x) => x.id), ['run8-se', 'run8-ags']);
  assert.equal(c.groups[0].layout, 'grid');
  assert.equal(c.groups[1].layout, 'rows');
});

test('config: rejects a fourth level, monitors or statuses on routes, the old pausable, bad layouts and duplicate ids', () => {
  assert.throws(() => config([{ name: 'SE', components: [{ name: 'Deeper' }] }]), /too deep/);
  assert.throws(() => config([{ name: 'SE', route: true, monitor: 'x' }]), /is a route.*leave out `monitor`/);
  assert.throws(() => config([{ name: 'SE', route: true, status: 'operational' }]), /is a route/);
  assert.throws(() => config([{ name: 'SE', monitor: 'x', pausable: true }]), /pausable.*route: true/);
  assert.throws(() => resolveConfig({ groups: [{ name: 'G', layout: 'tiles', components: [{ name: 'A' }] }] }), /layout/);
  assert.throws(() => config([{ id: 'discord', name: 'Dup', route: true }]), /duplicate id "discord"/);
  assert.doesNotThrow(() => config(undefined, { incidentTemplates: [{ name: 'n', title: 't', components: ['run8-se'] }] }));
});

test('routes are Up unless set otherwise; Down is an outage, Paused is "Not running"', () => {
  const allUp = status([]);
  assert.deepEqual(run8Of(allUp).components.map((r) => [r.state, r.status]), [['up', 'operational'], ['up', 'operational']]);
  assert.equal(run8Of(allUp).status, 'operational');

  const oneDown = status([period('run8-ags', 'down')]);
  assert.equal(run8Of(oneDown).components[1].status, 'major_outage');
  assert.equal(run8Of(oneDown).status, 'partial_outage'); // one route out on a working server
  assert.equal(oneDown.overall, 'partial_outage');

  const onePaused = status([period('run8-ags', 'paused')]);
  assert.equal(run8Of(onePaused).components[1].status, 'paused');
  assert.equal(run8Of(onePaused).status, 'operational');

  const allPaused = status([period('run8-se', 'paused'), period('run8-ags', 'paused')]);
  assert.equal(run8Of(allPaused).status, 'paused'); // server up, nothing running
  assert.equal(allPaused.groups[0].status, 'paused');

  const serverDown = status([period('run8-se', 'paused'), period('run8-ags', 'paused')], false);
  assert.equal(run8Of(serverDown).status, 'major_outage');
});

test('only open periods set the current state; all periods go to the page for the strips', () => {
  const body = status([period('run8-ags', 'down', '2026-11-16T01:00:00.000Z'), period('unknown-route', 'down')]);
  assert.equal(run8Of(body).components[1].status, 'operational');
  assert.deepEqual(body.routeStates.map((p) => p.component), ['run8-ags']); // ids not in the config are dropped
});

test('an open incident on a paused route still shows', () => {
  const incident = { id: 1, title: 'x', impact: 'major_outage', status: 'investigating', components: ['run8-se'], createdAt: '2026-11-16T00:00:00.000Z', resolvedAt: null, updates: [] };
  assert.equal(run8Of(status([period('run8-se', 'paused')], true, [incident])).components[0].status, 'major_outage');
});
