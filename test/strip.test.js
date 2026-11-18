// Incident-based uptime for components without a monitor (public/js/strip.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentSlots, manualUptime, lastDates, parentSlots } from '../public/js/strip.js';

const HOUR = 3_600_000;
// Window: the whole of Nov 1 and Nov 2 (UTC), "now" = end of Nov 2 → 48 hours.
const windowStart = Date.parse('2026-11-01T00:00:00Z');
const now = windowStart + 48 * HOUR;
const at = (hours) => new Date(windowStart + hours * HOUR).toISOString();
const incident = (impact, fromHour, toHour) => ({ impact, startedAt: at(fromHour), resolvedAt: toHour === null ? null : at(toHour) });
const uptime = (incidents) => manualUptime(incidents, '2026-11-01', 'UTC', { now });

test('no incidents is 100%', () => {
  assert.equal(uptime([]), 100);
});

test('partial and major outages count as down', () => {
  assert.equal(uptime([incident('major_outage', 10, 16)]), 100 * (1 - 6 / 48));
  assert.equal(uptime([incident('partial_outage', 0, 12)]), 75);
});

test('degraded performance and maintenance do not count', () => {
  assert.equal(uptime([incident('degraded', 0, 24), incident('maintenance', 24, 48)]), 100);
});

test('overlapping incidents are counted once', () => {
  assert.equal(uptime([incident('major_outage', 10, 16), incident('partial_outage', 12, 20)]), 100 * (1 - 10 / 48));
  assert.equal(uptime([incident('major_outage', 10, 20), incident('partial_outage', 12, 14)]), 100 * (1 - 10 / 48));
});

test('time before the window is ignored; an open incident counts until now', () => {
  assert.equal(uptime([incident('major_outage', -100, 6)]), 100 * (1 - 6 / 48));
  assert.equal(uptime([incident('major_outage', 36, null)]), 75);
});

test('the window starts at midnight in the page time zone', () => {
  // Chicago's Nov 1 starts at 05:00 UTC, so an outage before then falls outside the window.
  const chicagoNow = Date.parse('2026-11-02T05:00:00Z'); // 25 hours later (clocks went back)
  const early = { impact: 'major_outage', startedAt: '2026-11-01T00:00:00Z', resolvedAt: '2026-11-01T05:00:00Z' };
  assert.equal(manualUptime([early], '2026-11-01', 'America/Chicago', { now: chicagoNow }), 100);
  assert.equal(manualUptime([early], '2026-11-01', 'UTC', { now: chicagoNow }) < 100, true);
});

test('lastDates counts back from today in the page time zone', () => {
  const lateEvening = Date.parse('2026-11-16T03:00:00Z'); // still the 15th in Chicago
  assert.deepEqual(lastDates(3, 'America/Chicago', lateEvening), ['2026-11-13', '2026-11-14', '2026-11-15']);
  assert.deepEqual(lastDates(2, 'UTC', lateEvening), ['2026-11-15', '2026-11-16']);
});

test('an incident colours the day it happened in the page time zone', () => {
  // 02:00 UTC on Nov 16 is the evening of Nov 15 in Chicago.
  const outage = { title: 'Down', impact: 'major_outage', startedAt: '2026-11-16T02:00:00Z', resolvedAt: '2026-11-16T03:00:00Z' };
  const slots = (timeZone) => componentSlots({
    days: null, incidents: [outage], axis: ['2026-11-15', '2026-11-16'], baseLevel: 'operational', timeZone,
    now: Date.parse('2026-11-16T12:00:00Z'),
  }).map((s) => s.level);
  assert.deepEqual(slots('America/Chicago'), ['major_outage', 'operational']);
  assert.deepEqual(slots('UTC'), ['operational', 'major_outage']);
});

const routeSlots = (periods, axis, now) => componentSlots({
  days: null, incidents: [], periods, axis, baseLevel: 'none', timeZone: 'UTC', now: Date.parse(now),
});

test('route days: no data before tracking; Down → red; any Up → green; paused all day → grey', () => {
  const axis = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'];
  const periods = [
    { state: 'up', startedAt: '2026-11-13T09:00:00Z', endedAt: '2026-11-14T00:00:00Z' },
    { state: 'paused', startedAt: '2026-11-14T00:00:00Z', endedAt: '2026-11-15T10:00:00Z' },
    { state: 'down', startedAt: '2026-11-15T10:00:00Z', endedAt: '2026-11-15T12:00:00Z' },
    { state: 'paused', startedAt: '2026-11-15T12:00:00Z', endedAt: '2026-11-16T08:00:00Z' },
    { state: 'up', startedAt: '2026-11-16T08:00:00Z', endedAt: null },
  ];
  assert.deepEqual(routeSlots(periods, axis, '2026-11-16T12:00:00Z').map((s) => s.level),
    ['none', 'operational', 'paused', 'major_outage', 'operational']);
});

