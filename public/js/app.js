import { renderChrome } from './chrome.js';
import { getJson } from './data.js';
import { byId } from './dom.js';
import { OVERALL_LABELS, STATUS_LABELS, formatAgo } from './format.js';
import { createExpandedState } from './expanded.js';
import { statusIcon } from './icons.js';
import { componentNameMap, renderActiveIncidents, takesOverBanner } from './incidents-view.js';
import { renderGroups } from './render.js';
import { attachTooltip } from './tooltip.js';

const STATUS_REFRESH_MS = 60_000;
const HISTORY_REFRESH_MS = 10 * 60_000;
const CLOCK_TICK_MS = 15_000;

const els = {
  banner: byId('banner'),
  bannerIcon: byId('banner-icon'),
  bannerTitle: byId('banner-title'),
  bannerState: byId('banner-state'),
  bannerNotice: byId('banner-notice'),
  activeIncidents: byId('active-incidents'),
  updated: byId('updated'),
  explainerTz: byId('explainer-tz'),
  groups: byId('groups'),
};

const state = {
  status: null, // last good /api/status
  history: null, // last good /api/history (daily uptime)
  failed: false, // did the latest status refresh fail?
};

const expanded = createExpandedState(); // open/closed sections survive the refresh

// ---------- rendering ----------

function renderPageChrome(status) {
  document.title = status.page.title;
  renderChrome(status, { current: 'status' });
  els.bannerNotice.textContent = status.page.notice ?? '';
  els.bannerNotice.hidden = !status.page.notice;
  els.explainerTz.textContent = status.page.timezone;
}

function setBannerState(state, title) {
  els.banner.dataset.state = state;
  els.bannerIcon.replaceChildren(statusIcon(state));
  els.bannerTitle.textContent = title;
}

// The groups re-render every minute; keep a keyboard user's place in a strip across that.
function stripPlace() {
  const strip = document.activeElement?.closest?.('.strip[tabindex]');
  const key = strip?.closest('[data-key]')?.dataset.key;
  if (!key) return null;
  return { key, index: [...strip.children].indexOf(strip.querySelector('.seg-active')) };
}

function restoreStripPlace(place) {
  if (!place) return;
  const strip = els.groups.querySelector(`[data-key="${CSS.escape(place.key)}"] .strip[tabindex]`);
  if (!strip?.lastElementChild) return;
  const segment = strip.children[Math.min(place.index, strip.children.length - 1)] ?? strip.lastElementChild;
  segment.classList.add('seg-active'); // the tooltip's focus handler picks this up
  strip.focus();
}

function renderUpdated() {
  const { status, failed } = state;
  if (!status) return;
  const ago = formatAgo(status.generatedAt);
  els.updated.textContent = failed ? `Couldn't refresh · last updated ${ago}` : `Updated ${ago}`;
}

function renderStatus() {
  const { status, history } = state;

  if (!status) {
    // Still loading (e.g. the uptime history arrived first): keep the spinner until a load fails.
    if (state.failed) setBannerState('unknown', 'Unable to load status right now');
    return;
  }

  // null = incidents not set up (or the database is unreachable): show none.
  const open = status.incidents?.active ?? [];
  const incidents = status.incidents ? [...open, ...status.incidents.recent] : [];

  // Like Railway: while an incident is open, its card replaces the status banner.
  els.banner.hidden = open.some(takesOverBanner);
  setBannerState(status.overall, OVERALL_LABELS[status.overall]);
  els.bannerState.textContent = STATUS_LABELS[status.overall];
  els.activeIncidents.replaceChildren(
    ...renderActiveIncidents(open, componentNameMap(status.groups), expanded),
  );
  const place = stripPlace();
  els.groups.replaceChildren(
    ...renderGroups(status.groups, {
      history, incidents, expanded, days: status.page.historyDays, timeZone: status.page.timezone,
    }),
  );
  restoreStripPlace(place);
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

for (const container of [els.groups, els.activeIncidents]) expanded.track(container);
els.bannerIcon.replaceChildren(statusIcon('loading'));
attachTooltip(els.groups);
refreshStatus();
refreshHistory();

setInterval(refreshStatus, STATUS_REFRESH_MS);
setInterval(refreshHistory, HISTORY_REFRESH_MS);
setInterval(renderUpdated, CLOCK_TICK_MS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshStatus();
});
