// /incidents/:id (served by a rewrite in vercel.json): one incident and its full timeline.
import { renderChrome } from './chrome.js';
import { getJson } from './data.js';
import { byId, h } from './dom.js';
import { renderIncidentPage } from './incidents-view.js';

const container = byId('incident');
const showMessage = (text) => container.replaceChildren(h('p', { class: 'history-empty' }, text));

async function start() {
  const id = location.pathname.split('/').filter(Boolean)[1] ?? '';
  const data = await getJson(`/api/incident?id=${encodeURIComponent(id)}`);
  renderChrome(data, { current: 'incident' });

  if (!data.incident) {
    document.title = `Incident not found · ${data.page.title}`;
    showMessage("This incident doesn't exist or has been removed.");
    return;
  }
  document.title = `${data.incident.title} · ${data.page.title}`;
  container.replaceChildren(...renderIncidentPage(data.incident, new Map(Object.entries(data.componentNames))));
}

start().catch((err) => {
  console.error('Loading incident failed:', err);
  showMessage('Unable to load this incident right now.');
});
