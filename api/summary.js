// GET /api/summary: overall status + components, for the operations dashboard widget.
// Same caching as /api/status; any site may read it (CORS *).
import { createHandler } from '../lib/handler.js';
import { route } from '../lib/route.js';
import { loadSummary, respondJsonCors } from '../lib/summary.js';

// Cached like /api/status (60s), so the widget adds at most about one HetrixTools request a minute.
export default route({
  GET: createHandler(loadSummary, {
    cacheControl: 'public, s-maxage=60, stale-while-revalidate=300',
    respond: respondJsonCors,
  }),
});
