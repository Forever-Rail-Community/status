// GET /api/auth/callback: Discord redirects here after sign-in.
import { callback } from '../../lib/auth/routes.js';

export const GET = (request) => callback(request);
