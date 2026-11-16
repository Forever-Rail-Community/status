// Rows or grid. Each group's default comes from status.config.js (`layout`); a visitor
// who picks one with the switch gets it for every group, remembered in their browser.

import { h } from './dom.js';
import { readChoice, storeChoice } from './storage.js';

const LAYOUTS = ['rows', 'grid'];
const LABELS = { rows: 'Rows', grid: 'Grid' };
const STORAGE_KEY = 'status-layout';

/** The visitor's choice, or null to follow each group's default. */
export const chosenLayout = () => readChoice(STORAGE_KEY, LAYOUTS);

/** Rows / Grid buttons. Neither is pressed until the visitor picks one. */
export function renderLayoutSwitcher(onChange) {
  const buttons = LAYOUTS.map((layout) =>
    h('button', { type: 'button', class: 'switcher-option', dataset: { layout } }, LABELS[layout]),
  );
  const markActive = () => {
    const current = chosenLayout();
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.layout === current));
  };
  for (const button of buttons) {
    button.addEventListener('click', () => {
      storeChoice(STORAGE_KEY, button.dataset.layout);
      markActive();
      onChange();
    });
  }
  markActive();
  return h('div', { class: 'switcher layout-switcher', role: 'group', 'aria-label': 'Layout' }, buttons);
}
