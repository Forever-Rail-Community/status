// Builds the /api/status payload: page settings, live component status
// (raised by any open incidents), and the incidents themselves.

import { fetchAllMonitors, normalizeMonitor } from './hetrix.js';
import { componentIds, monitorComponents, routeComponents } from './config.js';
import { affectsStatus, listIncidents } from './incidents.js';
import { listRouteStates } from './route-states.js';
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

// A route's state from /admin → its status. No open period = Up.
const ROUTE_STATUS = { up: STATUS.OPERATIONAL, down: STATUS.MAJOR_OUTAGE, paused: STATUS.PAUSED };

/** @param monitorsById  null when HetrixTools couldn't be reached: monitors show unknown. */
function baseComponent(component, monitorsById, routeStates) {
  const base = { id: component.id, description: component.description, route: component.route };

  if (component.route) {
    const state = routeStates.get(component.id) ?? 'up';
    return { ...base, name: component.name, state, status: ROUTE_STATUS[state], source: 'route', uptime: null };
  }

  if (!component.monitor) {
    return { ...base, name: component.name, status: component.status, source: 'manual', uptime: null };
  }

  const raw = monitorsById?.get(component.monitor);
  if (!raw) {
    if (monitorsById) console.warn(`Monitor ${component.monitor} (component ${component.id}) not found in HetrixTools`);
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
/** id → ids of its sub-components (e.g. Run8 → its routes). */
function subComponentIds(config) {
  const map = new Map();
  const walk = (c) => {
    map.set(c.id, c.components.map((k) => k.id));
    c.components.forEach(walk);
  };
  config.groups.forEach((g) => g.components.forEach(walk));
  return map;
}

/**
 * id → impacts of the open incidents affecting it. Maintenance on a component also covers
 * its sub-components (maintenance on Run8 covers its routes); outages don't, since the
 * parent already shows them.
 */
function impactsByComponent(incidents, subIds) {
  const impacts = new Map();
  const add = (id, impact) => impacts.set(id, [...(impacts.get(id) ?? []), impact]);
  for (const incident of incidents.filter(affectsStatus)) {
    for (const id of incident.components) {
      add(id, incident.impact);
      if (incident.impact === STATUS.MAINTENANCE) for (const sub of subIds.get(id) ?? []) add(sub, incident.impact);
    }
  }
  return impacts;
}

const OUTAGES = new Set([STATUS.PARTIAL_OUTAGE, STATUS.MAJOR_OUTAGE]);

/** Drop references to components no longer in the config. */
export const withKnownComponents = (incident, knownIds) => ({
  ...incident,
  components: incident.components.filter((id) => knownIds.has(id)),
});

/** Whether the "Log in" button should show: admin sign-in needs the database and Discord settings. */
export const loginEnabled = (db) => Boolean(db) && readAuthSettings() !== null;

/** Open incidents (live ones before planned maintenance) and recently resolved ones. */
/** Open incidents first, then upcoming maintenance (soonest first), then resolved ones. */
function publicIncidents(incidents, knownIds) {
  const visible = incidents.map((i) => withKnownComponents(i, knownIds));
  const open = visible.filter((i) => i.resolvedAt === null);
  const upcoming = open.filter((i) => !affectsStatus(i)).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return {
    active: [...open.filter(affectsStatus), ...upcoming],
    recent: visible.filter((i) => i.resolvedAt !== null),
  };
}

/**
 * A parent's status (e.g. Run8) from its own monitor plus its sub-components (routes).
 * Paused routes don't count; with every route paused and the server fine, it's "Not running".
 * The server itself down outranks whatever its routes are set to.
 */
function rollUp(own, children) {
  if (children.length === 0) return own;
  if (own === STATUS.MAJOR_OUTAGE) return own; // the server is down: nothing on it runs
  if (children.every((s) => s === STATUS.PAUSED) && own === STATUS.OPERATIONAL) return STATUS.PAUSED;
  return overallStatus([own, ...children]);
}

/**
 * @param incidents       result of listIncidents, or null when incidents are unavailable
 * @param rawMonitors     HetrixTools monitors, or null when they couldn't be loaded (the page
 *                        still works: monitored components show unknown, with a notice)
 * @param options.routeStates  result of listRouteStates (open periods = each route's current state)
 * @param options.login   whether admin sign-in is set up (shows the "Log in" button)
 */
export function buildStatus(config, rawMonitors, incidents, { routeStates = [], login = false, now = Date.now() } = {}) {
  const monitorsById = rawMonitors && new Map(rawMonitors.map((m) => [String(m.id), m]));
  const impacts = impactsByComponent(incidents ?? [], subComponentIds(config));
  const routeIds = new Set(routeComponents(config).map((c) => c.id));
  const periods = routeStates.filter((p) => routeIds.has(p.component));
  const currentState = new Map(periods.filter((p) => p.endedAt === null).map((p) => [p.component, p.state]));

  const build = (c) => {
    const base = baseComponent(c, monitorsById, currentState);
    const open = impacts.get(c.id) ?? [];
    // During its maintenance window, a component that's down is down on purpose.
    const planned = open.includes(STATUS.MAINTENANCE) && OUTAGES.has(base.status);
    // Open incidents still show, even on a paused route or during maintenance.
    const own = worstStatus([planned ? STATUS.MAINTENANCE : base.status, ...open]);
    const components = c.components.map(build);
    return { ...base, status: rollUp(own, components.map((k) => k.status)), components };
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

  return {
    page: publicPage(config),
    overall: overallStatus([...groups.flatMap((g) => g.components.map((c) => c.status)), ...pageWideImpacts]),
    generatedAt: now,
    groups,
    incidents: incidents ? publicIncidents(incidents, componentIds(config)) : null,
    // For the strips and uptime of routes: when each was Down or Paused.
    routeStates: periods,
    // Which header buttons to show: History needs incidents, Log in needs admin sign-in.
    features: { history: incidents !== null, login },
    // True when HetrixTools couldn't be reached: the page says live data is delayed.
    monitoringDelayed: rawMonitors === null,
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
  const hasRoutes = routeComponents(config).length > 0;
  // A HetrixTools outage mustn't take the page down with it: incidents, maintenance and
  // manual components still show (loadSafely logs the error and gives null).
  const [monitors, incidents, routeStates] = await Promise.all([
    needsMonitors ? loadSafely('monitors', () => fetchAllMonitors({ apiKey, fetchImpl })) : [],
    db ? loadSafely('incidents', () => listIncidents(db, { days })) : null,
    db && hasRoutes ? loadSafely('route states', () => listRouteStates(db, { days })) : [],
  ]);
  return buildStatus(config, monitors, incidents, { routeStates: routeStates ?? [], login: loginEnabled(db) });
}
