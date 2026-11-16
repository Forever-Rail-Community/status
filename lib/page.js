// Builds the /api/status payload: page settings, live component status
// (raised by any open incidents), and the incidents themselves.

import { fetchAllMonitors, normalizeMonitor } from './hetrix.js';
import { componentIds, monitorComponents, pausableComponents } from './config.js';
import { affectsStatus, listIncidents } from './incidents.js';
import { listPauses } from './pauses.js';
import { readAuthSettings } from './auth/settings.js';
import { STATUS, overallStatus, worstStatus } from './statuses.js';

/** Only the settings the browser needs. Monitor IDs never leave the server. */
export const publicPage = ({ title, notice, timezone, theme, accent, historyDays, header, footer }) => ({
  title,
  notice,
  timezone,
  theme,
  accent,
  historyDays,
  header,
  footer,
});

function baseComponent(component, monitorsById) {
  const base = { id: component.id, description: component.description, pausable: component.pausable };

  if (!component.monitor) {
    return { ...base, name: component.name, status: component.status, source: 'manual', uptime: null };
  }

  const raw = monitorsById.get(component.monitor);
  if (!raw) {
    console.warn(`Monitor ${component.monitor} (component ${component.id}) not found in HetrixTools`);
    return { ...base, name: component.name ?? 'Unknown monitor', status: STATUS.UNKNOWN, source: 'hetrix', uptime: null };
  }

  const monitor = normalizeMonitor(raw);
  return {
    ...base,
    name: component.name ?? monitor.name ?? 'Unnamed monitor',
    status: monitor.status,
    source: 'hetrix',
    uptime: monitor.uptime,
  };
}

/** Impacts of status-affecting incidents, per component id. */
function impactsByComponent(incidents) {
  const impacts = new Map();
  for (const incident of incidents.filter(affectsStatus)) {
    for (const id of incident.components) {
      impacts.set(id, [...(impacts.get(id) ?? []), incident.impact]);
    }
  }
  return impacts;
}

/** Drop references to components no longer in the config. */
export const withKnownComponents = (incident, knownIds) => ({
  ...incident,
  components: incident.components.filter((id) => knownIds.has(id)),
});

/** Whether the "Log in" button should show: admin sign-in needs the database and Discord settings. */
export const loginEnabled = (db) => Boolean(db) && readAuthSettings() !== null;

/** Open incidents (live ones before planned maintenance) and recently resolved ones. */
function publicIncidents(incidents, knownIds) {
  const visible = incidents.map((i) => withKnownComponents(i, knownIds));
  const open = visible.filter((i) => i.resolvedAt === null);
  return {
    active: [...open.filter(affectsStatus), ...open.filter((i) => !affectsStatus(i))],
    recent: visible.filter((i) => i.resolvedAt !== null),
  };
}

/**
 * A parent's status (e.g. Run8) from its own monitor plus its sub-components (routes).
 * Paused routes don't count; with every route paused and the server fine, it's "Not running".
 */
function rollUp(own, children) {
  if (children.length === 0) return own;
  if (children.every((s) => s === STATUS.PAUSED) && own === STATUS.OPERATIONAL) return STATUS.PAUSED;
  return overallStatus([own, ...children]);
}

/**
 * @param incidents       result of listIncidents, or null when incidents are unavailable
 * @param options.pauses  result of listPauses (open pauses mark components "Not running")
 * @param options.login   whether admin sign-in is set up (shows the "Log in" button)
 */
export function buildStatus(config, rawMonitors, incidents, { pauses = [], login = false, now = Date.now() } = {}) {
  const monitorsById = new Map(rawMonitors.map((m) => [String(m.id), m]));
  const impacts = impactsByComponent(incidents ?? []);
  const pausedNow = new Set(pauses.filter((p) => p.endedAt === null).map((p) => p.component));

  const build = (c) => {
    const base = baseComponent(c, monitorsById);
    const paused = c.pausable && pausedNow.has(c.id);
    // A paused route ignores its monitor; an open incident on it still shows.
    const own = worstStatus([paused ? STATUS.PAUSED : base.status, ...(impacts.get(c.id) ?? [])]);
    const components = c.components.map(build);
    return { ...base, paused, status: rollUp(own, components.map((k) => k.status)), components };
  };

  const groups = config.groups.map((group) => {
    const components = group.components.map(build);
    return {
      name: group.name,
      description: group.description,
      layout: group.layout,
      status: worstStatus(components.map((c) => c.status)),
      components,
    };
  });

  // Incidents not tied to any component still count toward the page banner.
  const pageWideImpacts = (incidents ?? [])
    .filter((i) => affectsStatus(i) && i.components.length === 0)
    .map((i) => i.impact);

  const pausable = new Set(pausableComponents(config).map((c) => c.id));
  return {
    page: publicPage(config),
    overall: overallStatus([...groups.flatMap((g) => g.components.map((c) => c.status)), ...pageWideImpacts]),
    generatedAt: now,
    groups,
    incidents: incidents ? publicIncidents(incidents, componentIds(config)) : null,
    // For the strips: paused days don't count toward uptime.
    pauses: pauses.filter((p) => pausable.has(p.component)),
    // Which header buttons to show: History needs incidents, Log in needs admin sign-in.
    features: { history: incidents !== null, login },
  };
}

async function loadSafely(what, load) {
  try {
    return await load();
  } catch (err) {
    console.error(`Loading ${what} failed:`, err);
    return null;
  }
}

export async function loadStatus({ config, apiKey, fetchImpl, db }) {
  const needsMonitors = monitorComponents(config).length > 0;
  const days = config.historyDays;
  const hasPausable = pausableComponents(config).length > 0;
  const [monitors, incidents, pauses] = await Promise.all([
    needsMonitors ? fetchAllMonitors({ apiKey, fetchImpl }) : [],
    db ? loadSafely('incidents', () => listIncidents(db, { days })) : null,
    db && hasPausable ? loadSafely('pauses', () => listPauses(db, { days })) : [],
  ]);
  return buildStatus(config, monitors, incidents, { pauses: pauses ?? [], login: loginEnabled(db) });
}
