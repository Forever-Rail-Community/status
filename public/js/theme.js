// Theme: the `theme`/`accent` options from status.config.js, plus each visitor's own
// Light/Dark/Auto choice from the footer switcher, which wins when set.

import { h } from './dom.js';

export const THEMES = ['light', 'dark', 'auto'];
const LABELS = { light: 'Light', dark: 'Dark', auto: 'Auto' };
const STORAGE_KEY = 'status-theme'; // also read by theme-early.js

// Storage can be unavailable (privacy modes, embedded views); the choice then lasts for the visit.
function storedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore: see storedTheme()
  }
}

// Same rule as theme-early.js.
const colorSchemeFor = (theme) => (theme === 'auto' ? 'light dark' : theme);

// Dark text on light accents, white text on dark ones (WCAG relative luminance).
function textColorOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#141414' : '#ffffff';
}

/** The theme in effect: the visitor's choice, else the configured default. */
export const activeTheme = (page) => storedTheme() ?? page.theme;

export function applyTheme(page) {
  const root = document.documentElement.style;
  root.colorScheme = colorSchemeFor(activeTheme(page));
  if (page.accent) {
    root.setProperty('--accent', page.accent);
    root.setProperty('--on-accent', textColorOn(page.accent));
  }
}

/** Light / Dark / Auto buttons for the footer. */
export function renderThemeSwitcher(page) {
  const buttons = THEMES.map((theme) =>
    h('button', { type: 'button', class: 'theme-option', dataset: { theme } }, LABELS[theme]),
  );

  const markActive = () => {
    const current = activeTheme(page);
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.theme === current));
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      storeTheme(button.dataset.theme);
      applyTheme(page);
      markActive();
    });
  }

  markActive();
  return h('div', { class: 'theme-switcher', role: 'group', 'aria-label': 'Colour theme' }, buttons);
}
