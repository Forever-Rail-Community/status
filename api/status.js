// GET /api/status: page settings and current status of every component.
import { createHandler } from '../lib/handler.js';
import { loadStatus } from '../lib/page.js';

// CDN-cached for 60s, so HetrixTools sees about one request a minute however busy the page is.
export const GET = createHandler(loadStatus, {
  cacheControl: 'public, s-maxage=60, stale-while-revalidate=300',
});
