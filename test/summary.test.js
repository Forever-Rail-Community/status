import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../lib/handler.js';
import { loadSummary, respondJsonCors, summarize } from '../lib/summary.js';
import { fakeHetrix } from './helpers.js';

const config = {
  title: 'FR',
  groups: [{ name: 'Servers', components: [{ id: 'frc-run8', name: 'Run8', monitor: 'srv', description: 'secret-ish', components: [
    { id: 'run8-se', name: 'SE route', route: true },
  ] }] }],
};

test('summary: overall, nested components, CORS, no monitor ids or descriptions', async () => {
  process.env.HETRIX_API_KEY = 'k';
  const { fetchImpl } = fakeHetrix({ monitors: [{ id: 'srv', uptime_status: 'down' }] });
  const GET = createHandler((ctx) => loadSummary({ ...ctx, fetchImpl }), {
    cacheControl: 'public, s-maxage=60', respond: respondJsonCors, config, db: null,
  });
  const res = await GET(new Request('https://status.example.com/api/summary'));
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const body = await res.json();
  assert.equal(body.url, 'https://status.example.com');
  assert.equal(body.overall, 'major_outage');
  assert.deepEqual(body.groups[0].components[0], {
    id: 'frc-run8', name: 'Run8', status: 'major_outage',
    components: [{ id: 'run8-se', name: 'SE route', status: 'operational', route: true, components: [] }],
  });
  assert.doesNotMatch(JSON.stringify(body), /srv|secret-ish/);
  assert.equal(body.incidents, null, 'no database: incidents are not set up');
});

test('summary: open incidents with impact, status, link and latest update time, no timeline', () => {
  const update = (createdAt, message) => ({ id: 1, status: 'identified', message, createdAt });
  const status = {
    page: { title: 'FR' }, overall: 'partial_outage', generatedAt: 'now', groups: [],
    incidents: {
      active: [{
        id: 7, title: 'SE route down', impact: 'partial_outage', status: 'identified', components: ['run8-se'],
        createdAt: '2026-11-17T10:00:00Z', resolvedAt: null,
        updates: [update('2026-11-17T10:30:00Z', 'Found it'), update('2026-11-17T10:00:00Z', 'Looking')],
      }],
      recent: [{ id: 6, title: 'Old', resolvedAt: '2026-11-16T00:00:00Z', updates: [] }],
    },
  };
  assert.deepEqual(summarize(status, 'https://status.example.com').incidents, [{
    id: 7, title: 'SE route down', impact: 'partial_outage', status: 'identified',
    url: 'https://status.example.com/incidents/7',
    startedAt: '2026-11-17T10:00:00Z', updatedAt: '2026-11-17T10:30:00Z',
  }]);
});
