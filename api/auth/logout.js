// POST /api/auth/logout
import { logout } from '../../lib/auth/routes.js';

export const POST = (request) => logout(request);
