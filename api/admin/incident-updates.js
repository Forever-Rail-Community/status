// POST /api/admin/incident-updates?id=…: post a timeline update (and change status).
import { adminRoutes } from '../../lib/admin.js';
import { updateHandlers } from '../../lib/admin-incidents.js';
import { route } from '../../lib/route.js';

export default route(adminRoutes(updateHandlers));
