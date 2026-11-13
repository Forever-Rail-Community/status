// GET /api/status: page settings, live component status and incidents.
import { createHandler } from '../lib/handler.js';
import { loadStatus } from '../lib/page.js';
import { route } from '../lib/route.js';

// CDN-cached for 60s, so HetrixTools sees about one request a minute however busy the page is.
export default route({
  GET: createHandler(loadStatus, { cacheControl: 'public, s-maxage=60, stale-while-revalidate=300' }),
});
