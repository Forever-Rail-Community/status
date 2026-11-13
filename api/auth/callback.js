// GET /api/auth/callback: Discord redirects here after sign-in.
import { callback } from '../../lib/auth/routes.js';
import { route } from '../../lib/route.js';

export default route({ GET: (request) => callback(request) });
