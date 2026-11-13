import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAuthSettings } from '../lib/auth/settings.js';
import { readSession, sessionCookie } from '../lib/auth/session.js';
import { isAdmin } from '../lib/auth/discord.js';
import { callback, login, logout } from '../lib/auth/routes.js';
import { authEnv, quietly } from './helpers.js';

const SECRET = authEnv.SESSION_SECRET;

const cookieValue = (setCookie) => setCookie.split(';')[0];
const withCookie = (cookie, url = 'https://status.example/api/x', init = {}) =>
  new Request(url, { ...init, headers: { ...init.headers, cookie } });

// ---------- settings ----------

test('settings need client, secret, a long session secret, and an allowlist or guild role', () => {
  assert.ok(readAuthSettings(authEnv));
  assert.equal(readAuthSettings({ ...authEnv, SESSION_SECRET: 'short' }), null);
  assert.equal(readAuthSettings({ ...authEnv, ADMIN_DISCORD_IDS: '' }), null);
  assert.ok(readAuthSettings({ ...authEnv, ADMIN_DISCORD_IDS: '', DISCORD_GUILD_ID: 'g', DISCORD_ADMIN_ROLE_IDS: 'r' }));
  assert.deepEqual(readAuthSettings(authEnv).adminIds, ['111', '222']);
});

// ---------- sessions ----------

test('session cookie round-trips and rejects tampering, wrong secrets and expiry', () => {
  const now = Date.now();
  const cookie = cookieValue(sessionCookie({ id: '111', name: 'Dalton' }, SECRET, now));

  assert.deepEqual(readSession(withCookie(cookie), SECRET, now), { id: '111', name: 'Dalton' });
  assert.equal(readSession(withCookie(cookie), 'x'.repeat(32), now), null);
  assert.equal(readSession(withCookie(cookie), SECRET, now + 8 * 86_400_000), null);

  const [name, value] = cookie.split('=');
  const [payload, sig] = value.split('.');
  const forged = Buffer.from(JSON.stringify({ id: '999', name: 'Eve', exp: now + 1e9 })).toString('base64url');
  assert.equal(readSession(withCookie(`${name}=${forged}.${sig}`), SECRET, now), null);
  assert.equal(readSession(withCookie(`${name}=${payload}`), SECRET, now), null);
  assert.equal(readSession(withCookie(''), SECRET, now), null);
});

test('cookies are HttpOnly, Secure and SameSite=Lax', () => {
  const header = sessionCookie({ id: '1', name: 'a' }, SECRET);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=Lax/);
});

test('isAdmin: user ID allowlist or a listed guild role', () => {
  const settings = { adminIds: ['111'], adminRoleIds: ['role-ops'] };
  assert.equal(isAdmin({ id: '111', roles: [] }, settings), true);
  assert.equal(isAdmin({ id: '333', roles: ['role-ops'] }, settings), true);
  assert.equal(isAdmin({ id: '333', roles: ['other'] }, settings), false);
});

// ---------- login / callback / logout ----------

test('login redirects to Discord with state and a matching state cookie', () => {
  const res = login(new Request('https://status.example/api/auth/login'), { env: authEnv });
  const location = new URL(res.headers.get('location'));
  const state = location.searchParams.get('state');

  assert.equal(res.status, 302);
  assert.equal(location.origin, 'https://discord.com');
  assert.equal(location.searchParams.get('redirect_uri'), 'https://status.example/api/auth/callback');
  assert.equal(location.searchParams.get('scope'), 'identify');
  assert.ok(state.length >= 16);
  assert.match(res.headers.get('set-cookie'), new RegExp(`status_oauth_state=${state}`));
});

const fakeDiscord = (userId) => async (url) => {
  const path = new URL(url).pathname;
  if (path.endsWith('/oauth2/token')) return Response.json({ access_token: 'tok' });
  if (path.endsWith('/users/@me')) return Response.json({ id: userId, username: 'dalton', global_name: 'Dalton' });
  return new Response('nope', { status: 404 });
};

const callbackRequest = (state, cookieState = state) =>
  withCookie(`status_oauth_state=${cookieState}`, `https://status.example/api/auth/callback?code=abc&state=${state}`);

test('callback signs in an allowed user', async () => {
  const res = await callback(callbackRequest('st'), { env: authEnv, fetchImpl: fakeDiscord('111') });
  assert.equal(res.headers.get('location'), '/admin/');
  const session = res.headers.getSetCookie().find((c) => c.startsWith('status_session='));
  assert.deepEqual(readSession(withCookie(cookieValue(session)), SECRET), { id: '111', name: 'Dalton' });
});

test('callback refuses other users and mismatched state', async () => {
  const outsider = await callback(callbackRequest('st'), { env: authEnv, fetchImpl: fakeDiscord('999') });
  assert.equal(outsider.headers.get('location'), '/admin/?error=not_admin');
  assert.equal(outsider.headers.getSetCookie().some((c) => c.startsWith('status_session=') && !c.includes('Max-Age=0')), false);

  const forged = await callback(callbackRequest('st', 'other'), { env: authEnv, fetchImpl: fakeDiscord('111') });
  assert.equal(forged.headers.get('location'), '/admin/?error=login_failed');

  const discordDown = async () => new Response('err', { status: 500 });
  const failed = await quietly(() => callback(callbackRequest('st'), { env: authEnv, fetchImpl: discordDown }));
  assert.equal(failed.headers.get('location'), '/admin/?error=login_failed');
});

test('logout clears the cookie, but only for same-origin requests', () => {
  const ok = logout(new Request('https://status.example/api/auth/logout', { method: 'POST', headers: { origin: 'https://status.example' } }));
  assert.equal(ok.status, 204);
  assert.match(ok.headers.get('set-cookie'), /Max-Age=0/);

  const cross = logout(new Request('https://status.example/api/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example' } }));
  assert.equal(cross.status, 403);
});
