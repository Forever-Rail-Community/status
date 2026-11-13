// Incident views: open-incident cards (status page), the month list (/history),
// and an incident's own page (/incidents/:id). Cards and list entries link to that page.

import { h } from './dom.js';
import {
  IMPACT_LABELS,
  INCIDENT_STATUS_LABELS,
  formatAgo,
  formatDateTime,
  formatDuration,
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
  formatDuration(Date.parse(incident.resolvedAt) - Date.parse(incident.createdAt));

function updateList(updates) {
  return h('ol', { class: 'incident-updates' },
    updates.map((u) =>
      h('li', {},
        h('div', { class: 'incident-update-head' },
          h('strong', {}, INCIDENT_STATUS_LABELS[u.status]),
          h('time', { datetime: u.createdAt }, formatDateTime(u.createdAt)),
        ),
        h('p', {}, u.message),
      ),
    ),
  );
}

// ---------- status page: open incidents ----------

function activeCard(incident, componentNames) {
  const [latest] = incident.updates;
  const affected = affectedNames(incident, componentNames);

  return h('article', { class: 'incident', dataset: { state: incidentState(incident) } },
    h('header', { class: 'incident-head' },
      h('h3', { class: 'incident-title' }, h('a', { href: incidentUrl(incident.id) }, incident.title)),
      h('span', { class: 'incident-status' }, INCIDENT_STATUS_LABELS[incident.status]),
    ),
    h('div', { class: 'incident-body' },
      latest && h('p', { class: 'incident-message' }, latest.message),
      h('p', { class: 'incident-meta' },
        [
          IMPACT_LABELS[incident.impact],
          latest && `updated ${formatAgo(Date.parse(latest.createdAt))}`,
          affected && `Affects ${affected}`,
        ].filter(Boolean).join(' · '),
      ),
      h('a', { class: 'incident-link', href: incidentUrl(incident.id) },
        incident.updates.length > 1 ? `View incident (${incident.updates.length} updates)` : 'View incident',
      ),
    ),
  );
}

export const componentNameMap = (groups) =>
  new Map(groups.flatMap((g) => g.components.map((c) => [c.id, c.name])));

export const renderActiveIncidents = (incidents, componentNames) =>
  incidents.map((i) => activeCard(i, componentNames));

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
          INCIDENT_STATUS_LABELS[incident.status]),
      ),
    ),
    h('dl', { class: 'incident-facts' },
      fact('Started', formatDateTime(incident.createdAt)),
      resolved && fact('Resolved', formatDateTime(incident.resolvedAt)),
      resolved && fact('Lasted', lastedFor(incident)),
      fact('Affects', affected ?? 'All services'),
    ),
    h('section', { class: 'incident-timeline' },
      h('h2', { class: 'section-title' }, 'Updates'),
      updateList(incident.updates),
    ),
  ];
}
