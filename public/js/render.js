import { h } from './dom.js';
import { STATUS_LABELS, average, formatShortDay, formatUptime } from './format.js';
import {
  componentSlots,
  groupSlots,
  incidentUptime,
  lastDates,
  rangeUptime,
  renderStrip,
  trimToMonitored,
} from './strip.js';

// ---------- row building blocks ----------

const chevron = () => h('span', { class: 'chevron', 'aria-hidden': 'true' });

const infoIcon = (text) =>
  h('span', { class: 'info', role: 'img', 'aria-label': text, dataset: { tip: text } }, 'i');

const rowTitle = (tag, name, description) =>
  h('div', { class: 'row-title' }, h(tag, { class: 'row-name' }, name), description && infoIcon(description));

const statusLabel = (status) =>
  h('span', { class: 'status-label', dataset: { state: status } }, STATUS_LABELS[status]);

/** Strip + uptime %, with the live status when it isn't operational or there's no uptime to show. */
/** 'Nov 12' when the strip was trimmed to when monitoring began, else null. */
const startedOn = (slots, ctx) => (slots.length < ctx.days ? formatShortDay(slots[0].date) : null);

/** Strip + "99.98% · since Oct 18" on every row, plus the live status when it isn't operational. */
function rowAside(status, slots, uptime) {
  return h('div', { class: 'row-aside' },
    (status !== 'operational' || uptime === null) && statusLabel(status),
    renderStrip(slots, { compact: true }),
    uptime !== null && h('span', { class: 'uptime' },
      `${formatUptime(uptime)} · since ${formatShortDay(slots[0].date)}`),
  );
}

function renderTimeline(slots, ctx) {
  const since = startedOn(slots, ctx);
  return h('div', { class: 'timeline' },
    h('div', { class: 'timeline-labels' },
      h('span', {}, since ? `Since ${since}` : `${ctx.days} days ago`),
      h('span', {}, 'Today'),
    ),
    renderStrip(slots),
  );
}

/** <details> that remembers being opened or closed across re-renders (closed by default). */
const collapsible = (className, key, ctx, summary, body) =>
  h('details', { class: className, 'data-key': key, open: ctx.expanded.isOpen(key, false) },
    h('summary', { class: 'row' }, summary),
    body,
  );

// ---------- components & groups ----------

/**
 * Everything a component row needs: its full-length slots (for combining into the
 * group), its trimmed slots (for display) and its uptime over them.
 */
function measure(component, ctx) {
  const incidents = ctx.incidents.filter((i) => i.components.includes(component.id));
  const monitored = component.source === 'hetrix';
  const allSlots = componentSlots({
    days: ctx.history?.components[component.id],
    incidents,
    axis: ctx.axis,
    baseLevel: monitored ? 'none' : 'operational',
    timeZone: ctx.timeZone,
  });
  const slots = trimToMonitored(allSlots);
  // Monitors: HetrixTools' daily uptime. Manual components: time not under an outage incident.
  const uptime = monitored ? (rangeUptime(slots) ?? component.uptime) : incidentUptime(incidents, slots[0].date, ctx.timeZone);
  return { component, allSlots, slots, uptime };
}

function renderComponent({ component, slots, uptime }, ctx) {
  return collapsible('component', `c:${component.id}`, ctx,
    [chevron(), rowTitle('h3', component.name, component.description), rowAside(component.status, slots, uptime)],
    h('div', { class: 'component-body' }, renderTimeline(slots, ctx)),
  );
}

function renderGroup(group, key, ctx) {
  const rows = group.components.map((c) => measure(c, ctx));
  // Combine at full length (days line up), then trim: the group starts with its earliest component.
  const slots = trimToMonitored(groupSlots(rows.map((r) => r.allSlots)));
  const uptime = average(rows.map((r) => r.uptime));

  return collapsible('group', key, ctx,
    [chevron(), rowTitle('h2', group.name, group.description), rowAside(group.status, slots, uptime)],
    h('div', { class: 'group-body' },
      renderTimeline(slots, ctx),
      h('div', { class: 'children' }, rows.map((row) => renderComponent(row, ctx))),
    ),
  );
}

/**
 * @param options.history   /api/history payload (or null while loading)
 * @param options.incidents active + recent incidents
 * @param options.expanded  remembered open/closed choices (see expanded.js)
 * @param options.timeZone  the page's time zone: strips show its calendar days
 */
export function renderGroups(groups, { history, incidents, days, expanded, timeZone }) {
  const ctx = {
    history,
    expanded,
    days,
    timeZone,
    axis: lastDates(days, timeZone),
    // Planned maintenance that hasn't started doesn't colour the strips.
    incidents: incidents.filter((i) => i.status !== 'scheduled'),
  };
  return groups.map((group, i) => renderGroup(group, `g${i}`, ctx));
}
