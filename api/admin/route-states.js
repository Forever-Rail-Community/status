// /api/admin/route-states: GET current route states, PUT { component, state } to change one.
import { adminRoutes } from '../../lib/admin.js';
import { routeStateHandlers } from '../../lib/admin-route-states.js';
import { route } from '../../lib/route.js';

export default route(adminRoutes(routeStateHandlers));
