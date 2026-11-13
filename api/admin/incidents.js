// GET/POST /api/admin/incidents, PATCH/DELETE /api/admin/incidents?id=…
import { adminRoutes } from '../../lib/admin.js';
import { incidentHandlers } from '../../lib/admin-incidents.js';
import { route } from '../../lib/route.js';

export default route(adminRoutes(incidentHandlers));
