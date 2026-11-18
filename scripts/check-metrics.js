// Shows which metrics your HetrixTools account actually has, before we build charts on them.
// Usage: npm run check-metrics   (reads HETRIX_API_KEY from .env; changes nothing)
//
// For each monitor:
//  0. Its type, and whether a server agent is attached (`has_agent` in the monitor list).
//  1. Response time: live per location (from the monitor list) and over the last 7 days of
//     uptime reports. Zero or missing means the monitor type doesn't measure it.
//  2. Server agent metrics (CPU, RAM, disk, network), if an agent is attached
//     (GET /uptime-monitors/{id}/server-agent/metrics). Its format isn't known yet, so this
//     prints the response's structure: fields, list lengths, a short sample. IDs are never printed.

import { fetchAllMonitors, fetchReport, fetchServerAgentMetrics, HetrixError } from '../lib/hetrix.js';

const apiKey = process.env.HETRIX_API_KEY;
if (!apiKey) {
  console.error('Set HETRIX_API_KEY in .env first.');
  process.exit(1);
}

/** Average response time per location over the report's days, ignoring zeros. */
function responseTimes(report) {
  const byLocation = new Map();
  for (const day of Object.values(report?.data ?? {})) {
    for (const [location, ms] of Object.entries(day.response_time ?? {})) {
      if (ms > 0) byLocation.set(location, [...(byLocation.get(location) ?? []), ms]);
    }
  }
  return [...byLocation].map(([location, values]) =>
    `${location} ${Math.round(values.reduce((a, b) => a + b, 0) / values.length)} ms`);
}

/** Live response time per location, from the monitor list. */
function liveResponseTimes(monitor) {
  const found = Object.entries(monitor.locations ?? {})
    .filter(([, l]) => l?.response_time > 0)
    .map(([location, l]) => `${location} ${l.response_time} ms`);
  return found.length ? found.join(', ') : 'none';
}

async function checkResponseTime(monitor) {
  try {
    const found = responseTimes(await fetchReport(monitor.id, { apiKey, days: 7 }));
    return `response time: live ${liveResponseTimes(monitor)} · last 7 days ${found.length ? found.join(', ') : 'none (all zero)'}`;
  } catch (err) {
    return `response time: live ${liveResponseTimes(monitor)} · couldn't load report (${err.message})`;
  }
}

const indent = (depth) => '    '.repeat(depth + 2);
// Masked: 32-character IDs (the agent uses its ID to send data) and IP addresses.
const ID_PATTERN = /^[a-z0-9]{32}$/i;
const IP_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f]*:[0-9a-f:]+$/i;

/** A compact outline of a JSON value: object fields, list lengths and first items, short values. */
function outline(value, depth = 0) {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[] (empty)';
    return `list of ${value.length}, first:\n${indent(depth + 1)}${outline(value[0], depth + 1)}`;
  }
  if (value && typeof value === 'object') {
    if (depth >= 3) return `{ ${Object.keys(value).join(', ')} }`;
    return Object.entries(value)
      .map(([key, v]) => `${key}: ${outline(v, depth + 1)}`)
      .join(`\n${indent(depth)}`);
  }
  if (typeof value === 'string' && ID_PATTERN.test(value)) return '<id>';
  if (typeof value === 'string' && IP_PATTERN.test(value)) return '<ip>';
  const text = JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

const describeError = (err) =>
  err instanceof HetrixError ? `HTTP ${err.status}: ${String(err.detail).slice(0, 200)}` : err.message;

async function checkServerAgent(monitor) {
  if (monitor.has_agent === false) return 'server agent: none attached to this monitor (has_agent: false)';
  try {
    const metrics = await fetchServerAgentMetrics(monitor.id, { apiKey });
    return `server agent metrics: responded\n${indent(0)}${outline(metrics)}`;
  } catch (err) {
    return `server agent metrics: not available (${describeError(err)})`;
  }
}

const monitors = await fetchAllMonitors({ apiKey });
for (const monitor of monitors) {
  const [response, server] = await Promise.all([checkResponseTime(monitor), checkServerAgent(monitor)]);
  console.log(`${monitor.name} · type: ${monitor.type ?? '?'} · has_agent: ${monitor.has_agent ?? '?'}\n  ${response}\n  ${server}\n`);
}
console.log(`${monitors.length} monitor(s) checked. Paste this output back so we can plan the metrics.`);
