import { h } from './dom.js';
import { STATUS_LABELS, average, formatShortDay, formatUptime } from './format.js';
import { routeIcon } from './icons.js';
import {
  componentSlots,
  groupSlots,
  incidentUptime,
  lastDates,
  parentSlots,
  rangeUptime,
  renderStrip,
  trimToMonitored,
} from './strip.js';

// ---------- row building blocks ----------

const chevron = () => h('span', { class: 'chevron', 'aria-hidden': 'true' });

const infoIcon = (text) =>
  h('span', { class: 'info', role: 'img', 'aria-label': text, dataset: { tip: text } }, 'i');

/** Routes (pausable components) lead with a running / unplugged / paused icon. */
const routeBadge = (component) =>
  component.pausable && h('span', { class: 'route-icon', dataset: { state: component.status } }, routeIcon(component.status));

const rowTitle = (tag, name, description, component) =>
  h('div', { class: 'row-title' },
    component && routeBadge(component),
    h(tag, { class: 'row-name' }, name),
    description && infoIcon(description),
  );

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
 * Everything a component needs to draw: full-length slots (for combining into its
 * parent), trimmed slots (for display), uptime, and the same for its sub-components.
 * A component with sub-components (Run8 → routes) combines its own monitor with them,
 * the same way a group combines its components.
 */
function measure(component, ctx) {
  const incidents = ctx.incidents.filter((i) => i.components.includes(component.id));
  const monitored = component.source === 'hetrix';
  const days = ctx.history?.components[component.id];
  const ownSlots = componentSlots({
    days,
    incidents,
    pauses: ctx.pauses.get(component.id) ?? [],
    axis: ctx.axis,
    baseLevel: monitored ? 'none' : 'operational',
    timeZone: ctx.timeZone,
  });
  // Monitors: HetrixTools' daily uptime (paused days left out; the overall figure until
  // the daily history loads). Manual components: time not under an outage incident.
  const ownUptime = monitored
    ? (days ? rangeUptime(trimToMonitored(ownSlots)) : component.uptime)
    : incidentUptime(incidents, trimToMonitored(ownSlots)[0].date, ctx.timeZone);

  const children = component.components.map((c) => measure(c, ctx));
  const allSlots = children.length ? parentSlots(ownSlots, children.map((c) => c.allSlots)) : ownSlots;
  const uptime = children.length ? average([ownUptime, ...children.map((c) => c.uptime)]) : ownUptime;
  return { component, allSlots, slots: trimToMonitored(allSlots), uptime, children };
}

function renderComponent({ component, slots, uptime, children }, ctx) {
  return collapsible('component', `c:${component.id}`, ctx,
    [chevron(), rowTitle('h3', component.name, component.description, component), rowAside(component.status, slots, uptime)],
    h('div', { class: 'component-body' },
      renderTimeline(slots, ctx),
      children.length > 0 && h('div', { class: 'children' }, children.map((child) => renderComponent(child, ctx))),
    ),
  );
}

// ---------- grid ----------

const uptimeLine = (slots, uptime) =>
  uptime === null ? 'No uptime data yet' : `${formatUptime(uptime)} · since ${formatShortDay(slots[0].date)}`;

/** A sub-component (route) as a small chip inside its parent's tile. */
const chip = ({ component }) =>
  h('span', { class: 'chip', dataset: { tip: STATUS_LABELS[component.status] } },
    component.pausable
      ? routeBadge(component)
      : h('span', { class: 'chip-dot', dataset: { state: component.status } }),
    component.name,
  );

function renderTile({ component, slots, uptime, children }) {
  return h('article', { class: 'tile' },
    h('div', { class: 'tile-head' }, rowTitle('h3', component.name, component.description, component)),
    h('div', { class: 'tile-status' }, statusLabel(component.status), renderStrip(slots, { compact: true })),
    h('p', { class: 'tile-uptime' }, uptimeLine(slots, uptime)),
    children.length > 0 && h('div', { class: 'chips' }, children.map(chip)),
  );
}

// ---------- groups ----------

function renderGroup(group, key, ctx) {
  const rows = group.components.map((c) => measure(c, ctx));
  // Combine at full length (days line up), then trim: the group starts with its earliest component.
  const slots = trimToMonitored(groupSlots(rows.map((r) => r.allSlots)));
  const uptime = average(rows.map((r) => r.uptime));
  const grid = (ctx.layout ?? group.layout) === 'grid';

  return collapsible('group', key, ctx,
    [chevron(), rowTitle('h2', group.name, group.description), rowAside(group.status, slots, uptime)],
    h('div', { class: 'group-body' },
      renderTimeline(slots, ctx),
      grid
        ? h('div', { class: 'tiles' }, rows.map(renderTile))
        : h('div', { class: 'children' }, rows.map((row) => renderComponent(row, ctx))),
    ),
  );
}

/**
 * @param options.history   /api/history payload (or null while loading)
 * @param options.incidents active + recent incidents
 * @param options.expanded  remembered open/closed choices (see expanded.js)
 * @param options.timeZone  the page's time zone: strips show its calendar days
 * @param options.pauses    when routes were paused (from /api/status)
 * @param options.layout    the visitor's 'rows' / 'grid' choice, or null for each group's default
 */
export function renderGroups(groups, { history, incidents, days, expanded, timeZone, pauses = [], layout = null }) {
  const pausesByComponent = new Map();
  for (const p of pauses) pausesByComponent.set(p.component, [...(pausesByComponent.get(p.component) ?? []), p]);

  const ctx = {
    history,
    expanded,
    days,
    timeZone,
    layout,
    pauses: pausesByComponent,
    axis: lastDates(days, timeZone),
    // Planned maintenance that hasn't started doesn't colour the strips.
    incidents: incidents.filter((i) => i.status !== 'scheduled'),
  };
  return groups.map((group, i) => renderGroup(group, `g${i}`, ctx));
}
