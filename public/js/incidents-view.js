// Incident views: open-incident cards (status page), the month list (/history),
// and an incident's own page (/incidents/:id). Cards and list entries link to that page.

import { h } from './dom.js';
import { statusIcon } from './icons.js';
import {
  IMPACT_LABELS,
  INCIDENT_STATUS_LABELS,
  formatDateTime,
  formatDuration,
  formatWindow,
  windowCountdown,
} from './format.js';

export const incidentUrl = (id) => `/incidents/${id}`;

/** 'SE Route, AGS Route', or null when the incident affects the whole page. */
function affectedNames(incident, componentNames) {
  if (incident.components.length === 0) return null;
  return incident.components.map((id) => componentNames.get(id) ?? id).join(', ');
}

/** Colour of an incident: blue while maintenance is only scheduled, else its impact. */
const incidentState = (incident) => (incident.status === 'scheduled' ? 'maintenance' : incident.impact);

const lastedFor = (incident) =>
  formatDuration(Date.parse(incident.resolvedAt) - Date.parse(incident.startedAt));

/** Finished maintenance reads "Completed" rather than "Resolved". */
const statusLabel = (incident) =>
  incident.window && incident.status === 'resolved' ? 'Completed' : INCIDENT_STATUS_LABELS[incident.status];

/** 'Sat, Nov 22, 2:00 – 4:00 AM CST · Starts in 4d 7h' for scheduled maintenance. */
const windowLine = (incident) => {
  if (!incident.window) return null;
  const countdown = incident.resolvedAt ? null : windowCountdown(incident.window);
  return h('p', { class: 'incident-window' },
    formatWindow(incident.window),
    countdown && h('span', { class: 'incident-countdown' }, ` · ${countdown}`),
  );
};

/**
 * Colour of one update in the timeline: green once resolved, blue for maintenance steps,
 * otherwise the incident's impact. So a resolved incident still shows how bad it was.
 */
function updateState(status, impact) {
  if (status === 'resolved') return 'operational';
  if (status === 'scheduled' || status === 'in_progress') return 'maintenance';
  return impact;
}

function updateEntry(update, impact, isLatest) {
  return h('li', { class: 'update', dataset: { state: updateState(update.status, impact) } },
    h('div', { class: 'update-head' },
      h('strong', {}, INCIDENT_STATUS_LABELS[update.status]),
      isLatest && h('span', { class: 'latest-tag' }, 'Latest'),
    ),
    h('p', { class: 'update-message' }, update.message),
    h('time', { class: 'update-time', datetime: update.createdAt }, formatDateTime(update.createdAt)),
  );
}

/** Updates, newest first. `markLatest` tags the first one (only while the incident is open). */
const updateList = (updates, impact, { markLatest = false } = {}) =>
  h('ol', { class: 'updates' }, updates.map((u, i) => updateEntry(u, impact, markLatest && i === 0)));

// ---------- status page: open incidents ----------

// The card shows this many earlier updates; the rest are on the incident's page.
const EARLIER_SHOWN = 3;

const chips = (names) => h('ul', { class: 'chips' }, names.map((name) => h('li', { class: 'chip' }, name)));

/** Open incident as a banner-style card, open by default; the visitor can collapse it. */
function activeCard(incident, componentNames, expanded) {
  const key = `inc:${incident.id}`;
  const href = incidentUrl(incident.id);
  const [latest, ...earlier] = incident.updates;
  const affected = incident.components.map((id) => componentNames.get(id) ?? id);
  const impact = incident.status === 'scheduled' ? 'Scheduled maintenance' : IMPACT_LABELS[incident.impact];

  return h('details', {
    class: 'incident',
    'data-key': key,
    open: expanded.isOpen(key, true),
    dataset: { state: incidentState(incident) },
  },
    h('summary', { class: 'incident-head' },
      h('span', { class: 'chevron', 'aria-hidden': 'true' }),
      statusIcon(incidentState(incident)),
      h('h2', { class: 'incident-title' }, incident.title),
      h('span', { class: 'incident-impact' }, impact),
      h('a', { class: 'incident-open', href, title: 'Open incident page', 'aria-label': `Open incident page: ${incident.title}` }, '↗'),
    ),
    h('div', { class: 'incident-body' },
      windowLine(incident),
      affected.length > 0 && chips(affected),
      latest && updateList([latest], incident.impact, { markLatest: true }),
      earlier.length > 0 && h('p', { class: 'updates-divider' }, 'Earlier updates'),
      earlier.length > 0 && updateList(earlier.slice(0, EARLIER_SHOWN), incident.impact),
      earlier.length > EARLIER_SHOWN &&
        h('a', { class: 'incident-link', href }, `View all ${incident.updates.length} updates`),
    ),
  );
}

