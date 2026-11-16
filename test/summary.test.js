import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../lib/handler.js';
import { loadSummary, respondJsonCors } from '../lib/summary.js';
import { fakeHetrix } from './helpers.js';

const config = {
  title: 'FR',
  groups: [{ name: 'Servers', components: [{ id: 'frc-run8', name: 'Run8', monitor: 'srv', description: 'secret-ish', components: [
    { id: 'run8-se', name: 'SE route', monitor: 'se', pausable: true },
  ] }] }],
};

test('summary: overall, nested components, CORS, no monitor ids or descriptions', async () => {
  process.env.HETRIX_API_KEY = 'k';
  const { fetchImpl } = fakeHetrix({ monitors: [{ id: 'srv', uptime_status: 'up' }, { id: 'se', uptime_status: 'down' }] });
  const GET = createHandler((ctx) => loadSummary({ ...ctx, fetchImpl }), {
    cacheControl: 'public, s-maxage=60', respond: respondJsonCors, config, db: null,
  });
  const res = await GET(new Request('https://status.example.com/api/summary'));
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const body = await res.json();
  assert.equal(body.url, 'https://status.example.com');
  assert.equal(body.overall, 'partial_outage');
  assert.deepEqual(body.groups[0].components[0], {
    id: 'frc-run8', name: 'Run8', status: 'partial_outage',
    components: [{ id: 'run8-se', name: 'SE route', status: 'major_outage', pausable: true, components: [] }],
  });
  assert.doesNotMatch(JSON.stringify(body), /srv|secret-ish/);
});
