// /api/summary: a small public status summary for other sites, e.g. the operations
// dashboard's status widget. Readable from any origin (it's the same public data as the page).

import { loadStatus } from './page.js';

const slim = (c) => ({
  id: c.id,
  name: c.name,
  status: c.status,
  ...(c.route ? { route: true } : {}),
  components: c.components.map(slim),
});

// An open incident, without its timeline: enough for another site to show a notice that links here.
const brief = (incident, siteUrl) => ({
  id: incident.id,
  title: incident.title,
  impact: incident.impact,
  status: incident.status, // "scheduled" is planned maintenance that hasn't started
  url: `${siteUrl}/incidents/${incident.id}`,
  startedAt: incident.createdAt,
  updatedAt: incident.updates[0]?.createdAt ?? incident.createdAt, // updates are newest first
});

/**
 * The overall status, each group's components (routes nested under their component), and open
 * incidents (live ones first). `incidents` is null when incidents aren't set up or couldn't load.
 */
export function summarize(status, siteUrl) {
  return {
    title: status.page.title,
    url: siteUrl,
    overall: status.overall,
    generatedAt: status.generatedAt,
    groups: status.groups.map((g) => ({ name: g.name, status: g.status, components: g.components.map(slim) })),
    incidents: status.incidents ? status.incidents.active.map((i) => brief(i, siteUrl)) : null,
  };
}

export async function loadSummary(ctx) {
  const siteUrl = ctx.config.site.url ?? new URL(ctx.request.url).origin;
  return summarize(await loadStatus(ctx), siteUrl);
}

export const respondJsonCors = (body, headers) =>
  Response.json(body, { headers: { ...headers, 'Access-Control-Allow-Origin': '*' } });
