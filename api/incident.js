// GET /api/incident?id=…: one incident and its full timeline, for /incidents/:id.
import { createHandler } from '../lib/handler.js';
import { loadIncidentPage } from '../lib/incident-page.js';
import { route } from '../lib/route.js';

export default route({
  GET: createHandler(loadIncidentPage, {
    cacheControl: 'public, s-maxage=30, stale-while-revalidate=300',
    requiresApiKey: false,
  }),
});
