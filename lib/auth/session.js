// Stateless sessions: a signed, HttpOnly cookie holding { id, name, exp }.

import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'status_session';
const SESSION_DAYS = 7;
const STATE_COOKIE = 'status_oauth_state';
const STATE_MINUTES = 10;

const sign = (data, secret) => createHmac('sha256', secret).update(data).digest('base64url');

function cookie(name, value, maxAgeSeconds) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function readCookie(request, name) {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export function sessionCookie(user, secret, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ id: user.id, name: user.name, exp: now + SESSION_DAYS * 86_400_000 }),
  ).toString('base64url');
  return cookie(SESSION_COOKIE, `${payload}.${sign(payload, secret)}`, SESSION_DAYS * 86_400);
}

export const clearSessionCookie = () => cookie(SESSION_COOKIE, '', 0);

/** The signed-in admin, or null if the cookie is missing, tampered with or expired. */
export function readSession(request, secret, now = Date.now()) {
  const value = readCookie(request, SESSION_COOKIE);
  const [payload, signature] = value?.split('.') ?? [];
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return session.exp > now ? { id: session.id, name: session.name } : null;
  } catch {
    return null;
  }
}

// OAuth "state": a random value kept in a short-lived cookie and echoed by Discord,
// so a login can only be completed by the browser that started it.
export const stateCookie = (state) => cookie(STATE_COOKIE, state, STATE_MINUTES * 60);
export const clearStateCookie = () => cookie(STATE_COOKIE, '', 0);
export const readStateCookie = (request) => readCookie(request, STATE_COOKIE);
