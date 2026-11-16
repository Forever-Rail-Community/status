// GET /api/feed (served as /feed.xml): RSS feed of incident updates.
import { loadFeed, respondXml } from '../lib/feed.js';
import { createHandler } from '../lib/handler.js';
import { route } from '../lib/route.js';

export default route({
  GET: createHandler(loadFeed, {
    cacheControl: 'public, s-maxage=60, stale-while-revalidate=300',
    requiresApiKey: false,
    respond: respondXml,
  }),
});
