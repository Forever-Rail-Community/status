// One shared tooltip for everything inside `root` that carries tooltip data:
//   data-tip="text"                                         plain tooltip
//   data-tip-title / -state / -detail / -body               tinted header + body (strips)
//   data-tip-items="a\nb"                                   incident titles listed under the body

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
  ];
}

export function attachTooltip(root) {
  const tip = h('div', { class: 'tooltip', role: 'tooltip' });
  tip.hidden = true;
  document.body.append(tip);

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
}
