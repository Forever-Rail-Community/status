// Builds the /api/history payload: daily uptime per monitor-backed component.

import { fetchDailyUptime } from './hetrix.js';
import { monitorComponents } from './config.js';
import { mapLimit } from './util.js';
import { formatOffset, offsetMinutes } from '../public/js/timezone.js';

// One report request per monitor; keep a few in flight to stay under rate limits.
const CONCURRENCY = 4;

export async function loadHistory({ config, apiKey, fetchImpl }) {
  const components = monitorComponents(config);
  // HetrixTools takes a fixed offset, so it's today's: around a daylight-saving change,
  // older days can be an hour out. The page's strips use the full time zone rules.
  const offset = formatOffset(offsetMinutes(config.timezone));
  const monitorIds = [...new Set(components.map((c) => c.monitor))];

  let lastError = null;
  const reports = await mapLimit(monitorIds, CONCURRENCY, async (id) => {
    try {
      return [id, await fetchDailyUptime(id, { apiKey, days: config.historyDays, offset, fetchImpl })];
    } catch (err) {
      lastError = err;
      console.error(`Uptime report for monitor ${id} failed:`, err.message);
      return [id, null];
    }
  });

  const daysByMonitor = new Map(reports.filter(([, days]) => days));

  // If every request failed (bad key, outage), fail loudly so it isn't cached for an hour.
  if (monitorIds.length > 0 && daysByMonitor.size === 0) throw lastError;

  return {
    days: config.historyDays,
    components: Object.fromEntries(
      components
        .filter((c) => daysByMonitor.has(c.monitor))
        .map((c) => [c.id, daysByMonitor.get(c.monitor)]),
    ),
  };
}
