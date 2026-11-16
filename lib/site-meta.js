// <head> tags written into each page at build time (see scripts/build.js):
// page title, link previews (Open Graph), favicon and the RSS feed link.
// Link-preview bots don't run JavaScript, so these must be in the HTML itself.

/** Pages that get tags, by file in public/. `path` is the page's URL path. */
export const PAGES = {
  'index.html': { path: '/', title: (site) => site },
  'history/index.html': { path: '/history', title: (site) => `History · ${site}` },
  'incident/index.html': { path: null, title: (site) => `Incident · ${site}` }, // retitled by its script
  '404.html': { path: null, title: (site) => `Page not found · ${site}` },
  'admin/index.html': { path: null, title: (site) => `Admin · ${site}`, private: true },
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/** '/images/p.png' → 'https://status.example.com/images/p.png' (needs site.url); full URLs pass through. */
function absolute(url, siteUrl) {
  if (!url) return null;
  if (/^https:\/\//i.test(url)) return url;
  return siteUrl ? `${siteUrl}${url}` : null;
}

const meta = (attr, key, content) => `<meta ${attr}="${key}" content="${escapeHtml(content)}">`;

/** The tags for one page, as an HTML string. */
export function headTags(config, page) {
  const { site } = config;
  const title = page.title(config.title);
  const tags = [];

  if (site.favicon) tags.push(`<link rel="icon" href="${escapeHtml(site.favicon)}">`);
  if (!page.private) {
    const description = site.description ?? config.notice;
    const image = absolute(site.image, site.url);
    const url = page.path && site.url ? `${site.url}${page.path === '/' ? '' : page.path}` : null;

    if (description) tags.push(meta('name', 'description', description));
    tags.push(meta('property', 'og:type', 'website'));
    tags.push(meta('property', 'og:site_name', config.title));
    tags.push(meta('property', 'og:title', title));
    if (description) tags.push(meta('property', 'og:description', description));
    if (url) tags.push(meta('property', 'og:url', url));
    if (image) tags.push(meta('property', 'og:image', image));
    tags.push(meta('name', 'twitter:card', image ? 'summary_large_image' : 'summary'));
    tags.push(`<link rel="alternate" type="application/rss+xml" title="${escapeHtml(`${config.title} incidents`)}" href="/feed.xml">`);
  }

  return { title, tags: tags.join('\n  ') };
}

/** Fill a page's <title> and its <!-- build:head --> marker. */
export function applyHead(html, config, page) {
  if (!html.includes('<!-- build:head -->')) throw new Error('page is missing the <!-- build:head --> marker');
  const { title, tags } = headTags(config, page);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace('<!-- build:head -->', tags);
}
