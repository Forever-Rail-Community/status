import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, formatOffset, offsetMinutes, startOfDay, zonedDate } from '../public/js/timezone.js';

test('offsets, including daylight saving', () => {
  assert.equal(offsetMinutes('UTC', Date.parse('2026-07-01T12:00:00Z')), 0);
  assert.equal(offsetMinutes('America/Chicago', Date.parse('2026-07-01T12:00:00Z')), -300); // CDT
  assert.equal(offsetMinutes('America/Chicago', Date.parse('2026-12-01T12:00:00Z')), -360); // CST
  assert.equal(offsetMinutes('Asia/Kolkata', Date.parse('2026-12-01T12:00:00Z')), 330);
  assert.equal(formatOffset(-360), '-06:00');
  assert.equal(formatOffset(330), '+05:30');
  assert.equal(formatOffset(0), '+00:00');
});

test('dates and midnights follow the zone, not the computer running the code', () => {
  const lateEvening = Date.parse('2026-11-16T03:00:00Z'); // 9pm on the 15th in Chicago
  assert.equal(zonedDate(lateEvening, 'America/Chicago'), '2026-11-15');
  assert.equal(zonedDate(lateEvening, 'UTC'), '2026-11-16');
  assert.equal(startOfDay('2026-11-15', 'America/Chicago'), Date.parse('2026-11-15T06:00:00Z'));
  assert.equal(startOfDay('2026-11-15', 'UTC'), Date.parse('2026-11-15T00:00:00Z'));
  // The day clocks go back (Nov 1 2026 in the US) starts at CDT midnight and lasts 25 hours.
  assert.equal(startOfDay('2026-11-01', 'America/Chicago'), Date.parse('2026-11-01T05:00:00Z'));
  assert.equal(startOfDay('2026-11-02', 'America/Chicago') - startOfDay('2026-11-01', 'America/Chicago'), 25 * 3_600_000);
});

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});
