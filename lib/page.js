// Builds the /api/status payload: page settings, live component status
// (raised by any open incidents), and the incidents themselves.

import { fetchAllMonitors, normalizeMonitor } from './hetrix.js';
import { componentIds, monitorComponents } from './config.js';
import { affectsStatus, listIncidents } from './incidents.js';
import { STATUS, overallStatus, worstStatus } from './statuses.js';

/** Only the settings the browser needs. Monitor IDs never leave the server. */
const publicPage = ({ title, notice, theme, accent, historyDays, header, footer }) => ({
  title,
  notice,
  theme,
  accent,
  historyDays,
  header,
  footer,
});

function baseComponent(component, monitorsById) {
  const base = { id: component.id, description: component.description };

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

/**
 * Open incidents (live ones before planned maintenance) and recently resolved ones,
 * each without references to components no longer in the config.
 */
function publicIncidents(incidents, knownIds) {
  const visible = incidents.map((i) => ({ ...i, components: i.components.filter((id) => knownIds.has(id)) }));
  const open = visible.filter((i) => i.resolvedAt === null);
  return {
    active: [...open.filter(affectsStatus), ...open.filter((i) => !affectsStatus(i))],
    recent: visible.filter((i) => i.resolvedAt !== null),
  };
}

/**
 * @param incidents result of listIncidents, or null when incidents are unavailable
 */
export function buildStatus(config, rawMonitors, incidents, now = Date.now()) {
  const monitorsById = new Map(rawMonitors.map((m) => [String(m.id), m]));
  const impacts = impactsByComponent(incidents ?? []);

  const groups = config.groups.map((group) => {
    const components = group.components.map((c) => {
      const component = baseComponent(c, monitorsById);
      return { ...component, status: worstStatus([component.status, ...(impacts.get(c.id) ?? [])]) };
    });
    return {
      name: group.name,
      description: group.description,
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
  };
}

// The page must still load if the database is down; incidents are just omitted.
async function loadIncidentsSafely(db, days) {
  if (!db) return null;
  try {
    return await listIncidents(db, { days });
  } catch (err) {
    console.error('Loading incidents failed:', err);
    return null;
  }
}

export async function loadStatus({ config, apiKey, fetchImpl, db }) {
  const needsMonitors = monitorComponents(config).length > 0;
  const [monitors, incidents] = await Promise.all([
    needsMonitors ? fetchAllMonitors({ apiKey, fetchImpl }) : [],
    loadIncidentsSafely(db, config.historyDays),
  ]);
  return buildStatus(config, monitors, incidents);
}
