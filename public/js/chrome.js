// Header, footer and theme shared by the status and history pages.

import { byId, h } from './dom.js';
import { applyTheme, renderThemeSwitcher } from './theme.js';

function renderBrand({ title, header }) {
  const { logo, showTitle } = header;
  return h('a', { class: 'brand', href: logo?.href ?? '/' },
    logo && h('img', { class: 'logo', src: logo.src, alt: logo.alt, style: { height: `${logo.height}px` } }),
    // A hidden title stays in the page for screen readers.
    h('span', { class: showTitle ? 'brand-title' : 'sr-only' }, title),
  );
}

const pill = (label, href, current = false) =>
  h('a', { class: 'pill', href, 'aria-current': current ? 'page' : null }, label);

/**
 * @param features { history, login } from /api/status: which built-in buttons to show
 * @param current  'status' | 'history', to highlight the page you're on
 */
function renderHeader(page, features, current) {
  const { links, button } = page.header;
  const actions = [
    features.history && pill('History', '/history', current === 'history'),
    button && pill(button.label, button.href),
    features.login && pill('Log in', '/admin'),
  ].filter(Boolean);

  return [
    renderBrand(page),
    links.length > 0 && h('nav', { class: 'nav' }, links.map((l) => pill(l.label, l.href))),
    actions.length > 0 && h('nav', { class: 'actions', 'aria-label': 'Site' }, actions),
  ].filter(Boolean);
}

function renderFooter(page, features) {
  const { footer } = page;
  // The RSS feed lists incident updates, so it's offered only when incidents are set up.
  const links = features?.history ? [...footer.links, { label: 'RSS', href: '/feed.xml' }] : footer.links;
  return [
    footer.text && h('p', { class: 'footer-text' }, footer.text),
    links.length > 0 && h('nav', { class: 'footer-links' },
      links.map((l) => h('a', { class: 'footer-link', href: l.href }, l.label)),
    ),
    footer.poweredBy && h('p', { class: 'powered-by' },
      'Powered by ', h('a', { href: 'https://hetrixtools.com', rel: 'noopener' }, 'HetrixTools'),
    ),
    renderThemeSwitcher(page),
  ].filter(Boolean);
}

/** Fill #site-header and #site-footer and apply the theme. */
export function renderChrome({ page, features }, { current }) {
  applyTheme(page);
  byId('site-header').replaceChildren(...renderHeader(page, features, current));
  byId('site-footer').replaceChildren(...renderFooter(page, features));
}
