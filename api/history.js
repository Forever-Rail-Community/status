// GET /api/history: daily uptime bars. Daily data changes slowly, so cache for an hour.
import { createHandler } from '../lib/handler.js';
import { loadHistory } from '../lib/history.js';

export const GET = createHandler(loadHistory, {
  cacheControl: 'public, s-maxage=3600, stale-while-revalidate=86400',
});
