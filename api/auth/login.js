// GET /api/auth/login: start Discord sign-in.
import { login } from '../../lib/auth/routes.js';
import { route } from '../../lib/route.js';

export default route({ GET: (request) => login(request) });
