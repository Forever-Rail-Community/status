// Incident-based uptime for components without a monitor (public/js/strip.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentSlots, incidentUptime, lastDates, parentSlots } from '../public/js/strip.js';

const HOUR = 3_600_000;
// Window: the whole of Nov 1 and Nov 2 (UTC), "now" = end of Nov 2 → 48 hours.
const windowStart = Date.parse('2026-11-01T00:00:00Z');
const now = windowStart + 48 * HOUR;
const at = (hours) => new Date(windowStart + hours * HOUR).toISOString();
const incident = (impact, fromHour, toHour) => ({ impact, createdAt: at(fromHour), resolvedAt: toHour === null ? null : at(toHour) });
const uptime = (incidents) => incidentUptime(incidents, '2026-11-01', 'UTC', now);

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
  const early = { impact: 'major_outage', createdAt: '2026-11-01T00:00:00Z', resolvedAt: '2026-11-01T05:00:00Z' };
  assert.equal(incidentUptime([early], '2026-11-01', 'America/Chicago', chicagoNow), 100);
  assert.equal(incidentUptime([early], '2026-11-01', 'UTC', chicagoNow) < 100, true);
});

test('lastDates counts back from today in the page time zone', () => {
  const lateEvening = Date.parse('2026-11-16T03:00:00Z'); // still the 15th in Chicago
  assert.deepEqual(lastDates(3, 'America/Chicago', lateEvening), ['2026-11-13', '2026-11-14', '2026-11-15']);
  assert.deepEqual(lastDates(2, 'UTC', lateEvening), ['2026-11-15', '2026-11-16']);
});

test('an incident colours the day it happened in the page time zone', () => {
  // 02:00 UTC on Nov 16 is the evening of Nov 15 in Chicago.
  const outage = { title: 'Down', impact: 'major_outage', createdAt: '2026-11-16T02:00:00Z', resolvedAt: '2026-11-16T03:00:00Z' };
  const slots = (timeZone) => componentSlots({
    days: null, incidents: [outage], axis: ['2026-11-15', '2026-11-16'], baseLevel: 'operational', timeZone,
    now: Date.parse('2026-11-16T12:00:00Z'),
  }).map((s) => s.level);
  assert.deepEqual(slots('America/Chicago'), ['major_outage', 'operational']);
  assert.deepEqual(slots('UTC'), ['operational', 'major_outage']);
});

test('a paused day shows as paused and drops out of uptime; an incident that day still shows', () => {
  const days = [{ date: '2026-11-14', uptime: 100 }, { date: '2026-11-15', uptime: 40 }, { date: '2026-11-16', uptime: 100 }];
  const pause = { startedAt: '2026-11-15T02:00:00Z', endedAt: '2026-11-15T20:00:00Z' };
  const slots = (incidents = []) => componentSlots({
    days, incidents, pauses: [pause], axis: days.map((d) => d.date), baseLevel: 'none', timeZone: 'UTC',
    now: Date.parse('2026-11-16T12:00:00Z'),
  });
  assert.deepEqual(slots().map((s) => [s.level, s.uptime]), [['operational', 100], ['paused', null], ['operational', 100]]);
  const outage = { title: 'x', impact: 'major_outage', createdAt: '2026-11-15T21:00:00Z', resolvedAt: '2026-11-15T22:00:00Z' };
  assert.equal(slots([outage])[1].level, 'major_outage');
});

test('a parent day is paused when every route was paused and its server was fine', () => {
  const slot = (level) => ({ date: 'd', uptime: null, level, incidents: [] });
  const own = [slot('operational'), slot('operational'), slot('major_outage')];
  const routes = [[slot('paused'), slot('operational'), slot('paused')], [slot('paused'), slot('paused'), slot('paused')]];
  assert.deepEqual(parentSlots(own, routes).map((s) => s.level), ['paused', 'operational', 'major_outage']);
});
