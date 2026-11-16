// HetrixTools v3 client and normalization of its responses.

import { STATUS } from './statuses.js';
import { lower, toNumber, isPlainObject } from './util.js';

const API_BASE = 'https://api.hetrixtools.com/v3';
const PER_PAGE = 100;
const MAX_PAGES = 20; // safety cap: 2,000 monitors

export class HetrixError extends Error {
  constructor(status, detail) {
    super(`HetrixTools API responded ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

async function request(path, { apiKey, params = {}, fetchImpl = fetch }) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new HetrixError(res.status, await res.text());
  return res.json();
}

/** Every uptime monitor on the account, following meta.pagination.next. */
export async function fetchAllMonitors({ apiKey, fetchImpl }) {
  const monitors = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await request('/uptime-monitors', {
      apiKey,
      fetchImpl,
      params: { per_page: PER_PAGE, page },
    });
    monitors.push(...(body.monitors ?? []));
    if (!body.meta?.pagination?.next) break;
  }

  return monitors;
}

/** Daily uptime for one monitor: [{ date: 'YYYY-MM-DD', uptime }], oldest first. */
/**
 * Daily uptime for one monitor, oldest first.
 * @param offset the page time zone's UTC offset ('+02:00'); omitted for UTC, HetrixTools' default.
 *   HetrixTools reports the zone it used; a mismatch is logged (days would be shifted).
 */
export async function fetchDailyUptime(monitorId, { apiKey, days, offset = '+00:00', fetchImpl }) {
  const params = offset === '+00:00' ? { days } : { days, timezone: offset };
  const body = await request(`/uptime-monitors/${encodeURIComponent(monitorId)}/report`, { apiKey, fetchImpl, params });
  if (body?.timezone && body.timezone !== `UTC${offset}`) {
    console.warn(`Uptime report for monitor ${monitorId} is in ${body.timezone}, expected UTC${offset}; days may be shifted.`);
  }
  return normalizeReportDays(body);
}

// Report shape (confirmed against a live response):
//   { data: { 'YYYY-MM-DD': { uptime: { percentage, percentage_incl_maint, ... } } } }
// `percentage` leaves maintenance windows out, so planned work doesn't count as downtime.
export function normalizeReportDays(report) {
  const data = isPlainObject(report?.data) ? report.data : {};
  return Object.entries(data)
    .map(([date, day]) => ({ date, uptime: toNumber(day?.uptime?.percentage) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// `locations` is an object keyed by location name; tolerate an empty array too.
function normalizeLocations(locations) {
  if (!isPlainObject(locations)) return [];

  return Object.entries(locations).map(([name, loc]) => ({
    name,
    status: lower(loc?.uptime_status),
    responseTime: toNumber(loc?.response_time),
  }));
}

function average(values) {
  const nums = values.filter((v) => v !== null);
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

// monitor_status: active | paused | disabled | maint | maint_dnd
function componentStatus(monitor, locations) {
  const monitorStatus = lower(monitor.monitor_status);
  if (monitorStatus.startsWith('maint')) return STATUS.MAINTENANCE;
  if (monitorStatus === 'paused' || monitorStatus === 'disabled') return STATUS.PAUSED;

  switch (lower(monitor.uptime_status)) {
    case 'down':
      return STATUS.MAJOR_OUTAGE;
    case 'up':
      // Up overall but failing from some locations.
      return locations.some((l) => l.status === 'down') ? STATUS.DEGRADED : STATUS.OPERATIONAL;
    default:
      return STATUS.UNKNOWN;
  }
}

/** Reduce a raw monitor to the public fields the page shows. */
export function normalizeMonitor(monitor) {
  const locations = normalizeLocations(monitor.locations);

  return {
    name: monitor.name ?? null,
    status: componentStatus(monitor, locations),
    uptime: toNumber(monitor.uptime),
    responseTime: average(locations.map((l) => l.responseTime)) ?? toNumber(monitor.response_time),
  };
}
