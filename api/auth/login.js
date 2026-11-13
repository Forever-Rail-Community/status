// GET /api/auth/login: start Discord sign-in.
import { login } from '../../lib/auth/routes.js';

export const GET = (request) => login(request);
