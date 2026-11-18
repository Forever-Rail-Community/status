// Admin views. Each form gets an `onSubmit(values)` that returns a promise;
// the form disables itself while saving and shows any error inline.

import { h } from '../dom.js';
import { componentNameMap } from '../incidents-view.js';
import { routeIcon } from '../icons.js';
import {
  IMPACT_LABELS,
  INCIDENT_STATUS_LABELS,
  formatAgo,
  formatDateTime,
  formatWindow,
} from '../format.js';
import {
  announceCheckbox,
  componentPicker,
  formValues,
  impactSelect,
  messageInput,
  statusSelect,
  templatePicker,
  titleInput,
  windowInputs,
} from './fields.js';

function asyncForm(className, children, submitLabel, onSubmit) {
  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, submitLabel);
  const form = h('form', { class: className }, children, h('div', { class: 'form-actions' }, error, submit));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    submit.disabled = true;
    try {
      await onSubmit(formValues(form), form);
    } catch (err) {
      error.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}

// ---------- sign-in / messages ----------

const LOGIN_ERRORS = {
  not_admin: "That Discord account isn't allowed to manage this status page.",
  login_failed: 'Sign-in failed. Please try again.',
};

export function signInView(errorCode) {
  return h('section', { class: 'card center' },
    h('h2', {}, 'Sign in to manage incidents'),
    errorCode && h('p', { class: 'form-error' }, LOGIN_ERRORS[errorCode] ?? LOGIN_ERRORS.login_failed),
    h('a', { class: 'btn btn-primary', href: '/api/auth/login' }, 'Sign in with Discord'),
  );
}

export const messageView = (title, text) =>
  h('section', { class: 'card center' }, h('h2', {}, title), h('p', { class: 'muted' }, text));

// ---------- routes ----------

const ROUTE_CHOICES = [
  { state: 'up', label: 'Up', status: 'operational' },
  { state: 'down', label: 'Down', status: 'major_outage' },
  { state: 'paused', label: 'Paused', status: 'paused' },
];

/**
 * An Up / Down / Paused switch per route.
 * @param states    id → { state, since } for routes that aren't Up (from /api/admin/route-states)
 * @param onChange  (id, state) => Promise; the list re-renders from the server's answer
 */
export function routesSection(routes, states, onChange) {
  const item = (r) => {
    const current = states[r.id] ?? { state: 'up', since: null };
    const choice = ROUTE_CHOICES.find((c) => c.state === current.state);

    const buttons = ROUTE_CHOICES.map((c) => {
      const button = h('button', {
        type: 'button', class: 'switcher-option', 'aria-pressed': String(c.state === current.state),
      }, c.label);
      button.addEventListener('click', async () => {
        if (c.state === current.state) return;
        for (const b of buttons) b.disabled = true;
        try {
          await onChange(r.id, c.state);
        } catch (err) {
          for (const b of buttons) b.disabled = false;
          button.title = err.message;
        }
      });
      return button;
    });

    return h('li', { class: 'route-item' },
      h('span', { class: 'route-icon', dataset: { state: choice.status } }, routeIcon(choice.status)),
      h('div', {},
        h('div', { class: 'route-name' }, r.parent ? `${r.parent} · ${r.name}` : r.name),
        h('div', { class: 'route-meta' },
          current.since ? `${choice.label} since ${formatDateTime(current.since)}` : choice.label),
      ),
      h('div', { class: 'switcher route-switch', role: 'group', 'aria-label': `${r.name} state` }, buttons),
    );
  };

  return h('section', { class: 'card' },
    h('h2', {}, 'Routes'),
    h('p', { class: 'muted small' },
      'Set each route by hand. Down counts as an outage; Paused shows "Not running" and doesn\'t count toward uptime.'),
    h('ul', { class: 'route-list' }, routes.map(item)),
  );
}

// ---------- incidents ----------

export function newIncidentForm(meta, onSubmit) {
  return h('section', { class: 'card' },
    h('h2', {}, 'New incident'),
    asyncForm('incident-form', [
      templatePicker(meta.templates ?? []),
      titleInput(),
      h('div', { class: 'field-row' }, impactSelect(meta.impacts), statusSelect(meta.statuses)),
      componentPicker(meta.groups),
      messageInput('What are players seeing? What are you doing about it?'),
      announceCheckbox(meta.discord),
    ], 'Post incident', async (values, form) => {
      await onSubmit(values);
      form.reset();
    }),
  );
}

/** Schedule maintenance: a window, what it affects and what's happening. */
export function newMaintenanceForm(meta, onSubmit) {
  return h('details', { class: 'card card-collapsible' },
    h('summary', {}, h('h2', {}, 'Schedule maintenance')),
    h('p', { class: 'muted small' },
      'Shows as upcoming right away, turns to in progress at the start and completes at the end on its own. Downtime during the window doesn\'t count as an outage.'),
    asyncForm('incident-form', [
      titleInput('', 'e.g. Run8 server updates'),
      windowInputs(),
      componentPicker(meta.groups),
      messageInput('What will be done, and what will players notice?'),
      announceCheckbox(meta.discord),
    ], 'Schedule', async (values, form) => {
      await onSubmit(values);
      form.reset();
    }),
  );
}

