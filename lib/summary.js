// /api/summary: a small public status summary for other sites, e.g. the operations
// dashboard's status widget. Readable from any origin (it's the same public data as the page).

import { loadStatus } from './page.js';

const slim = (c) => ({
  id: c.id,
  name: c.name,
  status: c.status,
  ...(c.pausable ? { pausable: true } : {}),
  components: c.components.map(slim),
});

/** The overall status plus each group's components (routes nested under their component). */
export function summarize(status, siteUrl) {
  return {
    title: status.page.title,
    url: siteUrl,
    overall: status.overall,
    generatedAt: status.generatedAt,
    groups: status.groups.map((g) => ({ name: g.name, status: g.status, components: g.components.map(slim) })),
  };
}

export async function loadSummary(ctx) {
  const siteUrl = ctx.config.site.url ?? new URL(ctx.request.url).origin;
  return summarize(await loadStatus(ctx), siteUrl);
}

export const respondJsonCors = (body, headers) =>
  Response.json(body, { headers: { ...headers, 'Access-Control-Allow-Origin': '*' } });
