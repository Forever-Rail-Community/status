// POST /api/auth/logout
import { logout } from '../../lib/auth/routes.js';
import { route } from '../../lib/route.js';

export default route({ POST: (request) => logout(request) });
