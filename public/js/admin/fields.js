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

export const titleInput = (value = '') =>
  field('Title', h('input', { name: 'title', required: true, maxlength: 200, value, placeholder: 'e.g. SE route server unreachable' }));

export const messageInput = (placeholder) =>
  field('Message', h('textarea', { name: 'message', required: true, maxlength: 5000, rows: 3, placeholder }));

/** Checkboxes for every component, grouped like the status page. */
export function componentPicker(groups, selected = []) {
  const chosen = new Set(selected);
  return h('fieldset', { class: 'field components-picker' },
    h('legend', { class: 'field-label' }, 'Affected components'),
    groups.map((group) =>
      h('div', { class: 'picker-group' },
        h('span', { class: 'picker-group-name' }, group.name),
        group.components.map((c) =>
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', name: 'components', value: c.id, checked: chosen.has(c.id) }),
            c.name,
          ),
        ),
      ),
    ),
    h('span', { class: 'field-hint' }, 'None selected = affects the whole page.'),
  );
}

/** Form values as a plain object; checkbox groups become arrays. */
export function formValues(form) {
  const data = new FormData(form);
  const values = Object.fromEntries(data);
  if (form.querySelector('[name="components"]')) values.components = data.getAll('components');
  return values;
}
