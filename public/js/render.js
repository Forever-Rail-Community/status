import { h } from './dom.js';
import { STATUS_LABELS, formatShortDay, formatUptime } from './format.js';
import {
  componentSlots,
  groupSlots,
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

function rowAside(status, slots, uptime, ctx) {
  const since = startedOn(slots, ctx);
  return h('div', { class: 'row-aside' },
    (status !== 'operational' || uptime === null) && statusLabel(status),
    renderStrip(slots, { compact: true }),
    uptime !== null && h('span', { class: 'uptime' },
      since ? `${formatUptime(uptime)} · since ${since}` : `${formatUptime(uptime)} uptime`),
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

function slotsFor(component, ctx) {
  return componentSlots({
    days: ctx.history?.components[component.id],
    incidents: ctx.incidents.filter((i) => i.components.includes(component.id)),
    axis: ctx.axis,
    baseLevel: component.source === 'hetrix' ? 'none' : 'operational',
  });
}

function renderComponent(component, allSlots, ctx) {
  const slots = trimToMonitored(allSlots);
  const uptime = component.source === 'hetrix' ? (rangeUptime(slots) ?? component.uptime) : null;
  return collapsible('component', `c:${component.id}`, ctx,
    [chevron(), rowTitle('h3', component.name, component.description), rowAside(component.status, slots, uptime, ctx)],
    h('div', { class: 'component-body' }, renderTimeline(slots, ctx)),
  );
}

function renderGroup(group, key, ctx) {
  const slotsByComponent = group.components.map((c) => [c, slotsFor(c, ctx)]);
  // Combine at full length (days line up), then trim: the group starts with its earliest component.
  const slots = trimToMonitored(groupSlots(slotsByComponent.map(([, s]) => s)));

  return collapsible('group', key, ctx,
    [chevron(), rowTitle('h2', group.name, group.description), rowAside(group.status, slots, rangeUptime(slots), ctx)],
    h('div', { class: 'group-body' },
      renderTimeline(slots, ctx),
      h('div', { class: 'children' }, slotsByComponent.map(([c, s]) => renderComponent(c, s, ctx))),
    ),
  );
}

/**
 * @param options.history   /api/history payload (or null while loading)
 * @param options.incidents active + recent incidents
 * @param options.expanded  remembered open/closed choices (see expanded.js)
 */
export function renderGroups(groups, { history, incidents, days, expanded }) {
  const ctx = {
    history,
    expanded,
    days,
    axis: lastDates(days),
    // Planned maintenance that hasn't started doesn't colour the strips.
    incidents: incidents.filter((i) => i.status !== 'scheduled'),
  };
  return groups.map((group, i) => renderGroup(group, `g${i}`, ctx));
}
