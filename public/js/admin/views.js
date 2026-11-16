// Admin views. Each form gets an `onSubmit(values)` that returns a promise;
// the form disables itself while saving and shows any error inline.

import { h } from '../dom.js';
import {
  IMPACT_LABELS,
  INCIDENT_STATUS_LABELS,
  formatAgo,
  formatDateTime,
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

const badge = (state, text) => h('span', { class: 'badge', dataset: { state } }, text);

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
  const componentNames = new Map(meta.groups.flatMap((g) => g.components.map((c) => [c.id, c.name])));

  const updateForm = asyncForm('update-form', [
    h('div', { class: 'field-row' }, statusSelect(meta.statuses, nextStatus)),
    messageInput(incident.resolvedAt ? 'Reopening? Explain what happened.' : 'Latest progress…'),
    announceCheckbox(meta.discord),
  ], 'Post update', (values) => actions.update(incident.id, values));

  const edit = h('details', { class: 'subsection' },
    h('summary', {}, 'Edit details'),
    asyncForm('incident-form', [
      titleInput(incident.title),
      impactSelect(meta.impacts, incident.impact),
      componentPicker(meta.groups, incident.components),
    ], 'Save changes', (values) => actions.edit(incident.id, values)),
  );

  return h('article', { class: 'card incident-admin', dataset: { state: incident.impact } },
    h('header', { class: 'incident-admin-head' },
      h('div', {},
        h('h3', {}, incident.title),
        h('p', { class: 'muted' },
          `#${incident.id} · opened ${formatDateTime(incident.createdAt)}`,
          incident.resolvedAt && ` · resolved ${formatDateTime(incident.resolvedAt)}`,
        ),
      ),
      h('div', { class: 'badges' },
        badge(incident.impact, IMPACT_LABELS[incident.impact]),
        badge(incident.resolvedAt ? 'operational' : incident.impact, INCIDENT_STATUS_LABELS[incident.status]),
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
  const open = incidents.filter((i) => !i.resolvedAt);
  const resolved = incidents.filter((i) => i.resolvedAt);
  const section = (title, items, empty) =>
    h('section', { class: 'admin-section' },
      h('h2', {}, title, h('span', { class: 'count' }, String(items.length))),
      items.length ? items.map((i) => incidentCard(i, meta, actions)) : h('p', { class: 'muted' }, empty),
    );

  return [
    section('Open incidents', open, 'Nothing open. All clear.'),
    section('Resolved (last 90 days)', resolved, 'No resolved incidents yet.'),
  ];
}
