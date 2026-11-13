// GET/POST /api/admin/incidents, PATCH/DELETE /api/admin/incidents?id=…
import { adminRoutes } from '../../lib/admin.js';
import { incidentHandlers } from '../../lib/admin-incidents.js';

export const { GET, POST, PATCH, DELETE } = adminRoutes(incidentHandlers);
