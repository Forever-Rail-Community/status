// GET /api/admin/session
import { adminRoutes } from '../../lib/admin.js';
import { sessionHandlers } from '../../lib/admin-incidents.js';

export const { GET } = adminRoutes(sessionHandlers);
