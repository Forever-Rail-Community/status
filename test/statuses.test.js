import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overallStatus, worstStatus } from '../lib/statuses.js';

test('worstStatus ignores paused/unknown', () => {
  assert.equal(worstStatus(['operational', 'degraded']), 'degraded');
  assert.equal(worstStatus(['operational', 'maintenance']), 'maintenance');
  assert.equal(worstStatus(['operational', 'paused', 'unknown']), 'operational');
  assert.equal(worstStatus(['paused']), 'paused'); // all switched off: "Not running"
  assert.equal(worstStatus(['paused', 'unknown']), 'paused');
  assert.equal(worstStatus(['unknown']), 'unknown');
  assert.equal(worstStatus([]), 'unknown');
});

test('overallStatus softens a single major outage to partial', () => {
  assert.equal(overallStatus(['operational', 'operational']), 'operational');
  assert.equal(overallStatus(['operational', 'major_outage']), 'partial_outage');
  assert.equal(overallStatus(['major_outage', 'major_outage', 'paused']), 'major_outage');
  assert.equal(overallStatus(['degraded', 'maintenance']), 'degraded');
});
