// Admin API for route states (wired up in api/admin/route-states.js).

import { routeComponents } from './config.js';
import { json } from './admin.js';
import { currentRouteStates, setRouteState } from './route-states.js';

/** /api/admin/route-states */
export const routeStateHandlers = {
  /** id → { state, since } for routes that aren't Up. */
  GET: async ({ db }) => json({ states: await currentRouteStates(db) }),

  /** { component, state: 'up' | 'down' | 'paused' } */
  PUT: async ({ db, config, body, user }) => {
    const routeIds = new Set(routeComponents(config).map((c) => c.id));
    await setRouteState(db, { component: body.component, state: body.state, author: user.name }, routeIds);
    return json({ states: await currentRouteStates(db) });
  },
};
