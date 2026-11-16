// RSS 2.0 feed of incident updates (/feed.xml → /api/feed), one item per update,
// so feed readers and Discord RSS bots pick up every post, not just new incidents.

import { listIncidents } from './incidents.js';
import { IMPACT_LABELS, INCIDENT_STATUS_LABELS } from '../public/js/labels.js';

const MAX_ITEMS = 50;

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const rssDate = (iso) => new Date(iso).toUTCString();

function tag(name, value, attrs = '') {
  return value == null || value === '' ? '' : `<${name}${attrs}>${escapeXml(value)}</${name}>`;
}

/** Newest updates first, each carrying its incident. */
function feedItems(incidents) {
  return incidents
    .flatMap((incident) => incident.updates.map((update) => ({ incident, update })))
    .sort((a, b) => b.update.createdAt.localeCompare(a.update.createdAt))
    .slice(0, MAX_ITEMS);
}

function renderItem({ incident, update }, siteUrl) {
  const link = `${siteUrl}/incidents/${incident.id}`;
  const status = INCIDENT_STATUS_LABELS[update.status] ?? update.status;
  return [
    '<item>',
    tag('title', `${status}: ${incident.title}`),
    tag('link', link),
    tag('guid', `${link}#update-${update.id}`, ' isPermaLink="false"'),
    tag('pubDate', rssDate(update.createdAt)),
    tag('category', IMPACT_LABELS[incident.impact]),
    tag('description', update.message || status),
    '</item>',
  ].join('');
}

/** The feed XML. `siteUrl` makes links absolute (config site.url, else the request's origin). */
export function renderFeed({ title, description, siteUrl, incidents }) {
  const items = feedItems(incidents);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    tag('title', `${title} incidents`),
    tag('link', siteUrl),
    tag('description', description || `Incident updates from ${title}`),
    `<atom:link href="${escapeXml(`${siteUrl}/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    items.length > 0 ? tag('lastBuildDate', rssDate(items[0].update.createdAt)) : '',
    ...items.map((item) => renderItem(item, siteUrl)),
    '</channel>',
    '</rss>',
  ].join('\n');
}

export async function loadFeed({ config, db, request }) {
  return renderFeed({
    title: config.title,
    description: config.site.description ?? config.notice,
    siteUrl: config.site.url ?? new URL(request.url).origin,
    incidents: db ? await listIncidents(db, { days: config.historyDays }) : [],
  });
}

export const respondXml = (xml, headers) =>
  new Response(xml, { headers: { ...headers, 'Content-Type': 'application/rss+xml; charset=utf-8' } });
