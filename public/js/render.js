import { h } from './dom.js';
import { STATUS_LABELS, formatUptime } from './format.js';
import { componentSlots, groupSlots, lastDates, rangeUptime, renderStrip } from './strip.js';

// ---------- header & footer (rendered once; they only change on redeploy) ----------

function renderBrand({ title, header }) {
  const { logo, showTitle } = header;
  const content = [
    logo && h('img', { class: 'logo', src: logo.src, alt: logo.alt, style: { height: `${logo.height}px` } }),
    // A hidden title stays in the page for screen readers.
    h('h1', { class: showTitle ? 'brand-title' : 'sr-only' }, title),
  ];
  return logo?.href
    ? h('a', { class: 'brand', href: logo.href }, content)
    : h('div', { class: 'brand' }, content);
}

const renderLinks = (links, className) =>
  links.map((l) => h('a', { class: className, href: l.href }, l.label));

export function renderHeader(page) {
  const { links, button } = page.header;
  return [
    renderBrand(page),
    links.length > 0 && h('nav', { class: 'nav' }, renderLinks(links, 'pill')),
    button && h('div', { class: 'actions' }, renderLinks([button], 'pill')),
  ].filter(Boolean);
}

export function renderFooter({ footer }) {
  return [
    footer.text && h('p', { class: 'footer-text' }, footer.text),
    footer.links.length > 0 && h('nav', { class: 'footer-links' }, renderLinks(footer.links, 'footer-link')),
    footer.poweredBy && h('p', { class: 'powered-by' },
      'Powered by ', h('a', { href: 'https://hetrixtools.com', rel: 'noopener' }, 'HetrixTools'),
    ),
  ].filter(Boolean);
}

// ---------- row building blocks ----------

const chevron = () => h('span', { class: 'chevron', 'aria-hidden': 'true' });

const infoIcon = (text) =>
  h('span', { class: 'info', role: 'img', 'aria-label': text, dataset: { tip: text } }, 'i');

const rowTitle = (tag, name, description) =>
  h('div', { class: 'row-title' }, h(tag, { class: 'row-name' }, name), description && infoIcon(description));

const statusLabel = (status) =>
  h('span', { class: 'status-label', dataset: { state: status } }, STATUS_LABELS[status]);

/** Strip + uptime %, with the live status when it isn't operational or there's no uptime to show. */
function rowAside(status, slots, uptime) {
  return h('div', { class: 'row-aside' },
    (status !== 'operational' || uptime === null) && statusLabel(status),
    renderStrip(slots, { compact: true }),
    uptime !== null && h('span', { class: 'uptime' }, `${formatUptime(uptime)} uptime`),
  );
}

function renderTimeline(slots) {
  return h('div', { class: 'timeline' },
    h('div', { class: 'timeline-labels' }, h('span', {}, `${slots.length} days ago`), h('span', {}, 'Today')),
    renderStrip(slots),
  );
}

/** <details> that remembers being open across re-renders. */
const collapsible = (className, key, ctx, summary, body) =>
  h('details', { class: className, 'data-key': key, open: ctx.openKeys.has(key) },
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

function renderComponent(component, slots, ctx) {
  const uptime = component.source === 'hetrix' ? (rangeUptime(slots) ?? component.uptime) : null;
  return collapsible('component', `c:${component.id}`, ctx,
    [chevron(), rowTitle('h3', component.name, component.description), rowAside(component.status, slots, uptime)],
    h('div', { class: 'component-body' }, renderTimeline(slots)),
  );
}

function renderGroup(group, key, ctx) {
  const slotsByComponent = group.components.map((c) => [c, slotsFor(c, ctx)]);
  const slots = groupSlots(slotsByComponent.map(([, s]) => s));

  return collapsible('group', key, ctx,
    [chevron(), rowTitle('h2', group.name, group.description), rowAside(group.status, slots, rangeUptime(slots))],
    h('div', { class: 'group-body' },
      renderTimeline(slots),
      h('div', { class: 'children' }, slotsByComponent.map(([c, s]) => renderComponent(c, s, ctx))),
    ),
  );
}

/**
 * @param options.history   /api/history payload (or null while loading)
 * @param options.incidents active + recent incidents
 * @param options.openKeys  Set of data-key values whose <details> should render open
 */
export function renderGroups(groups, { history, incidents, days, openKeys }) {
  const ctx = {
    history,
    openKeys,
    axis: lastDates(days),
    // Planned maintenance that hasn't started doesn't colour the strips.
    incidents: incidents.filter((i) => i.status !== 'scheduled'),
  };
  return groups.map((group, i) => renderGroup(group, `g${i}`, ctx));
}
