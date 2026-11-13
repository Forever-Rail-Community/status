// Public incident cards: open incidents under the banner, resolved ones at the bottom.

import { h } from './dom.js';
import {
  IMPACT_LABELS,
  INCIDENT_STATUS_LABELS,
  formatAgo,
  formatDateTime,
  formatDuration,
} from './format.js';

function affects(incident, componentNames) {
  if (incident.components.length === 0) return null;
  return `Affects ${incident.components.map((id) => componentNames.get(id) ?? id).join(', ')}`;
}

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

function activeCard(incident, componentNames, openKeys) {
  const [latest, ...earlier] = incident.updates;
  const state = incident.status === 'scheduled' ? 'maintenance' : incident.impact;
  const historyKey = `ih:${incident.id}`;

  return h('article', { class: 'incident', dataset: { state } },
    h('header', { class: 'incident-head' },
      h('h3', { class: 'incident-title' }, incident.title),
      h('span', { class: 'incident-status' }, INCIDENT_STATUS_LABELS[incident.status]),
    ),
    h('div', { class: 'incident-body' },
      latest && h('p', { class: 'incident-message' }, latest.message),
      h('p', { class: 'incident-meta' },
        [
          IMPACT_LABELS[incident.impact],
          latest && `updated ${formatAgo(Date.parse(latest.createdAt))}`,
          affects(incident, componentNames),
        ].filter(Boolean).join(' · '),
      ),
      earlier.length > 0 && h('details', { class: 'incident-history', 'data-key': historyKey, open: openKeys.has(historyKey) },
        h('summary', {}, `Earlier updates (${earlier.length})`),
        updateList(earlier),
      ),
    ),
  );
}

function pastItem(incident, componentNames, openKeys) {
  const lasted = formatDuration(Date.parse(incident.resolvedAt) - Date.parse(incident.createdAt));
  const key = `p:${incident.id}`;
  return h('details', {
    class: 'past-incident',
    'data-key': key,
    open: openKeys.has(key),
    dataset: { state: incident.impact },
  },
    h('summary', {},
      h('span', { class: 'past-title' }, incident.title),
      h('span', { class: 'past-meta' }, `${formatDateTime(incident.resolvedAt)} · lasted ${lasted}`),
    ),
    h('div', { class: 'past-body' },
      affects(incident, componentNames) && h('p', { class: 'incident-meta' }, affects(incident, componentNames)),
      updateList(incident.updates),
    ),
  );
}

export const componentNameMap = (groups) =>
  new Map(groups.flatMap((g) => g.components.map((c) => [c.id, c.name])));

export const renderActiveIncidents = (incidents, componentNames, openKeys) =>
  incidents.map((i) => activeCard(i, componentNames, openKeys));

export function renderPastIncidents(incidents, componentNames, days, openKeys) {
  return [
    h('h2', { class: 'section-title' }, 'Past incidents'),
    incidents.length
      ? h('div', { class: 'past-list' }, incidents.map((i) => pastItem(i, componentNames, openKeys)))
      : h('p', { class: 'muted-note' }, `No incidents in the last ${days} days.`),
  ];
}
