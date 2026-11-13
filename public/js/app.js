import { renderChrome } from './chrome.js';
import { getJson } from './data.js';
import { byId } from './dom.js';
import { OVERALL_LABELS, STATUS_LABELS, formatAgo } from './format.js';
import { componentNameMap, renderActiveIncidents } from './incidents-view.js';
import { renderGroups } from './render.js';
import { attachTooltip } from './tooltip.js';

const STATUS_REFRESH_MS = 60_000;
const HISTORY_REFRESH_MS = 10 * 60_000;
const CLOCK_TICK_MS = 15_000;

const els = {
  banner: byId('banner'),
  bannerTitle: byId('banner-title'),
  bannerState: byId('banner-state'),
  bannerNotice: byId('banner-notice'),
  activeIncidents: byId('active-incidents'),
  updated: byId('updated'),
  groups: byId('groups'),
};

const state = {
  status: null, // last good /api/status
  history: null, // last good /api/history (daily uptime)
  failed: false, // did the latest status refresh fail?
  openKeys: new Set(), // expanded groups/components, kept across re-renders
};

// ---------- rendering ----------

function renderPageChrome(status) {
  document.title = status.page.title;
  renderChrome(status, { current: 'status' });
  els.bannerNotice.textContent = status.page.notice ?? '';
  els.bannerNotice.hidden = !status.page.notice;
}

function renderUpdated() {
  const { status, failed } = state;
  if (!status) return;
  const ago = formatAgo(status.generatedAt);
  els.updated.textContent = failed ? `Couldn't refresh · last updated ${ago}` : `Updated ${ago}`;
}

function renderStatus() {
  const { status, history, openKeys } = state;

  if (!status) {
    els.banner.dataset.state = 'unknown';
    els.bannerTitle.textContent = 'Unable to load status right now';
    return;
  }

  // null = incidents not set up (or the database is unreachable): show none.
  const incidents = status.incidents ? [...status.incidents.active, ...status.incidents.recent] : [];

  els.banner.dataset.state = status.overall;
  els.bannerTitle.textContent = OVERALL_LABELS[status.overall];
  els.bannerState.textContent = STATUS_LABELS[status.overall];
  els.activeIncidents.replaceChildren(
    ...renderActiveIncidents(status.incidents?.active ?? [], componentNameMap(status.groups)),
  );
  els.groups.replaceChildren(
    ...renderGroups(status.groups, { history, incidents, days: status.page.historyDays, openKeys }),
  );
  renderUpdated();
}

// ---------- data ----------

async function refreshStatus() {
  try {
    const isFirstLoad = !state.status;
    state.status = await getJson('/api/status');
    state.failed = false;
    if (isFirstLoad) renderPageChrome(state.status);
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

// Keeps expanded groups/components open across refreshes.
// `toggle` doesn't bubble, so listen in the capture phase.
function rememberOpenState(container) {
  container.addEventListener('toggle', ({ target }) => {
    const { key } = target.dataset ?? {};
    if (!key) return;
    if (target.open) state.openKeys.add(key);
    else state.openKeys.delete(key);
  }, true);
}

rememberOpenState(els.groups);
attachTooltip(els.groups);
refreshStatus();
refreshHistory();

setInterval(refreshStatus, STATUS_REFRESH_MS);
setInterval(refreshHistory, HISTORY_REFRESH_MS);
setInterval(renderUpdated, CLOCK_TICK_MS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshStatus();
});
