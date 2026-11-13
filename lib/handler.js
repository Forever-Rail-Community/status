// Shared plumbing for the public API routes: config, API key, database, caching, errors.

import userConfig from '../status.config.js';
import { ConfigError, monitorComponents, resolveConfig } from './config.js';
import { getDb } from './db.js';
import { HetrixError } from './hetrix.js';

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
 * @param load async ({ config, apiKey, db }) => JSON body
 * @param options.cacheControl Cache-Control header for successful responses
 * @param options.config raw config (tests inject their own)
 * @param options.db database client (tests inject their own); defaults to DATABASE_URL
 */
export function createHandler(load, { cacheControl, config: rawConfig = userConfig, db }) {
  return async function GET() {
    try {
      const config = loadConfig(rawConfig);
      const apiKey = process.env.HETRIX_API_KEY;
      if (!apiKey && monitorComponents(config).length > 0) {
        return jsonError(500, 'HETRIX_API_KEY is not set');
      }

      const body = await load({ config, apiKey, db: db === undefined ? getDb() : db });
      return Response.json(body, { headers: { 'Cache-Control': cacheControl } });
    } catch (err) {
      // Full details go to the server log only.
      console.error(err, err instanceof HetrixError ? err.detail : '');

      if (err instanceof ConfigError) return jsonError(500, 'Status page configuration is invalid');
      const status = err instanceof HetrixError && err.status === 429 ? 503 : 502;
      return jsonError(status, 'Could not reach the monitoring service');
    }
  };
}
