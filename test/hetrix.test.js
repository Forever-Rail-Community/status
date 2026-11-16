import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllMonitors, fetchDailyUptime, HetrixError, normalizeMonitor, normalizeReportDays } from '../lib/hetrix.js';
import { readFileSync } from 'node:fs';
import { fakeHetrix } from './helpers.js';

// A real /v3/uptime-monitors/{id}/report response.
const liveReport = JSON.parse(readFileSync(new URL('./fixtures/uptime-report.json', import.meta.url)));

test('follows pagination with bearer auth', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(init.headers.Authorization);
    const page = Number(new URL(url).searchParams.get('page'));
    return Response.json({
      monitors: [{ id: `m${page}` }],
      meta: { pagination: { next: page < 3 ? 'more' : null } },
    });
  };

  const monitors = await fetchAllMonitors({ apiKey: 'k', fetchImpl });
  assert.deepEqual(monitors.map((m) => m.id), ['m1', 'm2', 'm3']);
  assert.deepEqual(calls, ['Bearer k', 'Bearer k', 'Bearer k']);
});

test('non-2xx becomes HetrixError with status', async () => {
  const { fetchImpl } = fakeHetrix({ fail: { '/uptime-monitors': 401 } });
  await assert.rejects(fetchAllMonitors({ apiKey: 'k', fetchImpl }), (err) => {
    assert.ok(err instanceof HetrixError);
    assert.equal(err.status, 401);
    return true;
  });
});

test('monitor status mapping', () => {
  const status = (fields) => normalizeMonitor(fields).status;
  assert.equal(status({ uptime_status: 'up', monitor_status: 'active' }), 'operational');
  assert.equal(status({ uptime_status: 'down', monitor_status: 'active' }), 'major_outage');
  assert.equal(status({ uptime_status: 'up', monitor_status: 'maint' }), 'maintenance');
  assert.equal(status({ uptime_status: 'up', monitor_status: 'maint_dnd' }), 'maintenance');
  assert.equal(status({ uptime_status: 'up', monitor_status: 'paused' }), 'paused');
  assert.equal(status({ uptime_status: 'up', monitor_status: 'disabled' }), 'paused');
  assert.equal(status({}), 'unknown');
  assert.equal(
    status({ uptime_status: 'up', locations: { a: { uptime_status: 'up' }, b: { uptime_status: 'down' } } }),
    'degraded',
  );
});

test('uptime and response time parsing', () => {
  const m = normalizeMonitor({
    uptime: '99.987',
    locations: { a: { response_time: 100 }, b: { response_time: '200' } },
  });
  assert.equal(m.uptime, 99.987);
  assert.equal(m.responseTime, 150);
  assert.equal(normalizeMonitor({ locations: [] }).responseTime, null);
});

test('report days: parses a real HetrixTools v3 report', () => {
  assert.deepEqual(normalizeReportDays(liveReport), [
    { date: '2026-11-12', uptime: 100 },
    { date: '2026-11-13', uptime: 100 },
  ]);
});

test('report days: sorted by date; missing percentage is null; empty report is []', () => {
  const report = {
    data: {
      '2026-11-13': { uptime: { percentage: '99.5' } },
      '2026-11-11': { uptime: {} },
      '2026-11-12': {},
    },
  };
  assert.deepEqual(normalizeReportDays(report), [
    { date: '2026-11-11', uptime: null },
    { date: '2026-11-12', uptime: null },
    { date: '2026-11-13', uptime: 99.5 },
  ]);
  assert.deepEqual(normalizeReportDays({}), []);
});

test('daily uptime asks for the page time zone offset, except UTC', async (t) => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(new URL(url));
    return Response.json({ timezone: 'UTC+00:00', data: {} });
  };
  const warn = t.mock.method(console, 'warn', () => {});

  await fetchDailyUptime('m1', { apiKey: 'k', days: 30, fetchImpl });
  assert.equal(urls[0].searchParams.has('timezone'), false);
  assert.equal(warn.mock.callCount(), 0);

  await fetchDailyUptime('m1', { apiKey: 'k', days: 30, offset: '-06:00', fetchImpl });
  assert.equal(urls[1].searchParams.get('timezone'), '-06:00');
  assert.equal(warn.mock.callCount(), 1); // answered in UTC: logged so a shifted strip is explainable
});
