// Wrapper for admin API routes: sign-in check, CSRF check, database, JSON body, errors.

import userConfig from '../status.config.js';
import { readAuthSettings } from './auth/settings.js';
import { readSession } from './auth/session.js';
import { getDb } from './db.js';
import { loadConfig } from './handler.js';
import { NotFoundError, ValidationError } from './incidents.js';

/** Title and theme for admin pages: public settings, also sent before sign-in. */
export const pageSettings = (config) => ({ title: config.title, theme: config.theme, accent: config.accent });

export const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** State-changing requests must come from this site (alongside SameSite=Lax cookies). */
export const isSameOrigin = (request) =>
  request.headers.get('origin') === new URL(request.url).origin;

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    throw new ValidationError('expected a JSON body');
  }
}

/**
 * @param handlers { GET?, POST?, PATCH?, DELETE? } each ({ request, url, user, db, config, body, env, fetchImpl }) => Response
 * @param options.config / options.db / options.env / options.fetchImpl  test injection
 * @returns the same keys, as Vercel route handlers
 */
export function adminRoutes(handlers, { config: rawConfig = userConfig, db: injectedDb, env = process.env, fetchImpl } = {}) {
  const wrap = (method, handler) => async (request) => {
    const settings = readAuthSettings(env);
    if (!settings) return json({ error: 'Admin login is not configured' }, 503);

    try {
      const config = loadConfig(rawConfig);
      const user = readSession(request, settings.sessionSecret);
      // The sign-in screen still gets the site's title and theme.
      if (!user) return json({ error: 'Not signed in', page: pageSettings(config) }, 401);
      if (method !== 'GET' && !isSameOrigin(request)) return json({ error: 'Cross-site request blocked' }, 403);

      const db = injectedDb === undefined ? getDb() : injectedDb;
      if (!db) return json({ error: 'DATABASE_URL is not set' }, 503);

      const body = method === 'POST' || method === 'PATCH' ? await readJsonBody(request) : null;
      return await handler({ request, url: new URL(request.url), user, db, config, body, env, fetchImpl });
    } catch (err) {
      if (err instanceof ValidationError) return json({ error: err.message }, 400);
      if (err instanceof NotFoundError) return json({ error: err.message }, 404);
      console.error(err);
      return json({ error: 'Something went wrong' }, 500);
    }
  };

  return Object.fromEntries(Object.entries(handlers).map(([method, fn]) => [method, wrap(method, fn)]));
}
