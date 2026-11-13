import { byId, h } from '../dom.js';
import { applyTheme } from '../theme.js';
import { ApiError, api } from './api.js';
import { incidentLists, messageView, newIncidentForm, signInView } from './views.js';

const root = byId('admin');
const actionsBar = byId('admin-actions');

let meta = null; // from /api/admin/session
const listContainer = h('div', { class: 'admin-lists' });
const notice = h('p', { class: 'admin-notice', role: 'status' });

// The incident is saved either way; only the Discord post can fail.
function reportDiscord(result) {
  notice.textContent = result?.discord === 'failed'
    ? 'Saved, but the Discord announcement failed. Check the Vercel logs for details.'
    : '';
}

async function refreshIncidents() {
  const incidents = await api.incidents();
  listContainer.replaceChildren(...incidentLists(incidents, meta, incidentActions));
}

// Every change re-fetches the list, so what's shown is always what's stored.
const incidentActions = {
  update: (id, values) => api.postUpdate(id, values).then(reportDiscord).then(refreshIncidents),
  edit: (id, values) => api.editIncident(id, values).then(refreshIncidents),
  remove: (id) => api.deleteIncident(id).then(refreshIncidents),
};

function renderSignedIn(user) {
  const signOut = h('button', { class: 'pill', type: 'button' }, 'Sign out');
  signOut.addEventListener('click', async () => {
    await api.logout();
    location.reload();
  });
  actionsBar.prepend(h('span', { class: 'muted small' }, user.name), signOut);

  root.replaceChildren(
    notice,
    newIncidentForm(meta, (values) => api.createIncident(values).then(reportDiscord).then(refreshIncidents)),
    listContainer,
  );
}

async function start() {
  try {
    meta = await api.session();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      root.replaceChildren(signInView(new URLSearchParams(location.search).get('error')));
    } else {
      root.replaceChildren(messageView('Admin is unavailable', err.message));
    }
    return;
  }

  applyTheme(meta.page);
  document.title = `${meta.page.title} · Admin`;
  renderSignedIn(meta.user);
  history.replaceState(null, '', location.pathname); // drop ?error= after a good sign-in
  await refreshIncidents();
}

start();
