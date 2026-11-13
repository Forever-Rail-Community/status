// /history: resolved incidents, grouped by month.
import { renderChrome } from './chrome.js';
import { getJson } from './data.js';
import { byId, h } from './dom.js';
import { renderIncidentHistory } from './incidents-view.js';

const container = byId('history');

async function start() {
  let status;
  try {
    status = await getJson('/api/status');
  } catch (err) {
    console.error('Loading history failed:', err);
    container.replaceChildren(h('p', { class: 'muted-note' }, 'Unable to load incident history right now.'));
    return;
  }

  document.title = `History · ${status.page.title}`;
  renderChrome(status, { current: 'history' });

  if (!status.incidents) {
    container.replaceChildren(h('p', { class: 'muted-note' }, 'Incident history is not available.'));
    return;
  }
  container.replaceChildren(
    ...renderIncidentHistory(status.incidents.recent, status.page.historyDays),
  );
}

start();
