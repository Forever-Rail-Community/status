// GET /api/admin/session
import { adminRoutes } from '../../lib/admin.js';
import { sessionHandlers } from '../../lib/admin-incidents.js';
import { route } from '../../lib/route.js';

export default route(adminRoutes(sessionHandlers));