test('route days: paused then set Up the same day is green (the screenshot case)', () => {
  const periods = [
    { state: 'paused', startedAt: '2026-11-16T15:00:00Z', endedAt: '2026-11-16T15:05:00Z' },
    { state: 'up', startedAt: '2026-11-16T15:05:00Z', endedAt: null },
  ];
  assert.deepEqual(routeSlots(periods, ['2026-11-15', '2026-11-16'], '2026-11-16T21:00:00Z').map((s) => s.level),
    ['none', 'operational']);
  // Never set: no data at all.
  assert.deepEqual(routeSlots([], ['2026-11-16'], '2026-11-16T21:00:00Z').map((s) => s.level), ['none']);
});

test('route days: older Down/Paused-only data counts the gaps as Up', () => {
  const periods = [{ state: 'paused', startedAt: '2026-11-16T01:00:00Z', endedAt: '2026-11-16T02:00:00Z' }];
  assert.equal(routeSlots(periods, ['2026-11-16'], '2026-11-16T12:00:00Z')[0].level, 'operational');
});

test('route uptime: Down time counts as down, Paused time is left out', () => {
  const at = (h) => `2026-11-01T${String(h).padStart(2, '0')}:00:00Z`;
  const now = Date.parse('2026-11-02T00:00:00Z'); // a 24-hour window
  const down6 = [{ state: 'down', startedAt: at(0), endedAt: at(6) }];
  assert.equal(manualUptime([], '2026-11-01', 'UTC', { periods: down6, now }), 75);
  // Paused for 12 of the 24 hours: 6 hours down out of 12 measured.
  const paused12 = [...down6, { state: 'paused', startedAt: at(12), endedAt: null }];
  assert.equal(manualUptime([], '2026-11-01', 'UTC', { periods: paused12, now }), 50);
  // An outage incident during the pause isn't counted twice or against paused time.
  const incident = { impact: 'major_outage', startedAt: at(13), resolvedAt: at(14) };
  assert.equal(manualUptime([incident], '2026-11-01', 'UTC', { periods: paused12, now }), 50);
  // Paused the whole time: nothing to measure.
  assert.equal(manualUptime([], '2026-11-01', 'UTC', { periods: [{ state: 'paused', startedAt: at(0), endedAt: null }], now }), null);
  // Measured only from when the route started being tracked: 6 of the 12 tracked hours down.
  const late = [{ state: 'up', startedAt: at(12), endedAt: at(18) }, { state: 'down', startedAt: at(18), endedAt: null }];
  assert.equal(manualUptime([], '2026-11-01', 'UTC', { periods: late, now }), 50);
});

test('a parent day is paused when every tracked route was paused and its server was fine', () => {
  const slot = (level) => ({ date: 'd', uptime: null, level, incidents: [] });
  const own = [slot('operational'), slot('operational'), slot('major_outage'), slot('operational'), slot('operational')];
  const routes = [
    [slot('paused'), slot('operational'), slot('paused'), slot('paused'), slot('none')],
    [slot('paused'), slot('paused'), slot('paused'), slot('none'), slot('none')],
  ];
  assert.deepEqual(parentSlots(own, routes).map((s) => s.level), ['paused', 'operational', 'major_outage', 'paused', 'operational']);
});

test('maintenance excuses a route being Down: blue, not red, and not counted against uptime', () => {
  const window = { title: 'Updates', impact: 'maintenance', startedAt: '2026-11-16T02:00:00Z', resolvedAt: '2026-11-16T06:00:00Z' };
  const periods = [
    { state: 'up', startedAt: '2026-11-15T00:00:00Z', endedAt: '2026-11-16T02:00:00Z' },
    { state: 'down', startedAt: '2026-11-16T02:00:00Z', endedAt: '2026-11-16T06:00:00Z' },
    { state: 'up', startedAt: '2026-11-16T06:00:00Z', endedAt: null },
  ];
  const now = '2026-11-17T00:00:00Z';
  const slots = componentSlots({ days: null, incidents: [window], periods, axis: ['2026-11-15', '2026-11-16'], baseLevel: 'none', timeZone: 'UTC', now: Date.parse(now) });
  assert.deepEqual(slots.map((s) => s.level), ['operational', 'maintenance']);
  assert.equal(manualUptime([window], '2026-11-15', 'UTC', { periods, now: Date.parse(now) }), 100);

  // Down past the end of the window counts: 2 of 48 hours.
  const overran = periods.map((p) => (p.state === 'down' ? { ...p, endedAt: '2026-11-16T08:00:00Z' } : p.startedAt === '2026-11-16T06:00:00Z' ? { ...p, startedAt: '2026-11-16T08:00:00Z' } : p));
  assert.equal(componentSlots({ days: null, incidents: [window], periods: overran, axis: ['2026-11-16'], baseLevel: 'none', timeZone: 'UTC', now: Date.parse(now) })[0].level, 'major_outage');
  assert.equal(Math.round(manualUptime([window], '2026-11-15', 'UTC', { periods: overran, now: Date.parse(now) }) * 100) / 100, 95.83);
});