const badge = (state, text) => h('span', { class: 'badge', dataset: { state } }, text);

/** Finished maintenance reads "Completed"; upcoming maintenance is blue. */
const statusBadge = (incident) =>
  badge(
    incident.resolvedAt ? 'operational' : incident.status === 'scheduled' ? 'maintenance' : incident.impact,
    incident.window && incident.resolvedAt ? 'Completed' : INCIDENT_STATUS_LABELS[incident.status],
  );

function timeline(updates) {
  return h('ol', { class: 'timeline-list' },
    updates.map((u) =>
      h('li', {},
        h('div', { class: 'update-meta' },
          h('strong', {}, INCIDENT_STATUS_LABELS[u.status]),
          h('span', { class: 'muted', title: formatDateTime(u.createdAt) },
            `${formatAgo(Date.parse(u.createdAt))}${u.author ? ` · ${u.author}` : ''}`),
        ),
        h('p', { class: 'update-message' }, u.message),
      ),
    ),
  );
}

function deleteButton(onDelete) {
  // Two clicks instead of confirm(): no blocking browser dialog.
  const button = h('button', { class: 'btn btn-danger', type: 'button' }, 'Delete');
  let armed = false;
  button.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      button.textContent = 'Click again to delete';
      setTimeout(() => {
        armed = false;
        button.textContent = 'Delete';
      }, 4000);
      return;
    }
    button.disabled = true;
    await onDelete();
  });
  return button;
}

function incidentCard(incident, meta, actions) {
  const nextStatus = incident.resolvedAt ? 'monitoring' : incident.status;
  const componentNames = componentNameMap(meta.groups);

  const updateForm = asyncForm('update-form', [
    h('div', { class: 'field-row' }, statusSelect(meta.statuses, nextStatus)),
    messageInput(incident.resolvedAt ? 'Reopening? Explain what happened.' : 'Latest progress…'),
    announceCheckbox(meta.discord),
  ], 'Post update', (values) => actions.update(incident.id, values));

  const edit = h('details', { class: 'subsection' },
    h('summary', {}, 'Edit details'),
    asyncForm('incident-form', [
      titleInput(incident.title),
      // Maintenance keeps its impact; its window can be moved or extended instead.
      incident.window ? windowInputs(incident.window) : impactSelect(meta.impacts, incident.impact),
      componentPicker(meta.groups, incident.components),
    ], 'Save changes', (values) => actions.edit(incident.id, values)),
  );

  return h('article', { class: 'card incident-admin', dataset: { state: incident.impact } },
    h('header', { class: 'incident-admin-head' },
      h('div', {},
        h('h3', {}, incident.title),
        h('p', { class: 'muted' },
          incident.window
            ? `#${incident.id} · ${formatWindow(incident.window)}`
            : `#${incident.id} · opened ${formatDateTime(incident.createdAt)}`,
          incident.resolvedAt && ` · ${incident.window ? 'completed' : 'resolved'} ${formatDateTime(incident.resolvedAt)}`,
        ),
      ),
      h('div', { class: 'badges' },
        badge(incident.impact, IMPACT_LABELS[incident.impact]),
        statusBadge(incident),
      ),
    ),
    h('p', { class: 'muted small' },
      'Affects: ',
      incident.components.length
        ? incident.components.map((id) => componentNames.get(id) ?? `${id} (removed)`).join(', ')
        : 'whole page',
    ),
    incident.resolvedAt
      ? h('details', { class: 'subsection' }, h('summary', {}, 'Post an update or reopen'), updateForm)
      : updateForm,
    timeline(incident.updates),
    h('footer', { class: 'incident-admin-foot' }, edit, deleteButton(() => actions.remove(incident.id))),
  );
}

export function incidentLists(incidents, meta, actions) {
  const unresolved = incidents.filter((i) => !i.resolvedAt);
  const open = unresolved.filter((i) => i.status !== 'scheduled');
  const upcoming = unresolved.filter((i) => i.status === 'scheduled')
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const resolved = incidents.filter((i) => i.resolvedAt);
  const section = (title, items, empty) =>
    h('section', { class: 'admin-section' },
      h('h2', {}, title, h('span', { class: 'count' }, String(items.length))),
      items.length ? items.map((i) => incidentCard(i, meta, actions)) : h('p', { class: 'muted' }, empty),
    );

  return [
    section('Open incidents', open, 'Nothing open. All clear.'),
    upcoming.length > 0 && section('Upcoming maintenance', upcoming, ''),
    section('Resolved (last 90 days)', resolved, 'No resolved incidents yet.'),
  ];
}
