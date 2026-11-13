// Sign-in, callback and sign-out logic (the api/auth/* files are thin wrappers).

import { randomBytes } from 'node:crypto';
import { authorizeUrl, exchangeCode, fetchIdentity, isAdmin } from './discord.js';
import {
  clearSessionCookie,
  clearStateCookie,
  readStateCookie,
  sessionCookie,
  stateCookie,
} from './session.js';
import { readAuthSettings } from './settings.js';
import { isSameOrigin, json } from '../admin.js';

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

const adminPage = (error) => (error ? `/admin/?error=${error}` : '/admin/');

export function login(request, { env } = {}) {
  const settings = readAuthSettings(env);
  if (!settings) return json({ error: 'Admin login is not configured' }, 503);

  const state = randomBytes(16).toString('base64url');
  return redirect(authorizeUrl(settings, request, state), [stateCookie(state)]);
}

export async function callback(request, { env, fetchImpl } = {}) {
  const settings = readAuthSettings(env);
  if (!settings) return json({ error: 'Admin login is not configured' }, 503);

  const params = new URL(request.url).searchParams;
  const state = params.get('state');
  const code = params.get('code');
  const clear = [clearStateCookie()];

  if (!code || !state || state !== readStateCookie(request)) {
    return redirect(adminPage('login_failed'), clear);
  }

  try {
    const token = await exchangeCode(settings, request, code, fetchImpl);
    const identity = await fetchIdentity(settings, token, fetchImpl);
    if (!isAdmin(identity, settings)) return redirect(adminPage('not_admin'), clear);

    return redirect(adminPage(), [...clear, sessionCookie(identity, settings.sessionSecret)]);
  } catch (err) {
    console.error('Discord sign-in failed:', err);
    return redirect(adminPage('login_failed'), clear);
  }
}

export function logout(request) {
  if (!isSameOrigin(request)) return json({ error: 'Cross-site request blocked' }, 403);
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' },
  });
}
