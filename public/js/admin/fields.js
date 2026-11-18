// Form controls shared by the "new incident", "edit" and "post update" forms.

import { h } from '../dom.js';
import { IMPACT_LABELS, INCIDENT_STATUS_LABELS } from '../format.js';

export const field = (label, control, hint) =>
  h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint && h('span', { class: 'field-hint' }, hint),
  );

function select(name, values, labels, selected) {
  return h('select', { name, required: true },
    values.map((v) => h('option', { value: v, selected: v === selected }, labels[v] ?? v)),
  );
}

export const impactSelect = (impacts, selected = 'major_outage') =>
  field('Impact', select('impact', impacts, IMPACT_LABELS, selected));

export const statusSelect = (statuses, selected = 'investigating') =>
  field('Status', select('status', statuses, INCIDENT_STATUS_LABELS, selected));

export const titleInput = (value = '', placeholder = 'e.g. SE route server unreachable') =>
  field('Title', h('input', { name: 'title', required: true, maxlength: 200, value, placeholder }));

/** ISO time → the value a datetime-local input shows (the browser's local time). */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Start and end of a maintenance window, entered in the browser's time zone. */
export const windowInputs = (window = null) =>
  h('div', { class: 'field' },
    h('div', { class: 'field-row' },
      field('Starts', h('input', { type: 'datetime-local', name: 'startsAt', required: true, value: toLocalInput(window?.startsAt) })),
      field('Ends', h('input', { type: 'datetime-local', name: 'endsAt', required: true, value: toLocalInput(window?.endsAt) })),
    ),
    h('span', { class: 'field-hint' }, `Your time zone: ${LOCAL_ZONE}`),
  );

export const messageInput = (placeholder) =>
  field('Message', h('textarea', { name: 'message', required: true, maxlength: 5000, rows: 3, placeholder }));

const componentCheckbox = (c, chosen) =>
  h('label', { class: 'check' },
    h('input', { type: 'checkbox', name: 'components', value: c.id, checked: chosen.has(c.id) }),
    c.name,
  );

/** A component, with its sub-components (routes) indented underneath when it has any. */
const pickerItem = (c, chosen) =>
  c.components.length === 0
    ? componentCheckbox(c, chosen)
    : h('div', { class: 'picker-family' },
      componentCheckbox(c, chosen),
      h('div', { class: 'picker-kids' }, c.components.map((k) => componentCheckbox(k, chosen))),
    );

/** Checkboxes for every component, grouped like the status page. */
export function componentPicker(groups, selected = []) {
  const chosen = new Set(selected);
  return h('fieldset', { class: 'field components-picker' },
    h('legend', { class: 'field-label' }, 'Affected components'),
    groups.map((group) =>
      h('div', { class: 'picker-group' },
        h('span', { class: 'picker-group-name' }, group.name),
        group.components.map((c) => pickerItem(c, chosen)),
      ),
    ),
    h('span', { class: 'field-hint' }, 'None selected = affects the whole page.'),
  );
}

/** "Announce in Discord", ticked by default. Nothing is rendered when no webhook is configured. */
export const announceCheckbox = (discordEnabled) =>
  discordEnabled &&
  h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'announce', checked: true }), 'Announce in Discord');

/**
 * "Start from template" picker (from incidentTemplates in status.config.js). Choosing one
 * fills the form's title, impact, components and message; nothing is rendered without templates.
 */
export function templatePicker(templates) {
  if (templates.length === 0) return null;
  const picker = h('select', { 'aria-label': 'Start from template' },
    h('option', { value: '' }, 'Blank incident'),
    templates.map((t, i) => h('option', { value: String(i) }, t.name)),
  );
  picker.addEventListener('change', () => {
    const template = templates[Number(picker.value)];
    if (template) applyTemplate(picker.form, template);
  });
  return field('Start from template', picker, 'Fills in the form below; edit anything before posting.');
}

function applyTemplate(form, template) {
  const chosen = new Set(template.components);
  form.elements.title.value = template.title;
  form.elements.impact.value = template.impact;
  form.elements.message.value = template.message;
  for (const box of form.querySelectorAll('[name="components"]')) box.checked = chosen.has(box.value);
}

/**
 * Form values as a plain object; checkbox groups become arrays, the announce box a boolean,
 * and date-time inputs exact ISO times.
 */
export function formValues(form) {
  const data = new FormData(form);
  const values = Object.fromEntries(data);
  for (const input of form.querySelectorAll('input[type="datetime-local"]')) {
    if (input.value) values[input.name] = new Date(input.value).toISOString();
  }
  if (form.querySelector('[name="components"]')) values.components = data.getAll('components');
  if (form.querySelector('[name="announce"]')) values.announce = data.has('announce');
  return values;
}
