// /api/admin/pauses: GET which routes are paused, POST { component } to pause, DELETE ?component= to resume.
import { adminRoutes } from '../../lib/admin.js';
import { pauseHandlers } from '../../lib/admin-pauses.js';
import { route } from '../../lib/route.js';

export default route(adminRoutes(pauseHandlers));
