// Shared plumbing for the public API routes: config, API key, database, caching, errors.

import userConfig from '../status.config.js';
import { ConfigError, monitorComponents, resolveConfig } from './config.js';
import { getDb } from './db.js';
import { HetrixError } from './hetrix.js';
import { NotFoundError } from './incidents.js';

export const jsonError = (status, error) =>
  Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

/** Resolved config, cached per function instance (it only changes on redeploy). */
let cachedConfig = null;
export function loadConfig(raw = userConfig) {
  if (raw !== userConfig) return resolveConfig(raw);
  cachedConfig ??= resolveConfig(raw);
  return cachedConfig;
}

/**
 * @param load async ({ config, apiKey, db, request }) => JSON body
 * @param options.cacheControl   Cache-Control header for successful responses
 * @param options.requiresApiKey false for routes that never call HetrixTools
 * @param options.config         raw config (tests inject their own)
 * @param options.db             database client (tests inject their own); defaults to DATABASE_URL
 * @param options.respond        (body, headers) => Response; JSON unless given (the RSS feed sends XML)
 */
const respondJson = (body, headers) => Response.json(body, { headers });

export function createHandler(load, {
  cacheControl, requiresApiKey = true, config: rawConfig = userConfig, db, respond = respondJson,
}) {
  return async function GET(request) {
    try {
      const config = loadConfig(rawConfig);
      const apiKey = process.env.HETRIX_API_KEY;
      if (requiresApiKey && !apiKey && monitorComponents(config).length > 0) {
        return jsonError(500, 'HETRIX_API_KEY is not set');
      }

      const body = await load({ config, apiKey, db: db === undefined ? getDb() : db, request });
      return respond(body, { 'Cache-Control': cacheControl });
    } catch (err) {
      if (err instanceof NotFoundError) return jsonError(404, 'Not found');

      // Full details go to the server log only.
      console.error(err, err instanceof HetrixError ? err.detail : '');
      if (err instanceof ConfigError) return jsonError(500, 'Status page configuration is invalid');
      if (err instanceof HetrixError) {
        return jsonError(err.status === 429 ? 503 : 502, 'Could not reach the monitoring service');
      }
      return jsonError(500, 'Something went wrong');
    }
  };
}
