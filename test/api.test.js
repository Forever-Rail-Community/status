import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../lib/handler.js';
import { resolveConfig } from '../lib/config.js';
import { buildStatus, loadStatus } from '../lib/page.js';
import { loadHistory } from '../lib/history.js';
import { baseConfig, fakeHetrix, quietly } from './helpers.js';

beforeEach(() => {
  process.env.HETRIX_API_KEY = 'k';
});

// ---------- /api/status ----------

test('status mixes live and manual components without leaking monitor IDs', async () => {
  const config = resolveConfig(baseConfig());
  const { fetchImpl } = fakeHetrix({
    monitors: [{ id: 'm1', name: 'HT name', uptime_status: 'down', uptime: '98.5', target: '10.0.0.1' }],
  });

  const body = await loadStatus({ config, apiKey: 'k', fetchImpl, db: null });
  const [site, support] = body.groups[0].components;

  assert.deepEqual(
    { name: site.name, status: site.status, source: site.source, uptime: site.uptime },
    { name: 'Site', status: 'major_outage', source: 'hetrix', uptime: 98.5 },
  );
  assert.equal(support.source, 'manual');
  assert.equal(support.status, 'operational');
  assert.equal(body.groups[0].status, 'major_outage');
  assert.equal(body.overall, 'partial_outage');
  assert.doesNotMatch(JSON.stringify(body), /m1|10\.0\.0\.1/);
});

test('component name falls back to the HetrixTools name; missing monitor is unknown', async () => {
  const config = resolveConfig(baseConfig([
    { name: 'G', components: [{ id: 'unnamed', monitor: 'm1' }, { name: 'Gone', monitor: 'missing' }] },
  ]));
  const body = await quietly(() => buildStatus(config, [{ id: 'm1', name: 'HT name', uptime_status: 'up' }], null));
  const [named, gone] = body.groups[0].components;
  assert.equal(named.name, 'HT name');
  assert.equal(gone.status, 'unknown');
});

test('manual-only page needs no API key and makes no API calls', async () => {
  delete process.env.HETRIX_API_KEY;
  const raw = baseConfig([{ name: 'G', components: [{ name: 'X', status: 'maintenance' }] }]);
  const GET = createHandler(loadStatus, { cacheControl: 'c', config: raw, db: null });

  const res = await GET();
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.overall, 'maintenance');
});

test('missing API key with monitor components is a 500', async () => {
  delete process.env.HETRIX_API_KEY;
  const GET = createHandler(loadStatus, { cacheControl: 'c', config: baseConfig(), db: null });
  assert.equal((await GET()).status, 500);
});

test('invalid config is a generic 500, details only in logs', async () => {
  const GET = createHandler(loadStatus, { cacheControl: 'c', config: { groups: [] }, db: null });
  const res = await quietly(GET);
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /configuration/);
});

test('upstream failure is a generic, uncached 502', async () => {
  const { fetchImpl } = fakeHetrix({ fail: { '/uptime-monitors': 500 } });
  const GET = createHandler((ctx) => loadStatus({ ...ctx, fetchImpl }), { cacheControl: 'c', config: baseConfig(), db: null });

  const res = await quietly(GET);
  assert.equal(res.status, 502);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.doesNotMatch(await res.text(), /upstream detail/);
});

// ---------- /api/history ----------

const historyConfig = () =>
  resolveConfig(baseConfig([
    {
      name: 'G',
      components: [
        { id: 'a', name: 'A', monitor: 'm1' },
        { id: 'a2', name: 'A again', monitor: 'm1' },
        { id: 'b', name: 'B', monitor: 'm2' },
        { id: 'manual', name: 'Manual', status: 'operational' },
      ],
    },
  ]));

test('history: one report per unique monitor, keyed by component', async () => {
  const days = [{ date: '2026-11-13', uptime: 100 }];
  const { fetchImpl, calls } = fakeHetrix({ reports: { m1: { data: days }, m2: { data: days } } });

  const body = await loadHistory({ config: historyConfig(), apiKey: 'k', fetchImpl });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.searchParams.get('days'), '30');
  assert.deepEqual(Object.keys(body.components), ['a', 'a2', 'b']);
  assert.deepEqual(body.components.a, days);
});

test('history: one failing monitor is skipped, all failing throws', async () => {
  const partial = fakeHetrix({ fail: { '/m2/report': 500 } });
  const body = await quietly(() => loadHistory({ config: historyConfig(), apiKey: 'k', fetchImpl: partial.fetchImpl }));
  assert.deepEqual(Object.keys(body.components), ['a', 'a2']);

  const total = fakeHetrix({ fail: { '/report': 401 } });
  await quietly(() =>
    assert.rejects(loadHistory({ config: historyConfig(), apiKey: 'k', fetchImpl: total.fetchImpl })),
  );
});
