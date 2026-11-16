// One shared tooltip for everything inside `root` that carries tooltip data:
//   data-tip="text"                                         plain tooltip
//   data-tip-title / -state / -detail / -body               tinted header + body (strips)
//   data-tip-items="a\nb"                                   incident titles listed under the body
// Strips with tabindex can also be read from the keyboard: arrow keys (and Home/End)
// step through their segments, showing the tooltip and announcing it to screen readers.

import { h } from './dom.js';

const GAP = 8;
const SELECTOR = '[data-tip], [data-tip-title]';

function content({ tip, tipTitle, tipState, tipDetail, tipBody, tipItems }) {
  if (!tipTitle) return [h('div', { class: 'tip-body' }, tip)];
  return [
    h('div', { class: 'tip-head', dataset: { state: tipState } },
      h('div', { class: 'tip-title' }, tipTitle),
      tipDetail && h('div', { class: 'tip-detail' }, tipDetail),
    ),
    tipBody && h('div', { class: 'tip-body' }, tipBody),
    tipItems && h('div', { class: 'tip-items' },
      h('div', { class: 'tip-items-label' }, 'Incidents'),
      tipItems.split('\n').map((item) => h('div', { class: 'tip-item' }, item)),
    ),
  ].filter(Boolean); // replaceChildren() would print a missing section as "undefined"
}

/** The tooltip as one sentence, for the screen reader announcement. */
const describe = ({ tipTitle, tipDetail, tipBody, tipItems }) =>
  [tipBody, tipTitle, tipDetail, tipItems && `Incidents: ${tipItems.split('\n').join(', ')}`]
    .filter(Boolean)
    .join('. ');

const STEPS = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };

export function attachTooltip(root) {
  const tip = h('div', { class: 'tooltip', role: 'tooltip' });
  tip.hidden = true;
  const announcer = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
  document.body.append(tip, announcer);

  const show = (target) => {
    tip.replaceChildren(...content(target.dataset));
    tip.hidden = false;

    const anchor = target.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    const centered = anchor.left + anchor.width / 2 - box.width / 2;
    const left = Math.min(Math.max(GAP, centered), window.innerWidth - box.width - GAP);

    tip.style.left = `${left + window.scrollX}px`;
    tip.style.top = `${anchor.bottom + window.scrollY + GAP}px`;
  };

  const hide = () => {
    tip.hidden = true;
  };

  root.addEventListener('pointerover', (event) => {
    const target = event.target.closest(SELECTOR);
    if (target) show(target);
    else hide();
  });
  root.addEventListener('pointerleave', hide);
  window.addEventListener('scroll', hide, { passive: true });

  // ---------- keyboard ----------

  const activeSegment = (strip) => strip.querySelector('.seg-active');

  const select = (strip, segment) => {
    activeSegment(strip)?.classList.remove('seg-active');
    segment.classList.add('seg-active');
    show(segment);
    announcer.textContent = describe(segment.dataset);
  };

  // Focusing a strip starts on today, the right-hand end.
  root.addEventListener('focusin', (event) => {
    const strip = event.target.closest('.strip[tabindex]');
    if (strip?.lastElementChild) select(strip, activeSegment(strip) ?? strip.lastElementChild);
  });

  root.addEventListener('focusout', (event) => {
    const strip = event.target.closest('.strip[tabindex]');
    if (!strip) return;
    activeSegment(strip)?.classList.remove('seg-active');
    hide();
  });

  root.addEventListener('keydown', (event) => {
    const strip = event.target.closest('.strip[tabindex]');
    if (!strip) return;
    if (event.key === 'Escape') {
      hide();
      return;
    }
    if (!(event.key in STEPS)) return;
    event.preventDefault();
    const segments = [...strip.children];
    const current = segments.indexOf(activeSegment(strip));
    const next = Math.min(Math.max(current + STEPS[event.key], 0), segments.length - 1);
    select(strip, segments[next]);
  });
}
