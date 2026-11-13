import { byId } from './dom.js';
import { OVERALL_LABELS, STATUS_LABELS, formatAgo } from './format.js';
import { componentNameMap, renderActiveIncidents, renderPastIncidents } from './incidents-view.js';
import { renderFooter, renderGroups, renderHeader } from './render.js';
import { applyTheme } from './theme.js';
import { attachTooltip } from './tooltip.js';

const STATUS_REFRESH_MS = 60_000;
const HISTORY_REFRESH_MS = 10 * 60_000;
const CLOCK_TICK_MS = 15_000;

const els = {
  header: byId('site-header'),
  banner: byId('banner'),
  bannerTitle: byId('banner-title'),
  bannerState: byId('banner-state'),
  bannerNotice: byId('banner-notice'),
  activeIncidents: byId('active-incidents'),
  updated: byId('updated'),
  groups: byId('groups'),
  pastIncidents: byId('past-incidents'),
  footer: byId('site-footer'),
};

const state = {
  status: null, // last good /api/status
  history: null, // last good /api/history
  failed: false, // did the latest status refresh fail?
  openKeys: new Set(), // expanded groups/components/incidents, kept across re-renders
};

// ---------- rendering ----------

function renderPageChrome(page) {
  document.title = page.title;
  applyTheme(page);
  els.header.replaceChildren(...renderHeader(page));
  els.footer.replaceChildren(...renderFooter(page));
  els.bannerNotice.textContent = page.notice ?? '';
  els.bannerNotice.hidden = !page.notice;
}

function renderUpdated() {
  const { status, failed } = state;
  if (!status) return;
  const ago = formatAgo(status.generatedAt);
  els.updated.textContent = failed ? `Couldn't refresh · last updated ${ago}` : `Updated ${ago}`;
}

function renderIncidents({ incidents, groups, page }) {
  // null = incidents not configured (or the database is unreachable): show nothing.
  els.pastIncidents.hidden = !incidents;
  if (!incidents) {
    els.activeIncidents.replaceChildren();
    return;
  }
  const names = componentNameMap(groups);
  els.activeIncidents.replaceChildren(...renderActiveIncidents(incidents.active, names, state.openKeys));
  els.pastIncidents.replaceChildren(...renderPastIncidents(incidents.recent, names, page.historyDays, state.openKeys));
}

function renderStatus() {
  const { status, history, openKeys } = state;

  if (!status) {
    els.banner.dataset.state = 'unknown';
    els.bannerTitle.textContent = 'Unable to load status right now';
    return;
  }

  const incidents = status.incidents ? [...status.incidents.active, ...status.incidents.recent] : [];

  els.banner.dataset.state = status.overall;
  els.bannerTitle.textContent = OVERALL_LABELS[status.overall];
  els.bannerState.textContent = STATUS_LABELS[status.overall];
  renderIncidents(status);
  els.groups.replaceChildren(
    ...renderGroups(status.groups, { history, incidents, days: status.page.historyDays, openKeys }),
  );
  renderUpdated();
}

// ---------- data ----------

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

async function refreshStatus() {
  try {
    const isFirstLoad = !state.status;
    state.status = await getJson('/api/status');
    state.failed = false;
    if (isFirstLoad) renderPageChrome(state.status.page);
  } catch (err) {
    console.error('Status refresh failed:', err);
    state.failed = true;
  }
  renderStatus();
}

async function refreshHistory() {
  try {
    state.history = await getJson('/api/history');
    renderStatus();
  } catch (err) {
    // Strips fall back to incidents only; live status is unaffected.
    console.error('History refresh failed:', err);
  }
}

// ---------- start ----------

// `toggle` doesn't bubble, so listen in the capture phase.
function rememberOpenState(container) {
  container.addEventListener('toggle', ({ target }) => {
    const { key } = target.dataset ?? {};
    if (!key) return;
    if (target.open) state.openKeys.add(key);
    else state.openKeys.delete(key);
  }, true);
}

for (const container of [els.groups, els.activeIncidents, els.pastIncidents]) {
  rememberOpenState(container);
}
attachTooltip(els.groups);
refreshStatus();
refreshHistory();

setInterval(refreshStatus, STATUS_REFRESH_MS);
setInterval(refreshHistory, HISTORY_REFRESH_MS);
setInterval(renderUpdated, CLOCK_TICK_MS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshStatus();
});
