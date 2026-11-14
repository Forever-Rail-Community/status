// Status icons from Lucide (https://lucide.dev), v1.72.0 (ISC licence; Copyright (c) Lucide Contributors).
// Only the inner shapes are kept; every icon shares Lucide's 24×24 outline settings below.
// These strings are constants in this file, never user input, so building them with innerHTML is safe.

const SHAPES = {
  'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
  'triangle-alert':
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'circle-alert':
    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  'circle-x': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  wrench:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>',
  'circle-help': '<circle cx="12" cy="12" r="10"/><path d="M9 9.5a3 2.5 0 016 0c0 2-2 2-3 3.5"/><path d="M12 17h.01"/>',
  'loader-circle': '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
};

/** Which icon each status gets. */
const ICON_FOR_STATE = {
  operational: 'circle-check',
  degraded: 'triangle-alert',
  partial_outage: 'circle-alert',
  major_outage: 'circle-x',
  maintenance: 'wrench',
  unknown: 'circle-help',
  loading: 'loader-circle',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Decorative status icon; colour comes from the surrounding text (currentColor). */
export function statusIcon(state) {
  const name = ICON_FOR_STATE[state] ?? ICON_FOR_STATE.unknown;
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [attr, value] of Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    class: `status-icon status-icon-${name}`,
  })) {
    svg.setAttribute(attr, value);
  }
  svg.innerHTML = SHAPES[name];
  return svg;
}
