// The api/ files themselves: each default-exports { fetch } and routes by method.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const files = {
  'api/status.js': ['GET'],
  'api/history.js': ['GET'],
  'api/auth/login.js': ['GET'],
  'api/auth/callback.js': ['GET'],
  'api/auth/logout.js': ['POST'],
  'api/admin/session.js': ['GET'],
  'api/admin/incidents.js': ['GET', 'POST', 'PATCH', 'DELETE'],
  'api/admin/incident-updates.js': ['POST'],
};

test('every API file exports { fetch } and rejects other methods with 405', async () => {
  for (const [file, methods] of Object.entries(files)) {
    const { default: fn } = await import(`../${file}`);
    assert.equal(typeof fn?.fetch, 'function', `${file} default export`);

    const res = await fn.fetch(new Request('https://status.example/x', { method: 'PUT' }));
    assert.equal(res.status, 405, file);
    assert.deepEqual(res.headers.get('allow').split(', ').sort(), [...methods].sort(), file);
  }
});

test('admin routes answer 503 through fetch when admin login is not configured', async () => {
  const { default: fn } = await import('../api/admin/session.js');
  const saved = process.env.DISCORD_CLIENT_ID;
  delete process.env.DISCORD_CLIENT_ID;
  try {
    assert.equal((await fn.fetch(new Request('https://status.example/api/admin/session'))).status, 503);
  } finally {
    if (saved !== undefined) process.env.DISCORD_CLIENT_ID = saved;
  }
});
