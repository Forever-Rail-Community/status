// Sub-components (e.g. Run8 → its routes), pausing and grid layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allComponents, monitorComponents, pausableComponents, resolveConfig } from '../lib/config.js';
import { buildStatus } from '../lib/page.js';

const run8 = (routes) => ({
  id: 'frc-run8', name: 'Run8', monitor: 'srv',
  components: routes ?? [
    { id: 'run8-se', name: 'SE route', monitor: 'se', pausable: true },
    { id: 'run8-ags', name: 'AGS route', monitor: 'ags', pausable: true },
  ],
});
const config = (routes, extra = {}) => resolveConfig({
  title: 'T',
  groups: [{ name: 'Servers', layout: 'grid', components: [run8(routes)] }, { name: 'Other', components: [{ name: 'Discord' }] }],
  ...extra,
});
const monitors = (states) => Object.entries(states).map(([id, uptime_status]) => ({ id, uptime_status }));
const run8Of = (body) => body.groups[0].components[0];

test('config: sub-components, layout and pausable', () => {
  const c = config();
  assert.deepEqual(allComponents(c).map((x) => x.id), ['frc-run8', 'run8-se', 'run8-ags', 'discord']);
  assert.deepEqual(monitorComponents(c).map((x) => x.id), ['frc-run8', 'run8-se', 'run8-ags']);
  assert.deepEqual(pausableComponents(c).map((x) => x.id), ['run8-se', 'run8-ags']);
  assert.equal(c.groups[0].layout, 'grid');
  assert.equal(c.groups[1].layout, 'rows');
});

test('config: rejects a fourth level, pausing without a monitor, bad layouts and duplicate nested ids', () => {
  assert.throws(() => config([{ name: 'SE', monitor: 'se', components: [{ name: 'Deeper' }] }]), /groups\[0\]\.components\[0\]\.components\[0\]\.components.*too deep/);
  assert.throws(() => config([{ name: 'SE', pausable: true }]), /pausable.*only works on components with a monitor/);
  assert.throws(() => resolveConfig({ groups: [{ name: 'G', layout: 'tiles', components: [{ name: 'A' }] }] }), /layout/);
  assert.throws(() => config([{ id: 'discord', name: 'Dup', monitor: 'x' }]), /duplicate id "discord"/);
  assert.throws(() => config(undefined, { incidentTemplates: [{ name: 'n', title: 't', components: ['run8-nope'] }] }), /unknown/);
  assert.doesNotThrow(() => config(undefined, { incidentTemplates: [{ name: 'n', title: 't', components: ['run8-se'] }] }));
});

test('a parent combines its own monitor with its routes', () => {
  const allUp = buildStatus(config(), monitors({ srv: 'up', se: 'up', ags: 'up' }), null);
  assert.equal(run8Of(allUp).status, 'operational');
  assert.deepEqual(run8Of(allUp).components.map((r) => r.status), ['operational', 'operational']);

  const oneDown = buildStatus(config(), monitors({ srv: 'up', se: 'up', ags: 'down' }), null);
  assert.equal(run8Of(oneDown).status, 'partial_outage'); // one route out of a working server
  assert.equal(run8Of(oneDown).components[1].status, 'major_outage');

  const serverDown = buildStatus(config(), monitors({ srv: 'down', se: 'down', ags: 'down' }), null);
  assert.equal(run8Of(serverDown).status, 'major_outage');
});

test('pausing: paused routes read "Not running" and stop counting as down', () => {
  const pause = (component, endedAt = null) => ({ component, startedAt: '2026-11-16T00:00:00.000Z', endedAt });
  const body = buildStatus(config(), monitors({ srv: 'up', se: 'up', ags: 'down' }), null, { pauses: [pause('run8-ags')] });
  const [se, ags] = run8Of(body).components;
  assert.equal(ags.status, 'paused');
  assert.equal(ags.paused, true);
  assert.equal(se.paused, false);
  assert.equal(run8Of(body).status, 'operational');
  assert.equal(body.overall, 'operational');
  assert.equal(body.pauses.length, 1);

  const allPaused = buildStatus(config(), monitors({ srv: 'up', se: 'down', ags: 'down' }), null,
    { pauses: [pause('run8-se'), pause('run8-ags')] });
  assert.equal(run8Of(allPaused).status, 'paused'); // server up, nothing running
  assert.equal(allPaused.groups[0].status, 'paused');

  // An ended pause doesn't pause; the server being down still shows with routes paused.
  const ended = buildStatus(config(), monitors({ srv: 'up', se: 'up', ags: 'down' }), null, { pauses: [pause('run8-ags', '2026-11-16T01:00:00.000Z')] });
  assert.equal(run8Of(ended).components[1].status, 'major_outage');
  const serverDown = buildStatus(config(), monitors({ srv: 'down', se: 'down', ags: 'down' }), null, { pauses: [pause('run8-se'), pause('run8-ags')] });
  assert.equal(run8Of(serverDown).status, 'major_outage');
});

test('an open incident on a paused route still shows', () => {
  const incident = { id: 1, title: 'x', impact: 'major_outage', status: 'investigating', components: ['run8-se'], createdAt: '2026-11-16T00:00:00.000Z', resolvedAt: null, updates: [] };
  const body = buildStatus(config(), monitors({ srv: 'up', se: 'up', ags: 'up' }), [incident],
    { pauses: [{ component: 'run8-se', startedAt: '2026-11-16T00:00:00.000Z', endedAt: null }] });
  assert.equal(run8Of(body).components[0].status, 'major_outage');
});