/** True for incidents that replace the status banner (scheduled maintenance doesn't). */
export const takesOverBanner = (incident) => incident.status !== 'scheduled';

/** id → name for every component, sub-components included (status payload or admin session). */
export const componentNameMap = (groups) => {
  const walk = (components) => components.flatMap((c) => [[c.id, c.name], ...walk(c.components ?? [])]);
  return new Map(groups.flatMap((g) => walk(g.components)));
};

export const renderActiveIncidents = (incidents, componentNames, expanded) =>
  incidents.map((i) => activeCard(i, componentNames, expanded));

// ---------- /history ----------

const pastItem = (incident) =>
  h('a', { class: 'past-incident', href: incidentUrl(incident.id), dataset: { state: incident.impact } },
    h('span', { class: 'past-title' }, incident.title),
    h('span', { class: 'past-meta' }, `${formatDateTime(incident.resolvedAt)} · lasted ${lastedFor(incident)}`),
  );

const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

/** Resolved incidents, newest first, under a heading per month (viewer's timezone). */
function byMonth(incidents) {
  const months = new Map();
  const newestFirst = [...incidents].sort((a, b) => Date.parse(b.resolvedAt) - Date.parse(a.resolvedAt));
  for (const incident of newestFirst) {
    const month = monthFormat.format(new Date(incident.resolvedAt));
    months.set(month, [...(months.get(month) ?? []), incident]);
  }
  return months;
}

export function renderIncidentHistory(incidents, days) {
  const intro = h('p', { class: 'muted-note' },
    `Resolved incidents from the last ${days} days. Ongoing incidents are shown on the status page.`);

  if (incidents.length === 0) {
    return [intro, h('p', { class: 'history-empty' }, `No incidents in the last ${days} days.`)];
  }
  return [
    intro,
    ...[...byMonth(incidents)].map(([month, items]) =>
      h('section', { class: 'history-month' },
        h('h2', { class: 'section-title' }, month),
        h('div', { class: 'past-list' }, items.map(pastItem)),
      ),
    ),
  ];
}

// ---------- /incidents/:id ----------

const fact = (label, value) => h('div', {}, h('dt', {}, label), h('dd', {}, value));

export function renderIncidentPage(incident, componentNames) {
  const resolved = incident.resolvedAt !== null;
  const affected = affectedNames(incident, componentNames);

  return [
    h('header', { class: 'incident-page-head' },
      h('h1', { class: 'page-title' }, incident.title),
      h('div', { class: 'badges' },
        h('span', { class: 'badge', dataset: { state: incidentState(incident) } }, IMPACT_LABELS[incident.impact]),
        h('span', { class: 'badge', dataset: { state: resolved ? 'operational' : incidentState(incident) } },
          statusLabel(incident)),
      ),
    ),
    windowLine(incident),
    h('dl', { class: 'incident-facts' },
      fact(Date.parse(incident.startedAt) > Date.now() ? 'Starts' : 'Started', formatDateTime(incident.startedAt)),
      resolved && fact(incident.window ? 'Completed' : 'Resolved', formatDateTime(incident.resolvedAt)),
      resolved && fact('Lasted', lastedFor(incident)),
      fact('Affects', affected ?? 'All services'),
    ),
    h('section', { class: 'incident-timeline' },
      h('h2', { class: 'section-title' }, 'Updates'),
      updateList(incident.updates, incident.impact, { markLatest: !resolved }),
    ),
  ];
}
