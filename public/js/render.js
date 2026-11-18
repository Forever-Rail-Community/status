import { h } from './dom.js';
import { STATUS_LABELS, average, formatShortDay, formatUptime } from './format.js';
import { routeIcon } from './icons.js';
import {
  componentSlots,
  groupSlots,
  manualUptime,
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

/** Routes lead with a running / unplugged / paused icon. */
const routeBadge = (component) =>
  component.route && h('span', { class: 'route-icon', dataset: { state: component.status } }, routeIcon(component.status));

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
/**
 * @param inherited  maintenance on a parent, which covers its sub-components too
 */
function measure(component, ctx, inherited = []) {
  const own = ctx.incidents.filter((i) => i.components.includes(component.id));
  // A window listing both Run8 and one of its routes is counted once.
  const incidents = [...own, ...inherited.filter((i) => !own.includes(i))];
  const periods = ctx.routePeriods.get(component.id) ?? [];
  const monitored = component.source === 'hetrix';
  const days = ctx.history?.components[component.id];
  const ownSlots = componentSlots({
    days,
    incidents,
    periods,
    axis: ctx.axis,
    // Monitors and routes show no data until they have some; manual components start operational.
    baseLevel: monitored || component.route ? 'none' : 'operational',
    timeZone: ctx.timeZone,
  });
  // Monitors: HetrixTools' daily uptime (its overall figure until the daily history loads).
  // Manual components and routes: time not under an outage incident or set Down. A route
  // that has never been set has no uptime yet.
  let ownUptime;
  if (monitored) ownUptime = days ? rangeUptime(trimToMonitored(ownSlots)) : component.uptime;
  else if (component.route && periods.length === 0) ownUptime = null;
  else ownUptime = manualUptime(incidents, trimToMonitored(ownSlots)[0].date, ctx.timeZone, { periods });

  const maintenance = incidents.filter((i) => i.impact === 'maintenance');
  const children = component.components.map((c) => measure(c, ctx, maintenance));
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
    component.route
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
 * @param options.routeStates  when routes were Down or Paused (from /api/status)
 * @param options.layout    the visitor's 'rows' / 'grid' choice, or null for each group's default
 */
export function renderGroups(groups, { history, incidents, days, expanded, timeZone, routeStates = [], layout = null }) {
  const routePeriods = new Map();
  for (const p of routeStates) routePeriods.set(p.component, [...(routePeriods.get(p.component) ?? []), p]);

  const ctx = {
    history,
    expanded,
    days,
    timeZone,
    layout,
    routePeriods,
    axis: lastDates(days, timeZone),
    // Planned maintenance that hasn't started doesn't colour the strips.
    incidents: incidents.filter((i) => i.status !== 'scheduled'),
  };
  return groups.map((group, i) => renderGroup(group, `g${i}`, ctx));
}
