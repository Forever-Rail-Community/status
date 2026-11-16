import { byId, h } from '../dom.js';
import { applyTheme, renderThemeSwitcher } from '../theme.js';
import { ApiError, api } from './api.js';
import { incidentLists, messageView, newIncidentForm, routesSection, signInView } from './views.js';

const root = byId('admin');
const actionsBar = byId('admin-actions');
const footer = byId('admin-footer');

// Used when the server couldn't send the site's settings (e.g. admin not configured).
const FALLBACK_PAGE = { title: 'Status', theme: 'dark', accent: null };

function applyPage(page) {
  applyTheme(page);
  footer.replaceChildren(renderThemeSwitcher(page));
}

let meta = null; // from /api/admin/session
const listContainer = h('div', { class: 'admin-lists' });
const routesContainer = h('div');
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

function renderRoutes(states) {
  routesContainer.replaceChildren(routesSection(meta.routes, states, (id, state) =>
    api.setRouteState(id, state).then(renderRoutes)));
}

async function refreshRoutes() {
  if (meta.routes.length > 0) renderRoutes(await api.routeStates());
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
    routesContainer,
    listContainer,
  );
}

async function start() {
  try {
    meta = await api.session();
  } catch (err) {
    applyPage(err instanceof ApiError && err.data?.page ? err.data.page : FALLBACK_PAGE);
    if (err instanceof ApiError && err.status === 401) {
      root.replaceChildren(signInView(new URLSearchParams(location.search).get('error')));
    } else {
      root.replaceChildren(messageView('Admin is unavailable', err.message));
    }
    return;
  }

  applyPage(meta.page);
  document.title = `${meta.page.title} · Admin`;
  renderSignedIn(meta.user);
  history.replaceState(null, '', location.pathname); // drop ?error= after a good sign-in
  await Promise.all([refreshIncidents(), refreshRoutes()]);
}

start();
